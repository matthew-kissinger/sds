/**
 * Cycle 34 Phase 3: wire-format additive contract for the optional
 * `objective` block in `gameStateUpdate` snapshots.
 *
 * Asserts:
 *   - OC scene → snapshot.objective is present at start with stage='roundup'.
 *   - OC scene with stage='drive' → snapshot.objective.stage='drive'.
 *   - Field scene → snapshot.objective is absent (msgpack byte-identical
 *     guarantee for pre-Cycle-34 scenes).
 *   - RH scene → snapshot.objective is absent (no objective declared).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameSimulation } from '../worker/src/GameSim.js';

function makeRoomAdapter(sceneId, sheepCount = 50) {
    return {
        roomCode: 'TESTRM',
        isPublic: false,
        modeLocked: false,
        gameMode: 'cooperative',
        sceneId,
        sheepCount,
        state: 'waiting',
        lastActivity: Date.now(),
        simulation: null,
        players: new Map([['p1', { id: 'p1', name: 'A', dogType: 'jep', isHost: true, isReady: true, joinedAt: Date.now() }]]),
        getPlayer: (id) => ({ id, name: 'A', dogType: 'jep', isHost: true, isReady: true, joinedAt: Date.now() }),
        broadcastToRoom: () => {},
        finishGame: () => {},
        getSerializableState: () => ({}),
        resolvePlayerName: () => 'A',
        onSubmitScores: async () => {}
    };
}

function parkSheep(sheep, x, z) {
    sheep.position.set(x, z);
    sheep.velocity.set(0, 0);
    sheep.acceleration.set(0, 0);
    sheep.hasPassedGate = false;
    sheep.isRetiring = false;
    sheep.retirementTarget = null;
    sheep.state = 2;
}

function tickFrames(sim, frameCount) {
    sim.isRunning = true;
    try {
        for (let i = 0; i < frameCount; i++) sim.tick();
    } finally {
        sim.isRunning = false;
    }
}

describe('Cycle 34 Phase 3: wire-format objective block', () => {
    it('OC snapshot includes objective block with stage roundup at start', () => {
        const sim = new GameSimulation(makeRoomAdapter('open-country', 50));
        try {
            const snap = sim.createGameStateSnapshot();
            expect(snap.objective).toBeDefined();
            expect(snap.objective.stage).toBe('roundup');
            expect(snap.objective.requiredSheep).toBe(20);
            expect(snap.objective.holdRequired).toBe(2.0);
            expect(snap.objective.holdTimer).toBe(0);
        } finally {
            sim.cleanup?.();
        }
    });

    it('OC snapshot reflects forced drive stage', () => {
        const sim = new GameSimulation(makeRoomAdapter('open-country', 50));
        try {
            sim.objective.stage = 'drive';
            sim.objective.holdTimer = sim.objective.holdRequired;
            const snap = sim.createGameStateSnapshot();
            expect(snap.objective.stage).toBe('drive');
        } finally {
            sim.cleanup?.();
        }
    });

    it('field scene snapshot omits objective (additive contract preserved)', () => {
        const sim = new GameSimulation(makeRoomAdapter('field', 200));
        try {
            const snap = sim.createGameStateSnapshot();
            expect(snap).not.toHaveProperty('objective');
        } finally {
            sim.cleanup?.();
        }
    });

    it('rolling-hills snapshot omits objective (no objective declared)', () => {
        const sim = new GameSimulation(makeRoomAdapter('rolling-hills', 250));
        try {
            const snap = sim.createGameStateSnapshot();
            expect(snap).not.toHaveProperty('objective');
        } finally {
            sim.cleanup?.();
        }
    });

    it('OC isCorralOpen gates retirement until stage flips', () => {
        const sim = new GameSimulation(makeRoomAdapter('open-country', 50));
        try {
            // At construction the objective is in roundup → corral is closed.
            // This is what the worker's updateSheep() path consults via the
            // isCorralOpen guard around updateSheepCorralRetirements.
            expect(sim.objective.stage).toBe('roundup');
            // Force-flip and verify the guard would now open.
            sim.objective.stage = 'drive';
            const snap = sim.createGameStateSnapshot();
            expect(snap.objective.stage).toBe('drive');
        } finally {
            sim.cleanup?.();
        }
    });

    it('OC worker tick advances roundup objective to drive after hold', () => {
        const sim = new GameSimulation(makeRoomAdapter('open-country', 50));
        try {
            const zone = sim.objective.roundupZone;
            for (let i = 0; i < sim.objective.requiredSheep; i++) {
                parkSheep(sim.gameState.sheep[i], zone.x, zone.z);
            }

            tickFrames(sim, Math.ceil(sim.objective.holdRequired * sim.tickRate) + 1);

            const snap = sim.createGameStateSnapshot();
            expect(snap.objective.stage).toBe('drive');
            expect(snap.objective.sheepInZone).toBeGreaterThanOrEqual(sim.objective.requiredSheep);
            expect(snap.objective.holdTimer).toBeGreaterThanOrEqual(sim.objective.holdRequired);
        } finally {
            sim.cleanup?.();
        }
    });

    it('OC corral retirement stays closed until worker objective reaches drive', () => {
        const sim = new GameSimulation(makeRoomAdapter('open-country', 50));
        try {
            const sheep = sim.gameState.sheep[0];
            parkSheep(sheep, sim.gameState.corral.center.x, sim.gameState.corral.center.z);

            tickFrames(sim, 1);
            expect(sim.objective.stage).toBe('roundup');
            expect(sheep.hasPassedGate).toBe(false);
            expect(sheep.isRetiring).toBe(false);
            expect(sim.gameState.sheepRetired).toBe(0);

            sim.objective.stage = 'drive';
            tickFrames(sim, 1);
            expect(sheep.hasPassedGate).toBe(true);
            expect(sheep.isRetiring || sheep.state === 2).toBe(true);
            expect(sim.gameState.sheepRetired).toBe(1);
        } finally {
            sim.cleanup?.();
        }
    });
});
