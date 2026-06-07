const CACHE_NAME = 'studytrack-v1';
const ASSETS_TO_CACHE = [
  './index.html',
  './style.css',
  './app.js',
  './icon.svg',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
