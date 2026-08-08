/* uses: nowIso */

const d = v => (v ? v : null);            // '' means "not set", which is null in SQL

/* A photo is a data URL, and comparing two of them in full on every sync is
   wasteful — but length alone calls two different crops of the same picture
   identical often enough to matter, and the changed one never uploads. */
const photoMark = s => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return s.length + ':' + (h >>> 0).toString(36);
};

function flatten(people, photos) {
  const rows = { people: {}, records: {}, prayers: {}, touches: {}, health: {} };
  const photoLens = {};
  for (const p of people) {
    /* Key order follows the table's columns, and the two new ones go last for
       the same reason prayed_on and released_on did below: same() compares
       these stringified. Adding them at all makes every person differ from a
       snapshot written before they existed, so the first sync after this
       update re-pushes the whole circle once. That is expected — the rows are
       identical in content, and it settles on the next run. */
    rows.people[p.id] = {
      id: p.id, name: p.name, relationship: p.relationship, circles: p.groups,
      birthday: d(p.birthday), contact: p.contact, summary: p.summary,
      cadence_days: p.cadenceDays, created_on: d(p.createdAt),
      is_self: !!p.isSelf, linked_uid: p.linkedUid || null,
      occupation: p.occupation, is_future: !!p.isFuture,
    };
    for (const [key, type] of [['medications', 'medication'], ['conditions', 'condition']]) {
      for (const h of p[key]) {
        rows.health[h.id] = {
          id: h.id, person_id: p.id, type,
          name: h.name, detail: h.detail, added_on: d(h.addedAt),
        };
      }
    }
    for (const r of p.events) {
      rows.records[r.id] = {
        id: r.id, person_id: p.id, type: r.type, starts_on: r.date,
        ends_on: d(r.endDate), kind: r.kind, title: r.title, note: r.note,
        repeats_yearly: !!r.repeatsYearly, shared: !!r.shared,
      };
    }
    for (const pr of p.prayers) {
      /* Key order follows the table's columns — prayed_on and released_on were
         added last — because same() compares these stringified, and a different
         order here would re-push every prayer on every sync. */
      rows.prayers[pr.id] = {
        id: pr.id, person_id: p.id, body: pr.text, created_on: d(pr.createdAt),
        answered_on: d(pr.answeredAt), answer_note: pr.answerNote || '',
        prayed_on: d(pr.prayedAt), released_on: d(pr.releasedAt),
        shared: !!pr.shared,
      };
    }
    for (const t of p.touches) {
      /* Person and date, exactly as before a check-in learned how it happened
         — so every row already on the server keeps the id it was written
         under, and none of that history looks deleted on the next sync. */
      const id = `${p.id}:${t.date}`;      // deterministic, so two devices agree
      /* Key order follows the table's columns: kind was added last, and same()
         compares these stringified, so a different order here would re-push
         every check-in on every sync. */
      rows.touches[id] = { id, person_id: p.id, touched_on: t.date, kind: t.kind || '' };
    }
    if (photos[p.id]) photoLens[p.id] = photoMark(photos[p.id]);
  }
  return { rows, photoLens };
}

/* rebuild the app's nested shape from flat rows */
function nest(rows) {
  const byId = {};
  const people = Object.values(rows.people).map(r => {
    const p = {
      /* circle is what the server called a single group before there could
         be several — reading it here migrates rows already up there */
      groups: r.circles?.length ? r.circles : (r.circle ? [r.circle] : []),
      id: r.id, name: r.name || 'Unnamed', relationship: r.relationship || '',
      birthday: r.birthday || '', contact: r.contact || '',
      summary: r.summary || '', cadenceDays: r.cadence_days || 0,
      createdAt: r.created_on || '', touches: [], events: [], prayers: [],
      medications: [], conditions: [],
      /* Anything flatten writes has to be read back here. nest's result
         replaces the whole in-memory list on every sync, so a column written
         and not read is not merely lost between devices — it is wiped on this
         one, seconds later. */
      isSelf: !!r.is_self, linkedUid: r.linked_uid || null,
      occupation: r.occupation || '', isFuture: !!r.is_future,
    };
    byId[r.id] = p;
    return p;
  });
  for (const r of Object.values(rows.records)) {
    const p = byId[r.person_id]; if (!p) continue;
    p.events.push({
      id: r.id, type: r.type, date: r.starts_on, endDate: r.ends_on || '',
      kind: r.kind, title: r.title, note: r.note || '', repeatsYearly: !!r.repeats_yearly,
      shared: !!r.shared,
    });
  }
  for (const r of Object.values(rows.prayers)) {
    const p = byId[r.person_id]; if (!p) continue;
    p.prayers.push({
      id: r.id, text: r.body, createdAt: r.created_on || '',
      answeredAt: r.answered_on || null, answerNote: r.answer_note || '',
      prayedAt: r.prayed_on || '', releasedAt: r.released_on || '',
      shared: !!r.shared,
    });
  }
  for (const r of Object.values(rows.touches)) {
    const p = byId[r.person_id]; if (!p) continue;
    p.touches.push({ date: r.touched_on, kind: r.kind || '' });
  }
  for (const r of Object.values(rows.health || {})) {
    const p = byId[r.person_id]; if (!p) continue;
    p[r.type === 'condition' ? 'conditions' : 'medications'].push({
      id: r.id, name: r.name || '', detail: r.detail || '', addedAt: r.added_on || '',
    });
  }
  for (const p of people) p.touches.sort((a, b) => a.date.localeCompare(b.date));
  return people;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* same() compares transcripts, and a transcript remembers what order the keys
   were written in. Row against row that is safe and deliberate — flatten
   writes every row from a single object literal, so the order is fixed by the
   source — but two maps of rows are built by different routes and their key
   order drifts apart the moment somebody else's new person arrives: it is
   appended to the merge, and lands sorted back into place by setRoster. Ask
   what they hold, not how they were written down. */
const sameMap = (a, b) => {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(k => same(a[k], b[k]));
};

/* ───────────────────────── merge rules ─────────────────────────
   Pure, so the decision table can be tested without a network.

     local  — the rows as they are on this device right now
     snap   — the rows as they were when we last agreed with the server
     remote — rows the server says changed since then

   A row differing from the snapshot was changed here, and this device
   wins; otherwise the server's version is taken. A row missing locally
   that the snapshot had was deleted here, and stays deleted.
   ──────────────────────────────────────────────────────────────── */

function mergeTable(local, snap, remote) {
  const merged = { ...local };
  for (const r of remote) {
    const localRow = local[r.id];
    const snapRow = snap[r.id];
    const changedLocally = localRow ? !same(localRow, snapRow) : !!snapRow;

    if (r.deleted_at) {
      if (!changedLocally) delete merged[r.id];   // deleted elsewhere, untouched here
      continue;
    }
    if (changedLocally) continue;                 // ours wins; a local delete stays deleted
    const { user_id, updated_at, deleted_at, ...clean } = r;
    merged[r.id] = clean;
  }
  return merged;
}

/* what this device owes the server after merging */
function planPush(merged, snap, remote, uid) {
  const upserts = [], tombstones = [];

  // rows the server just gave us, in local shape — pushing these back would
  // be a pointless write that also bumps updated_at for no reason
  const justReceived = {};
  for (const r of remote) {
    if (r.deleted_at) continue;
    const { user_id, updated_at, deleted_at, ...clean } = r;
    justReceived[r.id] = clean;
  }

  for (const [id, row] of Object.entries(merged)) {
    if (same(row, snap[id])) continue;          // unchanged since we last agreed
    if (same(row, justReceived[id])) continue;  // this is theirs, not ours
    upserts.push({ ...row, user_id: uid, deleted_at: null });
  }
  for (const id of Object.keys(snap)) {
    if (merged[id]) continue;
    if (remote.some(r => r.id === id && r.deleted_at)) continue;  // already tombstoned there
    tombstones.push({ ...snap[id], user_id: uid, deleted_at: nowIso() });
  }
  return { upserts, tombstones };
}

/* Everything above was decided from a copy of the roster taken before the
   first request went out, and on a slow connection several sentences can be
   written between then and now — the summary box saves as you type, and typing
   does not stop because a sync started. Landing that copy over live text is
   what "it undid what I wrote" looks like from the outside.

   So take one more look at memory before landing. A row that has moved since
   the freeze was moved by the person using the app, and theirs is the newer of
   the two — the same rule mergeTable applies through changedLocally, with the
   freeze standing in for the snapshot.

   The two loops are deliberately asymmetrical. Carrying is driven by what is
   live, so a row that arrived from the server during the window is left where
   the merge put it. Deleting is driven by what was frozen, because only a row
   that was here when we started and is gone now was deleted here. Written the
   other way round — "anything not live has gone" — every arrival from another
   device would be thrown away in the same breath as it landed. */
function carryEdits(merged, frozen, live) {
  const out = { ...merged };
  for (const [id, row] of Object.entries(live)) if (!same(row, frozen[id])) out[id] = row;
  for (const id of Object.keys(frozen)) if (!live[id]) delete out[id];
  return out;
}

