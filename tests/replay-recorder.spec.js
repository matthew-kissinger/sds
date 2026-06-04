// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 27 Phase E — replay-recorder coverage.
 *
 * Two load-bearing assertions per the cycle plan:
 *   1. Stream-capture path constructs a recorder and emits chunks.
 *   2. Circular buffer truncates chunks older than `durationSec`.
 *
 * Vitest runs in node which doesn't ship MediaRecorder or
 * canvas.captureStream — we mock both. The mocks intentionally simulate
 * just enough of the browser surface to exercise the buffering logic;
 * the real browser path is exercised manually + by the eventual
 * Playwright e2e for the share-card flow.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReplayRecorder, isReplaySupported, __TEST_ONLY__ } from '../js/utils/ReplayRecorder.js';
import { isDevReplayEnabled } from '../js/utils/replay.js';

class MockMediaRecorder {
    constructor(stream, opts) {
        this.stream = stream;
        this.opts = opts;
        this.state = 'inactive';
        this.ondataavailable = null;
        this.onstop = null;
        this._timer = null;
        this._sliceMs = 0;
    }
    start(sliceMs) {
        this.state = 'recording';
        this._sliceMs = sliceMs;
    }
    stop() {
        this.state = 'inactive';
        if (this.onstop) this.onstop();
    }
    /** Test helper: simulate a `dataavailable` event firing. */
    emitChunk(byteSize = 1024) {
        if (!this.ondataavailable) return;
        const blob = new Blob([new Uint8Array(byteSize)], { type: this.opts.mimeType });
        this.ondataavailable({ data: blob });
    }
    static isTypeSupported(mt) {
        return /webm/.test(mt);
    }
}

class MockMediaStream {
    constructor() {
        this._tracks = [{ stop: vi.fn() }];
    }
    getTracks() { return this._tracks; }
}

class MockCanvas {
    constructor() {
        this._stream = new MockMediaStream();
    }
    captureStream() { return this._stream; }
}

beforeEach(() => {
    globalThis.MediaRecorder = MockMediaRecorder;
    // Define a stand-in HTMLCanvasElement with a `captureStream` on the
    // prototype — `isReplaySupported()` probes that path.
    function StubCanvasCtor() {}
    StubCanvasCtor.prototype.captureStream = function () { return new MockMediaStream(); };
    globalThis.HTMLCanvasElement = StubCanvasCtor;
    globalThis.Blob = globalThis.Blob || class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; } };
    globalThis.performance = globalThis.performance || { now: () => Date.now() };
});

describe('isReplaySupported', () => {
    it('returns true when MediaRecorder + captureStream + a webm mime are present', () => {
        expect(isReplaySupported()).toBe(true);
    });

    it('returns false when MediaRecorder is missing', () => {
        const saved = globalThis.MediaRecorder;
        // @ts-ignore
        delete globalThis.MediaRecorder;
        expect(isReplaySupported()).toBe(false);
        globalThis.MediaRecorder = saved;
    });
});

describe('isDevReplayEnabled', () => {
    it('requires localhost and an explicit devClip query flag', () => {
        expect(isDevReplayEnabled({ hostname: 'localhost', search: '?devClip=1' })).toBe(true);
        expect(isDevReplayEnabled({ hostname: '127.0.0.1', search: '?devClip=1' })).toBe(true);
        expect(isDevReplayEnabled({ hostname: 'sheepdogsim.com', search: '?devClip=1' })).toBe(false);
        expect(isDevReplayEnabled({ hostname: 'localhost', search: '' })).toBe(false);
    });
});

describe('ReplayRecorder stream capture', () => {
    it('start() creates a recorder, accepts chunks via ondataavailable', () => {
        const canvas = new MockCanvas();
        const rec = new ReplayRecorder(canvas, { durationSec: 10 });
        rec.start();
        expect(rec.running).toBe(true);
        expect(rec.recorder).toBeInstanceOf(MockMediaRecorder);
        rec.recorder.emitChunk(2048);
        rec.recorder.emitChunk(2048);
        expect(rec.chunks.length).toBe(2);
    });

    it('stop() returns a Blob assembled from buffered chunks', async () => {
        const canvas = new MockCanvas();
        const rec = new ReplayRecorder(canvas, { durationSec: 10 });
        rec.start();
        rec.recorder.emitChunk();
        rec.recorder.emitChunk();
        const blob = await rec.stop();
        expect(blob).toBeTruthy();
        expect(rec.running).toBe(false);
    });
});

describe('ReplayRecorder circular-buffer truncation', () => {
    it('drops chunks older than durationSec when new chunks arrive', () => {
        const canvas = new MockCanvas();
        // Mock performance.now() so we can drive virtual time.
        let nowMs = 0;
        globalThis.performance = { now: () => nowMs };

        const rec = new ReplayRecorder(canvas, { durationSec: 1 });
        rec.start();
        // Drive 20 chunks at 100ms intervals → t = 100..2000ms.
        for (let i = 1; i <= 20; i++) {
            nowMs = i * 100;
            rec.recorder.emitChunk();
        }
        // After the 2-second mark, only the last ~1.25s of chunks
        // should remain (1s window + CHUNK_INTERVAL_MS slack).
        const slackMs = __TEST_ONLY__.CHUNK_INTERVAL_MS;
        const expectedMin = Math.floor(((1000 + slackMs) / 100));
        expect(rec.chunks.length).toBeLessThanOrEqual(expectedMin + 2);
        // Sanity: we did NOT keep all 20.
        expect(rec.chunks.length).toBeLessThan(20);
    });
});

describe('mimeType selection', () => {
    it('picks the first supported mime from the preferred list', () => {
        const mt = __TEST_ONLY__.pickMimeType();
        expect(__TEST_ONLY__.PREFERRED_MIME_TYPES).toContain(mt);
    });
});
