/* uses: Store · adoptPhoto hasPhoto · normalise · toast · openSheet · renderAll */

let people = [];
/* Flagged as a possible future connection — someone you'd like to get to
   know, not yet someone you're keeping in touch with. Split out the same
   way `me` is, below, and for the same reason. */
let futures = [];
/* What the people you have linked with publish, keyed by their account id.
   Never written by anything in this file — sync.js is the only writer, and
   the only reader besides the sheet is the bridge below. */
let shared = {};
/* People you have deliberately put together and named. Not `people` and never
   mixed into it: a group holds ids, not persons, so that removing somebody
   from a group and removing them from your life stay two different acts. */
let groups = [];
let openId = null;
/* The group you have zoomed into, if any — the id, so a sync landing a fresh
   array of groups underneath cannot leave this pointing at a stale object. */
let openGroup = null;
const filterGroups = new Set();   // empty means everyone
const filterFocus = new Set();    // empty means nothing narrowed beyond the groups
let query = '';
let saveTimer = null;

/* Resolves once people/photos/shared are actually back from storage. sync.js
   fires its first sync() on DOMContentLoaded, which races this file's async
   boot() — IndexedDB reads are real I/O, not instant. A sync that runs before
   this resolves sees empty roster/photo maps and reads that as "deleted
   everywhere", which is how a photo (or, worse, a whole circle) got tombstoned
   on the server while sitting untouched on disk the entire time. */
let resolveReady;
const readyPromise = new Promise(r => { resolveReady = r; });

/* ── you, kept to one side ──────────────────────────────────────
   Your own profile is an ordinary person record: the same fields, the same
   dialog, the same page, and it rides the existing sync and photo storage
   without either of them learning a thing.

   What it must never be is one of `people`. That array is walked by the
   circle, the sort, the overdue list, the filter counts, Today, the calendar,
   the prayer list and the footer — and you belong in none of them. Filtering
   you out at each of those was the other way to do this, and it would have
   been a tax every future renderer had to remember to pay.

   So the split happens here instead, and `people` goes on meaning exactly
   what it has always meant: the others. Only the bridge that sync.js reads
   ever sees the two together. */
let me = null;

/* How much of a profile has actually been written. Read only from the row
   itself so that two devices score it identically without comparing notes. */
const selfWeight = p =>
  (p.name && p.name !== 'Unnamed' ? 1 : 0)
  + (p.contact ? 1 : 0) + (p.birthday ? 1 : 0)
  + (p.occupation ? 1 : 0) + (p.summary ? 1 : 0)
  + p.events.length + p.prayers.length + p.touches.length;

/* Fullest first, then the older one, then id. Every term comes out of the
   rows, so this is the same answer everywhere without a negotiation. */
const selfOrder = (a, b) =>
  (selfWeight(b) - selfWeight(a))
  || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)
  || (a.id < b.id ? -1 : 1);

/* Two rows carrying isSelf are never two people. Nothing but making your own
   profile sets that flag, and a linked partner's profile lives in another
   table entirely — so this is one person written down twice, on two devices
   that had not met yet.

   What used to happen was that one of them won and the other was quietly
   demoted into the circle. That answered "which is you" but it was the wrong
   question: the demotion was written back and synced, so the losing profile
   became an ordinary circle member permanently, still holding the photo and
   everything typed on it, while the winner could be an empty shell made
   first on a device that never got used. Putting them back together loses
   nothing and needs no rule about which half to sacrifice. */
function mergeSelves(mine) {
  const [winner, ...rest] = mine;
  if (!winner || !rest.length) return winner || null;

  for (const other of rest) {
    for (const f of ['name', 'contact', 'birthday', 'occupation', 'summary', 'relationship']) {
      const held = f === 'name' && winner.name === 'Unnamed' ? '' : winner[f];
      if (!held && other[f] && other[f] !== 'Unnamed') winner[f] = other[f];
    }
    if (!winner.cadenceDays) winner.cadenceDays = other.cadenceDays;
    /* Everything written on the other one comes across. These all carry
       their own ids, so the rows already on the server simply change which
       person they hang from rather than being written again. */
    for (const f of ['events', 'prayers']) {
      const have = new Set(winner[f].map(x => x.id));
      winner[f].push(...other[f].filter(x => !have.has(x.id)));
    }
    const days = new Set(winner.touches.map(t => t.date));
    winner.touches.push(...other.touches.filter(t => !days.has(t.date)));
    /* Keep the earliest beginning: it is the truer answer to when you
       started, and it keeps this stable if it ever runs again. */
    if (other.createdAt && other.createdAt < winner.createdAt) winner.createdAt = other.createdAt;
    /* A face is kept on the side, keyed by id, so it does not travel with
       the fields above and has to be carried over deliberately. */
    if (!hasPhoto(winner.id)) adoptPhoto(other.id, winner.id);
  }
  winner.touches.sort((a, b) => a.date.localeCompare(b.date));
  return winner;
}

function setRoster(list) {
  const all = list.map(normalise);
  const mine = all.filter(p => p.isSelf).sort(selfOrder);
  me = mergeSelves(mine);
  /* The duplicates are gone rather than demoted — their contents are in
     `me` now, so leaving the empty husks behind would put a second copy of
     you in your own circle. */
  const rest = all.filter(p => !p.isSelf);
  futures = rest.filter(p => p.isFuture);
  people = rest.filter(p => !p.isFuture);
}

/* The way back, for a profile that was demoted into the circle before
   mergeSelves existed and had that demotion synced — the flag is gone from
   it by then, so nothing above can recognise it, and only you can say so.
   Offered narrowly (see the sheet) rather than on everybody's page. */
async function claimAsSelf(personId) {
  const p = byId(personId);
  if (!p || p.isSelf) return;
  const had = me && me.id !== p.id ? me : null;
  if (!confirm(
    `Make ${p.name} your own profile?\n\n`
    + 'The photo and everything written on this page becomes yours'
    + (had ? ', and what your profile holds now is folded in with it' : '')
    + '. They stop being someone in your circle.')) return;

  people = people.filter(x => x.id !== p.id);
  futures = futures.filter(x => x.id !== p.id);
  p.isSelf = true;
  p.isFuture = false;
  /* This card is named as the winner rather than scored against the old
     profile: it keeps its id, and with it the photo already stored under
     that id, which is the whole reason for doing this. */
  me = mergeSelves(had ? [p, { ...had, isSelf: true }] : [p]);
  /* How you know them, which group they are in and how often to be nudged
     are all questions about somebody else — savePerson forces them empty on
     your own profile, and this has to agree. */
  me.relationship = '';
  me.groups = [];
  me.cadenceDays = 0;

  await saveRoster();
  notifyMutate();
  renderAll();
  openSheet(me.id);
  toast('That is your profile now');
}

const roster = () => [...people, ...futures, ...(me ? [me] : [])];
/* The groups go down with the roster rather than through a save path of their
   own. Everything below — the debounce, the idle callback, the flush on the
   way out of the app — exists to make sure a write owed is a write paid, and
   there is nothing to be gained by having two of it. A group is a name and a
   handful of ids; writing it alongside costs nothing measurable. */
const saveRoster = () => Promise.all([Store.savePeople(roster()), Store.saveGroups(groups)]);

/* ── which list somebody belongs in ─────────────────────────────
   Decided here rather than at each call site. Adding a person, removing one
   and promoting one used to repeat the same isSelf/isFuture pair of lines in
   four places, which is four places to forget that `me` is not in `people`. */

function addToRoster(p) {
  if (p.isSelf) me = p;
  else if (p.isFuture) futures.push(p);
  else people.push(p);
}

function removeFromRoster(p) {
  if (p.isSelf) me = null;
  futures = futures.filter(x => x.id !== p.id);
  people = people.filter(x => x.id !== p.id);
  /* And out of every group that was holding them. normaliseGroup deliberately
     keeps member ids it cannot resolve — a person may simply not have reached
     this device yet — so this is the one moment it is safe to say an id is not
     pending but gone, and the only place that knows it. */
  for (const g of groups) {
    if (g.members.includes(p.id)) g.members = g.members.filter(id => id !== p.id);
  }
}

/* Between the two lists rather than out of the roster: `p` keeps its id, and
   with it the photo, the prayers and everything else stored against it. */
function moveIntoCircle(p) {
  futures = futures.filter(x => x.id !== p.id);
  p.isFuture = false;
  people.push(p);
}

const byId = id => (me && me.id === id ? me : people.find(p => p.id === id) || futures.find(p => p.id === id));

/* sync.js listens here so it never has to trust each mutation site to
   announce itself — everything that changes data ends up in one of these. */
const mutateHooks = [];
function notifyMutate() {
  for (const fn of mutateHooks) { try { fn(); } catch (e) { console.error(e); } }
}

/* ── writing the roster down ─────────────────────────────────────
   Saving means handing the whole roster to structured clone: every person,
   every event and prayer, and up to sixty check-ins each. That is the shape
   the data is stored in and it is not worth changing — the alternative, a
   row per person, turns four places that delete somebody
   by simply not returning them (mergeSelves and claimAsSelf, above) into four
   places that leave the husk on disk to be read back on the next boot.

   What is worth changing is when the clone happens. It used to land 350ms
   after a tap, which on a big circle is a stutter arriving just as the finger
   lifts. Now the debounce only decides that a save is owed; the browser says
   when there is a spare moment to pay it, and the timeout is the promise that
   "spare" never means "never". */
let savePending = false;
let saveIdle = null;

const dropIdle = window.cancelIdleCallback ? window.cancelIdleCallback.bind(window) : clearTimeout;

function writeRoster() {
  savePending = false;
  clearTimeout(saveTimer);
  saveTimer = null;
  if (saveIdle !== null) { dropIdle(saveIdle); saveIdle = null; }
  return saveRoster().catch(e => {
    toast('Could not save — storage may be full');
    console.error(e);
  });
}

/* Deferring a write is only safe if there is somewhere it is always paid.
   This is that place, and it is the whole argument for the idle callback
   above: an app put in the background or closed a second after a check-in
   must not be the app that forgot the check-in. Best effort by nature — the
   database write is asynchronous and the page may not live to see it finish —
   but a transaction that has already been opened is usually allowed to
   complete, and starting it is strictly better than not. */
function flushSave() {
  if (savePending) writeRoster();
}

function queueSave() {
  savePending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!window.requestIdleCallback) return writeRoster();
    saveIdle = requestIdleCallback(() => { saveIdle = null; writeRoster(); }, { timeout: 1000 });
  }, 350);
  notifyMutate();
}
