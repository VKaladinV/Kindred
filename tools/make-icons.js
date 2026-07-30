/* Regenerates the PNG app icons from the same artwork as icon.svg.
   Android (Bubblewrap/TWA) and iOS both refuse SVG icons, so these PNGs are
   what make the app installable.

   Run from the project root:   node tools/make-icons.js

   No dependencies — draws the artwork with supersampled coverage and encodes
   the PNG with Node's built-in zlib. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..');
const SS = 3; // supersampling factor, for anti-aliased edges

/* ── the artwork, in 512-unit coordinates (matches icon.svg) ───────── */

const INK   = [0x3f, 0x7a, 0x58]; // --green
const BACK  = [0x69, 0x98, 0x7d]; // the two further dots, sitting back a little
const SAGE  = [0x5b, 0x8f, 0x6a]; // --sage
const PAPER = [0xff, 0xff, 0xff];
const EDGE  = [0xe3, 0xef, 0xe4];

const RINGS = [ { r: 150, a: 0.35 }, { r: 176, a: 0.16 } ];
// drawn opaque, and over the rings, so no seam shows where a ring passes beneath
const DOTS  = [ { x: 256, y: 106, c: INK }, { x: 386, y: 331, c: BACK }, { x: 126, y: 331, c: BACK } ];
const STROKE = 9, DOT_R = 30, PLUS_W = 12, PLUS_LEN = 42;

const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);

/* distance from a point to a line segment — used for the plus strokes */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const over = (dst, src, a) => {
  for (let i = 0; i < 3; i++) dst[i] = src[i] * a + dst[i] * (1 - a);
};

/* colour of the artwork at one point in 512-space.
   `scale` shrinks the foreground about the centre for the maskable variant. */
function sample(x, y, scale) {
  // background: radial gradient centred at 30%/20%, as in icon.svg
  const gd = dist(x, y, 0.30 * 512, 0.20 * 512) / (0.95 * 512);
  const t = Math.min(1, Math.max(0, gd));
  const px = [
    PAPER[0] + (EDGE[0] - PAPER[0]) * t,
    PAPER[1] + (EDGE[1] - PAPER[1]) * t,
    PAPER[2] + (EDGE[2] - PAPER[2]) * t,
  ];

  // map the point into unscaled foreground space
  const fx = (x - 256) / scale + 256;
  const fy = (y - 256) / scale + 256;

  for (const ring of RINGS) {
    const d = Math.abs(dist(fx, fy, 256, 256) - ring.r);
    if (d <= STROKE / 2) over(px, INK, ring.a);
  }
  for (const dot of DOTS) {
    if (dist(fx, fy, dot.x, dot.y) <= DOT_R) over(px, dot.c, 1);
  }
  const plus = Math.min(
    distToSegment(fx, fy, 256, 256 - PLUS_LEN, 256, 256 + PLUS_LEN),
    distToSegment(fx, fy, 256 - PLUS_LEN, 256, 256 + PLUS_LEN, 256)
  );
  if (plus <= PLUS_W / 2) over(px, SAGE, 1);

  return px;
}

function render(size, scale) {
  const buf = Buffer.alloc(size * size * 4);
  const step = 512 / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) * step;
          const y = (py + (sy + 0.5) / SS) * step;
          const c = sample(x, y, scale);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS, o = (py * size + px) * 4;
      buf[o]     = Math.round(r / n);
      buf[o + 1] = Math.round(g / n);
      buf[o + 2] = Math.round(b / n);
      buf[o + 3] = 255;
    }
  }
  return buf;
}

/* ── minimal PNG encoder (RGBA, no interlace) ──────────────────────── */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // each scanline gets a leading filter byte (0 = none)
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── build ─────────────────────────────────────────────────────────── */

const targets = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  // maskable: Android crops to a circle, so the art shrinks into the safe zone
  { file: 'icon-512-maskable.png', size: 512, scale: 0.78 },
];

for (const t of targets) {
  const png = encodePng(render(t.size, t.scale), t.size);
  fs.writeFileSync(path.join(OUT, t.file), png);
  console.log(`${t.file.padEnd(24)} ${t.size}x${t.size}  ${(png.length / 1024).toFixed(1)} KB`);
}
