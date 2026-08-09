/* uses: $ $$ el initialsOf · Store · people · photoFullUrl · toast */

let editingPersonId = null;
let pendingPhoto = undefined;    // undefined = untouched, null = cleared, {full,thumb} = new
let pendingOriginal = undefined; // the same three states, for the uncropped picture

/* A crop that has been cut but not yet saved has no record to be read out of,
   so it needs a URL of its own — and one that is let go of again, or every
   photo picked and then thought better of would leave its bytes behind for as
   long as the app was open. Held here rather than in photo-store.js because
   this is a picture of nobody yet: it belongs to a form, not to a person. */
let pendingPreviewUrl = '';

function showPending(blob) {
  if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
  pendingPreviewUrl = blob ? URL.createObjectURL(blob) : '';
  return pendingPreviewUrl;
}

/* The two always move together — the cropper sets both when a face is cut,
   and clearing the photo clears the picture it was cut from with it. */
function holdPhoto(cropped, original) {
  pendingPhoto = cropped;
  pendingOriginal = original;
}

/* Set when the dialog is opened to make your own profile, or to add a future
   connection, and read back by savePerson. Only meaningful while creating:
   editing reads the record. */
let makingSelf = false;
let makingFuture = false;

function personDialog(p, { self = false, future = false } = {}) {
  editingPersonId = p ? p.id : null;
  makingSelf = p ? !!p.isSelf : self;
  makingFuture = p ? !!p.isFuture : future;
  pendingPhoto = undefined;
  pendingOriginal = undefined;

  const mine = makingSelf, later = makingFuture;
  $('#dlg-person-title').textContent = mine ? (p ? 'Your details' : 'About you')
    : later ? (p ? 'Edit details' : 'Someone to meet')
    : (p ? 'Edit details' : 'Someone new');
  $('#f-name').value = p?.name || '';
  $('#f-relationship').value = p?.relationship || '';
  paintGroupPick(p?.groups || []);
  $('#f-birthday').value = p?.birthday || '';
  $('#f-contact').value = p?.contact || '';
  $('#f-occupation').value = p?.occupation || '';
  $('#f-cadence').value = String(p ? p.cadenceDays : 30);
  $('#btn-delete-person').hidden = !p;
  if (p) $('#btn-delete-person').textContent = mine ? 'Remove your profile' : later ? 'Remove this connection' : 'Remove this person';

  /* How you know them, which group they are in and how often to be reminded
     are all questions about somebody already in your circle. Asked of
     yourself they are nonsense; asked of someone you have only flagged to
     meet, they are premature — a birthday too, until you actually know them. */
  $('#f-relationship').closest('.field').hidden = mine || later;
  $('#f-groups').closest('.field').hidden = mine || later;
  $('#f-cadence').closest('.field').hidden = mine || later;
  $('#f-birthday').closest('.field').hidden = later;

  /* Only offered for someone new — editing is where you correct a name, not
     overwrite it from elsewhere. Never for yourself. */
  $('#contact-pick').hidden = mine || !!p || !canPickContacts();
  $('#photo-input').value = '';

  /* The crop and not the small copy: adjusting the focus re-cuts from
     whatever the preview is showing, and re-cutting the 256 would shrink the
     photo a little more every time somebody nudged it. */
  showPending(null);
  paintPhotoPreview(p ? photoFullUrl(p.id) : '', p?.name || '');
  $('#dlg-person').showModal();
  setTimeout(() => $('#f-name').focus(), 60);
}

function paintGroupPick(groups) {
  $$('#f-groups .chip').forEach(b => {
    const on = groups.includes(b.dataset.group);
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

const readGroupPick = () =>
  $$('#f-groups .chip').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.group);

function paintPhotoPreview(src, name) {
  const box = $('#photo-preview');
  box.textContent = '';
  if (src) {
    const img = el('img');
    img.src = src;
    img.alt = '';
    box.append(img);
  } else {
    box.append(el('span', null, initialsOf(name)));
  }
  $('#photo-clear').hidden = !src;
  $('#photo-adjust').hidden = !src;
}

/* ─────────────── filling someone in from a contact ──────────────
   Chrome on Android is the only browser that has a contact picker, and
   what it offers is narrower than it sounds: Android shows its own
   chooser, you tap who to share, and only those people come back. There
   is no reading the address book, which is the right shape here anyway —
   these are people you add on purpose, not a list to import. */

const canPickContacts = () => 'contacts' in navigator && 'ContactsManager' in window;

/* +27 82 445 1120 and 082 445 1120 are the same phone. Comparing the last
   nine digits gets that right without pretending to understand dialling
   codes, and an address in the contact field reduces to nothing rather
   than matching everyone else who left theirs blank. */
const telKey = s => (s || '').replace(/\D/g, '').slice(-9);

/* telKey compares two numbers. This one has to be able to ring one, which
   means keeping the country code telKey throws away on purpose — so they
   cannot be the same function. The field is labelled "phone or handle", and
   most of the work here is deciding that what is in it is not a number. */
const countryCode = () => (Store.getPref('countryCode', '27').replace(/\D/g, '') || '27');

function dialNumber(contact) {
  const raw = (contact || '').trim();
  if (!raw || raw.includes('@')) return '';       // an address, not a number
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return '';               // a handle, or too little to ring
  if (raw.startsWith('+')) return digits;         // already carries its country code
  if (digits.startsWith('0')) return countryCode() + digits.slice(1);
  return digits;
}

/* wa.me rather than whatsapp:// — WhatsApp claims it, so inside the Android
   app it opens the chat, and on a machine without WhatsApp it is still a page
   that works rather than a link that quietly does nothing. */
const waLink = n => `https://wa.me/${n}`;
const telLink = n => `tel:+${n}`;

function matchExisting(name, tel, list = people) {
  const key = telKey(tel);
  if (key.length >= 7) {
    const byTel = list.find(p => telKey(p.contact) === key);
    if (byTel) return { person: byTel, on: 'number' };
  }
  const n = name.trim().toLowerCase();
  const byName = n ? list.find(p => p.name.trim().toLowerCase() === n) : null;
  return byName ? { person: byName, on: 'name' } : null;
}

async function fillFromContact() {
  let picked;
  /* select() has to be the first thing the tap reaches — anything awaited
     before it spends the user gesture it needs. */
  try {
    [picked] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
  } catch {
    toast('Could not open your contacts');
    return;
  }
  if (!picked) return;   // closed the chooser without picking anyone

  const name = (picked.name || []).find(Boolean) || '';
  const tel = (picked.tel || []).find(Boolean) || '';
  const hit = matchExisting(name, tel);

  /* The same number is proof it is the same person, so open them instead of
     starting a second copy. A shared name is only a hint — say so, and leave
     the judgement where it belongs. */
  if (hit && hit.on === 'number') {
    $('#dlg-person').close();
    personDialog(hit.person);
    toast(`${hit.person.name.split(' ')[0]} is already in your circle`);
    return;
  }

  if (name) $('#f-name').value = name;
  if (tel) $('#f-contact').value = tel;
  if (hit) toast(`There is already a ${hit.person.name} in your circle`);
}

/* ─────────────────────────── the cropper ───────────────────────
   The stage is a square window onto the picture. The picture is sized so
   that at zoom 1 its shorter edge exactly fills the stage, then slid
   behind it. What the window frames is what renderCropBlobs() cuts out, so
   the circle in the dialog is not a preview of the badge — it is the badge.
   ──────────────────────────────────────────────────────────────── */

