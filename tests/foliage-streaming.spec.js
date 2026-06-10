// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect, vi, afterEach } from 'vitest';

import {
    planFoliageWaves,
    coldExclusionRects,
    armFoliageStreaming,
    fnv1a,
    START_DELAY_MS,
} from '../js/world/foliageStreaming.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';
import { field } from '../shared/scenes/field.js';

/**
 * Foliage streaming (Cycle 87 Phase 2): wave planning, abort handling, and
 * the end-to-end streamer loop against a stub builder. Mesh construction is
 * exercised with an EMPTY models cache (no GLBs in vitest), so meshes stay 0
 * while the placement bookkeeping (treeInstances growth, obstacle refresh,
 * diag) runs the real code path.
 */

function makeStubGame(sceneDef = newsheepdogland, { grassSystem = null } = {}) {
    const builder = {
        sceneDef,
        treeInstances: [],
        rockPositions: [],
        models: { trees: {} },
        trees: [],
        isMobile: false,
        scene: { add() {} },
        grassSystem,
        _groundY: () => 1, // above the waterline; water cull keeps everything
    };
    return {
        currentScene: sceneDef,
        terrainBuilder: builder,
        isMultiplayer: false,
        gameState: { obstacles: null, gameMode: 'solo' },
    };
}

// NSL zone sub-wave counts under MAX_WAVE_AREA quad-splitting: nearField 4,
// midField 4, farField 16, horizon 16.
const NSL_PLANNED_WAVES = 40;

afterEach(() => {
    vi.useRealTimers();
});

describe('planFoliageWaves', () => {
    it('plans sub-waves per streamed zone in near-to-far order', () => {
        const waves = planFoliageWaves(newsheepdogland);
        expect(waves.length).toBe(NSL_PLANNED_WAVES);
        // Zones appear grouped in vocabulary order.
        const zoneSequence = [...new Set(waves.map((w) => w.zone))];
        expect(zoneSequence).toEqual(['nearField', 'midField', 'farField', 'horizon']);
        // Every sub-rect sits inside its parent zone rect.
        for (const w of waves) {
            const parent = newsheepdogland.terrain.streamedZones[w.zone];
            expect(w.zoneRect.minX).toBeGreaterThanOrEqual(parent.minX);
            expect(w.zoneRect.maxX).toBeLessThanOrEqual(parent.maxX);
            expect(w.zoneRect.minZ).toBeGreaterThanOrEqual(parent.minZ);
            expect(w.zoneRect.maxZ).toBeLessThanOrEqual(parent.maxZ);
        }
    });

    it('gates by maxZones (tier gate)', () => {
        const waves = planFoliageWaves(newsheepdogland, { maxZones: 1 });
        expect(waves.length).toBeGreaterThan(0);
        expect(waves.every((w) => w.zone === 'nearField')).toBe(true);
    });

    it('is inert for scenes without streamedZones', () => {
        expect(planFoliageWaves(field)).toEqual([]);
        expect(planFoliageWaves(null)).toEqual([]);
    });
});

describe('coldExclusionRects', () => {
    it('returns every cold zone rect except playArea', () => {
        const rects = coldExclusionRects(newsheepdogland);
        expect(rects).toHaveLength(4);
        expect(rects).not.toContainEqual(newsheepdogland.terrain.zones.playArea);
    });
});

describe('fnv1a', () => {
    it('is stable and distinguishes wave names', () => {
        expect(fnv1a('foliage-wave:nearField')).toBe(fnv1a('foliage-wave:nearField'));
        expect(fnv1a('foliage-wave:nearField')).not.toBe(fnv1a('foliage-wave:horizon'));
    });
});

describe('armFoliageStreaming', () => {
    it('returns null for scenes without streamedZones', () => {
        expect(armFoliageStreaming(makeStubGame(field))).toBeNull();
    });

    it('streams every planned wave and grows the flat tree list', async () => {
        vi.useFakeTimers();
        const game = makeStubGame();
        const armed = armFoliageStreaming(game, { startDelayMs: 0 });
        expect(armed.planned).toBe(NSL_PLANNED_WAVES);
        await vi.runAllTimersAsync();
        expect(armed.diag.wavesDone).toBe(NSL_PLANNED_WAVES);
        expect(armed.diag.aborted).toBe(false);
        expect(armed.diag.error).toBeNull();
        expect(armed.diag.totalStreamedTrees).toBeGreaterThan(0);
        expect(game.terrainBuilder.treeInstances.length).toBe(armed.diag.totalStreamedTrees);
        // No streamed tree may land inside a cold zone rect.
        for (const t of game.terrainBuilder.treeInstances) {
            for (const r of coldExclusionRects(newsheepdogland)) {
                const inside = t.x >= r.minX && t.x <= r.maxX && t.z >= r.minZ && t.z <= r.maxZ;
                expect(inside).toBe(false);
            }
        }
        // The solo-sim obstacle bundle was refreshed with the streamed trees.
        expect(game.gameState.obstacles).not.toBeNull();
    });

    it('streaming is deterministic across runs for the same scene', async () => {
        vi.useFakeTimers();
        const a = makeStubGame();
        const armedA = armFoliageStreaming(a, { startDelayMs: 0 });
        await vi.runAllTimersAsync();
        const b = makeStubGame();
        const armedB = armFoliageStreaming(b, { startDelayMs: 0 });
        await vi.runAllTimersAsync();
        expect(armedA.diag.totalStreamedTrees).toBe(armedB.diag.totalStreamedTrees);
        expect(JSON.stringify(a.terrainBuilder.treeInstances))
            .toBe(JSON.stringify(b.terrainBuilder.treeInstances));
    });

    it('aborting before the start delay cancels everything', async () => {
        vi.useFakeTimers();
        const game = makeStubGame();
        const abort = new AbortController();
        const armed = armFoliageStreaming(game, { signal: abort.signal });
        abort.abort();
        await vi.runAllTimersAsync();
        expect(armed.diag.aborted).toBe(true);
        expect(armed.diag.wavesDone).toBe(0);
        expect(game.terrainBuilder.treeInstances.length).toBe(0);
    });

    it('aborting mid-stream stops later waves', async () => {
        vi.useFakeTimers();
        const game = makeStubGame();
        const abort = new AbortController();
        const armed = armFoliageStreaming(game, { signal: abort.signal, startDelayMs: 0 });
        // Let the run start, then abort while waves are pending in idle slots.
        await vi.advanceTimersByTimeAsync(250); // past the first idle fallback slot
        abort.abort();
        await vi.runAllTimersAsync();
        expect(armed.diag.aborted).toBe(true);
        expect(armed.diag.wavesDone).toBeLessThan(NSL_PLANNED_WAVES);
    });

    it('low tier streams only the near band and no grass (Cycle 87 P4)', async () => {
        vi.useFakeTimers();
        const grassSystem = { buildStreamedGrass: vi.fn(() => ({ built: true, clumps: 5 })) };
        const game = makeStubGame(newsheepdogland, { grassSystem });
        const armed = armFoliageStreaming(game, { startDelayMs: 0, tier: 'low' });
        await vi.runAllTimersAsync();
        expect(armed.diag.tier).toBe('low');
        expect(armed.diag.wavesDone).toBe(armed.planned);
        expect(armed.planned).toBeLessThan(NSL_PLANNED_WAVES);
        // Only nearField sub-waves ran.
        expect(armed.diag.perWave.every((w) => w.name.startsWith('nearField'))).toBe(true);
        expect(grassSystem.buildStreamedGrass).not.toHaveBeenCalled();
    });

    it('mid tier streams grass as the final wave (Cycle 87 P4)', async () => {
        vi.useFakeTimers();
        const grassSystem = { buildStreamedGrass: vi.fn(() => ({ built: true, clumps: 5 })) };
        const game = makeStubGame(newsheepdogland, { grassSystem });
        const armed = armFoliageStreaming(game, { startDelayMs: 0, tier: 'med' });
        await vi.runAllTimersAsync();
        expect(grassSystem.buildStreamedGrass).toHaveBeenCalledTimes(1);
        expect(armed.diag.grass).toMatchObject({ built: true, clumps: 5 });
    });

    it('uses the documented default start delay', () => {
        expect(START_DELAY_MS).toBe(6500);
    });
});
