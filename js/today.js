/* uses: $ aheadWords el today · people · babiesDue datesAhead · avatar
   · quiet
*/

function todayRow(p, { when = '', calm = false, sub = '' } = {}) {
  const row = el('div', 'today-row');
  row.append(avatar(p, 'thumb', true, 'thumb'));

  const who = el('div', 'who');
  who.append(el('strong', null, p.name));
  who.append(el('small', null, sub || p.relationship || p.groups.join(' · ')));
  row.append(who);

  if (when) row.append(el('span', 'when' + (calm ? ' calm' : ''), when));
  return row;
}

function block(title, count) {
  const b = el('div', 'today-block');
  const h = el('h3');
  h.append(document.createTextNode(title));
  if (count) h.append(el('em', null, count));
  b.append(h);
  const list = el('div', 'today-list');
  b.append(list);
  b._list = list;
  return b;
}

/* The pip on the Today tab. Lifted out of renderToday because it is the one
   thing that page paints which is not on that page: the tab is on screen
   whichever view you are reading, so this has to stay true even on the edits
   that no longer bother rebuilding a list nobody is looking at.

   A pregnancy inside its last fortnight counts too — it is the one date worth
   a pip before the day itself arrives. */
function paintTodayCount(ahead = datesAhead(45)) {
  const count = ahead.filter(x => x.inDays === 0).length + babiesDue(14).length;
  const badgeEl = $('#tab-count');
  badgeEl.hidden = count === 0;
  badgeEl.textContent = count;
}

function renderToday() {
  const body = $('#today-body');
  body.classList.toggle('no-entry', quiet);
  body.textContent = '';
  $('#today-date').textContent = new Date().toLocaleDateString(undefined,
    { weekday: 'long', day: 'numeric', month: 'long' });

  /* Birthdays and dated records, and nothing else. Who you owe a call is the
     circle's question, and it answers it by putting them first — asking it
     twice, in two places, only ever made both easier to stop reading. */
  const ahead = datesAhead(45);

  const groups = [
    ['Today',     x => x.inDays === 0],
    ['This week', x => x.inDays > 0 && x.inDays <= 7],
    ['Later',     x => x.inDays > 7],
  ];

  groups.forEach(([title, pick]) => {
    const rows = ahead.filter(pick);
    if (!rows.length) return;
    const b = block(title, title === 'Today' ? String(rows.length) : '');
    rows.forEach(x => b._list.append(todayRow(x.p, {
      when: x.inDays === 0 ? `${x.glyph} today` : aheadWords(x.inDays),
      calm: x.inDays > 7,
      sub: x.sub,
    })));
    body.append(b);
  });

  if (!ahead.length) {
    body.append(el('p', 'all-clear', people.length
      ? 'Nothing to know about today.'
      : 'Add someone to your circle and this page will start looking after you.'));
  }

  /* The list this page just worked out, handed on rather than worked out
     again — same answer, one walk of everybody instead of two. */
  paintTodayCount(ahead);
}

/* ═══════════════════════════ RENDER: CALENDAR ═════════════
   The same dates Today lists, laid out as a month so you can see the shape
   of one — which week is crowded, how far off the next thing is. It reads
   the data and changes none of it. */

