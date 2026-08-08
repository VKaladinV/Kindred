/* uses: api rest · photoMark same */

/* ═══════════════════════ what you publish ═══════════════════════
   One row per account, replaced whole. There is one writer and no merge
   problem here — you own it, you overwrite it — so un-sharing an item is
   simply a payload that no longer contains it, with no tombstone needed.

   Deliberately outside TABLES and outside flatten/nest. The snapshot only
   ever holds the five synced tables, and that is the whole of how the
   snapshot-diff engine is kept from trying to push a shared row back: it has
   never heard of one. There is no flag to respect and nothing here for a
   future edit to planPush to get wrong. */

const publishedFields = r => ({
  id: r.id, type: r.type, date: r.date, endDate: r.endDate || '',
  kind: r.kind, title: r.title, note: r.note || '', repeatsYearly: !!r.repeatsYearly,
});

/* What leaves the device when you publish. Everything else about a person —
   medications, conditions, contact, cadence, check-ins, groups, and anything
   you did not mark shared — is not in here, whatever else changes about how
   this function is written; that is the private-by-default promise the
   feature rests on, kept by construction rather than by a filter someone
   could later forget to apply. */
function projectSelf(me, photoDataUrl) {
  return {
    v: 1,
    name: me.name,
    photo: photoDataUrl || '',
    birthday: me.birthday || '',
    summary: me.summary || '',
    seasons: me.events.filter(r => r.shared && r.type === 'season' && !r.endDate).map(publishedFields),
    upcoming: me.events.filter(r => r.shared && r.type === 'upcoming').map(publishedFields),
    history: me.events.filter(r => r.shared && (r.type === 'history' || (r.type === 'season' && r.endDate))).map(publishedFields),
    prayers: me.prayers.filter(pr => pr.shared && !pr.answeredAt && !pr.releasedAt)
      .map(pr => ({ id: pr.id, text: pr.text, createdAt: pr.createdAt })),
  };
}

/* Run back through the same downscale a new photo gets, to a size meant for
   a small circle rather than a full crop — a published face costs 5–8KB
   this way instead of the 30–60KB the local one is. Kept inside the payload
   itself rather than in storage, which avoids touching the photo bucket's
   policies at all and keeps sync()'s own photo reconciliation, which only
   ever looks at <uid>/, from needing to learn about a second convention. */
async function projectPhoto(me) {
  const src = Kindred.photos[me.id];
  if (!src) return '';
  try {
    const img = await Kindred.loadImage(src);
    return Kindred.downscale(img, 160, 0.7);
  } catch { return ''; }   // a photo that will not load is not worth failing a sync over
}

async function publishMine(uid) {
  const me = Kindred.self;

  if (!me) {
    /* No profile now, but something was published before it was removed.
       Left alone, whoever you linked with would go on seeing a person who
       no longer exists here — so taking the profile down travels with
       taking it down locally, not as a separate step to remember. */
    if (localStorage.getItem('kindred:publishedMark')) {
      const r = await api(rest('profiles', `?user_id=eq.${uid}`), { method: 'DELETE' });
      if (r.ok) localStorage.removeItem('kindred:publishedMark');
    }
    return;
  }

  const payload = projectSelf(me, await projectPhoto(me));
  const body = JSON.stringify(payload);
  /* The same cheap content mark photos already use, run over the whole
     payload — sharing nothing new is the ordinary case on most syncs, and
     this is what keeps that case a single comparison rather than a request. */
  const mark = photoMark(body);
  if (mark === localStorage.getItem('kindred:publishedMark')) return;

  const r = await api(rest('profiles'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ user_id: uid, payload }]),
  });
  if (!r.ok) throw new Error('profiles: ' + (await r.text()).slice(0, 140));
  localStorage.setItem('kindred:publishedMark', mark);
}

async function pullShared(uid) {
  /* Read whole rather than incrementally, and it has to be: a link that
     ended leaves no row behind for an incremental pull to notice, so the
     live list is the only thing that can say a partner is no longer one.
     It is at most a handful of rows — nothing about reading it needs to be
     cheap the way five tables of records do. */
  const lr = await api(rest('links', '?select=a,b'));
  if (!lr.ok) throw new Error('links: ' + (await lr.text()).slice(0, 140));
  const partners = new Set((await lr.json()).map(row => (row.a === uid ? row.b : row.a)));

  const since = localStorage.getItem('kindred:sharedAt') || '1970-01-01T00:00:00Z';
  const pr = await api(rest('profiles', `?select=user_id,payload,updated_at&updated_at=gt.${encodeURIComponent(since)}`));
  if (!pr.ok) throw new Error('profiles: ' + (await pr.text()).slice(0, 140));

  const cached = (await Kindred.Store.loadShared()) || {};
  const next = { ...cached };
  let mark = since;
  for (const row of await pr.json()) {
    if (row.updated_at > mark) mark = row.updated_at;
    if (row.user_id === uid) continue;      // your own row comes back too
    next[row.user_id] = { ...row.payload, at: row.updated_at };
  }
  /* Ended links stop being read here rather than being told to leave —
     nobody sends a tombstone for a friendship, the row for it just stops
     coming back, so the cache is pruned against who is still a partner. */
  for (const k of Object.keys(next)) if (!partners.has(k)) delete next[k];

  /* Whether the sheet has anything new to show. Plain same() is enough here,
     unlike the roster's maps: `next` is a copy of the cache, so a key keeps
     the position it was written in, reassigning one does not move it, and
     deleting one does not disturb the rest. */
  const moved = !same(cached, next);
  Kindred.shared = next;
  await Kindred.Store.saveShared(next);
  // the same small rewind the main watermark uses, and for the same reason
  localStorage.setItem('kindred:sharedAt',
    new Date(Date.parse(mark) - 2000).toISOString());
  return moved;
}

