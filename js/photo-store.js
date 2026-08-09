/* uses: Store · blobToDataUrl thumbFromBlob dataUrlToBlob */

/* ═══════════════════════ faces, and their handles ═══════════════════════

   A photo used to be a string. Every crop was base64 inside a data URL, the
   whole lot was read into memory before the first face could be drawn, and
   `img.src = photos[id]` handed the browser a fresh ninety-thousand-character
   URI on every single repaint — so nothing was ever cached and every badge
   was decoded again each time the circle was painted.

   Now a photo is bytes, and what the app holds is a handle:

     records     id → { full, thumb, mark }   Blobs, and a fingerprint of full
     photoMarks  id → mark                    who has a face, and which one
     urls        id → { full?, thumb? }       minted once, on first draw

   The bytes live in the browser's blob store rather than the JS heap, which
   is the whole of the memory saving. The object URL is what makes the second
   saving: it is the same string on every repaint, so the browser decodes each
   face once for the session instead of once per paint.

   ── the one rule ────────────────────────────────────────────────────────
   This file is the only place in the app that keeps an object URL for a
   person's photo, and `forget` is the only place one is revoked. Revoking is
   safe because an <img> that is already laid out holds the decoded picture,
   not the URL — a revoked URL only breaks a *new* <img> built from a stale
   string, and there is no stale string to build one from, because forget
   drops the cache entry in the same breath and the next read mints a new one.

   What that rests on is that every revoke is followed by a repaint before the
   next frame. Each caller below satisfies it, and the repair pass at the
   bottom is the one that has to say so itself.
   ─────────────────────────────────────────────────────────────────────── */

const photoRecords = {};
const photoUrls = {};
let photoMarks = {};

/* The same 31-hash the sync has always used to tell two crops apart, run over
   the bytes instead of over base64, and — the point of the whole exercise —
   run once, when the picture is stored, rather than per person per flatten
   four times a sync.

   Not crypto.subtle, which would be the obvious choice and is undefined
   outside a secure context: the README offers double-clicking index.html as
   the easy way to run this, and a face must not stop being storable because
   of how the page was opened. */
async function blobMark(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let h = 0;
  for (let i = 0; i < bytes.length; i++) h = (h * 31 + bytes[i]) | 0;
  return bytes.length + ':' + (h >>> 0).toString(36);
}

function forgetUrls(id) {
  const held = photoUrls[id];
  if (!held) return;
  if (held.full) URL.revokeObjectURL(held.full);
  if (held.thumb) URL.revokeObjectURL(held.thumb);
  delete photoUrls[id];
}

const hasPhoto = id => !!photoRecords[id];

/* The small copy, for a row in a list. Falls back to the crop when there is
   no small one — a photo stored before this file existed and not yet repaired,
   or one saved in localStorage mode, where a second copy is not affordable. */
function photoUrl(id) {
  const rec = photoRecords[id];
  if (!rec) return '';
  const held = photoUrls[id] || (photoUrls[id] = {});
  if (!held.thumb) held.thumb = URL.createObjectURL(rec.thumb || rec.full);
  return held.thumb;
}

/* The crop itself, for a badge, a person's page, and the dialog preview. The
   preview has to be this one and not the small copy: adjusting the focus
   re-crops from whatever the preview is showing, and re-cropping a 256 would
   shrink the photo a little further every time somebody nudged it. */
function photoFullUrl(id) {
  const rec = photoRecords[id];
  if (!rec) return '';
  const held = photoUrls[id] || (photoUrls[id] = {});
  if (!held.full) held.full = URL.createObjectURL(rec.full);
  return held.full;
}

async function putPhoto(id, rec) {
  forgetUrls(id);
  photoRecords[id] = rec;
  if (rec.mark) photoMarks[id] = rec.mark;
  else delete photoMarks[id];
  await Store.savePhoto(id, rec);
}

/* A crop that arrived already made — from a backup, from an invitation, from
   the button on a linked person's page. The small copy and the mark are
   derived here so that everything in `records` has the same shape however it
   got there. */
async function putPhotoBlob(id, blob) {
  const [thumb, mark] = await Promise.all([thumbFromBlob(blob), blobMark(blob)]);
  await putPhoto(id, { full: blob, thumb, mark });
  return mark;
}

const putPhotoDataUrl = (id, dataUrl) => putPhotoBlob(id, dataUrlToBlob(dataUrl));

async function dropPhoto(id) {
  forgetUrls(id);
  delete photoRecords[id];
  delete photoMarks[id];
  await Store.deletePhoto(id);
}

/* One person's face becoming another's, which happens in exactly one place:
   two profiles that turn out to be the same person, being put back together
   (mergeSelves, in state.js).

   Synchronous, because setRoster is, and it runs inside the roster landing at
   the end of a sync. The write is let go of rather than waited for, the same
   way it always was.

   Blobs and the mark are copied; URLs never are. Two ids sharing one object
   URL is the single way a legitimate revoke can blank somebody else's face —
   forgetUrls(a) would leave b pointing at nothing. A fresh record for the same
   immutable bytes costs nothing and cannot do that. */
function adoptPhoto(fromId, toId) {
  const rec = photoRecords[fromId];
  if (!rec) return;
  forgetUrls(toId);
  photoRecords[toId] = { full: rec.full, thumb: rec.thumb, mark: rec.mark };
  if (rec.mark) photoMarks[toId] = rec.mark;
  Store.savePhoto(toId, photoRecords[toId]).catch(() => {});
}

/* The bytes to upload, and the mark of those exact bytes, out of a single
   read of the record. The sync records what it sent under sent[id], and that
   claim has to be true of the object that actually went — reading the mark
   from the live map and the bytes a moment later would let a crop finished in
   between be recorded as agreed while the old picture was the one uploaded.
   One read, both halves, no gap. */
async function photoBytes(id) {
  const rec = photoRecords[id];
  if (!rec || !rec.full) return null;
  return { blob: rec.full, mark: rec.mark || await blobMark(rec.full) };
}

/* A face that arrived from another device. It is written to the record and to
   disk, and deliberately NOT into photoMarks.

   That looks like an omission and is the opposite. sync() compares what it is
   about to land against a reading of memory taken *after* the photo pass; if
   the mark were already live by then, the two would agree, the sync would
   conclude nothing had changed, and the face would never be painted. Landing
   it is the job of the assignment to Kindred.photoMarks at the end of the
   sync, and this must leave that to it. */
async function landPhoto(id, blob) {
  const [thumb, mark] = await Promise.all([thumbFromBlob(blob), blobMark(blob)]);
  forgetUrls(id);
  photoRecords[id] = { full: blob, thumb, mark };
  await Store.savePhoto(id, photoRecords[id]);
  return mark;
}

/* Base64 again, for the two places that genuinely want it: the profile you
   publish, which is a column in a database, and a backup file, which is JSON.
   The published one is the small copy — it is drawn in somebody's circle, not
   framed on a page. */
const photoThumbDataUrl = id =>
  photoRecords[id] ? blobToDataUrl(photoRecords[id].thumb || photoRecords[id].full) : Promise.resolve('');

async function photosForBackup() {
  const out = {};
  for (const id of Object.keys(photoRecords)) out[id] = await blobToDataUrl(photoRecords[id].full);
  return out;
}

/* ── coming up ──────────────────────────────────────────────────────────── */

async function loadPhotoRecords() {
  const stored = await Store.loadPhotos();
  for (const id of Object.keys(stored)) {
    const rec = stored[id];
    if (!rec || !rec.full) continue;
    photoRecords[id] = rec;
    if (rec.mark) photoMarks[id] = rec.mark;
  }
}

/* Photos stored before this file existed are a crop and nothing else: no small
   copy, no mark. Making those needs a decode and two re-encodes each, which is
   not work to do while somebody is waiting to see their circle — and it does
   not need to be, because a crop on its own already draws correctly everywhere.
   So the faces go up first and the repair happens in the gaps afterwards.

   Until an id is repaired its mark is absent, which the sync reads as "no
   photo here". That is why its download branch asks hasPhoto rather than the
   marks map: asked the other way it would fetch back a picture already on disk.

   This is also the one revoker that has to arrange its own repaint — every
   other caller is followed by a render it did not have to ask for. */
function repairPhotos() {
  const owed = Object.keys(photoRecords).filter(id => !photoRecords[id].mark);
  if (!owed.length) return;

  const soon = window.requestIdleCallback || (fn => setTimeout(fn, 300));
  soon(async () => {
    let mended = 0;
    for (const id of owed) {
      const rec = photoRecords[id];
      if (!rec || rec.mark) continue;                 // seen to in the meantime
      try {
        const thumb = rec.thumb || await thumbFromBlob(rec.full);
        const mark = await blobMark(rec.full);
        forgetUrls(id);
        photoRecords[id] = { full: rec.full, thumb, mark };
        photoMarks[id] = mark;
        await Store.savePhoto(id, photoRecords[id]);
        mended++;
      } catch { /* leave it legacy; it still draws, and the next boot tries again */ }
    }
    if (mended) Kindred.render();
  });
}
