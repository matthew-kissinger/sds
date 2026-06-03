// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Read-only characterization spec for the Worker's TIMED game mode.
 *
 * Pins the CURRENT ACTUAL behavior of the timed-mode subsystem in
 * worker/src/GameSim.js (GameSimulation):
 *
 *   1. Gate passage schedules a sheep for removal ~5s later. A sheep that
 *      crosses a gate in TIMED mode is flagged hasPassedGate/isRetiring,
 *      moved to state 1, given an assignedGate + retirementTarget, marked
 *      scheduledForRemoval, stamped disappearTime = now + 5000, and pushed
 *      onto sheepRemovalQueue as { sheepId, removeTime: disappearTime }.
 *
 *   2. Advancing the wall clock past disappearTime removes then respawns the
 *      sheep with a MONOTONIC nextSheepId. nextSheepId starts at the room's
 *      sheepCount (Cycle 8 Phase 5) so the recycled id can never collide with
 *      a live id from the initial flock (ids 0 .. sheepCount-1). The reused
 *      sheep object is reset to state 0, hasPassedGate=false,
 *      scheduledForRemoval=false, disappearTime=null.
 *
 *   3. Advancing past the 3-minute gameDuration sets gameCompleted, stamps
 *      winType 'timeout', and names the winner as the top entry of the player
 *      rankings (highest playerScores). completionData mirrors this with
 *      winType 'timeout' and a winCondition of type 'timeout'.
 *
 * Method: a real GameSimulation is constructed in TIMED mode via
 * makeRoomAdapter (the pattern from tests/worker-objective-snapshot.spec.js).
 * We never call start() — start() both stamps gameStartTime AND opens a real
 * setInterval. Instead we drive the production methods directly and use
 * vitest fake timers (vi.useFakeTimers + vi.setSystemTime) to control the
 * wall clock that Date.now() returns inside the simulation. No source, fixture,
 * or fence file is modified.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameSimulation } from '../worker/src/GameSim.js';

// 2-player TIMED-mode room adapter. Mirrors the makeRoomAdapter shape in
// tests/worker-objective-snapshot.spec.js, with gameMode 'timed' and two
// players so the competitive game state (gates, playerScores, rankings) is
// well-formed.
function makeRoomAdapter(sheepCount = 50) {
    const players = new Map([
        ['p1', { id: 'p1', name: 'Alice', dogType: 'jep', isHost: true, isReady: true, joinedAt: Date.now() }],
        ['p2', { id: 'p2', name: 'Bob', dogType: 'pip', isHost: false, isReady: true, joinedAt: Date.now() }]
    ]);
    const names = { p1: 'Alice', p2: 'Bob' };
    return {
        roomCode: 'TIMEDR',
        isPublic: false,
        modeLocked: false,
        gameMode: 'timed',
        sceneId: 'field',
        sheepCount,
        state: 'waiting',
        lastActivity: Date.now(),
        simulation: null,
        players,
        getPlayer: (id) => players.get(id) || { id, name: 'X', dogType: 'jep', isHost: false, isReady: true, joinedAt: Date.now() },
        broadcastToRoom: () => {},
        finishGame: () => {},
        getSerializableState: () => ({}),
        resolvePlayerName: (id) => names[id] || null,
        onSubmitScores: async () => {}
    };
}

// Place a sheep dead-centre in a gate's passage zone, moving in the gate's
// pass direction, so checkGatePassage() returns true. Gate 0 in the 2-player
// layout is the north gate at (0,100): zone x in [-4,4], z in [96,104], and
// 'north' requires velocity.z > 0.
function parkSheepInGate(sheep, gate) {
    const zone = gate.passageZone;
    sheep.position.set((zone.minX + zone.maxX) / 2, (zone.minZ + zone.maxZ) / 2);
    // Velocity that satisfies the gate's direction predicate. The 2-player
    // layout only uses north/south, so a positive-z velocity passes the north
    // gate (gate 0); we always target gate 0 in these tests.
    sheep.velocity.set(0, 1);
    sheep.acceleration.set(0, 0);
    sheep.hasPassedGate = false;
    sheep.isRetiring = false;
    sheep.scheduledForRemoval = false;
    sheep.retirementTarget = null;
    sheep.assignedGate = null;
    sheep.state = 0;
}

const FIXED_NOW = 1_700_000_000_000; // arbitrary fixed epoch ms for the fake clock

describe('Worker TIMED mode: 5s removal queue + monotonic respawn + 3-min timeout', () => {
    let sim;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW);
    });

    afterEach(() => {
        // The completion path schedules a +1000ms setTimeout via
        // broadcastGameCompletion; clear any pending fake timers before
        // restoring real ones so nothing leaks across tests.
        try { sim?.cleanup?.(); } catch { /* sim may be null */ }
        sim = undefined;
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('constructs in timed mode with timed-specific fields initialized', () => {
        sim = new GameSimulation(makeRoomAdapter(50));
        expect(sim.isTimedMode).toBe(true);
        expect(sim.isCompetitive).toBe(false);
        // 3 minutes, in ms.
        expect(sim.gameDuration).toBe(3 * 60 * 1000);
        // Not started: start() stamps gameStartTime, we never call it.
        expect(sim.gameStartTime).toBeNull();
        // Cycle 8 Phase 5: nextSheepId seeded at the room sheepCount so a
        // respawn id can't collide with a live initial-flock id.
        expect(sim.nextSheepId).toBe(50);
        expect(Array.isArray(sim.sheepRemovalQueue)).toBe(true);
        expect(sim.sheepRemovalQueue.length).toBe(0);
        // Competitive game state is used for timed mode (gates + scores).
        expect(sim.gameState.competitiveGates.length).toBe(2);
        expect(sim.gameState.playerScores).toEqual({ p1: 0, p2: 0 });
        expect(sim.gameState.sheep.length).toBe(50);
    });

    it('gate passage schedules the sheep for removal ~5s later with the correct state', () => {
        sim = new GameSimulation(makeRoomAdapter(50));
        const gate = sim.gameState.competitiveGates[0];
        const sheep = sim.gameState.sheep[0];
        const originalId = sheep.id;
        parkSheepInGate(sheep, gate);

        // Drive the real timed-retirement path directly (the full tick()
        // physics would perturb position/velocity before the gate check; this
        // method is exactly what tick() -> updateSheep() calls in timed mode).
        const result = sim.updateTimedSheepRetirements(sim.gameState.sheep, sim.gameState.competitiveGates);

        // Sheep is flagged as having passed the gate and is now retiring.
        expect(sheep.hasPassedGate).toBe(true);
        expect(sheep.isRetiring).toBe(true);
        expect(sheep.state).toBe(1);
        expect(sheep.assignedGate).toBe(gate.id);
        expect(sheep.scheduledForRemoval).toBe(true);

        // disappearTime is exactly 5s past the (fake) wall clock.
        expect(sheep.disappearTime).toBe(FIXED_NOW + 5000);

        // A retirement target was placed inside the gate's pasture.
        expect(sheep.retirementTarget).toBeTruthy();
        expect(Number.isFinite(sheep.retirementTarget.x)).toBe(true);
        expect(Number.isFinite(sheep.retirementTarget.z)).toBe(true);

        // The removal queue carries one entry keyed to this sheep, due at
        // disappearTime. The id captured is the pre-respawn id.
        expect(sim.sheepRemovalQueue.length).toBe(1);
        expect(sim.sheepRemovalQueue[0]).toEqual({
            sheepId: originalId,
            removeTime: FIXED_NOW + 5000
        });

        // Gate owner (gate 0 -> p1 by rotated assignment) is credited one.
        expect(result.playerRetirements[gate.playerId]).toBe(1);
        expect(result.totalRetired).toBeGreaterThanOrEqual(1);
    });

    it('advancing past disappearTime removes then respawns with a monotonic, collision-free nextSheepId', () => {
        sim = new GameSimulation(makeRoomAdapter(50));
        const gate = sim.gameState.competitiveGates[0];
        const sheep = sim.gameState.sheep[0];
        parkSheepInGate(sheep, gate);

        // Schedule the removal at FIXED_NOW + 5000.
        sim.updateTimedSheepRetirements(sim.gameState.sheep, sim.gameState.competitiveGates);
        expect(sim.sheepRemovalQueue.length).toBe(1);

        const liveIdsBefore = new Set(sim.gameState.sheep.map((s) => s.id));
        const nextIdBefore = sim.nextSheepId; // 50

        // Advance the wall clock just past the disappear deadline. Leave
        // gameStartTime null so updateTimedMode runs ONLY its removal-queue
        // branch (the 3-min timeout branch is gated on gameStartTime).
        const tPastRemoval = FIXED_NOW + 5000 + 1;
        vi.setSystemTime(tPastRemoval);
        sim.updateTimedMode(tPastRemoval);

        // The queue is drained.
        expect(sim.sheepRemovalQueue.length).toBe(0);

        // The recycled sheep object took the old nextSheepId, and the counter
        // advanced by one (monotonic).
        expect(sheep.id).toBe(nextIdBefore);
        expect(sim.nextSheepId).toBe(nextIdBefore + 1);

        // Cycle 8 Phase 5 fix: the recycled id is >= the initial flock size,
        // so it cannot collide with any pre-existing live id (0 .. 49).
        expect(sheep.id).toBeGreaterThanOrEqual(50);
        expect(liveIdsBefore.has(sheep.id)).toBe(false);

        // And after the respawn, all live ids remain unique (no duplicate id
        // anywhere in the flock).
        const idsAfter = sim.gameState.sheep.map((s) => s.id);
        expect(new Set(idsAfter).size).toBe(idsAfter.length);

        // The reused sheep is fully reset back to an active grazing-eligible
        // state for the next round of herding.
        expect(sheep.state).toBe(0);
        expect(sheep.hasPassedGate).toBe(false);
        expect(sheep.isRetiring).toBe(false);
        expect(sheep.scheduledForRemoval).toBe(false);
        expect(sheep.disappearTime).toBeNull();
        expect(sheep.assignedGate).toBeNull();
        expect(sheep.retirementTarget).toBeNull();
    });

    it('does not remove a scheduled sheep before its disappearTime', () => {
        sim = new GameSimulation(makeRoomAdapter(50));
        const gate = sim.gameState.competitiveGates[0];
        const sheep = sim.gameState.sheep[0];
        parkSheepInGate(sheep, gate);

        sim.updateTimedSheepRetirements(sim.gameState.sheep, sim.gameState.competitiveGates);
        const nextIdBefore = sim.nextSheepId;

        // One ms before the deadline: nothing should be removed/respawned.
        const tBefore = FIXED_NOW + 5000 - 1;
        vi.setSystemTime(tBefore);
        sim.updateTimedMode(tBefore);

        expect(sim.sheepRemovalQueue.length).toBe(1);
        expect(sim.nextSheepId).toBe(nextIdBefore);
        expect(sheep.scheduledForRemoval).toBe(true);
        expect(sheep.id).toBe(0); // not yet recycled
    });

    it('advancing past the 3-minute gameDuration completes with winType timeout and the top-scoring winner', () => {
        sim = new GameSimulation(makeRoomAdapter(50));

        // Stand in for start(): stamp the game-start wall clock WITHOUT opening
        // a real setInterval.
        sim.gameStartTime = FIXED_NOW;

        // Make p2 the clear leader so the winner is unambiguous and not just
        // the insertion-order head.
        sim.gameState.playerScores.p1 = 3;
        sim.gameState.playerScores.p2 = 9;

        expect(sim.gameState.gameCompleted).toBe(false);

        // Advance to exactly the 3-minute boundary (>= triggers completion).
        const tTimeout = FIXED_NOW + sim.gameDuration;
        vi.setSystemTime(tTimeout);
        sim.updateTimedMode(tTimeout);

        // Game is now complete via the timeout path.
        expect(sim.gameState.gameCompleted).toBe(true);
        expect(sim.gameState.winType).toBe('timeout');
        // completionTime is recorded in seconds.
        expect(sim.gameState.completionTime).toBe(180);

        // Winner is the highest-scoring player (p2).
        expect(sim.gameState.winner).toBe('p2');

        // completionData mirrors the timeout result for the broadcast.
        expect(sim.completionData).toBeTruthy();
        expect(sim.completionData.isTimedMode).toBe(true);
        expect(sim.completionData.gameCompleted).toBe(true);
        const comp = sim.completionData.competitive;
        expect(comp.winner).toBe('p2');
        expect(comp.winType).toBe('timeout');
        expect(comp.winCondition.type).toBe('timeout');
        expect(comp.winCondition.timeLimit).toBe(180);
        expect(comp.finalScores).toEqual({ p1: 3, p2: 9 });
        // Rankings are score-descending, so rank 1 is the winner.
        expect(comp.playerRankings[0].playerId).toBe('p2');
        expect(comp.playerRankings[0].rank).toBe(1);
        // resolvePlayerName from the adapter flows into the ranking name.
        expect(comp.playerRankings[0].playerName).toBe('Bob');
    });

    it('does not complete before the gameDuration boundary', () => {
        sim = new GameSimulation(makeRoomAdapter(50));
        sim.gameStartTime = FIXED_NOW;
        sim.gameState.playerScores.p1 = 1;
        sim.gameState.playerScores.p2 = 2;

        // One ms short of the 3-minute boundary.
        const tShort = FIXED_NOW + sim.gameDuration - 1;
        vi.setSystemTime(tShort);
        sim.updateTimedMode(tShort);

        expect(sim.gameState.gameCompleted).toBe(false);
        expect(sim.gameState.winType).toBeUndefined();
        expect(sim.completionData).toBeNull();
    });
});
