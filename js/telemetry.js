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
