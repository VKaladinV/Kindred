/* uses: el · avatar */

/* ── faces packed into a circle ──────────────────────────────────
   A group's avatar is its members' faces, drawn as big as a circle will hold
   them without any two touching. That is a named problem — packing n equal
   circles into a unit circle — and for the sizes this app draws it has a
   closed form worth preferring to a table of coordinates.

   Put k faces evenly around one ring, each tangent to the rim and to its two
   neighbours. Their centres sit at 1 - r from the middle, so the chord between
   two adjacent centres is 2(1 - r)·sin(π/k), and touching means that chord is
   exactly 2r. Solve it and the whole geometry is two lines:

       s = sin(π / k)        r = s / (1 + s)

   For two to six faces that ring is the known optimal packing exactly. From
   seven, one face goes in the middle and the ring takes the rest: the centre
   face fits as long as r ≤ ⅓, and with that cap the same formula lands on the
   proven optimum again at seven, eight and nine. Past nine the true optimum
   breaks into two uneven rings and this gives up a little — about a tenth of a
   face diameter at twelve, which is where the group badge stops drawing.

   Traded knowingly: a hardcoded table would buy back that tenth and cost a
   screenful of magic numbers that nobody could ever check. This cannot emit an
   overlap at any n, which is the property that actually matters. */

/* Twelve is where a face stops being a face. Beyond it the badge shows the
   twelve who need you most and says how many more there are — see groupBadge. */
const GROUP_FACES = 12;

/* Faces drawn a hair inside the size the packing allows, so tangent circles
   read as neighbours rather than as one shape. Their centres do not move, so
   this is a gap all the way round: between each pair, and at the rim. */
const FACE_GAP = 0.94;

function packing(n) {
  if (n <= 1) return { r: 1, spots: [[0, 0]] };
  const middle = n > 6;                     // seven and up keep one in the middle
  const ring = middle ? n - 1 : n;
  const s = Math.sin(Math.PI / ring);
  /* The cap is what stops the middle face touching the ring: their centres are
     1 - r apart and both have radius r, so 1 - r ≥ 2r. It applies only when
     there is a middle face to protect — a bare ring of two wants a half each,
     and capping it would draw them at a third for the sake of a face that is
     not there. As it happens the cap never binds once it is asked correctly:
     a ring of six is exactly a third already, and every longer ring is less. */
  const r = middle ? Math.min(s / (1 + s), 1 / 3) : s / (1 + s);
  const d = 1 - r;
  const spots = middle ? [[0, 0]] : [];
  for (let i = 0; i < ring; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / ring;   // first face at the top
    spots.push([d * Math.cos(a), d * Math.sin(a)]);
  }
  return { r, spots };
}

/* The disc, with the faces in it. Everything is a percentage of the disc's own
   box rather than a pixel: the badge is sized by --frame like every other face
   in the app, and the slider in settings moves that — so a packing written in
   pixels would be a packing that had to be rebuilt every time somebody dragged
   it, and this one simply scales.

   The unit circle runs -1 to 1 across a box that is 100% wide, so a length of
   1 there is 50% here and a centre at x sits at 50 + 50x.

   'thumb' is the right tier: the largest face a twelve-strong group draws is
   about a quarter of a badge, and the small copy exists for exactly this. */
function packFaces(list) {
  const disc = el('div', 'group-disc');
  const { r, spots } = packing(list.length);
  const size = 100 * r * FACE_GAP;

  list.forEach((p, i) => {
    const f = avatar(p, 'group-face', false, 'thumb');
    /* The same handle the badges carry, and for the same reason: it is what
       lets a face be recognised as the same face on the other side of a zoom. */
    f.dataset.id = p.id;
    const [x, y] = spots[i];
    f.style.left = (50 + 50 * (x - r * FACE_GAP)) + '%';
    f.style.top = (50 + 50 * (y - r * FACE_GAP)) + '%';
    f.style.width = size + '%';
    f.style.height = size + '%';
    /* What the initials are drawn against. A percentage cannot size a font, so
       the one number CSS cannot work out for itself is handed to it — the same
       arrangement --frame has with .badge-photo .initials, and the same thing
       flyHeroPhoto has to restate when it lifts a face out of its badge. */
    f.style.setProperty('--face-share', r * FACE_GAP);
    disc.append(f);
  });
  return disc;
}
