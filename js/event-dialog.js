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
  $('#wrap-end').hidden = editingEvent.type !== 'season';
  $('#wrap-repeat').hidden = editingEvent.type !== 'upcoming';
  paintBabyFields();
}

/* A due date can be arrived at from either end: you either know the date, or
   you know how far along they are today. Filling in one works out the other,
   so whichever the person actually told you is the one you type. The kind can
   change without the type changing, so this is called from both. */
function paintBabyFields() {
  const t = TYPES[editingEvent.type];
  const baby = editingEvent.type === 'upcoming' && $('#e-kind').value === 'baby';

  $('#wrap-gestation').hidden = !baby;
  $('#wrap-repeat').hidden = editingEvent.type !== 'upcoming' || baby;
  $('#e-date-label').textContent = baby ? 'Due date' : t.dateLabel;
  if (baby) {
    $('#e-title').placeholder = 'A baby on the way';
    /* The title is required, and for this one kind there is an obvious answer.
       Filling it in means a due date alone is enough to save. */
    if (!$('#e-title').value.trim()) $('#e-title').value = 'A baby on the way';
    paintGestationFrom($('#e-date').value);
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
  $('#e-kind').value = rec?.kind || 'other';
  $('#e-title').value = rec?.title || '';
  $('#e-note').value = rec?.note || '';
  $('#e-repeat').checked = !!rec?.repeatsYearly;
  $('#btn-delete-event').hidden = !rec;

  setEventType(editingEvent.type);   // paints the gestation fields too
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
