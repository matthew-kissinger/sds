// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 117 P2/P3 - the Rolling Hills island pasture.
 *
 * The island's destination stopped being a corral disc with an invisible 8m
 * trigger and became a fenced pasture with one open gate. Three things about
 * that change are load-bearing and none of them are obvious from reading the
 * scene file, so they are pinned here:
 *
 *   1. `gameState.gate` stays NULL on Rolling Hills. The gate is declared
 *      NESTED inside the pen descriptor precisely so `createGameState` does not
 *      see it, because a non-null `gameState.gate` switches on Worker
 *      gate-attraction the island has never had and a passage-zone suppression
 *      rect pinned to x=0. This is cycle hard stop 2.
 *   2. Dropping the corral must not make the Worker CRASH. The retirement
 *      dispatch used to fall through to `updateSheepRetirements`, which
 *      dereferences `gate.passageZone`, so a co-op island room would have
 *      thrown on every tick. Competitive and timed have to keep working exactly
 *      as badly as they did before and no worse (DECISIONS D23): they land on
 *      Home Field's hardcoded layout, which is wrong for an island, but they
 *      land on A layout rather than on a null.
 *   3. The barrier is what retires a sheep, on both sides. The client's
 *      gate-passage arm has to stand down on a pen scene, because
 *      `GameState.gate` defaults to Home Field's gate at (0, 100) and never
 *      gets nulled per scene - and (0, 100) is 100m INSIDE this 180m island.
 *
 * Everything below reads the real scene modules and the real factories. No
 * hand-rolled scene stubs: a spec of this shape has three times in this project
 * certified the bug instead of catching it by comparing against its own stub.
 */
import { describe, it, expect, vi } from 'vitest';

import { createGameState, loadScene } from '../shared/index.js';
import { createCompetitiveGameState } from '../shared/CompetitiveMode.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';
import { PenBarrier } from '../shared/PenBarrier.js';
import { GameSimulation, createScenePenBarrier } from '../worker/src/GameSim.js';

function makeRoomAdapter(gameMode = 'cooperative', sceneId = 'rolling-hills', playerIds = ['p1', 'p2']) {
    const players = new Map(
        playerIds.map((id) => [
            id,
            { id, name: id.toUpperCase(), dogType: 'jep', isHost: id === playerIds[0], isReady: true, joinedAt: 0 },
        ]),
    );
    return {
        roomCode: 'ISLERM',
        isPublic: false,
        modeLocked: false,
        gameMode,
        sceneId,
        sheepCount: 30,
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

function tickN(sim, n) {
    sim.isRunning = true;
    try {
        for (let i = 0; i < n; i++) sim.tick();
    } finally {
        sim.isRunning = false;
    }
}

describe('the island gate is nested, so gameState.gate stays null', () => {
    it('declares no top-level gate and no corral, and nests the gate in the pen', () => {
        expect(rollingHills.corral).toBeUndefined();
        expect(rollingHills.gate).toBeUndefined();
        expect(rollingHills.pen.gate.position).toEqual({ x: 50, z: -58 });
        expect(rollingHills.pen.gate.width).toBe(12);
    });

    it('resolves a null gate through createGameState', () => {
        const state = createGameState({ sceneId: 'rolling-hills', totalSheep: 30 });
        expect(state.gate).toBeNull();
        expect(state.pasture).toBeNull();
        expect(state.corral).toBeNull();
    });

    // The assertion above is only worth having if the derivation it traces is
    // live. `createGameState` resolves its scene by id through `loadScene`, so
    // there is no seam to hand it a variant object - passing `gatePosition`
    // instead exercises the config override and says nothing at all about
    // `scene.gate?.position`, which is the line hard stop 2 is about. Declare
    // the field where the hard stop forbids it, on the real scene the registry
    // hands out, and put it back in `finally`.
    it('would produce a non-null gate if the gate were declared top-level, which is the point', () => {
        expect('gate' in rollingHills, 'the island declares no top-level gate').toBe(false);
        let state;
        try {
            rollingHills.gate = rollingHills.pen.gate;
            state = createGameState({ sceneId: 'rolling-hills', totalSheep: 30 });
        } finally {
            delete rollingHills.gate;
        }
        expect(rollingHills.gate, 'the scene module is left as it was').toBeUndefined();
        expect(createGameState({ sceneId: 'rolling-hills', totalSheep: 30 }).gate).toBeNull();

        expect(state.gate).not.toBeNull();
        expect(state.gate.position.x).toBe(50);
        expect(state.gate.position.z).toBe(-58);
        // And here is the specific harm: the passage zone the sim would build
        // is pinned to x=0, nowhere near the island's gate at x=50.
        expect(state.gate.passageZone.minX).toBe(-6);
        expect(state.gate.passageZone.maxX).toBe(6);
    });

    // Newsheepdogland keeps its TOP-LEVEL gate. The resolver order
    // (`pen.gate ?? scene.gate`) exists for it; a nested-only resolver would
    // silently drop its barrier. Asserted through the production resolver
    // rather than by re-writing `pen.gate ?? scene.gate` here - a spec that
    // re-implements the line it is checking passes whatever the line does.
    it('leaves Newsheepdogland resolving its top-level homestead gate', () => {
        expect(newsheepdogland.pen.gate).toBeUndefined();
        expect(newsheepdogland.gate.position).toEqual({ x: 610, z: -1000 });

        const barrier = createScenePenBarrier(newsheepdogland, 0xC117);
        expect(barrier, 'the homestead still gets a barrier').toBeInstanceOf(PenBarrier);
        expect(barrier.gateX).toBe(newsheepdogland.gate.position.x);
        expect(barrier.gateZ).toBe(newsheepdogland.gate.position.z);
        expect(barrier.gateHalf).toBe(newsheepdogland.gate.width / 2);

        // And the island's nested gate goes through the same resolver, so the
        // one function covers both halves of the order.
        const island = createScenePenBarrier(rollingHills, 0xC117);
        expect(island.gateX).toBe(rollingHills.pen.gate.position.x);
        expect(island.gateZ).toBe(rollingHills.pen.gate.position.z);
    });
});

describe('the Worker survives an island co-op room without a corral', () => {
    it('runs the retirement dispatch without dereferencing a null gate', () => {
        const sim = new GameSimulation(makeRoomAdapter('cooperative'));
        try {
            expect(sim.gameState.corral).toBeNull();
            expect(sim.gameState.gate).toBeNull();
            // updateSheep is NOT wrapped in tick()'s try/catch, so this is the
            // call that throws if the dispatch loses its guard. Before Cycle
            // 117 P2 this was a TypeError on `gate.passageZone`, every tick.
            expect(() => {
                for (let i = 0; i < 5; i++) {
                    sim.updateSheepdogs();
                    sim.updateSheep();
                }
            }).not.toThrow();
        } finally {
            sim.cleanup?.();
        }
    });

    it('logs no tick_error across a real tick loop', () => {
        // tick() swallows everything into a `tick_error` log line, so "did not
        // throw" is not observable from the outside. Watch the sink instead.
        const errors = [];
        const spy = vi.spyOn(console, 'error').mockImplementation((line) => { errors.push(String(line)); });
        const sim = new GameSimulation(makeRoomAdapter('cooperative'));
        try {
            tickN(sim, 30);
        } finally {
            sim.cleanup?.();
            spy.mockRestore();
        }
        expect(errors.filter((e) => e.includes('tick_error'))).toEqual([]);
    });

    it('stands the pen barrier up and publishes its count as sheepRetired', () => {
        const sim = new GameSimulation(makeRoomAdapter('cooperative'));
        try {
            expect(sim._penBarrier).toBeInstanceOf(PenBarrier);
            const pen = rollingHills.pen;
            // Put three sheep in the pasture and one hard against the WEST wall
            // from outside. The barrier retires the first three and refuses the
            // fourth: the only crossing is the gate, which is on the north edge.
            const inside = [0, 1, 2];
            for (const i of inside) {
                sim.gameState.sheep[i].position.x = 50;
                sim.gameState.sheep[i].position.z = -76;
            }
            const outsider = sim.gameState.sheep[3];
            outsider.position.x = pen.minX - 0.5;
            outsider.position.z = -76;

            tickN(sim, 3);

            for (const i of inside) {
                const s = sim.gameState.sheep[i];
                expect(s.penned, `sheep ${i} penned`).toBe(true);
                expect(s.hasPassedGate, `sheep ${i} counts as retired`).toBe(true);
                expect(s.state).toBe(2);
            }
            expect(outsider.penned).toBeFalsy();
            expect(outsider.position.x).toBeLessThanOrEqual(pen.minX - 0.6);
            expect(sim.gameState.sheepRetired).toBe(sim._penBarrier.pennedCount);
            expect(sim.gameState.sheepRetired).toBeGreaterThanOrEqual(3);
        } finally {
            sim.cleanup?.();
        }
    });

    it('gives every player dog its own fence-side memory, and contains each one', () => {
        // A memory object per dog is only worth allocating if `containDog` then
        // does something with it. Drive both halves: one dog held out at a solid
        // fence run, one walked in through the gate, in the same tick.
        const sim = new GameSimulation(makeRoomAdapter('cooperative'));
        try {
            const pen = rollingHills.pen;
            const DOG_BODY = 1.0; // PenBarrier's default dog radius
            const p1 = sim.sheepdogs.get('p1');
            const p2 = sim.sheepdogs.get('p2');

            // p1: half a metre inside the WEST wall, at the pasture's mid-z, so
            // it is 18m from the gate and the nearest grown face is unambiguous.
            // The barrier pushes it back to the Minkowski standoff.
            p1.position.x = pen.minX + 0.5;
            p1.position.z = (pen.minZ + pen.maxZ) / 2;
            // p2: one metre inside the NORTH edge - the edge that holds the gate -
            // at the gate's own x. That is the opening, so it walks through.
            p2.position.x = pen.gate.position.x;
            p2.position.z = pen.maxZ - 1;

            tickN(sim, 1);

            expect([...sim._penDogMem.keys()].sort()).toEqual(['p1', 'p2']);

            expect(p1.position.x, 'p1 is pushed to the fence standoff')
                .toBeCloseTo(pen.minX - DOG_BODY, 9);
            expect(p1.position.z).toBeCloseTo((pen.minZ + pen.maxZ) / 2, 9);
            expect(sim._penDogMem.get('p1').inside).toBe(false);

            // p2 is untouched, and the pen now remembers it as an insider - which
            // is the state that lets it move around in there next tick instead of
            // being shoved back out through the gate it just came in by.
            expect(p2.position.x, 'p2 passes through the gate').toBeCloseTo(pen.gate.position.x, 9);
            expect(p2.position.z).toBeCloseTo(pen.maxZ - 1, 9);
            expect(sim._penDogMem.get('p2').inside).toBe(true);

            // Same depth past the same edge, one pen-width to the west of the
            // opening: kept out. So "passed" above is the gate and not the edge.
            p2.position.x = pen.minX + 4;
            p2.position.z = pen.maxZ - 1;
            sim._penDogMem.get('p2').inside = false;
            tickN(sim, 1);
            expect(p2.position.z, 'no walking through the fence beside the gate')
                .toBeCloseTo(pen.maxZ + DOG_BODY, 9);
        } finally {
            sim.cleanup?.();
        }
    });
});

describe('competitive and timed stay exactly as broken as they were (D23)', () => {
    it('still advertises both modes on the island', () => {
        expect(rollingHills.allowedModes).toContain('competitive');
        expect(rollingHills.allowedModes).toContain('timed');
    });

    it('lands a competitive island state on a layout rather than on a null', () => {
        // The layout is Home Field geometry regardless of scene - that is the
        // known, deliberately unfixed part. What must not happen is a null.
        const state = createCompetitiveGameState({ totalSheep: 30 }, ['p1', 'p2']);
        expect(state.competitiveGates).toHaveLength(2);
        for (const gate of state.competitiveGates) {
            expect(gate.passageZone).toBeTruthy();
            expect(gate.pasture).toBeTruthy();
        }
    });

    for (const mode of ['competitive', 'timed']) {
        it(`constructs and ticks a ${mode} island room without throwing`, () => {
            const errors = [];
            const spy = vi.spyOn(console, 'error').mockImplementation((line) => { errors.push(String(line)); });
            const sim = new GameSimulation(makeRoomAdapter(mode));
            try {
                expect(sim.gameState.competitiveGates.length).toBeGreaterThan(0);
                // No barrier in these modes: a mid-island fence would sit across
                // the competitive pastures.
                expect(sim._penBarrier).toBeNull();
                expect(() => {
                    sim.updateSheepdogs();
                    sim.updateSheep();
                }).not.toThrow();
                tickN(sim, 20);
            } finally {
                sim.cleanup?.();
                spy.mockRestore();
            }
            expect(errors.filter((e) => e.includes('tick_error'))).toEqual([]);
        });
    }
});

describe('a pen scene owns its enclosure and gets no Home Field ring on top', () => {
    it('builds the island pasture, and no Home Field ring, for a scene that declares a pen', async () => {
        // Rolling Hills sets `perimeterFence: false` and, since Cycle 117 P2,
        // no `corral`. Without an enclosure it falls straight through to
        // `buildGateAndPenOnly`, which lays FieldConfig's gate at (0, 100) -
        // inside the island - with a pen fence behind it. Cycle 117 P4 turned
        // that suppression flag into the thing it suppressed FOR: one option
        // that carries the scene's own pen, so the same call that skips the
        // default ring is the call that raises the real fence.
        const THREE = await import('three');
        const { StructureBuilder, resolveSceneEnclosure } = await import('../js/StructureBuilder.js');
        const { FieldConfig } = await import('../js/FieldConfig.js');

        const build = (opts) => {
            const scene = new THREE.Scene();
            const sb = new StructureBuilder(scene);
            sb.buildSinglePlayerStructures(
                FieldConfig.getBounds(),
                FieldConfig.getGate(),
                FieldConfig.getPasture(),
                opts,
            );
            return sb;
        };

        const enclosure = resolveSceneEnclosure(rollingHills);
        expect(enclosure, 'the island declares a pen with a gate in it').toBeTruthy();

        const withPen = build({ perimeterFence: false, corral: null, enclosure });
        // Nothing in `fences`: the default ring is what lives there, and it was
        // skipped. The enclosure is a gate structure.
        expect(withPen.structures.fences.length).toBe(0);
        expect(withPen.structures.gates.length).toBe(1);

        // Every piece of it sits on the island pasture, not at Home Field's
        // origin gate. Checked as world positions rather than by counting: a
        // count passes just as well when the geometry is in the wrong place.
        const { minX, maxX, minZ, maxZ } = rollingHills.pen;
        const root = withPen.structures.gates[0];
        const pieces = [];
        root.traverse((n) => {
            // The root group itself sits at the origin by construction (every
            // piece under it carries its own world placement), so it is not a
            // position this asserts about.
            if (n !== root) pieces.push(n.getWorldPosition(new THREE.Vector3()));
        });
        expect(pieces.length).toBeGreaterThan(0);
        // Slack because the gate leaf swings outward past the fence line when
        // it is open, which it always is on a scene with no day clock. Home
        // Field's gate is at (0, 100), some 160m from this box, so this catches
        // the regression with room to spare.
        const SLACK = 8;
        for (const p of pieces) {
            expect(p.x).toBeGreaterThanOrEqual(minX - SLACK);
            expect(p.x).toBeLessThanOrEqual(maxX + SLACK);
            expect(p.z).toBeGreaterThanOrEqual(minZ - SLACK);
            expect(p.z).toBeLessThanOrEqual(maxZ + SLACK);
        }

        // Same call WITHOUT the enclosure is the regression it guards: a fence
        // group built out of Home Field's geometry.
        expect(build({ perimeterFence: false, corral: null }).structures.fences.length)
            .toBeGreaterThan(0);
    });

    it('leaves the gate opening open in the fence ring, exactly where the barrier gaps it', async () => {
        // The fence the player sees and the fence the sim enforces are two
        // separate pieces of code reading one descriptor. If they disagree the
        // flock walks through a wall or bounces off thin air, so pin them
        // against each other on the real scene.
        const THREE = await import('three');
        const { StructureBuilder, resolveSceneEnclosure, resolvePenBox } =
            await import('../js/StructureBuilder.js');

        const enclosure = resolveSceneEnclosure(rollingHills);
        const sb = new StructureBuilder(new THREE.Scene());
        sb.fencePresets.useGLBModels = false;
        const group = sb.buildPenEnclosure(enclosure);

        const barrier = new PenBarrier(enclosure.pen, enclosure.gate);
        const box = resolvePenBox(enclosure.pen);
        expect(box).toEqual({
            minX: barrier.minX, maxX: barrier.maxX, minZ: barrier.minZ, maxZ: barrier.maxZ,
        });

        // The gate assembly stands at the gate, and no fence segment spans it.
        const assembly = group.getObjectByName('PenGateAssembly');
        expect(assembly.position.x).toBeCloseTo(enclosure.gate.x, 6);
        expect(assembly.position.z).toBeCloseTo(enclosure.gate.z, 6);

        const half = enclosure.gate.width / 2;
        // Walk the opening. Every point across it must read as gate gap to the
        // barrier, and must have no fence segment covering it.
        const segments = group.children.filter((c) => c !== assembly);
        expect(segments.length).toBe(5); // three whole edges + two gate flanks
        for (let t = -0.9; t <= 0.9; t += 0.1) {
            const x = enclosure.gate.x + t * half;
            const z = enclosure.gate.z;
            expect(barrier._inGateGap(x, z, 0.6, true), `barrier gaps (${x}, ${z})`).toBe(true);
            for (const seg of segments) {
                // Flanks on the gate edge run along x; a segment covers this
                // point only if its span contains it.
                const spec = seg.userData.fenceInstancingSpec;
                const len = spec?.length ?? 0;
                if (Math.abs(seg.position.z - z) > 0.01) continue;
                const along = Math.abs(x - seg.position.x);
                expect(along, `no fence over the opening at x=${x}`).toBeGreaterThan(len / 2 - 1e-6);
            }
        }
    });
});

describe('the client stands its gate arm down on a pen scene', () => {
    it('keeps the phantom Home Field gate from retiring island sheep', async () => {
        // The concrete hazard, stated as geometry: GameState is constructed with
        // FieldConfig's gate, nothing nulls it per scene, and its passage zone
        // sits inside the Rolling Hills island disc.
        const { FieldConfig } = await import('../js/FieldConfig.js');
        const gate = FieldConfig.getGate();
        const { center, radius } = rollingHills.boundary;
        const d = Math.hypot(gate.position.x - center.x, gate.position.z - center.z);
        expect(d).toBeLessThan(radius);

        const { GameState } = await import('../js/GameState.js');
        const state = new GameState();
        expect(state.gate, 'GameState still ships FieldConfig gate by default').toBeTruthy();
        state.pen = rollingHills.pen;
        state.gameActive = true;
        // The retirement tally lives at the tail of updateSheepBehaviors, past
        // an early return when there is no sheep system. Nothing here needs the
        // renderer, so the system is a stub and the flock is not.
        state.optimizedSheepSystem = { update: () => {} };

        // One sheep parked in Home Field's passage zone, moving north - the
        // exact input `checkGatePassageAndRetire` retires on. It reports rather
        // than retires so the assertion is about whether the arm RUNS.
        let asked = 0;
        const sheep = {
            hasPassedGate: false,
            isRetiring: false,
            position: { x: 0, z: gate.position.z },
            velocity: { x: 0, z: 1 },
            checkGatePassageAndRetire: () => { asked += 1; return false; },
            checkCorralAndRetire: () => { asked += 1; return false; },
        };
        state.sheep = [sheep];
        state.updateSheepBehaviors(1 / 60);

        expect(asked, 'the gate arm must not even be consulted on a pen scene').toBe(0);
        expect(sheep.hasPassedGate).toBe(false);
        expect(state.sheepRetired).toBe(0);

        // And with no pen declared it IS consulted, so the guard is the reason
        // it stayed quiet above rather than some unrelated early return.
        state.pen = null;
        state.updateSheepBehaviors(1 / 60);
        expect(asked).toBe(1);
    });

    // The case above hand-sets `state.pen`, which is fine for the guard but
    // says nothing about whether anything in production ever sets it. Exactly
    // one line does - `js/boot/initWorld.js`'s scene build - and nulling that
    // line left the entire suite green. So run the REAL build here and ask the
    // guard the same question afterwards.
    it('is armed by the real scene build, and only on a scene that declares a pen', async () => {
        const THREE = await import('three');
        const { buildSceneBody } = await import('../js/boot/initWorld.js');
        const { GameState } = await import('../js/GameState.js');

        // Stubs cover only what needs a GPU or the network: model loading,
        // terrain, grass, rocks, trees, mountains, the farmhouse, the fence
        // GLBs and the render target. Everything the pen wiring itself runs
        // through - the scene module, resolveSceneEnclosure, PenBarrier, the
        // real GameState - is the production code.
        const buildOn = async (sceneDef) => {
            const scene = new THREE.Scene();
            const game = {
                currentScene: sceneDef,
                gameState: new GameState(),
                isMultiplayer: false,
                heightfield: null,
                _sceneAbort: new AbortController(),
                terrainBuilder: {
                    models: { animals: { jep: {} } },
                    treeInstances: [],
                    rockPositions: [],
                    loadModels: async () => {},
                    setHeightfield() {},
                    createTerrain() {},
                    createGrass: async () => {},
                    addEnvironmentDetails: async () => {},
                    createTrees: async () => {},
                    addMountains: async () => {},
                    addFarmHouse: async () => null,
                    addHomesteadPlayfieldProps: async () => {},
                    _groundY: () => 0,
                },
                structureBuilder: {
                    setHeightfield() {},
                    loadModels: async () => {},
                    buildSinglePlayerStructures() {},
                },
                sceneManager: {
                    getScene: () => scene,
                    isMobile: false,
                    setWater() {},
                    getRenderer: () => null,
                },
            };
            // The build narrates itself and fails the heightmap fetch (no
            // origin under node). Neither is what this asserts, and the suite
            // reads better without a scene load in the middle of it.
            const quiet = ['log', 'warn', 'error'].map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
            try {
                await buildSceneBody(game, () => {});
            } finally {
                for (const s of quiet) s.mockRestore();
            }
            return game;
        };

        // The same probe as above: one sheep parked in Home Field's passage
        // zone, moving north, reporting rather than retiring, so the only
        // question is whether the gate arm runs at all.
        const gateArmConsultations = (state) => {
            let asked = 0;
            state.gameActive = true;
            state.optimizedSheepSystem = { update: () => {} };
            state.sheep = [{
                hasPassedGate: false,
                isRetiring: false,
                position: { x: 0, z: state.gate.position.z },
                velocity: { x: 0, z: 1 },
                checkGatePassageAndRetire: () => { asked += 1; return false; },
                checkCorralAndRetire: () => { asked += 1; return false; },
            }];
            state.updateSheepBehaviors(1 / 60);
            return asked;
        };

        const island = await buildOn(rollingHills);
        expect(island.gameState.pen, 'the build hands the scene pen to GameState')
            .toBe(rollingHills.pen);
        expect(island._penBarrier).toBeInstanceOf(PenBarrier);
        expect(gateArmConsultations(island.gameState),
            'the phantom Home Field gate arm is stood down by the build').toBe(0);

        // Same build, same everything, on a scene that declares no pen. The
        // field comes out null and the gate arm is live, so the zero above is
        // the pen doing the work rather than an unrelated early return.
        const penless = await buildOn({ ...rollingHills, pen: undefined });
        expect(penless.gameState.pen).toBeNull();
        expect(penless._penBarrier).toBeNull();
        expect(gateArmConsultations(penless.gameState)).toBe(1);
    });
});
