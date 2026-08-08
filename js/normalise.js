/* uses: GROUPS KINDS LEGACY_GROUPS MAX_TOUCHES TOUCH_KINDS TYPES
   · daysBetween today uid · shared
*/

/* Records written before types existed become history, unless their date
   is still ahead — those were clearly things being waited for. */
function normaliseRecord(r) {
  const type = TYPES[r.type] ? r.type
    : (r.date && daysBetween(today(), r.date) > 0 ? 'upcoming' : 'history');
  return {
    id: r.id || uid(),
    type,
    date: r.date || today(),
    endDate: type === 'season' ? (r.endDate || '') : '',
    kind: KINDS[r.kind] ? r.kind : 'other',
    title: (r.title || '').trim() || 'Untitled',
    note: r.note || '',
    repeatsYearly: type === 'upcoming' ? !!r.repeatsYearly : false,
    /* Whether this is one of the things you let the people you have linked
       with see. Only ever true on your own profile, and false unless you have
       said otherwise — nothing here goes anywhere by default. */
    shared: !!r.shared,
  };
}

/* Groups were once a single circle. Reading both shapes here means the
   change lands on old data by itself — normalise() runs on every load,
   every import and every sync — and running twice changes nothing. */
function normaliseGroups(p) {
  const raw = Array.isArray(p.groups) ? p.groups
    : (p.groups ? [p.groups] : (p.group ? [p.group] : []));
  const keep = new Set();
  for (const g of raw) {
    const name = Object.prototype.hasOwnProperty.call(LEGACY_GROUPS, g) ? LEGACY_GROUPS[g] : g;
    if (GROUPS.includes(name)) keep.add(name);
  }
  return GROUPS.filter(g => keep.has(g));   // always in the order they are shown
}

function normaliseHealth(h) {
  return {
    id: h.id || uid(),
    name: (h.name || '').trim() || 'Untitled',
    detail: (h.detail || '').trim(),
    addedAt: h.addedAt || today(),
  };
}

/* A check-in used to be a bare date. Reading both shapes here means the change
   lands on old data by itself — normalise() runs on every load, every import
   and every sync — and running twice changes nothing. Nothing reads the backup
   file's version number, so this is the only place that tolerance can live. */
function normaliseTouch(t) {
  if (typeof t === 'string') return { date: t, kind: '' };
  return {
    date: t?.date || today(),
    kind: TOUCH_KINDS[t?.kind] ? t.kind : '',   // a kind from a newer device is dropped, not thrown at
  };
}

/* Prayers were the one list with no normaliser, which was fine while nothing
   was ever added to them. A prayer written before this update has neither of
   the two new dates, so they are defaulted here — on every load, every import
   and every sync, and running twice changes nothing.

   The two dates say different things. prayedAt is the last day you ticked it,
   and moves. releasedAt is the day you stopped carrying it, and is the answer
   to a question answeredAt cannot answer: some things are let go rather than
   answered, and deleting them was the only way to say so. */
function normalisePrayer(pr) {
  return {
    id: pr?.id || uid(),
    text: (pr?.text || '').trim(),
    createdAt: pr?.createdAt || today(),
    answeredAt: pr?.answeredAt || null,
    answerNote: pr?.answerNote || '',
    prayedAt: pr?.prayedAt || '',
    releasedAt: pr?.releasedAt || '',
    shared: !!pr?.shared,        // see normaliseRecord — private unless you say so
  };
}

function normalise(p) {
  return {
    id: p.id || uid(),
    name: (p.name || 'Unnamed').trim(),
    relationship: (p.relationship || '').trim(),
    occupation: (p.occupation || '').trim(),
    groups: normaliseGroups(p),
    birthday: p.birthday || '',
    contact: (p.contact || '').trim(),
    summary: p.summary || '',
    cadenceDays: Number(p.cadenceDays) || 0,
    touches: Array.isArray(p.touches) ? p.touches.map(normaliseTouch).slice(-MAX_TOUCHES) : [],
    events: Array.isArray(p.events) ? p.events.map(normaliseRecord) : [],
    prayers: Array.isArray(p.prayers) ? p.prayers.map(normalisePrayer) : [],
    medications: Array.isArray(p.medications) ? p.medications.map(normaliseHealth) : [],
    conditions: Array.isArray(p.conditions) ? p.conditions.map(normaliseHealth) : [],
    createdAt: p.createdAt || today(),
    /* The one person in here who is you. This is a whitelist — a field not
       named here is dropped on every load, every import and every sync
       landing, so a flag that lives anywhere else lasts until the next
       reload and no longer. */
    isSelf: !!p.isSelf,
    /* Someone you'd like to get to know, not yet someone you're keeping in
       touch with — no cadence, no seasons, no history until they move into
       the circle. */
    isFuture: !!p.isFuture,
    /* Which account this card belongs to, once you have linked with them.
       Null for everyone you have only written down. */
    linkedUid: p.linkedUid || null,
  };
}

