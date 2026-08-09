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
const GROUPS = ['Community/Discipleship', 'Work', 'Family', 'Friends', 'Medical'];

const MEDICAL = 'Medical';

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

const TYPES = {
  history: {
    label: 'Happened', glyph: '✧',
    dlgTitle: 'Add to their history',
    titleLabel: 'What happened',
    dateLabel: 'When it happened',
    hint: 'Something already behind them — a birth, a diagnosis, a move, a loss, a win.',
    placeholder: 'Started her first job',
  },
  upcoming: {
    label: 'A date', glyph: '◷',
    dlgTitle: 'A date ahead',
    titleLabel: 'What is happening',
    dateLabel: 'When it falls',
    hint: 'Something with a date on it. It will appear in Today as the day gets close.',
    placeholder: 'Surgery at Universitas',
  },
  season: {
    label: 'Season', glyph: '◍',
    dlgTitle: 'A season they are in',
    titleLabel: 'What they are walking through',
    dateLabel: 'When it began',
    hint: 'A stretch of life, not a single day — grief, treatment, a new baby, job hunting. It stays on their page until you mark it ended.',
    placeholder: 'Chemotherapy',
  },
};

/* The two lists a person in the Medical group carries. Same shape, same
   renderer, same dialog — only the words around them differ. */
const HEALTH = {
  medications: {
    title: 'Medications', addLabel: '+ add a medication',
    newTitle: 'Add a medication', editTitle: 'Edit this medication',
    nameLabel: 'Medication', namePlaceholder: 'Metformin',
    detailLabel: 'Dose and how often', detailPlaceholder: '500 mg, twice daily',
    empty: 'Nothing listed — what they take, and how much.',
  },
  conditions: {
    title: 'Conditions', addLabel: '+ add a condition',
    newTitle: 'Add a condition', editTitle: 'Edit this condition',
    nameLabel: 'Condition', namePlaceholder: 'Type 2 diabetes',
    detailLabel: 'Anything worth remembering', detailPlaceholder: 'since 2019, well controlled',
    empty: 'Nothing listed — diagnoses, allergies, what to watch for.',
  },
};

/* ─────────────────────────── tiny helpers ──────────────────── */
