/* QuiltStudio offline worker: keeps the app working at the cutting table with no signal.
 * Pages: network first, fall back to cache. Built assets (hashed): cache first. */
const CACHE = 'quiltstudio-v2';
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const page = await fetch('/', { cache: 'reload' });
    if (!page.ok) throw new Error('App shell unavailable');
    const html = await page.clone().text();
    const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match => match[1]);
    // The first visit loads JS before the worker controls the page. Cache that build
    // explicitly, so taking the freshly installed app offline does not lose its shell.
    await cache.addAll(['/favicon.svg', '/manifest.webmanifest', ...assets]);
    await cache.put('/', page);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('/', copy)); } return r; })
      .catch(() => caches.match('/')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
