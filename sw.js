const CACHE_NAME = 'academicpulse-v1.0.97';

const STATIC_ASSETS = [
    'index.html',
    'style.css?v=23',
    'app.js?v=118',
    'auth.js?v=14',
    'export.js?v=13',
    'manifest.json',
    'icon.svg'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS).catch(err => console.warn('Static assets cache warning:', err)))
    );
});

self.addEventListener('activate', (event) => {
    // Chain both operations into a single waitUntil so clients.claim() is guaranteed
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignore non-GET and extension requests
    if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

    // Cache First for static assets — match by pathname + search (handles ?v= versioned URLs)
    const fullPath = url.pathname + url.search;
    const isStaticAsset = STATIC_ASSETS.some(asset => {
        return fullPath.endsWith(asset) || url.pathname.endsWith(asset.split('?')[0]);
    });

    if (isStaticAsset) {
        event.respondWith(
            caches.match(event.request).then(response => {
                return response || fetch(event.request).then(fetchRes => {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, fetchRes.clone());
                        return fetchRes;
                    });
                }).catch(() => {
                    // Fallback to cache without query string if versioned fetch fails offline
                    return caches.match(url.pathname);
                });
            })
        );
        return;
    }

    // Network First for all other requests (APIs, dynamic data)
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Clone and cache successful GET responses
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Offline fallback: try cache
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) return cachedResponse;
                    // If HTML request fails, return cached index.html
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return caches.match('index.html');
                    }
                    return new Response('Network error occurred', {
                        status: 408,
                        headers: { 'Content-Type': 'text/plain' }
                    });
                });
            })
    );
});

// Handle update check requests from the application
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
