/* uses: $ el */

let circleFlip = null;

/* Taken once and spent once: reading it is what clears it, so a repaint that
   nobody asked for cannot inherit the animation meant for the last one. */
function takeCircleFlip() {
  const flip = circleFlip;
  circleFlip = null;
  return flip;
}
let ghostTimer = null;

/* Called before the render, while the old faces are still on the screen —
   the same shape as markFlip, and for the same reason. */
function markCircleFlip() {
  const grid = $('#grid');
  /* A grid nobody can see measures zero, and a flip built on zeroes throws
     every face at the top-left corner. The same trap hexMetrics guards. */
  if (!grid || !grid.clientWidth) { circleFlip = null; return; }
  const map = new Map();
  for (const b of grid.querySelectorAll('.badge[data-id]')) {
    const f = b.querySelector('.badge-frame');
    if (!f) continue;
    map.set(b.dataset.id, {
      el: b,
      /* The frame's rect, because that is the thing that moves and resizes —
         on a computer the badge is a whole grid cell and says nothing about
         where the face was drawn. The badge's own rect comes too: a face that
         is leaving takes its name with it, and both have to fade together. */
      face: f.getBoundingClientRect(),
      box: b.getBoundingClientRect(),
      rowFace: b.parentElement?.style.getPropertyValue('--row-face') || '',
    });
  }
  circleFlip = map;
}

/* The ones the filter stopped asking for, pinned where they stood and faded
   there rather than cut. Each keeps a .hex-row around it: every rule the phone
   packing hangs off that class — the face size, the nowrap captions, the
   hidden quiet ones — stops applying the moment a badge leaves the grid, and
   a quiet ghost would sprout a name halfway through its own fade. */
function ghostAway(snap, keep) {
  const layer = $('#ghosts');
  if (!layer) return;
  /* Cleared rather than added to: tapping four chips quickly should not leave
     four generations of ghosts stacked on the screen. The oldest simply go. */
  layer.textContent = '';
  for (const [id, s] of snap) {
    if (keep.has(id)) continue;
    const row = el('div', 'hex-row');
    row.style.left = s.box.left + 'px';
    row.style.top = s.box.top + 'px';
    row.style.width = s.box.width + 'px';
    if (s.rowFace) row.style.setProperty('--row-face', s.rowFace);
    row.append(s.el);
    row.addEventListener('animationend', e => { if (e.target === row) row.remove(); });
    layer.append(row);
  }
  /* One sweep behind the lot of them, in case an animationend never arrives —
     a ghost that outlives its fade would sit over the circle unclickable. */
  clearTimeout(ghostTimer);
  ghostTimer = setTimeout(() => { layer.textContent = ''; }, 700);
}

/* The ones that stayed, carried across. */
function flipCircle(grid, snap) {
  const stayed = [];
  for (const b of grid.querySelectorAll('.badge[data-id]')) {
    const was = snap.get(b.dataset.id);
    if (was) stayed.push([b, was]);
  }
  if (!stayed.length) return;

  /* Before anything is measured, so no survivor's pop has the chance to start
     and then be cancelled — a cancelled pop is a face blinking from nothing to
     solid, which is worse than the hard cut this replaces. */
  for (const [b] of stayed) b.classList.add('is-staying');

  /* --frame is the one number everything inside a badge is measured against,
     and it is a plain custom property — so an inline pixel value overrides
     both the computer's calc and the phone's --frame-px at once, and width and
     margin-top follow it in a single move. Setting the old size here, before
     the reflow below, is what gives a face that is growing something to grow
     from; without it the element has no from-state and the browser simply
     draws it at its new size.

     Only the drawn face is animated, never the badge's own box: .hex-row is
     flex: 0 0 and does not wrap, so a row whose boxes were mid-growth would
     overflow for as long as the move took. The packing is settled before
     anything starts moving, and only the faces inside it travel. */
  for (const [b, was] of stayed) {
    const f = b.querySelector('.badge-frame');
    f.style.transition = 'none';
    f.style.setProperty('--frame', was.face.width + 'px');
  }

  /* One read pass, after every write — the layout is flushed once and the rest
     of these come out of the same cache. */
  const moves = stayed.map(([b, was]) => {
    const now = b.querySelector('.badge-frame').getBoundingClientRect();
    return [b, was.face.left - now.left, was.face.top - now.top];
  });

  /* The move goes on the badge, not the frame: the frame's own transform is
     already spoken for by --tilt and the hover lift, and moving the badge
     carries the name along underneath the face. */
  for (const [b, dx, dy] of moves) {
    b.style.transition = 'none';
    b.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  void grid.offsetWidth;

  /* Everything written above is cleared here, which is why this needs no
     tidying pass and no generation counter: a snapshot taken mid-flight reads
     the interpolated rect, which is exactly where the face visually is, and
     turning the transition off writes the value it is already at. Tapping
     chips faster than the animation simply picks it up from wherever it got. */
  for (const [b] of moves) {
    b.style.transition = '';
    b.style.transform = '';
    const f = b.querySelector('.badge-frame');
    f.style.transition = '';
    f.style.removeProperty('--frame');
  }
}

/* ── choosing who to show ───────────────────────────────────────
   One builder, two homes: the row above the circle on a computer, and the
   popup a phone opens from the filter button. The row costs three lines of
   a small screen before you have seen anybody, which is what the button is
   for — the chips inside it are the same chips, doing the same thing. */

