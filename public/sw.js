self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(keys.map(function(key) { return caches.delete(key); }));
        })
    );
});

self.addEventListener('fetch', function(event) {
    event.respondWith(fetch(event.request));
});