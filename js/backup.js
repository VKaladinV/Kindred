/* uses: MAX_TOUCHES ROAD_ID STAGES · el today
   · addToRoster churchEvents communities futures groups me notifyMutate people roster saveRoster
   · hasPhoto photosForBackup putPhotoDataUrl
   · normalise normaliseAttendance normaliseChurchEvent normaliseCommunity
     normaliseDiscipleship normaliseGroup normaliseGroups · toast · renderAll
   · foldRoadMembers
*/

async function exportAll() {
  const payload = {
    app: 'kindred',
    version: 5,
    exportedAt: new Date().toISOString(),
    people: roster(),          // your own profile is part of what you are backing up
    groups,
    /* The communities you oversee and the church's events. Who came to what
       is not here separately — it is on each person, in `people` above. */
    communities,
    churchEvents,
    /* Base64 again on the way out, and deliberately: a backup is a JSON file
       that has to survive being copied about and read back by any version of
       this app, so the format is unchanged from when photos were stored that
       way. Turning the bytes back into text is a cost paid once, on purpose,
       by somebody who asked for a file. */
    photos: await photosForBackup(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kindred-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Backup downloaded');
}

async function importAll(file) {
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { return toast('That file could not be read'); }
  if (!data || !Array.isArray(data.people)) return toast('That is not a Fellowship backup');

  let added = 0, merged = 0;
  /* Which id each person in the file ended up under here. A merge keeps the id
     the existing record already had, so a group's members — which are ids —
     would otherwise point at people who, on this device, are called something
     else. Built while the answer is in hand rather than worked out again after. */
  const landedAs = new Map();
  /* Who came to what, held back until the communities and events below have
     landed. A tick names a community or an event by id, and one in the file
     may merge onto one already here under another id — so the ticks can only
     be put down once it is known what each of those ids became. */
  const owed = [];

  for (const raw of data.people) {
    const incoming = normalise(raw);
    const attended = incoming.attendance;
    incoming.attendance = [];
    /* A backup carries your own profile too, and it has to land on yours
       rather than be matched by name against the circle — otherwise restoring
       your own backup puts you in your own circle as a stranger who happens
       to share your name. Matched on being the self, not on the name. */
    const existing = incoming.isSelf
      ? me
      /* A future connection and a circle member never merge into each other
         even if they happen to share a name — the category is part of who
         they are matched against, not just a flag carried along afterwards. */
      : [...people, ...futures].find(p => !p.isSelf
          && p.isFuture === incoming.isFuture
          && p.name.toLowerCase() === incoming.name.toLowerCase());
    if (existing) {
      existing.summary = existing.summary || incoming.summary;
      existing.relationship = existing.relationship || incoming.relationship;
      existing.birthday = existing.birthday || incoming.birthday;
      existing.contact = existing.contact || incoming.contact;
      existing.cadenceDays = existing.cadenceDays || incoming.cadenceDays;
      existing.groups = normaliseGroups({ groups: [...existing.groups, ...incoming.groups] });
      const evIds = new Set(existing.events.map(x => x.id));
      incoming.events.forEach(x => { if (!evIds.has(x.id)) existing.events.push(x); });
      const prIds = new Set(existing.prayers.map(x => x.id));
      incoming.prayers.forEach(x => { if (!prIds.has(x.id)) existing.prayers.push(x); });
      /* One check-in a day, so a day already here wins and the incoming one
         is dropped rather than added — deduping these by value the way a Set
         would means two objects for the same day, and the cap then quietly
         drops the oldest real ones off the far end. */
      const days = new Set(existing.touches.map(t => t.date));
      incoming.touches.forEach(t => { if (!days.has(t.date)) { days.add(t.date); existing.touches.push(t); } });
      existing.touches.sort((a, b) => a.date.localeCompare(b.date));
      existing.touches = existing.touches.slice(-MAX_TOUCHES);
      /* The road they are on, under the same rule as everything above: what is
         already here wins, and the file fills in the blanks. Children and
         topics are unioned by id the way events and prayers are; the marks are
         a map, so what is here is simply laid over what arrived. */
      existing.maritalStatus = existing.maritalStatus || incoming.maritalStatus;
      existing.marriedOn = existing.marriedOn || incoming.marriedOn;
      existing.divorcedOn = existing.divorcedOn || incoming.divorcedOn;
      existing.joinedChurchOn = existing.joinedChurchOn || incoming.joinedChurchOn;
      const kidIds = new Set(existing.kids.map(k => k.id));
      incoming.kids.forEach(k => { if (!kidIds.has(k.id)) existing.kids.push(k); });
      const topicIds = new Set(existing.discipleship.topics.map(t => t.id));
      existing.discipleship = normaliseDiscipleship({
        /* Being on the road at all is unioned rather than "here wins": it is
           a flag, not an answer that can go stale, and a file saying they are
           being walked with is never a reason to take that back off them. */
        active: existing.discipleship.active || incoming.discipleship.active,
        marks: { ...incoming.discipleship.marks, ...existing.discipleship.marks },
        topics: [...existing.discipleship.topics,
          ...incoming.discipleship.topics.filter(t => !topicIds.has(t.id))],
        /* Lit in either is lit. Left out, as it once was, these came back
           from normaliseDiscipleship all four false — restoring a backup
           quietly put out every word you had lit on anybody already here. */
        stages: Object.fromEntries(STAGES.map(([k]) =>
          [k, !!(existing.discipleship.stages[k] || incoming.discipleship.stages[k])])),
      });
      /* The small copy and the mark are worked out on the way in, so a photo
         out of a backup written by any version of this app arrives in the
         same shape as one just cropped. */
      if (data.photos?.[raw.id] && !hasPhoto(existing.id)) {
        await putPhotoDataUrl(existing.id, data.photos[raw.id]);
      }
      landedAs.set(raw.id, existing.id);
      owed.push([existing, attended]);
      merged++;
    } else {
      addToRoster(incoming);
      if (data.photos?.[raw.id]) await putPhotoDataUrl(incoming.id, data.photos[raw.id]);
      landedAs.set(raw.id, incoming.id);
      owed.push([incoming, attended]);
      added++;
    }
  }

  /* Groups by name, the way people are matched by name: two files describing
     the same life should fold together rather than stack up two of everything.
     Members are unioned — a restore adds back what was lost without taking away
     anybody you have put in since. */
  for (const raw of (Array.isArray(data.groups) ? data.groups : [])) {
    const g = normaliseGroup(raw);
    /* Ids as this device knows them. An id with no landing is somebody the file
       did not carry a person for; it is kept rather than dropped, on the same
       grounds normaliseGroup keeps unresolved members — absent is not gone. */
    const members = g.members.map(id => landedAs.get(id) || id);
    /* A file exported before discipleship became a flag on the person still
       carries it as the fixed-id group ROAD_ID once was — folded into that
       flag here, the same move migrateRoadGroup makes for a device that still
       has one on disk, rather than restored as a group a file this old would
       otherwise bring back under Groups. */
    if (g.id === ROAD_ID) { foldRoadMembers(members); continue; }
    /* By id before name, for every group that is not that one: an ordinary
       group's id has always come from uid(), so two different groups sharing
       a name only ever collide here on purpose. */
    const existing = groups.find(x => x.id === g.id)
      || groups.find(x => x.name.toLowerCase() === g.name.toLowerCase());
    if (existing) existing.members = [...new Set([...existing.members, ...members])];
    else groups.push({ ...g, members: [...new Set(members)] });
  }

  /* Communities by id, then by name, exactly as groups are above. Leaders and
     people are unioned rather than replaced, and so are the meetings marked
     as not held or held on another day: a restore adds back what was lost
     without taking away anything done since. When it starts meeting is the
     one thing that is not unioned — it is a single answer, and the one here
     wins unless there is none. */
  const communityAs = new Map();
  for (const raw of (Array.isArray(data.communities) ? data.communities : [])) {
    const c = normaliseCommunity(raw);
    const ids = list => list.map(id => landedAs.get(id) || id);
    const existing = communities.find(x => x.id === c.id)
      || communities.find(x => x.name.toLowerCase() === c.name.toLowerCase());
    if (existing) {
      Object.assign(existing, normaliseCommunity({
        ...existing,
        every: existing.from ? existing.every : c.every,
        from: existing.from || c.from,
        leaders: [...existing.leaders, ...ids(c.leaders)],
        members: [...existing.members, ...ids(c.members)],
        skipped: [...existing.skipped, ...c.skipped],
        extra: [...existing.extra, ...c.extra],
      }));
      communityAs.set(c.id, existing.id);
    } else {
      communities.push(normaliseCommunity({ ...c, leaders: ids(c.leaders), members: ids(c.members) }));
      communityAs.set(c.id, c.id);
    }
  }

  /* Events by id, then by the same title on the same day — two files that
     both wrote down last Sunday's service mean one service. */
  const eventAs = new Map();
  for (const raw of (Array.isArray(data.churchEvents) ? data.churchEvents : [])) {
    const e = normaliseChurchEvent(raw);
    const existing = churchEvents.find(x => x.id === e.id)
      || churchEvents.find(x => x.date === e.date && x.title.toLowerCase() === e.title.toLowerCase());
    if (existing) eventAs.set(e.id, existing.id);
    else { churchEvents.push(e); eventAs.set(e.id, e.id); }
  }

  /* And now the ticks, against whatever each community and event landed as. */
  for (const [p, attended] of owed) {
    if (!attended.length) continue;
    p.attendance = normaliseAttendance([...p.attendance, ...attended.map(a => ({
      ...a, of: (a.kind === 'meeting' ? communityAs : eventAs).get(a.of) || a.of,
    }))]);
  }

  await saveRoster();
  notifyMutate();
  renderAll();
  toast(`${added} added, ${merged} merged`);
}

/* ─────────────────────────── reminders ─────────────────────── */

