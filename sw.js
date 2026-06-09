// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Service Worker for Sheep Dog Sim
 *
 * - Navigations/HTML: network-first, cache fallback (so deploys propagate immediately).
 * - Hashed /assets/: cache-first (filenames are content-addressed, so they're immutable).
 * - Mutable un-hashed files: network-first, cache fallback.
 * - Other GETs: stale-while-revalidate.
 *
 * BUILD_ID is substituted at build time by vite.config.js serviceWorkerPlugin; a new
 * build gets a new CACHE_NAME and the activate handler purges older caches.
 */

const BUILD_ID = '__BUILD_ID__';
const CACHE_NAME = `sheepdog-sim-${BUILD_ID}`;

// Vite writes hashed bundles under /assets/foo-ABC123.ext. Content hash in the
// filename means the URL changes when content changes, so cache-first is safe.
const IMMUTABLE_HASHED = /\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(js|css|woff2?|png|jpg|jpeg|svg|glb|mp3|webp)$/;

const NEVER_CACHE = [
    /\/api\//,
    /\/\.wrtc\//,
    /socket\.io/,
    /\.db$/
];

const MUTABLE_UNHASHED = [
    /\/sw\.js$/,
    /\/assets\/scenes\/entrance\//,
    /\/terrain\//
];

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (!url.protocol.startsWith('http')) return;
    if (NEVER_CACHE.some((re) => re.test(url.pathname))) return;

    if (req.mode === 'navigate' || req.destination === 'document') {
        event.respondWith(networkFirst(req));
        return;
    }

    if (MUTABLE_UNHASHED.some((re) => re.test(url.pathname))) {
        event.respondWith(networkFirst(req));
        return;
    }

    if (IMMUTABLE_HASHED.test(url.pathname)) {
        event.respondWith(cacheFirst(req));
        return;
    }

    event.respondWith(staleWhileRevalidate(req));
});

async function cacheFirst(req) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
    return fresh;
}

async function networkFirst(req) {
    try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, fresh.clone());
        }
        return fresh;
    } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        throw err;
    }
}

async function staleWhileRevalidate(req) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
    }).catch(() => null);
    return cached || (await network);
}

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
