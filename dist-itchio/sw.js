/**
 * Service Worker for Sheep Dog Sim
 * Implements cache-first strategy for assets to improve repeat visit load times
 */

const CACHE_NAME = 'sheepdog-sim-v1';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/css/components/index-styles.css',
    '/js/main.js'
];

// Asset patterns to cache on fetch (cache-first strategy)
const CACHEABLE_PATTERNS = [
    /\.glb$/,           // 3D models
    /\.mp3$/,           // Audio files
    /\.js$/,            // JavaScript
    /\.css$/,           // Stylesheets
    /\.png$/,           // Images
    /\.jpg$/,           // Images
    /\.svg$/,           // Icons
    /\.woff2?$/,        // Fonts
    /\/assets\//        // Anything in assets folder
];

// Never cache these
const NEVER_CACHE = [
    /\/server\//,       // Server endpoints
    /socket\.io/,       // WebSocket connections
    /\/api\//,          // API calls
    /\.db$/             // Database files
];

/**
 * Install event - precache essential assets
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Precaching essential assets');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => {
                console.log('[SW] Install complete');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Precache failed:', error);
            })
    );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activate complete');
                return self.clients.claim();
            })
    );
});

/**
 * Fetch event - cache-first strategy for assets
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip requests that should never be cached
    if (NEVER_CACHE.some(pattern => pattern.test(url.pathname))) {
        return;
    }

    // Check if this is a cacheable asset
    const isCacheable = CACHEABLE_PATTERNS.some(pattern => pattern.test(url.pathname));

    if (isCacheable) {
        // Cache-first strategy for assets
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        // Return cached version
                        return cachedResponse;
                    }

                    // Fetch from network and cache
                    return fetch(event.request)
                        .then((networkResponse) => {
                            // Only cache successful responses
                            if (networkResponse && networkResponse.status === 200) {
                                const responseToCache = networkResponse.clone();

                                caches.open(CACHE_NAME)
                                    .then((cache) => {
                                        cache.put(event.request, responseToCache);
                                    });
                            }

                            return networkResponse;
                        })
                        .catch((error) => {
                            console.error('[SW] Fetch failed:', error);
                            // Could return a fallback here if needed
                        });
                })
        );
    } else {
        // Network-first for non-cacheable resources (HTML, API calls, etc.)
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request))
        );
    }
});

/**
 * Message handler for cache management
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        console.log('[SW] Clearing cache...');
        caches.delete(CACHE_NAME)
            .then(() => {
                console.log('[SW] Cache cleared');
                event.ports[0].postMessage({ success: true });
            });
    }

    if (event.data && event.data.type === 'GET_CACHE_SIZE') {
        caches.open(CACHE_NAME)
            .then((cache) => cache.keys())
            .then((keys) => {
                event.ports[0].postMessage({ count: keys.length });
            });
    }
});
