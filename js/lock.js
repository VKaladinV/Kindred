/* uses: $ · Store · toast · offerPendingJoin · nudgeIfDue
   · LOCK_PAUSE LOCK_TRIES PIN_MAX PIN_MIN askBio bioCredential bioReady canLock clearLock enrolBio hasPin lockRecord pinMatches setPin syncEmail
   · renderAll
*/

let locked = false;
let hiddenAt = Date.now();

let wrongTries = 0;
let pauseUntil = 0;
let pauseTimer = null;
let bioAsked = false;

function showLock() {
  if (locked || !hasPin()) return;
  locked = true;
  wrongTries = 0;
  pauseUntil = 0;
  bioAsked = false;

  $('#lock-pin').value = '';
  $('#lock-error').textContent = '';
  $('#lock-forgot-panel').hidden = true;
  $('#lock-bio').hidden = !bioCredential();
  paintLockPause();

  const dlg = $('#lock');
  if (!dlg.open) dlg.showModal();

  /* The fingerprint sheet and the keyboard both want the screen, so
     whichever is about to happen gets it to itself. */
  if (bioCredential()) tryBio(true);
  else setTimeout(() => $('#lock-pin').focus(), 60);
}

function unlock() {
  locked = false;
  clearTimeout(pauseTimer);
  hiddenAt = Date.now();
  $('#lock-pin').value = '';
  $('#lock-forgot-password').value = '';
  const dlg = $('#lock');
  if (dlg.open) dlg.close();
  renderAll();
  nudgeIfDue();   // held back while locked, so it lands now instead
  /* Held back for the same reason: an invitation waiting in storage is not
     for whoever happened to be holding the phone. */
  offerPendingJoin();
}

async function tryBio(auto = false) {
  if (auto && bioAsked) return;
  bioAsked = true;
  try {
    if (await askBio()) return unlock();
  } catch { /* dismissed, or the browser wanted a tap of its own first */ }
  if (auto) setTimeout(() => $('#lock-pin').focus(), 60);
}

/* Five wrong and it pauses for half a minute. The count lives in memory
   only — this is a lock on a door, and pretending otherwise by hardening
   it against a patient attacker would be dressing up what it is. */
function paintLockPause() {
  clearTimeout(pauseTimer);
  const left = Math.max(0, Math.ceil((pauseUntil - Date.now()) / 1000));
  $('#lock-pin').disabled = left > 0;
  $('#lock-unlock').disabled = left > 0;
  if (left) {
    $('#lock-error').textContent = `Too many tries — ${left}s`;
    pauseTimer = setTimeout(paintLockPause, 1000);
  } else if (pauseUntil) {
    pauseUntil = 0;
    $('#lock-error').textContent = '';
    $('#lock-pin').focus();
  }
}

async function submitPin() {
  if (pauseUntil || !locked) return;
  const pin = $('#lock-pin').value;
  if (pin.length < PIN_MIN) return;

  if (await pinMatches(pin)) return unlock();

  $('#lock-pin').value = '';
  if (++wrongTries >= LOCK_TRIES) {
    wrongTries = 0;
    pauseUntil = Date.now() + LOCK_PAUSE;
    paintLockPause();
  } else {
    $('#lock-error').textContent = 'That is not the PIN';
  }
  const card = $('#lock-card');
  card.classList.remove('is-wrong');
  void card.offsetWidth;            // let the shake start again from nothing
  card.classList.add('is-wrong');
}

/* Signing in is the way back — but only as the account this device already
   belongs to. Any Fellowship account opening any phone would be no lock at all. */
function knownAccount() {
  return (syncEmail() || lockRecord()?.email || '').toLowerCase();
}

function paintForgot() {
  const can = !!(window.KindredSync && knownAccount());
  $('#form-lock-forgot').hidden = !can;
  $('#lock-forgot-none').hidden = can;
  if (can) $('#lock-forgot-email').value = knownAccount();
}

async function forgotSubmit(e) {
  e.preventDefault();
  const err = $('#lock-forgot-error');
  const known = knownAccount();
  const email = $('#lock-forgot-email').value.trim().toLowerCase();
  if (!known || email !== known) {
    err.textContent = 'That is not the account this device belongs to';
    return;
  }
  err.textContent = 'Checking…';
  try {
    await window.KindredSync.signIn(email, $('#lock-forgot-password').value);
    err.textContent = '';
    clearLock();
    unlock();
    toast('Lock removed — set a new PIN in settings');
  } catch (ex) {
    err.textContent = ex.message || 'Could not sign in';
  }
}

/* Wired on its own, before the rest of the app is awake, so a PIN typed
   in the first moments cannot fall through to a page navigation. */
function wireLock() {
  /* Cancel is what both Escape and the phone's back button arrive as.
     Refusing it is what makes this a lock rather than a curtain. */
  $('#lock').addEventListener('cancel', e => e.preventDefault());

  $('#form-lock').onsubmit = e => { e.preventDefault(); submitPin(); };
  $('#lock-pin').oninput = e => {
    e.target.value = e.target.value.replace(/\D/g, '');
    $('#lock-error').textContent = '';
    if (e.target.value.length === lockRecord()?.len) submitPin();
  };
  $('#lock-bio').onclick = () => tryBio();
  $('#lock-forgot').onclick = () => {
    const panel = $('#lock-forgot-panel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { paintForgot(); $('#lock-forgot-password').focus(); }
  };
  $('#form-lock-forgot').onsubmit = forgotSubmit;
}

/* ── setting it up ── */

let pinMode = 'set';   // set · change · off

function paintLockState() {
  const on = hasPin();
  const able = canLock();

  $('#lock-hint').textContent = !able
    ? 'A PIN needs Fellowship opened over https, or straight off the disk. This address cannot hash one safely, so it is not offered here.'
    : on
      ? 'On. Fellowship asks when it starts, and again when you come back after a couple of minutes away.'
      : 'Ask for a PIN before your circle is shown. It stays on this device — not in your account, and not in your backup.';

  $('#btn-pin').hidden = !able || on;
  $('#btn-pin-change').hidden = !able || !on;
  $('#btn-pin-off').hidden = !able || !on;

  const bioOn = !!bioCredential();
  $('#setting-bio').hidden = !(able && on && bioReady);
  $('#btn-bio').textContent = bioOn ? 'Turn off' : 'Turn on';
  $('#bio-hint').textContent = bioOn
    ? 'On. The lock screen offers it first, with the PIN waiting behind it.'
    : 'Use this device’s own fingerprint, face or Windows Hello instead of typing the PIN.';
}

function pinDialog(mode) {
  pinMode = mode;
  const need = hasPin();

  $('#dlg-pin-title').textContent =
    mode === 'off' ? 'Turn the lock off' : mode === 'change' ? 'Change your PIN' : 'Set a PIN';
  $('#pin-lede').textContent = mode === 'off'
    ? 'Enter it once more and Fellowship will stop asking. Any fingerprint you set up is forgotten with it.'
    : 'Four to eight digits, kept on this device alone. If you lose it, signing in to your Fellowship account is the way back.';

  $('#pin-current-wrap').hidden = !need;
  $('#pin-new-wrap').hidden = mode === 'off';
  $('#pin-confirm-wrap').hidden = mode === 'off';
  $('#btn-pin-save').textContent = mode === 'off' ? 'Turn it off' : 'Save';
  ['#pin-current', '#pin-new', '#pin-confirm'].forEach(s => { $(s).value = ''; });
  $('#pin-error').textContent = '';

  $('#dlg-pin').showModal();
  setTimeout(() => $(need ? '#pin-current' : '#pin-new').focus(), 60);
}

async function savePin(e) {
  e.preventDefault();
  const err = $('#pin-error');
  err.textContent = '';

  if (hasPin() && !(await pinMatches($('#pin-current').value))) {
    err.textContent = 'That is not your PIN';
    return;
  }

  if (pinMode === 'off') {
    clearLock();
    $('#dlg-pin').close();
    paintLockState();
    return toast('Lock turned off');
  }

  const pin = $('#pin-new').value;
  if (!/^\d+$/.test(pin) || pin.length < PIN_MIN || pin.length > PIN_MAX) {
    err.textContent = `Between ${PIN_MIN} and ${PIN_MAX} digits`;
    return;
  }
  if (pin !== $('#pin-confirm').value) {
    err.textContent = 'The two do not match';
    return;
  }

  await setPin(pin);
  $('#dlg-pin').close();
  paintLockState();
  toast(pinMode === 'change' ? 'PIN changed' : 'PIN set — Fellowship will ask next time it opens');
}

async function toggleBio() {
  if (bioCredential()) {
    Store.setPref('lockBio', '');
    paintLockState();
    return toast('Fingerprint unlock turned off');
  }
  try {
    await enrolBio();
    paintLockState();
    toast('Fingerprint unlock is on');
  } catch (ex) {
    toast(ex?.name === 'NotAllowedError'
      ? 'Nothing was registered, so nothing changed'
      : 'This device would not register a fingerprint');
  }
}

/* ─────────────────────────── views ─────────────────────────── */

/* Which view is on screen, so the single "+" in the nav can add the right
   kind of person without a second add button living in the future view. */
