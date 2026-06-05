// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 58 Phase 1 — solo completion-count regression.
 *
 * Reproduces the "199 of 200" bug: the client retired-count loop in
 * GameState.updateSheepBehaviors counted a sheep twice on the frame it
 * retired (once in the `triggered` branch, once in the count-all-retired
 * pass), so `isSoloComplete = sheepRetired >= sheep.length` fired one
 * tail-sheep early — the run ended with a sheep still in the field.
 *
 * The fix drops the redundant increment in the `triggered` branch; the
 * count-all pass is the single authoritative tally. These tests assert the
 * retired count is exact (no double-count) and that a run does NOT complete
 * while a sheep is still out — they fail against the pre-fix code.
 *
 * Worker/MP completion uses the shared strict `checkGameCompletion` (a
 * filter over the array, no double-count) and is unaffected; this is a
 * client/solo-only path, exercised here through the real GameState.
 */
import { describe, it, expect, vi } from 'vitest';

// GameState pulls OptimizedSheep (Three.js) transitively; stub it. Mirrors
// tests/refactor-baseline/gamestate-mode-dispatch.spec.ts.
vi.mock('../js/OptimizedSheep.js', () => ({
    OptimizedSheepSystem: class {
        constructor() { this.instancedMesh = null; }
        getSheep() { return []; }
        setAudioManager() {}
        setSpawnConfig() {}
        resetAllSheep() {}
        setUseExtremeBoids() {}
        update() {}
    },
}));

vi.mock('../js/GameBridge.js', () => ({
    getCurrentRoom: () => null,
    getGameInstance: () => null,
    getNetworkManager: () => null,
    getGameState: () => null,
    setGameInstance: () => {},
    emitGameEvent: () => {},
    subscribeGameEvent: () => () => {},
}));

import { GameState } from '../js/GameState.js';
import { isSoloComplete } from '../js/gamestate/winConditions.js';
import { installBrowserShims } from './refactor-baseline/gamestate-harness.js';

/**
 * A mock sheep mirroring the real entity contract the retired-count loop
 * touches: position + the retirement flags + the two retire-check methods.
 * `retired` seeds an already-home sheep; `retiresThisFrame` makes the check
 * method set the flags and return true (as the real method does on the
 * frame a sheep crosses the gate / enters the corral).
 *
 * @param {{retired?: boolean, retiresThisFrame?: boolean}} [opts]
 */
function makeSheep({ retired = false, retiresThisFrame = false } = {}) {
    return {
        position: { x: 0, z: 0 },
        hasPassedGate: retired,
        isRetiring: retired,
        checkCorralAndRetire() {
            if (retiresThisFrame) { this.hasPassedGate = true; this.isRetiring = true; return true; }
            return false;
        },
        checkGatePassageAndRetire() {
            if (retiresThisFrame) { this.hasPassedGate = true; this.isRetiring = true; return true; }
            return false;
        },
    };
}

/**
 * Build an active solo GameState over the given mock flock. `corral: true`
 * exercises the Rolling Hills corral path (the reported scenario); false
 * exercises the Home Field gate path. No objective (null) => corral always
 * open, matching RH/Field.
 *
 * @param {Array<object>} sheep
 * @param {{corral?: boolean}} [opts]
 */
function makeSoloState(sheep, { corral = false } = {}) {
    installBrowserShims();
    const state = new GameState();
    state.gameMode = 'solo';
    state.gameActive = true;
    state.isPaused = false;
    state.totalSheep = sheep.length;
    state.optimizedSheepSystem = { update: () => {} };
    state.setObjective(null);
    if (corral) {
        state.setCorral({ center: { x: 0, z: 0 }, radius: 8 });
    } else {
        state.gate = { passageZone: {} };
        state.pasture = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    }
    state.sheep = sheep;
    return state;
}

describe('solo completion count (Cycle 58 P1)', () => {
    it('does not complete with a sheep still out — corral path (the 199/200 bug)', () => {
        const sheep = [
            makeSheep({ retired: true }),           // already home
            makeSheep({ retiresThisFrame: true }),  // crosses this frame
            makeSheep(),                            // still in the field
        ];
        const state = makeSoloState(sheep, { corral: true });
        state.updateSheepBehaviors(0.016);

        // Two sheep are genuinely home; the pre-fix code reported 3 here.
        expect(state.sheepRetired).toBe(2);
        // One sheep is still out, so the run must NOT be complete.
        expect(isSoloComplete(state)).toBe(false);
        expect(state.checkCompletion()).toBe(false);
        expect(state.gameCompleted).toBe(false);
    });

    it('does not double-count a single sheep retiring this frame — gate path', () => {
        const state = makeSoloState([makeSheep({ retiresThisFrame: true })], { corral: false });
        state.updateSheepBehaviors(0.016);
        expect(state.sheepRetired).toBe(1); // pre-fix: 2
    });

    it('completes exactly when the last sheep retires (no over-count)', () => {
        const sheep = [
            makeSheep({ retired: true }),
            makeSheep({ retired: true }),
            makeSheep({ retiresThisFrame: true }), // the final one, this frame
        ];
        const state = makeSoloState(sheep, { corral: true });
        state.updateSheepBehaviors(0.016);

        expect(state.sheepRetired).toBe(3);
        expect(isSoloComplete(state)).toBe(true);
        expect(state.checkCompletion()).toBe(true);
    });

    it('counts a fully-retired flock exactly once each (steady state)', () => {
        const sheep = [
            makeSheep({ retired: true }),
            makeSheep({ retired: true }),
            makeSheep({ retired: true }),
        ];
        const state = makeSoloState(sheep, { corral: true });
        state.updateSheepBehaviors(0.016);
        expect(state.sheepRetired).toBe(3); // not 6, not 3+newly
    });
});
