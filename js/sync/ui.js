/* uses: $ · Session authWords recover signIn signOut signUp · api
   · onStatus setStatus status sync syncing
   · challengeFactor enrollTotp myFactors setSession unenrollFactor verifiedFactor verifyFactor
*/

let debounce = null;

/* The one factor either dialog is currently working with, and the challenge
   raised against it — set by whichever open function is in progress, read by
   the submit handler wired once in wireSync. */
let mfaChallenge = { factorId: null, challengeId: null };
let mfaEnroll = { factorId: null, challengeId: null };

/* Asked of the page rather than of app.js, so this file still touches nothing
   but the Kindred bridge and can be dropped from the app whole. */
const writing = () => {
  const a = document.activeElement;
  return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable));
};

/* Every pause in a sentence is a mutation settling, and each one used to start
   a sync — five tables flattened and compared, on a phone, mid-paragraph.
   Waiting for the writing to stop is only politeness, not safety: the five
   minute round and the return to the app both call sync directly, so this can
   never hold anything back for long, and carryEdits means a sync that does
   land in the middle of a sentence no longer costs it anything. */
const syncSoon = () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => (writing() ? syncSoon() : sync()), 2500);
};

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

function wireSync() {
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
      /* Whether this account asks for more than a password. mfa.sql is the
         actual gate — this check only exists so the code is asked for here,
         in the app, rather than everyone finding out on the next sync that
         nothing came back. Failing open on the check itself (a network blip
         right after one that just succeeded) costs nothing worse than that
         same silence, never a way past the real gate. */
      const factor = verifiedFactor(await myFactors().catch(() => []));
      $('#dlg-auth').close();
      if (factor) {
        openMfaChallenge(factor.id);
      } else {
        paintStatus();
        Kindred.toast('Signed in — syncing your circle');
        await sync({ manual: true });
        Kindred.afterAuth?.();
      }
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

  /* The code asked for mid sign-in, on an account that turned MFA on. Wired
     once here and read from mfaChallenge at submit time, the same way
     editingHealth once was and releasing still is — the state belongs to
     whichever dialog is actually open, not to a closure remade on every
     button press. */
  $('#form-mfa-verify').onsubmit = async e => {
    e.preventDefault();
    if (!mfaChallenge.challengeId) return;
    const btn = $('#mfa-verify-submit');
    const err = $('#mfa-verify-error');
    btn.disabled = true;
    err.textContent = '';
    try {
      setSession(await verifyFactor(mfaChallenge.factorId, mfaChallenge.challengeId, $('#mfa-verify-code').value.trim()));
      $('#dlg-mfa-verify').close();
      paintStatus();
      Kindred.toast('Signed in — syncing your circle');
      await sync({ manual: true });
      Kindred.afterAuth?.();
    } catch (ex) {
      err.textContent = ex.message;
      $('#mfa-verify-code').value = '';
      $('#mfa-verify-code').focus();
    } finally {
      btn.disabled = false;
    }
  };
  /* Cancelling here is not "try later" — an account with a second factor is
     not properly signed in until it is given, and a session left sitting at
     aal1 would only confuse the next sync, which mfa.sql now answers with
     nothing for exactly this account. Signing back out is what makes the
     screen honest about that. */
  $('#mfa-verify-cancel').onclick = () => {
    $('#dlg-mfa-verify').close();
    signOut();
    paintStatus();
  };

  $('#form-mfa-enroll').onsubmit = async e => {
    e.preventDefault();
    if (!mfaEnroll.challengeId) return;
    const btn = $('#mfa-enroll-submit');
    const err = $('#mfa-enroll-error');
    btn.disabled = true;
    err.textContent = '';
    try {
      /* This account did not require aal2 a moment ago — the token this
         call hands back is the first one that does, and it is what every
         request after this has to ride, or its own next sync reads back
         nothing under the policy this enrolment just switched on. */
      setSession(await verifyFactor(mfaEnroll.factorId, mfaEnroll.challengeId, $('#mfa-enroll-code').value.trim()));
      $('#dlg-mfa-enroll').close();
      await paintMfaState();
      Kindred.toast('Two-factor authentication is on');
    } catch (ex) {
      err.textContent = ex.message;
      $('#mfa-enroll-code').value = '';
      $('#mfa-enroll-code').focus();
    } finally {
      btn.disabled = false;
    }
  };
  $('#mfa-enroll-cancel').onclick = async () => {
    $('#dlg-mfa-enroll').close();
    /* Never verified, so never protecting anything — cleaned up rather than
       left as a stale unverified factor for the next attempt to trip over. */
    if (mfaEnroll.factorId) await unenrollFactor(mfaEnroll.factorId).catch(() => {});
    mfaEnroll = { factorId: null, challengeId: null };
  };

  $('#btn-mfa-on').onclick = openMfaEnroll;
  $('#btn-mfa-off').onclick = async () => {
    if (!confirm('Turn off two-factor authentication? Signing in will only need your password after this.')) return;
    for (const f of await myFactors().catch(() => [])) await unenrollFactor(f.id).catch(() => {});
    await paintMfaState();
    Kindred.toast('Two-factor authentication turned off');
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

/* ─────────────────────────── two-factor authentication ─────────────────────────── */

/* The one moment a password alone is not enough: signing in somewhere new on
   an account that has a second factor turned on. mfa.sql is what actually
   enforces this — refusing to finish here is only ever a courtesy, never the
   real gate — but asking now is what makes the sync a moment later actually
   bring the circle back, instead of quietly reading nothing under a policy
   this screen never mentioned. */
async function openMfaChallenge(factorId) {
  mfaChallenge = { factorId, challengeId: null };
  const err = $('#mfa-verify-error');
  err.textContent = '';
  $('#mfa-verify-code').value = '';
  $('#dlg-mfa-verify').showModal();
  setTimeout(() => $('#mfa-verify-code').focus(), 60);
  try {
    mfaChallenge.challengeId = (await challengeFactor(factorId)).id;
  } catch (ex) {
    err.textContent = ex.message;
  }
}

async function openMfaEnroll() {
  const err = $('#mfa-enroll-error');
  err.textContent = '';
  $('#mfa-enroll-code').value = '';
  $('#mfa-qr').src = '';
  $('#mfa-secret').textContent = '';
  mfaEnroll = { factorId: null, challengeId: null };
  $('#dlg-mfa-enroll').showModal();

  try {
    /* Only one factor at a time, the way there is only ever one PIN. Any
       leftover here — verified or not — is cleaned up first: a verified one
       would mean this dialog was reachable while already on, which the
       settings toggle does not allow, and an unverified one is a setup
       abandoned partway through last visit. */
    for (const f of await myFactors()) await unenrollFactor(f.id).catch(() => {});
    const enrolled = await enrollTotp();
    mfaEnroll.factorId = enrolled.id;
    /* GoTrue hands this back as a bare <svg>…</svg> string, not the data URI
       the shape of the field's name suggests — set straight as an <img> src
       it reads as a relative path instead of a picture. Wrapped here rather
       than trusted, in case a future GoTrue does send a real data URI: this
       leaves that shape alone and only wraps what still needs it. */
    const qr = enrolled.totp.qr_code || '';
    $('#mfa-qr').src = qr.startsWith('data:') ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`;
    $('#mfa-secret').textContent = enrolled.totp.secret;
    mfaEnroll.challengeId = (await challengeFactor(enrolled.id)).id;
  } catch (ex) {
    err.textContent = ex.message || 'Could not set that up — try again';
  }
}

/* Painted when settings opens, in wire.js, alongside paintNotifState and
   paintLockState — not on a timer, since the one thing that could change it
   is this same dialog's own buttons, never something happening elsewhere. */
async function paintMfaState() {
  const box = $('#setting-mfa');
  if (!box) return;
  if (!Session.signedIn) { box.hidden = true; return; }
  box.hidden = false;
  const on = !!verifiedFactor(await myFactors().catch(() => []));
  $('#mfa-hint').textContent = on
    ? 'On. Signing in on a new device also asks for a code from your authenticator app.'
    : 'Ask for a code from an authenticator app, on top of your password, whenever you sign in.';
  $('#btn-mfa-on').hidden = on;
  $('#btn-mfa-off').hidden = !on;
}
