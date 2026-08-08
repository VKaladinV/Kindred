/* uses: HEALTH · $ el · byId queueSave · normaliseHealth
   · answerPrayer deletePrayer prayerBy releasePrayer · renderAll
*/

let editingHealth = { personId: null, key: 'medications', id: null };

function healthDialog(personId, key, id) {
  const meta = HEALTH[key];
  const item = id ? byId(personId)?.[key].find(x => x.id === id) : null;
  editingHealth = { personId, key, id };

  $('#dlg-health-title').textContent = item ? meta.editTitle : meta.newTitle;
  $('#h-name-label').textContent = meta.nameLabel;

  const detailLabel = $('#h-detail-label');
  detailLabel.textContent = meta.detailLabel + ' ';
  detailLabel.append(el('em', null, 'optional'));

  $('#h-name').value = item?.name || '';
  $('#h-name').placeholder = meta.namePlaceholder;
  $('#h-detail').value = item?.detail || '';
  $('#h-detail').placeholder = meta.detailPlaceholder;
  $('#btn-delete-health').hidden = !item;

  $('#dlg-health').showModal();
  setTimeout(() => $('#h-name').focus(), 60);
}

function saveHealth(e) {
  e.preventDefault();
  const { personId, key, id } = editingHealth;
  const p = byId(personId);
  if (!p) return;

  const name = $('#h-name').value.trim();
  if (!name) return;
  const detail = $('#h-detail').value.trim();

  if (id) {
    const item = p[key].find(x => x.id === id);
    if (item) Object.assign(item, normaliseHealth({ ...item, name, detail }));
  } else {
    p[key].push(normaliseHealth({ name, detail }));
  }
  queueSave();
  $('#dlg-health').close();
  renderAll();
}

/* Taking something off the list is three different acts wearing one gesture,
   so the dialog asks which. Answered keeps the story; let go keeps the fact
   that you carried it; remove is for the one you typed by mistake. */
let releasing = { personId: null, prayerId: null };

function askRelease(personId, prayerId, text) {
  releasing = { personId, prayerId };
  $('#release-lede').textContent = '“' + text + '”';
  $('#a-note').value = '';
  $('#dlg-release').showModal();
  setTimeout(() => $('#a-note').focus(), 60);
}

function saveAnswered(e) {
  e.preventDefault();
  answerPrayer(releasing.personId, releasing.prayerId, $('#a-note').value.trim());
  $('#dlg-release').close();
}

function saveReleased() {
  releasePrayer(releasing.personId, releasing.prayerId);
  $('#dlg-release').close();
}

function saveRemoved() {
  const pr = prayerBy(releasing.personId, releasing.prayerId);
  if (pr && !confirm(`Remove “${pr.text}” altogether? Letting it go keeps it; this does not.`)) return;
  deletePrayer(releasing.personId, releasing.prayerId);
  $('#dlg-release').close();
}

/* ─────────────────────────── backup ───────────────────────── */

