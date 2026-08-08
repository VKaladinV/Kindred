/* uses: today · byId queueSave · toast · renderAll */

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

