/* Marni Web Composer service worker: offline app shell.
 * - Page navigations: network first (always the latest deploy), cached copy when offline.
 * - Build assets (hashed file names), AI model and icons: cache first (they never change in place).
 * - Google Fonts: stale-while-revalidate.
 * Instrument samples are cached by the app itself (Cache Storage "marni-soundfonts-*").
 */
const VERSION = 'v1';
const SHELL_CACHE = `marni-shell-${VERSION}`;
const SCOPE = self.registration.scope; // e.g. https://host/ or https://host/marni-web-composer/

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([SCOPE, `${SCOPE}MWC_Logo.svg`, `${SCOPE}manifest.webmanifest`]))
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('marni-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

const isCacheFirst = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.includes('/assets/') || url.pathname.includes('/models/') || /\.(svg|png|webmanifest)$/.test(url.pathname));

const isFont = (url) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(SCOPE, fresh.clone());
          return fresh;
        } catch {
          return (await cache.match(SCOPE)) || Response.error();
        }
      })()
    );
    return;
  }

  if (isCacheFirst(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })()
    );
    return;
  }

  if (isFont(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(request);
        const refresh = fetch(request)
          .then((res) => {
            if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || refresh;
      })()
    );
  }
});
