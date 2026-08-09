/* uses: ANON API · Session · api rest · authWords */

/* ═══════════════════════ two-factor authentication ═══════════════════════
   Optional, per account, and enforced by the database rather than by this
   file — supabase/mfa.sql is the actual gate; everything here is only the
   conversation with GoTrue that gets an account to (or past) it. Without
   that migration run, enrolling still works and asking for a code at
   sign-in still works, but a session that skipped the code would still be
   answered by the API — the same shape of trust the rest of the linking
   layer has in an un-migrated database, and the same reason every call
   here is best-effort from the caller's side, never assumed. */

/* Whichever factor is fully set up — there is only ever meant to be one, the
   way there is only ever one PIN. Anything still 'unverified' is a setup
   abandoned partway through, not a second factor actually protecting
   anyone, so it is never treated as one. */
const verifiedFactor = factors => factors.find(f => f.status === 'verified') || null;

/* No endpoint lists a user's own factors on its own — they ride along on the
   user object GoTrue already hands back for anything else, so this asks for
   that rather than a call that does not exist. */
async function myFactors() {
  const r = await api('/auth/v1/user');
  if (!r.ok) throw new Error('Could not check whether a code is needed');
  const body = await r.json();
  return body.factors || [];
}

async function enrollTotp() {
  const r = await api('/auth/v1/factors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ factor_type: 'totp', friendly_name: 'authenticator', issuer: 'Fellowship' }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(authWords(body, 'Could not start setting that up'));
  return body;   // { id, totp: { qr_code, secret, uri } }
}

async function challengeFactor(factorId) {
  const r = await api(`/auth/v1/factors/${factorId}/challenge`, { method: 'POST' });
  const body = await r.json();
  if (!r.ok) throw new Error(authWords(body, 'Could not reach the server — try again'));
  return body;   // { id, expires_at }
}

/* Verifying a fresh enrolment and verifying a code at sign-in are the same
   call — the one difference is what the caller does with the session that
   comes back. Both hand back a full new one, upgraded to aal2, because that
   is the session whatever runs next actually needs: mfa.sql's policy refuses
   an aal1 token the moment a verified factor exists for that account, and
   that becomes true the instant this call succeeds. Whoever calls this is
   the one who has to hand the result to setSession — this file only talks
   to GoTrue, never to Session, the same split rest.js and session.js keep. */
async function verifyFactor(factorId, challengeId, code) {
  const r = await api(`/auth/v1/factors/${factorId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId, code }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(authWords(body, 'That code did not match'));
  return body;
}

/* 404 is not a failure here — it means the factor is already gone, which is
   the state being asked for either way. */
async function unenrollFactor(factorId) {
  const r = await api(`/auth/v1/factors/${factorId}`, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error('Could not turn that off — try again');
}
