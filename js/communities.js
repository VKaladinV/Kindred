/* uses: ATTEND_EVENTS ATTEND_MEETINGS DAY_NAMES ORDINALS
   · daysBetween parseYmd today ymd
   · byId churchEvents communities roster
   · normaliseAttendance · byNeed
   · isWalking startWalking
*/

/* ── communities you oversee ─────────────────────────────────────
   A community is a gathering you are responsible for without being the one
   who runs it: it has leaders, it has its people, and it meets on a rhythm.
   Everyone in it is on a road with you — joining is what starts it (see
   startCommunityRoads, below) — so their discipleship page is where you go
   from here, and their attendance is part of what that page knows.

   Leaders are only leaders. They are named so the community has a face at
   its head, and so their own page can say what they lead, but nothing is
   started for them and nobody is ticking whether they came to a meeting they
   were running.

   This file is the model: who is in what, when it meets, and who came. The
   page that draws it is js/community-page.js, and the three dialogs that
   change it are js/community-dialog.js. */

const communityById = id => communities.find(c => c.id === id) || null;
const churchEventById = id => churchEvents.find(e => e.id === id) || null;

/* By name, the way groups are — there is no need to sort them by, and the
   order you can predict is the honest one. */
const communitiesByName = () => [...communities].sort((a, b) => a.name.localeCompare(b.name));

/* The people who are actually here. byId rather than the circle alone, so
   somebody later moved to Future connections is still drawn where they were
   put; filter(Boolean) skips an id whose person has not reached this device
   yet without forgetting it — see normaliseCommunity. */
const communityPeople = c => c.members.map(byId).filter(Boolean).sort(byNeed);
const communityLeaders = c => c.leaders.map(byId).filter(Boolean);

/* Which communities somebody is one of the people of, and which they lead.
   Two questions rather than one with a flag: being in one changes which tab
   their face lives under, and leading one does not. */
const communitiesOf = id => communities.filter(c => c.members.includes(id));
const communitiesLedBy = id => communities.filter(c => c.leaders.includes(id));

/* "Sipho", "Sipho and Thandi", "Sipho, Thandi and Lerato". */
function firstNames(list) {
  const names = list.map(p => p.name.split(' ')[0]);
  if (names.length < 2) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* ── when it meets ───────────────────────────────────────────────
   A rhythm is a frequency and the date it started from, and everything else
   is worked out: the weekday is that date's, and a monthly one keeps to the
   same week of the month. Nothing about the dates themselves is stored, so a
   rhythm changed later never leaves a list of stale dates behind it — only
   the ones somebody was actually ticked at, which meetingDates keeps.

   All calendar arithmetic goes through the Date constructor, which rolls
   months and years over by itself and is never fooled by a clock change. */

const ymdPlus = (s, n) => {
  const t = parseYmd(s);
  return ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n));
};

/* 1 to 4 for the first four weeks; 5 means "last", because a fifth Tuesday is
   in some months and not others, and a meeting that vanished every month
   without one is not what anybody meant by starting on the 30th. */
const weekOfMonth = d => Math.min(5, Math.ceil(d.getDate() / 7));

/* The nth weekday `wd` of month `m` of year `y`. m may run below zero or past
   eleven — the Date constructor rolls it into the year before or after. */
function nthWeekdayOf(y, m, wd, nth) {
  if (nth >= 5) {
    const last = new Date(y, m + 1, 0);
    return new Date(y, m, last.getDate() - ((last.getDay() - wd + 7) % 7));
  }
  const first = new Date(y, m, 1);
  return new Date(y, m, 1 + ((wd - first.getDay() + 7) % 7) + (nth - 1) * 7);
}

/* The last `n` dates the rhythm lays out on or before `upTo`, oldest first.
   Counted back from the end rather than forward from the start, so a
   community that has met every week for ten years costs exactly what one that
   started last month does. */
function rhythmDates(every, from, upTo, n) {
  if (!from || from > upTo || n <= 0) return [];
  if (every === 'month') {
    const f = parseYmd(from);
    const t = parseYmd(upTo);
    const wd = f.getDay();
    const nth = weekOfMonth(f);
    const out = [];
    for (let m = t.getMonth(); out.length < n; m--) {
      const day = ymd(nthWeekdayOf(t.getFullYear(), m, wd, nth));
      if (day < from) break;
      if (day <= upTo) out.push(day);
    }
    return out.reverse();
  }
  const step = every === 'fortnight' ? 14 : 7;
  const last = Math.floor(daysBetween(from, upTo) / step);
  const out = [];
  for (let k = Math.max(0, last - n + 1); k <= last; k++) out.push(ymdPlus(from, k * step));
  return out;
}

/* The rhythm said as a sentence, and as the few words a badge has room for.
   Kept apart from RHYTHMS's labels, which name the choice in the dialog —
   "Every week" — where this names the day it lands on. */
function rhythmWords(every, from) {
  if (!from) return 'No day set yet';
  const f = parseYmd(from);
  const day = DAY_NAMES[f.getDay()];
  if (every === 'fortnight') return `Every second ${day}`;
  if (every === 'month') return `The ${ORDINALS[weekOfMonth(f) - 1]} ${day} of the month`;
  return `Every ${day}`;
}

function rhythmShort(every, from) {
  if (!from) return '';
  const f = parseYmd(from);
  const day = DAY_NAMES[f.getDay()];
  if (every === 'fortnight') return `every other ${day}`;
  if (every === 'month') return `${ORDINALS[weekOfMonth(f) - 1]} ${day}s`;
  return `${day}s`;
}

/* The meetings worth showing a register for: the most recent `n` that have
   happened. The rhythm's own dates, plus any held on another day, plus any
   date somebody was actually ticked at — that last so that changing the
   rhythm, or the day it started from, never loses a register already kept. */
function meetingDates(c, n = ATTEND_MEETINGS) {
  const t = today();
  const all = new Set(rhythmDates(c.every, c.from, t, n));
  for (const x of c.extra) if (x <= t) all.add(x);
  for (const p of communityPeople(c)) {
    for (const a of p.attendance) {
      if (a.kind === 'meeting' && a.of === c.id && a.on <= t) all.add(a.on);
    }
  }
  return [...all].sort().slice(-n);
}

/* The next time it meets, or '' when nothing is set. Two months ahead is
   always far enough to find one: a monthly meeting can be at most five weeks
   from the last. */
function nextMeeting(c) {
  const t = today();
  const ahead = rhythmDates(c.every, c.from, ymdPlus(t, 62), 12).filter(x => x > t);
  const extra = c.extra.filter(x => x > t);
  return [...ahead, ...extra].filter(x => !c.skipped.includes(x)).sort()[0] || '';
}

/* ── church events ──────────────────────────────────────────────── */

const byDate = (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title);

/* Those that have happened, oldest first — the order the register reads in. */
const pastChurchEvents = () => churchEvents.filter(e => e.date <= today()).sort(byDate);
const upcomingChurchEvents = () => churchEvents.filter(e => e.date > today()).sort(byDate);

/* How many people were there, across every community they were ticked from. */
const eventHeadcount = id =>
  roster().filter(p => p.attendance.some(a => a.kind === 'event' && a.of === id)).length;

/* ── who came ────────────────────────────────────────────────────
   Written on the person, one entry per meeting or event, and only ever by
   setAttended. The array is replaced rather than pushed to: the sync keeps
   the text of every row it has seen against the object it came from, so an
   array changed in place would go on reading as the text it used to have. */

const attendedMeeting = (p, cid, on) =>
  p.attendance.some(a => a.kind === 'meeting' && a.of === cid && a.on === on);
const attendedEvent = (p, eid) =>
  p.attendance.some(a => a.kind === 'event' && a.of === eid);

/* Returns whether anything changed, so a caller writing a whole register can
   skip the save when every tick was already where it was put. */
function setAttended(p, kind, of, on, yes) {
  const same = a => a.kind === kind && a.of === of && a.on === on;
  if (p.attendance.some(same) === yes) return false;
  p.attendance = yes ? normaliseAttendance([...p.attendance, { kind, of, on }])
    : p.attendance.filter(a => !same(a));
  return true;
}

/* ── how often they come ─────────────────────────────────────────
   Counted from the first meeting they were ticked at, never from before it.
   Somebody who joined three weeks ago has not missed the five meetings ahead
   of that; reading them as absent would make every newcomer look like the
   person most in need of a phone call. A meeting marked as not having
   happened is not counted at all. Null when there is nothing to count yet. */
function meetingRate(p, c, dates = meetingDates(c)) {
  const came = new Set(p.attendance.filter(a => a.kind === 'meeting' && a.of === c.id).map(a => a.on));
  if (!came.size) return null;
  const first = [...came].sort()[0];
  const counted = dates.filter(x => x >= first && !c.skipped.includes(x));
  return { came: counted.filter(x => came.has(x)).length, of: counted.length };
}

/* The same rule over the church's events, which belong to no community:
   the last few since the first one they were at. */
function eventRate(p) {
  const came = new Set(p.attendance.filter(a => a.kind === 'event').map(a => a.of));
  const past = pastChurchEvents();
  const first = past.find(e => came.has(e.id));
  if (!first) return null;
  const counted = past.filter(e => e.date >= first.date).slice(-ATTEND_EVENTS);
  return { came: counted.filter(e => came.has(e.id)).length, of: counted.length };
}

/* ── changing a community ────────────────────────────────────────
   None of these save or repaint. The dialogs that call them do both once,
   after however many of these one action takes. */

/* Everyone added to a community starts on a road with you, without the three
   questions the Disciple button asks — a community is a dozen people at a
   time, and the answers can be filled in later on each page. Somebody who
   cannot have a road (yourself, a future connection) or who is already on
   one is left as they are. Returns how many were started, for the toast. */
function startCommunityRoads(ids) {
  let n = 0;
  for (const id of ids) {
    const p = byId(id);
    if (!p || p.isSelf || p.isFuture || isWalking(p)) continue;
    startWalking(id);
    n++;
  }
  return n;
}

/* A meeting marked as not having happened, or marked back. Marking one off
   clears whatever was ticked on it — a register for a meeting that did not
   take place is not a register of anything. */
function setSkipped(c, date, yes) {
  c.skipped = yes ? [...new Set([...c.skipped, date])].sort() : c.skipped.filter(x => x !== date);
  if (yes) for (const p of roster()) setAttended(p, 'meeting', c.id, date, false);
}

/* A meeting held on a day the rhythm does not land on. A day the rhythm
   already lands on needs nothing adding — only un-skipping, if it was. */
function addExtraMeeting(c, date) {
  if (c.skipped.includes(date)) setSkipped(c, date, false);
  if (rhythmDates(c.every, c.from, date, 1)[0] === date || c.extra.includes(date)) return;
  c.extra = [...c.extra, date].sort();
}

function removeExtraMeeting(c, date) {
  c.extra = c.extra.filter(x => x !== date);
  for (const p of roster()) setAttended(p, 'meeting', c.id, date, false);
}

/* Taking a community or an event away takes away every tick against it too.
   Nothing else could ever show them again, and left behind they would ride
   every sync for good. */
function removeCommunity(id) {
  communities = communities.filter(c => c.id !== id);
  for (const p of roster()) {
    if (p.attendance.some(a => a.kind === 'meeting' && a.of === id)) {
      p.attendance = p.attendance.filter(a => !(a.kind === 'meeting' && a.of === id));
    }
  }
}

function removeChurchEvent(id) {
  churchEvents = churchEvents.filter(e => e.id !== id);
  for (const p of roster()) {
    if (p.attendance.some(a => a.kind === 'event' && a.of === id)) {
      p.attendance = p.attendance.filter(a => !(a.kind === 'event' && a.of === id));
    }
  }
}
