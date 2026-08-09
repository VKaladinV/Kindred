/* uses: CADENCES GROUPS KINDS TYPES · $ $$ el today · Store
   · byId flushSave me notifyMutate openId queueSave removeFromRoster saveRoster
   · dropPhoto · dueFromGestation · clamp · toast
   · SIZE_MIN applyBadgeSize badgeSizePref phone · hexCols hexMetrics
   · markCircleFlip · paintFilterDialog · renderCircle
   · goToMonth monthKey shiftMonth
   · closeSheet openSheet wireDialogLayers · renderSheet · chooseHow
   · checkClaimedInvites clearPendingJoin copyInviteLink finishJoin joining sendInviteOnWhatsApp shareInviteLink
   · countryCode editingPersonId fillFromContact holdPhoto paintPhotoPreview personDialog showPending
   · adjustPhoto pickPhoto wireCropper · savePerson
   · editingEvent paintBabyFields paintGestationFrom saveEvent setEventType
   · saveAnswered saveReleased saveRemoved
   · exportAll importAll
   · enableNotifications nudgeIfDue paintNotifState
   · paintMfaState
   · LOCK_GRACE checkBio
   · hiddenAt locked paintLockState pinDialog savePin showLock toggleBio
   · activeView flushHeldRender renderAll switchView · checkForUpdate
*/

function fillSelects() {
  const gp = $('#f-groups');
  GROUPS.forEach(g => {
    const b = el('button', 'chip');
    b.type = 'button';
    b.dataset.group = g;
    b.setAttribute('aria-pressed', 'false');
    b.textContent = g;
    b.onclick = () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-on', on);
    };
    gp.append(b);
  });

  const c = $('#f-cadence');
  CADENCES.forEach(([days, label]) => c.append(new Option(label, String(days))));
  const k = $('#e-kind');
  Object.entries(KINDS).forEach(([key, v]) => k.append(new Option(`${v.glyph}  ${v.label}`, key)));

  const pick = $('#type-pick');
  Object.entries(TYPES).forEach(([key, v]) => {
    const b = el('button', 'type-opt');
    b.type = 'button';
    b.dataset.type = key;
    b.setAttribute('role', 'radio');
    b.append(el('span', 'glyph', v.glyph), el('span', null, v.label));
    b.onclick = () => setEventType(key);
    pick.append(b);
  });
}

function wire() {
  $$('.nav-item[data-view]').forEach(t => { t.onclick = () => switchView(t.dataset.view); });

  /* Both, because neither covers the ground on its own: pagehide is what a
     desktop tab closing fires, and on a phone an app is far more often
     switched away from than closed — which is visibilitychange and nothing
     else. A save owed and not yet written is paid here. */
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });

  $('#btn-add').onclick = () => personDialog(null, { future: activeView === 'future' });
  $('#btn-add-first').onclick = () => personDialog(null);
  $('#btn-add-future-first').onclick = () => personDialog(null, { future: true });
  $('#form-person').onsubmit = savePerson;
  $('#btn-person-cancel').onclick = () => $('#dlg-person').close();

  $('#photo-input').onchange = e => {
    const file = e.target.files?.[0];
    if (file) pickPhoto(file);
    e.target.value = '';   // so choosing the same file twice still fires
  };
  $('#btn-me').onclick = () => { if (me) openSheet(me.id); else personDialog(null, { self: true }); };

  $('#btn-invite-close').onclick = () => $('#dlg-invite').close();
  $('#btn-invite-wa').onclick = sendInviteOnWhatsApp;
  $('#btn-invite-share').onclick = shareInviteLink;
  $('#btn-invite-copy').onclick = copyInviteLink;
  /* The link card itself, for the hand that goes straight for the thing
     rather than for a button about it. */
  $('#invite-link').onclick = copyInviteLink;

  $('#btn-join-yes').onclick = finishJoin;
  $('#btn-join-no').onclick = () => {
    /* Declining before claiming leaves the invitation unused, so it can still
       be opened later or simply expire. Declining after only defers saying
       who they are — the link itself is already made. */
    if (joining?.needsAccount) clearPendingJoin();
    $('#dlg-join').close();
    joining = null;
  };

  $('#btn-contact-pick').onclick = fillFromContact;
  $('#photo-adjust').onclick = adjustPhoto;
  $('#photo-clear').onclick = () => {
    holdPhoto(null, null);
    paintPhotoPreview(showPending(null), $('#f-name').value);
    $('#photo-input').value = '';
  };
  /* A crop cut and then thought better of still has its bytes held open by
     the preview. Nothing else lets go of them — savePerson only runs on the
     way out through Save — so closing the dialog by any road at all is where
     that has to happen, and there are four of those roads: Cancel, Escape,
     the backdrop, and a back press unwinding the layer.

     Watching the attribute rather than listening for `close`, which is the
     same choice wireDialogLayers made and for the same reason: once the
     cropper has been opened over this dialog, the close event stops arriving
     — the nested modal and the history entry between them see to that — while
     the open attribute is simply the truth and is never not told. */
  new MutationObserver(() => { if (!$('#dlg-person').open) showPending(null); })
    .observe($('#dlg-person'), { attributes: true, attributeFilter: ['open'] });
  wireCropper();

  $('#btn-delete-person').onclick = async () => {
    const p = byId(editingPersonId);
    if (!p) return;
    const ask = p.isSelf
      ? 'Remove your profile and everything on it? This cannot be undone.'
      : `Remove ${p.name} and everything recorded about them? This cannot be undone.`;
    if (!confirm(ask)) return;
    removeFromRoster(p);
    await dropPhoto(p.id);
    await Store.deleteOriginal(p.id);
    await saveRoster();
    notifyMutate();
    $('#dlg-person').close();
    closeSheet();
    renderAll();
    toast(p.isSelf ? 'Your profile is gone' : `${p.name} removed`);
  };

  $('#form-event').onsubmit = saveEvent;
  $('#btn-event-cancel').onclick = () => $('#dlg-event').close();

  /* The kind can change without the type changing, and only one kind asks a
     second question, so the fields follow the select as well as the tabs. */
  $('#e-kind').onchange = paintBabyFields;
  $('#e-date').onchange = () => { if (!$('#wrap-gestation').hidden) paintGestationFrom($('#e-date').value); };

  const fromGestation = () => {
    const w = clamp(Number($('#e-weeks').value) || 0, 0, 42);
    const d = clamp(Number($('#e-days').value) || 0, 0, 6);
    $('#e-date').value = dueFromGestation(w, d);
    $('#gestation-now').textContent = `${w}w ${d}d today`;
  };
  $('#e-weeks').oninput = fromGestation;
  $('#e-days').oninput = fromGestation;
  $('#btn-delete-event').onclick = () => {
    const p = byId(editingEvent.personId);
    if (!p) return;
    p.events = p.events.filter(x => x.id !== editingEvent.eventId);
    queueSave();
    $('#dlg-event').close();
    renderAll();
  };

  $('#form-release').onsubmit = saveAnswered;
  $('#btn-release-go').onclick = saveReleased;
  $('#btn-release-remove').onclick = saveRemoved;
  $('#btn-release-cancel').onclick = () => $('#dlg-release').close();

  $('#cal-prev').onclick = () => shiftMonth(-1);
  $('#cal-next').onclick = () => shiftMonth(1);
  $('#cal-today').onclick = () => goToMonth(monthKey(new Date()));

  $('#btn-how-plain').onclick = () => { chooseHow(''); };
  $('#btn-how-cancel').onclick = () => $('#dlg-how').close();

  $('#btn-filter').onclick = () => { paintFilterDialog(); $('#dlg-filter').showModal(); };
  $('#btn-filter-done').onclick = () => $('#dlg-filter').close();

  $('#btn-settings').onclick = () => {
    paintNotifState();
    /* Whether the device can verify a person may have changed since boot —
       a fingerprint enrolled in Android's own settings, say. */
    checkBio().then(paintLockState);
    paintLockState();
    paintMfaState();
    $('#dlg-settings').showModal();
  };
  $('#btn-settings-close').onclick = () => $('#dlg-settings').close();

  $('#btn-pin').onclick = () => pinDialog('set');
  $('#btn-pin-change').onclick = () => pinDialog('change');
  $('#btn-pin-off').onclick = () => pinDialog('off');
  $('#btn-pin-cancel').onclick = () => $('#dlg-pin').close();
  $('#form-pin').onsubmit = savePin;
  $('#btn-bio').onclick = toggleBio;
  $('#btn-notif').onclick = enableNotifications;
  $('#btn-export').onclick = exportAll;
  $('#import-input').onchange = e => {
    const f = e.target.files?.[0];
    if (f) importAll(f);
    e.target.value = '';
  };

  $('#sheet-close').onclick = closeSheet;
  $('#scrim').onclick = closeSheet;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openId && !$$('dialog[open]').length) closeSheet();
  });

  let searchTimer;
  $('#search').oninput = e => {
    clearTimeout(searchTimer);
    const v = e.target.value;
    /* Typing narrows the circle the same way a chip does, so it moves the same
       way — and it has to, now that narrowing can change everybody's size. */
    searchTimer = setTimeout(() => { query = v; markCircleFlip(); renderCircle(); }, 120);
  };

  const cc = $('#country-code');
  cc.value = countryCode();
  cc.oninput = e => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
    e.target.value = v;
    Store.setPref('countryCode', v || '27');
    if (openId) renderSheet();   // the contact line may have just become dialable
  };

  const size = $('#badge-size');
  size.value = String(badgeSizePref());
  let sizeTimer;
  size.oninput = e => {
    const v = clamp(Number(e.target.value) || 100, SIZE_MIN, SIZE_MAX);
    applyBadgeSize(v);
    Store.setPref('badgeSize', String(v));
    /* A computer needs nothing further — the grid reflows around the new
       size. A phone does, because how many fit in a row has just changed. */
    if (phone.matches) { clearTimeout(sizeTimer); sizeTimer = setTimeout(renderCircle, 120); }
  };

  /* Rebuilt when the number of badges across changes, not on every pixel of
     a drag — turning a phone sideways matters, nudging a window edge does not. */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (phone.matches && hexMetrics($('#grid')).per !== hexCols) renderCircle();
    }, 150);
  }, { passive: true });

  phone.addEventListener('change', renderCircle);

  /* The frozen title appears exactly as the real one leaves the top of the
     screen. Watching the heading itself means no scroll arithmetic and no
     threshold to keep in step with the masthead's height. */
  const title = $('.masthead h1');
  if (title && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      $('#topbar').classList.toggle('is-up', !e.isIntersecting && e.boundingClientRect.top < 0);
    }).observe(title);
  }

  /* focusout arrives before the focus lands anywhere else, so asking straight
     away would read a tab from one box to the next as having stopped writing.
     The wait puts the question after the answer. */
  document.addEventListener('focusout', () => setTimeout(flushHeldRender, 0));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    /* Glancing at a message and coming straight back should not ask again;
       leaving the phone on the table should. */
    if (Date.now() - hiddenAt > LOCK_GRACE) showLock();
    renderAll();
    if (!locked) nudgeIfDue();
    checkForUpdate();
    /* Coming back to the app is when you find out somebody took up an
       invitation, since nothing here listens for it while you are away. */
    if (!locked) checkClaimedInvites();
  });

  wireDialogLayers();
}

/* ──────────────── keeping up with the live site ──────────────── */

/* Installed as an Android app, Fellowship is a window onto the deployed URL, not
   a copy of the files — so a change reaches the phone without reinstalling
   anything. What it does not do is reload. An app picked back up from the
   task switcher keeps the page it booted with, and can sit for days on last
   week's version. version.json names the deploy it came from; when that name
   changes and nothing is half-written, take the new one.

   Watching the service worker instead would miss nearly all of this: the
   browser decides a worker is new by comparing sw.js byte for byte, and sw.js
   doesn't change when app.js does. */

