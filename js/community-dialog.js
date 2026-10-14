/* uses: RHYTHMS · $ $$ el plural prettyDate today · byId churchEvents communities openCommunity people queueSave
   · normaliseChurchEvent normaliseCommunity · toast
   · paintFacePick readFacePick
   · addExtraMeeting attendedEvent attendedMeeting churchEventById communityById communityPeople
     meetingDates removeChurchEvent removeCommunity removeExtraMeeting rhythmDates rhythmWords
     setAttended setSkipped startCommunityRoads
   · dayMonth leaveCommunity repaintCommunity showDiscipleTab weekdayShort
   · renderAll
*/

/* ── making or changing a community ──────────────────────────────
   Its name, when it meets, who leads it and who is in it — one dialog, the
   group dialog's shape with a rhythm and a second row of faces. Leaders and
   people are picked from the same circle and cannot be both: pressing a face
   in one row lets go of the same face in the other, so the two rows never
   disagree with what normaliseCommunity would have settled anyway. */
let editingCommunityId = null;

/* Anybody in the circle can lead. Only somebody who can have a road can be
   one of the people, because being one of them is what starts it — which is
   `people` exactly: not you, not a future connection. */
const pickable = () => [...people].sort((a, b) => a.name.localeCompare(b.name));

function communityDialog(id = null) {
  const c = id ? communityById(id) : null;
  editingCommunityId = c ? c.id : null;

  $('#dlg-community-title').textContent = c ? 'Edit community' : 'A new community';
  $('#c-name').value = c?.name || '';

  const sel = $('#c-every');
  if (!sel.options.length) RHYTHMS.forEach(([v, label]) => sel.append(new Option(label, v)));
  sel.value = c?.every || 'week';
  $('#c-from').value = c?.from || today();
  paintRhythmHint();

  $('#c-search').value = '';
  const list = pickable();
  $('#c-empty').hidden = list.length > 0;
  /* Stored ids, not the resolved ones — somebody who has not reached this
     device yet must not be dropped by the act of opening the dialog. They
     are simply not among the faces to un-tick; see saveCommunity. */
  paintFacePick($('#c-leaders'), list, c?.leaders || [], (pid, on) => keepApart('#c-members', pid, on));
  paintFacePick($('#c-members'), list, c?.members || [], (pid, on) => keepApart('#c-leaders', pid, on));
  paintCommunityCounts();
  $('#btn-community-delete').hidden = !c;

  $('#dlg-community').showModal();
  setTimeout(() => $('#c-name').focus(), 60);
}

/* A face pressed in one row is let go of in the other. */
function keepApart(other, pid, on) {
  if (on) {
    const twin = $$('.face-opt', $(other)).find(b => b.dataset.id === pid);
    if (twin) twin.setAttribute('aria-pressed', 'false');
  }
  paintCommunityCounts();
}

function paintCommunityCounts() {
  const l = readFacePick($('#c-leaders')).length;
  const m = readFacePick($('#c-members')).length;
  $('#c-leaders-count').textContent = l ? plural(l, 'leader', 'leaders') : 'tap a face';
  $('#c-members-count').textContent = m ? plural(m, 'person', 'people') : 'tap a face';
}

/* What the chosen day and frequency come to, said back while you choose
   them — the one place a monthly rhythm landing on "the last Friday" rather
   than "the fourth" is visible before it matters. */
function paintRhythmHint() {
  const from = $('#c-from').value;
  $('#c-rhythm-hint').textContent = from
    ? `${rhythmWords($('#c-every').value, from)}, from ${prettyDate(from)}.`
    : 'Pick the date it first met, or will first meet.';
}

/* One search over both rows of faces. Hiding rather than rebuilding, so a
   face already pressed stays pressed while it is out of sight. */
function filterCommunityPick() {
  const q = $('#c-search').value.trim().toLowerCase();
  $$('#c-leaders .face-opt, #c-members .face-opt').forEach(b => {
    b.hidden = !!q && !b.dataset.name.includes(q);
  });
}

function saveCommunity(e) {
  e.preventDefault();
  const name = $('#c-name').value.trim();
  if (!name) return;

  const c = editingCommunityId && communityById(editingCommunityId);
  /* What was ticked, plus anybody the pickers could not offer — the same
     courtesy saveGroup pays a member whose person is still on its way. */
  const shown = new Set(pickable().map(p => p.id));
  const unseen = list => (c ? list.filter(x => !shown.has(x)) : []);
  const before = new Set(c ? c.members : []);

  const next = normaliseCommunity({
    ...(c || {}),
    name,
    every: $('#c-every').value,
    from: $('#c-from').value,
    leaders: [...readFacePick($('#c-leaders')), ...unseen(c?.leaders || [])],
    members: [...readFacePick($('#c-members')), ...unseen(c?.members || [])],
  });
  if (c) Object.assign(c, next);
  else communities.push(next);

  /* Joining is what starts the road — silently, and only for the ones who
     have just joined. Somebody already in it is not started again; somebody
     taken out is not stopped, because leaving a community is not leaving the
     road, and nothing about either should be undone by tidying a list. */
  const started = startCommunityRoads(next.members.filter(id => !before.has(id)));

  queueSave();
  $('#dlg-community').close();
  renderAll();
  const roads = started ? ` · walking with ${plural(started, 'new person', 'new people')}` : '';
  toast((c ? `${name} saved` : `${name} made`) + roads);
}

function deleteCommunity() {
  const c = editingCommunityId && communityById(editingCommunityId);
  if (!c) return;
  if (!confirm(`Remove ${c.name}?\n\nEveryone in it stays in your circle and on the road with you — only the community and its register go.`)) return;
  if (openCommunity === c.id) leaveCommunity({ paint: false });
  removeCommunity(c.id);
  queueSave();
  $('#dlg-community').close();
  renderAll();
  toast(`${c.name} removed`);
}

/* ── one meeting, or one event, all at once ──────────────────────
   The register for a single column: everybody in the community as faces,
   pressed for the ones who came. Opened three ways — a meeting already on the
   map, a meeting on a day the rhythm did not lay out, or a church event — and
   the few things that differ between them are shown or hidden here rather
   than spread across three dialogs. */
let editingAttendance = null;

function attendanceDialog(communityId, { date = '', another = false, eventId = '' } = {}) {
  const c = communityById(communityId);
  if (!c) return;
  const ev = eventId ? churchEventById(eventId) : null;
  if (eventId && !ev) return;
  editingAttendance = { communityId, date, another, eventId };

  const skipped = !!date && c.skipped.includes(date);
  const extra = !!date && c.extra.includes(date)
    && rhythmDates(c.every, c.from, date, 1)[0] !== date;

  $('#att-title').textContent = ev ? ev.title
    : another ? 'A meeting on another day'
    : `${weekdayShort(date)} ${prettyDate(date)}`;
  $('#att-lede').textContent = ev ? `${weekdayShort(ev.date)} ${prettyDate(ev.date)} — who from ${c.name} was there?`
    : skipped ? 'Marked as not having met. Mark it as having met to fill in who came.'
    : `Who from ${c.name} came?`;

  $('#wrap-att-date').hidden = !another;
  $('#att-date').value = another ? today() : '';
  $('#att-date').required = another;

  const members = communityPeople(c).sort((a, b) => a.name.localeCompare(b.name));
  const came = members.filter(p => (ev ? attendedEvent(p, ev.id) : attendedMeeting(p, c.id, date))).map(p => p.id);
  paintFacePick($('#att-pick'), members, came, paintAttendanceCount);
  $('#att-empty').hidden = members.length > 0;
  /* A meeting that did not happen has no register to fill in. */
  $('#att-pick').hidden = skipped;
  $('#att-quick').hidden = skipped || !members.length;
  paintAttendanceCount();

  const skip = $('#btn-att-skip');
  skip.hidden = !!ev || another;
  skip.textContent = extra ? 'Remove this meeting' : skipped ? 'We did meet' : 'We didn’t meet';
  $('#btn-att-save').hidden = skipped;
  $('#btn-att-event').hidden = !ev;

  /* Already open when "We did meet" repaints it in place, to go straight on
     to filling in the register it has just made room for. */
  if (!$('#dlg-attendance').open) $('#dlg-attendance').showModal();
}

function paintAttendanceCount() {
  const n = readFacePick($('#att-pick')).length;
  $('#att-count').textContent = n ? `${n} came` : 'nobody yet';
}

function markEveryone(on) {
  $$('#att-pick .face-opt').forEach(b => b.setAttribute('aria-pressed', String(on)));
  paintAttendanceCount();
}

function saveAttendanceForm(e) {
  e.preventDefault();
  const { communityId, date, another, eventId } = editingAttendance || {};
  const c = communityById(communityId);
  if (!c) return;

  let on = date;
  if (another) {
    on = $('#att-date').value;
    if (!on) return;
    addExtraMeeting(c, on);
  }

  const came = new Set(readFacePick($('#att-pick')));
  for (const p of communityPeople(c)) {
    if (eventId) setAttended(p, 'event', eventId, '', came.has(p.id));
    else setAttended(p, 'meeting', c.id, on, came.has(p.id));
  }
  queueSave();
  $('#dlg-attendance').close();
  repaintCommunity();
  if (another && on > today()) toast(`Added for ${dayMonth(on)} — tick who came once it has happened`);
}

/* Didn't meet, did meet after all, or — for a meeting added on another
   day — not a meeting at all. The first and last clear a register, so they
   ask first when there is one to clear. */
function toggleMeetingHeld() {
  const { communityId, date } = editingAttendance || {};
  const c = communityById(communityId);
  if (!c || !date) return;
  const ticked = communityPeople(c).some(p => attendedMeeting(p, c.id, date));
  const extra = c.extra.includes(date) && rhythmDates(c.every, c.from, date, 1)[0] !== date;

  if (extra) {
    if (ticked && !confirm('Remove this meeting, and who was ticked at it?')) return;
    removeExtraMeeting(c, date);
  } else if (c.skipped.includes(date)) {
    setSkipped(c, date, false);
    queueSave();
    repaintCommunity();
    attendanceDialog(c.id, { date });
    return;
  } else {
    if (ticked && !confirm('Mark this meeting as not having happened? Who was ticked at it will be cleared.')) return;
    setSkipped(c, date, true);
  }
  queueSave();
  $('#dlg-attendance').close();
  repaintCommunity();
}

/* ── a church event ──────────────────────────────────────────────
   A title and a day. Who came is not asked here: that is answered from
   inside each community, where you know who its people are. */
let editingChurchEventId = null;

function churchEventDialog(id = null) {
  const ev = id ? churchEventById(id) : null;
  editingChurchEventId = ev ? ev.id : null;
  $('#dlg-church-event-title').textContent = ev ? 'This church event' : 'A church event';
  $('#ce-title').value = ev?.title || '';
  $('#ce-date').value = ev?.date || today();
  $('#btn-church-event-delete').hidden = !ev;
  $('#dlg-church-event').showModal();
  setTimeout(() => $('#ce-title').focus(), 60);
}

function saveChurchEvent(e) {
  e.preventDefault();
  const title = $('#ce-title').value.trim();
  const date = $('#ce-date').value;
  if (!title || !date) return;
  const ev = editingChurchEventId && churchEventById(editingChurchEventId);
  if (ev) Object.assign(ev, normaliseChurchEvent({ ...ev, title, date }));
  else churchEvents.push(normaliseChurchEvent({ title, date }));
  queueSave();
  $('#dlg-church-event').close();
  repaintCommunity();
}

function deleteChurchEvent() {
  const ev = editingChurchEventId && churchEventById(editingChurchEventId);
  if (!ev) return;
  if (!confirm(`Remove ${ev.title}?\n\nWho was ticked as being there goes with it.`)) return;
  removeChurchEvent(ev.id);
  queueSave();
  $('#dlg-church-event').close();
  repaintCommunity();
  toast(`${ev.title} removed`);
}

/* ── wiring ──────────────────────────────────────────────────────
   Called from wire(), before wireDialogLayers there — not that the order
   matters to the dialogs, which are static markup either way, but every
   button these three own is given its job in one place. */
function wireCommunities() {
  $('#disciple-tab-people').onclick = () => showDiscipleTab('people');
  $('#disciple-tab-communities').onclick = () => showDiscipleTab('communities');
  $('#btn-community-new').onclick = () => communityDialog();
  $('#btn-community-first').onclick = () => communityDialog();
  $('#btn-community-back').onclick = () => leaveCommunity();
  $('#btn-community-edit').onclick = () => communityDialog(openCommunity);

  $('#form-community').onsubmit = saveCommunity;
  $('#btn-community-cancel').onclick = () => $('#dlg-community').close();
  $('#btn-community-delete').onclick = deleteCommunity;
  $('#c-every').onchange = paintRhythmHint;
  $('#c-from').onchange = paintRhythmHint;
  $('#c-search').oninput = filterCommunityPick;

  $('#form-attendance').onsubmit = saveAttendanceForm;
  $('#btn-att-cancel').onclick = () => $('#dlg-attendance').close();
  $('#btn-att-all').onclick = () => markEveryone(true);
  $('#btn-att-none').onclick = () => markEveryone(false);
  $('#btn-att-skip').onclick = toggleMeetingHeld;
  /* Closed first rather than stacked under: the event dialog can rename or
     remove the very event this one is titled with. */
  $('#btn-att-event').onclick = () => {
    const id = editingAttendance?.eventId;
    $('#dlg-attendance').close();
    if (id) churchEventDialog(id);
  };

  $('#form-church-event').onsubmit = saveChurchEvent;
  $('#btn-church-event-cancel').onclick = () => $('#dlg-church-event').close();
  $('#btn-church-event-delete').onclick = deleteChurchEvent;
}
