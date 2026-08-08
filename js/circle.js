/* uses: $ el plural · filterFocus filterGroups futures people query
   · FOCUS byNeed scalesFor · badge futureBadge phone
   · layoutHex · flipCircle ghostAway takeCircleFlip
   · fillFilterChips paintFilterCount · quiet
*/

/* The two lines about the circle that are not in it: the tagline sits in the
   masthead and the count in the colophon, both on screen whichever view is
   being read. Split out of renderCircle for the same reason paintTodayCount
   was split out of renderToday — a repaint that skips the hidden grid must
   not leave these two saying how many people you had a moment ago. */
function paintCircleCount() {
  const n = people.length;
  $('#footer-count').textContent = n ? plural(n, 'person', 'people') + ' held close' : 'nobody yet';
  $('#tagline').textContent = n ? 'the people I hold, and how they are' : 'a quiet place to begin';
}

function renderCircle() {
  const grid = $('#grid');
  /* Taken once and spent once, exactly like calFlipFrom. Every other caller —
     renderAll after an edit, switchView on the way in, the resize handler —
     leaves it null and gets the plain repaint it always got. Only a change of
     mind about who to show is a move worth animating. */
  const flip = takeCircleFlip();

  grid.classList.toggle('no-entry', quiet);
  grid.textContent = '';

  const q = query.trim().toLowerCase();
  const list = people
    .filter(p => !filterGroups.size || p.groups.some(g => filterGroups.has(g)))
    /* The groups add up among themselves and these add up among themselves,
       but the two narrow each other: Family and Medical and needs-a-check-in
       is the people in either group who are also due. */
    .filter(p => !filterFocus.size || [...filterFocus].some(k => FOCUS[k].test(p)))
    .filter(p => !q || (p.name + ' ' + p.relationship + ' ' + p.summary + ' ' + p.groups.join(' ')).toLowerCase().includes(q))
    .sort(byNeed);

  /* Worked out once here rather than twice inside the renderers, because how
     big a face is drawn depends on the whole of what is on screen with it. */
  const scales = scalesFor(list);

  grid.classList.toggle('is-hex', phone.matches);
  if (phone.matches) hexCols = layoutHex(grid, list, scales);
  else list.forEach((p, i) => grid.append(badge(p, i, scales.get(p.id))));

  if (flip) {
    /* The leavers first: they are already detached, and getting them out of
       the way before anything is measured keeps the read pass below clean. */
    ghostAway(flip, new Set(list.map(p => p.id)));
    flipCircle(grid, flip);
  }

  $('#blank').hidden = people.length > 0;
  grid.hidden = people.length === 0;

  if (people.length && !list.length) {
    grid.hidden = false;
    grid.append(el('p', 'quiet-note', 'No one matches that.'));
  }

  const chips = $('#chips');
  chips.textContent = '';
  const canFilter = people.length > 3;
  if (canFilter) fillFilterChips(chips);

  /* The button that stands in for the row on a phone. Hidden on the same
     terms as the chips: with three people there is nothing to sift. */
  $('#btn-filter').hidden = !canFilter;
  paintFilterCount();

  paintCircleCount();
}

/* Every future-connection badge is the same full size, so unlike the circle
   this needs no per-render scale map and no phone tessellation — the plain
   CSS grid packs same-sized faces on its own. */
function renderFuture() {
  const grid = $('#grid-future');
  grid.classList.toggle('no-entry', quiet);
  grid.textContent = '';
  const list = [...futures].sort((a, b) => a.name.localeCompare(b.name));
  list.forEach(p => grid.append(futureBadge(p)));
  $('#blank-future').hidden = futures.length > 0;
  grid.hidden = futures.length === 0;
}

/* ═══════════════════════════ RENDER: PRAYERS ══════════════ */

/* One row, three states. The tick means something different in each: on the
   list it records that you prayed today, and in either archive it brings the
   prayer back. Closing a prayer is deliberate and goes through the dialog —
   a single stray tap used to delete one outright. */
/* ── what you let others see ────────────────────────────────────
   Only ever on your own page, and only ever off unless you have said so.
   Nothing here is shared because it exists; it is shared because you marked
   that one thing, which is what makes your own profile somewhere you can
   also keep what you are not ready to say out loud.

   The pill is both the saying and the record of it. Until you have linked
   with anybody it is a promise about a future audience rather than a live
   broadcast, and it says so. */
