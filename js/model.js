/* uses: KINDS · daysBetween parseYmd prettyDate today ymd · people
   · clamp
*/

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

/* A pregnancy can be either shape now. isBaby is the old one — an upcoming
   record with kind 'baby' — kept exactly as it was so a record made before
   this update goes on rendering and notifying the way it always did, even
   though nothing in the UI can make a new one that way any more. The new
   shape is a season carrying a dueDate: the pregnancy is the season itself,
   from when it starts until the due date, and it ends the way any season
   does. Both count as "a pregnancy" wherever that question is asked. */
const isPregnancy = r => isBaby(r) || (r.type === 'season' && !!r.dueDate);
const pregnancyDate = r => r.type === 'season' ? r.dueDate : r.date;

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

/* ── lifting a circle in which nobody is due ─────────────────────
   A full face means "you owe them a call today", measured against the whole
   circle. Filter down to a group where nobody is overdue and every face is a
   half or a third: the sizes are still true, but true about a circle you are
   no longer looking at, and the screen fills with small faces and white space.

   So the set on screen is lifted until its largest face is a full one. Nothing
   is invented — the order is untouched and the faces keep their proportions to
   each other. Only what full is measured against changes, from the whole circle
   to the part you asked for. The ring still carries the real state, so a lifted
   face never claims to be overdue.

   The two populations move differently, on purpose. Someone with no rhythm is
   a third and nothing else — there is no band for them to sit on, so they step
   a whole rung: a third becomes a half, or a full if thirds are all there is.
   Everyone with a rhythm sits somewhere on the continuous half-to-full band,
   and the band is multiplied until its top touches full, so the person nearest
   their own next call stays visibly nearer than the one seen yesterday.
   Snapping them all to one size would have been fewer lines and would have
   thrown away the only thing the sizes were saying. */
const LADDER = [SMALL, 0.5, 1];

function scalesFor(list) {
  const raw = list.map(p => [p.id, badgeScale(p)]);
  const band = raw.map(([, s]) => s).filter(s => s > SMALL);
  const top = band.length ? Math.max(...band) : 0;

  /* How far the ladder has to move: not at all if a full face is already
     there, one rung if the band is all there is, two if the set is nothing
     but quiet thirds. */
  const steps = top >= 1 ? 0 : band.length ? 1 : 2;
  const gain = top > 0 ? 1 / top : 1;

  return new Map(raw.map(([id, s]) =>
    [id, s > SMALL ? clamp(s * gain, 0, 1) : LADDER[steps]]));
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

/* ── the two questions that are not "who" ────────────────────────
   A group says which shelf of your life someone is on, and groups add up:
   Family and Friends together is everyone in either. These two say something
   about today instead, so they behave differently — they narrow whatever the
   groups left rather than widening it. Family and needs-a-check-in is the
   people in Family who need one, which is how the question is asked out loud.

   Both are answers the app already worked out for other views; dueList and
   the Today list have been computing them all along. They just never reached
   the filter row, which is where you go looking for them. */
const DATE_WINDOW = 30;

/* A birthday counts, and so does anything you wrote down as coming — yearly
   ones rolled forward to their next landing by occurrenceOf.

   A pregnancy counts however far out it is, which is the one place this breaks
   its own window. datesAhead already makes the same exception for the same
   reason: forty weeks is longer than any horizon worth setting, and it is the
   date you want in sight from the day you hear about it. */
function hasDateWithin(p, within = DATE_WINDOW) {
  const bd = nextBirthday(p);
  if (bd && bd.inDays <= within) return true;
  if (upcomingOf(p).some(({ r, o }) => o.inDays >= 0 && (o.inDays <= within || isBaby(r)))) return true;
  if (kidsWithBirthdays(p).some(k => nextAnnual(k.birthday).inDays <= within)) return true;
  return activeSeasons(p).some(isPregnancy);
}

const FOCUS = {
  due:   { chip: 'Needs a check-in', phrase: 'need a check-in',
           test: p => statusOf(p).state === 'due' },
  dates: { chip: 'Dates this month', phrase: 'have a date this month',
           test: p => hasDateWithin(p) },
};

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
  const g = isPregnancy(r) ? gestationOn(o.date) : null;
  const short = g ? `${r.title} · ${gestationWords(g)}` : r.title;
  return {
    p, inDays: o.inDays, date: o.date, label: r.title, kind: r.kind, short,
    sub: g ? `${short} · due ${prettyDate(o.date)}` : `${short} · ${prettyDate(o.date)}`,
    glyph: isPregnancy(r) ? KINDS.baby.glyph : (KINDS[r.kind] || KINDS.other).glyph,
  };
}

/* ── the children on somebody's page ────────────────────────────
   A child with a birthday is a date like any other and belongs in Today and on
   the calendar. It appears under the parent's face rather than a face of its
   own, because the parent is whose page the child lives on and whose page
   tapping the row should open.

   A child with only a typed age gets none of this, which is the whole reason
   the two are separate fields: an age is what you were told once, and a
   birthday is a day that comes round. */
const kidsWithBirthdays = p => p.kids.filter(k => k.birthday && k.name);

/* How old they are today, worked out from the date when there is one rather
   than remembered — the same refusal gestationOn makes above, for the same
   reason. Falls back to the age you typed, which is all there is to say. */
function kidAge(k) {
  if (!k.birthday) return k.age;
  const b = parseYmd(k.birthday), now = new Date();
  const had = now.getMonth() > b.getMonth()
    || (now.getMonth() === b.getMonth() && now.getDate() >= b.getDate());
  const years = now.getFullYear() - b.getFullYear() - (had ? 0 : 1);
  return years < 0 ? '' : String(years);
}

const kidEntry = (p, k, date, inDays, turning) => {
  const label = `${k.name}’s birthday`;
  const short = `${label} · turning ${turning}`;
  return {
    p, inDays, date, label, kind: 'joy', short,
    sub: `${short} · ${prettyDate(date)}`, glyph: '✦',
  };
};

/* How long they've been married — worked out from the date when there is one,
   the same refusal kidAge makes above and for the same reason: a stored count
   is wrong by next anniversary and a since-date never is. Falls back to the
   typed count, which is all there is to say once no date has been given. */
function marriageYears(p) {
  if (!p.marriedOn) return p.marriedYears;
  const b = parseYmd(p.marriedOn), now = new Date();
  const had = now.getMonth() > b.getMonth()
    || (now.getMonth() === b.getMonth() && now.getDate() >= b.getDate());
  const years = now.getFullYear() - b.getFullYear() - (had ? 0 : 1);
  return years < 0 ? '' : String(years);
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

    kidsWithBirthdays(p).forEach(k => {
      const n = nextAnnual(k.birthday);
      if (n.inDays <= withinDays) out.push(kidEntry(p, k, n.date, n.inDays, n.years));
    });

    upcomingOf(p).forEach(({ r, o }) => {
      if (o.inDays < 0) return;
      /* A pregnancy outstays the window on purpose. Forty weeks is longer than
         any horizon worth setting, and it is the one date you want in sight
         from the day you hear about it. */
      if (o.inDays > withinDays && !isBaby(r)) return;
      out.push(dateEntry(p, r, o));
    });

    /* The season-shaped pregnancy has no occurrence of its own — seasons
       don't run through occurrenceOf/upcomingOf — so one is built here, the
       same way upcomingOf builds one for an ordinary date. */
    activeSeasons(p).filter(isPregnancy).forEach(r => {
      const date = pregnancyDate(r);
      out.push(dateEntry(p, r, { date, inDays: daysBetween(today(), date), years: 0 }));
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
    kidsWithBirthdays(p).forEach(k => {
      annualDates(k.birthday).forEach(date => {
        const turning = parseYmd(date).getFullYear() - parseYmd(k.birthday).getFullYear();
        out.push(kidEntry(p, k, date, daysBetween(today(), date), turning));
      });
    });

    recordsOf(p, 'upcoming').forEach(r => {
      const dates = r.repeatsYearly ? annualDates(r.date) : (within(r.date) ? [r.date] : []);
      dates.forEach(date => out.push(dateEntry(p, r, { date, inDays: daysBetween(today(), date), years: 0 })));
    });

    /* A pregnancy-season's due date, the same as any other date on this
       grid — parity with the legacy shape above, which already reaches the
       calendar via recordsOf(p, 'upcoming'). */
    activeSeasons(p).filter(isPregnancy).forEach(r => {
      const date = r.dueDate;
      if (within(date)) out.push(dateEntry(p, r, { date, inDays: daysBetween(today(), date), years: 0 }));
    });
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.p.name.localeCompare(b.p.name)));
}

/* Pregnancies near enough to say something about, under either shape. An
   ended season is already out of activeSeasons, so a birth naturally drops
   off this list the same moment it stops being "due". */
function babiesDue(withinDays = 30) {
  const out = [];
  people.forEach(p => {
    [...recordsOf(p, 'upcoming'), ...activeSeasons(p)].filter(isPregnancy).forEach(r => {
      const due = pregnancyDate(r);
      const inDays = daysBetween(today(), due);
      if (inDays > withinDays || inDays < -21) return;   // past three weeks over, let it be
      out.push({ p, r, inDays, gestation: gestationOn(due) });
    });
  });
  return out.sort((a, b) => a.inDays - b.inDays);
}

/* ─────────────────────────── photo handling ───────────────── */

