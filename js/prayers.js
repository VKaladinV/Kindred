/* uses: $ agoWords el plural prettyDate today
   · byId futures people queueSave
   · answeredPrayers openPrayers prayedToday releasedPrayers · avatar
   · reopenPrayer togglePrayed · askRelease · quiet renderAll
*/

function toggleShared(personId, kind, recId) {
  const per = byId(personId);
  if (!per || !per.isSelf) return;
  const rec = (kind === 'prayer' ? per.prayers : per.events).find(x => x.id === recId);
  if (!rec) return;
  rec.shared = !rec.shared;
  queueSave();
  renderAll();
}

function sharePill(p, kind, rec) {
  const b = el('button', 'share-pill' + (rec.shared ? ' is-on' : ''));
  b.type = 'button';
  b.setAttribute('aria-pressed', String(!!rec.shared));
  b.append(el('span', 'glyph', rec.shared ? '◉' : '◌'),
           document.createTextNode(rec.shared ? 'shared' : 'private'));
  b.title = rec.shared
    ? 'The people you link with will see this. Tap to keep it to yourself.'
    : 'Only you can see this. Tap to let the people you link with see it.';
  b.onclick = () => toggleShared(p.id, kind, rec.id);
  return b;
}

function prayerLine(p, pr, state = 'open') {
  const line = el('div', 'prayer-line is-' + state);

  const prayedNow = state === 'open' && pr.prayedAt === today();
  if (prayedNow) line.classList.add('is-prayed');

  const tick = el('button', 'tick');
  tick.type = 'button';
  tick.title = state !== 'open' ? 'Put it back on the list'
    : prayedNow ? 'You prayed for this today — tap to take it back'
    : 'Prayed for this today';
  tick.setAttribute('aria-label', tick.title);
  tick.setAttribute('aria-pressed', String(prayedNow));
  tick.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 13l4.5 4.5L19 7"/></svg>';
  tick.onclick = () => state === 'open' ? togglePrayed(p.id, pr.id) : reopenPrayer(p.id, pr.id);

  const body = el('div', 'prayer-text');
  body.append(document.createTextNode(pr.text));
  if (state === 'answered' && pr.answerNote) body.append(el('p', 'answer-note', '“' + pr.answerNote + '”'));
  if (state === 'open' && pr.prayedAt) {
    body.append(el('p', 'prayed-note', prayedNow ? 'prayed today' : `last prayed ${agoWords(pr.prayedAt)}`));
  }
  /* Only what you are still carrying can be shared. Something answered or let
     go is a closed thing, and publishing it later would be a strange way to
     tell somebody. */
  if (p.isSelf && state === 'open') body.append(sharePill(p, 'prayer', pr));

  const age = el('span', 'prayer-age',
    state === 'answered' ? prettyDate(pr.answeredAt)
    : state === 'released' ? prettyDate(pr.releasedAt)
    : agoWords(pr.createdAt));

  line.append(tick, body, age);

  if (state === 'open') {
    const rel = el('button', 'prayer-x', '×');
    rel.type = 'button';
    rel.title = 'Stop carrying this';
    rel.setAttribute('aria-label', `Stop carrying “${pr.text}”`);
    rel.onclick = () => askRelease(p.id, pr.id, pr.text);
    line.append(rel);
  }

  return line;
}

/* An archive card: the same person's head, and their closed prayers under it.
   Both archives are built the same way and differ only in what they hold. */
function archiveCards(box, pick, sortKey, state, list = people) {
  let count = 0;
  list
    .filter(p => pick(p).length)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(p => {
      const done = [...pick(p)].sort((a, b) => (a[sortKey] < b[sortKey] ? 1 : -1));
      count += done.length;
      const card = el('div', 'pcard');
      const head = el('div', 'pcard-head');
      head.append(avatar(p, 'thumb', true, 'thumb'));
      const idBox = el('div');
      idBox.append(el('h3', null, p.name));
      head.append(idBox);
      card.append(head);
      done.forEach(pr => card.append(prayerLine(p, pr, state)));
      box.append(card);
    });
  return count;
}

function renderPrayers() {
  const openWrap = $('#prayer-open');
  const ansWrap = $('#prayer-answered');
  const relWrap = $('#prayer-released');
  [openWrap, ansWrap, relWrap].forEach(w => {
    w.classList.toggle('no-entry', quiet);
    w.textContent = '';
  });

  /* Someone flagged as a future connection can still carry a prayer — this is
     the one place their list joins the ordinary circle's, since a unified
     "everything I'm praying for" view is the point of this tab. */
  const withOpen = [...people, ...futures].filter(p => openPrayers(p).length).sort((a, b) => a.name.localeCompare(b.name));

  withOpen.forEach((p, i) => {
    const card = el('div', 'pcard');
    card.style.setProperty('--i', i);

    const head = el('div', 'pcard-head');
    head.append(avatar(p, 'thumb', true, 'thumb'));
    const idBox = el('div');
    idBox.append(el('h3', null, p.name));
    if (p.relationship) idBox.append(el('div', 'who', p.relationship));
    head.append(idBox);
    card.append(head);

    /* Oldest first, and ticking one never reorders the list — a line that
       jumped away from the finger that just tapped it would be its own bug. */
    openPrayers(p)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .forEach(pr => card.append(prayerLine(p, pr, 'open')));

    openWrap.append(card);
  });

  const withFutures = [...people, ...futures];
  const answeredCount = archiveCards(ansWrap, answeredPrayers, 'answeredAt', 'answered', withFutures);
  const releasedCount = archiveCards(relWrap, releasedPrayers, 'releasedAt', 'released', withFutures);

  $('#answered-wrap').hidden = answeredCount === 0;
  $('#answered-count').textContent = answeredCount;
  $('#released-wrap').hidden = releasedCount === 0;
  $('#released-count').textContent = releasedCount;

  const total = withOpen.reduce((n, p) => n + openPrayers(p).length, 0);
  const prayed = withOpen.reduce((n, p) => n + prayedToday(p).length, 0);
  $('#prayer-sub').textContent = total
    ? `${plural(total, 'thing', 'things')} for ${plural(withOpen.length, 'person', 'people')}`
      + (prayed ? ` · ${prayed} prayed for today` : '')
    : '';
  $('#prayer-blank').hidden = total > 0 || answeredCount > 0 || releasedCount > 0;
}

/* ═══════════════════════════ RENDER: TODAY ════════════════ */

/* Shared by Today and the calendar. The thumb opens the person; the row
   itself does nothing, because a date is something to know rather than
   something to action. */
