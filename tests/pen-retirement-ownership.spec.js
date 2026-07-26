// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Who owns retirement in the Worker's dispatch, on the two scenes that declare a
 * fenced pen.
 *
 * `GameSimulation.updateSheep` ends in an if/else chain that picks exactly one
 * retirement system: survival, competitive/timed, corral, gate+pasture. Cycle
 * 117 added a fifth - the pen barrier - and guarded the gate arm with
 * `this.gameState.gate`, which is the WRONG QUESTION. It happens to stand the
 * gate arm down on Rolling Hills only because that scene nests its gate inside
 * the pen descriptor, so `createGameState` never sees it.
 *
 * Newsheepdogland is the other pen scene, and it declares a TOP-LEVEL gate with
 * no pasture. So on a co-op (non-survival) Newsheepdogland room `gameState.gate`
 * is truthy, the gate arm ran, and `updateSheepRetirements` dereferenced a null
 * `pasture` the moment a sheep touched the phantom passage zone that
 * `createGameState` pins to x = 0. It also pre-empted the scene's own pen tick,
 * so even short of the throw the wrong system owned retirement.
 *
 * The guard asks for the BARRIER now, which is the same question the tick loop
 * already asks when it decides who advances the pen.
 *
 * Real scene modules, real `GameSimulation`, real spawn seeding throughout.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createGameState } from '../shared/index.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { PenBarrier } from '../shared/PenBarrier.js';
import { GameSimulation } from '../worker/src/GameSim.js';

const GAMESIM_SRC = readFileSync(
    fileURLToPath(new URL('../worker/src/GameSim.js', import.meta.url)),
    'utf8',
);

function makeRoomAdapter(gameMode, sceneId, sheepCount = 24) {
    const players = new Map(
        ['p1', 'p2'].map((id) => [
            id,
            { id, name: id.toUpperCase(), dogType: 'jep', isHost: id === 'p1', isReady: true, joinedAt: 0 },
        ]),
    );
    return {
        roomCode: 'PENOWN',
        isPublic: false,
        modeLocked: false,
        gameMode,
        sceneId,
        sheepCount,
        seed: 0xC117,
        state: 'in-game',
        lastActivity: 0,
        simulation: null,
        players,
        getPlayer: (id) => players.get(id),
        broadcastToRoom: () => {},
        finishGame: () => {},
        getSerializableState: () => ({}),
        resolvePlayerName: (id) => id.toUpperCase(),
        onSubmitScores: async () => {},
    };
}

describe('Newsheepdogland is the pen scene the gate-shaped guard missed', () => {
    it('has the shape that made the guard wrong: a top-level gate and no pasture', () => {
        expect(newsheepdogland.gate.position).toEqual({ x: 610, z: -1000 });
        expect(newsheepdogland.pasture).toBeUndefined();
        expect(newsheepdogland.pen.center).toEqual({ x: 640, z: -1000 });

        const state = createGameState({ sceneId: 'newsheepdogland', totalSheep: 24 });
        expect(state.gate, 'a top-level gate produces a non-null gameState.gate').not.toBeNull();
        expect(state.pasture, 'and there is no pasture to retire into').toBeNull();
        expect(state.corral).toBeNull();
        // And the phantom zone is pinned to x = 0, 610m west of the real gate.
        expect(state.gate.passageZone.minX).toBe(-6);
        expect(state.gate.passageZone.maxX).toBe(6);
    });

    it('stands its barrier up on a co-op room, so the barrier is the live question', () => {
        const sim = new GameSimulation(makeRoomAdapter('cooperative', 'newsheepdogland'));
        try {
            expect(sim.isSurvival, 'a co-op room is NOT survival').toBe(false);
            expect(sim._penBarrier).toBeInstanceOf(PenBarrier);
            expect(sim.gameState.gate).not.toBeNull();
            expect(sim.gameState.pasture).toBeNull();
        } finally {
            sim.cleanup?.();
        }
    });

    it('does not dereference the null pasture when a sheep touches the phantom zone', () => {
        const sim = new GameSimulation(makeRoomAdapter('cooperative', 'newsheepdogland'));
        try {
            const zone = sim.gameState.gate.passageZone;
            const zx = (zone.minX + zone.maxX) / 2;
            const zz = (zone.minZ + zone.maxZ) / 2;
            // Park a few of the round's real sheep in the phantom passage zone,
            // moving north - the exact input `checkGatePassage` reports true on,
            // and the input that then reads `pasture.minX`. Re-pinned each frame
            // so the movement integration cannot drift them out of it.
            const parked = sim.gameState.sheep.slice(0, 4);
            expect(() => {
                for (let i = 0; i < 20; i++) {
                    parked.forEach((s, k) => {
                        s.position.x = zx + (k - 1.5) * 0.5;
                        s.position.z = zz;
                        s.velocity.set(0, 2);
                    });
                    sim.updateSheepdogs();
                    sim.updateSheep();
                }
            }).not.toThrow();

            // And none of them counts as retired: the homestead pen is 610m east
            // of where they are standing.
            for (const s of parked) {
                expect(s.hasPassedGate, `sheep ${s.id} did not enter the homestead`).toBe(false);
                expect(s.isRetiring).toBe(false);
            }
            expect(sim.gameState.sheepRetired).toBe(sim._penBarrier.pennedCount);
        } finally {
            sim.cleanup?.();
        }
    });

    it('retires into the homestead pen, and only there', () => {
        const sim = new GameSimulation(makeRoomAdapter('cooperative', 'newsheepdogland'));
        try {
            const { center } = newsheepdogland.pen;
            const homed = sim.gameState.sheep.slice(0, 3);
            for (const s of homed) {
                s.position.x = center.x;
                s.position.z = center.z;
            }
            sim.updateSheepdogs();
            sim.updateSheep();
            sim._tickPen(1 / 60);

            for (const s of homed) {
                expect(s.penned, `sheep ${s.id} penned`).toBe(true);
                expect(s.hasPassedGate).toBe(true);
            }
            expect(sim.gameState.sheepRetired).toBe(sim._penBarrier.pennedCount);
            expect(sim.gameState.sheepRetired).toBeGreaterThanOrEqual(3);
        } finally {
            sim.cleanup?.();
        }
    });

    it('logs no tick_error across a real co-op tick loop', () => {
        const errors = [];
        const spy = vi.spyOn(console, 'error').mockImplementation((line) => { errors.push(String(line)); });
        const sim = new GameSimulation(makeRoomAdapter('cooperative', 'newsheepdogland'));
        try {
            const zone = sim.gameState.gate.passageZone;
            sim.isRunning = true;
            for (let i = 0; i < 20; i++) {
                const s = sim.gameState.sheep[0];
                s.position.x = 0;
                s.position.z = (zone.minZ + zone.maxZ) / 2;
                s.velocity.set(0, 2);
                sim.tick();
            }
        } finally {
            sim.isRunning = false;
            sim.cleanup?.();
            spy.mockRestore();
        }
        expect(errors.filter((e) => e.includes('tick_error'))).toEqual([]);
    });
});

describe('the dispatch names the barrier, not the absence of a gate', () => {
    it('puts the barrier arm ahead of the gate arm in the retirement chain', () => {
        // Anchored between the corral arm and the gate arm, because the same
        // `else if (this._penBarrier)` text also appears in tick()'s
        // survival-or-pen dispatch and an unanchored search finds that one.
        const corralArm = GAMESIM_SRC.indexOf('} else if (this.gameState.corral) {');
        const gateArm = GAMESIM_SRC.indexOf('} else if (this.gameState.gate) {');
        expect(corralArm, 'the chain still has a corral arm').toBeGreaterThan(-1);
        expect(gateArm, 'the chain still has a gate arm').toBeGreaterThan(-1);
        const penArm = GAMESIM_SRC.lastIndexOf('} else if (this._penBarrier) {', gateArm);
        expect(penArm, 'the barrier claims retirement before the gate does')
            .toBeGreaterThan(corralArm);
        expect(penArm).toBeLessThan(gateArm);
    });

    it('leaves Rolling Hills, the nested-gate pen scene, on the barrier too', () => {
        const sim = new GameSimulation(makeRoomAdapter('cooperative', 'rolling-hills'));
        try {
            expect(sim.gameState.gate).toBeNull();
            expect(sim._penBarrier).toBeInstanceOf(PenBarrier);
            const { minX, maxX, minZ, maxZ } = rollingHills.pen;
            const s = sim.gameState.sheep[0];
            s.position.x = (minX + maxX) / 2;
            s.position.z = (minZ + maxZ) / 2;
            sim.updateSheepdogs();
            sim.updateSheep();
            sim._tickPen(1 / 60);
            expect(s.penned).toBe(true);
        } finally {
            sim.cleanup?.();
        }
    });

    it('leaves Home Field, which has a gate and a pasture and no pen, on the gate arm', () => {
        const sim = new GameSimulation(makeRoomAdapter('cooperative', 'field'));
        try {
            expect(sim._penBarrier, 'no pen, no barrier').toBeNull();
            expect(sim.gameState.gate).not.toBeNull();
            expect(sim.gameState.pasture).not.toBeNull();
            expect(() => {
                sim.updateSheepdogs();
                sim.updateSheep();
            }).not.toThrow();
        } finally {
            sim.cleanup?.();
        }
    });
});

describe('the dead pasture-containment path is gone', () => {
    it('has no applyPastureContainment to dereference a null pasture', () => {
        // It fell through to `targetPasture = this.gameState.pasture` and read
        // `.minX` with no guard, and `pasture` is null on three of the four
        // scenes. It had zero callers from the Cycle 2 migration that introduced
        // it right up to its removal, so a guard would have been dead code
        // guarding dead code.
        expect(GameSimulation.prototype.applyPastureContainment).toBeUndefined();
        expect(GAMESIM_SRC).not.toContain('applyPastureContainment');
        // The methods either side of where it sat are still there, so this is
        // not passing because the file failed to load.
        expect(typeof GameSimulation.prototype.updateGrazingSheep).toBe('function');
        expect(typeof GameSimulation.prototype.shouldSeekGate).toBe('function');
    });
});
