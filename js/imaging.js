/* uses: Store */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* how much of a person's photo the badge shows: the centre of the crop in
   fractions of the picture, and how far in it is zoomed. 1 is the widest
   square that fits, which is exactly where every older photo already sits. */
const DEFAULT_VIEW = { cx: 0.5, cy: 0.5, scale: 1 };
const MAX_ZOOM = 6;
const ORIGINAL_EDGE = 1600;

/* The small copy. A face is drawn at two sizes in this app and only two: the
   badge in the circle, which at the largest slider setting on a dense phone
   screen asks for a little over five hundred real pixels, and the row in
   Today or the prayer list, which asks for about a hundred and twenty. One
   picture cannot serve both without wasting one of them — the row was
   decoding a full crop to draw it at a fortieth of the area.

   256 is what the row wants with room to spare, and it is also what travels:
   it is the copy a linked partner receives, small enough to sit inside a
   database row and good enough to be the face in their circle. */
const THUMB_EDGE = 256;
const THUMB_QUALITY = 0.72;

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('That does not look like an image'));
    img.onload = () => resolve(img);
    img.src = src;
  });
}

/* Kept whole, only made smaller — this is what the crop is taken from, so
   zooming onto one face in a crowd still has pixels to work with. */
function downscale(img, maxEdge = ORIGINAL_EDGE, quality = 0.82) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const f = Math.min(1, maxEdge / Math.max(w, h));
  if (f === 1) return img.src;
  const c = document.createElement('canvas');
  c.width = Math.round(w * f);
  c.height = Math.round(h * f);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

/* The square the view picks out, drawn at whatever size is asked for. Both
   copies are cut from the source picture rather than one from the other:
   shrinking the 512 to make the 256 would carry its compression across, and
   drawing twice costs a millisecond once, when a photo is chosen. */
function cropCanvas(img, view, size) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const side = Math.min(w, h) / clamp(view.scale, 1, MAX_ZOOM);
  const sx = clamp(view.cx * w - side / 2, 0, w - side);
  const sy = clamp(view.cy * h - side / 2, 0, h - side);

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return c;
}

const canvasBlob = (canvas, quality) =>
  new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));

/* What a chosen photo becomes: the crop, and a small copy of it.

   Blobs rather than the data URLs this used to hand back. A data URL is
   base64, which is a third larger than the bytes it stands for before it is
   even a string — and a JS string is two bytes a character, so a 60KB
   photograph was costing 160KB of memory for as long as the app was open,
   times everyone in the circle. The bytes live outside the heap now and the
   app holds a handle. */
async function renderCropBlobs(img, view = DEFAULT_VIEW) {
  const lean = Store.mode === 'localstorage';
  const big = lean ? 360 : 512;
  const quality = lean ? 0.76 : 0.86;

  const full = await canvasBlob(cropCanvas(img, view, big), quality);
  /* Not in localStorage mode. There the crop is already made smaller to fit
     the budget, and a second copy of every face would spend that budget
     twice — photoUrl falls back to the crop when there is no small copy. */
  const thumb = lean ? null : await canvasBlob(cropCanvas(img, view, THUMB_EDGE), THUMB_QUALITY);
  return { full, thumb };
}

/* The small copy on its own, for a crop that arrived already made — from
   another device, from an invitation, from a backup, or from before this
   app kept two sizes. The crop is square, so the default view is the whole
   of it. */
async function thumbFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    return await canvasBlob(cropCanvas(img, DEFAULT_VIEW, THUMB_EDGE), THUMB_QUALITY);
  } catch {
    return null;                 // a picture that will not decode still has its crop
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* Base64 in, bytes out — without fetch(), which is the obvious way to do this
   and the one that cannot be relied on for a page opened by double-clicking
   the file. atob is everywhere. */
function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: (head.match(/:(.+?);/) || [])[1] || 'image/jpeg' });
}

/* And back again, for the two places base64 is still the right answer: a
   backup file, which is JSON, and the profile you publish, which is a
   database column. */
function blobToDataUrl(blob) {
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res('');
    fr.readAsDataURL(blob);
  });
}

/* A photo is the only way into a person's page, so the avatar is the button. */
