/* uses: people photos shared */

const Store = (() => {
  let db = null, mode = 'memory', blocked = false;
  const mem = { people: null, photos: {}, snapshot: null, shared: {} };

  function openDb() {
    return new Promise(resolve => {
      let req;
      try { req = indexedDB.open('kindred', 2); }
      catch { return resolve(null); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
        if (!d.objectStoreNames.contains('originals')) d.createObjectStore('originals');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      /* another tab still holds the old version open — it is not that the
         database is unusable, only that it is busy. See init(). */
      req.onblocked = () => { blocked = true; resolve(null); };
      setTimeout(() => resolve(req.result || null), 2500);
    });
  }

  const idb = (storeName, fn, write = false) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, write ? 'readwrite' : 'readonly');
    const rq = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(rq ? rq.result : undefined);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

  return {
    get mode() { return mode; },
    get blocked() { return blocked; },

    async init() {
      db = await openDb();
      if (db) {
        try { await idb('kv', s => s.get('people')); mode = 'indexeddb'; return; }
        catch { db = null; }
      }
      /* The real data is in a database we could not open, not in localStorage.
         Writing there would quietly start a second, divergent copy, so stay
         in memory and say so — closing the other tab fixes it. */
      if (blocked) { mode = 'memory'; return; }
      try {
        localStorage.setItem('kindred:probe', '1');
        localStorage.removeItem('kindred:probe');
        mode = 'localstorage';
      } catch { mode = 'memory'; }
    },

    async loadPeople() {
      if (mode === 'indexeddb') return (await idb('kv', s => s.get('people'))) || [];
      if (mode === 'localstorage') {
        try { return JSON.parse(localStorage.getItem('kindred:people') || '[]'); }
        catch { return []; }
      }
      return mem.people || [];
    },

    async savePeople(people) {
      if (mode === 'indexeddb') return idb('kv', s => s.put(people, 'people'), true);
      if (mode === 'localstorage') return localStorage.setItem('kindred:people', JSON.stringify(people));
      mem.people = people;
    },

    async loadPhotos() {
      if (mode === 'indexeddb') {
        const out = {};
        await new Promise((resolve, reject) => {
          const tx = db.transaction('photos', 'readonly');
          tx.objectStore('photos').openCursor().onsuccess = e => {
            const c = e.target.result;
            if (c) { out[c.key] = c.value; c.continue(); }
          };
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        return out;
      }
      if (mode === 'localstorage') {
        try { return JSON.parse(localStorage.getItem('kindred:photos') || '{}'); }
        catch { return {}; }
      }
      return mem.photos;
    },

    async savePhoto(id, dataUrl) {
      if (mode === 'indexeddb') return idb('photos', s => s.put(dataUrl, id), true);
      if (mode === 'localstorage') {
        const all = await this.loadPhotos();
        all[id] = dataUrl;
        return localStorage.setItem('kindred:photos', JSON.stringify(all));
      }
      mem.photos[id] = dataUrl;
    },

    async deletePhoto(id) {
      if (mode === 'indexeddb') return idb('photos', s => s.delete(id), true);
      if (mode === 'localstorage') {
        const all = await this.loadPhotos();
        delete all[id];
        return localStorage.setItem('kindred:photos', JSON.stringify(all));
      }
      delete mem.photos[id];
    },

    /* The uncropped picture, kept only so the focus can be moved again.
       IndexedDB only — a full-size image per person would fill the
       localStorage budget several times over, and the crop still works
       without one, just starting from the square. */
    async loadOriginal(id) {
      if (mode !== 'indexeddb') return null;
      try { return (await idb('originals', s => s.get(id))) || null; }
      catch { return null; }
    },

    async saveOriginal(id, dataUrl) {
      if (mode !== 'indexeddb') return;
      try { await idb('originals', s => s.put(dataUrl, id), true); }
      catch { /* out of room — the crop itself is already saved */ }
    },

    async deleteOriginal(id) {
      if (mode !== 'indexeddb') return;
      try { await idb('originals', s => s.delete(id), true); } catch { /* gone already */ }
    },

    /* what the sync layer last agreed with the server — see sync.js */
    async loadSnapshot() {
      if (mode === 'indexeddb') return (await idb('kv', s => s.get('syncSnapshot'))) || null;
      if (mode === 'localstorage') {
        try { return JSON.parse(localStorage.getItem('kindred:snapshot') || 'null'); }
        catch { return null; }
      }
      return mem.snapshot || null;
    },

    async saveSnapshot(snap) {
      if (mode === 'indexeddb') {
        return snap === null
          ? idb('kv', s => s.delete('syncSnapshot'), true)
          : idb('kv', s => s.put(snap, 'syncSnapshot'), true);
      }
      if (mode === 'localstorage') {
        return snap === null
          ? localStorage.removeItem('kindred:snapshot')
          : localStorage.setItem('kindred:snapshot', JSON.stringify(snap));
      }
      mem.snapshot = snap;
    },

    /* What the people you have linked with have published, keyed by their
       account. Kept apart from `people` on purpose: it is theirs, it is
       read-only, and it must never find its way into the snapshot the push
       is planned from. Losing it costs nothing — the next sync fetches it
       again — so it is cached for the sake of opening the app offline and
       for no other reason. */
    async loadShared() {
      if (mode === 'indexeddb') return (await idb('kv', s => s.get('shared'))) || {};
      if (mode === 'localstorage') {
        try { return JSON.parse(localStorage.getItem('kindred:shared') || '{}'); }
        catch { return {}; }
      }
      return mem.shared || {};
    },

    async saveShared(map) {
      if (mode === 'indexeddb') return idb('kv', s => s.put(map || {}, 'shared'), true);
      if (mode === 'localstorage') {
        try { return localStorage.setItem('kindred:shared', JSON.stringify(map || {})); }
        catch { return; }        // a full quota must not break a sync
      }
      mem.shared = map || {};
    },

    getPref(k, d = null) {
      try { return localStorage.getItem('kindred:' + k) ?? d; } catch { return d; }
    },
    setPref(k, v) {
      try { localStorage.setItem('kindred:' + k, v); } catch { /* private mode */ }
    },
  };
})();

/* ─────────────────────────── state ─────────────────────────── */

