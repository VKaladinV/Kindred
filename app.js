/* ══════════════════════════════════════════════════════════════
   Kindred — all data lives on this device.
   people    → IndexedDB "kv" store (or localStorage fallback)
   photos    → IndexedDB "photos" store, keyed by person id
   originals → IndexedDB "originals" store, keyed by person id:
               the picked image before cropping, so the focus can be
               nudged later. Never synced, never exported.

   A person's `events` array holds three kinds of record:
     history  — it already happened
     upcoming — it falls on a date ahead (optionally every year)
     season   — a stretch they are walking through, until endDate
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

const KINDS = {
  joy:       { label: 'Joy',       glyph: '✦' },
  hard:      { label: 'Hard time', glyph: '◍' },
  milestone: { label: 'Milestone', glyph: '◆' },
  health:    { label: 'Health',    glyph: '✚' },
  faith:     { label: 'Faith',     glyph: '✜' },
  other:     { label: 'Other',     glyph: '•' },
};

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

const PROMPTS = [
  'A few names, held on purpose.',
  'Care is mostly remembering, then acting on it.',
  'Small check-ins, kept up, become a life shared.',
  'Nobody is a task. Reach out anyway.',
  'The people below have been on your mind. Here they are.',
];

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
    touches: Array.isArray(p.touches) ? p.touches.slice(-60) : [],
    events: Array.isArray(p.events) ? p.events.map(normaliseRecord) : [],
    prayers: Array.isArray(p.prayers) ? p.prayers : [],
    medications: Array.isArray(p.medications) ? p.medications.map(normaliseHealth) : [],
    conditions: Array.isArray(p.conditions) ? p.conditions.map(normaliseHealth) : [],
    createdAt: p.createdAt || today(),
  };
}

const isMedical = p => p.groups.includes(MEDICAL);

/* ─────────────────────────── status logic ──────────────────── */

const lastTouch = p => (p.touches.length ? p.touches[p.touches.length - 1] : null);

function statusOf(p) {
  const last = lastTouch(p);
  const days = last ? daysBetween(last, today()) : null;
  if (!p.cadenceDays) return { state: 'none', days, ratio: 0 };
  if (days === null) return { state: 'due', days: null, ratio: 99 };
  const ratio = days / p.cadenceDays;
  return { state: ratio >= 1 ? 'due' : ratio >= 0.7 ? 'soon' : 'well', days, ratio };
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

const openPrayers = p => p.prayers.filter(x => !x.answeredAt);

function dueList() {
  return people
    .map(p => ({ p, s: statusOf(p) }))
    .filter(x => x.s.state === 'due')
    .sort((a, b) => b.s.ratio - a.s.ratio);
}

/* birthdays and dated records, merged into one list of what is coming */
function datesAhead(withinDays = 45) {
  const out = [];
  people.forEach(p => {
    const bd = nextBirthday(p);
    if (bd && bd.inDays <= withinDays) {
      out.push({ p, inDays: bd.inDays, date: bd.date, label: 'Birthday', sub: `turning ${bd.turning} · ${prettyDate(bd.date)}`, glyph: '✦' });
    }
    upcomingOf(p).forEach(({ r, o }) => {
      if (o.inDays < 0 || o.inDays > withinDays) return;
      out.push({ p, inDays: o.inDays, date: o.date, label: r.title, sub: `${r.title} · ${prettyDate(o.date)}`, glyph: (KINDS[r.kind] || KINDS.other).glyph });
    });
  });
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
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

/* ═══════════════════════════ RENDER: CIRCLE ════════════════ */

function badge(p, i) {
  const s = statusOf(p);
  const b = el('div', 'badge');
  b.dataset.state = s.state;
  b.style.setProperty('--i', i);

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

  b.append(frame, el('div', 'badge-name', p.name));

  let meta = p.relationship || '';
  if (s.state === 'due') meta = s.days === null ? 'no check-in yet' : `${s.days}d since`;
  if (meta) b.append(el('div', 'badge-meta', meta));

  return b;
}

function renderCircle() {
  const grid = $('#grid');
  grid.textContent = '';

  const q = query.trim().toLowerCase();
  const list = people
    .filter(p => !filterGroups.size || p.groups.some(g => filterGroups.has(g)))
    .filter(p => !q || (p.name + ' ' + p.relationship + ' ' + p.summary + ' ' + p.groups.join(' ')).toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  list.forEach((p, i) => grid.append(badge(p, i)));

  $('#blank').hidden = people.length > 0;
  grid.hidden = people.length === 0;

  if (people.length && !list.length) {
    grid.hidden = false;
    grid.append(el('p', 'quiet-note', 'No one matches that.'));
  }

  const chips = $('#chips');
  chips.textContent = '';
  if (people.length > 3) {
    const counts = {};
    people.forEach(p => p.groups.forEach(g => { counts[g] = (counts[g] || 0) + 1; }));

    const everyone = el('button', 'chip' + (filterGroups.size ? '' : ' is-on'));
    everyone.type = 'button';
    everyone.setAttribute('aria-pressed', String(!filterGroups.size));
    everyone.append(document.createTextNode('Everyone'), el('span', 'n', people.length));
    everyone.onclick = () => { filterGroups.clear(); renderCircle(); };
    chips.append(everyone);

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
        renderCircle();
      };
      chips.append(c);
    });
  }

  const due = dueList().slice(0, 10);
  const nudge = $('#nudge');
  nudge.hidden = due.length === 0;
  if (due.length) {
    const row = $('#nudge-row');
    row.textContent = '';
    due.forEach(({ p }, i) => row.append(badge(p, i)));
  }

  const n = people.length;
  $('#footer-count').textContent = n ? plural(n, 'person', 'people') + ' held close' : 'nobody yet';
  $('#tagline').textContent = n ? 'the people I hold, and how they are' : 'a quiet place to begin';
}

/* ═══════════════════════════ RENDER: PRAYERS ══════════════ */

function prayerLine(p, pr, answered) {
  const line = el('div', 'prayer-line' + (answered ? ' is-answered' : ''));

  const tick = el('button', 'tick');
  tick.type = 'button';
  tick.title = answered ? 'Move back to the list' : 'Mark as answered';
  tick.setAttribute('aria-label', tick.title);
  tick.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 13l4.5 4.5L19 7"/></svg>';
  tick.onclick = () => answered ? unanswerPrayer(p.id, pr.id) : askAnswer(p.id, pr.id, pr.text);

  const body = el('div', 'prayer-text');
  body.append(document.createTextNode(pr.text));
  if (answered && pr.answerNote) body.append(el('p', 'answer-note', '“' + pr.answerNote + '”'));

  const age = el('span', 'prayer-age', answered ? prettyDate(pr.answeredAt) : agoWords(pr.createdAt));

  const x = el('button', 'prayer-x', '×');
  x.type = 'button';
  x.title = 'Remove';
  x.setAttribute('aria-label', 'Remove this prayer');
  x.onclick = () => {
    const target = byId(p.id);
    target.prayers = target.prayers.filter(q => q.id !== pr.id);
    queueSave(); renderAll();
  };

  line.append(tick, body, age, x);
  return line;
}

function renderPrayers() {
  const openWrap = $('#prayer-open');
  const ansWrap = $('#prayer-answered');
  openWrap.textContent = '';
  ansWrap.textContent = '';

  const withOpen = people.filter(p => openPrayers(p).length).sort((a, b) => a.name.localeCompare(b.name));
  const withAnswered = people.filter(p => p.prayers.some(x => x.answeredAt));

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

    openPrayers(p)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .forEach(pr => card.append(prayerLine(p, pr, false)));

    openWrap.append(card);
  });

  let answeredCount = 0;
  withAnswered
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(p => {
      const done = p.prayers.filter(x => x.answeredAt).sort((a, b) => (a.answeredAt < b.answeredAt ? 1 : -1));
      answeredCount += done.length;
      const card = el('div', 'pcard');
      const head = el('div', 'pcard-head');
      head.append(avatar(p, 'thumb', true));
      const idBox = el('div');
      idBox.append(el('h3', null, p.name));
      head.append(idBox);
      card.append(head);
      done.forEach(pr => card.append(prayerLine(p, pr, true)));
      ansWrap.append(card);
    });

  $('#answered-wrap').hidden = answeredCount === 0;
  $('#answered-count').textContent = answeredCount;

  const total = withOpen.reduce((n, p) => n + openPrayers(p).length, 0);
  $('#prayer-sub').textContent = total
    ? `${plural(total, 'thing', 'things')} for ${plural(withOpen.length, 'person', 'people')}`
    : '';
  $('#prayer-blank').hidden = total > 0 || answeredCount > 0;
}

/* ═══════════════════════════ RENDER: TODAY ════════════════ */

function todayRow(p, { when = '', calm = false, sub = '', action = false } = {}) {
  const row = el('div', 'today-row');
  row.append(avatar(p, 'thumb', true));

  const who = el('div', 'who');
  who.append(el('strong', null, p.name));
  who.append(el('small', null, sub || p.relationship || p.groups.join(' · ')));
  row.append(who);

  if (when) row.append(el('span', 'when' + (calm ? ' calm' : ''), when));

  if (action) {
    const act = el('button', 'tick');
    act.type = 'button';
    act.title = 'Mark that you connected today';
    act.setAttribute('aria-label', `Mark that you connected with ${p.name} today`);
    act.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 13l4.5 4.5L19 7"/></svg>';
    act.onclick = () => markConnected(p.id);
    row.append(act);
  }
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

  const seed = hashCode(today());
  body.append(el('p', 'verse', PROMPTS[seed % PROMPTS.length]));

  let anything = false;

  /* overdue check-ins */
  const due = dueList();
  if (due.length) {
    anything = true;
    const b = block('Reach out', String(due.length));
    due.forEach(({ p, s }) => b._list.append(todayRow(p, {
      when: s.days === null ? 'never yet' : `${s.days}d since`,
      action: true,
    })));
    body.append(b);
  }

  /* birthdays and dated records, together */
  const ahead = datesAhead(45);
  if (ahead.length) {
    anything = true;
    const b = block('Dates ahead');
    ahead.forEach(x => b._list.append(todayRow(x.p, {
      when: x.inDays === 0 ? `${x.glyph} today` : aheadWords(x.inDays),
      calm: x.inDays > 7,
      sub: x.sub,
    })));
    body.append(b);
  }

  /* seasons people are in right now */
  const walking = people.filter(p => activeSeasons(p).length);
  if (walking.length) {
    anything = true;
    const b = block('Walking through');
    walking.forEach(p => {
      const seasons = activeSeasons(p);
      b._list.append(todayRow(p, {
        sub: seasons.map(s => s.title).join(' · '),
        when: `since ${monthYear(seasons[0].date)}`,
        calm: true,
      }));
    });
    body.append(b);
  }

  /* check-ins coming due */
  const soon = people.map(p => ({ p, s: statusOf(p) }))
    .filter(x => x.s.state === 'soon')
    .sort((a, b) => b.s.ratio - a.s.ratio);
  if (soon.length) {
    anything = true;
    const b = block('Soon');
    soon.forEach(({ p, s }) => {
      const left = Math.max(0, p.cadenceDays - s.days);
      b._list.append(todayRow(p, { when: left === 0 ? 'today' : `in ${left}d`, calm: true, action: true }));
    });
    body.append(b);
  }

  /* a deterministic three for the day */
  const praying = people.filter(p => openPrayers(p).length);
  if (praying.length) {
    anything = true;
    const picked = [...praying]
      .sort((a, b) => hashCode(a.id + today()) - hashCode(b.id + today()))
      .slice(0, 3);
    const b = block('Pray for');
    picked.forEach(p => b._list.append(todayRow(p, {
      sub: openPrayers(p)[0].text,
      when: String(openPrayers(p).length),
      calm: true,
    })));
    body.append(b);
  }

  if (!anything) {
    body.append(el('p', 'all-clear', people.length
      ? 'Nothing pressing today. Everyone is where you left them.'
      : 'Add someone to your circle and this page will start looking after you.'));
  }

  const count = due.length + ahead.filter(x => x.inDays === 0).length;
  const badgeEl = $('#tab-count');
  badgeEl.hidden = count === 0;
  badgeEl.textContent = count;
}

/* ═══════════════════════════ PERSON SHEET ════════════════ */

function openSheet(id) {
  openId = id;
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
  const last = lastTouch(p);

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
    f.append(document.createTextNode('☏ '), el('b', null, p.contact));
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
    p.touches.slice(-14).forEach(() => beads.append(el('span', 'bead on')));
    st.append(beads);
  }
  bar.append(st);

  const btnTouch = el('button', 'btn btn-sage', last === today() ? '✓ Connected today' : 'Connected today');
  btnTouch.type = 'button';
  btnTouch.disabled = last === today();
  btnTouch.onclick = () => markConnected(p.id);
  bar.append(btnTouch);
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
  if (open.length) open.forEach(pr => prBlock.append(prayerLine(p, pr, false)));
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
    byId(p.id).prayers.push({ id: uid(), text, createdAt: today(), answeredAt: null, answerNote: '' });
    prInput.value = '';
    queueSave();
    renderAll();
    setTimeout(() => $('.add-line input', $('#sheet-scroll'))?.focus(), 30);
  };
  prBlock.append(addPrayer);

  const answered = p.prayers.filter(x => x.answeredAt);
  if (answered.length) {
    const det = el('details', 'answered');
    const sm = el('summary');
    sm.append(document.createTextNode(plural(answered.length, 'answered', 'answered')));
    det.append(sm);
    answered.sort((a, b) => (a.answeredAt < b.answeredAt ? 1 : -1))
      .forEach(pr => det.append(prayerLine(p, pr, true)));
    prBlock.append(det);
  }
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
      meta.append(el('span', 'up-count' + (past ? ' is-past' : ''), past ? `was ${agoWords(o.date)}` : aheadWords(o.inDays)));
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

function markConnected(id) {
  const p = byId(id);
  if (!p) return;
  if (lastTouch(p) === today()) return;
  p.touches.push(today());
  if (p.touches.length > 60) p.touches = p.touches.slice(-60);
  queueSave();
  renderAll();
  toast(`Noted — you connected with ${p.name.split(' ')[0]} today`);
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

function unanswerPrayer(personId, prayerId) {
  const pr = byId(personId)?.prayers.find(x => x.id === prayerId);
  if (!pr) return;
  pr.answeredAt = null;
  pr.answerNote = '';
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
  $('#e-date-label').textContent = t.dateLabel;
  $('#e-title').placeholder = t.placeholder;
  $('#wrap-end').hidden = editingEvent.type !== 'season';
  $('#wrap-repeat').hidden = editingEvent.type !== 'upcoming';
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

  setEventType(editingEvent.type);
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

let answering = { personId: null, prayerId: null };

function askAnswer(personId, prayerId, text) {
  answering = { personId, prayerId };
  $('#answer-lede').textContent = '“' + text + '”';
  $('#a-note').value = '';
  $('#dlg-answer').showModal();
  setTimeout(() => $('#a-note').focus(), 60);
}

function saveAnswer(e) {
  e.preventDefault();
  const pr = byId(answering.personId)?.prayers.find(x => x.id === answering.prayerId);
  if (pr) {
    pr.answeredAt = today();
    pr.answerNote = $('#a-note').value.trim();
    queueSave();
  }
  $('#dlg-answer').close();
  renderAll();
  toast('Marked answered ✧');
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
  if (!data || !Array.isArray(data.people)) return toast('That is not a Kindred backup');

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
      existing.touches = [...new Set([...existing.touches, ...incoming.touches])].sort().slice(-60);
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
    ? 'On — when you open Kindred, it will nudge you once a day about anyone overdue and any date landing today.'
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

function nudgeIfDue() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (Store.getPref('notified') === today()) return;

  const due = dueList();
  const landing = datesAhead(0).filter(x => x.inDays === 0);
  if (!due.length && !landing.length) return;

  const lines = [];
  if (landing.length) lines.push(landing.map(x => `${x.p.name} — ${x.label}`).join(' · '));
  if (due.length) {
    const names = due.slice(0, 3).map(x => x.p.name.split(' ')[0]).join(', ');
    lines.push('Overdue: ' + names + (due.length > 3 ? ` and ${due.length - 3} more` : ''));
  }

  try {
    const n = new Notification(landing.length ? 'Something today' : 'Someone is on your mind', {
      body: lines.join(' — '),
      icon: 'icon-192.png',
      tag: 'kindred-daily',
    });
    n.onclick = () => { window.focus(); switchView('today'); };
    Store.setPref('notified', today());
  } catch { /* some browsers require a service worker */ }
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
  Store.setPref('view', name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll() {
  renderCircle();
  renderPrayers();
  renderToday();
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

  $('#form-answer').onsubmit = saveAnswer;
  $('#btn-answer-cancel').onclick = () => $('#dlg-answer').close();

  $('#btn-settings').onclick = () => { paintNotifState(); $('#dlg-settings').showModal(); };
  $('#btn-settings-close').onclick = () => $('#dlg-settings').close();
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

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { renderAll(); nudgeIfDue(); checkForUpdate(); }
  });
}

/* ──────────────── keeping up with the live site ──────────────── */

/* Installed as an Android app, Kindred is a window onto the deployed URL, not
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
  await Store.init();
  people = (await Store.loadPeople()).map(normalise);
  photos = await Store.loadPhotos();

  fillSelects();
  wire();

  $('#storage-state').textContent = Store.blocked
    ? 'Kindred is open in another tab and holding the database. Close it and reload — nothing here will save until you do.'
    : ({
      indexeddb: 'Saved in this browser’s database on this device.',
      localstorage: 'Saved in browser storage (limited room for photos). Run it from a local server for more space.',
      memory: 'Nothing can be saved in this browser mode — export a backup before closing.',
    })[Store.mode];
  if (Store.blocked) toast('Close Kindred’s other tab and reload');

  const startView = Store.getPref('view', 'circle');
  if (['circle', 'prayers', 'today'].includes(startView)) switchView(startView);

  renderAll();
  paintNotifState();
  nudgeIfDue();

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
