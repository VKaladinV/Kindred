/* uses: KINDS MARITAL WALK WALK_LABELS · $ el monthYear prettyDate
   · byId · kidAge walkProgress
   · blockHead
   · kidOf maritalEnded maritalMarried removeKid removeTopic saveHousehold
     saveKid saveMark saveTopic toggleMark toggleTopic topicOf
*/

/* ── the discipleship page ──────────────────────────────────────
   The second half of somebody's page, drawn only for the people in the road
   group. Everything here is built out of the pieces the rest of the sheet
   already speaks in — .sheet-block, blockHead, .quiet-note, .tl-note — so it
   reads as more of their page rather than as a screen of its own.

   Returns the blocks rather than appending them, the way renderSheet already
   collects its four into `order` and appends them in one line. */

function walkBlocks(p) {
  return [pathBlock(p), householdBlock(p), kidsBlock(p),
    ...WALK.map(s => sectionBlock(p, s)), topicsBlock(p)].filter(Boolean);
}

/* ── the pathway ────────────────────────────────────────────────
   Abide, then belong, then contribute — read left to right, with how far
   along each one is. One line of orientation before the lists, not a
   dashboard: no percentages, no colour beyond the app's own green. */
function pathBlock(p) {
  const box = el('div', 'sheet-block walk-path-block');
  const path = el('div', 'walk-path');

  walkProgress(p).forEach((s, i) => {
    if (i) path.append(el('span', 'walk-arrow', '›'));
    const step = el('div', 'walk-step' + (s.done === s.total ? ' is-full' : ''));
    step.append(el('span', 'walk-step-name', s.title));
    step.append(el('span', 'walk-step-lede', s.lede));
    const bar = el('div', 'walk-bar');
    const fill = el('i');
    fill.style.setProperty('--fill', String(s.done / s.total));
    bar.append(fill);
    step.append(bar);
    step.append(el('span', 'walk-step-count', `${s.done} of ${s.total}`));
    path.append(step);
  });

  box.append(path);
  return box;
}

/* ── their household ────────────────────────────────────────────
   Once it says anything at all it moves out of here and up under their photo,
   as a line to be read rather than a form to be filled — see householdSummary
   below, which is where the pencil to change it lives too. So this block is
   only ever the way in: it exists while there is nothing to show, and returns
   nothing the moment there is. */
const householdFilled = p =>
  !!(p.maritalStatus || p.marriedOn || p.divorcedOn || p.joinedChurchOn);

function householdBlock(p) {
  if (householdFilled(p)) return null;
  const box = el('div', 'sheet-block');
  box.append(blockHead('Their household', () => householdDialog(p.id), 'Add their household'));
  box.append(el('p', 'quiet-note',
    'Nothing noted yet — whether they are married, and when they joined the church.'));
  return box;
}

/* The line under their photo. Month and year rather than the full date: which
   day a marriage began is not what a summary is for, and three exact dates in
   a row would read as a record card instead of a sentence about somebody.

   Their children are in it as names and ages alone. The block further down is
   where a child is added or changed; this is only the glance. */
function householdSummary(p) {
  if (!householdFilled(p) && !p.kids.length) return null;

  const box = el('div', 'person-household');
  const facts = el('div', 'household-facts');

  const label = (MARITAL.find(([v]) => v === p.maritalStatus) || [])[1];
  if (p.maritalStatus || p.marriedOn) {
    const f = el('span', 'fact');
    if (label) f.append(el('b', null, label));
    const when = [
      p.marriedOn ? `married ${monthYear(p.marriedOn)}` : '',
      p.divorcedOn ? `ended ${monthYear(p.divorcedOn)}` : '',
    ].filter(Boolean).join(', ');
    if (when) f.append(document.createTextNode(label ? ` · ${when}` : when));
    facts.append(f);
  }

  if (p.joinedChurchOn) {
    const f = el('span', 'fact');
    f.append(el('span', 'glyph', KINDS.faith.glyph), document.createTextNode('joined '));
    f.append(el('b', null, monthYear(p.joinedChurchOn)));
    facts.append(f);
  }

  if (p.kids.length) {
    const f = el('span', 'fact');
    p.kids.forEach((k, i) => {
      if (i) f.append(document.createTextNode(' · '));
      f.append(el('b', null, k.name));
      const age = kidAge(k);
      if (age) f.append(document.createTextNode(' ' + age));
    });
    facts.append(f);
  }
  box.append(facts);

  const pencil = el('button', 'icon-btn icon-btn-sm');
  pencil.type = 'button';
  pencil.setAttribute('aria-label', `Edit ${p.name.split(' ')[0]}’s household`);
  pencil.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5l4 4L7 21H3v-4L15.5 4.5z"/><path d="M13.5 6.5l4 4"/></svg>';
  pencil.onclick = () => householdDialog(p.id);
  box.append(pencil);

  return box;
}

/* ── their children ─────────────────────────────────────────────
   The age on the left the way a date sits on the left of a coming-up row, and
   for the same reason: it is the thing being scanned down the column. It is
   worked out from the birthday where there is one, so it is right every
   morning without anyone touching it. */
function kidsBlock(p) {
  const box = el('div', 'sheet-block');
  box.append(blockHead('Their children', () => kidDialog(p.id), 'Add a child'));

  if (!p.kids.length) {
    box.append(el('p', 'quiet-note', 'Nobody noted yet — names, ages, and where they go to school.'));
    return box;
  }

  p.kids.forEach(k => {
    const row = el('div', 'kid-row');
    const age = kidAge(k);
    const stamp = el('div', 'kid-age' + (age ? '' : ' is-blank'));
    stamp.append(el('span', 'n', age || '—'));
    if (age) stamp.append(el('span', 'm', age === '1' ? 'year' : 'years'));
    row.append(stamp);

    const body = el('div', 'kid-body');
    const h = el('h4', null, k.name || 'Unnamed');
    h.title = 'Edit this child';
    h.onclick = () => kidDialog(p.id, k.id);
    body.append(h);

    const bits = [k.school, k.birthday ? `born ${prettyDate(k.birthday)}` : ''].filter(Boolean);
    if (bits.length) body.append(el('div', 'kid-sub', bits.join(' · ')));
    row.append(body);
    box.append(row);
  });
  return box;
}

/* ── one stretch of the road ────────────────────────────────────
   Abide carries two sub-headings and the other two carry none, which falls out
   of the constant rather than being decided here — a part with no title simply
   contributes no heading. */
function sectionBlock(p, s) {
  const box = el('div', 'sheet-block');
  const done = s.parts.flatMap(part => part.items)
    .filter(([k]) => p.discipleship.marks[`${s.key}.${k}`]?.done).length;
  const total = s.parts.reduce((n, part) => n + part.items.length, 0);

  const head = blockHead(s.title);
  head.append(el('span', 'walk-count', `${done} of ${total}`));
  box.append(head);
  box.append(el('p', 'walk-lede-line', s.lede));

  s.parts.forEach(part => {
    if (part.title) box.append(el('h4', 'walk-part', part.title));
    part.items.forEach(([k, label]) => {
      const key = `${s.key}.${k}`;
      const m = p.discipleship.marks[key];
      box.append(walkRow({
        done: !!m?.done, label, date: m?.date, note: m?.note,
        onTick: () => toggleMark(p.id, key),
        onOpen: () => walkItemDialog(p.id, { key }),
      }));
    });
  });
  return box;
}

/* ── topics you named yourself ──────────────────────────────────
   The same row, for the things the pathway has no line for — a besetting
   habit, a relationship being repaired, a question they keep coming back to. */
function topicsBlock(p) {
  const box = el('div', 'sheet-block');
  box.append(blockHead('Topics', () => walkItemDialog(p.id), 'Add a topic'));

  const topics = p.discipleship.topics;
  if (!topics.length) {
    box.append(el('p', 'quiet-note', 'Nothing of your own yet — anything you are working through together.'));
    return box;
  }

  topics.forEach(t => box.append(walkRow({
    done: t.done, label: t.title, date: t.date, note: t.note,
    onTick: () => toggleTopic(p.id, t.id),
    onOpen: () => walkItemDialog(p.id, { topicId: t.id }),
  })));
  return box;
}

/* The tick and the label do different things on purpose. The box is the
   quick answer — yes, that is true of them now — and the wording opens the
   date and the note behind it, because reaching for a checkbox should never
   cost a dialog. */
function walkRow({ done, label, date, note, onTick, onOpen }) {
  const row = el('div', 'walk-item' + (done ? ' is-done' : ''));

  const tick = el('button', 'walk-tick');
  tick.type = 'button';
  tick.setAttribute('aria-pressed', String(done));
  tick.setAttribute('aria-label', label);
  tick.onclick = onTick;
  row.append(tick);

  const body = el('div', 'walk-item-body');
  const name = el('button', 'walk-label', label);
  name.type = 'button';
  name.title = 'When it happened, and anything to remember';
  name.onclick = onOpen;
  body.append(name);

  if (date) body.append(el('div', 'walk-when', prettyDate(date)));
  if (note) body.append(el('p', 'tl-note', note));
  row.append(body);
  return row;
}

/* ─────────────────────────── the three dialogs ───────────────── */

let editingHousehold = null;

/* The status list is filled here rather than in fillSelects, which builds the
   selects that exist for the whole life of the app. This one has to agree with
   MARITAL and nothing else ever changes it, so building it beside the code
   that reads it back keeps the two in one place. */
function householdDialog(personId) {
  const p = byId(personId);
  if (!p) return;
  editingHousehold = personId;

  const sel = $('#h-marital');
  if (!sel.options.length) MARITAL.forEach(([v, label]) => sel.append(new Option(label, v)));
  sel.value = p.maritalStatus;
  $('#h-married').value = p.marriedOn || '';
  $('#h-ended').value = p.divorcedOn || '';
  $('#h-church').value = p.joinedChurchOn || '';
  paintMaritalEnd();

  $('#dlg-household').showModal();
  setTimeout(() => sel.focus(), 60);
}

/* Which dates the chosen status leaves worth asking for. Watched rather than
   read once, because the answer changes while the dialog is open — choosing
   "divorced" is exactly the moment an ending becomes a date to fill in, and
   choosing "single" is the moment a wedding stops being one. */
const paintMaritalEnd = () => {
  const status = $('#h-marital').value;
  $('#wrap-h-married').hidden = !maritalMarried(status);
  $('#wrap-h-ended').hidden = !maritalEnded(status);
};

function saveHouseholdForm(e) {
  e.preventDefault();
  const status = $('#h-marital').value;
  saveHousehold(editingHousehold, {
    maritalStatus: status,
    /* A status the date makes no sense against clears it, rather than merely
       hiding it. What is stored is then what the page says — a wedding date
       sitting invisibly under "Single" would sync, ride every backup, and
       surface again the day the status changed. */
    marriedOn: maritalMarried(status) ? $('#h-married').value : '',
    divorcedOn: maritalEnded(status) ? $('#h-ended').value : '',
    joinedChurchOn: $('#h-church').value,
  });
  $('#dlg-household').close();
}

let editingKid = null;

function kidDialog(personId, kidId = null) {
  const p = byId(personId);
  if (!p) return;
  const k = kidId ? kidOf(p, kidId) : null;
  editingKid = { personId, kidId };

  $('#dlg-kid-title').textContent = k ? 'This child' : 'A child';
  $('#k-name').value = k?.name || '';
  $('#k-birthday').value = k?.birthday || '';
  $('#k-age').value = k?.age || '';
  $('#k-school').value = k?.school || '';
  $('#btn-kid-delete').hidden = !k;
  $('#dlg-kid').showModal();
  setTimeout(() => $('#k-name').focus(), 60);
}

function saveKidForm(e) {
  e.preventDefault();
  const name = $('#k-name').value.trim();
  if (!name) return;
  saveKid(editingKid.personId, editingKid.kidId, {
    name,
    birthday: $('#k-birthday').value,
    age: $('#k-age').value,
    school: $('#k-school').value.trim(),
  });
  $('#dlg-kid').close();
}

let editingWalkItem = null;

/* Called three ways: with a key, for one of the fixed items; with a topicId,
   to edit one of your own; and with neither, to make a new one. */
function walkItemDialog(personId, { key = '', topicId = null } = {}) {
  const p = byId(personId);
  if (!p) return;
  const topic = topicId ? topicOf(p, topicId) : null;
  const own = !key;
  editingWalkItem = { personId, key, topicId };

  $('#dlg-walk-title').textContent = own ? (topic ? 'This topic' : 'Add a topic') : 'Note this down';

  /* Which item this is, for the fixed ones — the wording is already decided,
     so it is said here rather than offered as something to type over. */
  const lede = $('#walk-lede');
  lede.hidden = own;
  lede.textContent = own ? '' : (WALK_LABELS[key] || '');

  $('#wrap-walk-title').hidden = !own;
  $('#w-title').value = topic?.title || '';
  /* Set rather than written into the markup: a hidden field that is still
     required blocks the form from submitting, and the browser cannot show the
     complaint against something nobody can see. */
  $('#w-title').required = own;

  const m = own ? topic : p.discipleship.marks[key];
  $('#w-date').value = m?.date || '';
  $('#w-note').value = m?.note || '';
  $('#btn-walk-delete').hidden = !topic;

  $('#dlg-walk-item').showModal();
  setTimeout(() => (own ? $('#w-title') : $('#w-note')).focus(), 60);
}

function saveWalkItem(e) {
  e.preventDefault();
  const { personId, key, topicId } = editingWalkItem;
  const date = $('#w-date').value;
  const note = $('#w-note').value.trim();

  if (key) {
    saveMark(personId, key, { date, note });
  } else {
    const title = $('#w-title').value.trim();
    if (!title) return;
    saveTopic(personId, topicId, { title, date, note });
  }
  $('#dlg-walk-item').close();
}
