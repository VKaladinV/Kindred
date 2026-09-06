/* uses: ANON API · Session · api rest · newToken hashToken · me
*/

/* ═══════════════════════ who is allowed in ═══════════════════════
   supabase/members.sql is the gate. Nothing in this file enforces
   anything — row-level security does, and it does it whatever a client
   believes. What this is for is knowing which of three things is true, so
   the app can say it plainly instead of showing a red sync error for a
   thing that is not an error.

   Fail open on absence, closed on refusal.
   -----------------------------------------
   If the members table is not there, this says approved and gets out of
   the way. That is the state of every copy of Fellowship until the SQL is
   pasted in, and a client that guesses wrong in that direction costs
   nothing: the real gate is in the database, and there isn't one yet.
   Guessing wrong the other way would lock somebody out of an app that
   works perfectly well.

   Only an actual answer — pending, blocked — closes anything. */

/* null means not asked yet. Everything reading this treats that as "carry
   on", because the alternative is a gate that closes for a second on every
   sign-in while a request is in flight. */
let membershipRow = null;

const membership = () => membershipRow;
const approved = () => !membershipRow || membershipRow.status === 'approved';
const isAdmin = () => !!membershipRow?.is_admin;

/* Told about, rather than asked — the gate screen and the settings row
   both want to repaint the moment this changes, and neither of them is
   what asked for it. */
const memberWatchers = [];
const onMembership = fn => memberWatchers.push(fn);
const tellMembership = () => memberWatchers.forEach(f => f(membershipRow));

function forgetMembership() {
  membershipRow = null;
  tellMembership();
}

/* Two things about one account — whether it is in, and whether it decides —
   in one request. my_membership() is what answers, rather than a select on
   members, because admin-ness is deliberately not a column there: see the
   note above public.admins in supabase/members.sql for why it cannot be. */
async function loadMembership() {
  if (!Session.signedIn) { forgetMembership(); return null; }
  try {
    const r = await api('/rest/v1/rpc/my_membership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    /* 404 is the function not being there yet — this copy has never had the
       SQL run against it. 401 is a session problem the rest of the app
       already knows how to talk about. Neither is an answer about
       membership, so neither closes anything. */
    if (!r.ok) { membershipRow = null; tellMembership(); return null; }
    const row = await r.json();
    /* An account with no row at all comes back as pending, which is what it
       is: made before any of this existed, or made without a code. The
       database already agrees, so this is the one absence that is an
       answer. */
    membershipRow = row && row.status
      ? { ...row, email: row.email || Session.user.email || '' }
      : null;
    tellMembership();
    return membershipRow;
  } catch {
    membershipRow = null;      // offline, most likely
    tellMembership();
    return null;
  }
}

/* ─────────────────────────── codes ─────────────────────────── */

/* Asked before there is an account to ask with, so this one goes out with
   the anon key rather than through api(). It answers true or false and
   nothing else. */
async function checkCode(code) {
  if (!code) return false;
  try {
    const r = await fetch(`${API}/rest/v1/rpc/code_is_good`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!r.ok) return false;
    return await r.json() === true;
  } catch {
    /* No signal. Refusing here would mean an invitation could not be
       accepted on a train, and the database will refuse it anyway if it
       is not a real code — so this lets it through to be refused by the
       thing that actually knows. */
    return true;
  }
}

async function redeemCode(code) {
  const r = await api('/rest/v1/rpc/redeem_code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      my_email: Session.user?.email || '',
      my_name: (typeof me !== 'undefined' && me?.name) || '',
    }),
  });
  if (!r.ok) throw new Error(codeWords(await r.text()));
  await loadMembership();
  return membershipRow;
}

/* PostgREST hands back the raise as JSON with the message in `message`,
   and every failure this can have was deliberately given the same words in
   the SQL — so there is one sentence to write here, not five. */
function codeWords(body) {
  const raw = (body || '').toLowerCase();
  if (raw.includes('not signed in')) return 'Sign in first, then the code.';
  if (raw.includes('cannot be used')) {
    return 'That code has been used already, or it has expired. Ask for a new one.';
  }
  if (raw.includes('could not find') || raw.includes('does not exist')) {
    return 'This copy of Fellowship has not been set up for codes yet.';
  }
  return 'That code did not work.';
}

/* ─────────────────────── the admin's own list ─────────────────────── */

/* The code is made here and hashed here; the plaintext never reaches the
   server, exactly as an invitation's does not (createInvite, invites.js).
   What comes back is the code itself — the only copy there will ever be,
   which is why it is handed straight to the dialog that shows it. */
async function makeCode(label, days = 30) {
  const code = newToken();
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  const r = await api(rest('access_codes'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify([{
      token_hash: await hashToken(code),
      label: label || '',
      created_by: Session.user.id,
      expires_at: expires,
    }]),
  });
  if (!r.ok) throw new Error('Could not make a code — ' + (await r.text()).slice(0, 120));
  const [row] = await r.json();
  return { code, url: codeUrl(code), label: row.label, expiresAt: row.expires_at, hash: row.token_hash };
}

/* The fragment, never the query string — same reasoning as joinUrl in
   invites.js: a query reaches server logs, link previews and the service
   worker's cache; a fragment is not sent to a server at all. */
const codeUrl = code => `${location.origin}${location.pathname}#code=${code}`;

/* null rather than [] when the question could not be asked at all — an empty
   list and an unanswered one look identical on screen otherwise, and "you
   have handed out no codes" is a very different thing to be told than "I
   could not reach the server". */
async function listCodes() {
  try {
    const r = await api(rest('access_codes', '?select=*&order=created_at.desc'));
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function revokeCode(hash) {
  const r = await api(rest('access_codes', `?token_hash=eq.${encodeURIComponent(hash)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  return r.ok;
}

async function listMembers() {
  try {
    const r = await api(rest('members', '?select=*&order=joined_at.asc'));
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/* Your own row is refused by the policy, not merely hidden by the screen —
   see members_decide in members.sql. This says so in words rather than
   letting a 403 arrive as silence. */
async function setMemberStatus(userId, status) {
  if (userId === Session.user?.id) throw new Error('You cannot change your own account.');
  const r = await api(rest('members', `?user_id=eq.${userId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, decided_at: new Date().toISOString(), decided_by: Session.user.id }),
  });
  if (!r.ok) throw new Error('Could not change that — ' + (await r.text()).slice(0, 120));
  return true;
}
