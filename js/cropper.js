/* uses: $ · Store
   · DEFAULT_VIEW MAX_ZOOM clamp downscale loadImage readImage renderCrop
   · toast
   · editingPersonId holdPhoto paintPhotoPreview pendingOriginal
*/

let cropping = null;   // { img, view, onDone }

function cropGeometry() {
  const { img, view } = cropping;
  const stage = $('#crop-stage');
  const S = stage.clientWidth;
  const base = S / Math.min(img.naturalWidth, img.naturalHeight);
  const z = clamp(view.scale, 1, MAX_ZOOM);
  const dispW = img.naturalWidth * base * z;
  const dispH = img.naturalHeight * base * z;
  return {
    S, dispW, dispH, z,
    tx: clamp(S / 2 - view.cx * dispW, S - dispW, 0),
    ty: clamp(S / 2 - view.cy * dispH, S - dispH, 0),
  };
}

function paintCrop() {
  if (!cropping) return;
  const g = cropGeometry();
  if (!g.S) return;

  /* fold the clamping back into the view, so dragging into a corner and
     then zooming does not spring the picture somewhere unexpected */
  cropping.view.scale = g.z;
  cropping.view.cx = (g.S / 2 - g.tx) / g.dispW;
  cropping.view.cy = (g.S / 2 - g.ty) / g.dispH;

  const img = $('#crop-img');
  img.style.width = g.dispW + 'px';
  img.style.height = g.dispH + 'px';
  img.style.transform = `translate(${g.tx}px, ${g.ty}px)`;
  $('#crop-zoom').value = String(Math.round(g.z * 100));
}

/* zoom while holding whatever is under (px, py) still — so you can put a
   face under your finger and grow it, rather than chasing it off-screen */
function zoomCropAt(nextScale, px, py) {
  const g = cropGeometry();
  const fx = (px - g.tx) / g.dispW;
  const fy = (py - g.ty) / g.dispH;
  const z = clamp(nextScale, 1, MAX_ZOOM);
  const ratio = z / g.z;
  cropping.view.scale = z;
  cropping.view.cx = fx + (g.S / 2 - px) / (g.dispW * ratio);
  cropping.view.cy = fy + (g.S / 2 - py) / (g.dispH * ratio);
  paintCrop();
}

async function openCropper(src, view, onDone) {
  let img;
  try { img = await loadImage(src); }
  catch (err) { return toast(err.message || 'Could not use that image'); }

  cropping = { img, view: { ...DEFAULT_VIEW, ...view }, onDone };
  $('#crop-img').src = src;
  $('#dlg-crop').showModal();
  paintCrop();   // the stage only has a width once it is open, and now it is
}

function closeCropper() {
  cropping = null;
  $('#crop-img').removeAttribute('src');
  $('#dlg-crop').close();
}

function wireCropper() {
  const stage = $('#crop-stage');
  const pointers = new Map();
  let pinchFrom = null;

  const stagePoint = e => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  stage.addEventListener('pointerdown', e => {
    if (!cropping) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, stagePoint(e));
    if (pointers.size === 2) pinchFrom = { ...spread(), scale: cropping.view.scale };
  });

  stage.addEventListener('pointermove', e => {
    if (!cropping || !pointers.has(e.pointerId)) return;
    const was = pointers.get(e.pointerId);
    const now = stagePoint(e);
    pointers.set(e.pointerId, now);

    if (pointers.size === 2 && pinchFrom) {
      const { dist, mid } = spread();
      if (pinchFrom.dist > 0) zoomCropAt(pinchFrom.scale * (dist / pinchFrom.dist), mid.x, mid.y);
      return;
    }
    const g = cropGeometry();
    cropping.view.cx -= (now.x - was.x) / g.dispW;
    cropping.view.cy -= (now.y - was.y) / g.dispH;
    paintCrop();
  });

  const release = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchFrom = null;
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  /* the same nudge, without a pointer — and +/- to zoom, since the slider
     is a tab away */
  const KEYS = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  stage.addEventListener('keydown', e => {
    if (!cropping) return;
    if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault();
      const g = cropGeometry();
      zoomCropAt(cropping.view.scale * (e.key === '-' ? 1 / 1.12 : 1.12), g.S / 2, g.S / 2);
      return;
    }
    const step = KEYS[e.key];
    if (!step) return;
    e.preventDefault();
    const g = cropGeometry();
    const by = e.shiftKey ? 40 : 12;
    cropping.view.cx -= (step[0] * by) / g.dispW;
    cropping.view.cy -= (step[1] * by) / g.dispH;
    paintCrop();
  });

  stage.addEventListener('wheel', e => {
    if (!cropping) return;
    e.preventDefault();
    const p = stagePoint(e);
    zoomCropAt(cropping.view.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), p.x, p.y);
  }, { passive: false });

  $('#crop-zoom').oninput = e => {
    if (!cropping) return;
    const g = cropGeometry();
    zoomCropAt(Number(e.target.value) / 100, g.S / 2, g.S / 2);
  };

  $('#btn-crop-reset').onclick = () => {
    if (!cropping) return;
    cropping.view = { ...DEFAULT_VIEW };
    paintCrop();
  };

  $('#btn-crop-cancel').onclick = closeCropper;
  $('#dlg-crop').addEventListener('close', () => { cropping = null; });

  $('#form-crop').onsubmit = e => {
    e.preventDefault();
    if (!cropping) return;
    const { img, view, onDone } = cropping;
    const cropped = renderCrop(img, view);
    closeCropper();
    onDone(cropped, { ...view });
  };

  window.addEventListener('resize', () => { if (cropping) paintCrop(); });
}

/* Picking a photo and moving an existing one land in the same place: crop,
   then hold on to the uncropped picture so the focus can be moved again. */
async function pickPhoto(file) {
  try {
    const img = await loadImage(await readImage(file));
    const src = downscale(img);
    openCropper(src, DEFAULT_VIEW, (cropped, view) => {
      holdPhoto(cropped, { src, view });
      paintPhotoPreview(cropped, $('#f-name').value);
    });
  } catch (err) {
    toast(err.message || 'Could not use that image');
  }
}

async function adjustPhoto() {
  const stored = pendingOriginal !== undefined
    ? pendingOriginal
    : (editingPersonId ? await Store.loadOriginal(editingPersonId) : null);

  /* No original kept — photos from before this existed, or a browser with
     no room for them. The square is still worth cropping into. */
  const shown = $('#photo-preview img')?.src;
  const src = stored?.src || shown;
  if (!src) return;

  openCropper(src, stored?.src ? stored.view : DEFAULT_VIEW, (cropped, view) => {
    holdPhoto(cropped, { src, view });
    paintPhotoPreview(cropped, $('#f-name').value);
  });
}

