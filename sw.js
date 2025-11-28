const CACHE_NAME = 'dni-scanner-v3';
const LOCAL_ASSETS = ['./', './index.html', './css/styles.css', './js/app.js', './js/camera.js', './js/db.js', './js/locations.js', './js/mrz.js', './js/ocr-front.js', './manifest.json', './assets/icon.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(LOCAL_ASSETS))
            .then(() => self.skipWaiting())
            .catch((err) => {
                console.warn('SW install error:', err);
                self.skipWaiting();
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    const isLocal = url.startsWith(self.location.origin);
    
    if (isLocal) {
        // Cache first for local assets
        event.respondWith(
            caches.match(event.request)
                .then((r) => r || fetch(event.request))
                .catch(() => new Response('Offline'))
        );
    } else {
        // Network first for CDN, cache fallback
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(event.request, response.clone()))
                            .catch(() => {});
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request)
                        .then((r) => r || new Response('Offline', { status: 503 }));
                })
        );
    }
});
