/* uses: Store */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* how much of a person's photo the badge shows: the centre of the crop in
   fractions of the picture, and how far in it is zoomed. 1 is the widest
   square that fits, which is exactly where every older photo already sits. */
const DEFAULT_VIEW = { cx: 0.5, cy: 0.5, scale: 1 };
const MAX_ZOOM = 6;
const ORIGINAL_EDGE = 1600;

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

function renderCrop(img, view = DEFAULT_VIEW) {
  const big = Store.mode === 'localstorage' ? 360 : 512;
  const quality = Store.mode === 'localstorage' ? 0.76 : 0.86;
  const w = img.naturalWidth, h = img.naturalHeight;
  const side = Math.min(w, h) / clamp(view.scale, 1, MAX_ZOOM);
  const sx = clamp(view.cx * w - side / 2, 0, w - side);
  const sy = clamp(view.cy * h - side / 2, 0, h - side);

  const c = document.createElement('canvas');
  c.width = c.height = big;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, big, big);
  return c.toDataURL('image/jpeg', quality);
}

/* A photo is the only way into a person's page, so the avatar is the button. */
