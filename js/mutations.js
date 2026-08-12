/* uses: today · byId queueSave · markConnected undoConnected · toast · renderAll */

function endSeason(personId, recId) {
  const r = byId(personId)?.events.find(x => x.id === recId);
  if (!r) return;
  r.endDate = today();
  queueSave();
  renderAll();
  toast('Moved to their history');
}

function moveToHistory(personId, recId) {
  const r = byId(personId)?.events.find(x => x.id === recId);
  if (!r) return;
  r.type = 'history';
  r.repeatsYearly = false;
  queueSave();
  renderAll();
}

/* The tick in Today and Calendar — the same move moveToHistory already makes,
   just reached from the list a record is landing in rather than the page it
   lives on. Recorded here rather than left to call moveToHistory itself
   because a planned coffee or visit (connectKind) needs one thing more: the
   same tap that resolves the reminder is also the moment it happened, so it
   logs the touch too, in the one write.

   markConnected already carries its own toast and its own default Undo — a
   plain "Marked as done" here would be the wrong announcement for something
   that just told the person's whole check-in history they connected, so the
   custom undo is handed to it instead of raised separately. */
function completeUpcoming(personId, recId) {
  const p = byId(personId);
  const r = p?.events.find(x => x.id === recId);
  if (!r) return;
  r.type = 'history';
  r.repeatsYearly = false;
  const kind = r.connectKind;
  queueSave();
  renderAll();

  const undo = { label: 'Undo', run: () => undoCompleteUpcoming(personId, recId, kind) };
  if (kind) markConnected(personId, kind, undo);
  else toast('Marked as done', undo);
}

/* hadKind is passed rather than read back off the record, because by the time
   Undo might be pressed the record has already been through normalise on a
   sync or two and there is no promise the field survived unchanged — the
   closure captured what was actually true the moment it was completed. */
function undoCompleteUpcoming(personId, recId, hadKind) {
  const r = byId(personId)?.events.find(x => x.id === recId);
  if (!r) return;
  r.type = 'upcoming';
  /* Only ever today's touch, and only ever the one completeUpcoming just
     added — undoConnected already refuses to touch anything but today's.
     Its own toast is the confirmation here too, so nothing further is said
     about the record itself; without a touch to take back, this says so on
     its own instead. */
  if (hadKind) undoConnected(personId);
  else toast('Taken back');
  queueSave();
  renderAll();
}

const prayerBy = (personId, prayerId) => byId(personId)?.prayers.find(x => x.id === prayerId) || null;

/* One tick a day, and tapping it again takes it back — the same shape as a
   check-in, and for the same reason: the thing being recorded is the day,
   not the number of times you touched the screen. */
function togglePrayed(personId, prayerId) {
  const pr = prayerBy(personId, prayerId);
  if (!pr) return;
  pr.prayedAt = pr.prayedAt === today() ? '' : today();
  queueSave();
  renderAll();
}

/* Out of either archive and back onto the list. */
function reopenPrayer(personId, prayerId) {
  const pr = prayerBy(personId, prayerId);
  if (!pr) return;
  pr.answeredAt = null;
  pr.answerNote = '';
  pr.releasedAt = '';
  queueSave();
  renderAll();
}

function answerPrayer(personId, prayerId, note) {
  const pr = prayerBy(personId, prayerId);
  if (!pr) return;
  pr.answeredAt = today();
  pr.answerNote = note;
  pr.releasedAt = '';
  queueSave();
  renderAll();
  toast('Marked answered ✧');
}

/* Let go rather than answered. Nothing is lost — it moves to its own list,
   the way an answered one does, and the tick there brings it back. */
function releasePrayer(personId, prayerId) {
  const pr = prayerBy(personId, prayerId);
  if (!pr) return;
  pr.releasedAt = today();
  pr.answeredAt = null;
  pr.answerNote = '';
  queueSave();
  renderAll();
  toast('Let go — it is still in your list of released', {
    label: 'Undo',
    run: () => reopenPrayer(personId, prayerId),
  });
}

function deletePrayer(personId, prayerId) {
  const target = byId(personId);
  if (!target) return;
  target.prayers = target.prayers.filter(x => x.id !== prayerId);
  queueSave();
  renderAll();
}

/* ─────────────────────────── dialogs ───────────────────────── */

