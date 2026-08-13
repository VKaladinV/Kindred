/* uses: $ $$ el pad parseYmd plural prettyDate shortMonth today ymd
   · datesIn · clamp · block todayRow · closeLayer openLayer · quiet
   · completeTask completeUpcoming · taskQuickAdd
*/

const MONTH_NAMES = 'January February March April May June July August September October November December'.split(' ');
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* A year, laid out end to end. Paging a month at a time meant pressing the
   arrow and losing the thread of what came before it; a year in one scroll
   is the shape of the question people actually ask of a calendar. The bar at
   the top freezes and still steps month to month — it just scrolls there
   rather than redrawing. */
const MONTHS_AHEAD = 12;

let calPicked = '';     // the day that has taken over its month, '' for none
let calLayer = null;    // the back-button layer, while a day is open
let calSeen = '';       // the month the frozen bar is naming, as 'YYYY-MM'
let calWatch = null;    // the observer telling it which month that is
let calFlipFrom = null; // { date, rect } — where that day sat before this render
let calPin = 0;         // the height the open month must go on filling, in px

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

const dayCell = date => $(`#calendar-body .cal-day[data-date="${date}"]`);

/* ── a day taking over its month ─────────────────────────────────
   Tapping a day sends its number to the top of that month, clears the rest
   of the month out of the way, and gives the day the room. Back sends it
   back down and the month reassembles around it.

   The month keeps the exact height it had while that happens. That is the
   whole reason this is safe inside a year-long scroll: a section that
   collapsed would drag every month below it up the page, and the browser
   would re-clamp the scroll on the way. Nothing shortens, so nothing moves.

   A pin can only ever be slack, never tight — the grid loses five of its six
   rows and the day's list is a subset of the month's — so a min-height is
   enough, and can never be the thing making a section too tall. */

/* Both directions run through here: opening reads the number out of the
   grid, closing reads it out of the corner, and the render that follows
   carries it from wherever it was to wherever it lands. */
function markFlip(date) {
  const cell = dayCell(date);
  if (cell) calFlipFrom = { date, rect: cell.getBoundingClientRect() };
}

function pickDay(date) {
  if (calPicked === date) return unpickDay();
  markFlip(date);
  const section = monthSection(date.slice(0, 7));
  calPin = section ? section.getBoundingClientRect().height : 0;
  calPicked = date;
  if (!calLayer) calLayer = openLayer(unpickDay);
  renderCalendar();
  dayCell(date)?.focus({ preventScroll: true });
}

/* Also the close callback the back button reaches. By then popstate has
   already taken the layer off the list, so closeLayer finds nothing and does
   nothing — which is exactly what it is built for. */
function unpickDay() {
  if (!calPicked) return;
  const was = calPicked;
  markFlip(was);
  calPicked = '';
  calPin = 0;
  const layer = calLayer;
  calLayer = null;
  if (layer) closeLayer(layer);
  renderCalendar();
  dayCell(was)?.focus({ preventScroll: true });
}

/* For the ways out that are not the back button — leaving the tab. Silent,
   because that is not a day being closed; it is simply no longer what you
   are looking at. */
function clearPickedDay() {
  calPicked = '';
  calPin = 0;
  calFlipFrom = null;
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

  /* Open means this is the month the picked day belongs to — the only one
     that changes shape, and the only one that has to hold its place. */
  const open = calPicked && calPicked.startsWith(key);

  const section = el('section', 'cal-month');
  section.dataset.month = key;
  if (open && calPin) section.style.minHeight = calPin + 'px';
  section.append(el('h3', 'cal-month-name', monthLabel(first)));

  const grid = el('div', 'cal-grid');
  grid.classList.toggle('is-zoomed', !!open);
  /* Only while something is actually moving, so the fade stays off the
     renders that every ordinary edit triggers. */
  grid.classList.toggle('is-flipping', !!calFlipFrom);
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

  /* An open day takes over its own month and leaves the other eleven whole.
     An empty day still opens and still says so — a tap that answers nothing
     reads as the app having missed you. */
  const shown = open ? (onDay[calPicked] || []) : mine;

  let details;
  if (shown.length) {
    details = block(open ? prettyDate(calPicked) : 'Everything this month');
    shown.forEach(x => details._list.append(todayRow(x.p, {
      when: `${x.glyph} ${open ? '' : parseYmd(x.date).getDate() + ' ' + shortMonth(x.date)}`.trim(),
      calm: x.date !== today(),
      sub: x.short,
      done: x.done,
      onDone: rowDone(x),
    })));
  } else {
    details = el('p', 'quiet-note', open
      ? 'Nothing on that day.'
      : 'Nothing this month — birthdays and any date you have noted would show here.');
  }
  if (open) details.classList.add('cal-enter');
  section.append(details);

  /* Only inside an open day, because only then is there a day for what you
     add to land on — and it is handed that day rather than today's. Below
     the list rather than up in the heading, so it is the last thing on an
     empty day as well as a full one: a day with nothing on it is exactly
     when this is worth reaching for. */
  if (open) {
    section.append(taskQuickAdd({ date: calPicked }));
  }

  return section;
}

/* Which tick a row gets, if any. A to-do is ticked off where it stands and
   keeps its date; a planned coffee becomes history and a check-in. Both are
   "I did this", and they are two different writes — see completeTask and
   completeUpcoming, in js/mutations.js. */
const rowDone = x =>
  x.isTask ? (x.done ? null : () => completeTask(x.p.id, x.id))
    : x.completable ? () => completeUpcoming(x.p.id, x.id)
      : null;

/* The number, carried from where it was to where it now is.

   A CSS transition rather than element.animate, because the stylesheet's one
   reduced-motion rule zeroes transition and animation durations and knows
   nothing about the Web Animations API — staying in CSS means that setting is
   honoured here for free, with no second mechanism to keep in step.

   Rects are viewport-relative and deliberately not corrected for scroll: this
   is about where the thing looked like it was, and the finger saw the
   viewport. Pinning the section means nothing scrolled anyway. */
function flipDay(body) {
  const from = calFlipFrom;
  calFlipFrom = null;
  if (!from) return;

  const cell = body.querySelector(`.cal-day[data-date="${from.date}"]`);
  if (!cell) return;

  const now = cell.getBoundingClientRect();
  const dx = from.rect.left - now.left;
  const dy = from.rect.top - now.top;
  if (!dx && !dy) return;

  cell.style.transition = 'none';
  cell.style.transform = `translate(${dx}px, ${dy}px)`;
  void cell.offsetWidth;            // the same reflow the toast forces, for the same reason
  cell.style.transition = '';
  cell.style.transform = '';
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
  body.classList.toggle('no-entry', quiet);
  body.replaceChildren(frag);

  paintCalBar();
  watchMonths();
  flipDay(body);
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

