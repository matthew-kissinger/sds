// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The client's per-frame pen-barrier tick.
 *
 * On a scene that declares a pen, the barrier is the only thing standing between
 * a playable round and a fence made of scenery. `js/GameState.js` stands its
 * gate arm down when `this.pen` is set, and Rolling Hills no longer has a
 * corral, so nothing else in the client sets `hasPassedGate`. A frame that does
 * not tick the barrier:
 *
 *   - lets the dog and the flock walk through the fence, and
 *   - can never retire a sheep, so the round can never complete.
 *
 * Both of those were true of local 2-player on Rolling Hills when Cycle 117 P2
 * put the tick inside `update()`'s `!isPaused && !this.isLocalMultiplayer`
 * block: local 2-player runs through `updateLocalMultiplayer`, which ticks the
 * sheep sim itself and never reached it.
 *
 * Everything below drives the REAL barrier, built by the REAL enclosure resolver
 * from the REAL Rolling Hills scene module, with real Sheepdog and real sheep
 * instances. The one thing that cannot be exercised in-process is `main.js`
 * itself (module-scope boot, a WebGL renderer in the constructor), so the two
 * call sites are pinned structurally against the file, by brace-matching the
 * method bodies rather than by grepping the whole file.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { PenBarrier } from '../shared/PenBarrier.js';
import { tickPenBarrier } from '../js/gamestate/penBarrierTick.js';

const MAIN_JS = readFileSync(fileURLToPath(new URL('../js/main.js', import.meta.url)), 'utf8');

/** The body of a class method, matched by braces from its signature. */
function methodBody(source, signature) {
    const start = source.indexOf(signature);
    if (start < 0) throw new Error(`no such method: ${signature}`);
    let i = source.indexOf('{', start);
    let depth = 0;
    for (let j = i; j < source.length; j++) {
        const c = source[j];
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return source.slice(i + 1, j);
        }
    }
    throw new Error(`unbalanced braces after ${signature}`);
}

let resolveSceneEnclosure;
let Sheepdog;
let GameState;
let OptimizedSheepInstance;

beforeAll(async () => {
    ({ resolveSceneEnclosure } = await import('../js/StructureBuilder.js'));
    ({ Sheepdog } = await import('../js/Sheepdog.js'));
    ({ GameState } = await import('../js/GameState.js'));
    ({ OptimizedSheepInstance } = await import('../js/OptimizedSheep.js'));
});

/** The island's real barrier, through the resolver `initWorld` uses. */
function islandBarrier() {
    const enclosure = resolveSceneEnclosure(rollingHills);
    expect(enclosure, 'Rolling Hills resolves an enclosure').toBeTruthy();
    return new PenBarrier(enclosure.pen, enclosure.gate);
}

/**
 * A game object shaped like `SheepDogSimulation` at the point `tickPenBarrier`
 * reads it: a real GameState with the scene's pen attached (which is what
 * `initWorld` does), a real barrier, and real dogs.
 */
function islandGame({ twoPlayer = false } = {}) {
    const state = new GameState();
    state.pen = rollingHills.pen;
    state.corral = null;
    state.gameActive = true;
    state.sheep = [];
    return {
        gameState: state,
        _penBarrier: islandBarrier(),
        isMultiplayer: false,
        isLocalMultiplayer: twoPlayer,
        // Rolling Hills has no day clock, so the gate is permanently open.
        dayLoop: null,
        sheepdog: new Sheepdog(0, -30, 'jep', null),
        sheepdog2: twoPlayer ? new Sheepdog(4, -30, 'jep', null) : null,
    };
}

function sheepAt(id, x, z) {
    const s = new OptimizedSheepInstance(id, x, z);
    s.state = 0;
    return s;
}

describe('the barrier tick is what retires a sheep on a pen scene', () => {
    it('retires the flock inside the pasture and refuses the flock at the wall', () => {
        const game = islandGame();
        const { minX, maxX, minZ, maxZ } = rollingHills.pen;
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;

        const inside = [sheepAt(0, cx, cz), sheepAt(1, cx + 4, cz - 4), sheepAt(2, cx - 4, cz + 4)];
        // 0.4m outside the west wall, which is inside the sheep-body Minkowski
        // band (0.6m), so an un-barriered frame leaves it exactly where it is
        // and a barriered one pushes it clear.
        const outsider = sheepAt(3, minX - 0.4, cz);
        game.gameState.sheep = [...inside, outsider];

        tickPenBarrier(game, 1 / 60);

        for (const s of inside) {
            expect(s.penned, `sheep ${s.id} penned`).toBe(true);
            expect(s.hasPassedGate, `sheep ${s.id} counts as retired`).toBe(true);
            expect(s.state).toBe(2);
        }
        expect(outsider.penned).toBeFalsy();
        expect(outsider.hasPassedGate).toBe(false);
        expect(outsider.position.x).toBeCloseTo(minX - 0.6, 9);
        expect(game._penBarrier.pennedCount).toBe(3);
    });

    it('turns a penned sheep into the sheepRetired count local 2-player scores off', () => {
        // The end of the chain the blocker broke. `updateLocalMultiplayer`'s
        // co-op arm reads `gameState.sheepRetired`, and `updateSheepCount`
        // derives that from `hasPassedGate || isRetiring` - which on a pen scene
        // only the barrier ever sets, because the gate arm stands down when
        // `gameState.pen` is truthy and the island has no corral. No tick, no
        // count, no completion.
        const game = islandGame({ twoPlayer: true });
        const { minX, maxX, minZ, maxZ } = rollingHills.pen;
        game.gameState.totalSheep = 3;
        game.gameState.sheep = [
            sheepAt(0, (minX + maxX) / 2, (minZ + maxZ) / 2),
            sheepAt(1, (minX + maxX) / 2 + 3, (minZ + maxZ) / 2),
            sheepAt(2, (minX + maxX) / 2 - 3, (minZ + maxZ) / 2),
        ];
        // The renderer's instanced-mesh system is the one collaborator the
        // tally needs present and does not read; everything below it is real.
        game.gameState.optimizedSheepSystem = { update: () => {} };

        expect(game.gameState.updateSheepBehaviors(1 / 60)).toBe(0);
        tickPenBarrier(game, 1 / 60);
        expect(game.gameState.updateSheepBehaviors(1 / 60)).toBe(3);
        expect(game.gameState.sheepRetired).toBe(game.gameState.totalSheep);
    });

    it('stays inert on a networked frame and on a frame with no live round', () => {
        // The guards the extraction had to preserve. In a room the DO owns the
        // barrier and the client renders the corrected flock from the broadcast.
        const netted = islandGame();
        netted.isMultiplayer = true;
        netted.gameState.sheep = [sheepAt(0, 50, -76)];
        tickPenBarrier(netted, 1 / 60);
        expect(netted.gameState.sheep[0].penned).toBeFalsy();

        const menu = islandGame();
        menu.gameState.gameActive = false;
        menu.gameState.sheep = [sheepAt(0, 50, -76)];
        tickPenBarrier(menu, 1 / 60);
        expect(menu.gameState.sheep[0].penned).toBeFalsy();
    });
});

describe('the local 2-player frame contains BOTH dogs', () => {
    // `PenBarrier.update()` tracks one dog on an instance-level `_dogInside`
    // flag. `containDog` exists, with a caller-owned memory object, precisely
    // because one barrier cannot remember which side several dogs are on - the
    // Worker's `_tickPen` already does this per player dog. The client did not.
    const { minX, minZ, maxZ } = rollingHills.pen;
    const cz = (minZ + maxZ) / 2;
    // Half a metre inside the west wall. Three outcomes are distinguishable at
    // this point and only one of them is right:
    //   kept out (correct) -> pushed to minX - dogBody = 31
    //   sharing dog 1's "inside" memory -> clamped IN to minX + dogBody = 33
    //   not contained at all (the bug) -> left at 32.5
    const DOG2_X = minX + 0.5;

    it('pushes dog 2 back out of the fence', () => {
        const game = islandGame({ twoPlayer: true });
        game.sheepdog.position.x = 0;
        game.sheepdog.position.z = -30;
        game.sheepdog2.position.x = DOG2_X;
        game.sheepdog2.position.z = cz;

        tickPenBarrier(game, 1 / 60);

        expect(game.sheepdog2.position.x).toBeCloseTo(minX - 1.0, 9);
    });

    it('gives dog 2 its own fence-side memory, not dog 1s', () => {
        const game = islandGame({ twoPlayer: true });
        // Dog 1 stands in the gate gap, on the inside, which is the one input
        // that flips the barrier's single-dog flag to "inside".
        const gate = rollingHills.pen.gate.position;
        game.sheepdog.position.x = gate.x;
        game.sheepdog.position.z = gate.z - 1;
        game.sheepdog2.position.x = DOG2_X;
        game.sheepdog2.position.z = cz;

        tickPenBarrier(game, 1 / 60);

        expect(game._penBarrier._dogInside, 'dog 1 is inside').toBe(true);
        // Dog 2 is on the other side of the pasture and must still be kept OUT.
        expect(game.sheepdog2.position.x).toBeCloseTo(minX - 1.0, 9);
        expect(game._penDog2Side.inside).toBe(false);
    });

    it('re-seeds dog 2s memory when the scene swaps the barrier underneath it', () => {
        const game = islandGame({ twoPlayer: true });
        game._penDog2Side = { barrier: islandBarrier(), inside: true };
        game.sheepdog2.position.x = DOG2_X;
        game.sheepdog2.position.z = cz;

        tickPenBarrier(game, 1 / 60);

        expect(game._penDog2Side.barrier).toBe(game._penBarrier);
        expect(game.sheepdog2.position.x).toBeCloseTo(minX - 1.0, 9);
    });

    it('leaves the solo frame with one dog and no second memory', () => {
        const game = islandGame();
        tickPenBarrier(game, 1 / 60);
        expect(game._penDog2Side).toBeUndefined();
    });
});

describe('main.js runs the barrier from both frames and owns none of it', () => {
    it('ticks it from update() and from updateLocalMultiplayer(), after the sheep sim', () => {
        for (const signature of ['update(deltaTime) {', 'updateLocalMultiplayer(deltaTime) {']) {
            const body = methodBody(MAIN_JS, `\n    ${signature}`);
            const sim = body.indexOf('this.gameState.updateSheepBehaviors(deltaTime);');
            const tick = body.indexOf('this._tickPenBarrier(deltaTime);');
            expect(sim, `${signature} ticks the sheep sim`).toBeGreaterThan(-1);
            expect(tick, `${signature} ticks the pen barrier`).toBeGreaterThan(-1);
            expect(tick, `${signature} ticks the barrier AFTER the sheep sim`).toBeGreaterThan(sim);
        }
    });

    it('keeps exactly one barrier tick path', () => {
        // A second inline `_penBarrier.update(...)` is how the two frames drift
        // apart again.
        expect(MAIN_JS).not.toContain('_penBarrier.update(');
        expect(MAIN_JS.match(/_tickPenBarrier/g) ?? []).toHaveLength(3); // 1 definition + 2 calls
    });

    it('never writes _penBarrier, because its lifetime is the scenes', () => {
        // `js/boot/initWorld.js` builds it and `js/boot/loadScene.js#disposeScene`
        // clears it. `restartToMenu` used to null it a third time, AFTER
        // `_disposeAndRebuildCurrentScene()` had just rebuilt it - and the
        // rebuild is what clears `_attractMode`, so the Play click that follows
        // goes straight to `startGame` and `_ensureSceneBuiltForStart` is a
        // no-op. A pen scene entered from the menu had no barrier at all.
        expect(MAIN_JS).not.toMatch(/_penBarrier\s*=/);
        const teardown = methodBody(MAIN_JS, '\n    async restartToMenu() {');
        expect(teardown).not.toContain('_penBarrier');
        // The extractor is not vacuous: the surfaces that SHOULD be torn down
        // there still are.
        expect(teardown).toContain('this._wolfPack');
        expect(teardown).toContain('this._unmountDayNightChip');
    });
});
