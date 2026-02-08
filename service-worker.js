// service-worker.js - PWA Service Worker

const CACHE_NAME = 'bbq-controller-v7';
const urlsToCache = [
    'index.html',
    'styles.css?v=7',
    'app.js?v=7',
    'bluetooth.js?v=7',
    'manifest.json'
];

// Install event - cache files and take over immediately
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Activate new service worker immediately
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
            .catch((error) => {
                console.error('Cache failed:', error);
            })
    );
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take over all open pages immediately
    );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Got a good response - update the cache
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // Network failed - try cache
                return caches.match(event.request)
                    .then((response) => response || caches.match('index.html'));
            })
    );
});
