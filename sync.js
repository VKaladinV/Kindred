/* ══════════════════════════════════════════════════════════════════════
   Kindred — sign-in and device sync.

   The app stays local-first: IndexedDB remains the working store and
   everything keeps functioning with no signal. Supabase is what the
   devices reconcile against, not something the app depends on.

   How changes are detected
   ------------------------
   After every successful sync we keep a snapshot of exactly what was
   agreed with the server. Next time round, anything that differs from
   that snapshot is a local change, and anything missing from it that was
   there before is a local deletion. That means no mutation site in app.js
   has to remember to stamp a timestamp — a single forgotten call there
   would have meant silently losing an edit.

   Who wins a conflict
   -------------------
   A row changed only on the server is taken. A row changed locally is
   pushed and overwrites the server. A row changed in both places since
   the last sync resolves to whichever device syncs last, which is the
   last write in the sense that matters to a person using two devices.
   Deletions travel as `deleted_at` tombstones so a delete on the phone
   doesn't quietly reappear from the PC.

   No SDK: this talks to PostgREST, GoTrue and Storage over plain fetch,
   so there is nothing to bundle, nothing loaded from a CDN at runtime,
   and the app still works offline.
   ══════════════════════════════════════════════════════════════════════ */

(() => {
'use strict';

const CFG = window.KINDRED_CONFIG || {};
if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) return;

const API = CFG.supabaseUrl.replace(/\/+$/, '');
const ANON = CFG.supabaseAnonKey;
const BUCKET = 'photos';

const $ = (s, r = document) => r.querySelector(s);
const nowIso = () => new Date().toISOString();

/* ─────────────────────────── session ─────────────────────────── */

const Session = {
  get() {
    try { return JSON.parse(localStorage.getItem('kindred:session') || 'null'); }
    catch { return null; }
  },
  set(s) {
    if (s) localStorage.setItem('kindred:session', JSON.stringify(s));
    else localStorage.removeItem('kindred:session');
  },
  get user() { return this.get()?.user || null; },
  get signedIn() { return !!this.get()?.access_token; },
};

async function signIn(email, password) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.msg || body.error_description || 'Could not sign in');
  Session.set({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + (body.expires_in || 3600) * 1000,
    user: { id: body.user.id, email: body.user.email },
  });
  return Session.get();
}

async function refresh() {
  const s = Session.get();
  if (!s?.refresh_token) return null;
  const r = await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!r.ok) { Session.set(null); return null; }
  const body = await r.json();
  Session.set({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + (body.expires_in || 3600) * 1000,
    user: { id: body.user.id, email: body.user.email },
  });
  return Session.get();
}

function signOut() {
  const s = Session.get();
  if (s?.access_token) {
    fetch(`${API}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}` },
    }).catch(() => {});
  }
  Session.set(null);
  localStorage.removeItem('kindred:syncedAt');
  Kindred.Store.saveSnapshot(null).catch(() => {});
}

/* every request refreshes an expiring token first, and retries once on 401 */
async function api(path, opts = {}, retry = true) {
  let s = Session.get();
  if (!s) throw new Error('Not signed in');
  if (s.expires_at - Date.now() < 60000) s = (await refresh()) || s;

  const r = await fetch(API + path, {
    ...opts,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${s.access_token}`,
      ...(opts.headers || {}),
    },
  });
  if (r.status === 401 && retry) {
    if (await refresh()) return api(path, opts, false);
    throw new Error('Session expired — please sign in again');
  }
  return r;
}

const rest = (table, qs = '') => `/rest/v1/${table}${qs}`;

async function selectSince(table, since) {
  const r = await api(rest(table, `?select=*&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc`));
  if (!r.ok) throw new Error(`${table}: ${(await r.text()).slice(0, 140)}`);
  return r.json();
}

async function upsert(table, rows) {
  if (!rows.length) return [];
  const out = [];
  for (let i = 0; i < rows.length; i += 200) {           // keep requests modest
    const r = await api(rest(table), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(rows.slice(i, i + 200)),
    });
    if (!r.ok) throw new Error(`${table}: ${(await r.text()).slice(0, 140)}`);
    out.push(...await r.json());
  }
  return out;
}

/* ───────────────────── local shape ⇄ table rows ───────────────────── */

const d = v => (v ? v : null);            // '' means "not set", which is null in SQL

function flatten(people, photos) {
  const rows = { people: {}, records: {}, prayers: {}, touches: {} };
  const photoLens = {};
  for (const p of people) {
    rows.people[p.id] = {
      id: p.id, name: p.name, relationship: p.relationship, circle: p.group,
      birthday: d(p.birthday), contact: p.contact, summary: p.summary,
      cadence_days: p.cadenceDays, created_on: d(p.createdAt),
    };
    for (const r of p.events) {
      rows.records[r.id] = {
        id: r.id, person_id: p.id, type: r.type, starts_on: r.date,
        ends_on: d(r.endDate), kind: r.kind, title: r.title, note: r.note,
        repeats_yearly: !!r.repeatsYearly,
      };
    }
    for (const pr of p.prayers) {
      rows.prayers[pr.id] = {
        id: pr.id, person_id: p.id, body: pr.text, created_on: d(pr.createdAt),
        answered_on: d(pr.answeredAt), answer_note: pr.answerNote || '',
      };
    }
    for (const t of p.touches) {
      const id = `${p.id}:${t}`;           // deterministic, so two devices agree
      rows.touches[id] = { id, person_id: p.id, touched_on: t };
    }
    if (photos[p.id]) photoLens[p.id] = photos[p.id].length;
  }
  return { rows, photoLens };
}

/* rebuild the app's nested shape from flat rows */
function nest(rows) {
  const byId = {};
  const people = Object.values(rows.people).map(r => {
    const p = {
      id: r.id, name: r.name || 'Unnamed', relationship: r.relationship || '',
      group: r.circle || 'Other', birthday: r.birthday || '', contact: r.contact || '',
      summary: r.summary || '', cadenceDays: r.cadence_days || 0,
      createdAt: r.created_on || '', touches: [], events: [], prayers: [],
    };
    byId[r.id] = p;
    return p;
  });
  for (const r of Object.values(rows.records)) {
    const p = byId[r.person_id]; if (!p) continue;
    p.events.push({
      id: r.id, type: r.type, date: r.starts_on, endDate: r.ends_on || '',
      kind: r.kind, title: r.title, note: r.note || '', repeatsYearly: !!r.repeats_yearly,
    });
  }
  for (const r of Object.values(rows.prayers)) {
    const p = byId[r.person_id]; if (!p) continue;
    p.prayers.push({
      id: r.id, text: r.body, createdAt: r.created_on || '',
      answeredAt: r.answered_on || null, answerNote: r.answer_note || '',
    });
  }
  for (const r of Object.values(rows.touches)) {
    const p = byId[r.person_id]; if (!p) continue;
    p.touches.push(r.touched_on);
  }
  for (const p of people) p.touches.sort();
  return people;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ───────────────────────── merge rules ─────────────────────────
   Pure, so the decision table can be tested without a network.

     local  — the rows as they are on this device right now
     snap   — the rows as they were when we last agreed with the server
     remote — rows the server says changed since then

   A row differing from the snapshot was changed here, and this device
   wins; otherwise the server's version is taken. A row missing locally
   that the snapshot had was deleted here, and stays deleted.
   ──────────────────────────────────────────────────────────────── */

function mergeTable(local, snap, remote) {
  const merged = { ...local };
  for (const r of remote) {
    const localRow = local[r.id];
    const snapRow = snap[r.id];
    const changedLocally = localRow ? !same(localRow, snapRow) : !!snapRow;

    if (r.deleted_at) {
      if (!changedLocally) delete merged[r.id];   // deleted elsewhere, untouched here
      continue;
    }
    if (changedLocally) continue;                 // ours wins; a local delete stays deleted
    const { user_id, updated_at, deleted_at, ...clean } = r;
    merged[r.id] = clean;
  }
  return merged;
}

/* what this device owes the server after merging */
function planPush(merged, snap, remote, uid) {
  const upserts = [], tombstones = [];

  // rows the server just gave us, in local shape — pushing these back would
  // be a pointless write that also bumps updated_at for no reason
  const justReceived = {};
  for (const r of remote) {
    if (r.deleted_at) continue;
    const { user_id, updated_at, deleted_at, ...clean } = r;
    justReceived[r.id] = clean;
  }

  for (const [id, row] of Object.entries(merged)) {
    if (same(row, snap[id])) continue;          // unchanged since we last agreed
    if (same(row, justReceived[id])) continue;  // this is theirs, not ours
    upserts.push({ ...row, user_id: uid, deleted_at: null });
  }
  for (const id of Object.keys(snap)) {
    if (merged[id]) continue;
    if (remote.some(r => r.id === id && r.deleted_at)) continue;  // already tombstoned there
    tombstones.push({ ...snap[id], user_id: uid, deleted_at: nowIso() });
  }
  return { upserts, tombstones };
}

/* ─────────────────────────── photos ─────────────────────────── */

const photoPath = (uid, id) => `${uid}/${id}.jpg`;

async function listRemotePhotos(uid) {
  const r = await api(`/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: `${uid}/`, limit: 1000 }),
  });
  if (!r.ok) return null;
  const items = await r.json();
  return new Set(items.map(i => i.name.replace(/\.jpg$/, '')));
}

async function uploadPhoto(uid, id, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const r = await api(`/storage/v1/object/${BUCKET}/${photoPath(uid, id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: blob,
  });
  return r.ok;
}

async function downloadPhoto(uid, id) {
  const r = await api(`/storage/v1/object/${BUCKET}/${photoPath(uid, id)}`);
  if (!r.ok) return null;
  const blob = await r.blob();
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res(null);
    fr.readAsDataURL(blob);
  });
}

async function deletePhoto(uid, id) {
  await api(`/storage/v1/object/${BUCKET}/${photoPath(uid, id)}`, { method: 'DELETE' }).catch(() => {});
}

/* ─────────────────────────── the sync ─────────────────────────── */

const TABLES = ['people', 'records', 'prayers', 'touches'];

let syncing = false;
let queued = false;
const listeners = [];
const onStatus = fn => listeners.push(fn);
let status = { state: 'idle', at: null, error: null };
const setStatus = s => { status = { ...status, ...s }; listeners.forEach(f => f(status)); };

async function sync({ manual = false } = {}) {
  if (!Session.signedIn) return;
  if (!navigator.onLine) { setStatus({ state: 'offline' }); return; }
  if (syncing) { queued = true; return; }

  syncing = true;
  setStatus({ state: 'syncing', error: null });
  try {
    const uid = Session.user.id;
    const since = localStorage.getItem('kindred:syncedAt') || '1970-01-01T00:00:00Z';

    const people = Kindred.people;
    const photos = Kindred.photos;
    const { rows: local, photoLens } = flatten(people, photos);
    const snap = (await Kindred.Store.loadSnapshot()) || { rows: { people: {}, records: {}, prayers: {}, touches: {} }, photoLens: {} };

    /* 1 ─ pull everything the server has seen since we last agreed */
    const remote = {};
    let watermark = since;
    for (const t of TABLES) {
      remote[t] = await selectSince(t, since);
      for (const r of remote[t]) if (r.updated_at > watermark) watermark = r.updated_at;
    }

    /* 2 ─ merge, and 3 ─ work out what we owe the server */
    const merged = {}, pushes = {}, tombstones = {};
    for (const t of TABLES) {
      merged[t] = mergeTable(local[t], snap.rows[t], remote[t]);
      const plan = planPush(merged[t], snap.rows[t], remote[t], uid);
      pushes[t] = plan.upserts;
      tombstones[t] = plan.tombstones;
    }

    /* people must exist before rows that reference them, and go last on delete */
    for (const t of TABLES) {
      const back = await upsert(t, pushes[t]);
      for (const r of back) if (r.updated_at > watermark) watermark = r.updated_at;
    }
    for (const t of [...TABLES].reverse()) {
      const back = await upsert(t, tombstones[t]);
      for (const r of back) if (r.updated_at > watermark) watermark = r.updated_at;
    }

    /* 4 ─ photos */
    const nextPhotos = { ...photos };
    const remoteSet = await listRemotePhotos(uid);
    if (remoteSet) {
      for (const id of Object.keys(merged.people)) {
        const localLen = photos[id]?.length;
        const snapLen = snap.photoLens[id];
        if (localLen && localLen !== snapLen) {
          await uploadPhoto(uid, id, photos[id]);              // new or changed here
        } else if (!localLen && remoteSet.has(id)) {
          const got = await downloadPhoto(uid, id);            // arrived from elsewhere
          if (got) { nextPhotos[id] = got; await Kindred.Store.savePhoto(id, got); }
        }
      }
      for (const id of Object.keys(snap.photoLens)) {
        if (!photos[id] && remoteSet.has(id) && merged.people[id]) await deletePhoto(uid, id);
      }
      for (const id of remoteSet) {
        if (!merged.people[id]) await deletePhoto(uid, id);    // person is gone
      }
    }

    /* 5 ─ land the result and remember what we agreed */
    const nextPeople = nest(merged).map(Kindred.normalise);
    for (const id of Object.keys(nextPhotos)) {
      if (!merged.people[id]) { delete nextPhotos[id]; await Kindred.Store.deletePhoto(id); }
    }
    Kindred.people = nextPeople;
    Kindred.photos = nextPhotos;
    await Kindred.Store.savePeople(nextPeople);

    const settled = flatten(nextPeople, nextPhotos);
    await Kindred.Store.saveSnapshot(settled);
    // rewind the watermark slightly: if the other device wrote between our pull
    // and our push, that row would otherwise sit just under the mark and be
    // missed forever. Re-examined rows merge to no-ops, so the cost is nil.
    localStorage.setItem('kindred:syncedAt',
      new Date(Date.parse(watermark) - 2000).toISOString());

    Kindred.render();
    setStatus({ state: 'ok', at: Date.now(), error: null });
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

let debounce = null;
const syncSoon = () => { clearTimeout(debounce); debounce = setTimeout(sync, 2500); };

function paintStatus() {
  const box = $('#sync-state');
  const btn = $('#btn-auth');
  const line = $('#account-line');
  if (!box) return;

  const s = Session.get();
  if (!s) {
    box.textContent = 'Not signed in — this device only';
    box.dataset.state = 'off';
    if (btn) btn.textContent = 'Sign in';
    if (line) line.textContent = 'Sign in to sync this device with your phone.';
    return;
  }
  if (btn) btn.textContent = 'Sign out';
  if (line) line.textContent = s.user.email;

  const map = {
    idle:    'Waiting to sync',
    syncing: 'Syncing…',
    offline: 'Offline — will sync when you reconnect',
    error:   'Sync problem: ' + (status.error || ''),
    ok:      status.at ? 'Synced ' + timeAgo(status.at) : 'Synced',
  };
  box.textContent = map[status.state] || '';
  box.dataset.state = status.state;
}

function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  return Math.round(s / 3600) + ' h ago';
}

function openSignIn() {
  $('#auth-error').textContent = '';
  $('#auth-email').value = Session.user?.email || '';
  $('#auth-password').value = '';
  $('#dlg-auth').showModal();
  setTimeout(() => $(Session.user?.email ? '#auth-password' : '#auth-email').focus(), 60);
}

function wire() {
  $('#form-auth').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#auth-submit');
    const err = $('#auth-error');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      await signIn($('#auth-email').value.trim(), $('#auth-password').value);
      $('#auth-password').value = '';
      $('#dlg-auth').close();
      paintStatus();
      Kindred.toast('Signed in — syncing your circle');
      await sync({ manual: true });
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
      paintStatus();
    }
  };
  $('#auth-cancel').onclick = () => $('#dlg-auth').close();

  $('#btn-auth').onclick = () => {
    if (Session.signedIn) {
      if (!confirm('Sign out? Everything stays on this device, it just stops syncing.')) return;
      signOut();
      paintStatus();
      Kindred.toast('Signed out');
    } else openSignIn();
  };

  $('#btn-sync-now').onclick = () => sync({ manual: true });

  onStatus(paintStatus);
  Kindred.onMutate(syncSoon);

  window.addEventListener('online', () => { setStatus({ state: 'idle' }); sync(); });
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  setInterval(paintStatus, 30000);
}

function boot() {
  if (!$('#dlg-auth')) return;
  wire();
  paintStatus();
  if (Session.signedIn) sync();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

window.KindredSync = {
  sync, signIn, signOut, Session, status: () => status,
  flatten, nest, mergeTable, planPush,   // exported so the rules can be tested
};
})();
