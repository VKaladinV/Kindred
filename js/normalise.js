/* uses: GROUPS KINDS LEGACY_GROUPS MARITAL MAX_TOUCHES STAGES TOUCH_KINDS TYPES WALK_KEYS
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
    /* When a season is a pregnancy: the date it's expected to end, distinct
       from endDate — which stays empty until the season actually ends (the
       birth), exactly as it does for any other season. Never set outside a
       season, the same conditional-blanking normaliseRecord already gives
       endDate and repeatsYearly below. */
    dueDate: type === 'season' ? (r.dueDate || '') : '',
    kind: KINDS[r.kind] ? r.kind : 'other',
    title: (r.title || '').trim() || 'Untitled',
    note: r.note || '',
    repeatsYearly: type === 'upcoming' ? !!r.repeatsYearly : false,
    /* Which way a planned coffee, call or visit is meant to happen — the
       same TOUCH_KINDS a touch is logged under, so completeUpcoming
       (js/mutations.js) can hand this straight to markConnected without
       translating between two vocabularies for the same thing. Only a Future
       record can carry one, the same conditional-blanking repeatsYearly
       above already gets. */
    connectKind: type === 'upcoming' && TOUCH_KINDS[r.connectKind] ? r.connectKind : '',
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

/* ── a group, which is not one of the above ─────────────────────
   The four names in GROUPS are filters: shelves of a life, fixed, and every
   person is on as many as fit. A group is the other thing — people you have
   deliberately put together, named yourself, and want to see as one face.
   They share nothing but a word, which is why normaliseGroups above and this
   are two functions rather than one with a flag.

   The whitelist rule is the same as normalise()'s: a field not named here is
   dropped on every load, every import and every sync landing.

   What is pointedly not done here is pruning members whose person is not in
   the roster. A sync lands people and groups in the same pass, and for the
   moment in between a member id can be perfectly good and still find nobody —
   pruning it would quietly empty the group and then push that emptiness to
   every other device. Absent members are resolved at read time instead
   (membersOf, in groups.js), and only ever removed when you delete somebody. */
function normaliseGroup(g) {
  const raw = Array.isArray(g?.members) ? g.members : [];
  return {
    id: g?.id || uid(),
    name: (g?.name || '').trim() || 'Untitled',
    members: [...new Set(raw.filter(x => typeof x === 'string' && x))],
    createdAt: g?.createdAt || today(),
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

/* ── walking a road with someone ────────────────────────────────
   Everything below hangs off a person the way prayers and records do, and is
   normalised the same way: on every load, every import and every sync landing,
   and running twice changes nothing.

   Two ways of saying how old a child is, and only one of them stays true by
   itself. A birthday wins and the typed age is dropped, because the age is
   then worked out from the date rather than stored — the same refusal the app
   already makes about how far along a pregnancy is (gestationOn, in model.js).
   An age typed on its own is kept as written and buys no calendar entry, which
   is the whole distinction between the two. */
function normaliseKid(k) {
  const birthday = k?.birthday || '';
  return {
    id: k?.id || uid(),
    name: (k?.name || '').trim(),
    birthday,
    age: birthday ? '' : String(k?.age ?? '').replace(/\D/g, '').slice(0, 2),
    school: (k?.school || '').trim(),
  };
}

/* A topic you named yourself. The same three answers a fixed item carries,
   plus the wording, since nothing else knows what this one is called. */
function normaliseTopic(t) {
  return {
    id: t?.id || uid(),
    title: (t?.title || '').trim() || 'Untitled',
    done: !!t?.done,
    date: t?.date || '',
    note: t?.note || '',
  };
}

const normaliseMark = m => ({ done: !!m?.done, date: m?.date || '', note: m?.note || '' });

/* An untouched item is not stored. Nineteen empty answers per person would
   ride every sync and say nothing, so a mark exists only once it has been
   ticked, dated or written on.

   Rebuilt in WALK_KEYS order every time, the way normaliseGroups returns its
   groups "always in the order they are shown". That is not cosmetic here: the
   sync compares rows stringified (same(), in js/sync/shape.js), so two devices
   have to write the same person down character for character or each would
   read the other's copy as changed and neither would ever accept it.

   Keys this version has never heard of are kept rather than dropped, sorted,
   after the ones it knows. A device on older code must not quietly wipe a tick
   a newer one made — which is the one way this differs from normaliseGroups,
   where an unknown group is a filter that no longer exists rather than an
   answer somebody gave. */
function normaliseDiscipleship(d) {
  const raw = (d?.marks && typeof d.marks === 'object') ? d.marks : {};
  const known = new Set(WALK_KEYS);
  const marks = {};
  const put = k => {
    const m = normaliseMark(raw[k]);
    if (m.done || m.date || m.note) marks[k] = m;
  };
  WALK_KEYS.forEach(put);
  Object.keys(raw).filter(k => !known.has(k)).sort().forEach(put);

  /* The four hand-set words above the checklist. Rebuilt in STAGES order for
     the same reason marks are: two devices have to write the same person down
     character for character, or the sync's stringified comparison reads one
     as changed against the other forever. Always all four keys — a stage
     nobody has touched is simply false, not absent, so there is no unknown-key
     case to carry forward the way there is for a mark somebody actually set. */
  const rawStages = (d?.stages && typeof d.stages === 'object') ? d.stages : {};
  const stages = Object.fromEntries(STAGES.map(([k]) => [k, !!rawStages[k]]));

  /* Whether they are on the road at all — see isWalking in js/walk.js. First,
     because it is the gate everything else here is behind, unlike marks,
     topics and stages, which can go on existing quietly once it is false. */
  return { active: !!d?.active, marks, topics: Array.isArray(d?.topics) ? d.topics.map(normaliseTopic) : [], stages };
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

    /* ── what you know about the road they are on ──
       Asked of anyone, kept for everyone, but only ever shown on the page of
       someone you are walking a road with — see isWalking, in js/walk.js.
       Taking them off the road hides all of this again and destroys none of
       it, so putting them back finds it where they left it. */
    maritalStatus: MARITAL.some(([v]) => v === p.maritalStatus) ? p.maritalStatus : '',
    marriedOn: p.marriedOn || '',
    /* The other way of saying how long somebody has been married — a typed
       count rather than a date, for the moment you know roughly but not
       exactly. The same either/or a child's age gets against their birthday,
       just above: a date, once there is one, wins and is what marriageYears
       (model.js) works the count out from, so a fixed number is never left
       going stale next to a date that has since moved past it. */
    marriedYears: p.marriedOn ? '' : String(p.marriedYears ?? '').replace(/\D/g, '').slice(0, 2),
    divorcedOn: p.divorcedOn || '',
    joinedChurchOn: p.joinedChurchOn || '',
    kids: Array.isArray(p.kids) ? p.kids.map(normaliseKid) : [],
    discipleship: normaliseDiscipleship(p.discipleship),
  };
}

