/* uses: MARITAL_ENDED MARITAL_MARRIED ROAD_ID ROAD_NAME · today
   · byId groups queueSave
   · normaliseDiscipleship normaliseKid normaliseTopic
   · toast · renderAll
*/

/* ── the people you are walking a road with ─────────────────────
   Discipling somebody is not a fifth shelf of a life, so it is not one of the
   four names in GROUPS. It is a group in the other sense — people you have
   deliberately put together, the kind the Groups view draws as one circle of
   faces — and that is the whole of what makes somebody discipled here. There
   is no flag on the person to fall out of step with it.

   Which means taking them out of the group in the ordinary group dialog is a
   way out of this too, and it destroys nothing: everything written on their
   discipleship page stays on the record, hidden, and is there again the moment
   they are put back.

   The group carries a fixed id rather than one from uid(), which is why
   newGroup() in groups.js cannot be reused to make it. Two devices that have
   never met must agree there is exactly one of these, and an id decided here
   is the only way to promise that — a name could be, but then renaming it
   would quietly bring a second one into being on the next tap. */
const roadGroup = () => groups.find(g => g.id === ROAD_ID) || null;

/* Not yourself and not somebody you have only flagged to meet. You are not on
   a road of your own here, and a future connection has no relationship to walk
   yet — the same two exclusions the check-in bar already makes. */
const isWalking = p => !!p && !p.isSelf && !p.isFuture && !!roadGroup()?.members.includes(p.id);

function startWalking(id) {
  let g = roadGroup();
  if (!g) {
    g = { id: ROAD_ID, name: ROAD_NAME, members: [], createdAt: today() };
    groups.push(g);
  }
  if (!g.members.includes(id)) g.members.push(id);
}

const stopWalking = id => {
  const g = roadGroup();
  if (g) g.members = g.members.filter(x => x !== id);
};

/* The Disciple button. Turning it on is an ordinary thing to do and says so
   plainly; turning it off takes a page off their profile, which looks like
   losing something even though it is not — so that one is the direction that
   gets an Undo, the same shape releasePrayer uses. */
function toggleDisciple(id) {
  const p = byId(id);
  if (!p) return;
  const was = isWalking(p);
  if (was) stopWalking(id); else startWalking(id);
  queueSave();
  renderAll();

  const first = p.name.split(' ')[0];
  if (was) {
    toast(`No longer walking a road with ${first} — nothing written is lost`,
      { label: 'Undo', run: () => toggleDisciple(id) });
  } else {
    toast(`Walking a road with ${first}`);
  }
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
