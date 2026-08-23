// Service worker — network-first for HTML and data (API), cache-first only for static assets.
// v6: fixed a bug where Supabase data responses were cached cache-first and never refreshed.

const CACHE_NAME = 'weekends-v6';
const STATIC_ASSETS = ['/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  // Cache-first ONLY for same-origin static assets (icons, fonts, manifest).
  const isStaticAsset = url.origin === self.location.origin && !isHTML &&
    /\.(?:png|jpe?g|gif|svg|ico|webmanifest|json|woff2?|ttf|css)$/i.test(url.pathname);

  if (isStaticAsset) {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
        }
        return resp;
      }))
    );
    return;
  }

  // Network-first for HTML navigations AND all data/API requests (e.g. Supabase),
  // so the feed is always fresh; fall back to cache only when offline.
  e.respondWith(
    fetch(req).then(resp => {
      if (isHTML && resp && resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
      }
      return resp;
    }).catch(() => caches.match(req).then(cached => cached || (isHTML ? caches.match('/') : undefined)))
  );
});
