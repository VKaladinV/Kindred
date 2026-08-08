/* uses: GROUPS · $ el · filterFocus filterGroups people · FOCUS
   · markCircleFlip · renderCircle
*/

function fillFilterChips(box) {
  box.textContent = '';
  const counts = {};
  people.forEach(p => p.groups.forEach(g => { counts[g] = (counts[g] || 0) + 1; }));

  const none = !filterGroups.size && !filterFocus.size;
  const everyone = el('button', 'chip' + (none ? ' is-on' : ''));
  everyone.type = 'button';
  everyone.setAttribute('aria-pressed', String(none));
  everyone.append(document.createTextNode('Everyone'), el('span', 'n', people.length));
  everyone.onclick = () => { filterGroups.clear(); filterFocus.clear(); afterFilterChange(); };
  box.append(everyone);

  GROUPS.forEach(g => {
    const on = filterGroups.has(g);
    if (!counts[g] && !on) return;   // but a group you have chosen always stays visible
    const c = el('button', 'chip' + (on ? ' is-on' : ''));
    c.type = 'button';
    c.setAttribute('aria-pressed', String(on));
    c.append(document.createTextNode(g), el('span', 'n', counts[g] || 0));
    /* groups add up rather than replace each other — Family and Medical
       together is everyone in either, which is how you actually look */
    c.onclick = () => {
      if (!filterGroups.delete(g)) filterGroups.add(g);
      afterFilterChange();
    };
    box.append(c);
  });

  /* Set apart from the groups because they do the opposite thing: a group
     widens what you are looking at and these narrow it. A hairline on a
     computer, a line break in the popup, where a vertical rule in a wrapping
     row would land wherever it fell. */
  const shown = Object.entries(FOCUS).filter(([k, f]) =>
    filterFocus.has(k) || people.some(f.test));
  if (shown.length) box.append(el('span', 'chip-sep'));

  shown.forEach(([key, f]) => {
    const on = filterFocus.has(key);
    const c = el('button', 'chip is-focus' + (on ? ' is-on' : ''));
    c.type = 'button';
    c.setAttribute('aria-pressed', String(on));
    /* Counted over everybody rather than over the current narrowing, the way
       the group counts already are — a number that changed with every tap
       would be answering a different question each time you read it. */
    c.append(document.createTextNode(f.chip), el('span', 'n', people.filter(f.test).length));
    c.onclick = () => {
      if (!filterFocus.delete(key)) filterFocus.add(key);
      afterFilterChange();
    };
    box.append(c);
  });
}

/* The popup is where the two kinds of chip sit next to each other with nothing
   between them to say which is which, so the line above them says it — and
   says it about what you have actually chosen, rather than in the abstract. */
function paintFilterHint() {
  const f = [...filterFocus].map(k => FOCUS[k].phrase);
  const g = [...filterGroups];
  const who = f.length === 2 ? `${f[0]} or ${f[1]}` : f[0];
  $('#filter-hint').textContent =
    !f.length ? 'Groups add up — Family and Medical together is everyone in either.'
    : g.length ? `${g.join(' and ')} — and of those, only the people who ${who}.`
    : `The people who ${who}.`;
}

const paintFilterDialog = () => { fillFilterChips($('#filter-chips')); paintFilterHint(); };

/* renderCircle rebuilds the row and the grid on its own. The popup's chips
   are outside it, so they are repainted here — but only while the popup is
   the thing being looked at. */
function afterFilterChange() {
  markCircleFlip();
  renderCircle();
  if ($('#dlg-filter').open) paintFilterDialog();
}

function paintFilterCount() {
  const n = filterGroups.size + filterFocus.size;
  const b = $('#btn-filter');
  b.classList.toggle('is-on', n > 0);
  $('#filter-n').textContent = n || '';
  b.setAttribute('aria-label', n ? `Choose who to show — ${n} chosen` : 'Choose who to show');
}

