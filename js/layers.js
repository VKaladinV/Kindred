/* uses: $ $$ · openId · renderSheet · flushHeldRender */

const layers = [];     // what is covering the app, innermost last
let guarded = false;   // our one history entry is on the stack

let winding = false;   // a history.back() of our own, still in flight

function guard() {
  if (guarded) return;
  guarded = true;
  /* No URL is passed: the address never changes, so moving across this
     entry is always same-document and can never become a reload. The
     person rides along so a reload can put their page back — see boot. */
  try { history.pushState({ kindredLayer: true, person: openId }, ''); }
  catch { guarded = false; }
}

function unguard() {
  if (!guarded) return;
  guarded = false;
  winding = true;
  try { history.back(); } catch { winding = false; }
}

function openLayer(close) {
  const layer = { close };
  layers.push(layer);
  guard();
  return layer;
}

/* A layer closed by its own button, or closed for us by the browser.
   Doing nothing when it has already gone is the whole trick: the back
   press takes it off the list first, so this becomes a no-op instead of
   winding the history entry off a second time. */
function closeLayer(layer) {
  const i = layers.indexOf(layer);
  if (i < 0) return;
  layers.splice(i, 1);
  if (!layers.length) unguard();
}

window.addEventListener('popstate', () => {
  if (winding) { winding = false; return; }
  guarded = false;
  const layer = layers.pop();
  if (layer) layer.close();
  if (layers.length) guard();   // still covered — arm the next press
});

/* Every editor in the app is a native dialog, so one pass covers the lot,
   including the sign-in dialog that sync.js owns and this file never
   mentions. The lock screen is pointedly not among them: back must never
   be a way through it. */
function wireDialogLayers() {
  const held = new WeakMap();
  const obs = new MutationObserver(list => list.forEach(m => {
    const d = m.target;
    if (d.open && !held.has(d)) held.set(d, openLayer(() => d.close()));
    else if (!d.open && held.has(d)) {
      closeLayer(held.get(d));
      held.delete(d);
      /* A sync that landed while this was open has been waiting for it to
         close — closing it is the moment the page underneath is worth
         redrawing, and the only moment anything is listening for. */
      flushHeldRender();
    }
  }));
  $$('dialog.dlg').forEach(d => obs.observe(d, { attributes: true, attributeFilter: ['open'] }));
}

/* ═══════════════════════════ PERSON SHEET ════════════════ */

let sheetLayer = null;

function openSheet(id) {
  openId = id;
  /* Registered before anything is painted, because renderSheet closes the
     sheet again if the person has gone — and that has to find a layer to
     take away rather than leave one standing for a sheet that never opened. */
  sheetLayer = openLayer(closeSheet);
  $('#scrim').hidden = false;
  $('#sheet').hidden = false;
  document.body.classList.add('is-locked');
  renderSheet();
  $('#sheet-scroll').scrollTop = 0;
  $('#sheet-close').focus();
}

function closeSheet() {
  openId = null;
  $('#scrim').hidden = true;
  $('#sheet').hidden = true;
  document.body.classList.remove('is-locked');
  /* Every way of closing the sheet already comes through here — the X, the
     scrim, Escape, removing the person, renderSheet finding nobody — so
     this one line covers all of them. */
  closeLayer(sheetLayer);
  sheetLayer = null;
}

