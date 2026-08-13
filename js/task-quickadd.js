/* uses: TYPES · el today uid · byId ensureSelf people queueSave
   · normaliseRecord · renderAll
*/

/* Type it, tap Add — the one thing every to-do actually needs, without the
   dialog that everything else on a person's page goes through. A profile
   already knows who the row is for, so personId is passed and the "who"
   field never appears; Today and an open calendar day know neither, so they
   leave it out and get one, defaulting to your own list the same way the
   old dialog did (see ensureSelf, js/state.js).

   date is a preset rather than something typed here: the calendar hands in
   the day you were looking at, Today hands in today, and a profile leaves it
   empty so it falls to today() at the moment of adding — never a field the
   quick-add itself asks about, the same way the old "Add to this day" button
   never asked either. */
function taskQuickAdd({ personId = null, date = '' } = {}) {
  const row = el('div', 'todo-add');

  let who = null;
  if (!personId) {
    who = el('select', 'todo-add-who');
    who.setAttribute('aria-label', 'Who it is for');
    who.append(new Option('Just me', ''));
    [...people].sort((a, b) => a.name.localeCompare(b.name))
      .forEach(p => who.append(new Option(p.name, p.id)));
    row.append(who);
  }

  const input = el('input', 'todo-add-input');
  input.type = 'text';
  input.maxLength = 80;
  input.placeholder = TYPES.task.placeholder;
  input.setAttribute('aria-label', 'Add a to-do');
  row.append(input);

  const btn = el('button', 'btn btn-primary btn-tiny todo-add-btn', 'Add');
  btn.type = 'button';
  row.append(btn);

  /* renderAll rebuilds this row from nothing on every add, the same as every
     other piece of the page — which is what clears the input rather than any
     reset written here. */
  const commit = () => {
    const title = input.value.trim();
    if (!title) return;
    const p = personId ? byId(personId) : (who?.value ? byId(who.value) : ensureSelf());
    if (!p) return;
    p.events.push(normaliseRecord({ id: uid(), type: 'task', date: date || today(), title }));
    queueSave();
    renderAll();
  };
  btn.onclick = commit;
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } };

  return row;
}
