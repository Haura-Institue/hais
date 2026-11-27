// Naikkan VERSION setiap rilis (contoh v3.5.2).
const VERSION = 'haura-v3.5.4';
const CACHE = VERSION + '-shell';
const BASE = new URL('./', self.location.href);
const FILES = ["./", "index.html", "assets/app.css", "assets/logo.png", "manifest.webmanifest", "js/app.js", "js/finance.js", "js/pwa.js", "js/backend.js", "js/drive-config.js", "js/drive-client.js", "vendor/pdf.js", "assets/icons/icon-192.png", "assets/icons/apple-touch-icon.png", "assets/icons/icon-512.png", "assets/icons/maskable-192.png", "assets/icons/maskable-512.png"].map(path => new URL(path, BASE).href);
const PUBLIC = new Set(FILES);

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('haura-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  // Jangan intersep API Google, database, upload, video, atau blob privat.
  if (req.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.open(CACHE)).match(new URL('index.html', BASE).href)));
    return;
  }
  if (!PUBLIC.has(url.href)) return;
  if (url.pathname.endsWith('.js')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(req);
        if (response.ok && response.type === 'basic') await cache.put(req, response.clone());
        return response;
      } catch {
        return cache.match(req);
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const stored = await cache.match(req);
    if (stored) return stored;
    const response = await fetch(req);
    if (response.ok && response.type === 'basic') await cache.put(req, response.clone());
    return response;
  })());
});
