/* uses: $ el initialsOf · Store
   · byId futures me notifyMutate people photos saveRoster
   · normalise · toast · openSheet · openOut
   · dialNumber matchExisting waLink · locked · renderAll
*/

const linkApi = () => window.KindredSync || null;
const signedIn = () => !!linkApi()?.Session?.signedIn;
const PENDING_JOIN = 'kindred:pendingJoin';

/* An invitation arrives as a fragment. Read once, taken out of the address
   bar immediately, and held in storage until there is somewhere to put it.
   history.state is passed straight back through: boot reads kindredLayer off
   it to put an open person back after a reload, and replacing it with an
   empty object would quietly break that. */
function takeLaunchFragment() {
  let token = '';
  try {
    token = new URLSearchParams(location.hash.slice(1)).get('join') || '';
  } catch { token = ''; }
  if (!token) return;
  try { localStorage.setItem(PENDING_JOIN, token); } catch { /* private mode */ }
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch {}
}

/* Tapping a link while the app is already open changes the fragment without
   reloading anything, so boot never runs again and the invitation would sit
   in the address bar unread. On a phone this is the ordinary case, not the
   odd one: the app is already in the task switcher when the message arrives. */
window.addEventListener('hashchange', () => {
  if (!location.hash.includes('join=')) return;
  takeLaunchFragment();
  if (!locked) offerPendingJoin();
});

const pendingJoin = () => { try { return localStorage.getItem(PENDING_JOIN) || ''; } catch { return ''; } };
const clearPendingJoin = () => { try { localStorage.removeItem(PENDING_JOIN); } catch {} };

/* ── sending one ─────────────────────────────────────────────── */

let invitingPersonId = null;

/* Which of your people each invitation was for. Local, because the server
   holds two account ids and a hash and should go on holding nothing else —
   who they are to you is the part worth keeping off it. */
const INVITED_FOR = 'kindred:invitedFor';
const invitedFor = () => { try { return JSON.parse(localStorage.getItem(INVITED_FOR) || '{}'); } catch { return {}; } };
function rememberInviteFor(inviteId, personId) {
  try {
    const m = invitedFor();
    m[inviteId] = personId;
    /* Trimmed so this cannot grow without bound on a long-used device. */
    const keys = Object.keys(m);
    if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(k => delete m[k]);
    localStorage.setItem(INVITED_FOR, JSON.stringify(m));
  } catch {}
}

async function inviteDialog(personId) {
  const p = byId(personId);
  const api = linkApi();
  if (!p || !api) return;

  if (!signedIn()) {
    toast('Sign in first — linking needs an account', { label: 'Sign in', run: () => api.openSignIn() });
    return;
  }

  invitingPersonId = personId;
  $('#invite-title').textContent = `Invite ${p.name.split(' ')[0]}`;
  paintInviteWho(p);
  $('#invite-error').textContent = '';
  $('#invite-link').textContent = 'Making a link…';
  $('#invite-link').dataset.url = '';
  paintInviteActions(null);
  $('#dlg-invite').showModal();

  try {
    /* Whatever is already written down about them rides along — name,
       number, birthday, occupation — so accepting this does not mean
       retyping what one of you already knows. It reaches the other side
       only once, at the moment they claim it (see claim_invite in
       share.sql), and only ever to start their own profile with. */
    const { id, url } = await api.createInvite(me?.name || '', me?.contact || '', {
      name: p.name, contact: p.contact, birthday: p.birthday, occupation: p.occupation,
    });
    /* Who this was meant for, kept here rather than sent. The server has no
       business knowing which of your people an invitation was for, and it
       does not need to: the only thing that ever asks is this device, when
       the invitation comes back claimed. */
    rememberInviteFor(id, personId);
    if (photos[p.id]) api.uploadInvitePhoto(id, photos[p.id]).catch(() => {});   // best-effort
    $('#invite-link').textContent = url;
    $('#invite-link').dataset.url = url;
    paintInviteActions(p);
  } catch (e) {
    $('#invite-link').textContent = '';
    $('#invite-link').dataset.url = '';
    $('#invite-error').textContent = e.message;
    paintInviteActions(null);
  }
}

/* Which ways out of this dialog are real, decided in one place because they
   answer each other: the share sheet is the big button where it exists, and
   where it does not — plain http, desktop Firefox — Copy has to become it,
   or the dialog is left with no obvious action at all. WhatsApp stays gated
   on there being a number to open it against; without one the link is still
   the link, it just goes by some other road.

   `p` is null while the link is still being made and after it has failed, so
   nothing is offered that would point at nothing. */
function paintInviteActions(p) {
  const ready = !!p && !!$('#invite-link').dataset.url;
  const canShare = ready && !!navigator.share;
  const dial = ready && dialNumber(p.contact);

  $('#btn-invite-share').hidden = !canShare;
  $('#btn-invite-share').disabled = !canShare;
  $('#btn-invite-wa').hidden = !dial;
  $('#btn-invite-wa').disabled = !dial;

  /* Without a share sheet, Copy is the only way out and has to look like it —
     wide and in the accent, standing where Share would have. Beside a share
     sheet it steps back down to the quiet second option it should be. */
  const copy = $('#btn-invite-copy');
  copy.disabled = !ready;
  copy.textContent = canShare ? 'Copy' : 'Copy link';
  copy.classList.toggle('btn-primary', ready && !canShare);
  copy.classList.toggle('btn-wide', ready && !canShare);
  copy.classList.toggle('btn-quiet', !ready || canShare);
}

/* The face this link is for, so the dialog reads as being about somebody
   rather than about a URL. */
function paintInviteWho(p) {
  const box = $('#invite-avatar');
  if (!box) return;
  box.textContent = '';
  if (photos[p.id]) {
    const img = el('img');
    img.src = photos[p.id];
    img.alt = '';
    box.append(img);
  } else {
    box.append(el('span', null, initialsOf(p.name)));
  }
}

/* What the invitation says when it goes out. Written once: WhatsApp puts it in
   the message box, the share sheet hands it to whatever they pick instead, and
   the two arriving worded differently would be the same invitation twice. */
const inviteWords = () =>
  `I keep track of the people I care about in an app called Fellowship. `
  + `This link connects the two of us — you choose what I see, and I choose what you see.`;

/* The share sheet, which is the ordinary way to send a link on a phone and
   reaches whatever they actually use. Needs a secure context, so it is simply
   absent on plain http and on desktop Firefox — inviteDialog checks for it and
   promotes Copy in its place, and this falls back to copying anyway. */
async function shareInviteLink() {
  const url = $('#invite-link').dataset.url;
  if (!url) return;
  if (!navigator.share) { copyInviteLink(); return; }
  try {
    await navigator.share({ title: 'Fellowship', text: inviteWords(), url });
  } catch (e) {
    /* Opening the sheet and thinking better of it is not a failure, and
       saying "could not share" at somebody who simply changed their mind is
       how an app teaches people to distrust it. */
    if (e?.name === 'AbortError') return;
    copyInviteLink();
  }
}

async function copyInviteLink() {
  const url = $('#invite-link').dataset.url;
  if (!url) return;
  try { await navigator.clipboard.writeText(url); toast('Link copied'); }
  catch { toast('Could not copy — the link is on screen to take by hand'); }
}

function sendInviteOnWhatsApp() {
  const p = byId(invitingPersonId);
  const url = $('#invite-link').dataset.url;
  const dial = p && dialNumber(p.contact);
  if (!url || !dial) return;
  openOut(`${waLink(dial)}?text=${encodeURIComponent(`${inviteWords()}\n\n${url}`)}`);
  $('#dlg-invite').close();
}

/* ── receiving one ───────────────────────────────────────────── */

let joining = null;   // { token, other, name, tel, choice }


/* Called once the app is up and the lock is passed — an invitation must not
   be claimable by somebody holding a locked phone. */
function offerPendingJoin() {
  const token = pendingJoin();
  const api = linkApi();
  if (!token || !api) return;

  if (!signedIn()) {
    /* The token keeps. Making an account leaves and comes back, and this is
       waiting when they return. */
    $('#join-title').textContent = 'Someone wants to link with you';
    $('#join-body').textContent = '';
    $('#join-body').append(el('p', 'quiet-note',
      'You need an account of your own first — it is what the two of you link between. Your people stay on this device either way.'));
    $('#join-error').textContent = '';
    $('#btn-join-yes').textContent = 'Make an account';
    $('#btn-join-no').textContent = 'Not now';
    joining = { token, needsAccount: true };
    $('#dlg-join').showModal();
    /* Upgraded with names once this answers — shown straight away rather
       than waited for, since offline or slow is not worth holding the ask
       back over, and a generic ask is still a true one. */
    api.previewInvite(token).then(info => {
      if (!info || joining?.token !== token) return;
      const from = (info.from_name || '').split(' ')[0];
      const who = (info.invitee_name || '').split(' ')[0];
      if (!from) return;
      $('#join-title').textContent = who ? `${from} invited ${who} to Fellowship` : `${from} wants to link with you`;
    }).catch(() => {});
    return;
  }
  claimAndAsk(token);
}

async function claimAndAsk(token) {
  const api = linkApi();
  $('#join-title').textContent = 'Someone wants to link with you';
  $('#join-body').textContent = 'Opening the link…';
  $('#join-error').textContent = '';
  $('#btn-join-yes').textContent = 'Accept';
  $('#btn-join-yes').disabled = true;
  if (!$('#dlg-join').open) $('#dlg-join').showModal();

  try {
    const claim = await api.claimInvite(token, me?.name || '', me?.contact || '');
    /* Claimed. The link exists from here whatever happens next — saying who
       they are is a separate question, and one you are allowed to defer. */
    clearPendingJoin();
    /* Nobody here yet: this is a brand new account, made from this very
       link, so there is no circle to ask "which of your people is this?"
       about — the one honest answer is "none of them yet". Fill both sides
       in directly instead of putting a one-choice picker in front of them. */
    if (!me) { await provisionFromInvite(claim); return; }
    joining = { token, other: claim.other, name: claim.name || '', tel: claim.tel || '' };
    /* A profile already exists here, but there is nobody in it yet to ask
       "which of your people is this?" about — the picker's only real answer
       would be its own last option. Skip straight to it rather than making
       the one honest choice look like a decision to make. Once there is
       somebody to possibly match against, the picker is a real question and
       stays. */
    const already = [...people, ...futures].filter(p => !p.linkedUid);
    if (!already.length) { joining.choice = '__new__'; await finishJoin(); return; }
    paintJoinPicker();
  } catch (e) {
    /* Only a link the server has actually refused is gone. Anything else is
       worth a second go — and the invitation stays in storage for it, so the
       next unlock or reload picks it up again even if they close this now. */
    $('#join-body').textContent = '';
    $('#join-error').textContent = e.message;
    $('#btn-join-no').textContent = 'Close';
    if (e.spent) {
      clearPendingJoin();
      $('#btn-join-yes').hidden = true;
      return;
    }
    $('#btn-join-yes').hidden = false;
    $('#btn-join-yes').disabled = false;
    $('#btn-join-yes').textContent = 'Try again';
    joining = { token, retry: true };
  }
}

/* First account, first link — nothing here yet for a pick-who-this-is
   picker to offer, since the circle is empty. Whoever invited you already
   told the app who you are, so that is put to use once, right here,
   instead of asked for again: your own profile starts filled with it, and
   they are already in your circle, linked. Never touches an existing
   profile — claimAndAsk only reaches this when `me` is still nothing. */
async function provisionFromInvite(claim) {
  const api = linkApi();

  me = normalise({
    isSelf: true,
    name: claim.invitee_name || 'You',
    contact: claim.invitee_contact || '',
    birthday: claim.invitee_birthday || '',
    occupation: claim.invitee_occupation || '',
  });

  if (claim.id) {
    try {
      const photo = await api?.downloadInvitePhoto(claim.id);
      if (photo) { photos[me.id] = photo; await Store.savePhoto(me.id, photo); }
    } catch {}
  }

  const inviter = normalise({ name: claim.name || 'Someone', contact: claim.tel || '', linkedUid: claim.other });
  people.push(inviter);

  await saveRoster();
  notifyMutate();
  $('#dlg-join').close();
  joining = null;
  renderAll();
  toast(`Linked with ${inviter.name.split(' ')[0]} — that's what they had for you below, fix anything that's off`);
  openSheet(me.id);
}

/* Which of your people this account belongs to. The number you already have
   for somebody is the hint, carried through the claim and compared here, on
   this device — a confident number match is picked for you; a name match is
   only a suggestion and says so. */
function paintJoinPicker() {
  const { name, tel } = joining;
  const first = (name || '').split(' ')[0];
  $('#join-title').textContent = name ? `${name} wants to link with you` : 'Someone wants to link with you';
  $('#btn-join-yes').disabled = false;
  $('#btn-join-yes').hidden = false;
  $('#btn-join-yes').textContent = 'Save';
  $('#btn-join-no').textContent = 'Later';

  const box = $('#join-body');
  box.textContent = '';
  box.append(el('p', 'join-q', `Which of your people is ${first || 'this'}?`));

  /* The best guess first. On the sending side that is whoever you actually
     clicked invite on; on the receiving side it's whichever of your people —
     circle or future connection — already carries this number. Only that
     number match is confident enough to pick for you; a name is offered as
     a hint rather than an answer, same as before. */
  const meant = joining.choice ? byId(joining.choice) : null;
  const hit = !meant ? matchExisting(name || '', tel || '', [...people, ...futures]) : null;
  if (hit?.on === 'number') { joining.choice = hit.person.id; joining.matchReason = 'number'; }
  const best = meant || hit?.person || null;
  const already = [...people, ...futures].filter(p => !p.linkedUid);
  const ordered = best ? [best, ...already.filter(p => p.id !== best.id)] : already;

  const list = el('div', 'join-pick');
  const choose = (id, label) => {
    const b = el('button', 'join-opt' + (joining.choice === id ? ' is-on' : ''));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(joining.choice === id));
    b.append(el('span', 'join-opt-name', label));
    if (joining.choice === id && joining.matchReason === 'number') b.append(el('span', 'join-opt-why', 'same number'));
    else if (meant && id === meant.id) b.append(el('span', 'join-opt-why', 'who you invited'));
    else if (hit && id === hit.person.id) b.append(el('span', 'join-opt-why', hit.on === 'number' ? 'same number' : 'same name — probably them'));
    b.onclick = () => { joining.choice = id; joining.matchReason = null; paintJoinPicker(); };
    return b;
  };

  ordered.slice(0, 12).forEach(p => list.append(choose(p.id, p.name)));
  list.append(choose('__new__', name ? `Add ${name} as someone new` : 'Add them as someone new'));
  box.append(list);
}

async function finishJoin() {
  const api = linkApi();

  if (joining?.needsAccount) {
    $('#dlg-join').close();
    api?.openSignIn('up');
    return;
  }
  /* Last go at it failed on something passing. The token was kept for exactly
     this, so ask the server again rather than making them find the message. */
  if (joining?.retry) { claimAndAsk(joining.token); return; }
  if (!joining?.other) { $('#dlg-join').close(); return; }

  const { other, name, tel, choice } = joining;
  if (!choice) { $('#join-error').textContent = 'Say who they are, or come back to it later.'; return; }

  let target;
  if (choice === '__new__') {
    target = normalise({ name: name || 'Someone', contact: tel || '', linkedUid: other });
    people.push(target);
  } else {
    target = byId(choice);
    if (!target) { $('#dlg-join').close(); return; }
    target.linkedUid = other;
  }

  await saveRoster();
  notifyMutate();
  $('#dlg-join').close();
  joining = null;
  renderAll();
  toast(`Linked with ${target.name.split(' ')[0]}`);
}

/* Ending it. The link goes on the server and the mark comes off the card;
   what you have written about them is yours and stays exactly as it was. */
async function unlinkPerson(personId) {
  const p = byId(personId);
  const api = linkApi();
  if (!p || !p.linkedUid) return;
  if (!confirm(`Unlink ${p.name}? Everything you have written about them stays. You will stop seeing anything they share, and they will stop seeing anything of yours.`)) return;

  const other = p.linkedUid;
  p.linkedUid = null;
  await saveRoster();
  notifyMutate();
  renderAll();
  try { await api?.unlink(other); } catch (e) { toast('Unlinked here — the server did not answer, it will catch up'); return; }
  toast(`Unlinked from ${p.name.split(' ')[0]}`);
}

/* Somebody took up an invitation you sent. There is no realtime channel and
   this app does not want one, so it is noticed on the next sync — and always
   asked rather than guessed, because you may have sent it from a device that
   is not this one. */
async function checkClaimedInvites() {
  const api = linkApi();
  if (!api || !signedIn()) return;
  try {
    const [invites, links] = await Promise.all([api.listInvites(), api.listLinks()]);
    const known = new Set(people.map(p => p.linkedUid).filter(Boolean));
    const mine = new Set(links.map(l => l.other));
    const fresh = invites.find(i => i.claimed_by && mine.has(i.claimed_by) && !known.has(i.claimed_by));
    if (!fresh) return;
    /* You chose who to send it to, so this device already knows the answer —
       offered as the choice rather than made silently, because the invitation
       may have gone out from your other device, or been passed on. */
    const meant = invitedFor()[fresh.id];
    joining = {
      other: fresh.claimed_by,
      name: fresh.claimed_name || '',
      choice: meant && byId(meant) && !byId(meant).linkedUid ? meant : undefined,
    };
    paintJoinPicker();
    $('#join-error').textContent = '';
    $('#dlg-join').showModal();
  } catch { /* linking not set up, or offline — neither is worth a word */ }
}

