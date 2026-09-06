/* uses: TOUCH_KINDS TYPES · $ $$ el today uid · byId ensureSelf me people queueSave
   · normaliseRecord · gestationOn gestationWords · renderAll
*/

let editingEvent = { personId: null, eventId: null, type: 'history', connectKind: '' };

/* Who the record belongs to, asked only when there is a real question. A
   to-do can be about nobody, and the calendar's own add button opens this
   dialog with nobody in hand — those are the two cases, and both are read
   off the state rather than passed in as a flag.

   '' means you. Your own profile is an ordinary person record, so a to-do of
   your own is an ordinary record on it; ensureSelf (js/state.js) makes one
   at the moment of saving if there is not one yet.

   The holder is added to the list when it is somebody the list would not
   otherwise offer — a future connection, say — so that opening an existing
   record can never quietly re-point it at somebody else just by being
   opened and saved again. */
function paintEventWho(holderId) {
  const sel = $('#e-who');
  sel.textContent = '';
  sel.append(new Option('Just me', ''));

  const offered = [...people].sort((a, b) => a.name.localeCompare(b.name));
  const mine = me && holderId === me.id;
  if (holderId && !mine && !offered.some(p => p.id === holderId)) {
    const held = byId(holderId);
    if (held) offered.unshift(held);
  }
  offered.forEach(p => sel.append(new Option(p.name, p.id)));
  sel.value = mine ? '' : (holderId || '');
}

function setEventType(type) {
  editingEvent.type = TYPES[type] ? type : 'history';
  const t = TYPES[editingEvent.type];
  const isTask = editingEvent.type === 'task';

  /* Scoped to the type-picker itself — #how-pick (js/check-in.js) builds its
     own buttons from the same .type-opt class, and an unscoped selector here
     would walk into those too and read every one of them as "not the current
     type," clearing whatever it had. */
  $$('#type-pick .type-opt').forEach(b => {
    const on = b.dataset.type === editingEvent.type;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', String(on));
  });

  /* A to-do has no tab in the strip above to land on — fillSelects (js/wire.js)
     builds it from Past/Future/Present only — so showing the strip while
     editing one would read as a live control pointing at nothing. */
  $('#type-pick').hidden = isTask;
  $('#type-hint').hidden = isTask;
  $('#type-hint').textContent = t.hint;
  $('#e-title-label').textContent = t.titleLabel;
  $('#e-title').placeholder = t.placeholder;
  $('#e-date-label').textContent = t.dateLabel;
  $('#wrap-end').hidden = editingEvent.type !== 'season';
  $('#wrap-repeat').hidden = editingEvent.type !== 'upcoming';
  /* Only a season can be a pregnancy — it's the one type with a beginning and
     an end to carry it between. Only a Future record can be a planned
     connect — a past or ongoing thing was not planned, it simply happened or
     is happening. */
  $('#wrap-baby').hidden = editingEvent.type !== 'season';
  $('#wrap-connect').hidden = editingEvent.type !== 'upcoming';
  /* A to-do always asks, because it is the one kind that can be about
     nobody. Anything opened without somebody already in hand asks too — that
     is the calendar's add button, which knows the day but not the person,
     and switching the type away from To do there must not leave the record
     with nowhere to go. */
  $('#wrap-e-who').hidden = editingEvent.type !== 'task' && !!editingEvent.personId;
  paintBabyFields();
  paintConnectKind();
}

/* The kind picker under the connect checkbox — built the same way howDialog
   already builds #how-pick (js/check-in.js), from the exact TOUCH_KINDS a
   touch is logged under, so a planned coffee and an ad-hoc one speak the
   same vocabulary. Rebuilt fresh on every paint rather than merely toggled,
   the same as #how-pick's own; what is actually picked lives on
   editingEvent rather than being read back off whichever button happens to
   still be on screen. */
function paintConnectKind() {
  const on = editingEvent.type === 'upcoming' && $('#e-connect').checked;
  $('#wrap-connect-kind').hidden = !on;
  if (!on) return;

  const pick = $('#connect-kind-pick');
  pick.textContent = '';
  Object.entries(TOUCH_KINDS).forEach(([key, v]) => {
    const isOn = key === editingEvent.connectKind;
    const b = el('button', 'type-opt' + (isOn ? ' is-on' : ''));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(isOn));
    b.append(el('span', 'glyph', v.glyph), el('span', null, v.label));
    /* Tapping the one already picked clears it — the whole thing stays
       optional, the same as an ad-hoc touch's own kind. */
    b.onclick = () => {
      editingEvent.connectKind = editingEvent.connectKind === key ? '' : key;
      paintConnectKind();
    };
    pick.append(b);
  });
}

/* A due date can be arrived at from either end: you either know the date, or
   you know how far along they are today. Filling in one works out the other,
   so whichever the person actually told you is the one you type. Whether it's
   a pregnancy can change without the type changing, so this is called from
   both setEventType and the checkbox itself. */
function paintBabyFields() {
  const baby = editingEvent.type === 'season' && $('#e-baby').checked;
  $('#wrap-gestation').hidden = !baby;
  if (baby) {
    /* The title is required, and for this one case there is an obvious
       answer — filling it in means a due date alone is enough to save. */
    if (!$('#e-title').value.trim()) $('#e-title').value = 'Expecting a baby';
    paintGestationFrom($('#e-due').value);
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

/* presetDate is the calendar's: the day you opened, so what you add lands on
   the day you were looking at rather than on today. */
function eventDialog(personId, eventId, presetType, presetDate) {
  const rec = eventId ? byId(personId)?.events.find(x => x.id === eventId) : null;
  editingEvent = { personId, eventId, type: rec?.type || presetType || 'history', connectKind: rec?.connectKind || '' };

  /* One title for every tab rather than three — the dialog is a single tool
     with a type-switch inside it, not three dialogs sharing a shell, and the
     title should say so. */
  $('#dlg-event-title').textContent = rec ? 'Edit this' : 'Remember important information';
  paintEventWho(personId);
  $('#e-date').value = rec?.date || presetDate || today();
  $('#e-end').value = rec?.endDate || '';
  $('#e-baby').checked = !!rec?.dueDate;
  $('#e-due').value = rec?.dueDate || '';
  $('#e-title').value = rec?.title || '';
  $('#e-note').value = rec?.note || '';
  $('#e-repeat').checked = !!rec?.repeatsYearly;
  $('#e-connect').checked = !!rec?.connectKind;
  $('#btn-delete-event').hidden = !rec;

  setEventType(editingEvent.type);   // paints the baby/gestation/connect fields too
  $('#dlg-event').showModal();
  setTimeout(() => $('#e-title').focus(), 60);
}

function saveEvent(e) {
  e.preventDefault();

  /* Whoever the row is offering, when it is on screen at all; otherwise
     whoever the dialog was opened from. ensureSelf is called only here, at
     the moment there is actually something to put on your profile — asking
     for one earlier would leave an empty card behind every time somebody
     opened this dialog and thought better of it. */
  const asked = !$('#wrap-e-who').hidden;
  const p = asked
    ? ($('#e-who').value ? byId($('#e-who').value) : ensureSelf())
    : byId(editingEvent.personId);
  if (!p) return;

  const title = $('#e-title').value.trim();
  if (!title) return;

  const was = editingEvent.personId ? byId(editingEvent.personId) : null;
  const existing = editingEvent.eventId ? was?.events.find(x => x.id === editingEvent.eventId) : null;
  const baby = editingEvent.type === 'season' && $('#e-baby').checked;
  const connect = editingEvent.type === 'upcoming' && $('#e-connect').checked;

  const data = normaliseRecord({
    id: editingEvent.eventId || uid(),
    type: editingEvent.type,
    date: $('#e-date').value || today(),
    endDate: $('#e-end').value,
    dueDate: baby ? $('#e-due').value : '',
    /* Nothing in the dialog sets this any more, but a record made before this
       update may still carry one — carried forward on an edit rather than
       reset to 'other' the moment its note gets touched. */
    kind: existing?.kind || '',
    title,
    note: $('#e-note').value.trim(),
    repeatsYearly: $('#e-repeat').checked,
    connectKind: connect ? editingEvent.connectKind : '',
  });

  /* Pointing a to-do at somebody else moves the record rather than copying
     it: the row keeps its id, so on the server it is the same row changing
     which person it hangs from, and nothing of what was written on it is
     left behind on the old one. */
  if (existing && was && was.id !== p.id) {
    was.events = was.events.filter(x => x.id !== existing.id);
    p.events.push(data);
  } else if (existing) Object.assign(existing, data);
  else p.events.push(data);

  queueSave();
  $('#dlg-event').close();
  renderAll();
}

/* one dialog, two lists */
