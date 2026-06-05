// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// @vitest-environment jsdom
/**
 * Cycle 59 Phase 3 - loop integration + win-check bypass.
 *
 * advanceCountingRound is the per-frame seam main.js calls: once every active
 * sheep is penned (sheepRetired >= activeCount) it brings the next curve batch
 * online, keeping the round controller and the engine's activeCount in
 * lock-step. checkCompletion is bypassed for counting so the run never
 * auto-ends. jsdom gives us `window` for the counting-round-advanced event.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameState } from '../js/GameState.js';
import { OptimizedSheepSystem } from '../js/OptimizedSheep.js';
import { createRoundState, advanceRound } from '../js/gamestate/countingMode.js';
import { COUNTING_GAME_MODE } from '../shared/countingModes.js';

const spawn = { centerX: 0, centerZ: 0, spreadRadius: 0, defaultCount: 1 };

// Build a GameState wired to a counting flock the way startGame + createSheepFlock
// would, but with a direct (non-extreme, deterministic-spawn) system so the test
// isolates the loop logic from the 5000-capacity extreme-boid path.
function countingGame(scene, curve) {
    const state = new GameState();
    state.gameMode = COUNTING_GAME_MODE;
    state.countingCurve = curve;
    state.countingState = createRoundState(curve);
    advanceRound(state.countingState); // -> round 1, cumulative 1 (matches the 1 active sheep)
    state.optimizedSheepSystem = new OptimizedSheepSystem(scene, 1, spawn, false, { maxCapacity: 5000 });
    state.sheep = state.optimizedSheepSystem.getSheep();
    return state;
}

describe('Counting Sheep win-check bypass (Cycle 59 P3)', () => {
    it('checkCompletion never auto-ends a counting run', () => {
        const state = new GameState();
        state.gameMode = COUNTING_GAME_MODE;
        // Even with the flock fully penned, the capability gate returns false
        // before isSoloComplete is consulted, and gameCompleted stays untouched.
        state.sheepRetired = 5000;
        state.totalSheep = 5000;
        expect(state.checkCompletion()).toBe(false);
        expect(state.gameCompleted).toBe(false);
    });

    it('advanceCountingRound is a no-op outside counting mode', () => {
        const state = new GameState();
        state.gameMode = 'solo';
        expect(state.advanceCountingRound()).toBe(0);
    });
});

describe('Counting Sheep loop integration (Cycle 59 P3)', () => {
    it('waits for the active batch to be fully penned before advancing', () => {
        const scene = new THREE.Scene();
        const state = countingGame(scene, 'exponential');
        try {
            // 1 active, none penned -> no advance.
            state.sheepRetired = 0;
            expect(state.advanceCountingRound()).toBe(0);
            expect(state.optimizedSheepSystem.activeCount).toBe(1);
            expect(state.countingState.round).toBe(1);
        } finally {
            state.optimizedSheepSystem.dispose();
        }
    });

    it('exponential: penning the batch brings 2, then 4 more online in lock-step', () => {
        const scene = new THREE.Scene();
        const state = countingGame(scene, 'exponential');
        try {
            // Pen the lone round-1 sheep -> round 2 activates 2 (active 1 -> 3).
            state.sheepRetired = 1;
            expect(state.advanceCountingRound()).toBe(2);
            expect(state.countingState.round).toBe(2);
            expect(state.optimizedSheepSystem.activeCount).toBe(3);
            expect(state.sheep.length).toBe(3);

            // Mid-batch (only the old 1 penned) -> no advance.
            expect(state.advanceCountingRound()).toBe(0);

            // Pen all 3 -> round 3 activates 4 (active 3 -> 7).
            state.sheepRetired = 3;
            expect(state.advanceCountingRound()).toBe(4);
            expect(state.countingState.round).toBe(3);
            expect(state.optimizedSheepSystem.activeCount).toBe(7);
        } finally {
            state.optimizedSheepSystem.dispose();
        }
    });

    it('incremental: batches grow 1, 2, 3 across rounds', () => {
        const scene = new THREE.Scene();
        const state = countingGame(scene, 'incremental');
        try {
            state.sheepRetired = 1;
            expect(state.advanceCountingRound()).toBe(2); // round 2 -> +2
            expect(state.optimizedSheepSystem.activeCount).toBe(3);

            state.sheepRetired = 3;
            expect(state.advanceCountingRound()).toBe(3); // round 3 -> +3
            expect(state.optimizedSheepSystem.activeCount).toBe(6);
            expect(state.countingState.round).toBe(3);
        } finally {
            state.optimizedSheepSystem.dispose();
        }
    });

    it('emits counting-round-advanced with the new round and the counted total', () => {
        const scene = new THREE.Scene();
        const state = countingGame(scene, 'exponential');
        const events = [];
        const handler = (e) => events.push(e.detail);
        window.addEventListener('counting-round-advanced', handler);
        try {
            state.sheepRetired = 1;
            state.advanceCountingRound();
            expect(events).toHaveLength(1);
            expect(events[0].round).toBe(2);
            expect(events[0].counted).toBe(1); // the penned tally at advance time
            expect(events[0].activated).toBe(2);
        } finally {
            window.removeEventListener('counting-round-advanced', handler);
            state.optimizedSheepSystem.dispose();
        }
    });

    it('stops activating at the 5000 ceiling and marks the run done', () => {
        const scene = new THREE.Scene();
        const state = countingGame(scene, 'exponential');
        try {
            let guard = 0;
            while (!state.countingState.done && guard++ < 50) {
                state.sheepRetired = state.optimizedSheepSystem.activeCount; // pen everything
                state.advanceCountingRound();
            }
            expect(state.countingState.done).toBe(true);
            expect(state.optimizedSheepSystem.activeCount).toBe(5000);
            // Past the ceiling, a further tick is a no-op.
            state.sheepRetired = 5000;
            expect(state.advanceCountingRound()).toBe(0);
        } finally {
            state.optimizedSheepSystem.dispose();
        }
    });
});
