/* Fellowship service worker — makes the app work offline once loaded.
   Bump CACHE when you change any of the shell files. */

const CACHE = 'kindred-v20';

/* The app is the list of files below, in no particular order here — the load
   order that matters is the one in index.html. A file missing from this list
   is not a broken app, only one that has to reach the network for that file
   before it can start, so keep this in step with js/ and css/. */
const SHELL = [
  './',
  'index.html',
  'config.js',
  'css/base.css',
  'css/nav.css',
  'css/masthead.css',
  'css/circle.css',
  'css/lists.css',
  'css/calendar.css',
  'css/sheet.css',
  'css/controls.css',
  'css/lock.css',
  'js/constants.js',
  'js/util.js',
  'js/store.js',
  'js/photo-store.js',
  'js/state.js',
  'js/normalise.js',
  'js/model.js',
  'js/imaging.js',
  'js/ui.js',
  'js/badge.js',
  'js/hex.js',
  'js/circle-flip.js',
  'js/filters.js',
  'js/circle.js',
  'js/prayers.js',
  'js/today.js',
  'js/calendar.js',
  'js/layers.js',
  'js/sheet-blocks.js',
  'js/sheet.js',
  'js/check-in.js',
  'js/invite.js',
  'js/mutations.js',
  'js/person-dialog.js',
  'js/cropper.js',
  'js/save-person.js',
  'js/event-dialog.js',
  'js/health-dialog.js',
  'js/backup.js',
  'js/notify.js',
  'js/lock-crypto.js',
  'js/lock.js',
  'js/views.js',
  'js/wire.js',
  'js/boot.js',
  'js/sync/config.js',
  'js/sync/session.js',
  'js/sync/rest.js',
  'js/sync/invites.js',
  'js/sync/shape.js',
  'js/sync/photos.js',
  'js/sync/publish.js',
  'js/sync/core.js',
  'js/sync/ui.js',
  'js/sync/boot.js',
  'js/sync/install.js',
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
