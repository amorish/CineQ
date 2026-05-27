const CACHE_NAME = 'cineq-v5';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.html',
  '/assets/css/style.css',
  '/assets/css/ticket.css',
  '/assets/js/app.js',
  '/assets/images/cineqFavicon.png',
  '/assets/images/cineqLogoDarkmode.png',
  '/assets/images/cineqLogoLightmode.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
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
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests from the same origin
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Exclude API requests from cache
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Network First for HTML (Navigation requests) so users always get the latest version if online
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Stale-While-Revalidate for CSS/JS/Images
  // Serves instantly from cache, then updates the cache in the background
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        }).catch(() => {
          // Ignore network errors when updating cache in background
        });
        
        return cachedResponse || fetchPromise;
      });
    })
  );
});
