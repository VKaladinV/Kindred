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

async function selectSince(table, since) {
  const r = await api(rest(table, `?select=*&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc`));
  if (!r.ok) throw new Error(`${table}: ${(await r.text()).slice(0, 140)}`);
  return r.json();
}

async function upsert(table, rows) {
  if (!rows.length) return [];
  const out = [];
  for (let i = 0; i < rows.length; i += 200) {           // keep requests modest
    const r = await api(rest(table), {
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
