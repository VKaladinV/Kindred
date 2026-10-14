/* uses: ATTEND_MEETINGS · $ $$ el formatter hashCode parseYmd plural prettyDate today · Store
   · byId churchEvents communities openCommunity people
   · avatar · GROUP_FACES packFaces · paintFaces
   · closeLayer openLayer · closeSheet openSheet
   · blockHead
   · attendedEvent attendedMeeting communitiesByName communitiesOf communityById
     communitiesLedBy communityLeaders communityPeople eventHeadcount eventRate firstNames
     meetingDates meetingRate nextMeeting pastChurchEvents rhythmShort rhythmWords
     setAttended upcomingChurchEvents
   · isWalking · renderDisciplePeople
   · attendanceDialog churchEventDialog
   · activeView queueSave quiet renderAll switchView
*/

/* ── the Discipleship tab, in two halves ─────────────────────────
   People you walk with yourself, and the communities you oversee — two
   folders of one tab, the same folder pair the prayer list wears
   (.sheet-tabs, css/controls.css). Whichever half you were last reading is
   the one you come back to: unlike the prayer list, where the open half is
   nearly always the one wanted, either half here can be somebody's whole
   use of the tab.

   Read lazily rather than at load, because nothing in these files runs as
   they load (see the foot of index.html). */
let discipleTab = null;

const currentDiscipleTab = () =>
  (discipleTab ||= Store.getPref('discipleTab', 'people') === 'communities' ? 'communities' : 'people');

function setDiscipleTab(key) {
  discipleTab = key;
  Store.setPref('discipleTab', key);
}

function showDiscipleTab(key) {
  if (currentDiscipleTab() === key) return;
  setDiscipleTab(key);
  renderDiscipleship();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* The painter views.js knows the tab by. Only the half on screen is painted:
   both grids are measured as they are laid out (paintFaces), and a hidden one
   measures nothing — so the other half is painted when it is shown instead,
   which showDiscipleTab does on its way in. */
function renderDiscipleship() {
  /* Removed on another device while it was open here. Noticed where it is
     next asked about, the same place and reason renderGroups notices a group. */
  if (openCommunity && !communityById(openCommunity)) dropOpenCommunity();
  const c = openCommunity && communityById(openCommunity);

  $('#disciple-out').hidden = !!c;
  $('#community-in').hidden = !c;
  if (c) { renderCommunityPage(c); return; }

  const tab = currentDiscipleTab();
  paintDiscipleTabs(tab);
  if (tab === 'people') renderDisciplePeople();
  else renderCommunities();
}

function paintDiscipleTabs(tab) {
  const onPeople = tab === 'people';
  [['#disciple-tab-people', onPeople], ['#disciple-tab-communities', !onPeople]].forEach(([sel, on]) => {
    $(sel).classList.toggle('is-on', on);
    $(sel).setAttribute('aria-selected', String(on));
  });
  $('#disciple-page-people').hidden = !onPeople;
  $('#disciple-page-communities').hidden = onPeople;
  $('#btn-disciple-add').hidden = !onPeople;
  $('#btn-community-new').hidden = onPeople;
  $('#disciple-sub').textContent = onPeople ? 'People I am walking a road with' : 'Communities I oversee';

  /* Each folder carries its own count, so there is something to see behind
     the other one without going to look — the same courtesy the prayer
     list's two folders pay each other. */
  const mine = people.filter(p => isWalking(p) && !communitiesOf(p.id).length).length;
  $('#disciple-n-people').textContent = mine || '';
  $('#disciple-n-communities').textContent = communities.length || '';
}

/* ── the communities folder ──────────────────────────────────────── */

function renderCommunities() {
  const grid = $('#grid-communities');
  grid.classList.toggle('no-entry', quiet);
  grid.textContent = '';
  /* No .is-hex, for the reason renderGroups gives: every one of these is the
     same size, so the plain grid packs them by itself. */
  grid.classList.remove('is-hex');
  communitiesByName().forEach(c => grid.append(communityBadge(c)));
  grid.hidden = !communities.length;
  $('#blank-communities').hidden = communities.length > 0;
  paintChurchEventList();
}

/* groupBadge's shape and groupBadge's classes — a disc of the faces in it —
   because from the outside a community is exactly that. What it adds is the
   day it meets under the name. data-community rather than data-group or
   data-id, so neither the group zoom nor the photo flight ever mistakes it
   for one of theirs. */
function communityBadge(c) {
  const members = communityPeople(c);
  const shown = members.slice(0, GROUP_FACES);

  const b = el('div', 'badge no-ring is-group is-community');
  b.dataset.community = c.id;

  const frame = el('button', 'badge-frame');
  frame.type = 'button';
  frame.setAttribute('aria-label', `Open ${c.name} — ${plural(members.length, 'person', 'people')}`);
  frame.style.setProperty('--tilt', ((hashCode(c.id) % 7) - 3) + 'deg');
  frame.onclick = () => enterCommunity(c.id);
  frame.append(packFaces(shown));

  const hidden = members.length - shown.length;
  if (hidden) {
    const more = el('div', 'badge-more', '+' + hidden);
    more.title = plural(hidden, 'more person', 'more people');
    frame.append(more);
  }

  b.append(frame, el('div', 'badge-name', c.name));
  const meta = [members.length ? plural(members.length, 'person', 'people') : 'nobody yet', rhythmShort(c.every, c.from)];
  b.append(el('div', 'badge-meta', meta.filter(Boolean).join(' · ')));
  return b;
}

/* The church's own dates, beneath the communities rather than inside any one
   of them: an event belongs to the whole church, and is ticked from inside
   each community only because that is where you know who came. */
function paintChurchEventList() {
  const box = $('#church-events');
  box.textContent = '';
  box.append(blockHead('Church events', () => churchEventDialog(), 'Add a church event'));

  if (!churchEvents.length) {
    box.append(el('p', 'quiet-note', 'None yet — a Sunday, a conference, a night of prayer. Add one here, then tick who came from inside each community.'));
    return;
  }
  /* What is coming first, nearest first; then what has been, newest first.
     Both read outward from today. */
  const past = pastChurchEvents().reverse();
  [...upcomingChurchEvents(), ...past].forEach(e => box.append(churchEventRow(e)));
}

function churchEventRow(e) {
  const ahead = e.date > today();
  const row = el('button', 'ce-row' + (ahead ? ' is-ahead' : ''));
  row.type = 'button';
  row.title = 'Change or remove this event';
  const n = eventHeadcount(e.id);
  row.append(
    el('span', 'ce-date', dayMonth(e.date)),
    el('span', 'ce-title', e.title),
    el('span', 'ce-count', ahead ? 'coming up' : n ? `${n} came` : 'nobody ticked'),
  );
  row.onclick = () => churchEventDialog(e.id);
  return row;
}

/* ── one community's page ────────────────────────────────────────
   The same kind of thing as standing inside a group: the tab's grid gives
   way to one community, and back takes you out again. No flight of faces on
   the way in — a community's page is mostly a register, not a bigger circle,
   and the group zoom's animation is about faces growing into their badges. */
let communityLayer = null;

function enterCommunity(id) {
  if (!communityById(id) || openCommunity === id) return;
  if (openCommunity) leaveCommunity({ paint: false });
  openCommunity = id;
  /* Back lands among the communities, which is where a community is. */
  setDiscipleTab('communities');
  communityLayer = openLayer(() => leaveCommunity({ fromBack: true }));
  renderDiscipleship();
  window.scrollTo({ top: 0 });
}

function leaveCommunity({ fromBack = false, paint = true } = {}) {
  if (!openCommunity) return;
  openCommunity = null;
  if (!fromBack) closeLayer(communityLayer);
  communityLayer = null;
  if (paint) {
    renderDiscipleship();
    window.scrollTo({ top: 0 });
  }
}

/* Deleted from under you, on this device or another. Called from inside the
   painter, so it paints nothing itself. */
function dropOpenCommunity() {
  openCommunity = null;
  closeLayer(communityLayer);
  communityLayer = null;
}

/* From somebody's page to the community they are in or lead — goToWalk's
   shape, for the same reason: the tab is where a community lives. */
function goToCommunity(id) {
  closeSheet();
  switchView('discipleship');
  enterCommunity(id);
}

function communitySub(c) {
  const n = communityPeople(c).length;
  const next = nextMeeting(c);
  return [
    c.from ? rhythmWords(c.every, c.from) : 'No day set yet',
    n ? plural(n, 'person', 'people') : 'nobody yet',
    next ? `next ${weekdayShort(next)} ${dayMonth(next)}` : '',
  ].filter(Boolean).join(' · ');
}

function renderCommunityPage(c) {
  $('#community-title').textContent = c.name;
  $('#community-sub').textContent = communitySub(c);
  paintCommunityLeaders(c);
  paintCommunityAttendance(c);

  /* Their faces last, as the ordinary dashboard of them: real rings, real
     sizes. Each opens the road's page rather than their ordinary one — this
     is a tab about the road — and renderSheet falls back to the ordinary one
     by itself for anybody whose road has since been stopped. */
  const grid = $('#grid-community');
  grid.classList.toggle('no-entry', quiet);
  grid.textContent = '';
  const members = communityPeople(c);
  paintFaces(grid, members, id => openSheet(id, 'walk'));
  grid.hidden = !members.length;
  $('#community-people-head').hidden = !members.length;
}

/* Who leads it, as faces you can open. Their ordinary page, since leading is
   not a road of their own. */
function paintCommunityLeaders(c) {
  const box = $('#community-leaders');
  box.textContent = '';
  const leaders = communityLeaders(c);
  box.hidden = !leaders.length;
  if (!leaders.length) return;
  box.append(el('span', 'cl-label', 'Led by'));
  leaders.forEach(p => {
    const b = el('button', 'cl-leader');
    b.type = 'button';
    b.setAttribute('aria-label', `Open ${p.name}`);
    b.append(avatar(p, 'cl-photo', false, 'thumb'), el('span', null, p.name.split(' ')[0]));
    b.onclick = () => openSheet(p.id);
    box.append(b);
  });
}

/* ── the register ────────────────────────────────────────────────
   Who came, drawn as a map: a row for each person, a column for each
   meeting, a dot where they were there. Two of them — the community's own
   meetings, and the church's events — because those are the two questions,
   and an answer to one says nothing about the other.

   Ticking a dot repaints this and nothing else. A whole renderAll would
   rebuild the faces underneath and replay their entrance under your thumb,
   and would throw away how far across the map you had scrolled. That is
   remembered here, per community and per map, and put back after. */
const attScroll = new Map();

/* Reads where each map was scrolled to before it is rebuilt — the one moment
   that is still on screen to be read. */
function paintCommunityAttendance(c) {
  const box = $('#community-att');
  $$('.att-scroll', box).forEach(s => attScroll.set(s.dataset.key, s.scrollLeft));
  box.classList.toggle('no-entry', quiet);
  box.textContent = '';
  /* By name rather than by need. A register is read across and down, and a
     row that moved because somebody's check-in fell due would be a row you
     had to find again. */
  const members = communityPeople(c).sort((a, b) => a.name.localeCompare(b.name));
  box.append(...[meetingMap(c, members), eventMap(c, members)].filter(Boolean));

  /* Back to where it was; or, the first time, to the far right, where the
     most recent meeting is. */
  $$('.att-scroll', box).forEach(s => {
    s.scrollLeft = attScroll.has(s.dataset.key) ? attScroll.get(s.dataset.key) : s.scrollWidth;
  });
}

/* Repainting after a dialog that changed something about the community you
   are standing in. Not renderAll, for the reason the register gives above. */
function repaintCommunity() {
  const c = openCommunity && communityById(openCommunity);
  if (c && activeView === 'discipleship') {
    $('#community-sub').textContent = communitySub(c);
    paintCommunityAttendance(c);
  } else {
    renderAll();
  }
}

function meetingMap(c, members) {
  const box = el('div', 'sheet-block att-block');
  box.append(blockHead('Who came', () => attendanceDialog(c.id, { another: true }), 'A meeting on another day'));

  const dates = meetingDates(c);
  if (!members.length) {
    box.append(el('p', 'quiet-note', 'Nobody in this community yet — Edit to add its people.'));
    return box;
  }
  if (!dates.length) {
    const next = nextMeeting(c);
    box.append(el('p', 'quiet-note', next
      ? `The first meeting is ${weekdayShort(next)} ${prettyDate(next)}. Its register appears here on the day.`
      : 'Set the day it meets (Edit), and its meetings lay themselves out here.'));
    return box;
  }

  const came = new Map(members.map(p => [p.id,
    new Set(p.attendance.filter(a => a.kind === 'meeting' && a.of === c.id).map(a => a.on))]));
  box.append(attMap({
    key: `${c.id}:meeting`,
    cols: dates.map(x => ({
      id: x,
      top: weekdayShort(x),
      bottom: dayMonth(x),
      label: `${weekdayShort(x)} ${prettyDate(x)}`,
      skipped: c.skipped.includes(x),
      open: () => attendanceDialog(c.id, { date: x }),
    })),
    rows: members,
    has: (p, col) => came.get(p.id).has(col.id),
    toggle: (p, col) => tickAttendance(c, p, 'meeting', col.id),
    rate: p => meetingRate(p, c, dates),
  }));
  box.append(el('p', 'hint att-hint', 'Tap a dot to tick it, or a date to fill in the whole meeting.'));
  return box;
}

/* Null with nobody in the community: the meetings map above already says so,
   and saying it twice is a page arguing with itself. */
function eventMap(c, members) {
  if (!members.length) return null;
  const box = el('div', 'sheet-block att-block');
  box.append(blockHead('Church events', () => churchEventDialog(), 'Add a church event'));

  const past = pastChurchEvents().slice(-ATTEND_MEETINGS);
  const ahead = upcomingChurchEvents();
  if (!past.length) {
    box.append(el('p', 'quiet-note', ahead.length
      ? 'Nothing has happened yet — tick who came once the day has been.'
      : 'No church events yet. Add a Sunday, a conference or a night of prayer, and tick who from here was there.'));
  } else {
    const came = new Map(members.map(p => [p.id,
      new Set(p.attendance.filter(a => a.kind === 'event').map(a => a.of))]));
    box.append(attMap({
      key: `${c.id}:event`,
      cols: past.map(e => ({
        id: e.id,
        top: e.title,
        bottom: dayMonth(e.date),
        label: `${e.title}, ${prettyDate(e.date)}`,
        open: () => attendanceDialog(c.id, { eventId: e.id }),
      })),
      rows: members,
      has: (p, col) => came.get(p.id).has(col.id),
      toggle: (p, col) => tickAttendance(c, p, 'event', col.id),
      rate: p => eventRate(p),
      isEvent: true,
    }));
  }
  if (ahead.length) {
    const line = el('p', 'att-ahead');
    line.append(el('b', null, 'Coming up '), document.createTextNode(
      ahead.slice(0, 3).map(e => `${e.title}, ${weekdayShort(e.date)} ${dayMonth(e.date)}`).join(' · ')));
    box.append(line);
  }
  return box;
}

function tickAttendance(c, p, kind, colId) {
  const on = kind === 'meeting' ? attendedMeeting(p, c.id, colId) : attendedEvent(p, colId);
  setAttended(p, kind, kind === 'meeting' ? c.id : colId, kind === 'meeting' ? colId : '', !on);
  queueSave();
  paintCommunityAttendance(c);
}

/* The map itself. A real table, so a screen reader can say which person and
   which date a dot belongs to; the name column stays put while the dates
   scroll under it, inside a box of its own, so a long register never makes
   the page itself scroll sideways on a phone. */
function attMap({ key, cols, rows, has, toggle, rate, isEvent = false }) {
  const scroll = el('div', 'att-scroll');
  scroll.dataset.key = key;
  const table = el('table', 'att-grid' + (isEvent ? ' is-events' : ''));

  const head = el('tr');
  head.append(el('th', 'att-corner'));
  cols.forEach(col => {
    const th = el('th', 'att-col' + (col.skipped ? ' is-skipped' : ''));
    th.scope = 'col';
    const b = el('button', 'att-col-btn');
    b.type = 'button';
    b.title = col.skipped ? `${col.label} — did not meet` : col.label;
    b.setAttribute('aria-label', `${col.label} — everyone at once`);
    b.append(el('span', 'att-col-top', col.top), el('span', 'att-col-day', col.bottom));
    b.onclick = col.open;
    th.append(b);
    head.append(th);
  });
  const thead = el('thead');
  thead.append(head);
  table.append(thead);

  const body = el('tbody');
  rows.forEach(p => {
    const tr = el('tr');
    const th = el('th', 'att-name');
    th.scope = 'row';
    const who = el('button', 'att-who');
    who.type = 'button';
    who.title = `Open ${p.name}’s discipleship page`;
    const r = rate(p);
    const words = el('span', 'att-who-words');
    words.append(el('span', 'att-who-name', p.name.split(' ')[0]),
      el('span', 'att-rate', r ? `${r.came}/${r.of}` : 'new'));
    who.append(avatar(p, 'att-photo', false, 'thumb'), words);
    who.onclick = () => openSheet(p.id, 'walk');
    th.append(who);
    tr.append(th);

    cols.forEach(col => {
      const td = el('td');
      const on = !col.skipped && has(p, col);
      const dot = el('button', 'att-dot' + (on ? ' is-on' : '') + (col.skipped ? ' is-skipped' : ''));
      dot.type = 'button';
      dot.disabled = !!col.skipped;
      dot.setAttribute('aria-pressed', String(on));
      dot.setAttribute('aria-label', `${p.name} — ${col.label}`);
      dot.onclick = () => toggle(p, col);
      td.append(dot);
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(body);
  scroll.append(table);
  return scroll;
}

/* ── on somebody's own discipleship page ──────────────────────────
   Where they stand, read off the same registers: every community they are
   in, the last few meetings as dots, and how many of those they were at; and
   the church's events the same way. Nothing to tick here — the register is
   the community's, and the name is a way back to it. Null when there is
   nothing of either, so the page has no empty heading to explain. */
function attendanceBlock(p) {
  const mine = communitiesOf(p.id);
  const events = eventRate(p);
  if (!mine.length && !events) return null;

  const box = el('div', 'sheet-block att-person');
  box.append(blockHead('Attendance'));

  mine.forEach(c => {
    const line = el('div', 'att-line');
    const top = el('div', 'att-line-top');
    const link = el('button', 'link-btn', c.name);
    link.type = 'button';
    link.onclick = () => goToCommunity(c.id);
    top.append(link);
    const leaders = communityLeaders(c);
    if (leaders.length) top.append(el('span', 'att-led', ` · led by ${firstNames(leaders)}`));
    line.append(top);

    const dates = meetingDates(c);
    const r = meetingRate(p, c, dates);
    const row = el('div', 'att-line-row');
    const dots = el('div', 'att-mini');
    dates.forEach(x => {
      const skipped = c.skipped.includes(x);
      const on = !skipped && attendedMeeting(p, c.id, x);
      const dot = el('span', 'att-mini-dot' + (on ? ' is-on' : '') + (skipped ? ' is-skipped' : ''));
      dot.title = `${weekdayShort(x)} ${prettyDate(x)} — ${skipped ? 'did not meet' : on ? 'came' : 'not there'}`;
      dots.append(dot);
    });
    row.append(dots, el('span', 'att-line-words', r
      ? `came ${r.came} of the last ${plural(r.of, 'meeting', 'meetings')}`
      : dates.length ? 'not ticked yet' : 'no meetings yet'));
    line.append(row);
    box.append(line);
  });

  if (events) {
    const line = el('div', 'att-line');
    line.append(el('div', 'att-line-top', 'Church events'),
      el('div', 'att-line-words', `came to ${events.came} of the last ${plural(events.of, 'event', 'events')}`));
    box.append(line);
  }
  return box;
}

/* ── their ordinary page ─────────────────────────────────────────
   One line of pills under their name: which communities they lead, and which
   they are in. For a leader this is the only place leading shows — they have
   no road of their own for it to sit on — and for anybody it is the way to
   the community from them. Null when there is neither. */
function communityPills(p) {
  const led = communitiesLedBy(p.id);
  const inside = communitiesOf(p.id);
  if (!led.length && !inside.length) return null;
  const row = el('div', 'group-pills community-pills');
  const pill = (c, words) => {
    const b = el('button', 'pill pill-group pill-community');
    b.type = 'button';
    b.append(el('span', 'glyph', '◎'), document.createTextNode(words));
    b.onclick = () => goToCommunity(c.id);
    row.append(b);
  };
  led.forEach(c => pill(c, `Leads ${c.name}`));
  inside.forEach(c => pill(c, c.name));
  return row;
}

/* ── how dates are said here ─────────────────────────────────────
   Short, because a column of the register is narrow: "Tue" over "14 Oct". */
/* The weekday in English, like every other word on the page (see DAY_NAMES);
   the date itself in whatever the device reads dates in, like every other
   date in the app (formatter, in util.js). */
const weekdayFmt = (() => {
  let f = null;
  return d => (f ||= new Intl.DateTimeFormat('en', { weekday: 'short' })).format(d);
})();
const dayMonthFmt = formatter({ day: 'numeric', month: 'short' });
const weekdayShort = s => weekdayFmt(parseYmd(s));
const dayMonth = s => dayMonthFmt(parseYmd(s));
