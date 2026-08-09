/* uses: CADENCES KINDS TOUCH_KINDS
   · $ agoWords aheadWords el monthYear parseYmd prettyDate shortMonth today
   · byId claimAsSelf me openId queueSave selfWeight shared
   · normalisePrayer
   · activeSeasons answeredPrayers gestationOn gestationWords historyOf isBaby lastTouchDate nextBirthday openPrayers releasedPrayers statusOf touchOn upcomingOf
   · avatar · prayerLine sharePill · closeSheet
   · blockHead fromThemBlock · howDialog undoConnected
   · inviteDialog linkApi unlinkPerson · endSeason moveToHistory
   · dialNumber personDialog telLink · promoteToCircle · eventDialog
   · quiet renderAll
*/

function renderSheet() {
  const p = byId(openId);
  if (!p) return closeSheet();

  const root = $('#sheet-scroll');
  const restore = keepPlace(root);
  root.classList.toggle('no-entry', quiet);
  root.textContent = '';
  const s = statusOf(p);
  const last = lastTouchDate(p);

  /* ── identity ── */
  const head = el('div', 'person-head');
  head.append(avatar(p, 'person-photo'));
  const idBox = el('div', 'person-id');
  idBox.append(el('h2', null, p.name));
  /* Joined rather than separate fields on screen: for most people this reads
     as "grandmother · Retired teacher", and for a future connection — who has
     no relationship yet — it's just the occupation, alone, in the same spot. */
  const idLine = [p.relationship, p.occupation].filter(Boolean).join(' · ');
  if (idLine) idBox.append(el('p', 'person-rel', idLine));

  const facts = el('div', 'person-facts');
  const bd = nextBirthday(p);
  if (bd) {
    const f = el('div', 'fact');
    f.append(document.createTextNode('✦ '), el('b', null, prettyDate(p.birthday).replace(/,? \d{4}$/, '')));
    f.append(document.createTextNode(bd.inDays === 0 ? ' — today!' : ` — ${aheadWords(bd.inDays)}, turning ${bd.turning}`));
    facts.append(f);
  }
  if (p.contact) {
    const f = el('div', 'fact');
    const dial = dialNumber(p.contact);
    /* A way to ring someone without recording anything — sometimes you are
       calling to arrange the visit, not reporting on it. */
    const value = dial ? el('a', 'fact-link') : el('b');
    value.textContent = p.contact;
    if (dial) { value.href = telLink(dial); value.setAttribute('aria-label', `Call ${p.name}`); }
    f.append(document.createTextNode('☏ '), value);
    facts.append(f);
  }
  idBox.append(facts);

  if (p.groups.length) {
    const tags = el('div', 'group-pills');
    p.groups.forEach(g => {
      const pill = el('span', 'pill pill-group');
      pill.append(el('span', 'glyph', '◈'), document.createTextNode(g));
      tags.append(pill);
    });
    idBox.append(tags);
  }

  const seasons = activeSeasons(p);
  if (seasons.length) {
    const pills = el('div', 'season-pills');
    seasons.forEach(sn => {
      const pill = el('span', 'pill');
      pill.append(el('span', 'glyph', (KINDS[sn.kind] || KINDS.other).glyph), document.createTextNode(sn.title));
      pills.append(pill);
    });
    idBox.append(pills);
  }

  const edit = el('button', 'link-btn', 'edit details');
  edit.type = 'button';
  edit.style.marginTop = '.7rem';
  edit.onclick = () => personDialog(p);
  idBox.append(edit);

  /* Linking, on the page of the person it would be with. Only for somebody
     else, only once there is a sync layer to do it through, and only while
     they are not already linked — after that it says so instead. */
  if (!p.isSelf && linkApi()) {
    const row = el('div', 'link-row');
    if (p.linkedUid) {
      row.append(el('span', 'pill pill-linked', '⇄ linked'));
      const cut = el('button', 'link-btn', 'unlink');
      cut.type = 'button';
      cut.onclick = () => unlinkPerson(p.id);
      row.append(cut);
    } else {
      const inv = el('button', 'link-btn', `invite ${p.name.split(' ')[0]} to share with you`);
      inv.type = 'button';
      inv.onclick = () => inviteDialog(p.id);
      row.append(inv);
    }
    idBox.append(row);
  }

  /* A duplicate of you that an older version demoted into the circle, and
     synced — the isSelf flag is off it now, so nothing can spot it on its
     own. Offered only where it could plausibly be true: you have no profile
     yet, or the one you have is bare, or this card carries your own name.
     Never on somebody already tied to another account, since that is proof
     they are not you. */
  const couldBeMe = !me || selfWeight(me) <= 1
    || me.name.trim().toLowerCase() === p.name.trim().toLowerCase();
  if (!p.isSelf && !p.linkedUid && couldBeMe) {
    const mineRow = el('div', 'link-row');
    const claim = el('button', 'link-btn', 'this is actually me');
    claim.type = 'button';
    claim.onclick = () => claimAsSelf(p.id);
    mineRow.append(claim);
    idBox.append(mineRow);
  }

  head.append(idBox);
  root.append(head);

  /* ── from them ──
     Above your own material, because it is the newer thing and often the
     reason you opened the page. No edit affordance anywhere in it — read-only
     is kept by never building the buttons, not by disabling them — and one
     exception: a shared prayer can be copied onto your own list, because
     praying for someone is the point and copying it makes it an ordinary row
     of yours from then on, which is the one bridge between the two worlds. */
  if (p.linkedUid && shared[p.linkedUid]) fromThemBlock(root, p, shared[p.linkedUid]);

  /* ── check-in bar ──
     Not for yourself: there is no rhythm to be behind on with the person
     holding the phone, and every part of this bar — the days since, the
     cadence, the beads, the button — is about somebody else. Your own page
     shows none of it. */
  if (p.isFuture) {
    const box = el('div', 'touch-bar is-mine');
    const st = el('div', 'touch-status');
    st.append(el('span', 'big', 'Not in your circle yet'));
    st.append(el('span', 'sub', 'Add them once you would like to start keeping in touch.'));
    box.append(st);
    const promote = el('button', 'btn btn-sage', 'Add to your circle');
    promote.type = 'button';
    promote.onclick = () => promoteToCircle(p.id);
    box.append(promote);
    root.append(box);
  } else if (!p.isSelf) {

  const bar = el('div', 'touch-bar');
  const st = el('div', 'touch-status');
  st.append(el('span', 'big', last ? `Last connected ${agoWords(last)}` : 'Not connected yet'));
  const cadenceLabel = p.cadenceDays
    ? `every ${(CADENCES.find(c => c[0] === p.cadenceDays) || [0, p.cadenceDays + ' days'])[1]}`
    : 'no reminder set';
  st.append(el('span', 'sub', cadenceLabel + (s.state === 'due' ? ' · overdue' : '')));

  if (p.touches.length) {
    const beads = el('div', 'beads');
    p.touches.slice(-14).forEach(t => {
      const k = TOUCH_KINDS[t.kind];
      const b = el('span', 'bead on' + (k ? ' has-kind' : ''), k ? k.glyph : '');
      b.title = k ? `${prettyDate(t.date)} — ${k.label}` : prettyDate(t.date);
      beads.append(b);
    });
    st.append(beads);
  }
  bar.append(st);

  /* Still live once you have connected, because how it happened can be
     corrected — the label says what is recorded, the tap changes it. */
  const todayTouch = touchOn(p, today());
  const connectedToday = !!todayTouch;
  const kind = TOUCH_KINDS[todayTouch?.kind];
  const btnTouch = el('button', 'btn btn-sage',
    connectedToday ? `✓ Connected today${kind ? ' · ' + kind.label : ''}` : 'Connected today');
  btnTouch.type = 'button';
  btnTouch.onclick = () => howDialog(p.id);
  bar.append(btnTouch);

  /* The toast's offer is gone in a few seconds. This one stays as long as the
     check-in is still today's, for the mistake noticed later in the evening. */
  if (connectedToday) {
    const undo = el('button', 'link-btn', 'undo');
    undo.type = 'button';
    undo.setAttribute('aria-label', `Undo today's check-in with ${p.name}`);
    undo.onclick = () => undoConnected(p.id);
    bar.append(undo);
  }
  root.append(bar);

  }   /* end of the not-yourself branch */

  /* ── right now, coming up, history, summary and prayers ──
     Built here, laid out below. Your own page reads as your story first and
     who can see it second — history, how you are, what's on now, what's
     ahead, then the prayer list. Everyone else's leads with who they are,
     since that's usually why the page was opened, in the order it always
     read in: who they are, history, right now, coming up, prayers. */
  let snBlock, upBlock, evBlock;

  /* ── right now: seasons ──
     Not for a future connection — seasons, coming up and history all model
     an ongoing story with them that starts once they're in the circle. */
  if (!p.isFuture) {
  snBlock = el('div', 'sheet-block');
  snBlock.append(blockHead('Right now', '+ start a season', () => eventDialog(p.id, null, 'season')));
  if (seasons.length) {
    seasons.sort((a, b) => (a.date < b.date ? 1 : -1)).forEach(sn => {
      const card = el('div', 'season-card');
      const top = el('div', 'season-top');
      const h = el('h4', null, sn.title);
      h.title = 'Edit this season';
      h.onclick = () => eventDialog(p.id, sn.id);
      top.append(h, el('span', 'since', `since ${monthYear(sn.date)} · ${agoWords(sn.date).replace(' ago', '')}`));
      card.append(top);
      if (sn.note) card.append(el('p', 'tl-note', sn.note));
      const endBtn = el('button', 'btn btn-quiet btn-tiny season-end', 'this has ended');
      endBtn.type = 'button';
      endBtn.onclick = () => endSeason(p.id, sn.id);
      card.append(endBtn);
      if (p.isSelf) card.append(sharePill(p, 'record', sn));
      snBlock.append(card);
    });
  } else {
    snBlock.append(el('p', 'quiet-note', p.isSelf
      ? 'Nothing you have named — grief, treatment, a new baby, a hard stretch at work.'
      : 'Not in any season you have noted — grief, treatment, a new baby, a hard stretch at work.'));
  }
  }

  /* ── summary ── */
  const sumBlock = el('div', 'sheet-block');
  const sumHead = el('div', 'block-head');
  sumHead.append(el('h3', null, p.isSelf ? 'How you are' : p.isFuture ? 'Information about them' : 'Who they are'));
  const flash = el('span', 'saved-flash', 'saved');
  flash.setAttribute('aria-hidden', 'true');
  sumHead.append(flash);
  sumBlock.append(sumHead);

  const ta = el('textarea', 'summary-area');
  ta.value = p.summary;
  ta.placeholder = p.isSelf
    ? 'Where you are at the moment — what you are carrying, what you are glad of, what you would tell someone who asked properly.'
    : p.isFuture
    ? 'What you know about them, and why you would like to get to know them better.'
    : 'What matters about them right now — what they are carrying, what they love, what you keep forgetting to ask about.';
  ta.setAttribute('aria-label', 'Summary');
  let flashTimer;
  ta.oninput = () => {
    /* The page can now outlive the person it is about: a repaint waits for you
       to stop writing, so somebody removed on another device stays on screen
       until then. Without this the next keystroke throws, silently, and every
       one after it is lost with no sign that anything went wrong. */
    const live = byId(p.id);
    if (!live) return closeSheet();
    live.summary = ta.value;
    queueSave();
    flash.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flash.classList.remove('show'), 1400);
  };
  sumBlock.append(ta);

  /* ── prayers ── */
  const prBlock = el('div', 'sheet-block');
  prBlock.append(blockHead('Prayer list'));

  const open = openPrayers(p).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  if (open.length) open.forEach(pr => prBlock.append(prayerLine(p, pr, 'open')));
  else prBlock.append(el('p', 'quiet-note', 'Nothing on the list yet.'));

  const addPrayer = el('form', 'add-line');
  const prInput = el('input');
  prInput.placeholder = 'Add something to pray for…';
  prInput.maxLength = 240;
  prInput.setAttribute('aria-label', 'Add a prayer');
  const prBtn = el('button', 'btn btn-quiet', 'Add');
  prBtn.type = 'submit';
  addPrayer.append(prInput, prBtn);
  addPrayer.onsubmit = e => {
    e.preventDefault();
    const text = prInput.value.trim();
    if (!text) return;
    byId(p.id).prayers.push(normalisePrayer({ text }));
    prInput.value = '';
    queueSave();
    renderAll();
    setTimeout(() => $('.add-line input', $('#sheet-scroll'))?.focus(), 30);
  };
  prBlock.append(addPrayer);

  /* Both archives, each tucked away and each still reachable. */
  const archive = (list, sortKey, state, word) => {
    if (!list.length) return;
    const det = el('details', 'answered');
    const sm = el('summary');
    sm.append(document.createTextNode(`${list.length} ${word}`));
    det.append(sm);
    [...list].sort((a, b) => (a[sortKey] < b[sortKey] ? 1 : -1))
      .forEach(pr => det.append(prayerLine(p, pr, state)));
    prBlock.append(det);
  };
  archive(answeredPrayers(p), 'answeredAt', 'answered', 'answered');
  archive(releasedPrayers(p), 'releasedAt', 'released', 'let go');

  /* ── coming up ── */
  if (!p.isFuture) {
  upBlock = el('div', 'sheet-block');
  upBlock.append(blockHead('Coming up', '+ add a date', () => eventDialog(p.id, null, 'upcoming')));
  const ups = upcomingOf(p);
  if (ups.length) {
    ups.forEach(({ r, o }) => {
      const past = o.inDays < 0;
      const item = el('div', 'up-item' + (past ? ' is-past' : o.inDays <= 14 ? ' is-near' : ''));

      const when = el('div', 'up-when');
      when.append(el('span', 'd', String(parseYmd(o.date).getDate())), el('span', 'm', shortMonth(o.date)));
      item.append(when);

      const bodyBox = el('div', 'up-body');
      const h = el('h4', null, r.title);
      h.title = 'Edit this';
      h.onclick = () => eventDialog(p.id, r.id);
      bodyBox.append(h);

      const meta = el('div');
      /* A due date is read from the other end: how far along they are now
         matters more than how many weeks are left. */
      const g = isBaby(r) ? gestationOn(o.date) : null;
      if (g) meta.append(el('span', 'up-gest', gestationWords(g) + ' · '));
      meta.append(el('span', 'up-count' + (past ? ' is-past' : ''),
        past ? `was ${agoWords(o.date)}` : g ? `due ${aheadWords(o.inDays)}` : aheadWords(o.inDays)));
      if (r.repeatsYearly) meta.append(el('span', 'up-repeat', ' · every year'));
      bodyBox.append(meta);

      if (r.note) bodyBox.append(el('p', 'tl-note', r.note));

      if (past && !r.repeatsYearly) {
        const mv = el('button', 'link-btn', 'move to history');
        mv.type = 'button';
        mv.style.marginTop = '.4rem';
        mv.onclick = () => moveToHistory(p.id, r.id);
        bodyBox.append(mv);
      }
      if (p.isSelf) bodyBox.append(sharePill(p, 'record', r));
      item.append(bodyBox);
      upBlock.append(item);
    });
  } else {
    upBlock.append(el('p', 'quiet-note', 'Nothing on the calendar — appointments, a surgery date, an anniversary.'));
  }
  }

  /* ── history ── */
  if (!p.isFuture) {
  evBlock = el('div', 'sheet-block');
  evBlock.append(blockHead('History', '+ add to history', () => eventDialog(p.id, null, 'history')));

  const hist = historyOf(p);
  if (hist.length) {
    const tl = el('div', 'timeline');
    [...hist].sort((a, b) => (a.date < b.date ? 1 : -1)).forEach(ev => {
      const item = el('div', 'tl-item');
      item.dataset.kind = ev.kind || 'other';
      const kind = KINDS[ev.kind] || KINDS.other;
      const wasSeason = ev.type === 'season';

      const d = el('div', 'tl-date');
      d.append(el('span', 'glyph', kind.glyph));
      d.append(document.createTextNode(wasSeason
        ? `${monthYear(ev.date)} – ${monthYear(ev.endDate)}`
        : prettyDate(ev.date)));
      if (wasSeason) d.append(el('span', 'was-season', 'season'));
      item.append(d);

      const t = el('h4', 'tl-title', ev.title);
      t.title = 'Edit this';
      t.onclick = () => eventDialog(p.id, ev.id);
      item.append(t);
      if (ev.note) item.append(el('p', 'tl-note', ev.note));
      if (p.isSelf) item.append(sharePill(p, 'record', ev));
      tl.append(item);
    });
    evBlock.append(tl);
  } else {
    evBlock.append(el('p', 'quiet-note', 'Nothing recorded yet — births, diagnoses, new jobs, moves, losses, wins.'));
  }
  }

  const order = p.isSelf
    ? [evBlock, sumBlock, snBlock, upBlock, prBlock]
    : [sumBlock, evBlock, snBlock, upBlock, prBlock];
  root.append(...order.filter(Boolean));
  restore();
}

/* The sheet is rebuilt from nothing on every render, and a rebuild takes the
   reader's place with it — where they had scrolled to, which box they were in,
   where the cursor sat inside it. Most of the app can afford that because most
   of the app is read rather than written; this page is the one you write on.

   Two boxes here are live, and they need different things. The summary saves
   as you type, so its words are already in the roster and come back on their
   own — only the caret needs putting back. The prayer line is rebuilt empty
   and holds its words nowhere else at all, so it is remembered whether or not
   it has the focus: tapping a tick in the list above hands the focus to that
   button before the repaint it causes, and a line remembered only while
   focused would be gone by the time anything thought to look.

   Found by selector rather than by node, because the node this measured does
   not survive to be compared against. */
function keepPlace(root) {
  const top = root.scrollTop;
  const pending = $('.add-line input', root);
  const pendingText = pending ? pending.value : '';

  const a = document.activeElement;
  const sel = a && root.contains(a)
    ? (a.matches('.summary-area') ? '.summary-area'
      : a.matches('.add-line input') ? '.add-line input'
      : null)
    : null;
  const from = sel ? a.selectionStart : 0;
  const to = sel ? a.selectionEnd : 0;

  return () => {
    root.scrollTop = top;
    const line = $('.add-line input', root);
    if (line && pendingText) line.value = pendingText;
    if (!sel) return;
    const next = $(sel, root);
    if (!next) return;
    next.focus({ preventScroll: true });
    /* Clamped by the browser when a summary that moved on elsewhere has come
       back shorter than the caret we remembered, which is the right answer. */
    next.setSelectionRange(from, to);
  };
}

/* ─────────────────────────── mutations ─────────────────────── */

/* One check-in a day, and the last word on how it happened wins — saying
   coffee this evening corrects this morning's WhatsApp rather than adding to
   it. That keeps a day to one row, which is what the sync's person-and-date
   key has always assumed. */
/* The toast's one action slot is Undo by default, but chooseHow hands in
   something else when there is a chat or a call waiting to be offered —
   the two are never both wanted at once, and undo stays reachable from the
   check-in bar itself for as long as today's check-in stands. */
