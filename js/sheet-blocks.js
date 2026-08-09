/* uses: HEALTH KINDS · el monthYear prettyDate · byId notifyMutate queueSave
   · hasPhoto putPhotoDataUrl
   · normalisePrayer · toast · healthDialog · renderAll
*/

function blockHead(title, addLabel, onAdd) {
  const head = el('div', 'block-head');
  head.append(el('h3', null, title));
  if (addLabel) {
    const btn = el('button', 'link-btn', addLabel);
    btn.type = 'button';
    btn.onclick = onAdd;
    head.append(btn);
  }
  return head;
}

function healthBlock(p, key) {
  const meta = HEALTH[key];
  const block = el('div', 'sheet-block');
  block.append(blockHead(meta.title, meta.addLabel, () => healthDialog(p.id, key, null)));

  /* There is no pill on these and there never will be. Everything else on
     your page can be shared one item at a time; this cannot be shared at all,
     and saying so here is worth more than leaving it to be inferred from the
     absence of a button. */
  if (p.isSelf) block.append(el('p', 'block-note', 'Stays on your devices. Never shared, whoever you link with.'));

  if (!p[key].length) {
    block.append(el('p', 'quiet-note', meta.empty));
    return block;
  }

  const list = el('div', 'health-list');
  p[key].forEach(h => {
    const row = el('button', 'health-row');
    row.type = 'button';
    row.title = 'Edit this';
    row.onclick = () => healthDialog(p.id, key, h.id);
    row.append(el('span', 'health-glyph', KINDS.health.glyph));

    const body = el('span', 'health-body');
    body.append(el('span', 'health-name', h.name));
    if (h.detail) body.append(el('span', 'health-detail', h.detail));
    row.append(body);
    list.append(row);
  });
  block.append(list);
  return block;
}

/* What p's linked account has chosen to publish. `pub` is the payload as it
   arrived from the server — see projectSelf in sync.js for its shape — and
   everything drawn from it is read-only: no title is clickable, no row has
   a tick or a cross, no form invites a line to be added. The one door
   through is copying a prayer onto your own list, which is a real write on
   your side and none at all on theirs. */
function fromThemBlock(root, p, pub) {
  const block = el('div', 'sheet-block is-theirs');
  const head = el('div', 'block-head');
  head.append(el('h3', null, `From ${(pub.name || p.name).split(' ')[0]}`));
  block.append(head);
  block.append(el('p', 'theirs-sub', 'Theirs, not yours — it changes when they change it.'));

  /* Their face, and the one place it can be made yours. Until this is tapped
     the picture is on loan: avatar() will draw it wherever they appear, and it
     will change under you the day they change it. Tapping copies it into your
     own photo store under their id, where it becomes an ordinary crop — it
     syncs to your other devices on the next run, it survives the link ending,
     and it stops moving.

     Offered only while you have none of your own, because a photo you framed
     yourself already outranks this one everywhere it is drawn. */
  if (pub.photo) {
    const who = el('div', 'theirs-face');
    const shot = el('div', 'thumb');
    const img = el('img');
    img.src = pub.photo;
    img.alt = '';
    shot.append(img);
    who.append(shot);

    if (!hasPhoto(p.id)) {
      const keep = el('button', 'link-btn', 'use this as their photo');
      keep.type = 'button';
      keep.onclick = async () => {
        await putPhotoDataUrl(p.id, pub.photo);
        notifyMutate();
        renderAll();
        toast(`That is ${(pub.name || p.name).split(' ')[0]}’s photo now`);
      };
      who.append(keep);
    }
    block.append(who);
  }

  if (pub.summary) block.append(el('p', 'theirs-summary', pub.summary));

  const dated = [...(pub.seasons || []), ...(pub.upcoming || [])];
  if (dated.length) {
    const list = el('div', 'theirs-dates');
    dated.forEach(r => {
      const row = el('div', 'theirs-date-row');
      row.append(el('span', 'glyph', (KINDS[r.kind] || KINDS.other).glyph));
      const body = el('span');
      body.append(el('b', null, r.title));
      const when = r.type === 'season'
        ? `since ${monthYear(r.date)}`
        : prettyDate(r.date);
      body.append(document.createTextNode(' — ' + when));
      row.append(body);
      list.append(row);
    });
    block.append(list);
  }

  if (pub.prayers?.length) {
    const list = el('div', 'theirs-prayers');
    pub.prayers.forEach(pr => {
      const row = el('div', 'theirs-prayer-row');
      row.append(el('span', 'prayer-text', pr.text));
      const already = p.prayers.some(x => x.id === pr.id || x.text.trim() === pr.text.trim());
      const add = el('button', 'link-btn', already ? 'on your list' : 'add to my prayer list');
      add.type = 'button';
      add.disabled = already;
      if (!already) add.onclick = () => {
        byId(p.id).prayers.push(normalisePrayer({ text: pr.text }));
        queueSave();
        renderAll();
        toast('Added to your prayer list');
      };
      row.append(add);
      list.append(row);
    });
    block.append(list);
  }

  if (!pub.summary && !dated.length && !pub.prayers?.length) {
    block.append(el('p', 'quiet-note', 'Nothing shared yet.'));
  }

  root.append(block);
}

