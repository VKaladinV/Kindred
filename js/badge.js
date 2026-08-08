/* uses: KINDS · daysSinceWords el hashCode plural sinceShort · Store
   · SMALL activeSeasons badgeScale lastTouchDate openPrayers statusOf
   · clamp · avatar · openSheet
*/

function badge(p, i, scale = badgeScale(p)) {
  const s = statusOf(p);
  const b = el('div', 'badge');
  b.dataset.state = s.state;
  /* What lets a face be recognised as the same face across a rebuild, which
     is the whole of what a filter transition needs to know. */
  b.dataset.id = p.id;
  b.style.setProperty('--i', i);
  /* One number, and everything inside the badge follows it — the ring, the
     marks, the initials, the disc are all proportions of --frame already. It
     is handed in rather than worked out here, because how big a face is drawn
     now depends on the company it is keeping. */
  b.style.setProperty('--scale', scale.toFixed(3));
  /* The quiet ones: nobody you asked to be reminded about. At a third size
     there is no room to name them and nothing for a days-since count to be
     counting towards, so they keep the photo and the ring and let go of the
     rest. Tapping still opens them.
     Read off the lifted scale, so a third that a filter has raised to a half
     gets its name back — at that size there is room for it again. */
  const quiet = scale <= SMALL;
  b.classList.toggle('is-quiet', quiet);

  const frame = el('button', 'badge-frame');
  frame.type = 'button';
  frame.setAttribute('aria-label', `Open ${p.name}`);
  frame.style.setProperty('--tilt', ((hashCode(p.id) % 7) - 3) + 'deg');
  frame.onclick = () => openSheet(p.id);
  frame.append(avatar(p, 'badge-photo'));

  const nOpen = openPrayers(p).length;
  if (nOpen) {
    const flag = el('div', 'badge-flag', '✜');
    flag.title = plural(nOpen, 'open prayer', 'open prayers');
    frame.append(flag);
  }

  const seasons = activeSeasons(p);
  if (seasons.length) {
    const mark = el('div', 'badge-season', (KINDS[seasons[0].kind] || KINDS.other).glyph);
    mark.title = seasons.map(x => x.title).join(' · ');
    frame.append(mark);
  }

  /* How long since you last spoke, sitting on the bottom edge of the face.
     Everyone carries it, not only the overdue — the ring already says whether
     that is a problem, and this says how long it has been either way. */
  const last = lastTouchDate(p);
  const since = el('div', 'badge-since', last ? sinceShort(last) : '—');
  /* Spelled out in days rather than through agoWords, which rounds where the
     disc floors — the two would contradict each other on the same face. */
  since.title = last ? `Last connected ${daysSinceWords(last)}` : 'No check-in yet';
  frame.append(since);

  b.append(frame, el('div', 'badge-name', p.name));

  if (p.relationship) b.append(el('div', 'badge-meta', p.relationship));

  return b;
}

/* A future connection has no check-in rhythm to ring, size or caption — the
   ring, the since-caption and the season mark all model an ongoing
   relationship this person isn't in yet. So this skips badge() entirely
   rather than reusing it with a fixed scale: no --scale set means --frame
   falls back to full size on its own (styles.css), and no dataset.state
   means the ring is neutralised by the .no-ring class instead of colored. */
function futureBadge(p) {
  const b = el('div', 'badge no-ring');
  b.dataset.id = p.id;

  const frame = el('button', 'badge-frame');
  frame.type = 'button';
  frame.setAttribute('aria-label', `Open ${p.name}`);
  frame.style.setProperty('--tilt', ((hashCode(p.id) % 7) - 3) + 'deg');
  frame.onclick = () => openSheet(p.id);
  frame.append(avatar(p, 'badge-photo'));

  const nOpen = openPrayers(p).length;
  if (nOpen) {
    const flag = el('div', 'badge-flag', '✜');
    flag.title = plural(nOpen, 'open prayer', 'open prayers');
    frame.append(flag);
  }

  b.append(frame, el('div', 'badge-name', p.name));
  if (p.occupation) b.append(el('div', 'badge-meta', p.occupation));

  return b;
}

/* ── how big a face is, and how many fit ────────────────────────
   The size lives in one CSS variable, so changing it is a variable to set
   rather than anything to redraw — on a computer the grid reflows itself and
   the badges never blink. A phone is the exception: there the badges are laid
   out in rows here, and how many go in a row is exactly what just changed. */

const phone = matchMedia('(max-width: 899px)');
const SIZE_MIN = 70, SIZE_MAX = 145;

/* Under this much drawn face, two lines of caption is one line of ellipsis and
   one line of noise, so the relationship goes and the name keeps the width.
   A floor in real pixels rather than a proportion of the face: the caption is
   the same eleven-pixel line whatever size the faces are set to, so what it
   needs in order to be worth reading is the same width too. */
const META_MIN_PX = 76;

const badgeSizePref = () => {
  const v = Number(Store.getPref('badgeSize', '100'));
  return Number.isFinite(v) ? clamp(v, SIZE_MIN, SIZE_MAX) : 100;
};

const applyBadgeSize = v => document.documentElement.style.setProperty('--badge-scale', v / 100);

/* --badge is a calc(), and a calc() in a custom property does not resolve
   when you read the property back — so the number is measured off a real
   element rather than written down a second time here, where it would drift
   from the stylesheet the first time either changed. The probe carries the
   gap as a margin so one element answers both questions. */
