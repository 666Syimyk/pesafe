const CACHE = 'pesafe-v2.6.0';
const ASSETS = ['./', './index.html', './style.css', './app.js', './core.js', './calls.js', './storage.js', './retention.js', './recordings.js', './privacy.js', './sounds.js', './countdown-audio.js', './sensors.js', './recorder.js', './runtime-config.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
const paths = new Set(ASSETS.map(asset => new URL(asset, self.location.href).pathname));
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
// Новая версия не перехватывает открытую SOS-сессию принудительно.
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('pesafe-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !paths.has(url.pathname) || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(async () => await caches.match(event.request, { ignoreSearch: true }) || new Response('PeSafe недоступен. Для экстренного звонка используйте телефон: 112.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});
