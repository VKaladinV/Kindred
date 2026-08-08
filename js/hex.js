/* uses: el · badgeScale · META_MIN_PX badge */

let probe = null;
function hexMetrics(grid) {
  if (!probe) {
    probe = el('span', 'badge-probe');
    probe.setAttribute('aria-hidden', 'true');
    document.body.append(probe);
  }
  const cs = getComputedStyle(probe);
  const max = parseFloat(cs.width) || 1;
  const gap = parseFloat(cs.marginLeft) || 0;
  const w = grid.clientWidth;
  /* Same give as the grid takes on a computer: a face may shrink to
     four-fifths of its set size if that lets one more fit across. */
  const per = Math.max(2, Math.floor((w + gap) / (max * .8 + gap)));
  /* A grid nobody can see has no width, and the arithmetic above then hands
     back a negative cell — which reaches CSS as an invalid length, so every
     declaration built on it is dropped and the faces come apart. Renders on a
     hidden tab used to do exactly that. switchView repaints on the way in now,
     but a render should not be able to emit nonsense in the first place. */
  const cell = Math.min(max, (w - (per - 1) * gap) / per);
  return { per, gap, width: w > 0 ? w : max, cell: cell > 0 ? cell : max };
}

let hexCols = 0;

/* ── the phone tessellation ──────────────────────────────────────
   Faces are no longer one size, so rows can no longer be a count. Each face
   asks for its own width and a row takes them until the next will not fit,
   which is what lets three quiet third-size faces sit where one full one did.

   The nesting survives it. Alternate rows give up half a face of usable
   width, so with faces all one size this still comes out as rows of n and
   n-1 — the short row centred into the gaps of the long one — and with mixed
   sizes it degrades into an honest stagger rather than a grid.

   Each row also carries its own tallest face. That is what lets a row of
   small faces be a short row, instead of every row standing to the height of
   the biggest face anywhere in the circle. */
function layoutHex(grid, list, scales) {
  const { per, cell, gap, width } = hexMetrics(grid);
  grid.style.setProperty('--hex-cell', cell + 'px');

  /* A missing id would hand cell * undefined on to CSS as NaNpx, which is an
     invalid length: the declaration is dropped and the row comes apart — the
     same failure the zero-width guard above exists to prevent. */
  const faces = list.map(p => {
    const scale = scales?.get(p.id) ?? badgeScale(p);
    return { p, scale, face: cell * scale };
  });

  let i = 0, long = true;
  while (i < faces.length) {
    /* Half a face of slack on the short rows is the whole nesting trick. */
    const room = width - (long ? 0 : (cell + gap) / 2);
    const chunk = [];
    let used = 0;
    while (i + chunk.length < faces.length) {
      const next = faces[i + chunk.length];
      const need = used + (chunk.length ? gap : 0) + next.face;
      if (chunk.length && need > room) break;    // always at least one
      used = need;
      chunk.push(next);
    }

    const row = el('div', 'hex-row');
    row.style.setProperty('--row-face', Math.max(...chunk.map(c => c.face)) + 'px');
    chunk.forEach(({ p, scale, face }, k) => {
      const b = badge(p, i + k, scale);
      b.style.setProperty('--frame-px', face + 'px');
      /* Only the packer knows how wide a face is actually drawn, so the
         decision about what fits underneath it is made here. */
      b.classList.toggle('is-terse', face < META_MIN_PX);
      row.append(b);
    });
    grid.append(row);

    i += chunk.length;
    long = !long;
  }
  return per;
}

/* ── moving from one filter to the next ─────────────────────────
   A filter change is not a new circle. It is the same circle asked a narrower
   question, and rebuilding it from nothing says otherwise: everybody blinks
   out and a different group blinks in, and you lose track of where somebody
   went. So the faces that stay are carried — from where they were to where
   they now are, and from the size they were to the size they now are — and
   the faces that go are left to fade where they stood.

   Built the way flipDay is built, and for the same reason: rects recorded
   before the render, the inverse applied with transitions off, one forced
   reflow, then everything cleared so the stylesheet's own transition runs.
   CSS rather than element.animate, so the single prefers-reduced-motion rule
   at the foot of the stylesheet covers this too, without a second mechanism
   to keep in step with the first. */

