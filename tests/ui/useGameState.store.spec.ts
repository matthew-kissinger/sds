/**
 * Cycle 47 P6: the HUD store's change-gate, exercised without React.
 *
 * `useGameState` is now backed by a module-level `useSyncExternalStore` store.
 * The acceptance that matters for perf is referential stability: repeated
 * 'frame' events whose HUD-relevant values are unchanged must return the SAME
 * snapshot object from `getSnapshot()`, so React skips the re-render. We mock
 * GameBridge, drive the captured 'frame' handler directly, and assert the
 * snapshot identity behavior.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
    state: null as Record<string, unknown> | null,
    timer: null as { getGameTime: () => number } | null,
    frameHandler: null as null | (() => void),
}));

vi.mock('../../js/GameBridge.js', () => ({
    getGameState: () => h.state,
    getGameTimer: () => h.timer,
    getNetworkManager: () => null,
    getMultiplayerState: () => null,
    getSheepdog: () => ({ stamina: 100, maxStamina: 100 }),
    getSceneManager: () => null,
    subscribeGameEvent: (name: string, cb: () => void) => {
        if (name === 'frame') h.frameHandler = cb;
        return () => {
            h.frameHandler = null;
        };
    },
}));

import { gameStateStore } from '../../js/components/hooks/useGameState.js';

describe('useGameState store change-gate', () => {
    beforeEach(() => {
        h.state = {
            sheepRetired: 5,
            totalSheep: 200,
            isComplete: false,
            paused: false,
            singlePlayerMode: 'classic',
        };
        h.timer = { getGameTime: () => 12.2 };
        h.frameHandler = null;
    });

    it('returns a stable snapshot reference across identical frames', () => {
        const unsub = gameStateStore.subscribe(() => {});
        const first = gameStateStore.getSnapshot();

        // A frame with byte-identical underlying values must not mint a new ref.
        h.frameHandler?.();
        expect(gameStateStore.getSnapshot()).toBe(first);

        // And again — still stable.
        h.frameHandler?.();
        expect(gameStateStore.getSnapshot()).toBe(first);
        unsub();
    });

    it('mints a new reference and notifies when a HUD value changes', () => {
        let notifications = 0;
        const unsub = gameStateStore.subscribe(() => {
            notifications++;
        });
        const first = gameStateStore.getSnapshot();

        h.state!.sheepRetired = 6;
        h.frameHandler?.();

        expect(gameStateStore.getSnapshot()).not.toBe(first);
        expect(notifications).toBe(1);
        unsub();
    });

    it('quantizes the timer to whole seconds (sub-second drift is stable)', () => {
        const unsub = gameStateStore.subscribe(() => {});
        const first = gameStateStore.getSnapshot();

        // Same whole second (12.x) -> no new reference.
        h.timer = { getGameTime: () => 12.9 };
        h.frameHandler?.();
        expect(gameStateStore.getSnapshot()).toBe(first);

        // Crossing to the next whole second -> new reference.
        h.timer = { getGameTime: () => 13.0 };
        h.frameHandler?.();
        expect(gameStateStore.getSnapshot()).not.toBe(first);
        unsub();
    });

    it('stores raw gameTime so the timed countdown is not shifted by a second', () => {
        const unsub = gameStateStore.subscribe(() => {});
        // Prime at a value with a fractional part.
        h.timer = { getGameTime: () => 4.7 };
        h.state!.sheepRetired = 99; // force a new snapshot at this timer value
        h.frameHandler?.();

        const snap = gameStateStore.getSnapshot() as { gameTime: number };
        // floor(180 - 4.7) === 175 (correct), whereas a floored store would
        // give floor(180 - 4) === 176 and read one second high.
        expect(Math.floor(180 - snap.gameTime)).toBe(175);
        unsub();
    });
});
