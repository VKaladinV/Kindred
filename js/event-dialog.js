/* uses: TYPES · $ $$ today uid · byId queueSave · normaliseRecord
   · gestationOn gestationWords · renderAll
*/

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
  $('#e-date-label').textContent = t.dateLabel;
  $('#wrap-end').hidden = editingEvent.type !== 'season';
  $('#wrap-repeat').hidden = editingEvent.type !== 'upcoming';
  /* Only a season can be a pregnancy — it's the one type with a beginning and
     an end to carry it between. */
  $('#wrap-baby').hidden = editingEvent.type !== 'season';
  paintBabyFields();
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

function eventDialog(personId, eventId, presetType) {
  const rec = eventId ? byId(personId)?.events.find(x => x.id === eventId) : null;
  editingEvent = { personId, eventId, type: rec?.type || presetType || 'history' };

  $('#dlg-event-title').textContent = rec ? 'Edit this' : TYPES[editingEvent.type].dlgTitle;
  $('#e-date').value = rec?.date || today();
  $('#e-end').value = rec?.endDate || '';
  $('#e-baby').checked = !!rec?.dueDate;
  $('#e-due').value = rec?.dueDate || '';
  $('#e-title').value = rec?.title || '';
  $('#e-note').value = rec?.note || '';
  $('#e-repeat').checked = !!rec?.repeatsYearly;
  $('#btn-delete-event').hidden = !rec;

  setEventType(editingEvent.type);   // paints the baby/gestation fields too
  $('#dlg-event').showModal();
  setTimeout(() => $('#e-title').focus(), 60);
}

function saveEvent(e) {
  e.preventDefault();
  const p = byId(editingEvent.personId);
  if (!p) return;

  const title = $('#e-title').value.trim();
  if (!title) return;

  const existing = editingEvent.eventId ? p.events.find(x => x.id === editingEvent.eventId) : null;
  const baby = editingEvent.type === 'season' && $('#e-baby').checked;

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
  });

  if (existing) Object.assign(existing, data);
  else p.events.push(data);

  queueSave();
  $('#dlg-event').close();
  renderAll();
}

/* one dialog, two lists */
