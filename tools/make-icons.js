/* Builds the app icons from the logo artwork.
   Android (Bubblewrap/TWA) and iOS both refuse SVG icons, so these PNGs are
   what make the app installable.

   Put the logo at  tools/logo-source.png  then run from the project root:

       node tools/make-icons.js

   It trims the surrounding whitespace, squares the artwork up, and writes
   icon-32 / icon-192 / icon-512 plus a maskable variant with the padding
   Android needs so nothing important is cropped away.

   No dependencies — PNG decoding and encoding both use Node's zlib. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(__dirname, 'logo-source.png');

/* ══════════════════════ PNG decode ══════════════════════ */

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG file.');

  let width, height, depth, colorType, palette = null, trns = null;
  const idat = [];

  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('Interlaced PNGs are not supported — re-save without interlacing.');
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    p += 12 + len;
  }

  if (depth !== 8) throw new Error(`Only 8-bit PNGs are supported (this one is ${depth}-bit). Re-save as 8-bit.`);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('Unsupported PNG colour type ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const lines = Buffer.alloc(height * stride);

  // undo the per-scanline filters
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = lines.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
  }

  // normalise everything to RGBA
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    let r, g, b, a = 255;
    const o = i * channels;
    if (colorType === 0) { r = g = b = lines[o]; }
    else if (colorType === 2) { r = lines[o]; g = lines[o + 1]; b = lines[o + 2]; }
    else if (colorType === 3) {
      const idx = lines[o];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      if (trns && idx < trns.length) a = trns[idx];
    }
    else if (colorType === 4) { r = g = b = lines[o]; a = lines[o + 1]; }
    else { r = lines[o]; g = lines[o + 1]; b = lines[o + 2]; a = lines[o + 3]; }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }

  return { width, height, data: out };
}

/* ══════════════════════ PNG encode ══════════════════════ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = b => {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
};

/* Pick a filter per scanline using the standard minimum-sum-of-absolute-
   differences heuristic. On a smooth gradient this is the difference
   between a ~300 KB icon and a ~70 KB one. */
function filterScanline(cur, prev, stride, bpp) {
  const cands = [];
  for (let f = 0; f < 5; f++) {
    const line = Buffer.alloc(stride);
    let score = 0;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v;
      if (f === 0) v = cur[i];
      else if (f === 1) v = cur[i] - a;
      else if (f === 2) v = cur[i] - b;
      else if (f === 3) v = cur[i] - ((a + b) >> 1);
      else v = cur[i] - paeth(a, b, c);
      v &= 0xff;
      line[i] = v;
      score += v < 128 ? v : 256 - v;
    }
    cands.push({ f, line, score });
  }
  return cands.reduce((best, x) => (x.score < best.score ? x : best));
}

/* App icons are written as RGB: every pixel is opaque, so an alpha channel
   would be a quarter of the file carrying no information. The in-app mark
   keeps its alpha so it can sit on any background. */
function encodePng(rgba, size, keepAlpha = false) {
  const bpp = keepAlpha ? 4 : 3;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = keepAlpha ? 6 : 2;

  const stride = size * bpp;
  let pix = rgba;
  if (!keepAlpha) {
    pix = Buffer.alloc(stride * size);
    for (let i = 0, n = size * size; i < n; i++) {
      pix[i * 3] = rgba[i * 4];
      pix[i * 3 + 1] = rgba[i * 4 + 1];
      pix[i * 3 + 2] = rgba[i * 4 + 2];
    }
  }

  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const cur = pix.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pix.subarray((y - 1) * stride, y * stride) : null;
    const { f, line } = filterScanline(cur, prev, stride, bpp);
    raw[y * (stride + 1)] = f;
    line.copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ══════════════════════ shaping ══════════════════════ */

/* The logo arrives on a large white canvas. Find what is actually drawn,
   then take the smallest square that holds all of it. */
function contentSquare(img) {
  const { width: w, height: h, data } = img;
  const bg = [data[0], data[1], data[2]], bgA = data[3];
  const differs = i => {
    const a = data[i * 4 + 3];
    if (bgA < 8) return a > 8;                       // transparent canvas
    return Math.abs(data[i * 4] - bg[0]) > 12 ||
           Math.abs(data[i * 4 + 1] - bg[1]) > 12 ||
           Math.abs(data[i * 4 + 2] - bg[2]) > 12 || a < 248;
  };

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (differs(y * w + x)) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('The source image looks blank.');

  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const size = Math.max(cw, ch);
  return {
    x: Math.round(x0 + cw / 2 - size / 2),
    y: Math.round(y0 + ch / 2 - size / 2),
    size,
    trimmed: `${w}x${h} → ${cw}x${ch} at (${x0},${y0})`,
  };
}

/* Area-average downscale: each output pixel is the mean of the source
   pixels it covers, which is what keeps fine strands from breaking up. */
function resample(img, rect, out, inset, bgColour) {
  const dst = Buffer.alloc(out * out * 4);
  const pad = Math.round(out * inset);
  const draw = out - pad * 2;
  const scale = rect.size / draw;

  // with no background colour the buffer stays zeroed, i.e. transparent
  if (bgColour) {
    for (let i = 0; i < out * out; i++) {
      dst[i * 4] = bgColour[0]; dst[i * 4 + 1] = bgColour[1];
      dst[i * 4 + 2] = bgColour[2]; dst[i * 4 + 3] = 255;
    }
  }

  for (let oy = 0; oy < draw; oy++) {
    for (let ox = 0; ox < draw; ox++) {
      const sx0 = rect.x + ox * scale, sx1 = sx0 + scale;
      const sy0 = rect.y + oy * scale, sy1 = sy0 + scale;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        if (sy < 0 || sy >= img.height) continue;
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          if (sx < 0 || sx >= img.width) continue;
          const o = (sy * img.width + sx) * 4;
          const al = img.data[o + 3] / 255;
          r += img.data[o] * al; g += img.data[o + 1] * al; b += img.data[o + 2] * al;
          a += al; n++;
        }
      }
      const o = ((oy + pad) * out + ox + pad) * 4;
      if (!n) continue;
      const cover = a / n;
      if (!bgColour) {                       // keep the transparency
        if (a < 0.004) { dst[o + 3] = 0; continue; }
        dst[o]     = Math.round(r / a);
        dst[o + 1] = Math.round(g / a);
        dst[o + 2] = Math.round(b / a);
        dst[o + 3] = Math.round(cover * 255);
      } else if (a < 0.004) {                // fully transparent source area
        dst[o] = bgColour[0]; dst[o + 1] = bgColour[1]; dst[o + 2] = bgColour[2];
        dst[o + 3] = 255;
      } else {                               // blend against the flat background
        dst[o]     = Math.round((r / a) * cover + bgColour[0] * (1 - cover));
        dst[o + 1] = Math.round((g / a) * cover + bgColour[1] * (1 - cover));
        dst[o + 2] = Math.round((b / a) * cover + bgColour[2] * (1 - cover));
        dst[o + 3] = 255;
      }
    }
  }
  return dst;
}

/* ══════════════════════ build ══════════════════════ */

if (!fs.existsSync(SOURCE)) {
  console.error(`\n  No logo found at tools/logo-source.png\n\n  Save the logo there as an 8-bit PNG, then run this again.\n`);
  process.exit(1);
}

const img = decodePng(fs.readFileSync(SOURCE));
const rect = contentSquare(img);
const BG = [255, 255, 255]; // the logo sits on white

console.log(`source ${SOURCE.replace(ROOT + path.sep, '')}  ${img.width}x${img.height}`);
console.log(`trimmed to content: ${rect.trimmed}  → square ${rect.size}px\n`);

const targets = [
  // a little air so the circle and the flying seeds never touch the edge
  { file: 'icon-32.png',           size: 32,  inset: 0.04 },
  { file: 'icon-192.png',          size: 192, inset: 0.04 },
  { file: 'icon-512.png',          size: 512, inset: 0.04 },
  // Android crops maskable icons to a shape, so the art pulls into the safe zone
  { file: 'icon-512-maskable.png', size: 512, inset: 0.13 },
  // the mark used inside the app — transparent, so it sits on light or dark
  { file: 'logo-mark.png',         size: 256, inset: 0, alpha: true },
];

for (const t of targets) {
  const pixels = resample(img, rect, t.size, t.inset, t.alpha ? null : BG);
  const png = encodePng(pixels, t.size, !!t.alpha);
  fs.writeFileSync(path.join(ROOT, t.file), png);
  console.log(`${t.file.padEnd(24)} ${t.size}x${t.size}  ${(png.length / 1024).toFixed(1)} KB${t.alpha ? '  (transparent)' : ''}`);
}
