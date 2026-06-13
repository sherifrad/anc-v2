const CACHE_NAME = 'anc-emr-v2-shell-25';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css?v=21',
  './js/constants.js?v=16',
  './js/crypto.js?v=16',
  './js/db.js?v=16',
  './js/calc.js?v=16',
  './js/ui.js?v=16',
  './js/auth.js?v=21',
  './js/supabase.js?v=17',
  './js/app.js?v=22',
  './js/phase3_security_config.mjs?v=2',
  './js/phase3_temporary_auth.mjs',
  './js/phase3_access_control.mjs?v=3',
  './js/phase3_access_control_ui.mjs?v=23',
  './js/phase2_runtime_config.mjs',
  './js/phase2_runtime.mjs?v=16',
  './js/phase2_cloud_adapter.mjs',
  './js/phase2_crypto_draft.mjs',
  './js/phase2_migration_draft.mjs',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => (
          await caches.match(event.request)
          || await caches.match('./index.html')
        ))
    );
    return;
  }

  if (event.request.destination === 'script' || event.request.destination === 'style') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
