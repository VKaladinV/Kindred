/* uses: $ el initialsOf · photos · openSheet */

function avatar(p, cls, clickable = false) {
  const wrap = el(clickable ? 'button' : 'div', cls);
  if (clickable) {
    wrap.type = 'button';
    wrap.setAttribute('aria-label', `Open ${p.name}`);
    wrap.onclick = () => openSheet(p.id);
  }
  if (photos[p.id]) {
    const img = el('img');
    img.src = photos[p.id];
    img.alt = clickable ? '' : p.name;
    img.loading = 'lazy';
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

