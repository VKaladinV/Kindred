/* uses: MAX_TOUCHES · el today
   · addToRoster futures groups me notifyMutate people roster saveRoster
   · hasPhoto photosForBackup putPhotoDataUrl
   · normalise normaliseDiscipleship normaliseGroup normaliseGroups · toast · renderAll
*/

async function exportAll() {
  const payload = {
    app: 'kindred',
    version: 4,
    exportedAt: new Date().toISOString(),
    people: roster(),          // your own profile is part of what you are backing up
    groups,
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

  for (const raw of data.people) {
    const incoming = normalise(raw);
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
        marks: { ...incoming.discipleship.marks, ...existing.discipleship.marks },
        topics: [...existing.discipleship.topics,
          ...incoming.discipleship.topics.filter(t => !topicIds.has(t.id))],
      });
      /* The small copy and the mark are worked out on the way in, so a photo
         out of a backup written by any version of this app arrives in the
         same shape as one just cropped. */
      if (data.photos?.[raw.id] && !hasPhoto(existing.id)) {
        await putPhotoDataUrl(existing.id, data.photos[raw.id]);
      }
      landedAs.set(raw.id, existing.id);
      merged++;
    } else {
      addToRoster(incoming);
      if (data.photos?.[raw.id]) await putPhotoDataUrl(incoming.id, data.photos[raw.id]);
      landedAs.set(raw.id, incoming.id);
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
    /* By id before name. Name alone was enough while every group's id came out
       of uid(), but the road group's id is a fixed literal — so a group renamed
       on this device and then restored from a file that still calls it the old
       thing would be pushed on as a second group wearing the same id, and
       groupById would only ever find one of them. */
    const existing = groups.find(x => x.id === g.id)
      || groups.find(x => x.name.toLowerCase() === g.name.toLowerCase());
    if (existing) existing.members = [...new Set([...existing.members, ...members])];
    else groups.push({ ...g, members: [...new Set(members)] });
  }

  await saveRoster();
  notifyMutate();
  renderAll();
  toast(`${added} added, ${merged} merged`);
}

/* ─────────────────────────── reminders ─────────────────────── */

