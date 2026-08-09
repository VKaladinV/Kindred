/* uses: $ el initialsOf · shared · photoFullUrl photoUrl · openSheet */

/* A face, in this order: the one you cropped, then the one they published,
   then their initials.

   Yours first is the whole of the rule. Cropping a photo of somebody is a
   deliberate act — you chose that picture and you chose what of it to show —
   and theirs changes when they change it. A published face filling in where
   you never got round to one is a kindness; the same face quietly replacing
   the one you sat and framed is not.

   Reaching for their published photo at all is the point of publishing one.
   It has been travelling in every payload since linking existed (projectSelf,
   in sync.js) and arriving in `shared` on every sync, and nothing had ever
   read it — so somebody could link with you, put their face on their own
   profile, and still show up in your circle as two grey letters.

   `tier` is which copy to ask for. 'thumb' is the small one, for the rows in
   Today and the prayer list: they draw a face at about forty pixels and were
   decoding a full crop to do it. Everything else — the badge, the person's
   page — wants the crop, because at the largest slider setting on a dense
   screen a badge asks for a little over five hundred real pixels, which is
   what the crop is cut to and exactly why it is cut to that.

   Their published face is the one picture here still passed as base64. It is
   about sixteen kilobytes, there are only ever a handful of them, and they
   are already in memory as strings — turning each into a blob would put an
   async step inside a function that has to answer now, and buy nothing. */
function avatar(p, cls, clickable = false, tier = 'full') {
  const wrap = el(clickable ? 'button' : 'div', cls);
  if (clickable) {
    wrap.type = 'button';
    wrap.setAttribute('aria-label', `Open ${p.name}`);
    wrap.onclick = () => openSheet(p.id);
  }
  const mine = tier === 'thumb' ? photoUrl(p.id) : photoFullUrl(p.id);
  const src = mine || (p.linkedUid && shared[p.linkedUid]?.photo) || '';
  if (src) {
    const img = el('img');
    img.src = src;
    img.alt = clickable ? '' : p.name;
    img.loading = 'lazy';
    /* The same string comes back on every repaint now, so the browser can
       decode a face once for the session rather than once per paint — and
       this keeps that decode off the paint that asked for it. */
    img.decoding = 'async';
    wrap.append(img);
  } else {
    wrap.append(el('span', 'initials', initialsOf(p.name)));
  }
  return wrap;
}

/* ─────────────────────────── toast ─────────────────────────── */

let toastTimer = null;

/* An optional { label, run } puts one action in the toast — for the moment
   right after a tap, when taking it back should cost no hunting. */
function toast(msg, action) {
  const t = $('#toast');
  t.textContent = msg;
  if (action) {
    const b = el('button', 'toast-do', action.label);
    b.type = 'button';
    b.onclick = () => { clearTimeout(toastTimer); t.hidden = true; action.run(); };
    t.append(b);
  }
  t.hidden = false;
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(toastTimer);
  /* Something to read and reach for needs longer than something to notice. */
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 2800);
}

/* ═══════════════════════════ RENDER: CIRCLE ════════════════ */

