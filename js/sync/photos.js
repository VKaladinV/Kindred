/* uses: BUCKET · api */

/* ─────────────────────────── photos ─────────────────────────── */

const photoPath = (uid, id) => `${uid}/${id}.jpg`;

async function listRemotePhotos(uid) {
  const r = await api(`/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: `${uid}/`, limit: 1000 }),
  });
  if (!r.ok) return null;
  const items = await r.json();
  return new Set(items.map(i => i.name.replace(/\.jpg$/, '')));
}

/* Bytes in, bytes out. Both directions used to turn a picture into base64 and
   back again on the way past — the app stored data URLs, so an upload decoded
   one to send it and a download encoded one to keep it. Photos are stored as
   bytes now, and this is what that saves at the wire. */
async function uploadPhoto(uid, id, blob) {
  const r = await api(`/storage/v1/object/${BUCKET}/${photoPath(uid, id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: blob,
  });
  return r.ok;
}

async function downloadPhoto(uid, id) {
  const r = await api(`/storage/v1/object/${BUCKET}/${photoPath(uid, id)}`);
  if (!r.ok) return null;
  return r.blob();
}

async function deletePhoto(uid, id) {
  await api(`/storage/v1/object/${BUCKET}/${photoPath(uid, id)}`, { method: 'DELETE' }).catch(() => {});
}
