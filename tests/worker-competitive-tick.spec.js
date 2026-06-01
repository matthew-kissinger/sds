/**
 * Characterization spec for the authoritative COMPETITIVE path in the Worker
 * GameSimulation. This path (multi-gate layout, per-gate scoring via
 * updateCompetitiveSheepRetirements, race-vs-highest-score win progress, and
 * checkCompetitiveCompletion) had zero behavioral coverage. These tests assert
 * the CURRENT ACTUAL behavior of the code as written; they are read-only and
 * touch no source, fixture, or fence file.
 *
 * Patterns (makeRoomAdapter, tickFrames) follow
 * tests/worker-objective-snapshot.spec.js. The adapter here defaults to
 * gameMode='competitive' and accepts a variable player roster so we can build
 * both 2-player and 3-player simulations.
 *
 * Facts pinned (read from worker/src/GameSim.js +
 * shared/GameStateValidation.js + shared/BoundaryCollision.js):
 *   - createCompetitiveGameState builds generateCompetitiveGateLayout(N) →
 *     one gate per player, each assigned a playerId by index, scores start 0.
 *   - The 2p layout: gate 0 north @ (0,100), gate 1 south @ (0,-100).
 *     gateWidth=8, gateDepth=4, so the north passageZone is
 *     {minX:-4,maxX:4,minZ:96,maxZ:104}.
 *   - checkGatePassage requires the sheep inside the passageZone AND velocity
 *     in the gate's direction (north: vz>0, south: vz<0, east: vx>0, west: vx<0).
 *   - A full tick (updateSheep → updateCompetitiveSheepRetirements) flips
 *     hasPassedGate/isRetiring and credits the OWNING player's score by +1.
 *   - calculateWinProgress: 2p → {type:'race', threshold:101}; 3p → 'highest_score'.
 *   - checkGameCompletion (competitive) sets gameCompleted + completionData once
 *     a 2p max score reaches ceil(totalSheep/2) (100 at the 200-sheep default —
 *     the source comment claiming 101 is stale; ceil(200/2) === 100).
 */

import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../worker/src/GameSim.js';
import { checkGatePassage } from '../shared/index.js';
import { Vector2D } from '../shared/Vector2D.js';

function makeCompetitiveRoom(playerIds, { sheepCount = 30, gameMode = 'competitive' } = {}) {
    const players = new Map(
        playerIds.map((id) => [id, { id, name: id, dogType: 'jep', isHost: id === playerIds[0], isReady: true, joinedAt: Date.now() }])
    );
    return {
        roomCode: 'CMPRM',
        isPublic: false,
        modeLocked: false,
        gameMode,
        // Competitive layouts live on a flat arena; 'field' declares no
        // objective so tickObjective is a no-op and never interferes.
        sceneId: 'field',
        sheepCount,
        seed: 12345, // fixed seed → deterministic spawn placement
        state: 'waiting',
        lastActivity: Date.now(),
        simulation: null,
        players,
        getPlayer: (id) => players.get(id) || { id, name: id, dogType: 'jep' },
        broadcastToRoom: () => {},
        finishGame: () => {},
        getSerializableState: () => ({}),
        resolvePlayerName: (id) => id,
        onSubmitScores: async () => {}
    };
}

function tickFrames(sim, frameCount) {
    sim.isRunning = true;
    try {
        for (let i = 0; i < frameCount; i++) sim.tick();
    } finally {
        sim.isRunning = false;
    }
}

// Place a sheep at (x,z) with a crossing velocity, in the active state so it is
// eligible for gate scoring (updateCompetitiveSheepRetirements only checks
// !hasPassedGate && !isRetiring; state does not gate eligibility). A small
// crossing speed survives the per-tick physics (damping 0.98, smoothing 0.85)
// with its sign intact while moving the sheep only a fraction of a metre, so it
// stays inside the passage zone when retirement runs at the end of updateSheep.
function placeCrossingSheep(sheep, x, z, vx, vz) {
    sheep.position.set(x, z);
    sheep.velocity.set(vx, vz);
    sheep.acceleration.set(0, 0);
    sheep.hasPassedGate = false;
    sheep.isRetiring = false;
    sheep.retirementTarget = null;
    sheep.assignedGate = null;
    sheep.state = 0;
}

// Move every sheep except the one under test far away and inert, so neighbor
// flocking and crowding can't perturb the test sheep's velocity during a tick.
function quiesceOthers(sim, keepIndex) {
    sim.gameState.sheep.forEach((s, i) => {
        if (i === keepIndex) return;
        s.position.set(1000 + i, 1000 + i);
        s.velocity.set(0, 0);
        s.acceleration.set(0, 0);
        s.state = 2; // grazing → skipped by updateSheep physics
        s.hasPassedGate = false;
        s.isRetiring = false;
    });
}

describe('Worker competitive: construction & gate layout', () => {
    it('2 players → two gates, one per player, balanced north/south spawn, scores 0', () => {
        const sim = new GameSimulation(makeCompetitiveRoom(['p1', 'p2']));
        try {
            expect(sim.isCompetitive).toBe(true);
            const gates = sim.gameState.competitiveGates;
            expect(gates).toHaveLength(2);

            // One gate per player, assigned by index (assignGatesToPlayers).
            expect(gates[0].playerId).toBe('p1');
            expect(gates[1].playerId).toBe('p2');

            // Distinct owners, every player owns exactly one gate.
            const owners = gates.map((g) => g.playerId).sort();
            expect(owners).toEqual(['p1', 'p2']);

            // Balanced spawn: the 2p layout mirrors gates on the +Z / -Z axis.
            expect(gates[0].direction).toBe('north');
            expect(gates[0].position.x).toBe(0);
            expect(gates[0].position.z).toBe(100);
            expect(gates[1].direction).toBe('south');
            expect(gates[1].position.x).toBe(0);
            expect(gates[1].position.z).toBe(-100);

            // Scores initialised to zero for each player.
            expect(sim.gameState.playerScores).toEqual({ p1: 0, p2: 0 });

            // North passage zone: gateWidth=8 → x in [-4,4]; gateDepth=4 → z in [96,104].
            expect(gates[0].passageZone).toEqual({ minX: -4, maxX: 4, minZ: 96, maxZ: 104 });
        } finally {
            sim.cleanup?.();
        }
    });

    it('3 players → three gates (north/east/west), one per player, scores 0', () => {
        const sim = new GameSimulation(makeCompetitiveRoom(['a', 'b', 'c']));
        try {
            const gates = sim.gameState.competitiveGates;
            expect(gates).toHaveLength(3);
            expect(gates.map((g) => g.direction)).toEqual(['north', 'east', 'west']);
            expect(gates.map((g) => g.playerId)).toEqual(['a', 'b', 'c']);
            expect(sim.gameState.playerScores).toEqual({ a: 0, b: 0, c: 0 });

            // sheepdog entity per player, positioned at radius 15 around origin.
            expect(sim.sheepdogs.size).toBe(3);
        } finally {
            sim.cleanup?.();
        }
    });
});

describe('Worker competitive: gate scoring through a real tick', () => {
    it('a sheep crossing the north gate credits the owning player (+1) after a tick', () => {
        const sim = new GameSimulation(makeCompetitiveRoom(['p1', 'p2']));
        try {
            const gate = sim.gameState.competitiveGates[0]; // north, owned by p1
            expect(gate.playerId).toBe('p1');

            // Park one sheep dead-centre of the north gate moving north (+Z).
            const sheep = sim.gameState.sheep[0];
            quiesceOthers(sim, 0);
            placeCrossingSheep(sheep, gate.position.x, gate.position.z, 0, 0.5);

            expect(sim.gameState.playerScores.p1).toBe(0);

            tickFrames(sim, 1);

            // Owning player scored; opponent did not.
            expect(sheep.hasPassedGate).toBe(true);
            expect(sheep.isRetiring).toBe(true);
            expect(sheep.assignedGate).toBe(gate.id);
            expect(sim.gameState.playerScores.p1).toBe(1);
            expect(sim.gameState.playerScores.p2).toBe(0);
            // sheepRetired reflects the single passed sheep.
            expect(sim.gameState.sheepRetired).toBe(1);
        } finally {
            sim.cleanup?.();
        }
    });

    it('a sheep already through a gate is not double-counted on the next tick', () => {
        const sim = new GameSimulation(makeCompetitiveRoom(['p1', 'p2']));
        try {
            const gate = sim.gameState.competitiveGates[0];
            const sheep = sim.gameState.sheep[0];
            quiesceOthers(sim, 0);
            placeCrossingSheep(sheep, gate.position.x, gate.position.z, 0, 0.5);

            tickFrames(sim, 1);
            expect(sim.gameState.playerScores.p1).toBe(1);

            // Re-arm the velocity but leave hasPassedGate=true: the eligibility
            // guard (!hasPassedGate) means no second point is awarded.
            sheep.position.set(gate.position.x, gate.position.z);
            sheep.velocity.set(0, 0.5);
            tickFrames(sim, 1);
            expect(sim.gameState.playerScores.p1).toBe(1);
        } finally {
            sim.cleanup?.();
        }
    });
});

describe('Worker competitive: checkGatePassage direction table', () => {
    // Build a real layout to read the actual passage zones + directions.
    const sim = new GameSimulation(makeCompetitiveRoom(['p1', 'p2', 'c']));
    const gatesByDir = Object.fromEntries(sim.gameState.competitiveGates.map((g) => [g.direction, g]));
    sim.cleanup?.();

    const northZone = gatesByDir.north.passageZone; // {minX:-4,maxX:4,minZ:96,maxZ:104}
    const eastZone = gatesByDir.east.passageZone; // x in [96,104], z in [-4,4]
    const westZone = gatesByDir.west.passageZone; // x in [96..]→ centred at -100

    const centre = (zone) => new Vector2D((zone.minX + zone.maxX) / 2, (zone.minZ + zone.maxZ) / 2);

    it('north gate: true only for +Z velocity, false for -Z', () => {
        const p = centre(northZone);
        expect(checkGatePassage(p, new Vector2D(0, 1), northZone, 'north')).toBe(true);
        expect(checkGatePassage(p, new Vector2D(0, -1), northZone, 'north')).toBe(false);
        // Wrong axis only (vz === 0) is not a north crossing.
        expect(checkGatePassage(p, new Vector2D(1, 0), northZone, 'north')).toBe(false);
    });

    it('south gate: true only for -Z velocity, false for +Z', () => {
        const southZone = gatesByDir.north.passageZone; // reuse a north-style box for geometry
        const p = centre(southZone);
        expect(checkGatePassage(p, new Vector2D(0, -1), southZone, 'south')).toBe(true);
        expect(checkGatePassage(p, new Vector2D(0, 1), southZone, 'south')).toBe(false);
    });

    it('east gate: true only for +X velocity, false for -X', () => {
        const p = centre(eastZone);
        expect(checkGatePassage(p, new Vector2D(1, 0), eastZone, 'east')).toBe(true);
        expect(checkGatePassage(p, new Vector2D(-1, 0), eastZone, 'east')).toBe(false);
        expect(checkGatePassage(p, new Vector2D(0, 1), eastZone, 'east')).toBe(false);
    });

    it('west gate: true only for -X velocity, false for +X', () => {
        const p = centre(westZone);
        expect(checkGatePassage(p, new Vector2D(-1, 0), westZone, 'west')).toBe(true);
        expect(checkGatePassage(p, new Vector2D(1, 0), westZone, 'west')).toBe(false);
    });

    it('returns false when the position is outside the passage zone regardless of velocity', () => {
        const outside = new Vector2D(northZone.maxX + 50, (northZone.minZ + northZone.maxZ) / 2);
        expect(checkGatePassage(outside, new Vector2D(0, 1), northZone, 'north')).toBe(false);
    });
});

describe('Worker competitive: calculateWinProgress', () => {
    it('2 players → race to 101', () => {
        const sim = new GameSimulation(makeCompetitiveRoom(['p1', 'p2']));
        try {
            const wp = sim.calculateWinProgress();
            expect(wp.type).toBe('race');
            expect(wp.threshold).toBe(101);
            expect(wp.maxScore).toBe(0);
            expect(wp.isComplete).toBe(false);

            // Drive a score up; progress tracks maxScore / 101.
            sim.gameState.playerScores.p1 = 50;
            const wp2 = sim.calculateWinProgress();
            expect(wp2.maxScore).toBe(50);
            expect(wp2.progress).toBeCloseTo(50 / 101, 6);
            expect(wp2.isComplete).toBe(false);

            sim.gameState.playerScores.p1 = 101;
            expect(sim.calculateWinProgress().isComplete).toBe(true);
        } finally {
            sim.cleanup?.();
        }
    });

    it('3+ players → highest_score mode keyed to total sheep', () => {
        const sim = new GameSimulation(makeCompetitiveRoom(['a', 'b', 'c'], { sheepCount: 30 }));
        try {
            const wp = sim.calculateWinProgress();
            expect(wp.type).toBe('highest_score');
            expect(wp.totalSheep).toBe(30);
            expect(wp.totalCollected).toBe(0);
            expect(wp.maxScore).toBe(0);
            expect(wp.isComplete).toBe(false);

            sim.gameState.playerScores.a = 10;
            sim.gameState.playerScores.b = 5;
            const wp2 = sim.calculateWinProgress();
            expect(wp2.totalCollected).toBe(15);
            expect(wp2.maxScore).toBe(10);
            expect(wp2.progress).toBeCloseTo(15 / 30, 6);
        } finally {
            sim.cleanup?.();
        }
    });
});

describe('Worker competitive: checkGameCompletion / checkCompetitiveCompletion', () => {
    it('2p game completes with a race winner once a score reaches the threshold', () => {
        // checkCompetitiveCompletion threshold for 2p is Math.ceil(totalSheep/2).
        // With 200 sheep that is exactly 100 (note: the source comment says "101
        // for 200 sheep" but ceil(200/2) === 100 — the code, not the comment, is
        // authoritative here). calculateWinProgress's hardcoded 101 is a SEPARATE
        // display threshold and does not gate completion.
        const sim = new GameSimulation(makeCompetitiveRoom(['p1', 'p2'], { sheepCount: 200 }));
        try {
            expect(sim.gameState.gameCompleted).toBe(false);

            // Below threshold (99 < 100): no completion.
            sim.gameState.playerScores.p1 = 99;
            sim.checkGameCompletion();
            expect(sim.gameState.gameCompleted).toBe(false);
            expect(sim.completionData).toBeNull();

            // Reach the threshold (100) → completion latches with the competitive winner.
            sim.gameState.playerScores.p1 = 100;
            sim.checkGameCompletion();
            expect(sim.gameState.gameCompleted).toBe(true);
            expect(sim.completionData).not.toBeNull();
            expect(sim.completionData.isCompetitive).toBe(true);
            expect(sim.completionData.competitive.winner).toBe('p1');
            expect(sim.completionData.competitive.winType).toBe('race');
            expect(sim.completionData.competitive.finalScores).toEqual({ p1: 100, p2: 0 });
            expect(sim.completionData.competitive.winCondition.type).toBe('race');
        } finally {
            sim.cleanup?.();
        }
    });

    it('checkGameCompletion is idempotent after the game has completed', () => {
        const sim = new GameSimulation(makeCompetitiveRoom(['p1', 'p2'], { sheepCount: 200 }));
        try {
            sim.gameState.playerScores.p1 = 100;
            sim.checkGameCompletion();
            const firstData = sim.completionData;
            expect(sim.gameState.gameCompleted).toBe(true);

            // A second call early-returns (guard: if gameCompleted) and does not
            // rebuild completionData.
            sim.gameState.playerScores.p2 = 100;
            sim.checkGameCompletion();
            expect(sim.completionData).toBe(firstData);
            expect(sim.completionData.competitive.winner).toBe('p1');
        } finally {
            sim.cleanup?.();
        }
    });
});
