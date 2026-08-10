/* uses: $ · byId queueSave · normalisePrayer · renderAll */

let prayerPersonId = null;

function prayerDialog(personId) {
  prayerPersonId = personId;
  $('#pr-text').value = '';
  $('#dlg-prayer').showModal();
  setTimeout(() => $('#pr-text').focus(), 60);
}

function savePrayer(e) {
  e.preventDefault();
  const text = $('#pr-text').value.trim();
  if (!text) return;
  const p = byId(prayerPersonId);
  if (!p) return;
  p.prayers.push(normalisePrayer({ text }));
  queueSave();
  $('#dlg-prayer').close();
  renderAll();
}
