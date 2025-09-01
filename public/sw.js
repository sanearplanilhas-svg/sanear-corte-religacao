const CACHE = 'pwa-supabase-login-v1';
const ASSETS = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  e.respondWith((async () => {
    const cached = await caches.match(request);
    try {
      const fresh = await fetch(request);
      if (request.method === 'GET' && fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
