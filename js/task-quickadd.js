/* uses: TYPES · el today uid ymd · byId ensureSelf queueSave · normaliseRecord · renderAll
   · $ WEEKDAYS MONTHS_AHEAD monthStart monthEnd monthKey monthLabel
*/

/* Type it, tap Add — the one thing every to-do actually needs, without the
   dialog that everything else on a person's page goes through. A profile
   already knows who the row is for, so personId is passed and it goes
   straight on their page; Today and an open calendar day know nobody, and
   stay that way — a to-do added from either always lands on your own list
   (ensureSelf, js/state.js), the same as before there was ever a "who" field
   to ask with. Pointing one at somebody else is a profile-page action, and
   only that: a to-do is an ordinary dated record on person.events, so one
   added there is already showing up on Today and the calendar through the
   same datesAhead/datesIn machinery everything else does — nothing extra to
   wire up for that half of it.

   date is a preset rather than something typed here, and it changes what the
   row offers: the calendar hands in the day you were looking at, so there is
   nothing left to ask and a single Add button is the whole control. A
   profile and Today hand in nothing, because neither has a day already in
   mind, and get two ways to say one instead — "Add for today" for the
   common case, and a small calendar button beside it that opens
   openQuickDate (below) for anything else. */
function taskQuickAdd({ personId = null, date = '' } = {}) {
  const row = el('div', 'todo-add');

  const input = el('input', 'todo-add-input');
  input.type = 'text';
  input.maxLength = 80;
  input.placeholder = TYPES.task.placeholder;
  input.setAttribute('aria-label', 'Add a to-do');
  row.append(input);

  const commit = d => {
    const title = input.value.trim();
    if (!title) return;
    const p = personId ? byId(personId) : ensureSelf();
    if (!p) return;
    p.events.push(normaliseRecord({ id: uid(), type: 'task', date: d, title }));
    queueSave();
    renderAll();
  };

  if (date) {
    const btn = el('button', 'btn btn-primary btn-tiny todo-add-btn', 'Add');
    btn.type = 'button';
    btn.onclick = () => commit(date);
    row.append(btn);
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); commit(date); } };
  } else {
    const todayBtn = el('button', 'btn btn-primary btn-tiny todo-add-btn', 'Add for today');
    todayBtn.type = 'button';
    todayBtn.onclick = () => commit(today());
    row.append(todayBtn);
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); commit(today()); } };

    /* The calendar tab's own glyph, so this reads as "open the calendar to
       pick a day" rather than a second, unrelated icon. */
    const dateBtn = el('button', 'icon-btn icon-btn-sm todo-add-date-btn');
    dateBtn.type = 'button';
    dateBtn.setAttribute('aria-label', 'Choose a specific date');
    dateBtn.title = 'Choose a specific date';
    dateBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M3.5 10.5h17M8 3.5v4M16 3.5v4M7.5 14h2M14.5 14h2M7.5 17.5h2M14.5 17.5h2"/></svg>';
    dateBtn.onclick = () => openQuickDate(commit);
    row.append(dateBtn);
  }

  return row;
}

/* ── choosing a date for a quick-added to-do ─────────────────────
   The full calendar's own month grid is tightly bound to that page's own
   state — the picked day, the zoom into it, a whole year of months on
   screen at once — none of which belongs here. This is a plain, single
   month of .cal-day buttons in a dialog, sharing only the visual classes
   with the real calendar so it reads as the same calendar rather than a
   second one, and repainted fresh from qdMonth on every open, the same way
   discipleAddDialog's own small picker (js/walk-sheet.js) repaints itself.

   Forward-only, like the calendar tab itself: a to-do is always ahead of
   you, never behind, so there is nothing to browse to before this month. */
let qdMonth = null;   // the month currently shown in the popover
let qdCommit = null;  // where the day that gets tapped is sent

function openQuickDate(commit) {
  qdCommit = commit;
  qdMonth = monthStart(new Date());
  paintQuickDate();
  $('#dlg-quickdate').showModal();
}

function shiftQuickDate(by) {
  qdMonth = new Date(qdMonth.getFullYear(), qdMonth.getMonth() + by, 1);
  paintQuickDate();
}

function paintQuickDate() {
  const now = new Date();
  $('#quickdate-label').textContent = monthLabel(qdMonth);
  $('#quickdate-prev').disabled = monthKey(qdMonth) === monthKey(now);
  $('#quickdate-next').disabled = monthKey(qdMonth) === monthKey(new Date(now.getFullYear(), now.getMonth() + MONTHS_AHEAD - 1, 1));

  const grid = $('#quickdate-grid');
  grid.replaceChildren();
  WEEKDAYS.forEach(w => grid.append(el('div', 'cal-dow', w)));

  const first = monthStart(qdMonth);
  const last = monthEnd(qdMonth);
  const lead = (first.getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) grid.append(el('div', 'cal-pad'));

  for (let day = 1; day <= last.getDate(); day++) {
    const date = ymd(new Date(first.getFullYear(), first.getMonth(), day));
    const cell = el('button', 'cal-day' + (date === today() ? ' is-today' : ''));
    cell.type = 'button';
    cell.append(el('span', 'cal-n', String(day)));
    cell.onclick = () => { $('#dlg-quickdate').close(); qdCommit(date); };
    grid.append(cell);
  }
}
