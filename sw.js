/* Kindred service worker — makes the app work offline once loaded.
   Bump CACHE when you change any of the shell files. */

const CACHE = 'kindred-v8';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'config.js',
  'sync.js',
  'logo-mark.png',
  'icon-32.png',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png',
  'manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Google Fonts: cache after first success so offline keeps the typography.
  const isFont = /fonts\.(googleapis|gstatic)\.com/.test(req.url);

  if (isFont) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => hit))
    );
    return;
  }

  if (new URL(req.url).origin !== location.origin) return;

  // App shell: network first, so an updated file is picked up immediately.
  // The cache is the fallback that makes the app work with no connection.
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
  );
});
