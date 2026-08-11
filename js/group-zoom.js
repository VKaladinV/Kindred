/* uses: $ el · openGroup · closeLayer openLayer
   · groupById · renderGroups
*/

/* ── going into a group, and coming back out ─────────────────────
   A group's circle holds its members' faces. Opening it should be that: the
   circle you touched swallowing the screen while the faces inside it come
   apart and grow into the ordinary dashboard. Rebuilding the grid from nothing
   says something else — that you went somewhere — and the whole point of
   drawing a group as its people is that you did not.

   So two things move at once. The faces fly, each from where it sat in the
   packing to where its badge now is. Everything else — the other groups, and
   the tapped circle's own ring and name — is cloned once into a field and
   scaled about the tapped disc's centre, so the screen opens out from the exact
   point your finger was on rather than dissolving in place.

   The field is always a copy, never the live grid, and the live grid is always
   the thing that is hidden while the copy moves. Going in, the copy is of a
   grid that no longer exists; coming out, it is of one not yet worth showing.
   One rule both ways, and no frame where two grids are on screen at once.

   Built the way flyHeroPhoto is built, and for the same reason: rects recorded
   before the render, the inverse applied with transitions off, one forced
   reflow, then everything cleared so the stylesheet's own transition runs. CSS
   rather than element.animate, so the single prefers-reduced-motion rule at the
   foot of lock.css covers this too, without a second mechanism to keep in step
   with the first. */

/* How far the field opens out. Enough that its edges have left the screen by
   the time it has faded, so nothing is caught mid-move at either end. */
const ZOOM_SCALE = 2.6;

/* Longer than any transition in the stylesheet, and the promise that a flight
   which never reports finishing is still cleared up after. Reduced motion
   collapses every duration to a hundredth of a millisecond, and a transition
   that short may fire no transitionend at all — the same belt and braces
   ghostAway keeps behind its own fade. */
const ZOOM_SWEEP = 900;

/* How long settleZoom gives the landing fade before tearing the clones out
   from under it regardless — longer than the slowest thing it ever waits on,
   .zoom-field's own .45s opacity transition. */
const ZOOM_SETTLE = 500;

let zoomParts = [];      // the clones in flight, if any
let zoomTimer = null;
let groupLayer = null;

/* The badges have been standing still, held back, for the whole flight. Let
   go of the hold and an animation restarting from its own 0% is exactly what
   CSS does in that instant — so each is told once to stay where it is. The
   next render builds them again and none of this survives it. Guarded, so
   calling this when nothing was ever held back — the ordinary case, most of
   the time nothing is flying — does not walk every badge for nothing. */
function revealGrid() {
  const grid = $('#grid-groups');
  if (!grid) return;
  if (!grid.classList.contains('is-arriving') && !grid.classList.contains('is-lifted')) return;
  for (const b of grid.querySelectorAll('.badge')) b.style.animation = 'none';
  grid.classList.remove('is-arriving', 'is-lifted');
}

/* Everything the last flight put on the screen, gone at once, and the live
   grid handed back whatever it was holding for it. This is the hard reset —
   used to clear a flight a second tap interrupted, where a lingering fade
   would only be one more thing fighting the new one — not the ordinary way a
   flight ends; see settleZoom for that. Safe to call when nothing is flying,
   which is what lets it also be the way a second tap starts clean. */
function clearZoom() {
  clearTimeout(zoomTimer);
  zoomTimer = null;
  for (const n of zoomParts) n.remove();
  zoomParts = [];
  revealGrid();
  stripRingIn();
}

/* Whatever the last flight left mid-sweep, cleared with it — a second tap
   interrupting the first should not leave some other badge's ring frozen
   half drawn. Its own animationend usually beats this to it (see ringIn);
   this is only the case where a flight is cut short before that fires. */
function stripRingIn() {
  const grid = $('#grid-groups');
  if (!grid) return;
  for (const f of grid.querySelectorAll('.badge-frame.is-ring-in')) f.classList.remove('is-ring-in');
}

/* Swept in once this face's photo has actually landed on it, rather than on
   a timer that assumes every flight covers the same distance — the ring is
   the last thing to appear, and each face earns its own moment for it. */
function ringIn(frame) {
  frame.classList.add('is-ring-in');
  frame.addEventListener('animationend', function done(e) {
    if (e.target !== frame || e.animationName !== 'ring-sweep') return;
    frame.removeEventListener('animationend', done);
    frame.classList.remove('is-ring-in');
  });
}

/* The ordinary way a flight ends. Reveals what was underneath first, exactly
   as clearZoom does, then lets what was flying fade away over it rather than
   vanish out from under it — so a pixel of drift between the two, if there
   is ever one, is a thing that fades rather than a thing that clicks. */
function settleZoom() {
  clearTimeout(zoomTimer);
  zoomTimer = null;
  revealGrid();

  const parts = zoomParts;
  zoomParts = [];
  if (!parts.length) return;
  for (const n of parts) n.style.opacity = '0';
  setTimeout(() => { for (const n of parts) n.remove(); }, ZOOM_SETTLE);
}

/* Where each face is now, keyed by the person it belongs to. One shape for both
   sides of the zoom: out, the small faces packed inside a disc; in, the photo
   of each badge. Both carry data-id, which is the whole of what a flight
   between them needs to know.

   `root` is the disc on one side and the whole grid on the other, and the
   difference matters: somebody can be in several groups, so asked of the grid
   this would find their face in every disc that holds them and keep whichever
   came last — and they would fly in from a circle they were not opened from. */
function faceRects(root, sel) {
  const map = new Map();
  for (const f of root.querySelectorAll(sel)) {
    if (!f.dataset.id) continue;
    const rect = f.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    map.set(f.dataset.id, { el: f, rect });
  }
  return map;
}

const DISC_FACE = '.group-face[data-id]';
const BADGE_FACE = '.badge[data-id] .badge-photo';

/* A badge's photo is not itself tagged with the person — the badge around it
   is — so the id is put on it here, at the one moment both are in hand. Doing
   it in badge.js would have cost a line on every face in the app for the sake
   of the few that ever fly. */
function tagBadgePhotos(grid) {
  for (const b of grid.querySelectorAll('.badge[data-id]')) {
    const photo = b.querySelector('.badge-photo');
    if (photo) photo.dataset.id = b.dataset.id;
  }
}

/* .badge already carries data-group, and matching by iteration is how the app
   finds a badge everywhere else — an id has never been promised to be safe to
   drop into a selector string, and this way nothing has to promise it. */
function groupDiscIn(grid, id) {
  for (const b of grid.querySelectorAll('.badge[data-group]')) {
    if (b.dataset.group === id) return b.querySelector('.group-disc');
  }
  return null;
}

/* The field: the grid as a copy, pinned where it stands so it can be moved
   without the live one moving with it. Scaled about the point given, which is
   the centre of the circle you touched — that origin is the whole difference
   between zooming into something and fading it away.

   The tapped group's own faces are taken out of the copy: they are the ones
   flying, and a face cannot be in two places. */
function liftField(grid, rect, origin, flyingFrom) {
  const field = el('div', 'zoom-field');
  field.style.left = rect.left + 'px';
  field.style.top = rect.top + 'px';
  field.style.width = rect.width + 'px';
  field.style.height = rect.height + 'px';
  field.style.transformOrigin = `${origin.x - rect.left}px ${origin.y - rect.top}px`;
  field.append(...grid.cloneNode(true).childNodes);

  const disc = groupDiscIn(field, flyingFrom);
  if (disc) for (const f of disc.querySelectorAll('.group-face')) f.style.visibility = 'hidden';
  return field;
}

/* Park each clone at its destination, transform it back to where it started,
   force one reflow, then clear — the stylesheet carries it the rest of the way.
   `dir` is which way the field goes: out past the edges of the screen on the
   way in, and back in from beyond them on the way out. */
function runZoom(pairs, field, dir) {
  const grid = $('#grid-groups');
  const clones = [];

  for (const { el: src, from, to } of pairs) {
    const c = src.cloneNode(true);
    c.className = 'zoom-face';
    /* The clone has left the .badge-frame it inherited --frame from, and the
       initials inside it are drawn against that. Restated here from the one
       measurement that already equals what it needs to be, exactly as
       flyHeroPhoto restates it for the photo it lifts out of a badge. */
    c.style.setProperty('--frame', to.width + 'px');
    c.style.setProperty('--face-share', '1');
    c.style.left = to.left + 'px';
    c.style.top = to.top + 'px';
    c.style.width = to.width + 'px';
    c.style.height = to.height + 'px';

    const scale = from.width / to.width;
    const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
    const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
    c.style.transition = 'none';
    c.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    document.body.append(c);
    clones.push(c);
  }

  if (field) {
    $('#ghosts').append(field);
    field.style.transition = 'none';
    field.style.transform = dir === 'in' ? 'none' : `scale(${ZOOM_SCALE})`;
    field.style.opacity = dir === 'in' ? '1' : '0';
  }

  zoomParts = field ? [...clones, field] : clones;
  if (!zoomParts.length) { clearZoom(); return; }

  void grid.offsetWidth;   // the same forced reflow flipCircle and flyHeroPhoto use

  for (const c of clones) { c.style.transition = ''; c.style.transform = 'none'; }
  if (field) {
    field.style.transition = '';
    field.style.transform = dir === 'in' ? `scale(${ZOOM_SCALE})` : 'none';
    field.style.opacity = dir === 'in' ? '0' : '1';
  }

  /* The faces are what the eye is following, so the landing is theirs to call —
     and only the last of them, since they do not all have the same distance to
     travel. Filtered to transform the way flyHeroPhoto filters, because the
     field's opacity finishes first and would end the flight early.

     A group with nobody in it has no face to wait on; the sweep below is what
     lands that one. */
  let left = clones.length;
  clones.forEach((c, i) => {
    const frame = pairs[i].frame;
    c.addEventListener('transitionend', function land(e) {
      if (e.target !== c || e.propertyName !== 'transform') return;
      c.removeEventListener('transitionend', land);
      /* Only going in: coming out, a face lands on a group's disc, which has
         no ring to sweep. */
      if (dir === 'in' && frame) ringIn(frame);
      if (--left === 0) settleZoom();
    });
  });
  zoomTimer = setTimeout(settleZoom, ZOOM_SWEEP);
}

/* ── in ──────────────────────────────────────────────────────────── */

function enterGroup(id) {
  const g = groupById(id);
  if (!g || openGroup === id) return;
  /* Out of the last one first. Nothing on screen offers this today — inside a
     group you see people, not groups — but leaving it to be true by accident
     would mean a second layer pushed over the first, and the first is the one
     the back button would then have to be pressed twice to be rid of. */
  if (openGroup) leaveGroup({ animate: false });
  clearZoom();               // an earlier flight, if the taps came faster than it

  const grid = $('#grid-groups');
  const disc = groupDiscIn(grid, id);
  const gridRect = grid.getBoundingClientRect();
  const discRect = disc && disc.getBoundingClientRect();

  /* A grid nobody can see measures zero, and a flight built on zeroes throws
     every face at the top-left corner. The same trap markCircleFlip guards,
     and the same answer: render it, and let it simply be there. */
  const can = !!discRect && discRect.width > 0 && gridRect.width > 0;
  const was = can ? faceRects(disc, DISC_FACE) : null;
  const field = can ? liftField(grid, gridRect, centreOf(discRect), id) : null;

  openGroup = id;
  /* A layer, so the back press zooms out instead of leaving the app — and so a
     person opened from inside a group stacks on top and comes off first. */
  groupLayer = openLayer(() => leaveGroup({ fromBack: true }));

  /* Set before the render, so the badges it builds are held back from the
     first frame they exist rather than drawn and then hidden. */
  if (can) grid.classList.add('is-arriving');
  renderGroups();
  if (!can) return;

  tagBadgePhotos(grid);
  runZoom(pairsBetween(was, faceRects(grid, BADGE_FACE)), field, 'in');
}

/* ── out ─────────────────────────────────────────────────────────── */

/* `animate: false` is switchView's way out, where the view this happened in is
   about to be hidden and there is nothing left to zoom out of. `fromBack` is
   the browser having popped our layer already, so taking it off the stack a
   second time would wind one history entry too many. */
function leaveGroup({ animate = true, fromBack = false } = {}) {
  if (!openGroup) return;
  const id = openGroup;
  clearZoom();

  const grid = $('#grid-groups');
  const can = animate && !!grid && !grid.hidden && grid.getBoundingClientRect().width > 0;
  let was = null;
  if (can) { tagBadgePhotos(grid); was = faceRects(grid, BADGE_FACE); }

  openGroup = null;
  if (!fromBack) closeLayer(groupLayer);
  groupLayer = null;

  /* Lifted, not held back: coming out, the copy stands in for the whole grid
     rather than for the faces on it, so what is underneath must not be seen at
     all until the copy has finished settling into place. */
  if (can) grid.classList.add('is-lifted');
  renderGroups();
  if (!can) { clearZoom(); return; }

  const disc = groupDiscIn(grid, id);
  const discRect = disc && disc.getBoundingClientRect();
  if (!discRect || !discRect.width) { clearZoom(); return; }

  const field = liftField(grid, grid.getBoundingClientRect(), centreOf(discRect), id);
  runZoom(pairsBetween(was, faceRects(disc, DISC_FACE)), field, 'out');
}

/* Standing in a group that has stopped existing — removed on another device
   while you were in it, and landed by a sync. There is nothing to zoom out of
   and nothing to animate, but the layer is real and would otherwise go on
   standing in front of the back button for a group nobody can see. renderGroups
   notices, the same way renderSheet notices a person who has gone. */
function dropOpenGroup() {
  openGroup = null;
  closeLayer(groupLayer);
  groupLayer = null;
  clearZoom();
}

const centreOf = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/* Only the faces that exist on both sides travel. Somebody who was in the disc
   but is not on the dashboard — or the other way about — has nowhere to fly to,
   and is left to the ordinary entrance the stylesheet gives everything else. */
function pairsBetween(from, to) {
  const out = [];
  for (const [id, was] of from) {
    const now = to.get(id);
    /* .badge-photo's own parent, rather than a lookup by id later — the same
       reason groupDiscIn walks the grid instead of trusting an id into a
       selector string, except here the element is already in hand. Used to
       sweep that face's ring in once its flight actually lands on it. */
    if (now) out.push({ el: was.el, from: was.rect, to: now.rect, frame: now.el.parentElement });
  }
  return out;
}
