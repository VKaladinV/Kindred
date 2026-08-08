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

