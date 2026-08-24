// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
const SDS_CACHE_PREFIX = 'sheepdog-sim-'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(SDS_CACHE_PREFIX))
        .map((name) => caches.delete(name)),
    )
    await self.clients.claim()
    await self.registration.unregister()
  })())
})
