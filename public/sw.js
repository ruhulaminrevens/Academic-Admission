// Service worker %%VERSION%% — static assets cache-first, pages network-first with offline fallback. /api is never cached.
const VERSION = '%%VERSION%%';
const STATIC = 'aa-static-' + VERSION;
const PAGES = 'aa-pages-' + VERSION;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(PAGES).then(cache => cache.addAll(['/offline'].filter(() => false))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('aa-') && key !== STATIC && key !== PAGES) await caches.delete(key);
    await self.clients.claim();
  })());
});

const offlinePage = () => new Response(`<!doctype html><html lang="bn"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>
<body style="font-family:system-ui;background:#060912;color:#e9eefb;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">
<div><h1>আপনি অফলাইনে আছেন</h1><p>ইন্টারনেট সংযোগ ফিরলে আবার চেষ্টা করুন। আগে দেখা পাতাগুলো এখনও খুলবে।</p><p><a style="color:#22d3ee" href="/">Home</a></p></div></body></html>`,
  { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/signin') || url.pathname.startsWith('/private/')) return;

  if (url.pathname.startsWith('/assets/') || /\.(?:png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(caches.open(STATIC).then(async cache => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        if (res.ok && url.pathname !== '/account' && url.pathname !== '/admin') { const copy = res.clone(); caches.open(PAGES).then(cache => cache.put(request, copy)); }
        return res;
      } catch {
        return (await caches.match(request)) || (await caches.match('/')) || offlinePage();
      }
    })());
  }
});
