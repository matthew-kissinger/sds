// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';

import { QualityGovernor } from '../js/perf/QualityGovernor.js';

/**
 * Cycle 95 (Bug A): a scene swap must re-arm the warmup window. The streamer
 * subscribes to onWarmupComplete inside the scene build; if the prior scene's
 * one-shot warmupCompleted survives the swap, that subscriber fires
 * synchronously and the foliage waves arm during the build (Newsheepdogland
 * stalls on impostors on re-entry). resetWarmup restores cold-load warmup state
 * without disturbing the sticky qualityIndex.
 */
describe('QualityGovernor.resetWarmup', () => {
    // warmupMs:0 lets a single sample close the warmup window (warmupUntil ==
    // now, so the `now < warmupUntil` early-return is skipped).
    function makeWarmGovernor() {
        const g = new QualityGovernor({ isMobile: false, warmupMs: 0 });
        g.sample({ frameTime: 16 });
        return g;
    }

    it('completes warmup on the first post-window sample', () => {
        const g = makeWarmGovernor();
        expect(g.warmupCompleted).toBe(true);
    });

    it('fires a late onWarmupComplete subscriber synchronously once warm', () => {
        const g = makeWarmGovernor();
        let fired = false;
        g.onWarmupComplete(() => { fired = true; });
        expect(fired).toBe(true);
    });

    it('re-arms the warmup window and preserves qualityIndex', () => {
        const g = makeWarmGovernor();
        g.qualityIndex = 2; // a sticky perf decision from the prior scene
        g.resetWarmup();

        expect(g.warmupCompleted).toBe(false);
        expect(g.warmupUntil).toBe(null);
        expect(g.qualityIndex).toBe(2);
    });

    it('defers a subscriber again after reset, then fires it on re-warmup', () => {
        const g = makeWarmGovernor();
        g.resetWarmup();

        let fired = false;
        g.onWarmupComplete(() => { fired = true; });
        // No synchronous fire: the window is re-armed, not complete.
        expect(fired).toBe(false);

        // The next sample past the (zero) window completes warmup and flushes
        // the deferred subscriber.
        g.sample({ frameTime: 16 });
        expect(g.warmupCompleted).toBe(true);
        expect(fired).toBe(true);
    });
});
