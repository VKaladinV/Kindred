/* ══════════════════════════════════════════════════════════════
   Fellowship — all data lives on this device.
   people    → IndexedDB "kv" store (or localStorage fallback)
   photos    → IndexedDB "photos" store, keyed by person id
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
   ══════════════════════════════════════════════════════════════ */

(() => {
'use strict';

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

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = s => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / DAY);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function agoWords(dateStr) {
  const d = daysBetween(dateStr, today());
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 31) return plural(Math.round(d / 7), 'week ago', 'weeks ago');
  if (d < 365) return plural(Math.round(d / 30), 'month ago', 'months ago');
  return plural(Math.max(1, Math.round(d / 365)), 'year ago', 'years ago');
}

/* A face in the circle has room for one glyph's worth of time, not a sentence.
   Floored rather than rounded, so the number never claims more than has passed:
   thirteen days is 1w, not 2w. */
/* The exact count, for the tooltip behind the short one. */
function daysSinceWords(dateStr) {
  const d = daysBetween(dateStr, today());
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${plural(d, 'day', 'days')} ago`;
}

function sinceShort(dateStr) {
  const d = daysBetween(dateStr, today());
  if (d < 7)   return d + 'd';                 // 0d today, then 1d … 6d
  if (d < 30)  return Math.floor(d / 7) + 'w';
  if (d < 365) return Math.floor(d / 30) + 'm';
  return Math.floor(d / 365) + 'y';
}

function aheadWords(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 31) return `in ${days} days`;
  if (days < 365) return `in ${plural(Math.round(days / 30), 'month', 'months')}`;
  return `in ${plural(Math.max(1, Math.round(days / 365)), 'year', 'years')}`;
}

function prettyDate(dateStr) {
  return parseYmd(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
const shortMonth = dateStr => parseYmd(dateStr).toLocaleDateString(undefined, { month: 'short' });
const monthYear = dateStr => parseYmd(dateStr).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

function initialsOf(name) {
  return (name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('') || '?';
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ─────────────────────────── storage ───────────────────────── */

const Store = (() => {
  let db = null, mode = 'memory', blocked = false;
  const mem = { people: null, photos: {}, snapshot: null };

  function openDb() {
    return new Promise(resolve => {
      let req;
      try { req = indexedDB.open('kindred', 2); }
      catch { return resolve(null); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
        if (!d.objectStoreNames.contains('originals')) d.createObjectStore('originals');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      /* another tab still holds the old version open — it is not that the
         database is unusable, only that it is busy. See init(). */
      req.onblocked = () => { blocked = true; resolve(null); };
      setTimeout(() => resolve(req.result || null), 2500);
    });
  }

  const idb = (storeName, fn, write = false) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, write ? 'readwrite' : 'readonly');
    const rq = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(rq ? rq.result : undefined);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

  return {
    get mode() { return mode; },
    get blocked() { return blocked; },

    async init() {
      db = await openDb();
      if (db) {
        try { await idb('kv', s => s.get('people')); mode = 'indexeddb'; return; }
        catch { db = null; }
      }
      /* The real data is in a database we could not open, not in localStorage.
         Writing there would quietly start a second, divergent copy, so stay
         in memory and say so — closing the other tab fixes it. */
      if (blocked) { mode = 'memory'; return; }
      try {
        localStorage.setItem('kindred:probe', '1');
        localStorage.removeItem('kindred:probe');
        mode = 'localstorage';
      } catch { mode = 'memory'; }
    },

    async loadPeople() {
      if (mode === 'indexeddb') return (await idb('kv', s => s.get('people'))) || [];
      if (mode === 'localstorage') {
        try { return JSON.parse(localStorage.getItem('kindred:people') || '[]'); }
        catch { return []; }
      }
      return mem.people || [];
    },

    async savePeople(people) {
      if (mode === 'indexeddb') return idb('kv', s => s.put(people, 'people'), true);
      if (mode === 'localstorage') return localStorage.setItem('kindred:people', JSON.stringify(people));
      mem.people = people;
    },

    async loadPhotos() {
      if (mode === 'indexeddb') {
        const out = {};
        await new Promise((resolve, reject) => {
          const tx = db.transaction('photos', 'readonly');
          tx.objectStore('photos').openCursor().onsuccess = e => {
            const c = e.target.result;
            if (c) { out[c.key] = c.value; c.continue(); }
          };
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        return out;
      }
      if (mode === 'localstorage') {
        try { return JSON.parse(localStorage.getItem('kindred:photos') || '{}'); }
        catch { return {}; }
      }
      return mem.photos;
    },

    async savePhoto(id, dataUrl) {
      if (mode === 'indexeddb') return idb('photos', s => s.put(dataUrl, id), true);
      if (mode === 'localstorage') {
        const all = await this.loadPhotos();
        all[id] = dataUrl;
        return localStorage.setItem('kindred:photos', JSON.stringify(all));
      }
      mem.photos[id] = dataUrl;
    },

    async deletePhoto(id) {
      if (mode === 'indexeddb') return idb('photos', s => s.delete(id), true);
      if (mode === 'localstorage') {
        const all = await this.loadPhotos();
        delete all[id];
        return localStorage.setItem('kindred:photos', JSON.stringify(all));
      }
      delete mem.photos[id];
    },

    /* The uncropped picture, kept only so the focus can be moved again.
       IndexedDB only — a full-size image per person would fill the
       localStorage budget several times over, and the crop still works
       without one, just starting from the square. */
    async loadOriginal(id) {
      if (mode !== 'indexeddb') return null;
      try { return (await idb('originals', s => s.get(id))) || null; }
      catch { return null; }
    },

    async saveOriginal(id, dataUrl) {
      if (mode !== 'indexeddb') return;
      try { await idb('originals', s => s.put(dataUrl, id), true); }
      catch { /* out of room — the crop itself is already saved */ }
    },

    async deleteOriginal(id) {
      if (mode !== 'indexeddb') return;
      try { await idb('originals', s => s.delete(id), true); } catch { /* gone already */ }
    },

    /* what the sync layer last agreed with the server — see sync.js */
    async loadSnapshot() {
      if (mode === 'indexeddb') return (await idb('kv', s => s.get('syncSnapshot'))) || null;
      if (mode === 'localstorage') {
        try { return JSON.parse(localStorage.getItem('kindred:snapshot') || 'null'); }
        catch { return null; }
      }
      return mem.snapshot || null;
    },

    async saveSnapshot(snap) {
      if (mode === 'indexeddb') {
        return snap === null
          ? idb('kv', s => s.delete('syncSnapshot'), true)
          : idb('kv', s => s.put(snap, 'syncSnapshot'), true);
      }
      if (mode === 'localstorage') {
        return snap === null
          ? localStorage.removeItem('kindred:snapshot')
          : localStorage.setItem('kindred:snapshot', JSON.stringify(snap));
      }
      mem.snapshot = snap;
    },

    getPref(k, d = null) {
      try { return localStorage.getItem('kindred:' + k) ?? d; } catch { return d; }
    },
    setPref(k, v) {
      try { localStorage.setItem('kindred:' + k, v); } catch { /* private mode */ }
    },
  };
})();

/* ─────────────────────────── state ─────────────────────────── */

let people = [];
let photos = {};
let openId = null;
const filterGroups = new Set();   // empty means everyone
let query = '';
let saveTimer = null;

const byId = id => people.find(p => p.id === id);

/* sync.js listens here so it never has to trust each mutation site to
   announce itself — everything that changes data ends up in one of these. */
const mutateHooks = [];
function notifyMutate() {
  for (const fn of mutateHooks) { try { fn(); } catch (e) { console.error(e); } }
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => Store.savePeople(people).catch(e => {
    toast('Could not save — storage may be full');
    console.error(e);
  }), 350);
  notifyMutate();
}

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
  };
}

function normalise(p) {
  return {
    id: p.id || uid(),
    name: (p.name || 'Unnamed').trim(),
    relationship: (p.relationship || '').trim(),
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
  };
}

const isMedical = p => p.groups.includes(MEDICAL);

/* ─────────────────────────── status logic ──────────────────── */

const lastTouch = p => (p.touches.length ? p.touches[p.touches.length - 1] : null);
const lastTouchDate = p => lastTouch(p)?.date || null;
const touchOn = (p, date) => p.touches.find(t => t.date === date) || null;

function statusOf(p) {
  const last = lastTouchDate(p);
  const days = last ? daysBetween(last, today()) : null;
  if (!p.cadenceDays) return { state: 'none', days, ratio: 0 };
  if (days === null) return { state: 'due', days: null, ratio: 99 };
  const ratio = days / p.cadenceDays;
  return { state: ratio >= 1 ? 'due' : ratio >= 0.7 ? 'soon' : 'well', days, ratio };
}

/* ── a baby on the way ──────────────────────────────────────────
   Only the due date is kept. How far along someone is today is worked out
   from it rather than stored, because a stored gestation is wrong by morning
   and a due date never is. Forty weeks is how a due date is arrived at in the
   first place, so the two convert into each other exactly. */

const TERM_DAYS = 280;

const isBaby = r => r.type === 'upcoming' && r.kind === 'baby';

function gestationOn(dueDate, on = today()) {
  const days = TERM_DAYS - daysBetween(on, dueDate);
  /* Before conception or well past overdue, a week count says nothing useful. */
  if (days < 0 || days > TERM_DAYS + 42) return null;
  return { days, weeks: Math.floor(days / 7), rem: days % 7 };
}

const gestationWords = g => `${g.weeks}w ${g.rem}d`;

/* Built by walking the calendar rather than adding milliseconds, so the hour
   the clocks change cannot move the answer by a day. */
function dueFromGestation(weeks, days) {
  const d = parseYmd(today());
  d.setDate(d.getDate() + (TERM_DAYS - (weeks * 7 + days)));
  return ymd(d);
}

/* How much of a full-size face someone takes in the circle, so a glance says
   what the order already says: the people you owe a call are the big ones.

   Half on the day you saw them, growing straight-line with how far through
   their own rhythm they are, full when the check-in falls due and full after.
   Because it is a proportion of each person's own cadence rather than a count
   of days, someone you see weekly and someone you see twice a year both fill
   out at their own pace and arrive at full size on the day they are owed.

   No cadence is a third, whatever else is happening to them. Their dates still
   surface in Today and the calendar; what a circle sorted by need cannot say
   about them is when to call, so they sit quietly. */
const SMALL = 1 / 3;

function badgeScale(p) {
  if (!p.cadenceDays) return SMALL;
  const s = statusOf(p);
  if (s.days === null) return 1;          // never yet — already counted as due
  return 0.5 + 0.5 * clamp(s.days / p.cadenceDays, 0, 1);
}

/* the next time an annual date comes round — used for birthdays and
   for upcoming records flagged as repeating */
function nextAnnual(dateStr) {
  const d = parseYmd(dateStr);
  const now = new Date();
  let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (daysBetween(today(), ymd(next)) < 0) next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  return { date: ymd(next), inDays: daysBetween(today(), ymd(next)), years: next.getFullYear() - d.getFullYear() };
}

function nextBirthday(p) {
  if (!p.birthday) return null;
  const n = nextAnnual(p.birthday);
  return { date: n.date, inDays: n.inDays, turning: n.years };
}

/* when a record actually lands — repeating ones roll forward each year */
function occurrenceOf(rec) {
  if (rec.repeatsYearly) return nextAnnual(rec.date);
  return { date: rec.date, inDays: daysBetween(today(), rec.date), years: 0 };
}

const recordsOf = (p, type) => p.events.filter(r => r.type === type);
const activeSeasons = p => p.events.filter(r => r.type === 'season' && !r.endDate);
const historyOf = p => p.events.filter(r => r.type === 'history' || (r.type === 'season' && r.endDate));

/* everything with a date ahead, nearest first; past one-offs sink to the end */
function upcomingOf(p) {
  return recordsOf(p, 'upcoming')
    .map(r => ({ r, o: occurrenceOf(r) }))
    .sort((a, b) => {
      const ap = a.o.inDays < 0, bp = b.o.inDays < 0;
      if (ap !== bp) return ap ? 1 : -1;
      return a.o.inDays - b.o.inDays;
    });
}

/* Open means still being carried. Answered and released both leave the list,
   and mean different things: one was resolved, the other was let go. */
const openPrayers = p => p.prayers.filter(x => !x.answeredAt && !x.releasedAt);
const releasedPrayers = p => p.prayers.filter(x => !x.answeredAt && x.releasedAt);
const answeredPrayers = p => p.prayers.filter(x => x.answeredAt);
const prayedToday = p => openPrayers(p).filter(x => x.prayedAt === today());

function dueList() {
  return people
    .map(p => ({ p, s: statusOf(p) }))
    .filter(x => x.s.state === 'due')
    .sort((a, b) => b.s.ratio - a.s.ratio);
}

/* The circle's order: the people you owe a call first, furthest past their
   cadence at the top, then the ones getting close, then everyone who is fine.
   People you asked for no nudges about have no ratio to compare, so they sort
   by name at the end rather than pretending to a position they never had. */
const SORT_RANK = { due: 0, soon: 1, well: 2, none: 3 };

function byNeed(a, b) {
  const sa = statusOf(a), sb = statusOf(b);
  const ra = SORT_RANK[sa.state], rb = SORT_RANK[sb.state];
  if (ra !== rb) return ra - rb;
  if (sa.state !== 'none' && sb.ratio !== sa.ratio) return sb.ratio - sa.ratio;
  return a.name.localeCompare(b.name);
}

/* What a record contributes to a list of dates: a baby carries how far along
   they are, because that is the thing you actually want to read.

   Two forms of the same line. `sub` names the date, for a list that could be
   any day; `short` leaves it out, for the calendar, where the square or the
   heading above the list has already said which day this is. */
function dateEntry(p, r, o) {
  const g = isBaby(r) ? gestationOn(o.date) : null;
  const short = g ? `${r.title} · ${gestationWords(g)}` : r.title;
  return {
    p, inDays: o.inDays, date: o.date, label: r.title, kind: r.kind, short,
    sub: g ? `${short} · due ${prettyDate(o.date)}` : `${short} · ${prettyDate(o.date)}`,
    glyph: (KINDS[r.kind] || KINDS.other).glyph,
  };
}

const birthdayEntry = (p, bd) => ({
  p, inDays: bd.inDays, date: bd.date, label: 'Birthday', kind: 'joy',
  short: `turning ${bd.turning}`,
  sub: `turning ${bd.turning} · ${prettyDate(bd.date)}`, glyph: '✦',
});

/* birthdays and dated records, merged into one list of what is coming */
function datesAhead(withinDays = 45) {
  const out = [];
  people.forEach(p => {
    const bd = nextBirthday(p);
    if (bd && bd.inDays <= withinDays) out.push(birthdayEntry(p, bd));

    upcomingOf(p).forEach(({ r, o }) => {
      if (o.inDays < 0) return;
      /* A pregnancy outstays the window on purpose. Forty weeks is longer than
         any horizon worth setting, and it is the one date you want in sight
         from the day you hear about it. */
      if (o.inDays > withinDays && !isBaby(r)) return;
      out.push(dateEntry(p, r, o));
    });
  });
  return out.sort((a, b) => a.inDays - b.inDays);
}

/* Every occurrence that lands inside a range — which is a different question
   from datesAhead's "when is the next one", and the one a month grid asks. A
   yearly record appears once per year the range covers. */
function datesIn(fromYmd, toYmd) {
  const out = [];
  const from = parseYmd(fromYmd), to = parseYmd(toYmd);
  const years = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) years.push(y);

  const within = date => date >= fromYmd && date <= toYmd;

  /* the same day-and-month, in each year the range touches */
  const annualDates = dateStr => {
    const d = parseYmd(dateStr);
    return years
      .map(y => ymd(new Date(y, d.getMonth(), d.getDate())))
      .filter(within);
  };

  people.forEach(p => {
    if (p.birthday) {
      annualDates(p.birthday).forEach(date => {
        const turning = parseYmd(date).getFullYear() - parseYmd(p.birthday).getFullYear();
        out.push({
          p, date, inDays: daysBetween(today(), date), label: 'Birthday', kind: 'joy',
          short: `turning ${turning}`, sub: `turning ${turning} · ${prettyDate(date)}`, glyph: '✦',
        });
      });
    }
    recordsOf(p, 'upcoming').forEach(r => {
      const dates = r.repeatsYearly ? annualDates(r.date) : (within(r.date) ? [r.date] : []);
      dates.forEach(date => out.push(dateEntry(p, r, { date, inDays: daysBetween(today(), date), years: 0 })));
    });
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.p.name.localeCompare(b.p.name)));
}

/* Pregnancies near enough to say something about. */
function babiesDue(withinDays = 30) {
  const out = [];
  people.forEach(p => recordsOf(p, 'upcoming').forEach(r => {
    if (!isBaby(r)) return;
    const inDays = daysBetween(today(), r.date);
    if (inDays > withinDays || inDays < -21) return;   // past three weeks over, let it be
    out.push({ p, r, inDays, gestation: gestationOn(r.date) });
  }));
  return out.sort((a, b) => a.inDays - b.inDays);
}

/* ─────────────────────────── photo handling ───────────────── */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* how much of a person's photo the badge shows: the centre of the crop in
   fractions of the picture, and how far in it is zoomed. 1 is the widest
   square that fits, which is exactly where every older photo already sits. */
const DEFAULT_VIEW = { cx: 0.5, cy: 0.5, scale: 1 };
const MAX_ZOOM = 6;
const ORIGINAL_EDGE = 1600;

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('That does not look like an image'));
    img.onload = () => resolve(img);
    img.src = src;
  });
}

/* Kept whole, only made smaller — this is what the crop is taken from, so
   zooming onto one face in a crowd still has pixels to work with. */
function downscale(img, maxEdge = ORIGINAL_EDGE, quality = 0.82) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const f = Math.min(1, maxEdge / Math.max(w, h));
  if (f === 1) return img.src;
  const c = document.createElement('canvas');
  c.width = Math.round(w * f);
  c.height = Math.round(h * f);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

function renderCrop(img, view = DEFAULT_VIEW) {
  const big = Store.mode === 'localstorage' ? 360 : 512;
  const quality = Store.mode === 'localstorage' ? 0.76 : 0.86;
  const w = img.naturalWidth, h = img.naturalHeight;
  const side = Math.min(w, h) / clamp(view.scale, 1, MAX_ZOOM);
  const sx = clamp(view.cx * w - side / 2, 0, w - side);
  const sy = clamp(view.cy * h - side / 2, 0, h - side);

  const c = document.createElement('canvas');
  c.width = c.height = big;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, big, big);
  return c.toDataURL('image/jpeg', quality);
}

/* A photo is the only way into a person's page, so the avatar is the button. */
function avatar(p, cls, clickable = false) {
  const wrap = el(clickable ? 'button' : 'div', cls);
  if (clickable) {
    wrap.type = 'button';
    wrap.setAttribute('aria-label', `Open ${p.name}`);
    wrap.onclick = () => openSheet(p.id);
  }
  if (photos[p.id]) {
    const img = el('img');
    img.src = photos[p.id];
    img.alt = clickable ? '' : p.name;
    img.loading = 'lazy';
    wrap.append(img);
  } else {
    wrap.append(el('span', 'initials', initialsOf(p.name)));
  }
  return wrap;
}

/* ─────────────────────────── toast ─────────────────────────── */

let toastTimer = null;

/* An optional { label, run } puts one action in the toast — for the moment
   right after a tap, when taking it back should cost no hunting. */
function toast(msg, action) {
  const t = $('#toast');
  t.textContent = msg;
  if (action) {
    const b = el('button', 'toast-do', action.label);
    b.type = 'button';
    b.onclick = () => { clearTimeout(toastTimer); t.hidden = true; action.run(); };
    t.append(b);
  }
  t.hidden = false;
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(toastTimer);
  /* Something to read and reach for needs longer than something to notice. */
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 2800);
}

/* ═══════════════════════════ RENDER: CIRCLE ════════════════ */

function badge(p, i) {
  const s = statusOf(p);
  const b = el('div', 'badge');
  b.dataset.state = s.state;
  b.style.setProperty('--i', i);
  /* One number, and everything inside the badge follows it — the ring, the
     marks, the initials, the disc are all proportions of --frame already. */
  b.style.setProperty('--scale', badgeScale(p).toFixed(3));

  const frame = el('button', 'badge-frame');
  frame.type = 'button';
  frame.setAttribute('aria-label', `Open ${p.name}`);
  frame.style.setProperty('--tilt', ((hashCode(p.id) % 7) - 3) + 'deg');
  frame.onclick = () => openSheet(p.id);
  frame.append(avatar(p, 'badge-photo'));

  const nOpen = openPrayers(p).length;
  if (nOpen) {
    const flag = el('div', 'badge-flag', '✜');
    flag.title = plural(nOpen, 'open prayer', 'open prayers');
    frame.append(flag);
  }

  const seasons = activeSeasons(p);
  if (seasons.length) {
    const mark = el('div', 'badge-season', (KINDS[seasons[0].kind] || KINDS.other).glyph);
    mark.title = seasons.map(x => x.title).join(' · ');
    frame.append(mark);
  }

  /* How long since you last spoke, sitting on the bottom edge of the face.
     Everyone carries it, not only the overdue — the ring already says whether
     that is a problem, and this says how long it has been either way. */
  const last = lastTouchDate(p);
  const since = el('div', 'badge-since', last ? sinceShort(last) : '—');
  /* Spelled out in days rather than through agoWords, which rounds where the
     disc floors — the two would contradict each other on the same face. */
  since.title = last ? `Last connected ${daysSinceWords(last)}` : 'No check-in yet';
  frame.append(since);

  b.append(frame, el('div', 'badge-name', p.name));

  if (p.relationship) b.append(el('div', 'badge-meta', p.relationship));

  return b;
}

/* ── how big a face is, and how many fit ────────────────────────
   The size lives in one CSS variable, so changing it is a variable to set
   rather than anything to redraw — on a computer the grid reflows itself and
   the badges never blink. A phone is the exception: there the badges are laid
   out in rows here, and how many go in a row is exactly what just changed. */

const phone = matchMedia('(max-width: 899px)');
const SIZE_MIN = 70, SIZE_MAX = 145;

const badgeSizePref = () => {
  const v = Number(Store.getPref('badgeSize', '100'));
  return Number.isFinite(v) ? clamp(v, SIZE_MIN, SIZE_MAX) : 100;
};

const applyBadgeSize = v => document.documentElement.style.setProperty('--badge-scale', v / 100);

/* --badge is a calc(), and a calc() in a custom property does not resolve
   when you read the property back — so the number is measured off a real
   element rather than written down a second time here, where it would drift
   from the stylesheet the first time either changed. The probe carries the
   gap as a margin so one element answers both questions. */
let probe = null;
function hexMetrics(grid) {
  if (!probe) {
    probe = el('span', 'badge-probe');
    probe.setAttribute('aria-hidden', 'true');
    document.body.append(probe);
  }
  const cs = getComputedStyle(probe);
  const max = parseFloat(cs.width) || 1;
  const gap = parseFloat(cs.marginLeft) || 0;
  const w = grid.clientWidth;
  /* Same give as the grid takes on a computer: a face may shrink to
     four-fifths of its set size if that lets one more fit across. */
  const per = Math.max(2, Math.floor((w + gap) / (max * .8 + gap)));
  /* A grid nobody can see has no width, and the arithmetic above then hands
     back a negative cell — which reaches CSS as an invalid length, so every
     declaration built on it is dropped and the faces come apart. Renders on a
     hidden tab used to do exactly that. switchView repaints on the way in now,
     but a render should not be able to emit nonsense in the first place. */
  const cell = Math.min(max, (w - (per - 1) * gap) / per);
  return { per, cell: cell > 0 ? cell : max };
}

let hexCols = 0;

/* Rows of n, then n-1, then n again. The short row needs no nudging: centred
   against a full one, one fewer face already sits in the gaps above it. */
function layoutHex(grid, list) {
  const { per, cell } = hexMetrics(grid);
  grid.style.setProperty('--hex-cell', cell + 'px');
  let i = 0, long = true;
  while (i < list.length) {
    const chunk = list.slice(i, i + (long ? per : Math.max(1, per - 1)));
    const row = el('div', 'hex-row');
    chunk.forEach((p, k) => row.append(badge(p, i + k)));
    grid.append(row);
    i += chunk.length;
    long = !long;
  }
  return per;
}

/* ── choosing who to show ───────────────────────────────────────
   One builder, two homes: the row above the circle on a computer, and the
   popup a phone opens from the filter button. The row costs three lines of
   a small screen before you have seen anybody, which is what the button is
   for — the chips inside it are the same chips, doing the same thing. */

function fillGroupChips(box) {
  box.textContent = '';
  const counts = {};
  people.forEach(p => p.groups.forEach(g => { counts[g] = (counts[g] || 0) + 1; }));

  const everyone = el('button', 'chip' + (filterGroups.size ? '' : ' is-on'));
  everyone.type = 'button';
  everyone.setAttribute('aria-pressed', String(!filterGroups.size));
  everyone.append(document.createTextNode('Everyone'), el('span', 'n', people.length));
  everyone.onclick = () => { filterGroups.clear(); afterFilterChange(); };
  box.append(everyone);

  GROUPS.forEach(g => {
    const on = filterGroups.has(g);
    if (!counts[g] && !on) return;   // but a group you have chosen always stays visible
    const c = el('button', 'chip' + (on ? ' is-on' : ''));
    c.type = 'button';
    c.setAttribute('aria-pressed', String(on));
    c.append(document.createTextNode(g), el('span', 'n', counts[g] || 0));
    /* groups add up rather than replace each other — Family and Medical
       together is everyone in either, which is how you actually look */
    c.onclick = () => {
      if (!filterGroups.delete(g)) filterGroups.add(g);
      afterFilterChange();
    };
    box.append(c);
  });
}

/* renderCircle rebuilds the row and the grid on its own. The popup's chips
   are outside it, so they are repainted here — but only while the popup is
   the thing being looked at. */
function afterFilterChange() {
  renderCircle();
  if ($('#dlg-filter').open) fillGroupChips($('#filter-chips'));
}

function paintFilterCount() {
  const n = filterGroups.size;
  const b = $('#btn-filter');
  b.classList.toggle('is-on', n > 0);
  $('#filter-n').textContent = n || '';
  b.setAttribute('aria-label', n ? `Choose who to show — ${n} chosen` : 'Choose who to show');
}

function renderCircle() {
  const grid = $('#grid');
  grid.textContent = '';

  const q = query.trim().toLowerCase();
  const list = people
    .filter(p => !filterGroups.size || p.groups.some(g => filterGroups.has(g)))
    .filter(p => !q || (p.name + ' ' + p.relationship + ' ' + p.summary + ' ' + p.groups.join(' ')).toLowerCase().includes(q))
    .sort(byNeed);

  grid.classList.toggle('is-hex', phone.matches);
  if (phone.matches) hexCols = layoutHex(grid, list);
  else list.forEach((p, i) => grid.append(badge(p, i)));

  $('#blank').hidden = people.length > 0;
  grid.hidden = people.length === 0;

  if (people.length && !list.length) {
    grid.hidden = false;
    grid.append(el('p', 'quiet-note', 'No one matches that.'));
  }

  const chips = $('#chips');
  chips.textContent = '';
  const canFilter = people.length > 3;
  if (canFilter) fillGroupChips(chips);

  /* The button that stands in for the row on a phone. Hidden on the same
     terms as the chips: with three people there is nothing to sift. */
  $('#btn-filter').hidden = !canFilter;
  paintFilterCount();

  const n = people.length;
  $('#footer-count').textContent = n ? plural(n, 'person', 'people') + ' held close' : 'nobody yet';
  $('#tagline').textContent = n ? 'the people I hold, and how they are' : 'a quiet place to begin';
}

/* ═══════════════════════════ RENDER: PRAYERS ══════════════ */

/* One row, three states. The tick means something different in each: on the
   list it records that you prayed today, and in either archive it brings the
   prayer back. Closing a prayer is deliberate and goes through the dialog —
   a single stray tap used to delete one outright. */
function prayerLine(p, pr, state = 'open') {
  const line = el('div', 'prayer-line is-' + state);

  const prayedNow = state === 'open' && pr.prayedAt === today();
  if (prayedNow) line.classList.add('is-prayed');

  const tick = el('button', 'tick');
  tick.type = 'button';
  tick.title = state !== 'open' ? 'Put it back on the list'
    : prayedNow ? 'You prayed for this today — tap to take it back'
    : 'Prayed for this today';
  tick.setAttribute('aria-label', tick.title);
  tick.setAttribute('aria-pressed', String(prayedNow));
  tick.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 13l4.5 4.5L19 7"/></svg>';
  tick.onclick = () => state === 'open' ? togglePrayed(p.id, pr.id) : reopenPrayer(p.id, pr.id);

  const body = el('div', 'prayer-text');
  body.append(document.createTextNode(pr.text));
  if (state === 'answered' && pr.answerNote) body.append(el('p', 'answer-note', '“' + pr.answerNote + '”'));
  if (state === 'open' && pr.prayedAt) {
    body.append(el('p', 'prayed-note', prayedNow ? 'prayed today' : `last prayed ${agoWords(pr.prayedAt)}`));
  }

  const age = el('span', 'prayer-age',
    state === 'answered' ? prettyDate(pr.answeredAt)
    : state === 'released' ? prettyDate(pr.releasedAt)
    : agoWords(pr.createdAt));

  line.append(tick, body, age);

  if (state === 'open') {
    const rel = el('button', 'prayer-x', '×');
    rel.type = 'button';
    rel.title = 'Stop carrying this';
    rel.setAttribute('aria-label', `Stop carrying “${pr.text}”`);
    rel.onclick = () => askRelease(p.id, pr.id, pr.text);
    line.append(rel);
  }

  return line;
}

/* An archive card: the same person's head, and their closed prayers under it.
   Both archives are built the same way and differ only in what they hold. */
function archiveCards(box, pick, sortKey, state) {
  let count = 0;
  people
    .filter(p => pick(p).length)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(p => {
      const done = [...pick(p)].sort((a, b) => (a[sortKey] < b[sortKey] ? 1 : -1));
      count += done.length;
      const card = el('div', 'pcard');
      const head = el('div', 'pcard-head');
      head.append(avatar(p, 'thumb', true));
      const idBox = el('div');
      idBox.append(el('h3', null, p.name));
      head.append(idBox);
      card.append(head);
      done.forEach(pr => card.append(prayerLine(p, pr, state)));
      box.append(card);
    });
  return count;
}

function renderPrayers() {
  const openWrap = $('#prayer-open');
  const ansWrap = $('#prayer-answered');
  const relWrap = $('#prayer-released');
  openWrap.textContent = '';
  ansWrap.textContent = '';
  relWrap.textContent = '';

  const withOpen = people.filter(p => openPrayers(p).length).sort((a, b) => a.name.localeCompare(b.name));

  withOpen.forEach((p, i) => {
    const card = el('div', 'pcard');
    card.style.setProperty('--i', i);

    const head = el('div', 'pcard-head');
    head.append(avatar(p, 'thumb', true));
    const idBox = el('div');
    idBox.append(el('h3', null, p.name));
    if (p.relationship) idBox.append(el('div', 'who', p.relationship));
    head.append(idBox);
    card.append(head);

    /* Oldest first, and ticking one never reorders the list — a line that
       jumped away from the finger that just tapped it would be its own bug. */
    openPrayers(p)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .forEach(pr => card.append(prayerLine(p, pr, 'open')));

    openWrap.append(card);
  });

  const answeredCount = archiveCards(ansWrap, answeredPrayers, 'answeredAt', 'answered');
  const releasedCount = archiveCards(relWrap, releasedPrayers, 'releasedAt', 'released');

  $('#answered-wrap').hidden = answeredCount === 0;
  $('#answered-count').textContent = answeredCount;
  $('#released-wrap').hidden = releasedCount === 0;
  $('#released-count').textContent = releasedCount;

  const total = withOpen.reduce((n, p) => n + openPrayers(p).length, 0);
  const prayed = withOpen.reduce((n, p) => n + prayedToday(p).length, 0);
  $('#prayer-sub').textContent = total
    ? `${plural(total, 'thing', 'things')} for ${plural(withOpen.length, 'person', 'people')}`
      + (prayed ? ` · ${prayed} prayed for today` : '')
    : '';
  $('#prayer-blank').hidden = total > 0 || answeredCount > 0 || releasedCount > 0;
}

/* ═══════════════════════════ RENDER: TODAY ════════════════ */

/* Shared by Today and the calendar. The thumb opens the person; the row
   itself does nothing, because a date is something to know rather than
   something to action. */
function todayRow(p, { when = '', calm = false, sub = '' } = {}) {
  const row = el('div', 'today-row');
  row.append(avatar(p, 'thumb', true));

  const who = el('div', 'who');
  who.append(el('strong', null, p.name));
  who.append(el('small', null, sub || p.relationship || p.groups.join(' · ')));
  row.append(who);

  if (when) row.append(el('span', 'when' + (calm ? ' calm' : ''), when));
  return row;
}

function block(title, count) {
  const b = el('div', 'today-block');
  const h = el('h3');
  h.append(document.createTextNode(title));
  if (count) h.append(el('em', null, count));
  b.append(h);
  const list = el('div', 'today-list');
  b.append(list);
  b._list = list;
  return b;
}

function renderToday() {
  const body = $('#today-body');
  body.textContent = '';
  $('#today-date').textContent = new Date().toLocaleDateString(undefined,
    { weekday: 'long', day: 'numeric', month: 'long' });

  /* Birthdays and dated records, and nothing else. Who you owe a call is the
     circle's question, and it answers it by putting them first — asking it
     twice, in two places, only ever made both easier to stop reading. */
  const ahead = datesAhead(45);

  const groups = [
    ['Today',     x => x.inDays === 0],
    ['This week', x => x.inDays > 0 && x.inDays <= 7],
    ['Later',     x => x.inDays > 7],
  ];

  groups.forEach(([title, pick]) => {
    const rows = ahead.filter(pick);
    if (!rows.length) return;
    const b = block(title, title === 'Today' ? String(rows.length) : '');
    rows.forEach(x => b._list.append(todayRow(x.p, {
      when: x.inDays === 0 ? `${x.glyph} today` : aheadWords(x.inDays),
      calm: x.inDays > 7,
      sub: x.sub,
    })));
    body.append(b);
  });

  if (!ahead.length) {
    body.append(el('p', 'all-clear', people.length
      ? 'Nothing to know about today.'
      : 'Add someone to your circle and this page will start looking after you.'));
  }

  /* A pregnancy inside its last fortnight counts too — it is the one date
     worth a pip before the day itself arrives. */
  const count = ahead.filter(x => x.inDays === 0).length + babiesDue(14).length;
  const badgeEl = $('#tab-count');
  badgeEl.hidden = count === 0;
  badgeEl.textContent = count;
}

/* ═══════════════════════════ RENDER: CALENDAR ═════════════
   The same dates Today lists, laid out as a month so you can see the shape
   of one — which week is crowded, how far off the next thing is. It reads
   the data and changes none of it. */

const MONTH_NAMES = 'January February March April May June July August September October November December'.split(' ');
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* A year, laid out end to end. Paging a month at a time meant pressing the
   arrow and losing the thread of what came before it; a year in one scroll
   is the shape of the question people actually ask of a calendar. The bar at
   the top freezes and still steps month to month — it just scrolls there
   rather than redrawing. */
const MONTHS_AHEAD = 12;

let calPicked = '';    // the day whose list is narrowed to it, '' for none
let calLayer = null;   // the back-button layer, while a day is picked
let calSeen = '';      // the month the frozen bar is naming, as 'YYYY-MM'
let calWatch = null;   // the observer telling it which month that is

const monthStart = d => new Date(d.getFullYear(), d.getMonth(), 1);
const monthEnd = d => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthLabel = d => `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;

/* The twelve months on show, this one first. */
const monthsShown = () => {
  const from = monthStart(new Date());
  return Array.from({ length: MONTHS_AHEAD }, (_, i) =>
    new Date(from.getFullYear(), from.getMonth() + i, 1));
};

const monthSection = key => $(`#calendar-body .cal-month[data-month="${key}"]`);

/* Narrowing a month to one day, and widening it out again. Back widens it,
   which is why it registers with the layer stack — the same way a dialog
   does, and on both widths for the same reason. */
function pickDay(date) {
  if (calPicked === date) return unpickDay();
  calPicked = date;
  if (!calLayer) calLayer = openLayer(unpickDay);
  renderCalendar();
  $(`#calendar-body .cal-day[data-date="${date}"]`)?.focus({ preventScroll: true });
}

/* Also the close callback the back button reaches. By then popstate has
   already taken the layer off the list, so closeLayer finds nothing and does
   nothing — which is exactly what it is built for. */
function unpickDay() {
  if (!calPicked) return;
  const was = calPicked;
  calPicked = '';
  const layer = calLayer;
  calLayer = null;
  if (layer) closeLayer(layer);
  renderCalendar();
  $(`#calendar-body .cal-day[data-date="${was}"]`)?.focus({ preventScroll: true });
}

/* For the ways out that are not the back button — leaving the tab. Silent,
   because that is not a day being widened; it is simply no longer what you
   are looking at. */
function clearPickedDay() {
  calPicked = '';
  const layer = calLayer;
  calLayer = null;
  if (layer) closeLayer(layer);
}

/* The arrows no longer redraw anything. Every month is already on the page,
   so stepping is scrolling — and scroll-margin-top on the sections is what
   keeps the frozen bar from landing on the heading it just travelled to. */
function goToMonth(key) {
  const section = monthSection(key);
  if (!section) return;
  calSeen = key;
  paintCalBar();
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function shiftMonth(by) {
  const months = monthsShown();
  const at = Math.max(0, months.findIndex(m => monthKey(m) === calSeen));
  const next = months[clamp(at + by, 0, months.length - 1)];
  if (next) goToMonth(monthKey(next));
}

function paintCalBar() {
  const months = monthsShown();
  const at = months.findIndex(m => monthKey(m) === calSeen);
  const now = months[at] || months[0];
  $('#cal-month').textContent = monthLabel(now);
  $('#cal-prev').disabled = at <= 0;
  $('#cal-next').disabled = at >= months.length - 1;
}

/* One month: its heading, its grid, and the list underneath it. */
function monthSectionFor(month, onDay) {
  const first = monthStart(month);
  const last = monthEnd(month);
  const key = monthKey(first);

  const section = el('section', 'cal-month');
  section.dataset.month = key;
  section.append(el('h3', 'cal-month-name', monthLabel(first)));

  const grid = el('div', 'cal-grid');
  WEEKDAYS.forEach(w => grid.append(el('div', 'cal-dow', w)));

  /* Monday-first: getDay() calls Sunday 0, so Sunday sits at the end. */
  const lead = (first.getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) grid.append(el('div', 'cal-pad'));

  const mine = [];
  for (let day = 1; day <= last.getDate(); day++) {
    const date = ymd(new Date(first.getFullYear(), first.getMonth(), day));
    const list = onDay[date] || [];
    mine.push(...list);

    const cell = el('button', 'cal-day');
    cell.type = 'button';
    cell.dataset.date = date;
    if (date === today()) cell.classList.add('is-today');
    if (date === calPicked) cell.classList.add('is-picked');
    if (!list.length) cell.classList.add('is-empty');

    cell.append(el('span', 'cal-n', String(day)));

    const dots = el('span', 'cal-dots');
    list.slice(0, 3).forEach(x => {
      const dot = el('span', 'cal-dot');
      dot.dataset.kind = x.kind || 'other';
      dots.append(dot);
    });
    cell.append(dots);

    cell.setAttribute('aria-label', list.length
      ? `${prettyDate(date)} — ${plural(list.length, 'thing', 'things')}`
      : prettyDate(date));
    cell.onclick = () => pickDay(date);

    grid.append(cell);
  }
  section.append(grid);

  /* A picked day narrows its own month and leaves the other eleven whole.
     An empty day still narrows and still says so — a tap that answers
     nothing reads as the app having missed you. */
  const narrowed = calPicked && calPicked.startsWith(key);
  const shown = narrowed ? (onDay[calPicked] || []) : mine;

  let details;
  if (shown.length) {
    details = block(narrowed ? prettyDate(calPicked) : 'Everything this month');
    shown.forEach(x => details._list.append(todayRow(x.p, {
      when: `${x.glyph} ${narrowed ? '' : parseYmd(x.date).getDate() + ' ' + shortMonth(x.date)}`.trim(),
      calm: x.date !== today(),
      sub: x.short,
    })));
  } else {
    details = el('p', 'quiet-note', narrowed
      ? 'Nothing on that day.'
      : 'Nothing this month — birthdays and any date you have noted would show here.');
  }
  if (narrowed) details.classList.add('cal-enter');
  section.append(details);

  return section;
}

function renderCalendar() {
  const body = $('#calendar-body');
  if (!body) return;

  const months = monthsShown();
  if (!calSeen) calSeen = monthKey(months[0]);

  /* One pass over the whole year rather than twelve — datesIn already rolls a
     yearly record into each year the range covers, so a birthday in March
     appears in both Marches a thirteen-month window can straddle. */
  const from = monthStart(months[0]);
  const to = monthEnd(months[months.length - 1]);
  const onDay = {};
  datesIn(ymd(from), ymd(to)).forEach(x => (onDay[x.date] ||= []).push(x));

  /* Built off-document and swapped in one move. Emptying first would leave the
     page momentarily a year shorter, and the browser clamps the scroll to the
     shorter page before the new content lands — so the reader would be thrown
     back to January every time anything anywhere was edited. */
  const frag = document.createDocumentFragment();
  months.forEach(m => frag.append(monthSectionFor(m, onDay)));
  body.replaceChildren(frag);

  paintCalBar();
  watchMonths();
}

/* Which month the frozen bar is naming. The sections are new elements on every
   render, so the observer is rebuilt with them. The band is a thin strip just
   under the bar: the month crossing it is the one being read. */
function watchMonths() {
  calWatch?.disconnect();
  if (!('IntersectionObserver' in window)) return;

  calWatch = new IntersectionObserver(entries => {
    const hit = entries.filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!hit) return;
    const key = hit.target.dataset.month;
    if (key === calSeen) return;
    calSeen = key;
    paintCalBar();
    /* Measured rather than written down, so it cannot drift from the height
       the stylesheet gives the bar. */
  }, { rootMargin: `-${Math.round($('.cal-head')?.getBoundingClientRect().height || 56)}px 0px -80% 0px` });

  $$('#calendar-body .cal-month').forEach(s => calWatch.observe(s));
}

/* ═══════════════════════════ THE BACK BUTTON ═════════════
   Nothing in Fellowship is a separate page — the person sheet and every
   dialog are elements that get unhidden — so on a phone the back button
   had nothing to go back through and closed the whole app instead, even
   with someone's page open over the top.

   So anything that covers the app registers itself here as it opens.
   One history entry stands for "something is covering the app", and back
   peels the topmost thing off it. Back on the circle itself still leaves,
   which is what it should do — the tabs deliberately stay out of this, or
   leaving would become a walk back through everywhere you had been.

   Chrome on Android has begun closing modal dialogs on back by itself,
   without moving through history. Watching each dialog's own close event
   rather than assuming we caused it is what keeps the two accounts of
   what is open from drifting apart. */

const layers = [];     // what is covering the app, innermost last
let guarded = false;   // our one history entry is on the stack
let winding = false;   // a history.back() of our own, still in flight

function guard() {
  if (guarded) return;
  guarded = true;
  /* No URL is passed: the address never changes, so moving across this
     entry is always same-document and can never become a reload. The
     person rides along so a reload can put their page back — see boot. */
  try { history.pushState({ kindredLayer: true, person: openId }, ''); }
  catch { guarded = false; }
}

function unguard() {
  if (!guarded) return;
  guarded = false;
  winding = true;
  try { history.back(); } catch { winding = false; }
}

function openLayer(close) {
  const layer = { close };
  layers.push(layer);
  guard();
  return layer;
}

/* A layer closed by its own button, or closed for us by the browser.
   Doing nothing when it has already gone is the whole trick: the back
   press takes it off the list first, so this becomes a no-op instead of
   winding the history entry off a second time. */
function closeLayer(layer) {
  const i = layers.indexOf(layer);
  if (i < 0) return;
  layers.splice(i, 1);
  if (!layers.length) unguard();
}

window.addEventListener('popstate', () => {
  if (winding) { winding = false; return; }
  guarded = false;
  const layer = layers.pop();
  if (layer) layer.close();
  if (layers.length) guard();   // still covered — arm the next press
});

/* Every editor in the app is a native dialog, so one pass covers the lot,
   including the sign-in dialog that sync.js owns and this file never
   mentions. The lock screen is pointedly not among them: back must never
   be a way through it. */
function wireDialogLayers() {
  const held = new WeakMap();
  const obs = new MutationObserver(list => list.forEach(m => {
    const d = m.target;
    if (d.open && !held.has(d)) held.set(d, openLayer(() => d.close()));
    else if (!d.open && held.has(d)) { closeLayer(held.get(d)); held.delete(d); }
  }));
  $$('dialog.dlg').forEach(d => obs.observe(d, { attributes: true, attributeFilter: ['open'] }));
}

/* ═══════════════════════════ PERSON SHEET ════════════════ */

let sheetLayer = null;

function openSheet(id) {
  openId = id;
  /* Registered before anything is painted, because renderSheet closes the
     sheet again if the person has gone — and that has to find a layer to
     take away rather than leave one standing for a sheet that never opened. */
  sheetLayer = openLayer(closeSheet);
  $('#scrim').hidden = false;
  $('#sheet').hidden = false;
  document.body.classList.add('is-locked');
  renderSheet();
  $('#sheet-scroll').scrollTop = 0;
  $('#sheet-close').focus();
}

function closeSheet() {
  openId = null;
  $('#scrim').hidden = true;
  $('#sheet').hidden = true;
  document.body.classList.remove('is-locked');
  /* Every way of closing the sheet already comes through here — the X, the
     scrim, Escape, removing the person, renderSheet finding nobody — so
     this one line covers all of them. */
  closeLayer(sheetLayer);
  sheetLayer = null;
}

function blockHead(title, addLabel, onAdd) {
  const head = el('div', 'block-head');
  head.append(el('h3', null, title));
  if (addLabel) {
    const btn = el('button', 'link-btn', addLabel);
    btn.type = 'button';
    btn.onclick = onAdd;
    head.append(btn);
  }
  return head;
}

function healthBlock(p, key) {
  const meta = HEALTH[key];
  const block = el('div', 'sheet-block');
  block.append(blockHead(meta.title, meta.addLabel, () => healthDialog(p.id, key, null)));

  if (!p[key].length) {
    block.append(el('p', 'quiet-note', meta.empty));
    return block;
  }

  const list = el('div', 'health-list');
  p[key].forEach(h => {
    const row = el('button', 'health-row');
    row.type = 'button';
    row.title = 'Edit this';
    row.onclick = () => healthDialog(p.id, key, h.id);
    row.append(el('span', 'health-glyph', KINDS.health.glyph));

    const body = el('span', 'health-body');
    body.append(el('span', 'health-name', h.name));
    if (h.detail) body.append(el('span', 'health-detail', h.detail));
    row.append(body);
    list.append(row);
  });
  block.append(list);
  return block;
}

function renderSheet() {
  const p = byId(openId);
  if (!p) return closeSheet();

  const root = $('#sheet-scroll');
  root.textContent = '';
  const s = statusOf(p);
  const last = lastTouchDate(p);

  /* ── identity ── */
  const head = el('div', 'person-head');
  head.append(avatar(p, 'person-photo'));
  const idBox = el('div', 'person-id');
  idBox.append(el('h2', null, p.name));
  if (p.relationship) idBox.append(el('p', 'person-rel', p.relationship));

  const facts = el('div', 'person-facts');
  const bd = nextBirthday(p);
  if (bd) {
    const f = el('div', 'fact');
    f.append(document.createTextNode('✦ '), el('b', null, prettyDate(p.birthday).replace(/,? \d{4}$/, '')));
    f.append(document.createTextNode(bd.inDays === 0 ? ' — today!' : ` — ${aheadWords(bd.inDays)}, turning ${bd.turning}`));
    facts.append(f);
  }
  if (p.contact) {
    const f = el('div', 'fact');
    const dial = dialNumber(p.contact);
    /* A way to ring someone without recording anything — sometimes you are
       calling to arrange the visit, not reporting on it. */
    const value = dial ? el('a', 'fact-link') : el('b');
    value.textContent = p.contact;
    if (dial) { value.href = telLink(dial); value.setAttribute('aria-label', `Call ${p.name}`); }
    f.append(document.createTextNode('☏ '), value);
    facts.append(f);
  }
  idBox.append(facts);

  if (p.groups.length) {
    const tags = el('div', 'group-pills');
    p.groups.forEach(g => {
      const pill = el('span', 'pill pill-group');
      pill.append(el('span', 'glyph', '◈'), document.createTextNode(g));
      tags.append(pill);
    });
    idBox.append(tags);
  }

  const seasons = activeSeasons(p);
  if (seasons.length) {
    const pills = el('div', 'season-pills');
    seasons.forEach(sn => {
      const pill = el('span', 'pill');
      pill.append(el('span', 'glyph', (KINDS[sn.kind] || KINDS.other).glyph), document.createTextNode(sn.title));
      pills.append(pill);
    });
    idBox.append(pills);
  }

  const edit = el('button', 'link-btn', 'edit details');
  edit.type = 'button';
  edit.style.marginTop = '.7rem';
  edit.onclick = () => personDialog(p);
  idBox.append(edit);

  head.append(idBox);
  root.append(head);

  /* ── check-in bar ── */
  const bar = el('div', 'touch-bar');
  const st = el('div', 'touch-status');
  st.append(el('span', 'big', last ? `Last connected ${agoWords(last)}` : 'Not connected yet'));
  const cadenceLabel = p.cadenceDays
    ? `every ${(CADENCES.find(c => c[0] === p.cadenceDays) || [0, p.cadenceDays + ' days'])[1]}`
    : 'no reminder set';
  st.append(el('span', 'sub', cadenceLabel + (s.state === 'due' ? ' · overdue' : '')));

  if (p.touches.length) {
    const beads = el('div', 'beads');
    p.touches.slice(-14).forEach(t => {
      const k = TOUCH_KINDS[t.kind];
      const b = el('span', 'bead on' + (k ? ' has-kind' : ''), k ? k.glyph : '');
      b.title = k ? `${prettyDate(t.date)} — ${k.label}` : prettyDate(t.date);
      beads.append(b);
    });
    st.append(beads);
  }
  bar.append(st);

  /* Still live once you have connected, because how it happened can be
     corrected — the label says what is recorded, the tap changes it. */
  const todayTouch = touchOn(p, today());
  const connectedToday = !!todayTouch;
  const kind = TOUCH_KINDS[todayTouch?.kind];
  const btnTouch = el('button', 'btn btn-sage',
    connectedToday ? `✓ Connected today${kind ? ' · ' + kind.label : ''}` : 'Connected today');
  btnTouch.type = 'button';
  btnTouch.onclick = () => howDialog(p.id);
  bar.append(btnTouch);

  /* The toast's offer is gone in a few seconds. This one stays as long as the
     check-in is still today's, for the mistake noticed later in the evening. */
  if (connectedToday) {
    const undo = el('button', 'link-btn', 'undo');
    undo.type = 'button';
    undo.setAttribute('aria-label', `Undo today's check-in with ${p.name}`);
    undo.onclick = () => undoConnected(p.id);
    bar.append(undo);
  }
  root.append(bar);

  /* ── medical: only for the people you are carrying that way ── */
  if (isMedical(p)) {
    root.append(healthBlock(p, 'medications'), healthBlock(p, 'conditions'));
  }

  /* ── right now: seasons ── */
  const snBlock = el('div', 'sheet-block');
  snBlock.append(blockHead('Right now', '+ start a season', () => eventDialog(p.id, null, 'season')));
  if (seasons.length) {
    seasons.sort((a, b) => (a.date < b.date ? 1 : -1)).forEach(sn => {
      const card = el('div', 'season-card');
      const top = el('div', 'season-top');
      const h = el('h4', null, sn.title);
      h.title = 'Edit this season';
      h.onclick = () => eventDialog(p.id, sn.id);
      top.append(h, el('span', 'since', `since ${monthYear(sn.date)} · ${agoWords(sn.date).replace(' ago', '')}`));
      card.append(top);
      if (sn.note) card.append(el('p', 'tl-note', sn.note));
      const endBtn = el('button', 'btn btn-quiet btn-tiny season-end', 'this has ended');
      endBtn.type = 'button';
      endBtn.onclick = () => endSeason(p.id, sn.id);
      card.append(endBtn);
      snBlock.append(card);
    });
  } else {
    snBlock.append(el('p', 'quiet-note', 'Not in any season you have noted — grief, treatment, a new baby, a hard stretch at work.'));
  }
  root.append(snBlock);

  /* ── summary ── */
  const sumBlock = el('div', 'sheet-block');
  const sumHead = el('div', 'block-head');
  sumHead.append(el('h3', null, 'Who they are'));
  const flash = el('span', 'saved-flash', 'saved');
  flash.setAttribute('aria-hidden', 'true');
  sumHead.append(flash);
  sumBlock.append(sumHead);

  const ta = el('textarea', 'summary-area');
  ta.value = p.summary;
  ta.placeholder = 'What matters about them right now — what they are carrying, what they love, what you keep forgetting to ask about.';
  ta.setAttribute('aria-label', 'Summary');
  let flashTimer;
  ta.oninput = () => {
    byId(p.id).summary = ta.value;
    queueSave();
    flash.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flash.classList.remove('show'), 1400);
  };
  sumBlock.append(ta);
  root.append(sumBlock);

  /* ── prayers ── */
  const prBlock = el('div', 'sheet-block');
  prBlock.append(blockHead('Prayer list'));

  const open = openPrayers(p).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  if (open.length) open.forEach(pr => prBlock.append(prayerLine(p, pr, 'open')));
  else prBlock.append(el('p', 'quiet-note', 'Nothing on the list yet.'));

  const addPrayer = el('form', 'add-line');
  const prInput = el('input');
  prInput.placeholder = 'Add something to pray for…';
  prInput.maxLength = 240;
  prInput.setAttribute('aria-label', 'Add a prayer');
  const prBtn = el('button', 'btn btn-quiet', 'Add');
  prBtn.type = 'submit';
  addPrayer.append(prInput, prBtn);
  addPrayer.onsubmit = e => {
    e.preventDefault();
    const text = prInput.value.trim();
    if (!text) return;
    byId(p.id).prayers.push(normalisePrayer({ text }));
    prInput.value = '';
    queueSave();
    renderAll();
    setTimeout(() => $('.add-line input', $('#sheet-scroll'))?.focus(), 30);
  };
  prBlock.append(addPrayer);

  /* Both archives, each tucked away and each still reachable. */
  const archive = (list, sortKey, state, word) => {
    if (!list.length) return;
    const det = el('details', 'answered');
    const sm = el('summary');
    sm.append(document.createTextNode(`${list.length} ${word}`));
    det.append(sm);
    [...list].sort((a, b) => (a[sortKey] < b[sortKey] ? 1 : -1))
      .forEach(pr => det.append(prayerLine(p, pr, state)));
    prBlock.append(det);
  };
  archive(answeredPrayers(p), 'answeredAt', 'answered', 'answered');
  archive(releasedPrayers(p), 'releasedAt', 'released', 'let go');
  root.append(prBlock);

  /* ── coming up ── */
  const upBlock = el('div', 'sheet-block');
  upBlock.append(blockHead('Coming up', '+ add a date', () => eventDialog(p.id, null, 'upcoming')));
  const ups = upcomingOf(p);
  if (ups.length) {
    ups.forEach(({ r, o }) => {
      const past = o.inDays < 0;
      const item = el('div', 'up-item' + (past ? ' is-past' : o.inDays <= 14 ? ' is-near' : ''));

      const when = el('div', 'up-when');
      when.append(el('span', 'd', String(parseYmd(o.date).getDate())), el('span', 'm', shortMonth(o.date)));
      item.append(when);

      const bodyBox = el('div', 'up-body');
      const h = el('h4', null, r.title);
      h.title = 'Edit this';
      h.onclick = () => eventDialog(p.id, r.id);
      bodyBox.append(h);

      const meta = el('div');
      /* A due date is read from the other end: how far along they are now
         matters more than how many weeks are left. */
      const g = isBaby(r) ? gestationOn(o.date) : null;
      if (g) meta.append(el('span', 'up-gest', gestationWords(g) + ' · '));
      meta.append(el('span', 'up-count' + (past ? ' is-past' : ''),
        past ? `was ${agoWords(o.date)}` : g ? `due ${aheadWords(o.inDays)}` : aheadWords(o.inDays)));
      if (r.repeatsYearly) meta.append(el('span', 'up-repeat', ' · every year'));
      bodyBox.append(meta);

      if (r.note) bodyBox.append(el('p', 'tl-note', r.note));

      if (past && !r.repeatsYearly) {
        const mv = el('button', 'link-btn', 'move to history');
        mv.type = 'button';
        mv.style.marginTop = '.4rem';
        mv.onclick = () => moveToHistory(p.id, r.id);
        bodyBox.append(mv);
      }
      item.append(bodyBox);
      upBlock.append(item);
    });
  } else {
    upBlock.append(el('p', 'quiet-note', 'Nothing on the calendar — appointments, a surgery date, an anniversary.'));
  }
  root.append(upBlock);

  /* ── history ── */
  const evBlock = el('div', 'sheet-block');
  evBlock.append(blockHead('History', '+ add to history', () => eventDialog(p.id, null, 'history')));

  const hist = historyOf(p);
  if (hist.length) {
    const tl = el('div', 'timeline');
    [...hist].sort((a, b) => (a.date < b.date ? 1 : -1)).forEach(ev => {
      const item = el('div', 'tl-item');
      item.dataset.kind = ev.kind || 'other';
      const kind = KINDS[ev.kind] || KINDS.other;
      const wasSeason = ev.type === 'season';

      const d = el('div', 'tl-date');
      d.append(el('span', 'glyph', kind.glyph));
      d.append(document.createTextNode(wasSeason
        ? `${monthYear(ev.date)} – ${monthYear(ev.endDate)}`
        : prettyDate(ev.date)));
      if (wasSeason) d.append(el('span', 'was-season', 'season'));
      item.append(d);

      const t = el('h4', 'tl-title', ev.title);
      t.title = 'Edit this';
      t.onclick = () => eventDialog(p.id, ev.id);
      item.append(t);
      if (ev.note) item.append(el('p', 'tl-note', ev.note));
      tl.append(item);
    });
    evBlock.append(tl);
  } else {
    evBlock.append(el('p', 'quiet-note', 'Nothing recorded yet — births, diagnoses, new jobs, moves, losses, wins.'));
  }
  root.append(evBlock);
}

/* ─────────────────────────── mutations ─────────────────────── */

/* One check-in a day, and the last word on how it happened wins — saying
   coffee this evening corrects this morning's WhatsApp rather than adding to
   it. That keeps a day to one row, which is what the sync's person-and-date
   key has always assumed. */
function markConnected(id, kind = '') {
  const p = byId(id);
  if (!p) return;

  const existing = touchOn(p, today());
  if (existing) {
    if (existing.kind === kind) return;
    existing.kind = kind;
  } else {
    p.touches.push({ date: today(), kind });
    if (p.touches.length > MAX_TOUCHES) p.touches = p.touches.slice(-MAX_TOUCHES);
  }

  queueSave();
  renderAll();
  const how = TOUCH_KINDS[kind] ? ` by ${TOUCH_KINDS[kind].label.toLowerCase()}` : '';
  toast(`Noted — you connected with ${p.name.split(' ')[0]} today${how}`,
    { label: 'Undo', run: () => undoConnected(id) });
}

/* The other half of it, for the tap you did not mean. Only today's is taken
   back: an older check-in has become part of the history rather than a slip
   of a moment ago, and quietly dropping one would be a different thing. */
function undoConnected(id) {
  const p = byId(id);
  if (!p || lastTouchDate(p) !== today()) return;
  p.touches = p.touches.filter(t => t.date !== today());
  queueSave();
  renderAll();
  toast(`Taken back — nothing noted with ${p.name.split(' ')[0]} today`);
}

/* ── how you connected ─────────────────────────────────────────── */

let howPersonId = null;

function howDialog(id) {
  const p = byId(id);
  if (!p) return;
  howPersonId = id;

  const current = touchOn(p, today())?.kind || '';
  $('#dlg-how-title').textContent = `How did you connect with ${p.name.split(' ')[0]}?`;
  /* Every option records either way. Only the jumping-off part needs a
     number, so that is the only part the hint promises. */
  $('#how-hint').textContent = dialNumber(p.contact)
    ? 'WhatsApp and a call will take you straight there.'
    : 'No number saved for them, so these only make a note.';

  const pick = $('#how-pick');
  pick.textContent = '';
  Object.entries(TOUCH_KINDS).forEach(([key, v]) => {
    const b = el('button', 'type-opt' + (key === current ? ' is-on' : ''));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(key === current));
    b.append(el('span', 'glyph', v.glyph), el('span', null, v.label));
    b.onclick = () => chooseHow(key);
    pick.append(b);
  });

  $('#dlg-how').showModal();
}

/* The note is made before leaving, so it survives whether or not you come
   back — the app cannot watch you send the message, and waiting to be told
   would mean losing the check-in every time you got distracted. */
function chooseHow(kind) {
  const p = byId(howPersonId);
  if (!p) return;
  const dial = dialNumber(p.contact);
  markConnected(p.id, kind);
  $('#dlg-how').close();
  if (kind === 'whatsapp' && dial) openOut(waLink(dial));
  if (kind === 'call' && dial) openOut(telLink(dial));
}

function openOut(href) {
  const a = el('a');
  a.href = href;
  /* tel: is handed to the phone and never yields a window to secure. wa.me is
     a real navigation, so it leaves in its own tab. */
  if (href.startsWith('http')) { a.target = '_blank'; a.rel = 'noopener'; }
  document.body.append(a);
  a.click();
  a.remove();
}

function endSeason(personId, recId) {
  const r = byId(personId)?.events.find(x => x.id === recId);
  if (!r) return;
  r.endDate = today();
  queueSave();
  renderAll();
  toast('Moved to their history');
}

function moveToHistory(personId, recId) {
  const r = byId(personId)?.events.find(x => x.id === recId);
  if (!r) return;
  r.type = 'history';
  r.repeatsYearly = false;
  queueSave();
  renderAll();
}

const prayerBy = (personId, prayerId) => byId(personId)?.prayers.find(x => x.id === prayerId) || null;

/* One tick a day, and tapping it again takes it back — the same shape as a
   check-in, and for the same reason: the thing being recorded is the day,
   not the number of times you touched the screen. */
function togglePrayed(personId, prayerId) {
  const pr = prayerBy(personId, prayerId);
  if (!pr) return;
  pr.prayedAt = pr.prayedAt === today() ? '' : today();
  queueSave();
  renderAll();
}

/* Out of either archive and back onto the list. */
function reopenPrayer(personId, prayerId) {
  const pr = prayerBy(personId, prayerId);
  if (!pr) return;
  pr.answeredAt = null;
  pr.answerNote = '';
  pr.releasedAt = '';
  queueSave();
  renderAll();
}

function answerPrayer(personId, prayerId, note) {
  const pr = prayerBy(personId, prayerId);
  if (!pr) return;
  pr.answeredAt = today();
  pr.answerNote = note;
  pr.releasedAt = '';
  queueSave();
  renderAll();
  toast('Marked answered ✧');
}

/* Let go rather than answered. Nothing is lost — it moves to its own list,
   the way an answered one does, and the tick there brings it back. */
function releasePrayer(personId, prayerId) {
  const pr = prayerBy(personId, prayerId);
  if (!pr) return;
  pr.releasedAt = today();
  pr.answeredAt = null;
  pr.answerNote = '';
  queueSave();
  renderAll();
  toast('Let go — it is still in your list of released', {
    label: 'Undo',
    run: () => reopenPrayer(personId, prayerId),
  });
}

function deletePrayer(personId, prayerId) {
  const target = byId(personId);
  if (!target) return;
  target.prayers = target.prayers.filter(x => x.id !== prayerId);
  queueSave();
  renderAll();
}

/* ─────────────────────────── dialogs ───────────────────────── */

let editingPersonId = null;
let pendingPhoto = undefined;    // undefined = untouched, null = cleared, string = new
let pendingOriginal = undefined; // the same three states, for the uncropped picture

function personDialog(p) {
  editingPersonId = p ? p.id : null;
  pendingPhoto = undefined;
  pendingOriginal = undefined;

  $('#dlg-person-title').textContent = p ? 'Edit details' : 'Someone new';
  $('#f-name').value = p?.name || '';
  $('#f-relationship').value = p?.relationship || '';
  paintGroupPick(p?.groups || []);
  $('#f-birthday').value = p?.birthday || '';
  $('#f-contact').value = p?.contact || '';
  $('#f-cadence').value = String(p ? p.cadenceDays : 30);
  $('#btn-delete-person').hidden = !p;
  /* Only offered for someone new — editing is where you correct a name, not
     overwrite it from elsewhere. */
  $('#contact-pick').hidden = !!p || !canPickContacts();
  $('#photo-input').value = '';

  paintPhotoPreview(p && photos[p.id] ? photos[p.id] : null, p?.name || '');
  $('#dlg-person').showModal();
  setTimeout(() => $('#f-name').focus(), 60);
}

function paintGroupPick(groups) {
  $$('#f-groups .chip').forEach(b => {
    const on = groups.includes(b.dataset.group);
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

const readGroupPick = () =>
  $$('#f-groups .chip').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.group);

function paintPhotoPreview(dataUrl, name) {
  const box = $('#photo-preview');
  box.textContent = '';
  if (dataUrl) {
    const img = el('img');
    img.src = dataUrl;
    img.alt = '';
    box.append(img);
  } else {
    box.append(el('span', null, initialsOf(name)));
  }
  $('#photo-clear').hidden = !dataUrl;
  $('#photo-adjust').hidden = !dataUrl;
}

/* ─────────────── filling someone in from a contact ──────────────
   Chrome on Android is the only browser that has a contact picker, and
   what it offers is narrower than it sounds: Android shows its own
   chooser, you tap who to share, and only those people come back. There
   is no reading the address book, which is the right shape here anyway —
   these are people you add on purpose, not a list to import. */

const canPickContacts = () => 'contacts' in navigator && 'ContactsManager' in window;

/* +27 82 445 1120 and 082 445 1120 are the same phone. Comparing the last
   nine digits gets that right without pretending to understand dialling
   codes, and an address in the contact field reduces to nothing rather
   than matching everyone else who left theirs blank. */
const telKey = s => (s || '').replace(/\D/g, '').slice(-9);

/* telKey compares two numbers. This one has to be able to ring one, which
   means keeping the country code telKey throws away on purpose — so they
   cannot be the same function. The field is labelled "phone or handle", and
   most of the work here is deciding that what is in it is not a number. */
const countryCode = () => (Store.getPref('countryCode', '27').replace(/\D/g, '') || '27');

function dialNumber(contact) {
  const raw = (contact || '').trim();
  if (!raw || raw.includes('@')) return '';       // an address, not a number
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return '';               // a handle, or too little to ring
  if (raw.startsWith('+')) return digits;         // already carries its country code
  if (digits.startsWith('0')) return countryCode() + digits.slice(1);
  return digits;
}

/* wa.me rather than whatsapp:// — WhatsApp claims it, so inside the Android
   app it opens the chat, and on a machine without WhatsApp it is still a page
   that works rather than a link that quietly does nothing. */
const waLink = n => `https://wa.me/${n}`;
const telLink = n => `tel:+${n}`;

function matchExisting(name, tel) {
  const key = telKey(tel);
  if (key.length >= 7) {
    const byTel = people.find(p => telKey(p.contact) === key);
    if (byTel) return { person: byTel, on: 'number' };
  }
  const n = name.trim().toLowerCase();
  const byName = n ? people.find(p => p.name.trim().toLowerCase() === n) : null;
  return byName ? { person: byName, on: 'name' } : null;
}

async function fillFromContact() {
  let picked;
  /* select() has to be the first thing the tap reaches — anything awaited
     before it spends the user gesture it needs. */
  try {
    [picked] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
  } catch {
    toast('Could not open your contacts');
    return;
  }
  if (!picked) return;   // closed the chooser without picking anyone

  const name = (picked.name || []).find(Boolean) || '';
  const tel = (picked.tel || []).find(Boolean) || '';
  const hit = matchExisting(name, tel);

  /* The same number is proof it is the same person, so open them instead of
     starting a second copy. A shared name is only a hint — say so, and leave
     the judgement where it belongs. */
  if (hit && hit.on === 'number') {
    $('#dlg-person').close();
    personDialog(hit.person);
    toast(`${hit.person.name.split(' ')[0]} is already in your circle`);
    return;
  }

  if (name) $('#f-name').value = name;
  if (tel) $('#f-contact').value = tel;
  if (hit) toast(`There is already a ${hit.person.name} in your circle`);
}

/* ─────────────────────────── the cropper ───────────────────────
   The stage is a square window onto the picture. The picture is sized so
   that at zoom 1 its shorter edge exactly fills the stage, then slid
   behind it. What the window frames is what renderCrop() cuts out, so
   the circle in the dialog is not a preview of the badge — it is the badge.
   ──────────────────────────────────────────────────────────────── */

let cropping = null;   // { img, view, onDone }

function cropGeometry() {
  const { img, view } = cropping;
  const stage = $('#crop-stage');
  const S = stage.clientWidth;
  const base = S / Math.min(img.naturalWidth, img.naturalHeight);
  const z = clamp(view.scale, 1, MAX_ZOOM);
  const dispW = img.naturalWidth * base * z;
  const dispH = img.naturalHeight * base * z;
  return {
    S, dispW, dispH, z,
    tx: clamp(S / 2 - view.cx * dispW, S - dispW, 0),
    ty: clamp(S / 2 - view.cy * dispH, S - dispH, 0),
  };
}

function paintCrop() {
  if (!cropping) return;
  const g = cropGeometry();
  if (!g.S) return;

  /* fold the clamping back into the view, so dragging into a corner and
     then zooming does not spring the picture somewhere unexpected */
  cropping.view.scale = g.z;
  cropping.view.cx = (g.S / 2 - g.tx) / g.dispW;
  cropping.view.cy = (g.S / 2 - g.ty) / g.dispH;

  const img = $('#crop-img');
  img.style.width = g.dispW + 'px';
  img.style.height = g.dispH + 'px';
  img.style.transform = `translate(${g.tx}px, ${g.ty}px)`;
  $('#crop-zoom').value = String(Math.round(g.z * 100));
}

/* zoom while holding whatever is under (px, py) still — so you can put a
   face under your finger and grow it, rather than chasing it off-screen */
function zoomCropAt(nextScale, px, py) {
  const g = cropGeometry();
  const fx = (px - g.tx) / g.dispW;
  const fy = (py - g.ty) / g.dispH;
  const z = clamp(nextScale, 1, MAX_ZOOM);
  const ratio = z / g.z;
  cropping.view.scale = z;
  cropping.view.cx = fx + (g.S / 2 - px) / (g.dispW * ratio);
  cropping.view.cy = fy + (g.S / 2 - py) / (g.dispH * ratio);
  paintCrop();
}

async function openCropper(src, view, onDone) {
  let img;
  try { img = await loadImage(src); }
  catch (err) { return toast(err.message || 'Could not use that image'); }

  cropping = { img, view: { ...DEFAULT_VIEW, ...view }, onDone };
  $('#crop-img').src = src;
  $('#dlg-crop').showModal();
  paintCrop();   // the stage only has a width once it is open, and now it is
}

function closeCropper() {
  cropping = null;
  $('#crop-img').removeAttribute('src');
  $('#dlg-crop').close();
}

function wireCropper() {
  const stage = $('#crop-stage');
  const pointers = new Map();
  let pinchFrom = null;

  const stagePoint = e => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  stage.addEventListener('pointerdown', e => {
    if (!cropping) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, stagePoint(e));
    if (pointers.size === 2) pinchFrom = { ...spread(), scale: cropping.view.scale };
  });

  stage.addEventListener('pointermove', e => {
    if (!cropping || !pointers.has(e.pointerId)) return;
    const was = pointers.get(e.pointerId);
    const now = stagePoint(e);
    pointers.set(e.pointerId, now);

    if (pointers.size === 2 && pinchFrom) {
      const { dist, mid } = spread();
      if (pinchFrom.dist > 0) zoomCropAt(pinchFrom.scale * (dist / pinchFrom.dist), mid.x, mid.y);
      return;
    }
    const g = cropGeometry();
    cropping.view.cx -= (now.x - was.x) / g.dispW;
    cropping.view.cy -= (now.y - was.y) / g.dispH;
    paintCrop();
  });

  const release = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchFrom = null;
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  /* the same nudge, without a pointer — and +/- to zoom, since the slider
     is a tab away */
  const KEYS = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  stage.addEventListener('keydown', e => {
    if (!cropping) return;
    if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault();
      const g = cropGeometry();
      zoomCropAt(cropping.view.scale * (e.key === '-' ? 1 / 1.12 : 1.12), g.S / 2, g.S / 2);
      return;
    }
    const step = KEYS[e.key];
    if (!step) return;
    e.preventDefault();
    const g = cropGeometry();
    const by = e.shiftKey ? 40 : 12;
    cropping.view.cx -= (step[0] * by) / g.dispW;
    cropping.view.cy -= (step[1] * by) / g.dispH;
    paintCrop();
  });

  stage.addEventListener('wheel', e => {
    if (!cropping) return;
    e.preventDefault();
    const p = stagePoint(e);
    zoomCropAt(cropping.view.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), p.x, p.y);
  }, { passive: false });

  $('#crop-zoom').oninput = e => {
    if (!cropping) return;
    const g = cropGeometry();
    zoomCropAt(Number(e.target.value) / 100, g.S / 2, g.S / 2);
  };

  $('#btn-crop-reset').onclick = () => {
    if (!cropping) return;
    cropping.view = { ...DEFAULT_VIEW };
    paintCrop();
  };

  $('#btn-crop-cancel').onclick = closeCropper;
  $('#dlg-crop').addEventListener('close', () => { cropping = null; });

  $('#form-crop').onsubmit = e => {
    e.preventDefault();
    if (!cropping) return;
    const { img, view, onDone } = cropping;
    const cropped = renderCrop(img, view);
    closeCropper();
    onDone(cropped, { ...view });
  };

  window.addEventListener('resize', () => { if (cropping) paintCrop(); });
}

/* Picking a photo and moving an existing one land in the same place: crop,
   then hold on to the uncropped picture so the focus can be moved again. */
async function pickPhoto(file) {
  try {
    const img = await loadImage(await readImage(file));
    const src = downscale(img);
    openCropper(src, DEFAULT_VIEW, (cropped, view) => {
      pendingPhoto = cropped;
      pendingOriginal = { src, view };
      paintPhotoPreview(cropped, $('#f-name').value);
    });
  } catch (err) {
    toast(err.message || 'Could not use that image');
  }
}

async function adjustPhoto() {
  const stored = pendingOriginal !== undefined
    ? pendingOriginal
    : (editingPersonId ? await Store.loadOriginal(editingPersonId) : null);

  /* No original kept — photos from before this existed, or a browser with
     no room for them. The square is still worth cropping into. */
  const shown = $('#photo-preview img')?.src;
  const src = stored?.src || shown;
  if (!src) return;

  openCropper(src, stored?.src ? stored.view : DEFAULT_VIEW, (cropped, view) => {
    pendingPhoto = cropped;
    pendingOriginal = { src, view };
    paintPhotoPreview(cropped, $('#f-name').value);
  });
}

async function savePerson(e) {
  e.preventDefault();
  const name = $('#f-name').value.trim();
  if (!name) return;

  const data = {
    name,
    relationship: $('#f-relationship').value,
    groups: readGroupPick(),
    birthday: $('#f-birthday').value,
    contact: $('#f-contact').value,
    cadenceDays: Number($('#f-cadence').value),
  };

  const isNew = !editingPersonId;
  let target;
  if (editingPersonId) {
    target = byId(editingPersonId);
    Object.assign(target, normalise({ ...target, ...data }));
  } else {
    target = normalise(data);
    people.push(target);
  }

  if (pendingPhoto === null) {
    delete photos[target.id];
    await Store.deletePhoto(target.id);
    await Store.deleteOriginal(target.id);
  } else if (typeof pendingPhoto === 'string') {
    photos[target.id] = pendingPhoto;
    await Store.savePhoto(target.id, pendingPhoto);
    if (pendingOriginal) await Store.saveOriginal(target.id, pendingOriginal);
  }

  await Store.savePeople(people);
  notifyMutate();
  $('#dlg-person').close();
  renderAll();
  // a person's page opens only when their photo is tapped
  if (isNew) toast(`${name.split(' ')[0]} is in your circle — tap their photo to add more`);
}

/* one dialog, three shapes */
let editingEvent = { personId: null, eventId: null, type: 'history' };

function setEventType(type) {
  editingEvent.type = TYPES[type] ? type : 'history';
  const t = TYPES[editingEvent.type];

  $$('.type-opt').forEach(b => {
    const on = b.dataset.type === editingEvent.type;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', String(on));
  });

  $('#type-hint').textContent = t.hint;
  $('#e-title-label').textContent = t.titleLabel;
  $('#e-title').placeholder = t.placeholder;
  $('#wrap-end').hidden = editingEvent.type !== 'season';
  $('#wrap-repeat').hidden = editingEvent.type !== 'upcoming';
  paintBabyFields();
}

/* A due date can be arrived at from either end: you either know the date, or
   you know how far along they are today. Filling in one works out the other,
   so whichever the person actually told you is the one you type. The kind can
   change without the type changing, so this is called from both. */
function paintBabyFields() {
  const t = TYPES[editingEvent.type];
  const baby = editingEvent.type === 'upcoming' && $('#e-kind').value === 'baby';

  $('#wrap-gestation').hidden = !baby;
  $('#wrap-repeat').hidden = editingEvent.type !== 'upcoming' || baby;
  $('#e-date-label').textContent = baby ? 'Due date' : t.dateLabel;
  if (baby) {
    $('#e-title').placeholder = 'A baby on the way';
    /* The title is required, and for this one kind there is an obvious answer.
       Filling it in means a due date alone is enough to save. */
    if (!$('#e-title').value.trim()) $('#e-title').value = 'A baby on the way';
    paintGestationFrom($('#e-date').value);
  }
}

function paintGestationFrom(dateStr) {
  const g = dateStr ? gestationOn(dateStr) : null;
  $('#e-weeks').value = g ? g.weeks : '';
  $('#e-days').value = g ? g.rem : '';
  $('#gestation-now').textContent = g
    ? `${gestationWords(g)} today`
    : dateStr ? 'outside the forty weeks a due date is counted over' : '';
}

function eventDialog(personId, eventId, presetType) {
  const rec = eventId ? byId(personId)?.events.find(x => x.id === eventId) : null;
  editingEvent = { personId, eventId, type: rec?.type || presetType || 'history' };

  $('#dlg-event-title').textContent = rec ? 'Edit this' : TYPES[editingEvent.type].dlgTitle;
  $('#e-date').value = rec?.date || today();
  $('#e-end').value = rec?.endDate || '';
  $('#e-kind').value = rec?.kind || 'other';
  $('#e-title').value = rec?.title || '';
  $('#e-note').value = rec?.note || '';
  $('#e-repeat').checked = !!rec?.repeatsYearly;
  $('#btn-delete-event').hidden = !rec;

  setEventType(editingEvent.type);   // paints the gestation fields too
  $('#dlg-event').showModal();
  setTimeout(() => $('#e-title').focus(), 60);
}

function saveEvent(e) {
  e.preventDefault();
  const p = byId(editingEvent.personId);
  if (!p) return;

  const title = $('#e-title').value.trim();
  if (!title) return;

  const data = normaliseRecord({
    id: editingEvent.eventId || uid(),
    type: editingEvent.type,
    date: $('#e-date').value || today(),
    endDate: $('#e-end').value,
    kind: $('#e-kind').value,
    title,
    note: $('#e-note').value.trim(),
    repeatsYearly: $('#e-repeat').checked,
  });

  if (editingEvent.eventId) {
    const rec = p.events.find(x => x.id === editingEvent.eventId);
    Object.assign(rec, data);
  } else {
    p.events.push(data);
  }
  queueSave();
  $('#dlg-event').close();
  renderAll();
}

/* one dialog, two lists */
let editingHealth = { personId: null, key: 'medications', id: null };

function healthDialog(personId, key, id) {
  const meta = HEALTH[key];
  const item = id ? byId(personId)?.[key].find(x => x.id === id) : null;
  editingHealth = { personId, key, id };

  $('#dlg-health-title').textContent = item ? meta.editTitle : meta.newTitle;
  $('#h-name-label').textContent = meta.nameLabel;

  const detailLabel = $('#h-detail-label');
  detailLabel.textContent = meta.detailLabel + ' ';
  detailLabel.append(el('em', null, 'optional'));

  $('#h-name').value = item?.name || '';
  $('#h-name').placeholder = meta.namePlaceholder;
  $('#h-detail').value = item?.detail || '';
  $('#h-detail').placeholder = meta.detailPlaceholder;
  $('#btn-delete-health').hidden = !item;

  $('#dlg-health').showModal();
  setTimeout(() => $('#h-name').focus(), 60);
}

function saveHealth(e) {
  e.preventDefault();
  const { personId, key, id } = editingHealth;
  const p = byId(personId);
  if (!p) return;

  const name = $('#h-name').value.trim();
  if (!name) return;
  const detail = $('#h-detail').value.trim();

  if (id) {
    const item = p[key].find(x => x.id === id);
    if (item) Object.assign(item, normaliseHealth({ ...item, name, detail }));
  } else {
    p[key].push(normaliseHealth({ name, detail }));
  }
  queueSave();
  $('#dlg-health').close();
  renderAll();
}

/* Taking something off the list is three different acts wearing one gesture,
   so the dialog asks which. Answered keeps the story; let go keeps the fact
   that you carried it; remove is for the one you typed by mistake. */
let releasing = { personId: null, prayerId: null };

function askRelease(personId, prayerId, text) {
  releasing = { personId, prayerId };
  $('#release-lede').textContent = '“' + text + '”';
  $('#a-note').value = '';
  $('#dlg-release').showModal();
  setTimeout(() => $('#a-note').focus(), 60);
}

function saveAnswered(e) {
  e.preventDefault();
  answerPrayer(releasing.personId, releasing.prayerId, $('#a-note').value.trim());
  $('#dlg-release').close();
}

function saveReleased() {
  releasePrayer(releasing.personId, releasing.prayerId);
  $('#dlg-release').close();
}

function saveRemoved() {
  const pr = prayerBy(releasing.personId, releasing.prayerId);
  if (pr && !confirm(`Remove “${pr.text}” altogether? Letting it go keeps it; this does not.`)) return;
  deletePrayer(releasing.personId, releasing.prayerId);
  $('#dlg-release').close();
}

/* ─────────────────────────── backup ───────────────────────── */

async function exportAll() {
  const payload = {
    app: 'kindred',
    version: 3,
    exportedAt: new Date().toISOString(),
    people,
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
    const existing = people.find(p => p.name.toLowerCase() === incoming.name.toLowerCase());
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
      people.push(incoming);
      if (data.photos?.[raw.id]) {
        photos[incoming.id] = data.photos[raw.id];
        await Store.savePhoto(incoming.id, data.photos[raw.id]);
      }
      added++;
    }
  }
  await Store.savePeople(people);
  notifyMutate();
  renderAll();
  toast(`${added} added, ${merged} merged`);
}

/* ─────────────────────────── reminders ─────────────────────── */

function paintNotifState() {
  const btn = $('#btn-notif');
  const txt = $('#notif-state');
  if (!('Notification' in window)) {
    txt.textContent = 'This browser cannot show notifications. The Today tab still keeps count.';
    btn.hidden = true;
    return;
  }
  const perm = Notification.permission;
  btn.hidden = perm !== 'default';
  txt.textContent = perm === 'granted'
    ? 'On — when you open Fellowship, it will nudge you once a day about anyone overdue, any date landing today, and a baby due soon.'
    : perm === 'denied'
      ? 'Blocked in your browser settings. The Today tab still keeps count.'
      : 'Get a nudge when someone is overdue. Fires when you open the app.';
}

async function enableNotifications() {
  try {
    const perm = await Notification.requestPermission();
    paintNotifState();
    if (perm === 'granted') { Store.setPref('notified', ''); nudgeIfDue(); }
  } catch { paintNotifState(); }
}

/* A pregnancy is worth saying something about more than once, but not every
   day for nine months. These are the distances that mean something: a month
   out, then closing, then daily once it is near enough to happen any morning.

   The honest limit is the same as the rest of the reminders — this fires when
   you open Fellowship, not while your phone is in your pocket. */
const BABY_MARKS = [28, 21, 14, 10];

const babiesSpeakingToday = () =>
  babiesDue(28).filter(({ inDays }) => inDays <= 7 || BABY_MARKS.includes(inDays));

function nudgeIfDue() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (Store.getPref('notified') === today()) return;

  const due = dueList();
  const landing = datesAhead(0).filter(x => x.inDays === 0);
  const babies = babiesSpeakingToday();
  if (!due.length && !landing.length && !babies.length) return;

  const lines = [];
  if (landing.length) lines.push(landing.map(x => `${x.p.name} — ${x.label}`).join(' · '));
  babies.forEach(({ p, inDays, gestation }) => lines.push(
    `${p.name}'s baby — ${gestation ? gestationWords(gestation) + ', ' : ''}`
    + (inDays < 0 ? `${-inDays} days past the due date` : inDays === 0 ? 'due today' : `due in ${plural(inDays, 'day', 'days')}`)));
  if (due.length) {
    const names = due.slice(0, 3).map(x => x.p.name.split(' ')[0]).join(', ');
    lines.push('Overdue: ' + names + (due.length > 3 ? ` and ${due.length - 3} more` : ''));
  }

  try {
    const n = new Notification(landing.length || babies.length ? 'Something today' : 'Someone is on your mind', {
      body: lines.join(' — '),
      icon: 'icon-192.png',
      tag: 'kindred-daily',
    });
    n.onclick = () => { window.focus(); switchView('today'); };
    Store.setPref('notified', today());
  } catch { /* some browsers require a service worker */ }
}

/* ═══════════════════════════ THE LOCK ════════════════════
   A PIN in front of the circle, and this device's fingerprint or face
   in front of the PIN where there is one.

   What it is, honestly: a lock on the door, not encryption of what is
   behind it. There is no server to check anything against, so the PIN is
   hashed and compared here, and the fingerprint is the device telling us
   it verified the person standing in front of it. Someone determined,
   with the phone already unlocked and developer tools open, can still
   reach the browser's storage. What this stops is the person who picks
   up your phone — which is the risk that actually exists for a circle
   holding diagnoses, prayers and life histories.

   All of it stays on the device: the lock is not part of your account,
   is never synced, and is not in a backup. Locking the phone does not
   lock the PC. */

const LOCK_GRACE = 2 * 60 * 1000;   // away longer than this and it asks again
const PIN_MIN = 4;
const PIN_MAX = 8;
const PIN_ITER = 150000;
const LOCK_TRIES = 5;               // wrong PINs before it makes you wait
const LOCK_PAUSE = 30000;

/* PBKDF2 needs crypto.subtle, which needs a secure context: the live site,
   the installed app, localhost and a file opened straight off the disk all
   qualify. The http://192.168… address does not — the same reason it has no
   service worker. Saying so is better than offering a lock that cannot hash. */
const canLock = () => !!(window.isSecureContext && window.crypto?.subtle);

/* WebAuthn is stricter still and wants a real https origin, so a file opened
   off the disk can have a PIN but not a fingerprint. */
const bioOrigin = () =>
  canLock() && !!window.PublicKeyCredential &&
  (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname));

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const lockRecord = () => {
  try { return JSON.parse(Store.getPref('lock', 'null')); } catch { return null; }
};
const hasPin = () => !!lockRecord();
const bioCredential = () => Store.getPref('lockBio', '');

/* sync.js is optional — the app runs unchanged without it — so never
   assume it is there. */
const syncEmail = () => {
  try { return window.KindredSync?.Session?.user?.email || null; } catch { return null; }
};

let bioReady = false;   // this device can actually verify a person
async function checkBio() {
  if (!bioOrigin()) return (bioReady = false);
  try { bioReady = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch { bioReady = false; }
  return bioReady;
}

async function pinHash(pin, salt, iter = PIN_ITER) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}

async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  Store.setPref('lock', JSON.stringify({
    v: 1,
    salt: b64(salt),
    hash: await pinHash(pin, salt),
    iter: PIN_ITER,
    /* How many digits, so the lock screen can let itself in as the last one
       lands. A PIN's length is not a secret worth an extra tap. */
    len: pin.length,
    email: syncEmail(),
  }));
}

async function pinMatches(pin) {
  const rec = lockRecord();
  if (!rec || !canLock()) return false;
  try { return (await pinHash(pin, unb64(rec.salt), rec.iter)) === rec.hash; }
  catch { return false; }
}

function clearLock() {
  Store.setPref('lock', 'null');
  Store.setPref('lockBio', '');
}

/* ── the fingerprint ── */

async function enrolBio() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Fellowship', id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: syncEmail() || 'kindred',
        displayName: 'Fellowship',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',   // this device's own sensor, never a key on a fob
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!cred) throw new Error('nothing registered');
  Store.setPref('lockBio', b64(cred.rawId));
}

async function askBio() {
  const id = bioCredential();
  if (!id) return false;
  const got = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return !!got;
}

/* ── the lock screen ── */

let locked = false;
let hiddenAt = Date.now();
let wrongTries = 0;
let pauseUntil = 0;
let pauseTimer = null;
let bioAsked = false;

function showLock() {
  if (locked || !hasPin()) return;
  locked = true;
  wrongTries = 0;
  pauseUntil = 0;
  bioAsked = false;

  $('#lock-pin').value = '';
  $('#lock-error').textContent = '';
  $('#lock-forgot-panel').hidden = true;
  $('#lock-bio').hidden = !bioCredential();
  paintLockPause();

  const dlg = $('#lock');
  if (!dlg.open) dlg.showModal();

  /* The fingerprint sheet and the keyboard both want the screen, so
     whichever is about to happen gets it to itself. */
  if (bioCredential()) tryBio(true);
  else setTimeout(() => $('#lock-pin').focus(), 60);
}

function unlock() {
  locked = false;
  clearTimeout(pauseTimer);
  hiddenAt = Date.now();
  $('#lock-pin').value = '';
  $('#lock-forgot-password').value = '';
  const dlg = $('#lock');
  if (dlg.open) dlg.close();
  renderAll();
  nudgeIfDue();   // held back while locked, so it lands now instead
}

async function tryBio(auto = false) {
  if (auto && bioAsked) return;
  bioAsked = true;
  try {
    if (await askBio()) return unlock();
  } catch { /* dismissed, or the browser wanted a tap of its own first */ }
  if (auto) setTimeout(() => $('#lock-pin').focus(), 60);
}

/* Five wrong and it pauses for half a minute. The count lives in memory
   only — this is a lock on a door, and pretending otherwise by hardening
   it against a patient attacker would be dressing up what it is. */
function paintLockPause() {
  clearTimeout(pauseTimer);
  const left = Math.max(0, Math.ceil((pauseUntil - Date.now()) / 1000));
  $('#lock-pin').disabled = left > 0;
  $('#lock-unlock').disabled = left > 0;
  if (left) {
    $('#lock-error').textContent = `Too many tries — ${left}s`;
    pauseTimer = setTimeout(paintLockPause, 1000);
  } else if (pauseUntil) {
    pauseUntil = 0;
    $('#lock-error').textContent = '';
    $('#lock-pin').focus();
  }
}

async function submitPin() {
  if (pauseUntil || !locked) return;
  const pin = $('#lock-pin').value;
  if (pin.length < PIN_MIN) return;

  if (await pinMatches(pin)) return unlock();

  $('#lock-pin').value = '';
  if (++wrongTries >= LOCK_TRIES) {
    wrongTries = 0;
    pauseUntil = Date.now() + LOCK_PAUSE;
    paintLockPause();
  } else {
    $('#lock-error').textContent = 'That is not the PIN';
  }
  const card = $('#lock-card');
  card.classList.remove('is-wrong');
  void card.offsetWidth;            // let the shake start again from nothing
  card.classList.add('is-wrong');
}

/* Signing in is the way back — but only as the account this device already
   belongs to. Any Fellowship account opening any phone would be no lock at all. */
function knownAccount() {
  return (syncEmail() || lockRecord()?.email || '').toLowerCase();
}

function paintForgot() {
  const can = !!(window.KindredSync && knownAccount());
  $('#form-lock-forgot').hidden = !can;
  $('#lock-forgot-none').hidden = can;
  if (can) $('#lock-forgot-email').value = knownAccount();
}

async function forgotSubmit(e) {
  e.preventDefault();
  const err = $('#lock-forgot-error');
  const known = knownAccount();
  const email = $('#lock-forgot-email').value.trim().toLowerCase();
  if (!known || email !== known) {
    err.textContent = 'That is not the account this device belongs to';
    return;
  }
  err.textContent = 'Checking…';
  try {
    await window.KindredSync.signIn(email, $('#lock-forgot-password').value);
    err.textContent = '';
    clearLock();
    unlock();
    toast('Lock removed — set a new PIN in settings');
  } catch (ex) {
    err.textContent = ex.message || 'Could not sign in';
  }
}

/* Wired on its own, before the rest of the app is awake, so a PIN typed
   in the first moments cannot fall through to a page navigation. */
function wireLock() {
  /* Cancel is what both Escape and the phone's back button arrive as.
     Refusing it is what makes this a lock rather than a curtain. */
  $('#lock').addEventListener('cancel', e => e.preventDefault());

  $('#form-lock').onsubmit = e => { e.preventDefault(); submitPin(); };
  $('#lock-pin').oninput = e => {
    e.target.value = e.target.value.replace(/\D/g, '');
    $('#lock-error').textContent = '';
    if (e.target.value.length === lockRecord()?.len) submitPin();
  };
  $('#lock-bio').onclick = () => tryBio();
  $('#lock-forgot').onclick = () => {
    const panel = $('#lock-forgot-panel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { paintForgot(); $('#lock-forgot-password').focus(); }
  };
  $('#form-lock-forgot').onsubmit = forgotSubmit;
}

/* ── setting it up ── */

let pinMode = 'set';   // set · change · off

function paintLockState() {
  const on = hasPin();
  const able = canLock();

  $('#lock-hint').textContent = !able
    ? 'A PIN needs Fellowship opened over https, or straight off the disk. This address cannot hash one safely, so it is not offered here.'
    : on
      ? 'On. Fellowship asks when it starts, and again when you come back after a couple of minutes away.'
      : 'Ask for a PIN before your circle is shown. It stays on this device — not in your account, and not in your backup.';

  $('#btn-pin').hidden = !able || on;
  $('#btn-pin-change').hidden = !able || !on;
  $('#btn-pin-off').hidden = !able || !on;

  const bioOn = !!bioCredential();
  $('#setting-bio').hidden = !(able && on && bioReady);
  $('#btn-bio').textContent = bioOn ? 'Turn off' : 'Turn on';
  $('#bio-hint').textContent = bioOn
    ? 'On. The lock screen offers it first, with the PIN waiting behind it.'
    : 'Use this device’s own fingerprint, face or Windows Hello instead of typing the PIN.';
}

function pinDialog(mode) {
  pinMode = mode;
  const need = hasPin();

  $('#dlg-pin-title').textContent =
    mode === 'off' ? 'Turn the lock off' : mode === 'change' ? 'Change your PIN' : 'Set a PIN';
  $('#pin-lede').textContent = mode === 'off'
    ? 'Enter it once more and Fellowship will stop asking. Any fingerprint you set up is forgotten with it.'
    : 'Four to eight digits, kept on this device alone. If you lose it, signing in to your Fellowship account is the way back.';

  $('#pin-current-wrap').hidden = !need;
  $('#pin-new-wrap').hidden = mode === 'off';
  $('#pin-confirm-wrap').hidden = mode === 'off';
  $('#btn-pin-save').textContent = mode === 'off' ? 'Turn it off' : 'Save';
  ['#pin-current', '#pin-new', '#pin-confirm'].forEach(s => { $(s).value = ''; });
  $('#pin-error').textContent = '';

  $('#dlg-pin').showModal();
  setTimeout(() => $(need ? '#pin-current' : '#pin-new').focus(), 60);
}

async function savePin(e) {
  e.preventDefault();
  const err = $('#pin-error');
  err.textContent = '';

  if (hasPin() && !(await pinMatches($('#pin-current').value))) {
    err.textContent = 'That is not your PIN';
    return;
  }

  if (pinMode === 'off') {
    clearLock();
    $('#dlg-pin').close();
    paintLockState();
    return toast('Lock turned off');
  }

  const pin = $('#pin-new').value;
  if (!/^\d+$/.test(pin) || pin.length < PIN_MIN || pin.length > PIN_MAX) {
    err.textContent = `Between ${PIN_MIN} and ${PIN_MAX} digits`;
    return;
  }
  if (pin !== $('#pin-confirm').value) {
    err.textContent = 'The two do not match';
    return;
  }

  await setPin(pin);
  $('#dlg-pin').close();
  paintLockState();
  toast(pinMode === 'change' ? 'PIN changed' : 'PIN set — Fellowship will ask next time it opens');
}

async function toggleBio() {
  if (bioCredential()) {
    Store.setPref('lockBio', '');
    paintLockState();
    return toast('Fingerprint unlock turned off');
  }
  try {
    await enrolBio();
    paintLockState();
    toast('Fingerprint unlock is on');
  } catch (ex) {
    toast(ex?.name === 'NotAllowedError'
      ? 'Nothing was registered, so nothing changed'
      : 'This device would not register a fingerprint');
  }
}

/* ─────────────────────────── views ─────────────────────────── */

function switchView(name) {
  $$('.nav-item[data-view]').forEach(t => {
    const on = t.dataset.view === name;
    t.classList.toggle('is-active', on);
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });

  /* The calendar's frozen bar wants the top of the screen, and on a phone the
     frozen title is already fixed there. Only one of them can have it. */
  document.body.classList.toggle('on-calendar', name === 'calendar');

  /* An open day is not something to come back to from another tab, and a layer
     left standing for it would make a later back press widen a list nobody is
     looking at. */
  if (name !== 'calendar' && calPicked) { clearPickedDay(); renderCalendar(); }

  /* renderCircle measures the grid to work out how many faces fit across, and
     a hidden grid measures zero. Every mutation re-renders every view, so
     editing anything on another tab used to leave the circle laid out against
     a width of nothing — which is what made the faces come back stacked with
     their discs missing. Repainting on the way in is the fix: the one render
     that reads the DOM now always runs while that DOM can be seen. */
  if (name === 'circle') renderCircle();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll() {
  renderCircle();
  renderPrayers();
  renderToday();
  renderCalendar();
  if (openId) renderSheet();
}

/* ─────────────────────────── wiring ───────────────────────── */

function fillSelects() {
  const gp = $('#f-groups');
  GROUPS.forEach(g => {
    const b = el('button', 'chip');
    b.type = 'button';
    b.dataset.group = g;
    b.setAttribute('aria-pressed', 'false');
    b.textContent = g;
    b.onclick = () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-on', on);
    };
    gp.append(b);
  });

  const c = $('#f-cadence');
  CADENCES.forEach(([days, label]) => c.append(new Option(label, String(days))));
  const k = $('#e-kind');
  Object.entries(KINDS).forEach(([key, v]) => k.append(new Option(`${v.glyph}  ${v.label}`, key)));

  const pick = $('#type-pick');
  Object.entries(TYPES).forEach(([key, v]) => {
    const b = el('button', 'type-opt');
    b.type = 'button';
    b.dataset.type = key;
    b.setAttribute('role', 'radio');
    b.append(el('span', 'glyph', v.glyph), el('span', null, v.label));
    b.onclick = () => setEventType(key);
    pick.append(b);
  });
}

function wire() {
  $$('.nav-item[data-view]').forEach(t => { t.onclick = () => switchView(t.dataset.view); });

  $('#btn-add').onclick = () => personDialog(null);
  $('#btn-add-first').onclick = () => personDialog(null);
  $('#form-person').onsubmit = savePerson;
  $('#btn-person-cancel').onclick = () => $('#dlg-person').close();

  $('#photo-input').onchange = e => {
    const file = e.target.files?.[0];
    if (file) pickPhoto(file);
    e.target.value = '';   // so choosing the same file twice still fires
  };
  $('#btn-contact-pick').onclick = fillFromContact;
  $('#photo-adjust').onclick = adjustPhoto;
  $('#photo-clear').onclick = () => {
    pendingPhoto = null;
    pendingOriginal = null;
    paintPhotoPreview(null, $('#f-name').value);
    $('#photo-input').value = '';
  };
  wireCropper();

  $('#btn-delete-person').onclick = async () => {
    const p = byId(editingPersonId);
    if (!p) return;
    if (!confirm(`Remove ${p.name} and everything recorded about them? This cannot be undone.`)) return;
    people = people.filter(x => x.id !== p.id);
    delete photos[p.id];
    await Store.deletePhoto(p.id);
    await Store.deleteOriginal(p.id);
    await Store.savePeople(people);
    notifyMutate();
    $('#dlg-person').close();
    closeSheet();
    renderAll();
    toast(`${p.name} removed`);
  };

  $('#form-event').onsubmit = saveEvent;
  $('#btn-event-cancel').onclick = () => $('#dlg-event').close();

  /* The kind can change without the type changing, and only one kind asks a
     second question, so the fields follow the select as well as the tabs. */
  $('#e-kind').onchange = paintBabyFields;
  $('#e-date').onchange = () => { if (!$('#wrap-gestation').hidden) paintGestationFrom($('#e-date').value); };

  const fromGestation = () => {
    const w = clamp(Number($('#e-weeks').value) || 0, 0, 42);
    const d = clamp(Number($('#e-days').value) || 0, 0, 6);
    $('#e-date').value = dueFromGestation(w, d);
    $('#gestation-now').textContent = `${w}w ${d}d today`;
  };
  $('#e-weeks').oninput = fromGestation;
  $('#e-days').oninput = fromGestation;
  $('#btn-delete-event').onclick = () => {
    const p = byId(editingEvent.personId);
    if (!p) return;
    p.events = p.events.filter(x => x.id !== editingEvent.eventId);
    queueSave();
    $('#dlg-event').close();
    renderAll();
  };

  $('#form-health').onsubmit = saveHealth;
  $('#btn-health-cancel').onclick = () => $('#dlg-health').close();
  $('#btn-delete-health').onclick = () => {
    const { personId, key, id } = editingHealth;
    const p = byId(personId);
    if (!p) return;
    p[key] = p[key].filter(x => x.id !== id);
    queueSave();
    $('#dlg-health').close();
    renderAll();
  };

  $('#form-release').onsubmit = saveAnswered;
  $('#btn-release-go').onclick = saveReleased;
  $('#btn-release-remove').onclick = saveRemoved;
  $('#btn-release-cancel').onclick = () => $('#dlg-release').close();

  $('#cal-prev').onclick = () => shiftMonth(-1);
  $('#cal-next').onclick = () => shiftMonth(1);
  $('#cal-today').onclick = () => goToMonth(monthKey(new Date()));

  $('#btn-how-plain').onclick = () => { chooseHow(''); };
  $('#btn-how-cancel').onclick = () => $('#dlg-how').close();

  $('#btn-filter').onclick = () => { fillGroupChips($('#filter-chips')); $('#dlg-filter').showModal(); };
  $('#btn-filter-done').onclick = () => $('#dlg-filter').close();

  $('#btn-settings').onclick = () => {
    paintNotifState();
    /* Whether the device can verify a person may have changed since boot —
       a fingerprint enrolled in Android's own settings, say. */
    checkBio().then(paintLockState);
    paintLockState();
    $('#dlg-settings').showModal();
  };
  $('#btn-settings-close').onclick = () => $('#dlg-settings').close();

  $('#btn-pin').onclick = () => pinDialog('set');
  $('#btn-pin-change').onclick = () => pinDialog('change');
  $('#btn-pin-off').onclick = () => pinDialog('off');
  $('#btn-pin-cancel').onclick = () => $('#dlg-pin').close();
  $('#form-pin').onsubmit = savePin;
  $('#btn-bio').onclick = toggleBio;
  $('#btn-notif').onclick = enableNotifications;
  $('#btn-export').onclick = exportAll;
  $('#import-input').onchange = e => {
    const f = e.target.files?.[0];
    if (f) importAll(f);
    e.target.value = '';
  };

  $('#sheet-close').onclick = closeSheet;
  $('#scrim').onclick = closeSheet;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openId && !$$('dialog[open]').length) closeSheet();
  });

  let searchTimer;
  $('#search').oninput = e => {
    clearTimeout(searchTimer);
    const v = e.target.value;
    searchTimer = setTimeout(() => { query = v; renderCircle(); }, 120);
  };

  const cc = $('#country-code');
  cc.value = countryCode();
  cc.oninput = e => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
    e.target.value = v;
    Store.setPref('countryCode', v || '27');
    if (openId) renderSheet();   // the contact line may have just become dialable
  };

  const size = $('#badge-size');
  size.value = String(badgeSizePref());
  let sizeTimer;
  size.oninput = e => {
    const v = clamp(Number(e.target.value) || 100, SIZE_MIN, SIZE_MAX);
    applyBadgeSize(v);
    Store.setPref('badgeSize', String(v));
    /* A computer needs nothing further — the grid reflows around the new
       size. A phone does, because how many fit in a row has just changed. */
    if (phone.matches) { clearTimeout(sizeTimer); sizeTimer = setTimeout(renderCircle, 120); }
  };

  /* Rebuilt when the number of badges across changes, not on every pixel of
     a drag — turning a phone sideways matters, nudging a window edge does not. */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (phone.matches && hexMetrics($('#grid')).per !== hexCols) renderCircle();
    }, 150);
  }, { passive: true });

  phone.addEventListener('change', renderCircle);

  /* The frozen title appears exactly as the real one leaves the top of the
     screen. Watching the heading itself means no scroll arithmetic and no
     threshold to keep in step with the masthead's height. */
  const title = $('.masthead h1');
  if (title && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      $('#topbar').classList.toggle('is-up', !e.isIntersecting && e.boundingClientRect.top < 0);
    }).observe(title);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    /* Glancing at a message and coming straight back should not ask again;
       leaving the phone on the table should. */
    if (Date.now() - hiddenAt > LOCK_GRACE) showLock();
    renderAll();
    if (!locked) nudgeIfDue();
    checkForUpdate();
  });

  wireDialogLayers();
}

/* ──────────────── keeping up with the live site ──────────────── */

/* Installed as an Android app, Fellowship is a window onto the deployed URL, not
   a copy of the files — so a change reaches the phone without reinstalling
   anything. What it does not do is reload. An app picked back up from the
   task switcher keeps the page it booted with, and can sit for days on last
   week's version. version.json names the deploy it came from; when that name
   changes and nothing is half-written, take the new one.

   Watching the service worker instead would miss nearly all of this: the
   browser decides a worker is new by comparing sw.js byte for byte, and sw.js
   doesn't change when app.js does. */

let bootBuild = null;
let lastBuildCheck = 0;

/* Offline, the service worker answers with index.html and parsing that as
   JSON throws — null either way, which is the honest answer: nothing to
   compare against. */
async function readBuild() {
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()).build || null;
  } catch { return null; }
}

/* Reloading out from under a half-typed note would throw it away. Every
   editor in the app is a native dialog, so one selector covers all of them. */
function safeToReload() {
  if ($$('dialog[open]').length) return false;
  const a = document.activeElement;
  return !(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable));
}

async function checkForUpdate() {
  if (Date.now() - lastBuildCheck < 60000) return;
  lastBuildCheck = Date.now();

  const live = await readBuild();
  if (!live) return;

  /* The first reading it manages is the one it measures against, rather than
     whatever was true at boot — so a session that started with no connection
     still arms itself once one arrives. */
  if (!bootBuild) { bootBuild = live; return; }

  /* Busy right now: let it be. Coming back to the app asks again. */
  if (live !== bootBuild && safeToReload()) location.reload();
}

/* ─────────────────────────── boot ─────────────────────────── */

async function boot() {
  /* Before anything else. Reading the lock is synchronous, so the screen is
     up ahead of the first paint and no face is ever drawn uncovered. */
  wireLock();
  showLock();

  await Store.init();
  people = (await Store.loadPeople()).map(normalise);
  photos = await Store.loadPhotos();

  fillSelects();
  wire();
  checkBio().then(paintLockState);

  $('#storage-state').textContent = Store.blocked
    ? 'Fellowship is open in another tab and holding the database. Close it and reload — nothing here will save until you do.'
    : ({
      indexeddb: 'Saved in this browser’s database on this device.',
      localstorage: 'Saved in browser storage (limited room for photos). Run it from a local server for more space.',
      memory: 'Nothing can be saved in this browser mode — export a backup before closing.',
    })[Store.mode];
  if (Store.blocked) toast('Close Fellowship’s other tab and reload');

  /* Always the circle. Fellowship used to reopen on whichever tab you left it on,
     which meant signing in could land you on a prayer list rather than on the
     faces — and the faces are the app. Coming back is different from starting:
     unlocking after a couple of minutes away leaves you where you were. */
  switchView('circle');

  /* Before the first render, so the circle is drawn at the chosen size rather
     than drawn small and then jumping. */
  applyBadgeSize(badgeSizePref());

  renderAll();
  paintNotifState();
  paintLockState();
  if (!locked) nudgeIfDue();

  /* A reload with someone open — the app taking an update, usually — comes
     back standing on the guard entry, and their page is still what the back
     button is in front of. Take the entry as ours and put them back. */
  if (history.state?.kindredLayer) {
    guarded = true;
    const held = history.state.person;
    if (held && byId(held)) openSheet(held);
  }

  if (location.protocol.startsWith('http')) {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    checkForUpdate();
  }
}

/* The only surface sync.js touches. Keeping it this narrow means the sync
   layer can be removed entirely and the app still runs, unchanged. */
window.Kindred = {
  get people() { return people; },
  set people(v) { people = v; },
  get photos() { return photos; },
  set photos(v) { photos = v; },
  Store,
  normalise,
  toast,
  render: () => renderAll(),
  onMutate: fn => mutateHooks.push(fn),
};

boot();
})();
