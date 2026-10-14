/* uses: ANON API · Session refresh */

/* every request refreshes an expiring token first, and retries once on 401 */
async function api(path, opts = {}, retry = true) {
  let s = Session.get();
  if (!s) throw new Error('Not signed in');
  if (s.expires_at - Date.now() < 60000) s = (await refresh()) || s;

  const r = await fetch(API + path, {
    ...opts,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${s.access_token}`,
      ...(opts.headers || {}),
    },
  });
  if (r.status === 401 && retry) {
    if (await refresh()) return api(path, opts, false);
    throw new Error('Session expired — please sign in again');
  }
  return r;
}

const rest = (table, qs = '') => `/rest/v1/${table}${qs}`;

/* A request that did not go through, carrying the HTTP status it came back
   with. The sync asks it one question — was this table simply not there
   (404) — and that is the difference between a database that has not had
   supabase/communities.sql run yet and one that is actually broken. */
async function refused(table, r) {
  const e = new Error(`${table}: ${(await r.text()).slice(0, 140)}`);
  e.status = r.status;
  return e;
}

/* Supabase hands back at most this many rows a request unless asked for a
   page at a time. Its own default, so a project nobody has reconfigured
   agrees with it. */
const PULL_PAGE = 1000;

/* Everything that changed since we last agreed.

   user_id is named in the query as well as being enforced by row-level
   security, which looks like saying the same thing twice and is not. RLS is
   what makes the answer correct; this is what makes it quick. Every one of
   these tables is indexed on (user_id, updated_at), and a query that mentions
   only updated_at leaves the leading column of that index to be supplied by a
   policy the planner has to push down first. Saying it outright makes the
   index an exact prefix match, and costs a dozen characters.

   A page at a time. This used to be one request, and the server quietly stops
   at a thousand rows — with one watermark for every table, the rows past that
   line were then never asked about again until somebody happened to edit
   them. A first sync of a large circle could lose check-ins that way, and a
   year of attendance is more than a thousand ticks on its own.

   Each page after the first asks again from the last timestamp it saw,
   inclusive, so rows sharing that timestamp are never stepped over. They come
   back twice and are counted once. Rows written together share a timestamp
   only as far as one request's worth (upsert, below, sends two hundred at a
   time), which is well under a page — so every page brings something new, and
   one that brings nothing new means there is nothing left. */
async function selectSince(table, since, uid) {
  const got = new Map();
  let from = since, op = 'gt';
  for (;;) {
    const r = await api(rest(table,
      `?select=*&user_id=eq.${uid}&updated_at=${op}.${encodeURIComponent(from)}`
      + `&order=updated_at.asc,id.asc&limit=${PULL_PAGE}`));
    if (!r.ok) throw await refused(table, r);
    const page = await r.json();
    let fresh = 0;
    for (const row of page) {
      const had = got.get(row.id);
      if (!had || had.updated_at !== row.updated_at) { got.set(row.id, row); fresh++; }
    }
    if (page.length < PULL_PAGE || !fresh) return [...got.values()];
    from = page[page.length - 1].updated_at;
    op = 'gte';
  }
}

async function upsert(table, rows) {
  if (!rows.length) return [];
  const out = [];
  for (let i = 0; i < rows.length; i += 200) {           // keep requests modest
    /* The rows come back so the watermark can be moved past what we just
       wrote, and updated_at is the only thing ever read off them — asking for
       the whole representation meant every summary and every note we had just
       sent was sent straight back to us, which on a first sync of a large
       circle is the same body twice for no reason. */
    const r = await api(rest(table, '?select=updated_at'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(rows.slice(i, i + 200)),
    });
    if (!r.ok) throw await refused(table, r);
    out.push(...await r.json());
  }
  return out;
}
