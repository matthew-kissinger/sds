// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 122 Phase 4: run the AUTHORITATIVE Worker sim on an island competitive
 * room, and exercise the migration story rather than asserting it.
 *
 * `.claude/rules/shared-sim.md` warns that a desync surfaces several seconds
 * late and only at scale, so a short clean run proves little. These specs tick
 * real frames on Rolling Hills and Open Country and look for the failure
 * classes a bad layout would actually produce: NaN leaking into positions,
 * sheep pinned against a boundary that has nothing to do with the island,
 * pastures nobody can reach, and a payload that does not carry what the client
 * needs to draw what the server is scoring.
 *
 * What this file does NOT do, stated plainly: it does not stand up a real
 * Durable Object over a real WebSocket with real browsers. See the Phase 4
 * record in the cycle plan for what that would add and why the wire is not
 * where this cycle's risk lives.
 */

import { describe, it, expect, vi } from 'vitest';
import { GameSimulation } from '../worker/src/GameSim.js';
import { loadScene } from '../shared/scenes/index.js';

function makeRoom(playerIds, { sceneId, sheepCount = 30, gameMode = 'competitive' } = {}) {
    const players = new Map(
        playerIds.map((id) => [
            id,
            { id, name: id, dogType: 'jep', isHost: id === playerIds[0], isReady: true, joinedAt: 1 }
        ])
    );
    return {
        roomCode: 'ISLND',
        isPublic: false,
        modeLocked: false,
        gameMode,
        sceneId,
        sheepCount,
        seed: 12345,
        state: 'waiting',
        lastActivity: 1,
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

/**
 * The EXACT transform from js/boot/initNetwork.js:330-351, copied verbatim.
 * This stands in for a client on the old build: it is the code that was already
 * deployed before this cycle, applied to the payload this cycle now produces.
 * If an old client can render the new layout from the new payload, the
 * migration story holds.
 */
function oldClientTransform(serverGates) {
    return serverGates.map((serverGate) => ({
        position: { x: serverGate.x || 0, z: serverGate.z || 0 },
        width: 8,
        height: 4,
        id: serverGate.id,
        playerId: serverGate.playerId,
        color: serverGate.color,
        direction: serverGate.direction,
        pasture: serverGate.pasture,
        passageZone: {
            minX: (serverGate.x || 0) - 4,
            maxX: (serverGate.x || 0) + 4,
            minZ: (serverGate.z || 0) - 2,
            maxZ: (serverGate.z || 0) + 2
        }
    }));
}

const ISLAND_ROOMS = [
    { sceneId: 'rolling-hills', gameMode: 'competitive' },
    { sceneId: 'rolling-hills', gameMode: 'timed' },
    { sceneId: 'open-country', gameMode: 'timed' }
];

describe('Cycle 122 Phase 4 - an island room ticks without desync-class failures', () => {
    for (const { sceneId, gameMode } of ISLAND_ROOMS) {
        it(`${sceneId} ${gameMode}: 600 frames stay finite and inside the island`, () => {
            const scene = loadScene(sceneId);
            const radius = scene.boundary.radius;
            const sim = new GameSimulation(makeRoom(['p1', 'p2'], { sceneId, gameMode }));
            sim.initializeSimulation();

            // 600 frames at 60Hz is ten seconds - past the point where
            // shared-sim.md says a divergence would have surfaced.
            tickFrames(sim, 600);

            const sheep = sim.gameState.sheep;
            expect(sheep.length).toBeGreaterThan(0);
            for (const s of sheep) {
                expect(Number.isFinite(s.position.x), 'sheep x went non-finite').toBe(true);
                expect(Number.isFinite(s.position.z), 'sheep z went non-finite').toBe(true);
                // The retirement path is allowed outside the play bounds, so
                // the check is against the island itself with the same 35m
                // slack the retirement clamp uses.
                const d = Math.hypot(s.position.x, s.position.z);
                expect(d, 'sheep left the island').toBeLessThan(radius + 35);
            }
        });

        it(`${sceneId} ${gameMode}: the sheep are NOT pinned inside the old 200m square`, () => {
            // The defect this cycle closes. Before, gameState.bounds was Home
            // Field's +-100 on every scene, so an island round happened inside
            // a square with no relationship to the land.
            const scene = loadScene(sceneId);
            const sim = new GameSimulation(makeRoom(['p1', 'p2'], { sceneId, gameMode }));
            sim.initializeSimulation();
            expect(sim.gameState.bounds.maxX).toBe(scene.boundary.radius);
            expect(sim.gameState.bounds.minZ).toBe(-scene.boundary.radius);
        });
    }

    it('Rolling Hills competitive puts every pasture on the island, reachable', () => {
        const rh = loadScene('rolling-hills').boundary;
        const safeReach = rh.radius - rh.falloff;
        for (const playerIds of [['p1', 'p2'], ['p1', 'p2', 'p3'], ['p1', 'p2', 'p3', 'p4']]) {
            const sim = new GameSimulation(makeRoom(playerIds, { sceneId: 'rolling-hills' }));
            sim.initializeSimulation();
            const gates = sim.gameState.competitiveGates;
            expect(gates).toHaveLength(playerIds.length);
            for (const g of gates) {
                const corners = [
                    [g.pasture.minX, g.pasture.minZ],
                    [g.pasture.minX, g.pasture.maxZ],
                    [g.pasture.maxX, g.pasture.minZ],
                    [g.pasture.maxX, g.pasture.maxZ]
                ];
                for (const [x, z] of corners) {
                    expect(Math.hypot(x, z)).toBeLessThanOrEqual(safeReach + 1e-9);
                }
                // Reachable: inside the hard radial clamp, not merely on land.
                expect(Math.hypot(g.position.x, g.position.z)).toBeLessThan(rh.radius);
            }
        }
    });

    it('never logs an error while constructing and ticking an island room', () => {
        const errors = [];
        const spy = vi.spyOn(console, 'error').mockImplementation((line) => { errors.push(String(line)); });
        try {
            for (const { sceneId, gameMode } of ISLAND_ROOMS) {
                const sim = new GameSimulation(makeRoom(['p1', 'p2'], { sceneId, gameMode }));
                sim.initializeSimulation();
                tickFrames(sim, 120);
            }
        } finally {
            spy.mockRestore();
        }
        expect(errors).toEqual([]);
    });
});

describe('Cycle 122 Phase 4 - the migration story, exercised', () => {
    it('an OLD client transform renders the NEW island layout from the broadcast payload', () => {
        const sim = new GameSimulation(makeRoom(['p1', 'p2', 'p3'], { sceneId: 'rolling-hills' }));
        sim.initializeSimulation();

        // Exactly what the DO puts on the wire (worker/src/GameSim.js:1786).
        const payload = sim.gameState.competitiveGates.map((gate) => ({
            id: gate.id,
            x: gate.position.x,
            z: gate.position.z,
            playerId: gate.playerId,
            color: gate.color,
            direction: gate.direction,
            pasture: gate.pasture
        }));

        const clientGates = oldClientTransform(payload);

        expect(clientGates).toHaveLength(3);
        clientGates.forEach((cg, i) => {
            const server = sim.gameState.competitiveGates[i];
            // The client draws the gate where the server put it, on the island.
            expect(cg.position.x).toBe(server.position.x);
            expect(cg.position.z).toBe(server.position.z);
            expect(cg.pasture).toEqual(server.pasture);
            expect(cg.playerId).toBe(server.playerId);
            expect(cg.direction).toBe(server.direction);
            // And it is the ISLAND layout, not Home Field's.
            expect(Math.hypot(cg.position.x, cg.position.z)).not.toBe(100);
        });
    });

    it('the payload carries every field the client transform reads', () => {
        const sim = new GameSimulation(makeRoom(['p1', 'p2'], { sceneId: 'rolling-hills' }));
        sim.initializeSimulation();
        for (const gate of sim.gameState.competitiveGates) {
            for (const key of ['id', 'playerId', 'color', 'direction', 'pasture']) {
                expect(gate[key], `broadcast payload is missing ${key}`).toBeDefined();
            }
            expect(Number.isFinite(gate.position.x)).toBe(true);
            expect(Number.isFinite(gate.position.z)).toBe(true);
        }
    });

    it('HAZARD A: the client passage zone is shallower than the server s, and still is', () => {
        // Pre-existing, found by the Cycle 122 trace, deliberately NOT fixed
        // here. Recorded so it is a known quantity rather than a surprise: the
        // client hardcodes z +-2 for every direction while the server computes
        // z +-4 for a north gate and rotates for east/west. The DO is
        // authoritative and broadcasts retirements, so this self-corrects
        // rather than desyncing - but the client predicts gate passage on a
        // different volume than the server scores it.
        const sim = new GameSimulation(makeRoom(['p1', 'p2'], { sceneId: 'rolling-hills' }));
        sim.initializeSimulation();
        const server = sim.gameState.competitiveGates[0];
        const client = oldClientTransform([
            { id: server.id, x: server.position.x, z: server.position.z, playerId: server.playerId, color: server.color, direction: server.direction, pasture: server.pasture }
        ])[0];

        const serverDepth = server.passageZone.maxZ - server.passageZone.minZ;
        const clientDepth = client.passageZone.maxZ - client.passageZone.minZ;
        expect(server.direction).toBe('north');
        expect(serverDepth).toBe(8);
        expect(clientDepth).toBe(4);
        // If someone fixes this, this assertion is what tells them to update
        // the migration story rather than silently changing prediction.
        expect(clientDepth).toBeLessThan(serverDepth);
    });

    it('HAZARD B: gate width stays scene-independent, because the client hardcodes 8', () => {
        for (const sceneId of ['field', 'rolling-hills', 'open-country']) {
            const gameMode = sceneId === 'open-country' ? 'timed' : 'competitive';
            const sim = new GameSimulation(makeRoom(['p1', 'p2'], { sceneId, gameMode }));
            sim.initializeSimulation();
            for (const gate of sim.gameState.competitiveGates) {
                expect(gate.width, `${sceneId} gate width must stay 8 until width rides the wire`).toBe(8);
            }
        }
    });
});

describe('Cycle 122 Phase 4 - Home Field is untouched', () => {
    it('the default scene still lays out exactly where it always did', () => {
        const sim = new GameSimulation(makeRoom(['p1', 'p2'], { sceneId: 'field' }));
        sim.initializeSimulation();
        const [north, south] = sim.gameState.competitiveGates;
        expect(north.position.x).toBe(0);
        expect(north.position.z).toBe(100);
        expect(south.position.z).toBe(-100);
        expect(north.pasture).toMatchObject({ minX: -30, maxX: 30, minZ: 102, maxZ: 130 });
        expect(sim.gameState.bounds).toEqual({ minX: -100, maxX: 100, minZ: -100, maxZ: 100 });
    });
});
