// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// @vitest-environment jsdom
/**
 * Cycle 112 Phase 5: the boot timeline behind the cold-load budget.
 *
 * jsdom, not node: the window global is half the contract here. The validation
 * harness reads `window.__sdsBootTimeline` off the page, so a suite that ran
 * without a window would pass while the only consumer stayed blind.
 *
 * The idempotence rule is the load-bearing one. `roundPlayable` is marked when
 * the player gains control, and the player can return to the menu and start
 * another round in the same session. Without first-write-wins, the second round
 * would overwrite a cold-load measurement with a warm one and the gate would
 * silently start reporting a much better number than any real first visit.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { markBoot, getBootTimeline, resetBootTimeline } from '../js/boot/loadTimeline.js';

describe('boot timeline', () => {
    beforeEach(() => resetBootTimeline());

    it('records a mark and returns its time', () => {
        const t = markBoot('firstInteractive');
        expect(typeof t).toBe('number');
        expect(t).toBeGreaterThanOrEqual(0);
        expect(getBootTimeline().firstInteractive).toBe(t);
    });

    it('keeps the first write and ignores later ones', () => {
        const first = markBoot('roundPlayable');
        // Burn some wall clock so a second write would be visibly different.
        const spin = Date.now();
        while (Date.now() - spin < 5) { /* wait */ }
        const second = markBoot('roundPlayable');
        expect(second).toBe(first);
        expect(getBootTimeline().roundPlayable).toBe(first);
    });

    it('tracks independent marks separately', () => {
        markBoot('firstInteractive');
        markBoot('roundPlayable');
        const t = getBootTimeline();
        expect(Object.keys(t).sort()).toEqual(['firstInteractive', 'roundPlayable']);
        expect(t.roundPlayable).toBeGreaterThanOrEqual(t.firstInteractive);
    });

    it('publishes onto the window global the validation harness reads', () => {
        markBoot('firstInteractive');
        expect(globalThis.window?.__sdsBootTimeline?.firstInteractive)
            .toBe(getBootTimeline().firstInteractive);
    });

    it('hands back a copy, so callers cannot mutate the timeline', () => {
        markBoot('firstInteractive');
        const snapshot = getBootTimeline();
        snapshot.firstInteractive = -1;
        expect(getBootTimeline().firstInteractive).not.toBe(-1);
    });
});
