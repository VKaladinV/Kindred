/* uses: $ $$ · byId me openGroup openId · avatar
   · paintCircleCount renderCircle renderFuture · renderGroups leaveGroup · renderPrayers
   · paintTodayCount renderToday
   · calPicked clearPickedDay renderCalendar · renderSheet
   · renderDiscipleship
*/

let activeView = 'circle';

function switchView(name) {
  activeView = name;
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

  /* Standing inside a group is the same kind of thing as an open day, and goes
     the same way for the same reason: a layer left standing for it would make a
     later back press zoom out of a group nobody is looking at. Silent, because
     there is nothing to zoom out of once the view it happened in is hidden. */
  if (name !== 'groups' && openGroup) leaveGroup({ animate: false });

  /* Anything that changed while this view was hidden is paid for here, now
     that it can be seen. The circle is repainted whether or not it was noted
     as stale: renderCircle measures the grid to work out how many faces fit
     across, and a hidden grid measures zero — which is what used to make the
     faces come back stacked with their discs missing. The one render that
     reads the DOM always runs while that DOM can be seen. */
  /* Groups is in here for the same reason: inside a group it paints through
     paintFaces, which measures the grid to work out how many faces fit across,
     and a hidden grid measures zero. Discipleship paints through the same
     function, over a narrower list. Whichever of the three reads the DOM, it
     reads it while that DOM can be seen. */
  if (name === 'circle' || name === 'groups' || name === 'discipleship') { stale.delete(name); painters[name](); }
  else paintIfStale(name);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* The face in the corner of the title. Nothing there until you have made a
   profile, and then the same avatar everyone else gets. */
function renderMe() {
  const b = $('#btn-me');
  if (!b) return;
  b.textContent = '';
  b.classList.toggle('is-empty', !me);
  if (me) {
    b.append(avatar(me, 'badge-photo'));
    b.setAttribute('aria-label', `Your profile — ${me.name}`);
    b.title = 'Your profile';
  } else {
    b.append(document.createTextNode('＋'));
    b.setAttribute('aria-label', 'Make a profile for yourself');
    b.title = 'Make a profile for yourself';
  }
}

/* ───────────── painting only what is being looked at ─────────────
   renderAll used to rebuild all five views on every edit. Ticking one prayer
   meant laying out the whole circle, three lists and twelve months of
   calendar — around four hundred day cells, every one of them measured and
   labelled — of which the reader could see exactly one view.

   So each view is painted when it is on screen and noted as stale otherwise,
   and switchView pays the cost on the way in, where it is a repaint the
   reader asked for rather than a stall in the middle of typing. The two
   things a view paints outside itself — the Today pip and the circle's two
   lines of prose — are painted every time regardless, because those are on
   screen whichever view is open.

   The sheet is not in here: it is a layer over the top, so it is repainted
   whenever it is open, whatever is behind it. */
const painters = {
  circle: renderCircle,
  groups: renderGroups,
  future: renderFuture,
  prayers: renderPrayers,
  today: renderToday,
  calendar: renderCalendar,
  discipleship: renderDiscipleship,
};

const stale = new Set();

function renderAll() {
  for (const name of Object.keys(painters)) {
    if (name === activeView) painters[name]();
    else stale.add(name);
  }
  /* Each of these is already painted by its own view's render, so they are
     only wanted here when that view was the one skipped. paintTodayCount
     walks every person twice over to count what is due — worth not doing
     again on the one view that has just done it. */
  if (activeView !== 'today') paintTodayCount();
  if (activeView !== 'circle') paintCircleCount();
  renderMe();
  if (openId) renderSheet();
}

/* Everything, now, with nothing left owing. The one caller is boot: the first
   paint has no "current view" worth trusting yet, and a view that is stale
   before it has ever been drawn would flash empty the first time it is
   opened. */
function renderEverything() {
  for (const name of Object.keys(painters)) painters[name]();
  stale.clear();
  /* No paintTodayCount or paintCircleCount here: every view has just been
     painted, and those two came with them. */
  renderMe();
  if (openId) renderSheet();
}

function paintIfStale(name) {
  if (!stale.has(name)) return;
  stale.delete(name);
  painters[name]();
}

/* ───────────── a repaint nobody asked for ─────────────
   Opening a person, switching view, changing a filter: those are arrivals,
   and the entrance animations were written for them. A sync landing in the
   background is not an arrival — the same animation replayed under a cursor
   is what reads as the screen wiping itself, several times a paragraph.

   Read by every render function at the moment it empties its container, in
   the same style as circleFlip: taken where it is needed rather than passed
   down through six signatures, and every existing caller of renderAll leaves
   it false and gets exactly the repaint it always got. */
let quiet = false;

function renderQuiet() {
  quiet = true;
  try { renderAll(); } finally { quiet = false; }
}

const isWriting = () => {
  const a = document.activeElement;
  return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable));
};

/* sync.js's only way in. Everything else that repaints is something the
   reader just did and wants to see at once; this one arrives unannounced,
   and rebuilding the page under a cursor takes the focus, the caret and — on
   a phone — the keyboard with it. The data has already landed by the time
   this runs, so holding the picture back costs nothing but a moment of
   staleness, and the moment ends as soon as the writing does. */
let heldRender = false;

function renderRemote() {
  /* One thing is never worth waiting for: the person on screen having been
     removed somewhere else. There is nothing useful to type into a page about
     somebody who is gone, and renderSheet is what notices and closes it. */
  const orphaned = openId && !byId(openId);
  if (!orphaned && (isWriting() || $$('dialog[open]').length)) { heldRender = true; return; }
  heldRender = false;
  renderQuiet();
}

function flushHeldRender() {
  if (!heldRender || isWriting() || $$('dialog[open]').length) return;
  heldRender = false;
  renderQuiet();
}

/* ─────────────────────────── wiring ───────────────────────── */

