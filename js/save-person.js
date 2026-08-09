/* uses: $ · Store
   · addToRoster byId futures moveIntoCircle notifyMutate saveRoster
   · blobMark dropPhoto putPhoto
   · normalise · toast · openSheet
   · editingPersonId makingFuture makingSelf pendingOriginal pendingPhoto personDialog readGroupPick
   · renderAll
*/

async function savePerson(e) {
  e.preventDefault();
  const name = $('#f-name').value.trim();
  if (!name) return;

  /* Editing keeps whatever the record already was; only a brand new one takes
     it from which button opened the dialog. */
  const editing = editingPersonId ? byId(editingPersonId) : null;
  const self = editing ? editing.isSelf : makingSelf;
  const future = editing ? !!editing.isFuture : makingFuture;

  const data = {
    name,
    relationship: (self || future) ? '' : $('#f-relationship').value,
    /* All three hidden in self or future mode, so their inputs hold whatever
       the last person edited left behind. Forced rather than read. */
    groups: (self || future) ? [] : readGroupPick(),
    birthday: future ? '' : $('#f-birthday').value,
    contact: $('#f-contact').value,
    occupation: $('#f-occupation').value,
    cadenceDays: (self || future) ? 0 : Number($('#f-cadence').value),
    isSelf: self,
    isFuture: future,
  };

  const isNew = !editingPersonId;
  let target;
  if (editingPersonId) {
    target = editing;
    Object.assign(target, normalise({ ...target, ...data }));
  } else {
    target = normalise(data);
    addToRoster(target);
  }

  if (pendingPhoto === null) {
    await dropPhoto(target.id);
    await Store.deleteOriginal(target.id);
  } else if (pendingPhoto) {
    /* A truthiness test now that a crop is a pair of blobs rather than a
       string — undefined still means the photo was never touched, and null
       still means it was cleared. */
    await putPhoto(target.id, { ...pendingPhoto, mark: await blobMark(pendingPhoto.full) });
    if (pendingOriginal) await Store.saveOriginal(target.id, pendingOriginal);
  }

  await saveRoster();
  notifyMutate();
  $('#dlg-person').close();
  renderAll();
  // a person's page opens only when their photo is tapped
  if (isNew) {
    if (self) { openSheet(target.id); toast('Your profile is made — this is the page others will see once you link'); }
    else if (future) toast(`${name.split(' ')[0]} is on your list — tap their photo to add more`);
    else toast(`${name.split(' ')[0]} is in your circle — tap their photo to add more`);
  }
}

/* "They go into the circle" — the one door out of the future-connections
   list. Relationship, groups, cadence and birthday were hidden and empty
   while they were a prospect, so the edit dialog reopens straight away to
   fill them in rather than leaving a circle member with none of them set. */
async function promoteToCircle(id) {
  const p = futures.find(x => x.id === id);
  if (!p) return;
  moveIntoCircle(p);
  await saveRoster();
  notifyMutate();
  renderAll();
  toast(`${p.name.split(' ')[0]} is in your circle now`);
  personDialog(p);
}

/* one dialog, three shapes */
