// Word Builder service worker — runtime assets only.
const BUILD = new URLSearchParams(self.location.search).get('v') || 'dev';
const CACHE = 'ealvocab-b' + BUILD;
const ASSETS = [
  './',
  './index.html',
  './build.js',
  './manifest.webmanifest',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/store.js',
  './assets/js/supabase.js',
  './assets/js/speech.js',
  './assets/js/privacy-guard.js',
  // Version-stamped to match the URL the app asks for, so a new release
  // precaches its own words rather than inheriting the previous release's.
  './data/vocab.json?v=' + BUILD,
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(ASSETS.map((url) =>
        fetch(url, { cache: 'reload' })
          .then((response) => response && response.ok ? cache.put(url, response) : null)
          .catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;

  // vocab.json is the largest startup asset. Once the current build has
  // cached it, serve that copy immediately instead of blocking every launch
  // on a fresh multi-megabyte network request. A bumped BUILD creates and
  // preloads a new cache, so releases still receive their matching data.
  const isVocab = /\/data\/vocab\.json$/.test(url.pathname);
  if (isVocab) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached ||
        fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }))
    );
    return;
  }

  const isShell = event.request.mode === 'navigate' ||
    /\.(?:html|js|css)$|\/$/.test(url.pathname);

  if (isShell) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
