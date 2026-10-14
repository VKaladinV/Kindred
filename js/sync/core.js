/* uses: Session approved · selectSince upsert
   · carryEdits flatten mergeTable nest nestChurchEvents nestCommunities nestGroups planPush sameMap
   · deletePhoto downloadPhoto listRemotePhotos uploadPhoto
   · publishMine pullShared
*/

/* ─────────────────────────── the sync ─────────────────────────── */

/* groups goes last, which costs nothing: it references no other table, so the
   push order that exists to put people before the rows hanging off them has no
   opinion about where it sits. The three after it are the communities you
   oversee, the church's events, and who came to either — attendance after
   people, because it hangs from a person the way a check-in does. */
const TABLES = ['people', 'records', 'prayers', 'touches', 'groups',
  'communities', 'church_events', 'attendance'];

/* Tables this app can live without on the server. They arrive with
   supabase/communities.sql, which a database may not have had run yet — and a
   new app talking to an old database has to behave exactly as the old app
   did, which is the same promise the linking step at the foot of sync()
   keeps. Missing, they are left on this device, untouched and unagreed, and
   go up whole on the first sync after the file is run. */
const OPTIONAL_TABLES = new Set(['communities', 'church_events', 'attendance']);

/* Tables whose rows hang from nobody. Everything else carries a person_id,
   and a row whose person has gone is dropped on the way in (step 5, below).
   Asked that question, these would answer "my person is not here" about
   every row they hold, and the first sync would delete all of them. */
const PERSONLESS = new Set(['people', 'groups', 'communities', 'church_events']);

const EPOCH = '1970-01-01T00:00:00Z';

/* One empty bucket per table. A snapshot that is missing a table is not an
   empty snapshot, it is a broken one — every consumer below assumes a map is
   there to read. */
const emptyRows = () => Object.fromEntries(TABLES.map(t => [t, {}]));

let syncing = false;
let queued = false;
const listeners = [];
const onStatus = fn => listeners.push(fn);
let status = { state: 'idle', at: null, error: null };
const setStatus = s => { status = { ...status, ...s }; listeners.forEach(f => f(status)); };

async function sync({ manual = false } = {}) {
  /* app.js's boot() reads people/photos/shared out of IndexedDB asynchronously.
     This can fire before that finishes — the very first call always does, on
     a fresh page load — and an empty roster read as "everything was deleted"
     is indistinguishable from an actual deletion to the merge logic below.
     Waiting here is what stops a slow IndexedDB read from tombstoning a
     circle, or a photo, that never actually went anywhere. */
  if (Kindred.ready) await Kindred.ready;
  if (!Session.signedIn) return;
  /* An account nobody has let in is refused every row by row-level security
     (supabase/members.sql). Trying anyway would spend a request per table to
     be told nothing, and then report it as a sync problem — which is the one
     thing it is not. approved() answers true whenever it does not know,
     including on a copy where that SQL has never been run, so this can only
     ever stop a sync the database was going to refuse. */
  if (!approved()) { setStatus({ state: 'waiting' }); return; }
  if (!navigator.onLine) { setStatus({ state: 'offline' }); return; }
  if (syncing) { queued = true; return; }

  syncing = true;
  setStatus({ state: 'syncing', error: null });
  try {
    const uid = Session.user.id;
    const since = localStorage.getItem('kindred:syncedAt') || EPOCH;

    const people = Kindred.people;
    /* Not the pictures — a mark of each, worked out once when it was stored.
       Everything below asks the same two questions it always asked, "is there
       a face here" and "is it the one we agreed", and a map of short strings
       answers both. The bytes are fetched only where they are actually sent. */
    const marks = Kindred.photoMarks;
    const groups = Kindred.groups;
    const communities = Kindred.communities;
    const churchEvents = Kindred.churchEvents;
    const { rows: local, photoLens } = flatten(people, marks, groups, communities, churchEvents);
    /* Built from TABLES rather than written out again. The hand-written version
       of this had lost a table when a new one was added, and planPush reaches
       Object.keys(snap) unconditionally — so a device with no snapshot yet threw
       on its very first sync, never wrote a snapshot, and threw identically ever
       after. It only ever showed on a brand new account or a fresh sign-in,
       which is exactly the moment nothing else has gone wrong yet. */
    const snap = (await Kindred.Store.loadSnapshot()) || { rows: emptyRows(), photoLens: {} };

    /* 1 ─ pull everything the server has seen since we last agreed

       A table this device has never agreed anything about is read from the
       beginning rather than from the watermark. There is one watermark for
       every table, and a device that went on syncing on older code — code
       that did not know the table was there — has carried it past rows
       another device already wrote into it. Read from there, those rows would
       never arrive here at all.

       An optional table the server says is not there (404) is set aside for
       this run, and only that: any other refusal is a real failure and still
       stops the sync, because moving the watermark past rows that were never
       read is how they come to be skipped for good. */
    const remote = {};
    const unsynced = new Set();
    let watermark = since;
    for (const t of TABLES) {
      try {
        remote[t] = await selectSince(t, t in snap.rows ? since : EPOCH, uid);
      } catch (e) {
        if (!OPTIONAL_TABLES.has(t) || e.status !== 404) throw e;
        unsynced.add(t);
        remote[t] = [];
        continue;
      }
      for (const r of remote[t]) if (r.updated_at > watermark) watermark = r.updated_at;
    }

    /* 2 ─ merge, and 3 ─ work out what we owe the server */
    const merged = {}, pushes = {}, tombstones = {};
    for (const t of TABLES) {
      /* A snapshot written before a table existed has no bucket for it, and a
         missing bucket is the same thing as having agreed nothing about it. */
      const was = snap.rows[t] || {};
      merged[t] = mergeTable(local[t], was, remote[t]);
      /* Nothing to say to a table that is not there. Its rows stay as they
         are here, and stay unagreed — see where the snapshot is written. */
      if (unsynced.has(t)) { pushes[t] = []; tombstones[t] = []; continue; }
      const plan = planPush(merged[t], was, remote[t], uid);
      pushes[t] = plan.upserts;
      tombstones[t] = plan.tombstones;
    }

    /* A refused write to one of the optional tables is held over to the next
       sync rather than allowed to take the other five down with it — a
       column one of them is missing (PGRST204) is the same story as the
       table itself missing, a database a step behind this app. */
    const push = async (t, rows) => {
      if (unsynced.has(t)) return [];
      try { return await upsert(t, rows); }
      catch (e) {
        if (!OPTIONAL_TABLES.has(t)) throw e;
        console.warn('[sync]', e.message || e);
        unsynced.add(t);
        return [];
      }
    };

    /* people must exist before rows that reference them, and go last on delete */
    for (const t of TABLES) {
      const back = await push(t, pushes[t]);
      for (const r of back) if (r.updated_at > watermark) watermark = r.updated_at;
    }
    for (const t of [...TABLES].reverse()) {
      const back = await push(t, tombstones[t]);
      for (const r of back) if (r.updated_at > watermark) watermark = r.updated_at;
    }

    /* 4 ─ photos */
    const nextPhotos = { ...marks };
    const remoteSet = await listRemotePhotos(uid);
    /* An id lands here when its upload comes back not-ok — a network blip, a
       transient 5xx, whatever. Left unmarked below, so the snapshot does not
       claim the server has it: the next sync's localLen !== snapLen check
       reads that as "changed since we agreed" and uploads it again on its
       own, the same path an ordinary edit already takes. Recorded as synced
       instead, one bad request would desync this photo permanently — nothing
       else would ever notice it needed a retry. */
    const failedUploads = new Set();
    /* What the server can be said to hold for each photo once this is done —
       the mark of the exact bytes sent or fetched, rather than whatever is in
       the map by the time we come to write the snapshot. `marks` is the live
       object by reference, not a copy the way `local` is, so a crop finished
       while these requests were in flight would otherwise be recorded as
       agreed and never sent at all. */
    const sent = {};
    if (remoteSet) {
      for (const id of Object.keys(merged.people)) {
        const localMark = marks[id];
        const snapMark = snap.photoLens[id];
        if (localMark && localMark !== snapMark) {
          /* The bytes and the mark of those bytes out of one read of the
             record, and sent[] recorded from that mark rather than from the
             one read at the top of this iteration. There is an await between
             the two now, and a crop finished inside it would otherwise be
             written down as agreed while the picture before it was the one
             that actually went. */
          const got = await Kindred.photoBytes(id);
          if (got && await uploadPhoto(uid, id, got.blob)) sent[id] = got.mark;   // new or changed here
          else failedUploads.add(id);
        } else if (!localMark && !Kindred.hasPhoto(id) && remoteSet.has(id)) {
          /* Asks whether there is a picture, not whether there is a mark for
             one. A photo stored before this app kept marks has none until the
             repair pass reaches it, and asked the other way this would read
             that as "nothing here" and fetch back a face already on disk. */
          const blob = await downloadPhoto(uid, id);           // arrived from elsewhere
          if (blob) {
            const landed = await Kindred.landPhoto(id, blob);
            nextPhotos[id] = landed;
            sent[id] = landed;
          }
        } else if (localMark) {
          sent[id] = snapMark;                                 // untouched, and already agreed
        }
      }
      for (const id of Object.keys(snap.photoLens)) {
        if (!marks[id] && remoteSet.has(id) && merged.people[id]) await deletePhoto(uid, id);
      }
      for (const id of remoteSet) {
        if (!merged.people[id]) await deletePhoto(uid, id);    // person is gone
      }
    }

    /* 5 ─ land the result and remember what we agreed */

    /* Read live rather than reusing the freeze from the top of this function.
       Fifteen round-trips have gone by since then, several of them carrying
       photographs, and the roster has gone on being written in all that time. */
    const now = flatten(Kindred.people, Kindred.photoMarks, Kindred.groups,
      Kindred.communities, Kindred.churchEvents);

    const carried = {};
    for (const t of TABLES) carried[t] = carryEdits(merged[t], local[t], now.rows[t]);
    /* nest drops a child whose person is not there, so a prayer written for
       somebody deleted on another device would vanish from the app on its way
       in and — being absent from the snapshot too — never be tombstoned
       either, leaving it on the server for good. Dropped here instead, while
       the snapshot below can still see that it went. */
    for (const t of TABLES) {
      /* people is what the others hang from, and a group hangs from nobody —
         it holds ids and has no person_id at all, so asked this question it
         would answer "my person is not here" about every row and delete every
         group on the first sync that ran. A community and a church event are
         the same; attendance is not, and goes with its person like a prayer. */
      if (PERSONLESS.has(t)) continue;
      for (const [id, row] of Object.entries(carried[t])) {
        if (!carried.people[row.person_id]) delete carried[t][id];
      }
    }

    /* The same window, and the same rule, for pictures: one chosen while the
       requests were in flight is newer than whatever this sync settled on, and
       one cleared in that window has to stay cleared. */
    for (const [id, data] of Object.entries(Kindred.photoMarks)) {
      if (carried.people[id] && data !== nextPhotos[id]) nextPhotos[id] = data;
    }
    for (const id of Object.keys(nextPhotos)) {
      if (photoLens[id] && !Kindred.photoMarks[id]) delete nextPhotos[id];
    }
    for (const id of Object.keys(nextPhotos)) {
      if (!carried.people[id]) { delete nextPhotos[id]; await Kindred.dropPhoto(id); }
    }

    const nextPeople = nest(carried).map(Kindred.normalise);
    const nextGroups = nestGroups(carried.groups).map(Kindred.normaliseGroup);
    const nextCommunities = nestCommunities(carried.communities).map(Kindred.normaliseCommunity);
    const nextEvents = nestChurchEvents(carried.church_events).map(Kindred.normaliseChurchEvent);

    /* The snapshot records what the server was told, which is `merged` — not
       what is about to go on screen. A sentence typed after we told it is
       precisely the thing that has not been agreed yet, and written down here
       as agreed, planPush would skip it next run and it would never leave this
       device at all. It is also the only thing that can tombstone a person
       deleted during the window: dropped from `carried` above, kept here, and
       so found by planPush's walk over the snapshot on the next sync. */
    const settled = flatten(nest(merged).map(Kindred.normalise), nextPhotos,
      nestGroups(merged.groups).map(Kindred.normaliseGroup),
      nestCommunities(merged.communities).map(Kindred.normaliseCommunity),
      nestChurchEvents(merged.church_events).map(Kindred.normaliseChurchEvent));
    /* A table the server did not have was told nothing, so nothing about it
       is agreed — its bucket goes back exactly as it was found, absent if it
       was absent. Written down as agreed instead, the rows made here before
       supabase/communities.sql was run would read as already sent, and never
       be sent at all. Left absent, the next sync reads it from the beginning.
       An empty bucket is left absent too rather than kept: a brand new
       snapshot starts with one for every table, and an empty bucket agrees
       nothing anyway — absent, it is also read from the beginning once the
       table appears, rather than from a watermark that moved on without it. */
    for (const t of unsynced) {
      if (snap.rows[t] && Object.keys(snap.rows[t]).length) settled.rows[t] = snap.rows[t];
      else delete settled.rows[t];
    }
    /* A photo may only be called agreed if the server was given these exact
       bytes. Anything else — an upload that failed, a crop finished after its
       upload went out, a picture swapped while we were busy elsewhere — is
       left unmarked, and the next sync's localLen !== snapLen check picks it
       up on its own, the same path an ordinary edit already takes. */
    for (const id of Object.keys(settled.photoLens)) {
      /* No listing means the photo pass never ran, so nothing was agreed this
         time round and the marks stand exactly where the last sync left them. */
      const agreed = remoteSet ? sent[id] : snap.photoLens[id];
      if (nextPhotos[id] !== agreed) failedUploads.add(id);   // nextPhotos holds marks
    }
    for (const id of failedUploads) delete settled.photoLens[id];
    await Kindred.Store.saveSnapshot(settled);

    /* Most syncs agree with what is already here, and landing an identical
       roster is not free: setRoster builds every person again, so the objects
       the open page is writing into are replaced by copies of themselves and
       whatever was typed in the last second goes with them. Skipping it
       outright is what makes a sync something you cannot feel — nothing is
       rebuilt, nothing is repainted, and the words stay where they were put. */
    const landing = flatten(nextPeople, nextPhotos, nextGroups, nextCommunities, nextEvents);
    const changed = !TABLES.every(t => sameMap(landing.rows[t], now.rows[t]))
      || !sameMap(landing.photoLens, now.photoLens);

    if (changed) {
      /* Photos before people: setting people runs setRoster, which merges any
         duplicate self-rows and, while doing it, carries a photo across by
         asking this same marks map who has one (mergeSelves, in state.js).
         Landing it here first means that carry-over reads what this sync just
         decided rather than what was true before it ran — read the other way
         round, whatever it decided was silently overwritten a line later. */
      Kindred.photoMarks = nextPhotos;
      Kindred.people = nextPeople;
      Kindred.groups = nextGroups;
      Kindred.communities = nextCommunities;
      Kindred.churchEvents = nextEvents;
      await Kindred.Store.savePeople(nextPeople);
      await Kindred.Store.saveGroups(nextGroups);
      await Kindred.Store.saveList('communities', nextCommunities);
      await Kindred.Store.saveList('churchEvents', nextEvents);
    }
    // rewind the watermark slightly: if the other device wrote between our pull
    // and our push, that row would otherwise sit just under the mark and be
    // missed forever. Re-examined rows merge to no-ops, so the cost is nil.
    localStorage.setItem('kindred:syncedAt',
      new Date(Date.parse(watermark) - 2000).toISOString());

    /* 6 ─ what you publish, and what the people you linked with publish.
       Its own try/catch on purpose: a database that has not had share.sql
       run against it answers 404 here, and that must never be allowed to
       take five tables of ordinary syncing down with it. A new app talking
       to an old database has to behave exactly as the old app did. */
    let sharedChanged = false;
    try {
      await publishMine(uid);
      sharedChanged = await pullShared(uid);
    } catch (e) { console.warn('[sync] linking', e.message || e); }

    /* Nothing landed and nothing new was published means the screen is already
       right, and repainting it anyway was what made the app flicker and replay
       its entrance under whoever was writing in it. */
    if (changed || sharedChanged) Kindred.render();
    setStatus({ state: 'ok', at: Date.now(), error: null });
    /* Only when asked. Every quiet sync would otherwise say it again, and the
       one person who needs to know is the one who pressed Sync now. */
    if (manual && unsynced.size) {
      Kindred.toast('Communities stay on this device until the database is updated');
    }
  } catch (e) {
    console.error('[sync]', e);
    setStatus({ state: 'error', error: e.message || String(e) });
    if (manual) Kindred.toast('Sync failed — ' + (e.message || 'unknown error'));
  } finally {
    syncing = false;
    if (queued) { queued = false; setTimeout(sync, 400); }
  }
}

/* ─────────────────────────── wiring ─────────────────────────── */
