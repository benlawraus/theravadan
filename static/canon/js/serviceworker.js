// Service Worker for Theravada PWA
const CACHE_NAME = 'theravada-pwa-v1';

// Import the generated assets list
importScripts('./assets-list.js');

// Install event - cache initial resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching files on install');
        // Use CACHE_ASSETS defined in assets-list.js
        // If CACHE_ASSETS is not defined, fallback to empty array to prevent crash
        const urlsToCache = (typeof CACHE_ASSETS !== 'undefined') ? CACHE_ASSETS : [];
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
      .catch(error => console.log('Service Worker install failed: ', error))
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const currentCaches = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
    }).then(cachesToDelete => {
      return Promise.all(cachesToDelete.map(cacheToDelete => {
        return caches.delete(cacheToDelete);
      }));
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache if available, otherwise fetch from network and cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests and those without HTTP protocol
  if (
    event.request.method !== 'GET' ||
    !event.request.url.startsWith('http')
  ) {
    return;
  }

  // For HTML pages - use network-first strategy
  if (event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache a clone of the response
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseClone);
            });
          return response;
        })
        .catch(() => {
          // If network fetch fails, try to return from cache
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // For navigation, return offline page if we have one
              if (event.request.mode === 'navigate') {
                return caches.match('/offline.html');
              }
              return new Response('Network error', { status: 408, headers: { 'Content-Type': 'text/plain' } });
            });
        })
    );
    return;
  }

  // For static assets - use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then(response => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            // Cache a clone of the response
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseClone);
              });
            return response;
          });
      })
  );
});

// Handle background sync for offline data
self.addEventListener('sync', event => {
  if (event.tag === 'theravada-sync') {
    event.waitUntil(
      // Here you would sync any offline data with your server
      console.log('Background sync triggered')
    );
  }
});

// Handle push notifications
self.addEventListener('push', event => {
  const title = 'Theravada';
  const options = {
    body: event.data ? event.data.text() : 'New content available',
    icon: '/static/canon/img/icon-192.jpeg',
    badge: '/static/canon/img/favicon.jpeg'
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow('/')
  );
});
