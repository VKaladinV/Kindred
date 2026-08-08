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

async function uploadPhoto(uid, id, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
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
  const blob = await r.blob();
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res(null);
    fr.readAsDataURL(blob);
  });
}

async function deletePhoto(uid, id) {
  await api(`/storage/v1/object/${BUCKET}/${photoPath(uid, id)}`, { method: 'DELETE' }).catch(() => {});
}
