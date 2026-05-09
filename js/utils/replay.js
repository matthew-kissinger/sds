/**
 * Replay-recording helpers extracted from `main.js` in Cycle 28 Stream
 * B1. Start/stop wrappers around `ReplayRecorder` that capture the
 * rolling-tail clip used by the completion overlay's "Save clip" button.
 *
 * Behavior is unchanged from the original `_startReplay` / `_stopReplay`
 * methods. The class keeps thin shim methods that forward to these so
 * existing call sites keep working.
 */

import { ReplayRecorder, isReplaySupported } from './ReplayRecorder.js';

/**
 * @param {object} game SheepDogSimulation instance.
 */
export function startReplay(game) {
    if (game.replayRecorder) {
        try { game.replayRecorder.stop(); } catch {}
        game.replayRecorder = null;
    }
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
