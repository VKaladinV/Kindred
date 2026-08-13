/* uses: CADENCES KINDS TOUCH_KINDS TYPES
   · $ agoWords aheadWords daysBetween el monthYear parseYmd prettyDate shortMonth today
   · byId me openId shared
   · activeSeasons answeredPrayers gestationOn gestationWords historyOf isBaby lastTouchDate nextBirthday openPrayers releasedPrayers statusOf tasksOf touchOn upcomingOf
   · avatar · prayerLine sharePill · closeSheet
   · blockHead fromThemBlock · howDialog undoConnected
   · inviteDialog linkApi unlinkPerson · endSeason moveToHistory · completeTask uncompleteTask
   · dialNumber personDialog telLink · promoteToCircle · eventDialog · prayerDialog
   · isWalking stopDiscipling · discipleIntroDialog householdSummary walkBlocks
   · quiet renderAll · taskQuickAdd
*/

/* Which half of the page is being read. Only ever anything but 'life' for
   somebody in the road group, and put back to 'life' by openSheet — a person
   you have just tapped should open on the page you expect, not on wherever you
   happened to leave the last one. */
let sheetTab = 'life';

function showSheetTab(key) {
  if (sheetTab === key) return;
  sheetTab = key;
  renderSheet();
  /* renderSheet puts the reader back where they were scrolled to, which is the
     right answer for a repaint and the wrong one for arriving at a different
     page. Said after it, so it wins. */
  $('#sheet-scroll').scrollTop = 0;
}

/* Two folder tabs rather than a segmented picker — see .sheet-tabs in
   css/walk.css for how the layered-paper look is built. The markup itself
   barely differs from a plain toggle; it's the styling that makes it read as
   two sheets rather than two buttons. */
function tabStrip() {
  const strip = el('div', 'sheet-tabs');
  strip.setAttribute('role', 'tablist');
  [['life', 'Life'], ['walk', 'Walk with God']].forEach(([key, label]) => {
    const on = sheetTab === key;
    const b = el('button', 'sheet-tab' + (on ? ' is-on' : ''), label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(on));
    b.onclick = () => showSheetTab(key);
    strip.append(b);
  });
  return strip;
}

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
  /* Read before the head is built, because the pill it decides on now sits
     under the photo rather than down among the facts. */
  const walking = isWalking(p);

  const head = el('div', 'person-head');

  /* The photo and the one thing you do to the whole person, stacked. Under
     the picture rather than in the column of facts beside it: starting to
     walk a road with somebody is about them, not another detail of them,
     and among the birthday and the phone number it read as one more field. */
  const photoCol = el('div', 'person-photo-col');
  photoCol.append(avatar(p, 'person-photo'));

  if (!p.isSelf && !p.isFuture) {
    const pill = el('button', 'share-pill walk-pill' + (walking ? ' is-on' : ''));
    pill.type = 'button';
    pill.append(el('span', 'glyph', walking ? '◈' : '◇'),
      document.createTextNode(walking ? 'Walking together' : 'Disciple'));
    pill.title = walking
      ? `Stop walking a road with ${p.name.split(' ')[0]}`
      : `Start walking a road with ${p.name.split(' ')[0]}`;
    /* Starting is the intro pop-up's job, not the click's — see
       discipleIntroDialog in walk-sheet.js. Stopping never asked for
       confirmation and doesn't start now. */
    pill.onclick = () => walking ? stopDiscipling(p.id) : discipleIntroDialog(p.id);
    photoCol.append(pill);
  }
  head.append(photoCol);

  const idBox = el('div', 'person-id');

  /* The way into editing lives outside this row now, stacked below
     #sheet-close (see .sheet-edit in sheet.css) — a name long enough to
     wrap this row to two lines used to carry an inline edit button up into
     the close button's own corner. Only its label follows the name here. */
  const nameRow = el('div', 'name-row');
  nameRow.append(el('h2', null, p.name));
  idBox.append(nameRow);
  $('#sheet-edit').setAttribute('aria-label', `Edit ${p.name}’s details`);

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

  /* Joined rather than separate fields on screen: for most people this reads
     as "grandmother · Retired teacher", and for a future connection — who has
     no relationship yet — it's just the occupation, alone, in the same spot.
     Sits below the facts rather than right under the name — a single quiet
     line of context, read after what they're called and how to reach them,
     not before. */
  const idLine = [p.relationship, p.occupation].filter(Boolean).join(' · ');
  if (idLine) idBox.append(el('p', 'person-rel', idLine));

  if (p.groups.length) {
    const tags = el('div', 'group-pills');
    p.groups.forEach(g => {
      const pill = el('span', 'pill pill-group');
      pill.append(el('span', 'glyph', '◈'), document.createTextNode(g));
      tags.append(pill);
    });
    idBox.append(tags);
  }

  /* Their household read as a line rather than filled in as a form — who
     they are married to and since when, when they joined the church, their
     children's names and ages. It sits with the birthday and the phone
     number because it is the same kind of thing: what you would want to know
     before knocking on the door. Above the tabs, so it is there on both. */
  if (walking && !p.isSelf && !p.isFuture) idBox.append(householdSummary(p));

  const seasons = activeSeasons(p);
  if (seasons.length) {
    const pills = el('div', 'season-pills');
    seasons.forEach(sn => {
      const pill = el('span', 'pill');
      pill.append(el('span', 'glyph', sn.dueDate ? KINDS.baby.glyph : TYPES.season.glyph), document.createTextNode(sn.title));
      pills.append(pill);
    });
    idBox.append(pills);
  }

  /* Linking, in the corner stack under the pencil rather than down among the
     facts. Only for somebody else, and only once there is a sync layer to do
     it through — otherwise it is not a thing this device can offer at all,
     and the button stays hidden rather than appearing and failing.

     One button, two states, the way the Disciple pill is one button for
     starting and stopping: already linked, it says so and pressing it cuts
     the link; not linked yet, it says Link and pressing it opens the invite. */
  const linkBtn = $('#sheet-link');
  const canLink = !p.isSelf && !!linkApi();
  linkBtn.hidden = !canLink;
  if (canLink) {
    const linked = !!p.linkedUid;
    linkBtn.textContent = linked ? 'Linked' : 'Link';
    linkBtn.classList.toggle('is-on', linked);
    linkBtn.setAttribute('aria-label', linked
      ? `Unlink from ${p.name}`
      : `Invite ${p.name.split(' ')[0]} to share with you`);
    linkBtn.title = linkBtn.getAttribute('aria-label');
    linkBtn.onclick = () => (linked ? unlinkPerson(p.id) : inviteDialog(p.id));
  }

  head.append(idBox);
  root.append(head);

  /* ── two halves of one page ──
     Only for somebody there is a second half for. Every other person's page
     has no strip at all, which is the point: this appears the moment you start
     walking a road with someone rather than sitting on every page waiting. */
  if (walking) root.append(tabStrip());
  const onWalk = walking && sheetTab === 'walk';

  /* The folder's page — everything below the tabs sits inside this one
     bordered box instead of loose on the sheet, so the tab reads as attached
     to something rather than floating above a blank continuation of it.
     Nobody without a second tab gets one: there is nothing here for it to be
     attached to, so `body` is just `root` and every append below lands where
     it always did. */
  const body = walking ? el('div', 'sheet-folder-body') : root;
  if (walking) root.append(body);

  /* ── from them ──
     Above your own material, because it is the newer thing and often the
     reason you opened the page. No edit affordance anywhere in it — read-only
     is kept by never building the buttons, not by disabling them — and one
     exception: a shared prayer can be copied onto your own list, because
     praying for someone is the point and copying it makes it an ordinary row
     of yours from then on, which is the one bridge between the two worlds. */
  if (!onWalk && p.linkedUid && shared[p.linkedUid]) fromThemBlock(body, p, shared[p.linkedUid]);

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
    body.append(box);
  } else if (!p.isSelf && !onWalk) {

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
  body.append(bar);

  }   /* end of the not-yourself branch */

  /* ── right now, coming up, history and prayers ──
     Built here, laid out below, in the order it always read in: history,
     right now, coming up, prayers. Self and everyone else share the same
     order — there is no longer a summary to lead with on either page. */
  let snBlock, upBlock, evBlock, tdBlock;

  /* ── right now: seasons ──
     Not for a future connection — seasons, coming up and history all model
     an ongoing story with them that starts once they're in the circle. */
  if (!p.isFuture) {
  snBlock = el('div', 'sheet-block');
  snBlock.append(blockHead('Present', () => eventDialog(p.id, null, 'season'), 'Start a season'));
  if (seasons.length) {
    seasons.sort((a, b) => (a.date < b.date ? 1 : -1)).forEach(sn => {
      const card = el('div', 'season-card');
      const top = el('div', 'season-top');
      const h = el('h4', null, sn.title);
      h.title = 'Edit this season';
      h.onclick = () => eventDialog(p.id, sn.id);
      top.append(h, el('span', 'since', `since ${monthYear(sn.date)} · ${agoWords(sn.date).replace(' ago', '')}`));
      /* How far along, the same reading a legacy baby-kind date gives in
         Future — read from the due date rather than the start, because how
         far along they are now is the thing you actually want to read. */
      if (sn.dueDate) {
        const g = gestationOn(sn.dueDate);
        if (g) top.append(el('span', 'up-gest', `${gestationWords(g)} · due ${aheadWords(daysBetween(today(), sn.dueDate))}`));
      }
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

  /* ── prayers ── */
  const prBlock = el('div', 'sheet-block');
  prBlock.append(blockHead('Prayer list', () => prayerDialog(p.id), 'Add a prayer'));

  const open = openPrayers(p).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  if (open.length) open.forEach(pr => prBlock.append(prayerLine(p, pr, 'open')));
  else prBlock.append(el('p', 'quiet-note', 'Nothing on the list yet.'));

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
  upBlock.append(blockHead('Future', () => eventDialog(p.id, null, 'upcoming'), 'Add a date'));
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
  evBlock.append(blockHead('Past', () => eventDialog(p.id, null, 'history'), 'Add to history'));

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

  /* ── to do ──
     The same records the calendar and Today already list, gathered onto the
     page of whoever they are for. Without this a to-do pointed at somebody
     would be real, dated and synced, and yet invisible on the one page that
     is entirely about them.

     Outstanding first and finished after, rather than the finished ones
     dropped: a to-do that is done is the record of having done it, and it is
     the only place that record is kept — completeTask deliberately does not
     file it into their history the way a planned coffee is filed. */
  if (!p.isFuture) {
  tdBlock = el('div', 'sheet-block');
  tdBlock.append(blockHead('To do'));
  tdBlock.append(taskQuickAdd({ personId: p.id }));

  const tasks = tasksOf(p);
  if (tasks.length) {
    [...tasks]
      .sort((a, b) => (!!a.endDate - !!b.endDate) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .forEach(t => {
        const item = el('div', 'todo-item' + (t.endDate ? ' is-done' : ''));

        const tick = el('button', 'tick');
        tick.type = 'button';
        tick.title = t.endDate ? 'Put it back on the list' : 'Mark as done';
        tick.setAttribute('aria-label', tick.title);
        tick.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 13l4.5 4.5L19 7"/></svg>';
        tick.onclick = () => (t.endDate ? uncompleteTask(p.id, t.id) : completeTask(p.id, t.id));
        item.append(tick);

        const text = el('div', 'todo-text');
        const line = el('button', 'todo-title');
        line.type = 'button';
        line.textContent = t.title;
        line.onclick = () => eventDialog(p.id, t.id);
        text.append(line);
        text.append(el('small', null, t.endDate
          ? `done ${prettyDate(t.endDate)}`
          : prettyDate(t.date)));
        if (t.note) text.append(el('p', 'tl-note', t.note));
        item.append(text);

        tdBlock.append(item);
      });
  } else {
    tdBlock.append(el('p', 'quiet-note', 'Nothing to do for them right now.'));
  }
  }

  const order = [evBlock, snBlock, upBlock, tdBlock, prBlock];
  body.append(...(onWalk ? walkBlocks(p) : order.filter(Boolean)));
  restore();
}

/* The sheet is rebuilt from nothing on every render, and a rebuild takes the
   reader's place with it — where they had scrolled to. Nothing left in it
   writes as you type any more, so scroll position is the whole of what's
   worth putting back. */
function keepPlace(root) {
  const top = root.scrollTop;
  return () => { root.scrollTop = top; };
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
