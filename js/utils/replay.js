// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Replay-recording helpers extracted from `main.js` in Cycle 28 Stream
 * B1. Start/stop wrappers around `ReplayRecorder` for explicit local
 * developer capture sessions.
 *
 * The class keeps thin shim methods that forward to these so existing
 * call sites keep working.
 */

import { ReplayRecorder, isReplaySupported } from './ReplayRecorder.js';

export function isDevReplayEnabled(locationLike = globalThis.location) {
    if (!locationLike) return false;
    const host = locationLike.hostname || '';
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!isLocalHost) return false;
    return new URLSearchParams(locationLike.search || '').get('devClip') === '1';
}

/**
 * @param {object} game SheepDogSimulation instance.
 */
export function startReplay(game) {
    if (game.replayRecorder) {
        try { game.replayRecorder.stop(); } catch {}
        game.replayRecorder = null;
    }
    if (!isDevReplayEnabled()) return;
    if (!isReplaySupported()) return;
    const canvas = game.sceneManager?.renderer?.domElement;
    if (!canvas) return;
    try {
        game.replayRecorder = new ReplayRecorder(canvas, { durationSec: 10 });
        game.replayRecorder.start();
    } catch (err) {
        console.warn('[REPLAY] Failed to start recorder:', err);
        game.replayRecorder = null;
    }
}

/**
 * Stop the recorder if running. Returns an objectURL for the last 10s
 * of WebM, or null if unsupported / failed. The URL owner is the caller
 * — revoke when done with it.
 *
 * @param {object} game
 * @returns {Promise<string | null>}
 */
export async function stopReplay(game) {
    const rec = game.replayRecorder;
    game.replayRecorder = null;
    if (!rec) return null;
    try {
        const blob = await rec.stop();
        if (!blob || blob.size === 0) return null;
        return URL.createObjectURL(blob);
    } catch (err) {
        console.warn('[REPLAY] Recorder stop failed:', err);
        return null;
    }
}
