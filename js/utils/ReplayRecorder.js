// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 27 Phase E — last-10-seconds canvas replay recorder.
 *
 * Wraps `canvas.captureStream` + `MediaRecorder` and keeps the most
 * recent N seconds of WebM video in a circular chunk buffer. On stop,
 * stitches the chunks into a Blob the caller can download or share.
 *
 * Usage:
 *
 *   const rec = new ReplayRecorder(canvas, { durationSec: 10 });
 *   rec.start();
 *   // ...gameplay happens; recorder silently buffers...
 *   const blob = await rec.stop();
 *
 * Mobile / unsupported browsers: `ReplayRecorder.isSupported()` returns
 * false. Callers should fall back to the share-card-only flow.
 *
 * Author lean per Q3: MediaRecorder over deterministic state-log replay.
 * Smaller blast radius, ~3-5MB out, the share-card is the actual UX
 * win — high-fidelity replay would be a Cycle 30+ project.
 */

const DEFAULT_DURATION_SEC = 10;
const DEFAULT_FPS = 60;
const DEFAULT_BITS_PER_SECOND = 4_000_000;
// Time-slice window per MediaRecorder dataavailable callback. Smaller =
// finer eviction granularity; larger = fewer Blob fragments to splice.
// 250ms × 10s = 40 chunks, fine for circular-buffer tail-trim.
const CHUNK_INTERVAL_MS = 250;

const PREFERRED_MIME_TYPES = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
];

/**
 * Probes once whether the host browser supports the recorder. Safe to
 * call before constructing.
 */
export function isReplaySupported() {
    if (typeof MediaRecorder === 'undefined') return false;
    if (typeof HTMLCanvasElement === 'undefined') return false;
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return false;
    for (const mt of PREFERRED_MIME_TYPES) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mt)) return true;
    }
    return false;
}

function pickMimeType() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
        return PREFERRED_MIME_TYPES[PREFERRED_MIME_TYPES.length - 1];
    }
    for (const mt of PREFERRED_MIME_TYPES) {
        if (MediaRecorder.isTypeSupported(mt)) return mt;
    }
    return PREFERRED_MIME_TYPES[PREFERRED_MIME_TYPES.length - 1];
}

export class ReplayRecorder {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {{ durationSec?: number, fps?: number, bitsPerSecond?: number, mimeType?: string }} [opts]
     */
    constructor(canvas, opts = {}) {
        this.canvas = canvas;
        this.durationSec = opts.durationSec ?? DEFAULT_DURATION_SEC;
        this.fps = opts.fps ?? DEFAULT_FPS;
        this.bitsPerSecond = opts.bitsPerSecond ?? DEFAULT_BITS_PER_SECOND;
        this.mimeType = opts.mimeType ?? pickMimeType();

        this.stream = null;
        this.recorder = null;
        // Circular buffer of { blob, t } chunks where t is the
        // approximate record-time of the chunk's end (ms since start).
        this.chunks = [];
        this.startedAt = 0;
        this.running = false;
    }

    start() {
        if (this.running) return;
        if (!this.canvas) throw new Error('ReplayRecorder: canvas missing');
        if (typeof this.canvas.captureStream !== 'function') {
            throw new Error('ReplayRecorder: canvas.captureStream not supported');
        }
        this.stream = this.canvas.captureStream(this.fps);
        const recorderOpts = {
            mimeType: this.mimeType,
            videoBitsPerSecond: this.bitsPerSecond,
        };
        this.recorder = new MediaRecorder(this.stream, recorderOpts);
        this.chunks = [];
        this.startedAt = performance.now();
        this.recorder.ondataavailable = (ev) => {
            if (!ev.data || ev.data.size === 0) return;
            const t = performance.now() - this.startedAt;
            this.chunks.push({ blob: ev.data, t });
            this._trim();
        };
        this.recorder.start(CHUNK_INTERVAL_MS);
        this.running = true;
    }

    /**
     * Drop any chunks older than `durationSec + small slack` so memory
     * stays bounded even on long recording sessions.
     */
    _trim() {
        const now = performance.now() - this.startedAt;
        // Keep slack so we don't lose a chunk that straddles the cutoff.
        const cutoff = now - (this.durationSec * 1000 + CHUNK_INTERVAL_MS);
        while (this.chunks.length > 1 && this.chunks[0].t < cutoff) {
            this.chunks.shift();
        }
    }

    /**
     * Stops the recorder and returns the buffered tail as a single Blob.
     * @returns {Promise<Blob>}
     */
    stop() {
        if (!this.running) return Promise.resolve(new Blob([], { type: this.mimeType }));
        return new Promise((resolve) => {
            const finalize = () => {
                this._trim();
                const blob = new Blob(
                    this.chunks.map((c) => c.blob),
                    { type: this.mimeType },
                );
                this._cleanup();
                resolve(blob);
            };
            this.recorder.onstop = finalize;
            try {
                this.recorder.stop();
            } catch {
                // Some browsers throw if stopped twice; fall through
                // to finalize anyway.
                finalize();
            }
        });
    }

    _cleanup() {
        this.running = false;
        if (this.stream) {
            for (const track of this.stream.getTracks()) track.stop();
        }
        this.stream = null;
        this.recorder = null;
    }
}

export const __TEST_ONLY__ = {
    PREFERRED_MIME_TYPES,
    DEFAULT_DURATION_SEC,
    CHUNK_INTERVAL_MS,
    pickMimeType,
};
