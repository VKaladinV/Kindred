/* uses: CADENCES KINDS TOUCH_KINDS TYPES
   · $ agoWords aheadWords daysBetween el monthYear parseYmd prettyDate shortMonth today
   · byId me openId shared
   · activeSeasons gestationOn gestationWords historyOf isBaby lastTouchDate nextBirthday openPrayers statusOf touchOn upcomingOf
   · avatar · prayerLine sharePill · closeSheet openSheet
   · blockHead fromThemBlock · howDialog undoConnected
   · inviteDialog linkApi unlinkPerson · endSeason moveToHistory
   · dialNumber personDialog telLink · promoteToCircle · eventDialog · prayerDialog
   · isWalking stopDiscipling · discipleIntroDialog householdSummary walkBlocks
   · communitiesOf · communityPills enterCommunity leaveCommunity openCommunity setDiscipleTab
   · quiet renderAll switchView
*/

/* Which of somebody's two pages this is. Their ordinary one, or — only ever
   for somebody on the road — the discipleship page that lives behind the
   Discipleship tab. openSheet puts it back to 'life' for every ordinary way
   in, so a person you have just tapped opens on the page you expect rather
   than on wherever you happened to leave the last one.

   This used to be a pair of folder tabs at the top of one page. Two tabs sat
   there on every discipled person whether or not you had come to read either,
   and the road — which has its own tab in the sidebar, its own grid of faces
   and its own way in — was filed as half of a page about something else. It
   is its own page now, and the pill under the photo is the door between
   them. */
let sheetMode = 'life';

/* Moving between the two without opening or closing anything. openSheet would
   push a second entry onto the back stack for a sheet that is already on
   screen, which is a back press that appears to do nothing. */
function showSheetMode(mode) {
  if (sheetMode === mode) return;
  sheetMode = mode;
  renderSheet();
  /* renderSheet puts the reader back where they were scrolled to, which is the
     right answer for a repaint and the wrong one for arriving at a different
     page. Said after it, so it wins. */
  $('#sheet-scroll').scrollTop = 0;
}

/* The way from somebody's ordinary page to their discipleship one. It goes
   the long way round — through the Discipleship tab — on purpose: that tab is
   where the road lives, and arriving there with their page open is what makes
   the second one findable again afterwards without this button. The view is
   switched before the sheet opens so the photo has a badge on screen to fly
   in from (see findBadgePhoto, js/layers.js). */
function goToWalk(id) {
  closeSheet();
  /* Which part of the tab their face is drawn in: the page of the community
     they are one of the people of, or your own People folder. Decided before
     the view is switched, so that switch paints the right one and the flight
     has the right badge to start from. */
  const home = communitiesOf(id)[0];
  if (!home) {
    setDiscipleTab('people');
    if (openCommunity) leaveCommunity({ paint: false });
  }
  switchView('discipleship');
  if (home) enterCommunity(home.id);
  openSheet(id, 'walk');
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
  /* Stopping the road is done from the discipleship page itself, and stopping
     it empties that page of everything it had to say — so it becomes their
     ordinary page again in the same breath, rather than an empty folder with
     no way back out of it. */
  if (sheetMode === 'walk' && !walking) sheetMode = 'life';
  const onWalk = sheetMode === 'walk';

  const head = el('div', 'person-head');

  /* The photo and the one thing you do to the whole person, stacked. Under
     the picture rather than in the column of facts beside it: starting to
     walk a road with somebody is about them, not another detail of them,
     and among the birthday and the phone number it read as one more field. */
  const photoCol = el('div', 'person-photo-col');
  photoCol.append(avatar(p, 'person-photo'));

  if (!p.isSelf && !p.isFuture) {
    const first = p.name.split(' ')[0];
    const pill = el('button', 'share-pill walk-pill' + (walking ? ' is-on' : ''));
    pill.type = 'button';
    pill.append(el('span', 'glyph', walking ? '◈' : '◇'),
      document.createTextNode(walking ? 'Walking together' : 'Disciple'));
    /* One button, three things, and which page it is on decides between them.
       On their ordinary page it is a door and never a switch: not walking yet,
       the intro pop-up opens (discipleIntroDialog, walk-sheet.js); already
       walking, it takes you to the other page rather than ending anything —
       there is no longer a way to stop the road by mistake from a page you
       opened to read a birthday. Stopping lives on the road's own page, where
       it is the one thing left to do with it, and still asks for no
       confirmation because it loses nothing. */
    pill.title = onWalk ? `Stop walking a road with ${first}`
      : walking ? `Open ${first}’s discipleship page`
      : `Start walking a road with ${first}`;
    pill.onclick = onWalk ? () => stopDiscipling(p.id)
      : walking ? () => goToWalk(p.id)
      : () => discipleIntroDialog(p.id);
    photoCol.append(pill);

    /* The way back, on the road's page only. Not openSheet: the sheet is
       already up and this is the same person, so it is a repaint rather than
       an arrival — see showSheetMode. */
    if (onWalk) {
      const back = el('button', 'link-btn', 'their page');
      back.type = 'button';
      back.setAttribute('aria-label', `Back to ${first}’s page`);
      back.onclick = () => showSheetMode('life');
      photoCol.append(back);
    }
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
  /* Nothing on the road's page is edited through the pencil — a name, a
     photo and a cadence are facts about them rather than about the road, so
     the corner stack empties out and the page keeps its own room. */
  $('#sheet-edit').hidden = onWalk;

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
  /* The road's page carries none of this. Their birthday and their number are
     on their own page, one tap away through the pill, and repeating them here
     would push the checklist — the only reason to be on this page — below the
     fold on a phone. */
  if (!onWalk) idBox.append(facts);

  /* Joined rather than separate fields on screen: for most people this reads
     as "grandmother · Retired teacher", and for a future connection — who has
     no relationship yet — it's just the occupation, alone, in the same spot.
     Sits below the facts rather than right under the name — a single quiet
     line of context, read after what they're called and how to reach them,
     not before. */
  const idLine = [p.relationship, p.occupation].filter(Boolean).join(' · ');
  if (idLine && !onWalk) idBox.append(el('p', 'person-rel', idLine));

  if (p.groups.length && !onWalk) {
    const tags = el('div', 'group-pills');
    p.groups.forEach(g => {
      const pill = el('span', 'pill pill-group');
      pill.append(el('span', 'glyph', '◈'), document.createTextNode(g));
      tags.append(pill);
    });
    idBox.append(tags);
  }

  /* Which communities they lead or are in — on their ordinary page only, and
     the only place a leader's part shows at all, since leading is not a road
     of their own (communityPills, js/community-page.js). */
  const inCommunities = !onWalk && communityPills(p);
  if (inCommunities) idBox.append(inCommunities);

  /* Their household read as a line rather than filled in as a form — who
     they are married to and since when, when they joined the church, their
     children's names and ages. It went where the road went: this is written
     down because you are walking with them, it is only ever asked for by the
     intro pop-up, and it belongs at the head of the page it is about. */
  if (onWalk) idBox.append(householdSummary(p));

  const seasons = activeSeasons(p);
  if (seasons.length && !onWalk) {
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
  const canLink = !p.isSelf && !onWalk && !!linkApi();
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

  /* ── the road's own page ──
     Everything about walking with them, and nothing else: no check-in bar, no
     history, no prayer list. Those are on their ordinary page, one tap away
     through the pill under the photo, and there is nothing to be gained by
     having each of them in two places. */
  if (onWalk) {
    root.append(...walkBlocks(p));
    restore();
    return;
  }

  /* Everything below is their ordinary page. */

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

  /* ── right now, coming up, history and prayers ──
     Built here, laid out below, in the order it always read in: history,
     right now, coming up, prayers. Self and everyone else share the same
     order — there is no longer a summary to lead with on either page. */
  let addRow, snBlock, upBlock, evBlock;

  /* ── how lean the page is ──
     Somebody else's page shows what is there and nothing else: three headings
     with nothing under them said the same thing three times over, which was
     that you had not written anything down about them yet — and said it on
     the page you had opened to read about them.

     So the three record blocks appear only once they hold something, and the
     way to add is one button rather than a + on each of them. The dialog it
     opens has always asked which kind of thing this is, so a + per section
     was asking the same question twice.

     Your own page is not lean. It is where you write about yourself, and the
     empty prompt on each block is the invitation to. */
  const lean = !p.isSelf;

  const hist = p.isFuture ? [] : historyOf(p);
  const ups = p.isFuture ? [] : upcomingOf(p);

  if (lean && !p.isFuture) {
    addRow = el('button', 'btn btn-quiet sheet-add');
    addRow.type = 'button';
    addRow.append(el('span', 'glyph', '＋'), document.createTextNode('Add'));
    addRow.setAttribute('aria-label', `Add something to ${p.name.split(' ')[0]}’s page`);
    addRow.onclick = () => eventDialog(p.id, null, 'history');
  }

  /* ── right now: seasons ──
     Not for a future connection — seasons, coming up and history all model
     an ongoing story with them that starts once they're in the circle. */
  if (!p.isFuture && (!lean || seasons.length)) {
  snBlock = el('div', 'sheet-block');
  snBlock.append(lean
    ? blockHead('Present')
    : blockHead('Present', () => eventDialog(p.id, null, 'season'), 'Start a season'));
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

  /* Answered and let-go prayers are not here any more. Nothing is lost —
     both are kept, and both are in Prayers → History, gathered by person the
     same way the open list is. This page is what you are carrying for them
     now; a thing that has been answered has stopped being that, and it was
     sitting under the open list on every page in the app that had ever had
     one. */

  /* ── coming up ── */
  if (!p.isFuture && (!lean || ups.length)) {
  upBlock = el('div', 'sheet-block');
  upBlock.append(lean
    ? blockHead('Future')
    : blockHead('Future', () => eventDialog(p.id, null, 'upcoming'), 'Add a date'));
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
  if (!p.isFuture && (!lean || hist.length)) {
  evBlock = el('div', 'sheet-block');
  evBlock.append(lean
    ? blockHead('Past')
    : blockHead('Past', () => eventDialog(p.id, null, 'history'), 'Add to history'));

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
     Gone from every page, and not lost with it. A to-do is typed straight
     onto the list in Today or on an open calendar day (taskQuickAdd,
     js/task-quickadd.js), it stands in both, and it is ticked off — or put
     back — from either of those rows. What it is not any more is a fifth
     heading on a page about a person, which is what it had become: the one
     block there that was about your afternoon rather than about them. */

  root.append(...[addRow, evBlock, snBlock, upBlock, prBlock].filter(Boolean));
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
