/* ══════════════════════════════════════════════════════════════════════
   Fellowship — sign-in and device sync.

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

/* One place that turns a token response into a session. There were two copies
   of this and sign-up was about to make a third, which is exactly how the
   three quietly stop agreeing about what a session holds. */
function setSession(body) {
  Session.set({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + (body.expires_in || 3600) * 1000,
    user: { id: body.user.id, email: body.user.email },
  });
  return Session.get();
}

/* GoTrue says what went wrong in whichever of three fields it feels like, and
   what it says is written for a developer reading a console. This is the one
   place that turns it into something worth reading on a phone. */
function authWords(body, fallback) {
  const raw = (body?.error_code || body?.msg || body?.message || body?.error_description || body?.error || '').toLowerCase();
  if (!raw) return fallback;
  if (raw.includes('invalid login') || raw.includes('invalid_credentials')) return "That email and password don't match.";
  if (raw.includes('not confirmed')) return 'Almost — the link in that email finishes it.';
  if (raw.includes('already registered') || raw.includes('already been registered')) return 'There is already an account on that address. Sign in instead.';
  if (raw.includes('password') && (raw.includes('short') || raw.includes('least') || raw.includes('weak'))) return 'That password is too short — six characters at least.';
  if (raw.includes('rate limit') || raw.includes('over_email_send')) return 'Too many emails just now. Try again in a few minutes.';
  if (raw.includes('validate email') || raw.includes('invalid email') || raw.includes('invalid format')) return 'That does not look like an email address.';
  /* New accounts turned off in the Supabase dashboard, which reads to whoever
     is standing there as the app being broken — it is not, and saying so is
     the difference between them giving up and them sending you a message. */
  if (raw.includes('signup_disabled') || raw.includes('signups not allowed')
    || raw.includes('email_provider_disabled') || raw.includes('signups are disabled')) {
    return 'New accounts are switched off on this server just now. Nothing is wrong with your link — ask whoever set up Fellowship to turn sign-ups back on.';
  }
  if (raw.includes('unexpected_failure') || raw.includes('database error')) {
    return 'The server stumbled on that. Nothing you typed is wrong — try again in a minute.';
  }
  return body?.msg || body?.message || body?.error_description || fallback;
}

async function signIn(email, password) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(authWords(body, 'Could not sign in'));
  return setSession(body);
}

/* Making an account, which until now there was no way to do from inside the
   app at all — the only route in was a row somebody else had already created.

   Whether this signs you in depends on a setting in the Supabase dashboard
   rather than on anything here: with email confirmation on, the response
   carries a user and no session, because the account is not usable until the
   link in the email is followed. That is a success, not a failure, and it has
   to be reported as one — so the two cases are told apart by whether a token
   came back, and the caller is told which happened.

   redirect_to for the same reason recover() carries one, and with more riding
   on it: an invitation is waiting in this origin's localStorage, and a confirm
   link that lands on some other address the dashboard happens to hold leaves
   it there unreachable. Sending them back where they started is what keeps the
   invitation and the account the same story. */
async function signUp(email, password) {
  const redirect = encodeURIComponent(`${location.origin}${location.pathname}`);
  const r = await fetch(`${API}/auth/v1/signup?redirect_to=${redirect}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(authWords(body, 'Could not create the account'));

  /* Confirmation off: a session arrives here and you are in. */
  if (body.access_token) { setSession(body); return { state: 'in' }; }

  /* An address that already has an account comes back as 200 with a decoy
     user carrying no identities — deliberately, so that signing up cannot be
     used to find out who has an account. Told apart from a genuine new
     sign-up only by that empty array, and worth telling apart: otherwise this
     says "check your inbox" for an email that is never sent. */
  if (Array.isArray(body.identities) && body.identities.length === 0) return { state: 'exists' };

  return { state: 'sent' };
}

/* Without this, a forgotten password is an account nobody can get back into —
   which was survivable while the only user was the person who built it.

   redirect_to rides along the same way a join link's own origin does: the
   email brings them back to wherever this was sent from — this deploy, a
   preview, a phone testing against localhost — rather than one fixed
   address baked into the Supabase project's dashboard settings. Supabase
   still has to be told each address is allowed to be redirected to (see
   Authentication → URL Configuration), this only chooses which allowed one
   is used. */
async function recover(email) {
  const redirect = encodeURIComponent(`${location.origin}${location.pathname}`);
  const r = await fetch(`${API}/auth/v1/recover?redirect_to=${redirect}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!r.ok) throw new Error(authWords(await r.json().catch(() => ({})), 'Could not send that'));
  return true;
}

/* The other end of recover() — or of signUp() waiting on confirmation, or a
   magic link, any of GoTrue's own emails: the link redirects here carrying a
   short-lived access token in the fragment rather than the query string,
   its choice this time, not this app's — and it is taken out of the address
   bar the same way an invitation's token is, since a token is not something
   to leave sitting in browser history. It proves who they are on its own;
   nothing here asks for a password. `type` tells the two apart — recovery
   still needs a new password typed in, everything else is simply proof of
   who signed in, indistinguishable from having typed one. */
async function consumeAuthFragment() {
  const params = new URLSearchParams(location.hash.slice(1));
  const accessToken = params.get('access_token');
  const type = params.get('type');
  if (!accessToken || !type) return null;
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch {}

  try {
    const r = await fetch(`${API}/auth/v1/user`, {
      headers: { apikey: ANON, Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;   // link expired, already used, or malformed
    setSession({
      access_token: accessToken,
      refresh_token: params.get('refresh_token') || '',
      expires_in: Number(params.get('expires_in')) || 3600,
      user: await r.json(),
    });
  } catch { return null; }    // offline, most likely — the email link still works if opened again
  return type;
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
  return setSession(await r.json());
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

/* ═══════════════════════ linking two people ═══════════════════════
   An invitation is a secret in a link. Whoever opens it proves they were
   sent it, which is the same trust the message carrying it already had —
   you chose who to send it to, in a conversation you were already having.

   The secret never reaches the server. Only its SHA-256 is stored, so the
   database cannot be read to replay an invitation, and claiming one goes
   through a function rather than a table because finding a row by its hash
   is precisely what the receiver must be able to do and must not be able
   to browse. Every one of these is best-effort: none of it is needed for
   the app to keep a circle, so none of it may break keeping one. */

/* 32 bytes, url-safe. Guessing is not a threat model at that width. */
function newToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashToken(token) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/* The fragment, never the query string. A query reaches Netlify's logs and
   whatever crawler WhatsApp sends to build a link preview, and the service
   worker would cache "/?join=SECRET" as its own entry. A fragment is not
   sent to a server at all and is stripped from the Request the worker sees. */
const joinUrl = token => `${location.origin}${location.pathname}#join=${token}`;

/* `invitee` is what the sender already had written down about the person
   they're inviting — name, number, birthday, occupation — so it can ride
   along and save the other end from retyping it. Optional throughout:
   an invite with none of this works exactly as it always has. */
async function createInvite(fromName, fromTel, invitee = {}) {
  const token = newToken();
  const r = await api(rest('invites'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify([{
      created_by: Session.user.id,
      from_name: fromName || '',
      from_tel: fromTel || '',
      token_hash: await hashToken(token),
      invitee_name: invitee.name || '',
      invitee_contact: invitee.contact || '',
      invitee_birthday: invitee.birthday || null,
      invitee_occupation: invitee.occupation || '',
    }]),
  });
  if (!r.ok) throw new Error(linkWords(await r.text()));
  const [row] = await r.json();
  return { id: row.id, token, url: joinUrl(token) };
}

async function claimInvite(token, myName, myTel) {
  const r = await api('/rest/v1/rpc/claim_invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, my_name: myName || '', my_tel: myTel || '' }),
  });
  const text = await r.text();
  if (!r.ok) {
    /* Spent means the server looked the link up and refused it — expired,
       revoked, or already taken (claim_invite's own raise in share.sql).
       That is the only answer worth throwing the invitation away over.
       Everything else — offline, a lapsed session, share.sql not run yet —
       is this minute's problem, and the token has to survive it, because the
       copy in their messages may be long since scrolled past. */
    const err = new Error(linkWords(text));
    err.spent = /cannot be used/i.test(text);
    throw err;
  }
  return JSON.parse(text);
}

/* Who sent it and who it's for — asked before signing in, which is the one
   moment claimInvite can't help with (it needs a session). Unauthenticated
   on purpose: its own fetch, not the api() wrapper, and the anon key rather
   than a bearer token. Best-effort by every caller — a name to greet
   somebody with is a nicety, never something worth failing the join over. */
async function previewInvite(token) {
  const r = await fetch(`${API}/rest/v1/rpc/preview_invite`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!r.ok) return null;
  const body = await r.json();
  return body && Object.keys(body).length ? body : null;
}

const invitePhotoPath = id => `invites/${id}.jpg`;

async function uploadInvitePhoto(inviteId, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const r = await api(`/storage/v1/object/${BUCKET}/${invitePhotoPath(inviteId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: blob,
  });
  return r.ok;
}

async function downloadInvitePhoto(inviteId) {
  const r = await api(`/storage/v1/object/${BUCKET}/${invitePhotoPath(inviteId)}`);
  if (!r.ok) return null;
  const blob = await r.blob();
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res(null);
    fr.readAsDataURL(blob);
  });
}

/* Everyone you are linked to, as the other person's id. The list is read
   whole rather than incrementally: a link that ended leaves no row behind
   to notice, so the live list is the only thing that can say so. */
async function listLinks() {
  const uid = Session.user.id;
  const r = await api(rest('links', '?select=a,b,created_at'));
  if (!r.ok) throw new Error(linkWords(await r.text()));
  return (await r.json()).map(x => ({ other: x.a === uid ? x.b : x.a, at: x.created_at }));
}

/* Invitations you sent, so the app can notice when one has been taken up.
   There is no realtime channel and this app does not want one — you find
   out next time it syncs, which is the right rhythm for it. */
async function listInvites() {
  const r = await api(rest('invites', '?select=*&order=created_at.desc&limit=50'));
  if (!r.ok) throw new Error(linkWords(await r.text()));
  return r.json();
}

async function revokeInvite(id) {
  const r = await api(rest('invites', `?id=eq.${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revoked_at: nowIso() }),
  });
  if (!r.ok) throw new Error(linkWords(await r.text()));
}

/* Ending it is a real delete, and either side can do it. */
async function unlink(other) {
  const uid = Session.user.id;
  const [a, b] = uid < other ? [uid, other] : [other, uid];
  const r = await api(rest('links', `?a=eq.${a}&b=eq.${b}`), { method: 'DELETE' });
  if (!r.ok) throw new Error(linkWords(await r.text()));
}

/* A database that has not had share.sql run against it answers 404 with a
   message about a missing relation, and "could not find the table" is not
   something to put in front of somebody. */
function linkWords(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('does not exist') || t.includes('not find') || t.includes('pgrst205')) {
    return 'Linking is not set up on this account yet.';
  }
  if (t.includes('cannot be used')) return 'That link cannot be used — it may have expired, or already been taken up.';
  if (t.includes('not signed in')) return 'Sign in first, then open the link again.';
  try {
    const j = JSON.parse(text);
    return j.message || j.msg || j.hint || 'Something went wrong';
  } catch { return 'Something went wrong'; }
}

/* ───────────────────── local shape ⇄ table rows ───────────────────── */

const d = v => (v ? v : null);            // '' means "not set", which is null in SQL

/* A photo is a data URL, and comparing two of them in full on every sync is
   wasteful — but length alone calls two different crops of the same picture
   identical often enough to matter, and the changed one never uploads. */
const photoMark = s => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return s.length + ':' + (h >>> 0).toString(36);
};

function flatten(people, photos) {
  const rows = { people: {}, records: {}, prayers: {}, touches: {}, health: {} };
  const photoLens = {};
  for (const p of people) {
    /* Key order follows the table's columns, and the two new ones go last for
       the same reason prayed_on and released_on did below: same() compares
       these stringified. Adding them at all makes every person differ from a
       snapshot written before they existed, so the first sync after this
       update re-pushes the whole circle once. That is expected — the rows are
       identical in content, and it settles on the next run. */
    rows.people[p.id] = {
      id: p.id, name: p.name, relationship: p.relationship, circles: p.groups,
      birthday: d(p.birthday), contact: p.contact, summary: p.summary,
      cadence_days: p.cadenceDays, created_on: d(p.createdAt),
      is_self: !!p.isSelf, linked_uid: p.linkedUid || null,
      occupation: p.occupation, is_future: !!p.isFuture,
    };
    for (const [key, type] of [['medications', 'medication'], ['conditions', 'condition']]) {
      for (const h of p[key]) {
        rows.health[h.id] = {
          id: h.id, person_id: p.id, type,
          name: h.name, detail: h.detail, added_on: d(h.addedAt),
        };
      }
    }
    for (const r of p.events) {
      rows.records[r.id] = {
        id: r.id, person_id: p.id, type: r.type, starts_on: r.date,
        ends_on: d(r.endDate), kind: r.kind, title: r.title, note: r.note,
        repeats_yearly: !!r.repeatsYearly, shared: !!r.shared,
      };
    }
    for (const pr of p.prayers) {
      /* Key order follows the table's columns — prayed_on and released_on were
         added last — because same() compares these stringified, and a different
         order here would re-push every prayer on every sync. */
      rows.prayers[pr.id] = {
        id: pr.id, person_id: p.id, body: pr.text, created_on: d(pr.createdAt),
        answered_on: d(pr.answeredAt), answer_note: pr.answerNote || '',
        prayed_on: d(pr.prayedAt), released_on: d(pr.releasedAt),
        shared: !!pr.shared,
      };
    }
    for (const t of p.touches) {
      /* Person and date, exactly as before a check-in learned how it happened
         — so every row already on the server keeps the id it was written
         under, and none of that history looks deleted on the next sync. */
      const id = `${p.id}:${t.date}`;      // deterministic, so two devices agree
      /* Key order follows the table's columns: kind was added last, and same()
         compares these stringified, so a different order here would re-push
         every check-in on every sync. */
      rows.touches[id] = { id, person_id: p.id, touched_on: t.date, kind: t.kind || '' };
    }
    if (photos[p.id]) photoLens[p.id] = photoMark(photos[p.id]);
  }
  return { rows, photoLens };
}

/* rebuild the app's nested shape from flat rows */
function nest(rows) {
  const byId = {};
  const people = Object.values(rows.people).map(r => {
    const p = {
      /* circle is what the server called a single group before there could
         be several — reading it here migrates rows already up there */
      groups: r.circles?.length ? r.circles : (r.circle ? [r.circle] : []),
      id: r.id, name: r.name || 'Unnamed', relationship: r.relationship || '',
      birthday: r.birthday || '', contact: r.contact || '',
      summary: r.summary || '', cadenceDays: r.cadence_days || 0,
      createdAt: r.created_on || '', touches: [], events: [], prayers: [],
      medications: [], conditions: [],
      /* Anything flatten writes has to be read back here. nest's result
         replaces the whole in-memory list on every sync, so a column written
         and not read is not merely lost between devices — it is wiped on this
         one, seconds later. */
      isSelf: !!r.is_self, linkedUid: r.linked_uid || null,
      occupation: r.occupation || '', isFuture: !!r.is_future,
    };
    byId[r.id] = p;
    return p;
  });
  for (const r of Object.values(rows.records)) {
    const p = byId[r.person_id]; if (!p) continue;
    p.events.push({
      id: r.id, type: r.type, date: r.starts_on, endDate: r.ends_on || '',
      kind: r.kind, title: r.title, note: r.note || '', repeatsYearly: !!r.repeats_yearly,
      shared: !!r.shared,
    });
  }
  for (const r of Object.values(rows.prayers)) {
    const p = byId[r.person_id]; if (!p) continue;
    p.prayers.push({
      id: r.id, text: r.body, createdAt: r.created_on || '',
      answeredAt: r.answered_on || null, answerNote: r.answer_note || '',
      prayedAt: r.prayed_on || '', releasedAt: r.released_on || '',
      shared: !!r.shared,
    });
  }
  for (const r of Object.values(rows.touches)) {
    const p = byId[r.person_id]; if (!p) continue;
    p.touches.push({ date: r.touched_on, kind: r.kind || '' });
  }
  for (const r of Object.values(rows.health || {})) {
    const p = byId[r.person_id]; if (!p) continue;
    p[r.type === 'condition' ? 'conditions' : 'medications'].push({
      id: r.id, name: r.name || '', detail: r.detail || '', addedAt: r.added_on || '',
    });
  }
  for (const p of people) p.touches.sort((a, b) => a.date.localeCompare(b.date));
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

/* ═══════════════════════ what you publish ═══════════════════════
   One row per account, replaced whole. There is one writer and no merge
   problem here — you own it, you overwrite it — so un-sharing an item is
   simply a payload that no longer contains it, with no tombstone needed.

   Deliberately outside TABLES and outside flatten/nest. The snapshot only
   ever holds the five synced tables, and that is the whole of how the
   snapshot-diff engine is kept from trying to push a shared row back: it has
   never heard of one. There is no flag to respect and nothing here for a
   future edit to planPush to get wrong. */

const publishedFields = r => ({
  id: r.id, type: r.type, date: r.date, endDate: r.endDate || '',
  kind: r.kind, title: r.title, note: r.note || '', repeatsYearly: !!r.repeatsYearly,
});

/* What leaves the device when you publish. Everything else about a person —
   medications, conditions, contact, cadence, check-ins, groups, and anything
   you did not mark shared — is not in here, whatever else changes about how
   this function is written; that is the private-by-default promise the
   feature rests on, kept by construction rather than by a filter someone
   could later forget to apply. */
function projectSelf(me, photoDataUrl) {
  return {
    v: 1,
    name: me.name,
    photo: photoDataUrl || '',
    birthday: me.birthday || '',
    summary: me.summary || '',
    seasons: me.events.filter(r => r.shared && r.type === 'season' && !r.endDate).map(publishedFields),
    upcoming: me.events.filter(r => r.shared && r.type === 'upcoming').map(publishedFields),
    history: me.events.filter(r => r.shared && (r.type === 'history' || (r.type === 'season' && r.endDate))).map(publishedFields),
    prayers: me.prayers.filter(pr => pr.shared && !pr.answeredAt && !pr.releasedAt)
      .map(pr => ({ id: pr.id, text: pr.text, createdAt: pr.createdAt })),
  };
}

/* Run back through the same downscale a new photo gets, to a size meant for
   a small circle rather than a full crop — a published face costs 5–8KB
   this way instead of the 30–60KB the local one is. Kept inside the payload
   itself rather than in storage, which avoids touching the photo bucket's
   policies at all and keeps sync()'s own photo reconciliation, which only
   ever looks at <uid>/, from needing to learn about a second convention. */
async function projectPhoto(me) {
  const src = Kindred.photos[me.id];
  if (!src) return '';
  try {
    const img = await Kindred.loadImage(src);
    return Kindred.downscale(img, 160, 0.7);
  } catch { return ''; }   // a photo that will not load is not worth failing a sync over
}

async function publishMine(uid) {
  const me = Kindred.self;

  if (!me) {
    /* No profile now, but something was published before it was removed.
       Left alone, whoever you linked with would go on seeing a person who
       no longer exists here — so taking the profile down travels with
       taking it down locally, not as a separate step to remember. */
    if (localStorage.getItem('kindred:publishedMark')) {
      const r = await api(rest('profiles', `?user_id=eq.${uid}`), { method: 'DELETE' });
      if (r.ok) localStorage.removeItem('kindred:publishedMark');
    }
    return;
  }

  const payload = projectSelf(me, await projectPhoto(me));
  const body = JSON.stringify(payload);
  /* The same cheap content mark photos already use, run over the whole
     payload — sharing nothing new is the ordinary case on most syncs, and
     this is what keeps that case a single comparison rather than a request. */
  const mark = photoMark(body);
  if (mark === localStorage.getItem('kindred:publishedMark')) return;

  const r = await api(rest('profiles'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ user_id: uid, payload }]),
  });
  if (!r.ok) throw new Error('profiles: ' + (await r.text()).slice(0, 140));
  localStorage.setItem('kindred:publishedMark', mark);
}

async function pullShared(uid) {
  /* Read whole rather than incrementally, and it has to be: a link that
     ended leaves no row behind for an incremental pull to notice, so the
     live list is the only thing that can say a partner is no longer one.
     It is at most a handful of rows — nothing about reading it needs to be
     cheap the way five tables of records do. */
  const lr = await api(rest('links', '?select=a,b'));
  if (!lr.ok) throw new Error('links: ' + (await lr.text()).slice(0, 140));
  const partners = new Set((await lr.json()).map(row => (row.a === uid ? row.b : row.a)));

  const since = localStorage.getItem('kindred:sharedAt') || '1970-01-01T00:00:00Z';
  const pr = await api(rest('profiles', `?select=user_id,payload,updated_at&updated_at=gt.${encodeURIComponent(since)}`));
  if (!pr.ok) throw new Error('profiles: ' + (await pr.text()).slice(0, 140));

  const cached = (await Kindred.Store.loadShared()) || {};
  const next = { ...cached };
  let mark = since;
  for (const row of await pr.json()) {
    if (row.updated_at > mark) mark = row.updated_at;
    if (row.user_id === uid) continue;      // your own row comes back too
    next[row.user_id] = { ...row.payload, at: row.updated_at };
  }
  /* Ended links stop being read here rather than being told to leave —
     nobody sends a tombstone for a friendship, the row for it just stops
     coming back, so the cache is pruned against who is still a partner. */
  for (const k of Object.keys(next)) if (!partners.has(k)) delete next[k];

  Kindred.shared = next;
  await Kindred.Store.saveShared(next);
  // the same small rewind the main watermark uses, and for the same reason
  localStorage.setItem('kindred:sharedAt',
    new Date(Date.parse(mark) - 2000).toISOString());
}

/* ─────────────────────────── the sync ─────────────────────────── */

const TABLES = ['people', 'records', 'prayers', 'touches', 'health'];

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
    /* Built from TABLES rather than written out again. The hand-written version
       of this had lost `health` when that table was added, and planPush reaches
       Object.keys(snap) unconditionally — so a device with no snapshot yet threw
       on its very first sync, never wrote a snapshot, and threw identically ever
       after. It only ever showed on a brand new account or a fresh sign-in,
       which is exactly the moment nothing else has gone wrong yet. */
    const snap = (await Kindred.Store.loadSnapshot()) || { rows: emptyRows(), photoLens: {} };

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
      /* A snapshot written before a table existed has no bucket for it, and a
         missing bucket is the same thing as having agreed nothing about it. */
      const was = snap.rows[t] || {};
      merged[t] = mergeTable(local[t], was, remote[t]);
      const plan = planPush(merged[t], was, remote[t], uid);
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
    /* An id lands here when its upload comes back not-ok — a network blip, a
       transient 5xx, whatever. Left unmarked below, so the snapshot does not
       claim the server has it: the next sync's localLen !== snapLen check
       reads that as "changed since we agreed" and uploads it again on its
       own, the same path an ordinary edit already takes. Recorded as synced
       instead, one bad request would desync this photo permanently — nothing
       else would ever notice it needed a retry. */
    const failedUploads = new Set();
    if (remoteSet) {
      for (const id of Object.keys(merged.people)) {
        const localLen = photos[id] && photoMark(photos[id]);
        const snapLen = snap.photoLens[id];
        if (localLen && localLen !== snapLen) {
          if (!(await uploadPhoto(uid, id, photos[id]))) failedUploads.add(id);   // new or changed here
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
    /* Photos before people: setting people runs setRoster, which merges any
       duplicate self-rows and, while doing it, carries a photo across by
       reading this same photos object directly (mergeSelves, in app.js).
       Landing it here first means that carry-over reads what this sync just
       decided rather than what was true before it ran — read the other way
       round, whatever it decided was silently overwritten a line later. */
    Kindred.photos = nextPhotos;
    Kindred.people = nextPeople;
    await Kindred.Store.savePeople(nextPeople);

    const settled = flatten(nextPeople, nextPhotos);
    for (const id of failedUploads) delete settled.photoLens[id];
    await Kindred.Store.saveSnapshot(settled);
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
    try {
      await publishMine(uid);
      await pullShared(uid);
    } catch (e) { console.warn('[sync] linking', e.message || e); }

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
  const foot = $('#footer-sync');
  if (!box) return;

  const s = Session.get();
  if (!s) {
    box.textContent = 'Not signed in — this device only';
    box.dataset.state = 'off';
    if (btn) btn.textContent = 'Sign in';
    if (line) line.textContent = 'Sign in to sync this device with your phone.';
    if (foot) foot.textContent = 'kept on this device';
    return;
  }
  if (btn) btn.textContent = 'Sign out';
  if (line) line.textContent = s.user.email;
  if (foot) foot.textContent = 'synced to your account';

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

/* Which of the two things the one form is currently doing. */
let authMode = 'in';

function paintAuthMode() {
  const making = authMode === 'up';
  $('#auth-title').textContent = making ? 'Create an account' : 'Sign in';
  $('#auth-lede').textContent = making
    ? 'An account is what lets your circle reach your other devices, and later lets you link with someone. Your people stay on this device either way.'
    : 'So this device and your phone hold the same circle. Your people stay on the device either way — signing in just keeps them in step.';
  $('#auth-submit').textContent = making ? 'Create account' : 'Sign in';
  $('#auth-swap-text').textContent = making ? 'Already have one?' : 'New here?';
  $('#auth-swap').textContent = making ? 'Sign in instead' : 'Create an account';
  /* Nothing to have forgotten yet. */
  $('#auth-forgot').hidden = making;
  /* A new password is not the one the browser has saved for this site. */
  $('#auth-password').autocomplete = making ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
  $('#auth-error').classList.remove('is-note');
}

function openSignIn(mode = 'in') {
  authMode = mode;
  paintAuthMode();
  $('#auth-email').value = Session.user?.email || '';
  $('#auth-password').value = '';
  $('#dlg-auth').showModal();
  setTimeout(() => $(Session.user?.email ? '#auth-password' : '#auth-email').focus(), 60);
}

function wire() {
  $('#auth-swap').onclick = () => {
    authMode = authMode === 'up' ? 'in' : 'up';
    paintAuthMode();
    $('#auth-password').value = '';
  };

  $('#auth-forgot').onclick = async () => {
    const err = $('#auth-error');
    const email = $('#auth-email').value.trim();
    if (!email) {
      err.classList.remove('is-note');
      err.textContent = 'Put your email in first and I will send a way back in.';
      $('#auth-email').focus();
      return;
    }
    const btn = $('#auth-forgot');
    btn.disabled = true;
    try {
      await recover(email);
      err.classList.add('is-note');
      err.textContent = `Sent — open the link in ${email} to set a new password.`;
    } catch (ex) {
      err.classList.remove('is-note');
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  };

  $('#form-auth').onsubmit = async e => {
    e.preventDefault();
    const making = authMode === 'up';
    const btn = $('#auth-submit');
    const err = $('#auth-error');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = making ? 'Creating…' : 'Signing in…';
    try {
      const email = $('#auth-email').value.trim();
      const password = $('#auth-password').value;

      if (making) {
        /* Signing out leaves everyone on the device, which is right — they are
           yours and the app works signed out. But it means a second person
           making an account on a borrowed phone would push the first person's
           whole circle into their own account on the first sync. Asked before
           the account exists, so answering no costs nothing. */
        const held = Kindred.people.length;
        if (held && !confirm(
          `There ${held === 1 ? 'is 1 person' : `are ${held} people`} on this device already. `
          + `They will move into the new account.\n\nIf this is not your device, cancel and clear them first.`)) {
          return;
        }

        const { state } = await signUp(email, password);
        $('#auth-password').value = '';

        if (state === 'exists') {
          authMode = 'in';
          paintAuthMode();
          err.textContent = 'There is already an account on that address. Sign in instead.';
          return;
        }
        if (state === 'sent') {
          /* The account exists but cannot be used yet, so the dialog stays put
             and says so — closing it would look like it had worked. Flipped to
             sign-in first, because that is what they have to do next, and the
             message is written after because painting the mode clears it. */
          authMode = 'in';
          paintAuthMode();
          err.classList.add('is-note');
          err.textContent = `Almost — open the link we sent to ${email}, then sign in.`;
          return;
        }
        $('#dlg-auth').close();
        paintStatus();
        Kindred.toast('Account made — your circle will sync from here');
        await sync({ manual: true });
        /* An invitation waiting in storage does not otherwise get resumed
           until the next reload or unlock — and there was a session made
           just now, right here, worth not making them wait for. */
        Kindred.afterAuth?.();
        return;
      }

      await signIn(email, password);
      $('#auth-password').value = '';
      $('#dlg-auth').close();
      paintStatus();
      Kindred.toast('Signed in — syncing your circle');
      await sync({ manual: true });
      Kindred.afterAuth?.();
    } catch (ex) {
      err.classList.remove('is-note');
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
      btn.textContent = authMode === 'up' ? 'Create account' : 'Sign in';
      paintStatus();
    }
  };
  $('#auth-cancel').onclick = () => $('#dlg-auth').close();

  $('#recover-cancel').onclick = () => $('#dlg-recover').close();

  $('#form-recover').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#recover-submit');
    const err = $('#recover-error');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      /* api() rather than a bare fetch: it already knows how to attach the
         session consumeAuthFragment just set, and to refresh it first if
         the link sat in an inbox long enough to be close to expiring. */
      const r = await api('/auth/v1/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: $('#recover-password').value }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(authWords(body, 'Could not set that password'));
      $('#recover-password').value = '';
      $('#dlg-recover').close();
      paintStatus();
      Kindred.toast('Password set — syncing your circle');
      await sync({ manual: true });
      Kindred.afterAuth?.();
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Set password';
    }
  };

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
  /* A safety net under the triggers above: a sync that failed on a network
     blip has no further reason to run again until the next edit, the next
     tab-foreground, or the next reconnect — any of which might be a while on
     a phone left alone. sync() already guards itself against running while
     offline, signed out, or already mid-sync, so this only ever does
     anything on the cycles those triggers missed. */
  setInterval(sync, 5 * 60 * 1000);
}

async function boot() {
  if (!$('#dlg-auth')) return;
  wire();
  paintStatus();
  /* Ahead of the sign-in check below: the session this sets counts as one. */
  const confirmed = await consumeAuthFragment();
  if (confirmed === 'recovery') {
    paintStatus();
    $('#recover-error').textContent = '';
    $('#dlg-recover').showModal();
    setTimeout(() => $('#recover-password').focus(), 60);
  } else if (confirmed) {
    /* A signup confirmation or magic link — proof enough on its own, so this
       finishes the same way an ordinary sign-in does: painted, synced, and
       whatever invitation was waiting in storage for exactly this moment
       picked back up, rather than left for the user to notice went nowhere. */
    paintStatus();
    Kindred.toast('Signed in — syncing your circle');
    await sync({ manual: true });
    Kindred.afterAuth?.();
    return;
  }
  if (Session.signedIn) sync();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

window.KindredSync = {
  sync, signIn, signUp, recover, signOut, Session, status: () => status, openSignIn,
  createInvite, claimInvite, previewInvite, listLinks, listInvites, revokeInvite, unlink, joinUrl,
  uploadInvitePhoto, downloadInvitePhoto,
  projectSelf, publishMine, pullShared,
  flatten, nest, mergeTable, planPush,   // exported so the rules can be tested
};
})();
