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

/* Today, worked out once a day rather than once a call.

   This is asked hundreds of times a repaint — every calendar cell compares
   itself against it, and every person's status and every date's countdown
   goes through daysBetween(today(), …). Building a Date and formatting a
   string each time was pure waste.

   Held until the next local midnight, computed rather than guessed at, so an
   app left open overnight rolls over on the right second: a phone on the
   bedside table is exactly where this app gets left open. */
let todayYmd = '';
let todayUntil = 0;
const today = () => {
  const now = Date.now();
  if (now >= todayUntil) {
    const d = new Date(now);
    todayYmd = ymd(d);
    todayUntil = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  }
  return todayYmd;
};

const parseYmd = s => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/* Whole days between two 'YYYY-MM-DD' strings, without building either date.
   Date.UTC returns a number rather than an object, so this allocates nothing
   — and counting in UTC means the answer is an exact integer instead of a
   quotient rounded to absorb the hour that daylight saving adds or removes. */
const dayNumber = s => {
  const [y, m, d] = String(s).split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / DAY);
};
const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);

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
  /* Only reachable since to-dos: everything else on these lists refuses a
     date that has already gone, but a thing you meant to do keeps its place
     after its day has passed — and "in -4 days" is not a sentence. Late
     rather than ago, because this is still a thing waiting to be done and
     not a thing that happened. */
  if (days < 0) {
    const d = -days;
    if (d === 1) return 'yesterday';
    if (d < 31) return `${d} days late`;
    if (d < 365) return `${plural(Math.round(d / 30), 'month', 'months')} late`;
    return `${plural(Math.max(1, Math.round(d / 365)), 'year', 'years')} late`;
  }
  if (days < 31) return `in ${days} days`;
  if (days < 365) return `in ${plural(Math.round(days / 30), 'month', 'months')}`;
  return `in ${plural(Math.max(1, Math.round(days / 365)), 'year', 'years')}`;
}

/* toLocaleDateString builds a formatter from scratch on every call, and
   building one is far more expensive than using it. A month of calendar asks
   for one label per day, so the same formatter was being constructed several
   hundred times a repaint. Made once, on first use, and kept.

   Undefined locale on purpose, exactly as before: whatever the device reads
   dates in is what this app reads dates in. */
const formatter = opts => {
  let f = null;
  return d => (f ||= new Intl.DateTimeFormat(undefined, opts)).format(d);
};

const fullDate = formatter({ day: 'numeric', month: 'short', year: 'numeric' });
const monthOnly = formatter({ month: 'short' });
const monthAndYear = formatter({ month: 'short', year: 'numeric' });

/* The calendar labels every one of its days, and the days do not change what
   they are called between repaints — so the string is worth keeping too. */
const prettyCache = new Map();
function prettyDate(dateStr) {
  let s = prettyCache.get(dateStr);
  if (s === undefined) {
    s = fullDate(parseYmd(dateStr));
    /* A year of scrolling is a few hundred entries; this only stops it
       growing without limit in a tab that is never closed. */
    if (prettyCache.size > 3000) prettyCache.clear();
    prettyCache.set(dateStr, s);
  }
  return s;
}
const shortMonth = dateStr => monthOnly(parseYmd(dateStr));
const monthYear = dateStr => monthAndYear(parseYmd(dateStr));

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

