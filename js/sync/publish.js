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

  /* Everything but the face first, and the question asked before the face is
     fetched at all. Sharing nothing new is the ordinary case on most syncs,
     and this is what keeps that case a single string comparison.

     It used to be the other way round, which cost more than it looked like:
     the photo was made ready before the mark could be taken, because the mark
     was taken *of* the finished payload — so every sync decoded a full crop
     and re-encoded it small, then almost always threw the answer away. The
     mark is taken of the skeleton and the picture's own mark instead, which
     answers the same question without needing the picture in hand.

     The published face is the small copy: 10–14KB rather than the 30–60KB the
     crop is. It travels inside the payload rather than in storage, which
     avoids the photo bucket's policies entirely and keeps sync()'s own photo
     reconciliation, which only ever looks at <uid>/, from having to learn
     about a second convention. */
  const skeleton = projectSelf(me, '');
  const mark = photoMark(JSON.stringify(skeleton) + '|' + (Kindred.photoMarks[me.id] || ''));
  if (mark === localStorage.getItem('kindred:publishedMark')) return;

  const payload = { ...skeleton, photo: await Kindred.photoThumbDataUrl(me.id) };

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
  const cached = (await Kindred.Store.loadShared()) || {};

  /* Whose profiles to ask for, said outright rather than left to row-level
     security to work out — the same argument selectSince makes for the five
     tables, and this is the one read that had not heard it.

     It matters more here than it does there. profiles_read is `user_id =
     auth.uid() or is_linked(user_id)`, and is_linked takes the row's own id
     as its argument, so unlike a bare auth.uid() the planner cannot lift it
     out and answer it once: it runs per row it is asked about. Ask with only
     a watermark and the watermark is 1970 — which it is on every first sync —
     and there is nothing to narrow the scan, so that is every profile row
     belonging to every account in the database, each one asked whether it is
     a friend of yours. Named, it is a primary-key lookup of the handful of
     rows that could ever have been returned anyway.

     The partners are already in hand: the links read above happens first, and
     always did. Nothing new is fetched to make this possible. */
  const known = [...partners].filter(id => cached[id]);
  const fresh = [...partners].filter(id => !cached[id]);

  /* Two reads, and only when there is something for each to do. Somebody
     linked a moment ago is asked for without a watermark, because theirs is
     almost certainly behind it — a profile published last week is older than
     a mark that has been kept current since, so the incremental read steps
     straight over it and their card would stay blank until they happened to
     publish again. That is the one case a watermark cannot serve, and it is
     rare enough to be worth its own request: linking is not something that
     happens on an ordinary sync, so the ordinary sync still makes one call. */
  const reads = [];
  if (known.length) reads.push(`?select=user_id,payload,updated_at&user_id=in.(${known.join(',')})`
    + `&updated_at=gt.${encodeURIComponent(since)}`);
  if (fresh.length) reads.push(`?select=user_id,payload,updated_at&user_id=in.(${fresh.join(',')})`);

  const next = { ...cached };
  let mark = since;
  for (const qs of reads) {
    const pr = await api(rest('profiles', qs));
    if (!pr.ok) throw new Error('profiles: ' + (await pr.text()).slice(0, 140));
    for (const row of await pr.json()) {
      /* Only ever climbs, so a fresh partner's older row cannot drag it back
         over changes this device has already seen and settled. Your own row
         no longer moves it either — it is not asked for now, and it never had
         any business setting the mark for what other people have published. */
      if (row.updated_at > mark) mark = row.updated_at;
      next[row.user_id] = { ...row.payload, at: row.updated_at };
    }
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
  /* Only when something actually came back. The mark used to be rewritten on
     every sync, which was harmless while your own row was in the answer and
     kept pushing it forward; without that it would be rewound two seconds by
     a sync that had read nothing, and again by the next, walking backwards
     for as long as nobody published anything. */
  // the same small rewind the main watermark uses, and for the same reason
  if (mark !== since) {
    localStorage.setItem('kindred:sharedAt',
      new Date(Date.parse(mark) - 2000).toISOString());
  }
  return moved;
}

