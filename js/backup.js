/* uses: MAX_TOUCHES · el today · Store
   · addToRoster futures me notifyMutate people photos roster saveRoster
   · normalise normaliseGroups · toast · renderAll
*/

async function exportAll() {
  const payload = {
    app: 'kindred',
    version: 3,
    exportedAt: new Date().toISOString(),
    people: roster(),          // your own profile is part of what you are backing up
    photos: await Store.loadPhotos(),
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
      for (const key of ['medications', 'conditions']) {
        const ids = new Set(existing[key].map(x => x.id));
        incoming[key].forEach(x => { if (!ids.has(x.id)) existing[key].push(x); });
      }
      /* One check-in a day, so a day already here wins and the incoming one
         is dropped rather than added — deduping these by value the way a Set
         would means two objects for the same day, and the cap then quietly
         drops the oldest real ones off the far end. */
      const days = new Set(existing.touches.map(t => t.date));
      incoming.touches.forEach(t => { if (!days.has(t.date)) { days.add(t.date); existing.touches.push(t); } });
      existing.touches.sort((a, b) => a.date.localeCompare(b.date));
      existing.touches = existing.touches.slice(-MAX_TOUCHES);
      if (data.photos?.[raw.id] && !photos[existing.id]) {
        photos[existing.id] = data.photos[raw.id];
        await Store.savePhoto(existing.id, data.photos[raw.id]);
      }
      merged++;
    } else {
      addToRoster(incoming);
      if (data.photos?.[raw.id]) {
        photos[incoming.id] = data.photos[raw.id];
        await Store.savePhoto(incoming.id, data.photos[raw.id]);
      }
      added++;
    }
  }
  await saveRoster();
  notifyMutate();
  renderAll();
  toast(`${added} added, ${merged} merged`);
}

/* ─────────────────────────── reminders ─────────────────────── */

