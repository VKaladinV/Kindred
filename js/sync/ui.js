/* uses: $ · Session authWords recover signIn signOut signUp · api
   · onStatus setStatus status sync syncing
*/

let debounce = null;

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
