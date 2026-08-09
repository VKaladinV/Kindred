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

/* Everything that changed since we last agreed.

   user_id is named in the query as well as being enforced by row-level
   security, which looks like saying the same thing twice and is not. RLS is
   what makes the answer correct; this is what makes it quick. Every one of
   these tables is indexed on (user_id, updated_at), and a query that mentions
   only updated_at leaves the leading column of that index to be supplied by a
   policy the planner has to push down first. Saying it outright makes the
   index an exact prefix match, and costs a dozen characters. */
async function selectSince(table, since, uid) {
  const r = await api(rest(table,
    `?select=*&user_id=eq.${uid}&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc`));
  if (!r.ok) throw new Error(`${table}: ${(await r.text()).slice(0, 140)}`);
  return r.json();
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
    if (!r.ok) throw new Error(`${table}: ${(await r.text()).slice(0, 140)}`);
    out.push(...await r.json());
  }
  return out;
}
