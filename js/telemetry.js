// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 11 Phase 5: client telemetry wrapper.
 *
 * Fire-and-forget POST to `/api/event`. Includes the player JWT when
 * present so the worker can dedupe users; otherwise events are anonymous.
 * Failures are silent — if the user's adblocker swallows the request, or
 * the worker is offline, gameplay UX is unaffected.
 *
 * The worker URL is the same origin in prod (Pages routes /api/* to
 * Worker) and the dev wrangler port in local dev.
 */

import { getNetworkManager } from './GameBridge.js';
import { getApiBase, isTelemetryEnabled } from './runtimeConfig.js';

let _disabled = false;
let _inFlight = 0;
const MAX_IN_FLIGHT = 4;

function getToken() {
    try {
        const nm = getNetworkManager();
        return nm?.token ?? null;
    } catch {
        return null;
    }
}

/**
 * Emit a telemetry event. Returns a Promise that resolves with the response
 * body or null on failure. Callers should not await — use as fire-and-forget.
 *
 * @param {string} name
 * @param {Record<string, string|number|boolean>} [props]
 */
export function emitEvent(name, props = {}) {
    if (_disabled || _inFlight >= MAX_IN_FLIGHT) return Promise.resolve(null);
    if (typeof fetch === 'undefined' || typeof window === 'undefined') return Promise.resolve(null);
    // Local dev and e2e runs often have no worker on :8787.
    if (!isTelemetryEnabled()) return Promise.resolve(null);
    _inFlight++;
    const token = getToken();
    return fetch(`${getApiBase()}/api/event`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name, props }),
        keepalive: true,
    })
        .then(r => r.ok ? r.json().catch(() => null) : null)
        .catch(() => null)
        .finally(() => { _inFlight--; });
}

/** Disable all subsequent emits (e.g. for tests, or after persistent failure). */
export function disableTelemetry() { _disabled = true; }

// P0-CRASH: cap the stack we ship; the worker stores at most 256 chars per
// string prop today, but the client contract is ~4KB so a worker-side bump
// needs no client change.
const MAX_STACK_CHARS = 4096;

/**
 * P0-CRASH: crash beacon for the React ErrorBoundary. Sends a
 * `client_error` event with { message, stack, build, ua } through the same
 * fire-and-forget /api/event path as every other telemetry event (so it
 * inherits the in-flight cap, the isTelemetryEnabled() gate, and silent
 * failure). Must never throw — it runs inside componentDidCatch while the
 * UI is already broken.
 *
 * @param {unknown} error - the error the boundary caught
 * @param {{ componentStack?: string }} [info] - React errorInfo
 * @returns {Promise<unknown|null>}
 */
export function reportCrash(error, info) {
    try {
        const message = String(
            (error && typeof error === 'object' && 'message' in error && error.message) || error || 'unknown error'
        ).slice(0, 256);
        const rawStack = (error && typeof error === 'object' && 'stack' in error && error.stack) || '';
        const componentStack = info?.componentStack || '';
        const stack = `${rawStack}${rawStack && componentStack ? '\n' : ''}${componentStack}`
            .slice(0, MAX_STACK_CHARS);
        const build = (typeof __BUILD_ID__ !== 'undefined') ? String(__BUILD_ID__) : 'dev';
        const ua = (typeof navigator !== 'undefined' && navigator.userAgent)
            ? String(navigator.userAgent).slice(0, 256)
            : '';
        return emitEvent('client_error', { message, stack, build, ua });
    } catch {
        return Promise.resolve(null);
    }
}
