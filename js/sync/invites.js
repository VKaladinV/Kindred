/* uses: ANON API BUCKET nowIso · Session · api rest */

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

async function uploadInvitePhoto(inviteId, blob) {
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
  return r.blob();
}

/* An invitation's photo has done its job the moment the invitation is taken
   up: the only code that ever reads one runs on the joiner's device, in the
   same breath as the claim. Nothing removed them, so every invitation ever
   sent left a picture in the bucket for as long as the account existed —
   the one unbounded write in the app.

   Answers whether it actually went. A database still on an older share.sql
   has no delete policy for this folder and will say no, and a no that reads
   as a yes is a picture left behind with nothing ever looking at it again. */
async function deleteInvitePhoto(inviteId) {
  try {
    const r = await api(`/storage/v1/object/${BUCKET}/${invitePhotoPath(inviteId)}`, { method: 'DELETE' });
    return r.ok;
  } catch { return false; }
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
