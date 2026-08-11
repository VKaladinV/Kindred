/* ══════════════════════════════════════════════════════════════
   Fellowship — all data lives on this device.
   people    → IndexedDB "kv" store (or localStorage fallback)
   photos    → IndexedDB "photos" store, keyed by person id: the crop, a
               small copy of it, and a mark of the crop's bytes
   originals → IndexedDB "originals" store, keyed by person id:
               the picked image before cropping, so the focus can be
               nudged later. Never synced, never exported.

   A person's `events` array holds three kinds of record:
     history  — it already happened
     upcoming — it falls on a date ahead (optionally every year)
     season   — a stretch they are walking through, until endDate

   An upcoming record with kind 'baby' is the one the app reads into: its
   date is a due date, and how far along someone is is worked out from it
   rather than stored.

   A prayer carries three dates, and they say different things:
     prayedAt   — the last day you ticked it. Moves.
     answeredAt — it happened, and answerNote is how
     releasedAt — you stopped carrying it, unanswered

   This is the first of the app's files. The rest, and the order they load
   in, are listed at the foot of index.html; each one opens with a `uses:`
   line naming what it takes from the others.
   ══════════════════════════════════════════════════════════════ */

/* ─────────────────────────── constants ─────────────────────── */

/* A person belongs to as many of these as fit — nobody is only one thing. */
const GROUPS = ['Community/Discipleship', 'Work', 'Family', 'Friends'];

/* The circles as they were before groups became plural. Church is the same
   people under a truer name; Other never meant anything, so it becomes none. */
const LEGACY_GROUPS = { Church: 'Community/Discipleship', Other: null };

const CADENCES = [
  [0,   'never — no nudges'],
  [3,   'few days'],
  [7,   'week'],
  [14,  'two weeks'],
  [30,  'month'],
  [60,  'two months'],
  [90,  'three months'],
  [182, 'six months'],
  [365, 'year'],
];

/* A kind is a persisted value, not a label — renaming a key orphans records.
   `baby` is the one kind the app knows something about: on a date ahead it
   makes that date a due date, and everything else follows from it. A device
   still on older code folds it back to `other` in normaliseRecord rather than
   refusing the record, which is the same tolerance a check-in's kind gets. */
const KINDS = {
  joy:       { label: 'Joy',       glyph: '✦' },
  hard:      { label: 'Hard time', glyph: '◍' },
  milestone: { label: 'Milestone', glyph: '◆' },
  health:    { label: 'Health',    glyph: '✚' },
  faith:     { label: 'Faith',     glyph: '✜' },
  baby:      { label: 'Baby on the way', glyph: '☽' },
  other:     { label: 'Other',     glyph: '•' },
};

/* How a check-in happened. An empty kind is a real state, not a gap: every
   check-in made before this existed has none, and the tick in Today still
   makes them that way. */
const TOUCH_KINDS = {
  whatsapp: { label: 'WhatsApp',   glyph: '✆' },
  call:     { label: 'Phone call', glyph: '☏' },
  coffee:   { label: 'Coffee',     glyph: '◒' },
  visit:    { label: 'Visit',      glyph: '⌂' },
};
const MAX_TOUCHES = 60;

/* ── walking a road with someone ─────────────────────────────────
   The people you are discipling are an ordinary group — the kind you make
   yourself, holding ids and hanging off nobody (see js/groups.js). It is given
   a fixed id rather than a fresh one so both devices agree there is only one
   of it, and so renaming it can never bring a second into being. */
const ROAD_ID = 'road-walking';
const ROAD_NAME = 'People I am walking a road with';

/* The pathway: abide in Christ, belong to his body, contribute to his kingdom.
   Every key here is a persisted value rather than a label — the same warning
   KINDS carries above, and for the same reason: renaming one orphans whatever
   was ticked under it. A mark is stored as `${section}.${item}`. */
const WALK = [
  { key: 'abide', title: 'Abide', lede: 'Know & follow Christ', parts: [
    { title: 'Know Christ', items: [
      ['saved',     'Accepted Jesus Christ as Lord and Saviour'],
      ['baptised',  'Baptised in water'],
      ['spirit',    'Baptised/filled with the Holy Spirit'],
    ] },
    { title: 'Follow Christ', items: [
      ['bible',     'Regular Bible reading'],
      ['quiet',     'Quiet time with God'],
      ['prayer',    'Regular prayer'],
      ['tongues',   'Prays in tongues'],
      ['obedience', 'Growing in obedience to Christ'],
    ] },
  ] },
  { key: 'belong', title: 'Belong', lede: 'Be part of the body', parts: [
    { title: '', items: [
      ['values',      'Understands the importance of the local church'],
      ['attends',     'Regularly attends church'],
      ['community',   'Attends a community/small group'],
      ['leadership',  'Has a clear relationship with church leadership'],
      ['accountable', 'Has accountability with other believers'],
    ] },
  ] },
  { key: 'contribute', title: 'Contribute', lede: 'Serve & build others', parts: [
    { title: '', items: [
      ['ministry',  'Involved in a ministry'],
      ['prays',     'Regularly prays for others'],
      ['prophetic', 'Encourages others through prophetic words'],
      ['serves',    'Practically serves others'],
      ['outreach',  'Participates in outreach'],
      ['shares',    'Shares a testimony, Scripture or word during a gathering'],
    ] },
  ] },
];

/* Every mark key the app knows about, in the order they are shown — which is
   the order normaliseDiscipleship rebuilds them in, so that two devices write
   the same person down identically and the sync has nothing to argue about. */
const WALK_KEYS = WALK.flatMap(s => s.parts.flatMap(part => part.items.map(([k]) => `${s.key}.${k}`)));

const WALK_LABELS = Object.fromEntries(
  WALK.flatMap(s => s.parts.flatMap(part => part.items.map(([k, label]) => [`${s.key}.${k}`, label]))));

/* Stored, not shown — the labels are here and the values are what is written
   down, so a wording change never orphans anybody's answer. '' is a real
   state: most people in a circle were never asked. */
const MARITAL = [
  ['',          'not noted'],
  ['single',    'Single'],
  ['dating',    'Dating'],
  ['engaged',   'Engaged'],
  ['married',   'Married'],
  ['separated', 'Separated'],
  ['divorced',  'Divorced'],
  ['widowed',   'Widowed'],
];

/* The ones that have an ending worth dating. Asked of anyone else, "when it
   ended" is a question about something that did not happen. */
const MARITAL_ENDED = ['separated', 'divorced', 'widowed'];

/* And the ones a wedding date belongs to. '' counts, because not having said
   yet is not the same as having said no — you may know when they married
   without wanting to file them under a word. Single, dating and engaged do
   not, which is what stops a record reading "Single · married Aug 2011". */
const MARITAL_MARRIED = ['married', ...MARITAL_ENDED];

const TYPES = {
  history: {
    label: 'Past', glyph: '✧',
    titleLabel: 'What happened',
    dateLabel: 'When it happened',
    hint: 'Something already behind them — a birth, a diagnosis, a move, a loss, a win.',
    placeholder: 'Started her first job',
  },
  upcoming: {
    label: 'Future', glyph: '◷',
    titleLabel: 'What is happening',
    dateLabel: 'When it falls',
    hint: 'Something with a date on it. It will appear in Today as the day gets close.',
    placeholder: 'Surgery at Universitas',
  },
  season: {
    label: 'Present', glyph: '◍',
    titleLabel: 'What they are walking through',
    dateLabel: 'When it began',
    hint: 'A stretch of life, not a single day — grief, treatment, a new baby, job hunting. It stays on their page until you mark it ended.',
    placeholder: 'Chemotherapy',
  },
};

/* ─────────────────────────── tiny helpers ──────────────────── */
