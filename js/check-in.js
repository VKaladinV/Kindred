/* uses: MAX_TOUCHES TOUCH_KINDS · $ el today · byId queueSave
   · lastTouchDate touchOn · toast · dialNumber telLink waLink
   · renderAll
*/

function markConnected(id, kind = '', toastAction = null) {
  const p = byId(id);
  if (!p) return;

  const existing = touchOn(p, today());
  if (existing) {
    if (existing.kind === kind) return;
    existing.kind = kind;
  } else {
    p.touches.push({ date: today(), kind });
    if (p.touches.length > MAX_TOUCHES) p.touches = p.touches.slice(-MAX_TOUCHES);
  }

  queueSave();
  renderAll();
  const how = TOUCH_KINDS[kind] ? ` by ${TOUCH_KINDS[kind].label.toLowerCase()}` : '';
  toast(`Noted — you connected with ${p.name.split(' ')[0]} today${how}`,
    toastAction || { label: 'Undo', run: () => undoConnected(id) });
}

/* The other half of it, for the tap you did not mean. Only today's is taken
   back: an older check-in has become part of the history rather than a slip
   of a moment ago, and quietly dropping one would be a different thing. */
function undoConnected(id) {
  const p = byId(id);
  if (!p || lastTouchDate(p) !== today()) return;
  p.touches = p.touches.filter(t => t.date !== today());
  queueSave();
  renderAll();
  toast(`Taken back — nothing noted with ${p.name.split(' ')[0]} today`);
}

/* ── how you connected ─────────────────────────────────────────── */

let howPersonId = null;

function howDialog(id) {
  const p = byId(id);
  if (!p) return;
  howPersonId = id;

  const current = touchOn(p, today())?.kind || '';
  $('#dlg-how-title').textContent = `How did you connect with ${p.name.split(' ')[0]}?`;
  /* Every option records either way. Only the jumping-off part needs a
     number, so that is the only part the hint promises — and now only as an
     offer afterwards, not something this tap does on its own. */
  $('#how-hint').textContent = dialNumber(p.contact)
    ? 'WhatsApp and a call will offer to take you there, once it is noted.'
    : 'No number saved for them, so these only make a note.';

  const pick = $('#how-pick');
  pick.textContent = '';
  Object.entries(TOUCH_KINDS).forEach(([key, v]) => {
    const b = el('button', 'type-opt' + (key === current ? ' is-on' : ''));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(key === current));
    b.append(el('span', 'glyph', v.glyph), el('span', null, v.label));
    b.onclick = () => chooseHow(key);
    pick.append(b);
  });

  $('#dlg-how').showModal();
}

/* The note is made before leaving, so it survives whether or not you come
   back — the app cannot watch you send the message, and waiting to be told
   would mean losing the check-in every time you got distracted.

   Leaving itself used to happen in the same tap, straight to WhatsApp or the
   dialler, before the person had a chance to mean it. Now the tap only ever
   tags it, and going is the toast's offer rather than a foregone conclusion —
   letting it pass is answering "no", not missing a step, and the tag already
   made stands either way. */
function chooseHow(kind) {
  const p = byId(howPersonId);
  if (!p) return;
  const dial = dialNumber(p.contact);
  const open = kind === 'whatsapp' && dial ? { label: 'Open WhatsApp', run: () => openOut(waLink(dial)) }
             : kind === 'call' && dial     ? { label: 'Call', run: () => openOut(telLink(dial)) }
             : null;
  markConnected(p.id, kind, open);
  $('#dlg-how').close();
}

function openOut(href) {
  const a = el('a');
  a.href = href;
  /* tel: is handed to the phone and never yields a window to secure. wa.me is
     a real navigation, so it leaves in its own tab. */
  if (href.startsWith('http')) { a.target = '_blank'; a.rel = 'noopener'; }
  document.body.append(a);
  a.click();
  a.remove();
}

/* ═══════════════════════ LINKING TWO PEOPLE ════════════════
   sync.js is optional — the app runs unchanged without it — so nothing here
   may assume it is loaded, and everything degrades to the app as it was. */

