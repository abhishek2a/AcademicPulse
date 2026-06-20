const CACHE_NAME = 'academicpulse-v1.0.42';

const STATIC_ASSETS = [
    'index.html',
    'style.css?v=18',
    'app.js?v=42',
    'auth.js?v=12',
    'export.js?v=11',
    'manifest.json',
    'icon.svg'
];

self.addEventListener('install', (event) => {
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
        // Match by pathname only (strip query) or by full pathname+search
        const assetPath = asset.includes('?') ? asset : asset;
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
                });
            })
        );
        return;
    }

    // Stale While Revalidate for fonts
    if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                    });
                    return networkResponse;
                });
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // Network First for HTML, JS, API endpoints (fallback to cache for offline)
    event.respondWith(
        fetch(event.request).then(response => {
            const resClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
            return response;
        }).catch(() => {
            return caches.match(event.request);
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CHECK_FOR_UPDATES') {
        fetch('./version.json?t=' + Date.now())
            .then(res => res.json())
            .then(updateInfo => {
                updateInfo.date = new Date().toLocaleDateString();
                event.source.postMessage({
                    type: 'UPDATE_AVAILABLE',
                    payload: updateInfo
                });
            })
            .catch(err => console.error('Error checking updates:', err));
    }

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
