/* uses: Store · normalise · toast · openSheet · renderAll */

let people = [];
/* Flagged as a possible future connection — someone you'd like to get to
   know, not yet someone you're keeping in touch with. Split out the same
   way `me` is, below, and for the same reason. */
let futures = [];
let photos = {};
/* What the people you have linked with publish, keyed by their account id.
   Never written by anything in this file — sync.js is the only writer, and
   the only reader besides the sheet is the bridge below. */
let shared = {};
let openId = null;
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
  + p.events.length + p.prayers.length
  + p.medications.length + p.conditions.length + p.touches.length;

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
    for (const f of ['events', 'prayers', 'medications', 'conditions']) {
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
    if (!photos[winner.id] && photos[other.id]) {
      photos[winner.id] = photos[other.id];
      Store.savePhoto(winner.id, photos[other.id]).catch(() => {});
    }
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
const saveRoster = () => Store.savePeople(roster());

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

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveRoster().catch(e => {
    toast('Could not save — storage may be full');
    console.error(e);
  }), 350);
  notifyMutate();
}
