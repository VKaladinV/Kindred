/* uses: MARITAL_ENDED MARITAL_MARRIED ROAD_ID · byId groups queueSave
   · normaliseDiscipleship normaliseKid normaliseTopic
   · toast · renderAll
*/

/* ── the people you are walking a road with ─────────────────────
   Discipling somebody is not a fifth shelf of a life, so it is not one of the
   four names in GROUPS, and it is not a group either — a group you have to
   go out of your way to make, and the road is not something you deliberately
   put a handful of people together into. It is a flag on the person instead
   (discipleship.active), set the moment you start walking with them and
   cleared the moment you stop. Nothing else about them moves: everything
   written on their discipleship page stays on the record, hidden, and is
   there again the moment the flag is set again.

   This used to be exactly the kind of group the paragraph above says it is
   not — a fixed-id entry in GROUPS, reused for its membership list and its
   badge grid rather than building both twice. That was cheap to build but
   never actually true: it meant every disciple stood in the Groups view too,
   as a circle nobody had made on purpose, alongside the ones you had.
   migrateRoadGroup and foldRoadMembers below are what carry anyone still on
   that group, on this device or in an old backup file, into the flag and
   drop the group for good. */

/* Not yourself and not somebody you have only flagged to meet. You are not on
   a road of your own here, and a future connection has no relationship to walk
   yet — the same two exclusions the check-in bar already makes. */
const isWalking = p => !!p && !p.isSelf && !p.isFuture && !!p.discipleship?.active;

function startWalking(id) {
  const p = byId(id);
  if (!p) return;
  p.discipleship.active = true;
  settleWalk(p);
}

const stopWalking = id => {
  const p = byId(id);
  if (!p) return;
  p.discipleship.active = false;
  settleWalk(p);
};

/* Anyone still listed under the old fixed-id group, folded into the flag
   instead — the one-time move from a group to discipleship.active. Shared by
   migrateRoadGroup below and by importAll (js/backup.js), which meets the
   same group inside an old backup file rather than in `groups` itself. */
function foldRoadMembers(ids) {
  for (const id of ids) {
    const p = byId(id);
    if (p) { p.discipleship.active = true; settleWalk(p); }
  }
}

/* Run once at boot, after both people and groups are loaded. A no-op on
   every device that has already been through this — groups.js never creates
   another one under ROAD_ID once this has run — so the lookup is the whole
   cost of calling it on the devices that do not need it. */
function migrateRoadGroup() {
  const g = groups.find(x => x.id === ROAD_ID);
  if (!g) return;
  foldRoadMembers(g.members);
  groups = groups.filter(x => x.id !== ROAD_ID);
  queueSave();
}

/* Stopping stays a plain one-click toggle with an Undo — that part never asked
   for confirmation and starting shouldn't make it start now. Undo goes
   straight back to startWalking rather than through the intro pop-up below:
   taking back a mistake should not mean answering three questions again. */
function stopDiscipling(id) {
  const p = byId(id);
  if (!p) return;
  stopWalking(id);
  queueSave();
  renderAll();

  const first = p.name.split(' ')[0];
  toast(`No longer walking a road with ${first} — nothing written is lost`, {
    label: 'Undo',
    run: () => { startWalking(id); queueSave(); renderAll(); toast(`Walking a road with ${first}`); },
  });
}

/* "How many years ago" is never a day nobody was asked for — it walks back
   from today by whole years, the same way marriage's own optional count does
   (see saveHouseholdForm, in walk-sheet.js). Nothing here ever reads it back
   as a count; it becomes a date once, on the way in, because the mark it
   lands on (abide.saved) only has a date to hold. */
function yearsAgoDate(years) {
  const n = Number(years);
  if (!n) return '';
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return ymd(d);
}

/* Starting is the pop-up's save, not the button's click — see
   discipleIntroDialog in walk-sheet.js, which is what the Disciple pill
   actually opens. What comes back from it seeds the page in one write: the
   group membership, an accepted-Jesus tick if that was answered, a marital
   fact if they're married, and however many children were named. Any of the
   three can be left blank — a blank answer seeds nothing and still starts the
   road, exactly as it did before this pop-up asked anything at all. */
function startDiscipleship(personId, { acceptedJesus, acceptedJesusYears, married, marriedYears, kids } = {}) {
  const p = byId(personId);
  if (!p) return;
  startWalking(personId);

  if (acceptedJesus) {
    p.discipleship.marks['abide.saved'] = { done: true, date: yearsAgoDate(acceptedJesusYears), note: '' };
  }
  if (married) {
    p.maritalStatus = 'married';
    p.marriedYears = marriedYears || '';
  }
  (kids || []).forEach(k => { if (k.name) p.kids.push(normaliseKid(k)); });

  settleWalk(p);
  queueSave();
  renderAll();
  toast(`Walking a road with ${p.name.split(' ')[0]}`);
}

/* Abide, Belong, Contribute, This is Church — set by hand, one click each,
   independent of the checklist and of each other. */
function toggleStage(personId, key) {
  const p = byId(personId);
  if (!p) return;
  p.discipleship.stages[key] = !p.discipleship.stages[key];
  settleWalk(p);
  queueSave();
  renderAll();
}

/* ── what is written on that road ───────────────────────────────
   Every write below ends here rather than trusting the edit to have left the
   record tidy, and it earns the line twice over.

   An item ticked and then unticked leaves nothing behind, because
   normaliseDiscipleship only keeps a mark that actually says something —
   otherwise every person would carry nineteen empty answers and send them up
   on every sync.

   The load-bearing half is the ordering. The sync compares rows stringified
   (same(), in js/sync/shape.js) against a snapshot built from normalised
   people, so a key appended in the order things were tapped would differ from
   that snapshot for good: this device would read itself as changed on every
   sync, push every time, and never once accept an edit made on the phone. */
const settleWalk = p => { p.discipleship = normaliseDiscipleship(p.discipleship); };

const blankMark = () => ({ done: false, date: '', note: '' });

function toggleMark(personId, key) {
  const p = byId(personId);
  if (!p) return;
  const m = (p.discipleship.marks[key] ||= blankMark());
  m.done = !m.done;
  settleWalk(p);
  queueSave();
  renderAll();
}

/* The date and the note behind an item, set from the dialog. Writing either
   one is enough to keep the mark even while it is still unticked — a thing you
   are talking about is worth holding before it is a thing that has happened. */
function saveMark(personId, key, { date, note }) {
  const p = byId(personId);
  if (!p) return;
  const m = (p.discipleship.marks[key] ||= blankMark());
  m.date = date;
  m.note = note;
  settleWalk(p);
  queueSave();
  renderAll();
}

const topicOf = (p, id) => p.discipleship.topics.find(t => t.id === id) || null;

function saveTopic(personId, topicId, { title, date, note }) {
  const p = byId(personId);
  if (!p) return;
  const t = topicId && topicOf(p, topicId);
  if (t) Object.assign(t, { title, date, note });
  else p.discipleship.topics.push(normaliseTopic({ title, date, note }));
  settleWalk(p);
  queueSave();
  renderAll();
}

function toggleTopic(personId, topicId) {
  const p = byId(personId);
  const t = p && topicOf(p, topicId);
  if (!t) return;
  t.done = !t.done;
  queueSave();
  renderAll();
}

function removeTopic(personId, topicId) {
  const p = byId(personId);
  if (!p) return;
  p.discipleship.topics = p.discipleship.topics.filter(t => t.id !== topicId);
  settleWalk(p);
  queueSave();
  renderAll();
}

/* ── their household ────────────────────────────────────────────
   Marital status, when a marriage began and when it ended, and when they
   joined the church. Repaints, because this lands on the way out of a dialog
   rather than as somebody types: the summary it feeds sits under their photo,
   which is above the tabs and so on screen either way. */
function saveHousehold(personId, patch) {
  const p = byId(personId);
  if (!p) return;
  Object.assign(p, patch);
  queueSave();
  renderAll();
}

const kidOf = (p, id) => p.kids.find(k => k.id === id) || null;

/* normaliseKid is what settles the birthday-or-age question, so it is spread
   over the existing child rather than assigned around it: typing a birthday on
   a child who had an age has to clear the age, and that rule lives in one
   place. */
function saveKid(personId, kidId, data) {
  const p = byId(personId);
  if (!p) return;
  const k = kidId && kidOf(p, kidId);
  if (k) Object.assign(k, normaliseKid({ ...k, ...data }));
  else p.kids.push(normaliseKid(data));
  queueSave();
  renderAll();
}

function removeKid(personId, kidId) {
  const p = byId(personId);
  if (!p) return;
  p.kids = p.kids.filter(k => k.id !== kidId);
  queueSave();
  renderAll();
}

/* Which of the two dates are questions worth asking. Married and then divorced
   is a story; single and a divorce date is not. Both are applied when the
   dialog saves, not merely hidden, so a status can never be contradicted by a
   date sitting invisibly underneath it. */
const maritalEnded = status => MARITAL_ENDED.includes(status);
const maritalMarried = status => !status || MARITAL_MARRIED.includes(status);
