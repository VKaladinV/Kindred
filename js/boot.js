/* uses: $ $$ · Store
   · byId groups me mutateHooks people readyPromise resolveReady roster setRoster shared
   · dropPhoto hasPhoto landPhoto loadPhotoRecords photoBytes photoMarks photoThumbDataUrl repairPhotos
   · normalise normaliseGroup · toast
   · applyBadgeSize badgeSizePref · openSheet
   · checkClaimedInvites offerPendingJoin takeLaunchFragment
   · nudgeIfDue paintNotifState · checkBio
   · locked paintLockState showLock wireLock
   · initTheme
   · isWriting renderEverything renderRemote switchView
   · fillSelects wire
*/

let bootBuild = null;
let lastBuildCheck = 0;

/* Offline, the service worker answers with index.html and parsing that as
   JSON throws — null either way, which is the honest answer: nothing to
   compare against. */
async function readBuild() {
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()).build || null;
  } catch { return null; }
}

/* Reloading out from under a half-typed note would throw it away — and the
   note need not be in a dialog. It was true once that every editor here was a
   native dialog; the summary and the prayer line are written straight into the
   page now, which is exactly why isWriting asks about the focus itself. */
function safeToReload() {
  return !$$('dialog[open]').length && !isWriting();
}

async function checkForUpdate() {
  if (Date.now() - lastBuildCheck < 60000) return;
  lastBuildCheck = Date.now();

  const live = await readBuild();
  if (!live) return;

  /* The first reading it manages is the one it measures against, rather than
     whatever was true at boot — so a session that started with no connection
     still arms itself once one arrives. */
  if (!bootBuild) { bootBuild = live; return; }

  /* Busy right now: let it be. Coming back to the app asks again. */
  if (live !== bootBuild && safeToReload()) location.reload();
}

/* ─────────────────────────── boot ─────────────────────────── */

async function boot() {
  /* Before anything else — the <html> attribute this reads was already set,
     if it needed to be, by the inline script in <head>; this only has to
     catch up the meta theme-color tag and the toggle's icon, and it needs no
     await to do either. */
  initTheme();

  /* First of all, before the lock and before any layer is pushed: an
     invitation in the address bar has to come out of it straight away. A
     reload must not try to claim it twice, and it should not sit in the
     screenshot the task switcher takes. Parked in storage rather than a
     variable because making an account sends you away to an email and back
     to an entirely different URL, and the invitation has to survive that. */
  takeLaunchFragment();

  /* Reading the lock is synchronous, so the screen is up ahead of the first
     paint and no face is ever drawn uncovered. */
  wireLock();
  showLock();

  await Store.init();
  setRoster(await Store.loadPeople());   // splits you back out of the roster
  groups = (await Store.loadGroups()).map(normaliseGroup);
  /* Handles, not pictures. What comes back here is a Blob per face and a mark
     of its bytes; the base64 that used to be read into memory in full before
     anybody could see their circle is gone, and with it the tens of megabytes
     it cost to hold a few hundred people. */
  await loadPhotoRecords();
  shared = await Store.loadShared();
  resolveReady();

  fillSelects();
  wire();
  checkBio().then(paintLockState);

  $('#storage-state').textContent = Store.blocked
    ? 'Fellowship is open in another tab and holding the database. Close it and reload — nothing here will save until you do.'
    : ({
      indexeddb: 'Saved in this browser’s database on this device.',
      localstorage: 'Saved in browser storage (limited room for photos). Run it from a local server for more space.',
      memory: 'Nothing can be saved in this browser mode — export a backup before closing.',
    })[Store.mode];
  if (Store.blocked) toast('Close Fellowship’s other tab and reload');

  /* Always the circle. Fellowship used to reopen on whichever tab you left it on,
     which meant signing in could land you on a prayer list rather than on the
     faces — and the faces are the app. Coming back is different from starting:
     unlocking after a couple of minutes away leaves you where you were. */
  switchView('circle');

  /* Before the first render, so the circle is drawn at the chosen size rather
     than drawn small and then jumping. */
  applyBadgeSize(badgeSizePref());

  /* The one full paint. Every later one covers the view being read and notes
     the rest as stale — but at boot there is no "later" to fall back on yet,
     so all five are drawn once and nothing can be opened for the first time
     onto an empty page. */
  renderEverything();
  /* After the faces are up, never before: photos stored before this app kept
     a small copy and a mark need a decode and two re-encodes each to be given
     one, and that is not work to do while somebody is waiting to see their
     circle. A crop on its own already draws correctly everywhere. */
  repairPhotos();
  paintNotifState();
  paintLockState();
  if (!locked) nudgeIfDue();

  /* A reload with someone open — the app taking an update, usually — comes
     back standing on the guard entry, and their page is still what the back
     button is in front of. Take the entry as ours and put them back. */
  if (history.state?.kindredLayer) {
    guarded = true;
    const held = history.state.person;
    if (held && byId(held)) openSheet(held);
  }

  /* An invitation, once the app is standing and the lock is behind us — a
     link must not be claimable by whoever is holding a locked phone. sync.js
     loads after this file, so it is given a moment to bind first. */
  if (!locked) setTimeout(() => { offerPendingJoin(); checkClaimedInvites(); }, 400);

  if (location.protocol.startsWith('http')) {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    checkForUpdate();
  }
}

/* The only surface sync.js touches. Keeping it this narrow means the sync
   layer can be removed entirely and the app still runs, unchanged. */
window.Kindred = {
  /* The roster, not the circle: sync carries your own profile the same way it
     carries everyone else, and setRoster splits you back out on the way in.
     This getter is the only place the two are ever seen together, which is
     what keeps every renderer in this file honest about who it is drawing. */
  get people() { return roster(); },
  set people(v) { setRoster(v); },
  get self() { return me; },

  /* The groups, plainly — there is no self to split out of them and no second
     list they are kept apart from, so unlike `people` above this getter is
     what it looks like. */
  get groups() { return groups; },
  set groups(v) { groups = v; },

  /* ── faces ──────────────────────────────────────────────────────────
     There used to be a `photos` here, a map of id to base64, and the sync
     read it for two different things: to know whether a face had changed,
     and to get the bytes to send. Those have been separated, because they
     want different answers.

     `photoMarks` is the identity half — a short fingerprint per person,
     computed once when the picture was stored — and it is what flatten and
     the whole photo reconciliation compare. The other three fetch or land
     actual bytes, and look like it.

     The old name is deleted rather than quietly given the new meaning. In an
     app with no bundler, no modules and no types, a reader left comparing a
     mark against a data URL would find them unequal and re-upload a photo on
     every sync forever, in silence. A name that is gone throws instead. */
  get photoMarks() { return photoMarks; },
  set photoMarks(v) { photoMarks = v; },
  hasPhoto: id => hasPhoto(id),
  photoBytes: id => photoBytes(id),
  landPhoto: (id, blob) => landPhoto(id, blob),
  dropPhoto: id => dropPhoto(id),
  photoThumbDataUrl: id => photoThumbDataUrl(id),
  /* What your linked people have published, keyed by their account id.
     Entirely separate from `people` — sync's five-table pipeline has never
     heard of this map and must never be given the chance to push it back. */
  get shared() { return shared; },
  set shared(v) { shared = v; },
  get linkedUids() { return people.filter(p => p.linkedUid).map(p => p.linkedUid); },
  Store,
  normalise,
  normaliseGroup,
  toast,
  ready: readyPromise,
  render: () => renderRemote(),
  onMutate: fn => mutateHooks.push(fn),
  /* Called once, right after a sign-in or sign-up succeeds. An invitation
     waiting in storage would otherwise sit unclaimed until the next reload
     or unlock (see offerPendingJoin's other two callers) — signing in is
     itself the moment it was waiting for, so this is what closes that gap
     without sync.js needing to know anything about joining. */
  afterAuth: () => { if (!locked) { offerPendingJoin(); checkClaimedInvites(); } },
};


boot();
