/* uses: $ $$ el prettyDate · Session signOut
   · approved forgetMembership isAdmin listCodes listMembers loadMembership
     makeCode membership onMembership redeemCode revokeCode setMemberStatus
   · paintStatus · sync
*/

/* ══════════════════════ the two ends of the gate ══════════════════════
   The screen somebody sees while they are waiting, and the menu you decide
   from. Both live in the sync layer rather than in the app, because both
   are about an account — remove js/sync/ from index.html and Fellowship is
   a local notebook again, with nothing to be let into and nothing here to
   miss.

   Neither of these is the gate. supabase/members.sql is. */

/* A code that arrived in a link and has nowhere to go yet — there is no
   session to redeem it with until an account has been made, and with email
   confirmation switched on that means leaving the app and coming back. The
   same shape PENDING_JOIN takes in js/invite.js, for the same reason. */
const PENDING_CODE = 'kindred:pendingCode';
const pendingCode = () => { try { return localStorage.getItem(PENDING_CODE) || ''; } catch { return ''; } };
const holdCode = c => { try { localStorage.setItem(PENDING_CODE, c); } catch {} };
const dropCode = () => { try { localStorage.removeItem(PENDING_CODE); } catch {} };

/* ─────────────────────────── the waiting screen ─────────────────────────── */

/* Signed out, this never shows. Fellowship with no account is not a lesser
   Fellowship waiting for permission — it is what the app is, and it keeps
   every person, every prayer and every photo on the device. What an
   unapproved account cannot do is reach the server, and saying that plainly
   is all this screen is for. */
function paintGate() {
  const dlg = $('#gate');
  if (!dlg) return;
  /* The PIN lock is the outermost thing there is, and it must stay that way:
     two modal dialogs are a stack, and whichever opened last is the one on
     top. unlock() calls back here (js/lock.js) the moment it is safe. */
  if (typeof locked !== 'undefined' && locked) return;
  const m = membership();
  const shut = Session.signedIn && !approved();

  if (!shut) {
    if (dlg.open) dlg.close();
    return;
  }

  const blocked = m?.status === 'blocked';
  $('#gate-sub').textContent = blocked
    ? 'This account is no longer able to sync.'
    : 'This account is waiting to be let in.';
  $('#gate-hint').textContent = blocked
    ? 'Everything on this device is still here and still yours. Ask whoever looks after Fellowship if this was meant to happen.'
    : 'If you were sent a code, put it in here.';
  $('#gate-code').hidden = blocked;
  $('#gate-submit').hidden = blocked;
  $('#gate-who').textContent = m?.email || Session.user?.email || '';

  if (!dlg.open) {
    $('#gate-error').textContent = '';
    dlg.showModal();
    if (!blocked) setTimeout(() => $('#gate-code').focus(), 60);
  }
}

async function submitGateCode(e) {
  e.preventDefault();
  const btn = $('#gate-submit');
  const err = $('#gate-error');
  const code = $('#gate-code').value.trim();
  if (!code) return;
  btn.disabled = true;
  err.textContent = '';
  try {
    await redeemCode(code);
    dropCode();
    $('#gate-code').value = '';
    $('#gate').close();
    paintStatus();
    Kindred.toast('You are in — syncing your circle');
    await sync({ manual: true });
  } catch (ex) {
    err.textContent = ex.message;
    $('#gate-code').select();
  } finally {
    btn.disabled = false;
  }
}

/* A code that came in on a link, spent the moment there is a session to
   spend it with. Silent when it fails: the screen is already up and saying
   what to do, and an error about a code nobody typed is noise. */
async function redeemPendingCode() {
  const code = pendingCode();
  if (!code || !Session.signedIn) return;
  try {
    await redeemCode(code);
    dropCode();
    paintStatus();
    Kindred.toast('You are in — syncing your circle');
    await sync({ manual: true });
  } catch {
    /* Kept rather than dropped — it may simply be that this account is not
       confirmed yet, and the same link will work on the next attempt. */
  }
}

/* Everything that has to happen when the answer might have changed: after a
   sign-in, after a sign-out, at boot. */
async function refreshMembership() {
  await loadMembership();
  await redeemPendingCode();
  paintGate();
  paintAdminSetting();
  paintStatus();
}

/* ─────────────────────────── the admin menu ─────────────────────────── */

function paintAdminSetting() {
  const box = $('#setting-admin');
  if (!box) return;
  box.hidden = !(Session.signedIn && isAdmin());
}

async function openAdmin() {
  $('#admin-label').value = '';
  $('#admin-make-error').textContent = '';
  $('#admin-new').hidden = true;
  $('#admin-codes').textContent = 'Loading…';
  $('#admin-people').textContent = '';
  $('#dlg-admin').showModal();
  await paintAdmin();
}

async function paintAdmin() {
  const [codes, people] = await Promise.all([listCodes(), listMembers()]);

  /* Neither list could be asked for — offline, or a session that has gone
     stale while this dialog sat open. Said once, rather than twice as two
     empty lists that would read as nobody being here. */
  if (!codes || !people) {
    $('#admin-codes').textContent = '';
    $('#admin-codes').append(el('p', 'quiet-note', 'Could not reach the server just now.'));
    $('#admin-people').textContent = '';
    return;
  }

  /* Only the ones still worth anything. A code that has been used is not a
     loose end — the person who used it is in the list below, which is the
     better place to look at them. */
  const live = codes.filter(c => !c.claimed_by && !c.revoked_at && new Date(c.expires_at) > new Date());
  const codeBox = $('#admin-codes');
  codeBox.textContent = '';
  if (!live.length) {
    codeBox.append(el('p', 'quiet-note', 'None outstanding.'));
  } else {
    live.forEach(c => {
      const row = el('div', 'admin-row');
      const who = el('div', 'admin-who');
      who.append(el('strong', null, c.label || 'No name on it'));
      who.append(el('small', null, `expires ${prettyDate(c.expires_at.slice(0, 10))}`));
      row.append(who);
      const kill = el('button', 'link-btn', 'revoke');
      kill.type = 'button';
      kill.onclick = async () => {
        kill.disabled = true;
        await revokeCode(c.token_hash);
        await paintAdmin();
      };
      row.append(kill);
      codeBox.append(row);
    });
  }

  const meId = Session.user?.id;
  const box = $('#admin-people');
  box.textContent = '';
  people.forEach(p => {
    const row = el('div', 'admin-row');
    const who = el('div', 'admin-who');
    who.append(el('strong', null, p.name || p.email || 'Somebody'));
    /* Only your own row says admin. Who else decides is not a column on
       these rows — it lives in a table no client can read at all (see
       public.admins in members.sql) — and with one person deciding there is
       nothing here that saying so would answer. */
    const words = p.user_id === meId ? 'you · admin'
      : p.status === 'approved' ? 'in'
      : p.status === 'blocked' ? 'blocked'
      : 'waiting — never used a code';
    who.append(el('small', null, [p.name && p.email, words].filter(Boolean).join(' · ')));
    row.append(who);

    /* Your own row carries no buttons, and members.sql refuses them too.
       Locking yourself out of your own Supabase would leave the SQL editor
       as the only way back in. */
    if (p.user_id !== meId) {
      const act = el('button', 'link-btn', p.status === 'approved' ? 'block' : 'let in');
      act.type = 'button';
      act.onclick = async () => {
        act.disabled = true;
        try {
          await setMemberStatus(p.user_id, p.status === 'approved' ? 'blocked' : 'approved');
          await paintAdmin();
        } catch (ex) {
          act.disabled = false;
          Kindred.toast(ex.message);
        }
      };
      row.append(act);
    }
    box.append(row);
  });
}

async function newCode() {
  const btn = $('#admin-make');
  const err = $('#admin-make-error');
  btn.disabled = true;
  err.textContent = '';
  try {
    const made = await makeCode($('#admin-label').value.trim());
    $('#admin-link').textContent = made.url;
    $('#admin-link').dataset.url = made.url;
    $('#admin-new').hidden = false;
    $('#admin-label').value = '';
    await paintAdmin();
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
  }
}

async function copyCodeLink() {
  const url = $('#admin-link').dataset.url;
  if (!url) return;
  try { await navigator.clipboard.writeText(url); Kindred.toast('Link copied'); }
  catch { Kindred.toast('Could not copy — the link is on screen to take by hand'); }
}

async function shareCodeLink() {
  const url = $('#admin-link').dataset.url;
  if (!url) return;
  if (!navigator.share) { copyCodeLink(); return; }
  try {
    await navigator.share({ title: 'Fellowship', text: 'This is the way in to Fellowship — it only works once.', url });
  } catch (e) {
    if (e?.name === 'AbortError') return;
    copyCodeLink();
  }
}

/* ─────────────────────────── wiring ─────────────────────────── */

function wireGate() {
  if (!$('#gate')) return;

  $('#form-gate').onsubmit = submitGateCode;
  $('#gate-out').onclick = () => {
    signOut();
    forgetMembership();
    $('#gate').close();
    paintStatus();
    paintAdminSetting();
    Kindred.toast('Signed out — everything here stays on this device');
  };
  $('#admin-link').onclick = copyCodeLink;

  $('#btn-admin').onclick = openAdmin;
  $('#admin-make').onclick = newCode;
  $('#admin-copy').onclick = copyCodeLink;
  $('#admin-share').onclick = shareCodeLink;
  $('#admin-close').onclick = () => $('#dlg-admin').close();

  onMembership(() => { paintAdminSetting(); });
}

/* A code can arrive as a link the same way an invitation does, and is taken
   out of the address bar for the same reason: a secret is not something to
   leave sitting in browser history. Read at boot, before anything asks
   whether this account is in. */
function takeCodeFragment() {
  let code = '';
  try { code = new URLSearchParams(location.hash.slice(1)).get('code') || ''; } catch { code = ''; }
  if (!code) return;
  holdCode(code);
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch {}
}
