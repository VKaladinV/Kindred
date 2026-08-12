/* uses: KINDS MARITAL STAGES WALK WALK_LABELS · $ $$ el monthYear prettyDate
   · byId · kidAge marriageYears
   · blockHead
   · kidOf maritalEnded maritalMarried saveHousehold saveKid saveMark
     saveTopic startDiscipleship toggleMark toggleStage toggleTopic topicOf
   · sheetTab
*/

/* ── the discipleship page ──────────────────────────────────────
   The second half of somebody's page, drawn only for the people in the road
   group. Everything here is built out of the pieces the rest of the sheet
   already speaks in — .sheet-block, blockHead, .quiet-note, .tl-note — so it
   reads as more of their page rather than as a screen of its own.

   Returns the blocks rather than appending them, the way renderSheet already
   collects its four into `order` and appends them in one line. There is no
   household or children block here any more — that entered through the
   intro pop-up (discipleIntroDialog, below) or is edited through the pencil
   on householdSummary, in js/sheet.js. Asking for it twice, once in the pop-up
   and again as a block waiting to be filled in, was the thing worth removing. */

function walkBlocks(p) {
  return [stagesBlock(p), ...WALK.map(s => sectionBlock(p, s)), topicsBlock(p)];
}

/* ── the four words above the checklist ──────────────────────────
   Abide, Belong, Contribute, and This is Church. Nothing here is computed
   from the ticks below — a click colours a word, another click greys it
   again, and that is the whole of it. This is Church carries its own small
   kicker reading its own state back — "not completed" until you say
   otherwise, "completed" the moment you do — since it is the one word among
   the four that names an arrival rather than a place on the road. The moment
   all four are lit, a line appears saying they need to be invited for
   membership; nothing is stored for that line, so unlighting any one word
   takes it away again. */
function stagesBlock(p) {
  const box = el('div', 'sheet-block walk-stages-block');
  const row = el('div', 'walk-stages');
  STAGES.forEach(([key, label]) => {
    const on = !!p.discipleship.stages[key];
    const item = el('div', 'walk-stage-item');
    if (key === 'church') item.append(el('span', 'walk-stage-kicker', on ? 'completed' : 'not completed'));
    const b = el('button', 'walk-stage' + (on ? ' is-on' : ''), label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(on));
    b.onclick = () => toggleStage(p.id, key);
    item.append(b);
    row.append(item);
  });
  box.append(row);

  if (STAGES.every(([key]) => p.discipleship.stages[key])) {
    box.append(el('p', 'walk-invite-note', 'Needs to be invited for membership.'));
  }
  return box;
}

/* Whether there is anything of theirs worth reading in the summary line
   under their photo. */
const householdFilled = p =>
  !!(p.maritalStatus || p.marriedOn || p.marriedYears || p.joinedChurchOn);

/* The line under their photo. Month and year rather than the full date: which
   day a marriage began is not what a summary is for, and three exact dates in
   a row would read as a record card instead of a sentence about somebody.

   Always renders once somebody is discipled — before this used to disappear
   entirely while nothing had been said, but the pencil is now the only door
   in (the intro pop-up is the other, and that only ever runs once), so it has
   to stay reachable even when there is nothing yet to read. */
function householdSummary(p) {
  const box = el('div', 'person-household');
  const facts = el('div', 'household-facts');

  if (!householdFilled(p) && !p.kids.length) {
    facts.append(el('span', 'fact is-blank', 'Add their household — married, children, when they joined.'));
  } else {
    const label = (MARITAL.find(([v]) => v === p.maritalStatus) || [])[1];
    if (p.maritalStatus || p.marriedOn || p.marriedYears) {
      const f = el('span', 'fact');
      if (label) f.append(el('b', null, label));
      const years = marriageYears(p);
      const married = p.marriedOn ? `married ${monthYear(p.marriedOn)}`
        : years ? `married ${years} ${years === '1' ? 'year' : 'years'}` : '';
      const when = [married, p.divorcedOn ? `ended ${monthYear(p.divorcedOn)}` : ''].filter(Boolean).join(', ');
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

/* ── one section of the checklist ─────────────────────────────────
   Four of these now, each flat — no more sub-headings within a section, since
   the two that used to share one now have a heading of their own. */
function sectionBlock(p, s) {
  const box = el('div', 'sheet-block');
  const done = s.items.filter(([k]) => p.discipleship.marks[`${s.ns}.${k}`]?.done).length;

  const head = blockHead(s.title);
  head.append(el('span', 'walk-count', `${done} of ${s.items.length}`));
  box.append(head);

  s.items.forEach(([k, label]) => {
    const key = `${s.ns}.${k}`;
    const m = p.discipleship.marks[key];
    box.append(walkRow({
      done: !!m?.done, label, date: m?.date, note: m?.note,
      onTick: () => toggleMark(p.id, key),
      onOpen: () => walkItemDialog(p.id, { key }),
    }));
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

/* ─────────────────────────── the dialogs ──────────────────────── */

/* ── starting to walk with somebody ──────────────────────────────
   What Disciple actually opens, before anything else happens. Three
   questions, each answerable or not — the moment usually is when you already
   know the answers, so asking here saves finding this same ground again a
   week later through the pencil. Leaving all three blank still starts the
   road; nothing here is a gate on that. */
let editingDiscipleIntro = null;

function discipleIntroDialog(personId) {
  const p = byId(personId);
  if (!p) return;
  editingDiscipleIntro = personId;

  $('#disciple-intro-title').textContent = `Walking a road with ${p.name.split(' ')[0]}`;
  paintYesNo($('#di-jesus'), '');
  paintYesNo($('#di-married'), '');
  paintYesNo($('#di-kids'), '');
  $('#wrap-di-jesus-years').hidden = true;
  $('#di-jesus-years').value = '';
  $('#wrap-di-years').hidden = true;
  $('#di-years').value = '';
  $('#wrap-di-kids-rows').hidden = true;
  $('#di-kids-rows').textContent = '';

  $('#dlg-disciple-intro').showModal();
}

/* A plain two-way toggle, built on the same aria-pressed/.is-on pattern the
   group chips in js/person-dialog.js already use — clicking the one already
   on takes it back to unanswered rather than refusing to move, since every
   question here is allowed to stay open. */
function yesNoGroup(container, onChange) {
  $$('button', container).forEach(b => {
    b.onclick = () => {
      const already = b.classList.contains('is-on');
      $$('button', container).forEach(x => { x.classList.remove('is-on'); x.setAttribute('aria-pressed', 'false'); });
      if (!already) { b.classList.add('is-on'); b.setAttribute('aria-pressed', 'true'); }
      if (onChange) onChange(yesNoValue(container));
    };
  });
}

const yesNoValue = container => container.querySelector('.is-on')?.dataset.value || '';

const paintYesNo = (container, value) => {
  $$('button', container).forEach(b => {
    const on = b.dataset.value === value;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
};

/* One row of the repeatable children list inside the intro pop-up. Built and
   read back with plain DOM calls rather than reaching for kidDialog — that
   dialog stacking three deep over the sheet, one child at a time, would have
   made naming a second child cost more taps than it was worth in the one
   moment this app already knows to keep light: adding somebody new. */
function discipleKidRow() {
  const row = el('div', 'di-kid-row');
  const name = el('input', 'di-kid-name');
  name.type = 'text'; name.placeholder = 'Name'; name.maxLength = 60; name.autocomplete = 'off';
  const bday = el('input', 'di-kid-birthday');
  bday.type = 'date'; bday.setAttribute('aria-label', 'Birthday');
  const age = el('input', 'di-kid-age');
  age.type = 'text'; age.inputMode = 'numeric'; age.maxLength = 2; age.placeholder = 'age';
  age.setAttribute('aria-label', 'Age');
  bday.onchange = () => { if (bday.value) age.value = ''; };
  const remove = el('button', 'link-btn di-kid-remove', 'remove');
  remove.type = 'button';
  remove.onclick = () => row.remove();
  row.append(name, bday, age, remove);
  return row;
}

const addDiscipleKidRow = () => $('#di-kids-rows').append(discipleKidRow());

function saveDiscipleIntro(e) {
  e.preventDefault();
  const acceptedJesus = yesNoValue($('#di-jesus')) === 'yes';
  const acceptedJesusYears = acceptedJesus ? $('#di-jesus-years').value.trim() : '';
  const married = yesNoValue($('#di-married')) === 'yes';
  const marriedYears = married ? $('#di-years').value.trim() : '';
  const wantsKids = yesNoValue($('#di-kids')) === 'yes';
  const kids = wantsKids ? $$('.di-kid-row', $('#di-kids-rows')).map(row => ({
    name: $('.di-kid-name', row).value.trim(),
    birthday: $('.di-kid-birthday', row).value,
    age: $('.di-kid-age', row).value,
  })).filter(k => k.name) : [];

  /* Set before startDiscipleship rather than after, so the render it already
     does lands on the Walk tab in one pass instead of two. */
  sheetTab = 'walk';
  startDiscipleship(editingDiscipleIntro, { acceptedJesus, acceptedJesusYears, married, marriedYears, kids });
  $('#dlg-disciple-intro').close();
}

/* ── their household ────────────────────────────────────────────
   The status list is filled here rather than in fillSelects, which builds the
   selects that exist for the whole life of the app. This one has to agree with
   MARITAL and nothing else ever changes it, so building it beside the code
   that reads it back keeps the two in one place.

   Their children live here too now — a compact list, each name opening the
   ordinary kidDialog on top of this one. Dialog over dialog is already a
   proven shape in this app (the crop dialog opens over the person dialog the
   same way), so nothing new was needed to let this one do it as well. */
let editingHousehold = null;

function householdDialog(personId) {
  const p = byId(personId);
  if (!p) return;
  editingHousehold = personId;

  const sel = $('#h-marital');
  if (!sel.options.length) MARITAL.forEach(([v, label]) => sel.append(new Option(label, v)));
  sel.value = p.maritalStatus;
  $('#h-married').value = p.marriedOn || '';
  $('#h-married-years').value = p.marriedOn ? '' : (p.marriedYears || '');
  $('#h-ended').value = p.divorcedOn || '';
  $('#h-church').value = p.joinedChurchOn || '';
  paintMaritalEnd();
  renderHouseholdKids(p);

  $('#dlg-household').showModal();
  setTimeout(() => sel.focus(), 60);
}

function renderHouseholdKids(p) {
  const box = $('#h-kids-list');
  box.textContent = '';
  if (!p.kids.length) {
    box.append(el('p', 'quiet-note', 'Nobody noted yet.'));
    return;
  }
  p.kids.forEach(k => {
    const row = el('div', 'h-kid-row');
    const btn = el('button', 'link-btn', k.name || 'Unnamed');
    btn.type = 'button';
    btn.onclick = () => kidDialog(p.id, k.id);
    row.append(btn);
    const age = kidAge(k);
    if (age) row.append(el('span', 'h-kid-age', ' · ' + (age === '1' ? '1 year' : age + ' years')));
    box.append(row);
  });
}

/* kidDialog closing is the one moment this list can have gone stale — it
   opens on top of this dialog rather than replacing it, so nothing else here
   ever repaints while it's up. Called from the observer wire() sets up on
   #dlg-kid's own open attribute. */
function refreshHouseholdKids() {
  const p = editingHousehold && byId(editingHousehold);
  if (p && $('#dlg-household').open) renderHouseholdKids(p);
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
  const marriedOn = maritalMarried(status) ? $('#h-married').value : '';
  saveHousehold(editingHousehold, {
    maritalStatus: status,
    marriedOn,
    /* A status the date makes no sense against clears it, rather than merely
       hiding it — and a since-date, once given, is what wins over a typed
       count of years, the same precedence a child's birthday holds over a
       typed age. What is stored is then always what the page says. */
    marriedYears: maritalMarried(status) && !marriedOn ? $('#h-married-years').value.trim() : '',
    divorcedOn: maritalEnded(status) ? $('#h-ended').value : '',
    joinedChurchOn: $('#h-church').value,
  });
  $('#dlg-household').close();
}

/* ── a child ───────────────────────────────────────────────────── */

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

/* ── one step on the road ─────────────────────────────────────────
   Called three ways: with a key, for one of the fixed items; with a topicId,
   to edit one of your own; and with neither, to make a new one. */
let editingWalkItem = null;

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
