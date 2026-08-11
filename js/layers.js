/* uses: $ $$ · openId · renderSheet · flushHeldRender */

/* guard()'s pushState carries no URL because a layer is never meant to move
   the page — but the browser's own scroll restoration is a second, older
   promise-breaker: left on 'auto', it can shift the scroll position of its
   own accord on a back navigation, asynchronously and on no schedule this
   file controls. A flight built from rects measured before that shift lands
   somewhere the page has since scrolled out from under it. Off, once, for
   the life of the app — nothing here restores a scroll position on its own,
   so there is never anything for the browser's guess to be better than. */
history.scrollRestoration = 'manual';

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
let heroGhost = null;   // the photo mid-flight from a badge to the sheet, if any

/* .badge already carries data-id (badge.js), and this is the same lookup
   circle-flip.js already uses to find one — iterate and match, rather than
   build a querySelector string out of an id that has never been promised
   to be CSS-selector-safe. */
function findBadgePhoto(id) {
  for (const b of document.querySelectorAll('.badge[data-id]')) {
    if (b.dataset.id === id) return b.querySelector('.badge-photo');
  }
  return null;
}

function clearHeroGhost() {
  if (heroGhost) { heroGhost.remove(); heroGhost = null; }
}

/* Carries the clone from over the badge to over the real .person-photo, then
   hands off to it. The same invert-then-clear transform trick as flipCircle
   and flipDay: park the clone at its destination, transform it back to where
   the badge was, force a reflow, then clear the transform and let the
   stylesheet's own transition carry it home — the one mechanism the app's
   reduced-motion rule (lock.css) already knows how to collapse. */
function flyHeroPhoto(clone, srcRect) {
  const dest = $('.person-photo', $('#sheet'));
  const destRect = dest && dest.getBoundingClientRect();
  if (!dest || !destRect.width || !destRect.height) {
    $('#sheet').classList.remove('is-arriving');
    return;
  }

  clone.classList.add('hero-photo');
  /* --frame drives the initials glyph's font-size (circle.css). The clone
     has left the .badge-frame that it inherited that from, so it is restated
     here from the one measurement that already equals it: the photo's own
     width. */
  clone.style.setProperty('--frame', srcRect.width + 'px');
  clone.style.position = 'fixed';
  clone.style.inset = 'auto';
  clone.style.left = destRect.left + 'px';
  clone.style.top = destRect.top + 'px';
  clone.style.width = destRect.width + 'px';
  clone.style.height = destRect.height + 'px';

  const scale = srcRect.width / destRect.width;
  const dx = (srcRect.left + srcRect.width / 2) - (destRect.left + destRect.width / 2);
  const dy = (srcRect.top + srcRect.height / 2) - (destRect.top + destRect.height / 2);
  clone.style.transition = 'none';
  clone.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;

  document.body.append(clone);
  heroGhost = clone;

  void clone.offsetWidth;   // the same forced reflow flipCircle/flipDay use
  clone.style.transition = '';
  clone.style.transform = 'none';

  clone.addEventListener('transitionend', function land(e) {
    if (e.target !== clone || e.propertyName !== 'transform') return;
    clone.removeEventListener('transitionend', land);
    if (heroGhost === clone) { clone.remove(); heroGhost = null; }
    /* The clone was fully opaque for the whole flight; the real photo has to
       take over at the same opacity in the same frame it disappears, not
       fade up from nothing the way photo-in would replay it. Removing
       is-arriving lifts the override that's currently holding it at 0, and
       with nothing else said an animation restarting from its own 0% is
       exactly what CSS does the instant that happens — so it's told here,
       once, to skip straight to where it's staying. */
    const realPhoto = $('.person-photo', $('#sheet'));
    if (realPhoto) { realPhoto.style.animation = 'none'; realPhoto.style.opacity = '1'; }
    $('#sheet').classList.remove('is-arriving');
  });
}

function openSheet(id) {
  openId = id;
  /* A second tap — another badge, or this one again — should not leave an
     earlier flight stuck mid-air. */
  clearHeroGhost();

  /* Taken before anything else moves: once the grid dims and the sheet
     opens, this is the last moment the badge's own position is the one the
     photo should be measured against. Not found — opened from a list row
     that is not a badge, or restored from history before the grid has
     painted — and the sheet just opens the way it always has. */
  const srcPhoto = findBadgePhoto(id);
  const srcRect = srcPhoto && srcPhoto.getBoundingClientRect();
  const clone = srcPhoto ? srcPhoto.cloneNode(true) : null;

  const sheet = $('#sheet');
  sheet.classList.toggle('is-arriving', !!clone);
  /* Stays for the whole open, not just until the photo lands — the sheet's
     own slide-in must never run at all this time, or it goes on carrying
     .person-photo after flyHeroPhoto has already measured and aimed for it. */
  sheet.classList.toggle('is-carried', !!clone);
  $('#grid')?.classList.add('is-receding');
  $('#grid-future')?.classList.add('is-receding');

  /* Registered before anything is painted, because renderSheet closes the
     sheet again if the person has gone — and that has to find a layer to
     take away rather than leave one standing for a sheet that never opened. */
  sheetLayer = openLayer(closeSheet);
  $('#scrim').hidden = false;
  sheet.hidden = false;
  document.body.classList.add('is-locked');
  renderSheet();
  $('#sheet-scroll').scrollTop = 0;
  $('#sheet-close').focus();

  if (clone) flyHeroPhoto(clone, srcRect);
}

function closeSheet() {
  openId = null;
  clearHeroGhost();
  $('#sheet').classList.remove('is-arriving');
  $('#sheet').classList.remove('is-carried');
  $('#grid')?.classList.remove('is-receding');
  $('#grid-future')?.classList.remove('is-receding');
  $('#scrim').hidden = true;
  $('#sheet').hidden = true;
  document.body.classList.remove('is-locked');
  /* Every way of closing the sheet already comes through here — the X, the
     scrim, Escape, removing the person, renderSheet finding nobody — so
     this one line covers all of them. */
  closeLayer(sheetLayer);
  sheetLayer = null;
}

