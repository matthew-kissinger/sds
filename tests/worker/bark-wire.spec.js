// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 61 Phase 5: bark over the wire (DO authority + optional-field migration).
 *
 * Exercises the real worker GameSimulation through applyPlayerInput / the
 * pending-input queue:
 *   - input.bark === true drives the deterministic forward impulse on the flock
 *     authoritatively (sheep in the dog's forward cone gain forward velocity).
 *   - an input with NO bark field (an old client on the pre-bark protocol) is
 *     handled as no-bark and does not error - the additive-optional migration.
 *   - a second bark within the cooldown is gated server-side (anti-spam).
 *   - handlePlayerInput preserves the bark edge through the pending queue.
 *
 * Read-only against source: constructs in-memory sims, mutates only their state.
 * Mirrors the makeRoomAdapter shape used by gate-attraction-multidog.spec.js.
 */
import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../../worker/src/GameSim.js';

function makeRoomAdapter(sceneId, sheepCount = 50, playerIds = ['p1']) {
    const players = new Map(
        playerIds.map((id, i) => [
            id,
            { id, name: `P${i}`, dogType: 'jep', isHost: i === 0, isReady: true, joinedAt: 1 }
        ])
    );
    return {
        roomCode: 'TESTRM',
        isPublic: false,
        modeLocked: false,
        gameMode: 'cooperative',
        sceneId,
        sheepCount,
        seed: 12345,
        state: 'waiting',
        lastActivity: 1,
        simulation: null,
        players,
        getPlayer: (id) => players.get(id) || { id, name: 'A', dogType: 'jep', isHost: true, isReady: true, joinedAt: 1 },
        broadcastToRoom: () => {},
        finishGame: () => {},
        getSerializableState: () => ({}),
        resolvePlayerName: () => 'A',
        onSubmitScores: async () => {}
    };
}

// Place a sheep at (x,z), at rest, active.
function parkSheep(s, x, z) {
    s.position.set(x, z);
    s.velocity.set(0, 0);
    s.acceleration.set(0, 0);
    s.hasPassedGate = false;
    s.isRetiring = false;
    s.state = 0;
}

describe('Cycle 61 P5: bark over the wire', () => {
    function fieldSim() {
        return new GameSimulation(makeRoomAdapter('field', 50, ['p1']));
    }

    // Position the auto-created (bark-state-initialized) dog and give it a +z
    // facing velocity so the bark cone points along +z.
    function dogFacingForward(sim) {
        const dog = sim.sheepdogs.get('p1');
        dog.position.set(0, 0);
        dog.velocity.set(0, 1);
        return dog;
    }

    it('applies the bark impulse authoritatively when input.bark === true', () => {
        const sim = fieldSim();
        try {
            dogFacingForward(sim);
            const ahead = sim.gameState.sheep[0]; parkSheep(ahead, 0, 4);   // in cone + range
            const behind = sim.gameState.sheep[1]; parkSheep(behind, 0, -4); // behind => out of cone
            const beforeAhead = ahead.velocity.z;
            const beforeBehind = behind.velocity.z;

            sim.applyPlayerInput('p1', { direction: { x: 0, z: 1 }, sprint: false, inputSequence: 1, bark: true });

            expect(ahead.velocity.z).toBeGreaterThan(beforeAhead); // driven forward
            expect(behind.velocity.z).toBe(beforeBehind);          // untouched (behind)
        } finally { sim.cleanup?.(); }
    });

    it('treats an input with NO bark field as no-bark and does not error (old client)', () => {
        const sim = fieldSim();
        try {
            dogFacingForward(sim);
            const ahead = sim.gameState.sheep[0]; parkSheep(ahead, 0, 4);
            const before = ahead.velocity.z;

            // Old-format payload: the `bark` key is entirely absent.
            expect(() => sim.applyPlayerInput('p1', {
                direction: { x: 0, z: 1 }, sprint: false, inputSequence: 1
            })).not.toThrow();

            expect(ahead.velocity.z).toBe(before); // no bark applied
        } finally { sim.cleanup?.(); }
    });

    it('gates a second bark within the cooldown (no double impulse)', () => {
        const sim = fieldSim();
        try {
            dogFacingForward(sim);
            const ahead = sim.gameState.sheep[0]; parkSheep(ahead, 0, 4);

            sim.applyPlayerInput('p1', { direction: { x: 0, z: 1 }, sprint: false, inputSequence: 1, bark: true });
            const afterFirst = ahead.velocity.z;
            expect(afterFirst).toBeGreaterThan(0);

            // Immediate second bark: a fresh sequence (so it is not dropped as
            // stale) but inside the cooldown window, so the impulse is gated.
            sim.applyPlayerInput('p1', { direction: { x: 0, z: 1 }, sprint: false, inputSequence: 2, bark: true });
            expect(ahead.velocity.z).toBe(afterFirst); // no second push
        } finally { sim.cleanup?.(); }
    });

    it('bark === false is a no-op', () => {
        const sim = fieldSim();
        try {
            dogFacingForward(sim);
            const ahead = sim.gameState.sheep[0]; parkSheep(ahead, 0, 4);
            const before = ahead.velocity.z;
            sim.applyPlayerInput('p1', { direction: { x: 0, z: 1 }, sprint: false, inputSequence: 1, bark: false });
            expect(ahead.velocity.z).toBe(before);
        } finally { sim.cleanup?.(); }
    });

    it('handlePlayerInput preserves the bark edge through the pending queue', () => {
        const sim = fieldSim();
        try {
            const dog = sim.sheepdogs.get('p1');
            sim.handlePlayerInput('p1', { direction: { x: 0, z: 1 }, sprint: false, inputSequence: 1, bark: true });
            const queued = dog.pendingInputs[dog.pendingInputs.length - 1];
            expect(queued.bark).toBe(true);
        } finally { sim.cleanup?.(); }
    });
});
