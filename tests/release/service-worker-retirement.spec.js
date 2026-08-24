// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')

function loadWorker(cacheNames = []) {
  const listeners = new Map()
  const skipWaiting = vi.fn(async () => undefined)
  const claim = vi.fn(async () => undefined)
  const unregister = vi.fn(async () => true)
  const removeCache = vi.fn(async () => true)
  const context = {
    Promise,
    caches: {
      keys: vi.fn(async () => cacheNames),
      delete: removeCache,
    },
    self: {
      addEventListener: (type, listener) => listeners.set(type, listener),
      skipWaiting,
      clients: { claim },
      registration: { unregister },
    },
  }
  vm.runInNewContext(source, context)
  return { listeners, skipWaiting, claim, unregister, removeCache }
}

async function dispatch(listener) {
  let completion
  listener({ waitUntil: (promise) => { completion = promise } })
  await completion
}

describe('v2 service-worker retirement', () => {
  it('takes over immediately and removes only Sheepdog Sim caches', async () => {
    const worker = loadWorker(['sheepdog-sim-old', 'other-app-cache', 'sheepdog-sim-current'])

    await dispatch(worker.listeners.get('install'))
    await dispatch(worker.listeners.get('activate'))

    expect(worker.skipWaiting).toHaveBeenCalledOnce()
    expect(worker.removeCache).toHaveBeenCalledTimes(2)
    expect(worker.removeCache).toHaveBeenCalledWith('sheepdog-sim-old')
    expect(worker.removeCache).toHaveBeenCalledWith('sheepdog-sim-current')
    expect(worker.removeCache).not.toHaveBeenCalledWith('other-app-cache')
    expect(worker.claim).toHaveBeenCalledOnce()
    expect(worker.unregister).toHaveBeenCalledOnce()
  })

  it('does not install a fetch handler, so v3 requests pass through the network', () => {
    const worker = loadWorker()
    expect(worker.listeners.has('fetch')).toBe(false)
  })
})
