// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect, vi, afterEach } from 'vitest';

import {
    planFoliageWaves,
    coldExclusionRects,
    armFoliageStreaming,
    buildColdFoliageCoverage,
    scatterWave,
    fnv1a,
    FALLBACK_START_DELAY_MS,
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

// Cycle 88 Phase 2: injectable atlas stub - fake kiln sidecar + a resolved
// fake texture, so the real mesh-build path runs without network or GLBs.
const FAKE_SIDECAR = {
    bbox: { min: [-2, 0, -2], max: [2, 6, 2] },
    yOffset: 3,
    tilesX: 4,
    tilesY: 4,
    atlasWidth: 2048,
    atlasHeight: 2048,
};
function stubAtlasLoader({ failSidecar = false, texture = { isTexture: true } } = {}) {
    return async () => (failSidecar ? null : {
        sidecar: FAKE_SIDECAR,
        texturePromise: Promise.resolve(texture),
    });
}

describe('buildColdFoliageCoverage (Cycle 88 Phase 2)', () => {
    it('is inert for scenes without streamedZones', async () => {
        expect(await buildColdFoliageCoverage(makeStubGame(field))).toBeNull();
    });

    it('covers every streamed zone with impostor instances at cold time', async () => {
        const game = makeStubGame();
        const builder = game.terrainBuilder;
        const diag = await buildColdFoliageCoverage(game, { tier: 'med', loadAtlas: stubAtlasLoader() });
        await builder._foliageColdCoverage.impostorsReady;
        expect(diag.error).toBeNull();
        expect(diag.aborted).toBe(false);
        expect(diag.mode).toBe('full');
        expect(diag.scatteredWaves).toBe(NSL_PLANNED_WAVES);
        expect(diag.trees).toBeGreaterThan(500);
        expect(diag.scatterCompletedAt).toBeGreaterThan(0);
        expect(diag.coldImpostorsBuiltAt).toBeGreaterThan(0);
        expect(diag.completedAt).toBeGreaterThanOrEqual(diag.coldImpostorsBuiltAt);
        expect(diag.farImpostorTypesScheduled).toBe(0);
        expect(diag.farImpostorTypesActive).toEqual([]);
        // At most tilesX azimuth batches per tree type, 2 types.
        expect(diag.meshes).toBeGreaterThan(0);
        expect(diag.meshes).toBeLessThanOrEqual(8);
        expect(builder.trees.length).toBe(diag.meshes);
        // Coverage exists inside EVERY streamedZones rect (EARS line).
        const coverage = builder._foliageColdCoverage;
        expect(coverage).toBeTruthy();
        const flat = [...coverage.cache.values()].flat();
        for (const [zone, rect] of Object.entries(newsheepdogland.terrain.streamedZones)) {
            const inZone = flat.filter((t) =>
                t.x >= rect.minX && t.x <= rect.maxX && t.z >= rect.minZ && t.z <= rect.maxZ);
            expect(inZone.length, `zone ${zone} has impostor coverage`).toBeGreaterThan(0);
        }
        // The cold scatter never lands inside a cold-path zone rect.
        for (const t of flat) {
            for (const r of coldExclusionRects(newsheepdogland)) {
                const inside = t.x >= r.minX && t.x <= r.maxX && t.z >= r.minZ && t.z <= r.maxZ;
                expect(inside).toBe(false);
            }
        }
        // Range bookkeeping accounts for every placed instance.
        const rangeTotal = [...coverage.ranges.values()].flat()
            .reduce((s, r) => s + r.count, 0);
        expect(rangeTotal).toBe(diag.trees);
        // Meshes become visible once the albedo texture binds (microtask).
        await Promise.resolve();
        expect(builder.trees.every((m) => m.visible)).toBe(true);
        expect(builder._impostorMaterials.length).toBeGreaterThan(0);
    });

    it('cold cache placement is byte-identical to live wave scatter', async () => {
        const game = makeStubGame();
        const diag = await buildColdFoliageCoverage(game, { tier: 'med', loadAtlas: stubAtlasLoader() });
        expect(diag.error).toBeNull();
        const cache = game.terrainBuilder._foliageColdCoverage.cache;
        // Replay the streamer's own scatter order on a fresh stub builder.
        const live = makeStubGame().terrainBuilder;
        const existing = [];
        for (const wave of planFoliageWaves(newsheepdogland)) {
            const streamed = scatterWave(live, newsheepdogland, wave, existing);
            existing.push(...streamed);
            expect(JSON.stringify(cache.get(wave.name))).toBe(JSON.stringify(streamed));
        }
    });

    it('sparse mode places one-pass coverage for low-tier hosts', async () => {
        const game = makeStubGame();
        const diag = await buildColdFoliageCoverage(game, { tier: 'low', sparse: true, loadAtlas: stubAtlasLoader() });
        await game.terrainBuilder._foliageColdCoverage.impostorsReady;
        expect(diag.error).toBeNull();
        expect(diag.mode).toBe('sparse');
        expect(diag.scatteredWaves).toBe(1);
        expect(diag.trees).toBeGreaterThan(0);
        // Sparse coverage is meaningfully lighter than the full scatter.
        expect(diag.trees).toBeLessThan(1200);
        expect(diag.meshes).toBeGreaterThan(0);
    });

    it('sidecar failure degrades to the bare-island cold path (no meshes, no error)', async () => {
        const game = makeStubGame();
        const diag = await buildColdFoliageCoverage(game, { tier: 'med', loadAtlas: stubAtlasLoader({ failSidecar: true }) });
        await game.terrainBuilder._foliageColdCoverage.impostorsReady;
        expect(diag.error).toBeNull();
        expect(diag.meshes).toBe(0);
        expect(game.terrainBuilder.trees.length).toBe(0);
        // The scatter cache still hands the streamer its waves.
        expect(game.terrainBuilder._foliageColdCoverage.cache.size).toBe(NSL_PLANNED_WAVES);
    });

    it('a wave retired before the impostor build lands is skipped by the build', async () => {
        const game = makeStubGame();
        const builder = game.terrainBuilder;
        // Hold the atlas fetch until after a wave retires (the slow-host race).
        let releaseAtlas;
        const gate = new Promise((resolve) => { releaseAtlas = resolve; });
        const diag = await buildColdFoliageCoverage(game, {
            tier: 'med',
            loadAtlas: async () => {
                await gate;
                return { sidecar: FAKE_SIDECAR, texturePromise: Promise.resolve({ isTexture: true }) };
            },
        });
        const coverage = builder._foliageColdCoverage;
        const firstWave = [...coverage.cache.entries()].find(([, trees]) => trees.length > 0);
        const { retireColdImpostorWave } = await import('../js/world/TreePlacement.js');
        expect(retireColdImpostorWave(builder, firstWave[0])).toBe(0); // no ranges yet
        releaseAtlas();
        await coverage.impostorsReady;
        // The retired wave got no impostor instances; everything else did.
        expect(coverage.ranges.has(firstWave[0])).toBe(false);
        const built = [...coverage.ranges.values()].flat().reduce((s, r) => s + r.count, 0);
        expect(built).toBe(diag.trees - firstWave[1].length);
    });

    it('aborting leaves the builder untouched', async () => {
        const game = makeStubGame();
        const abort = new AbortController();
        abort.abort();
        const diag = await buildColdFoliageCoverage(game, {
            tier: 'med', signal: abort.signal, loadAtlas: stubAtlasLoader(),
        });
        expect(diag.aborted).toBe(true);
        expect(game.terrainBuilder.trees.length).toBe(0);
        expect(game.terrainBuilder._foliageColdCoverage ?? null).toBeNull();
    });
});

describe('waves upgrade the cold coverage (Cycle 88 Phase 3)', () => {
    it('streamed waves reuse the cold cache and retire its impostor instances', async () => {
        const game = makeStubGame();
        const builder = game.terrainBuilder;
        const coldDiag = await buildColdFoliageCoverage(game, { tier: 'med', loadAtlas: stubAtlasLoader() });
        await builder._foliageColdCoverage.impostorsReady;
        expect(coldDiag.error).toBeNull();

        vi.useFakeTimers();
        const armed = armFoliageStreaming(game, { startDelayMs: 0, tier: 'med' });
        await vi.runAllTimersAsync();
        expect(armed.diag.wavesDone).toBe(NSL_PLANNED_WAVES);
        // Every non-empty wave came from the cache, none re-scattered.
        for (const w of armed.diag.perWave) {
            expect(w.fromCache).toBe(true);
        }
        // The streamer placed exactly the cold coverage's trees.
        expect(armed.diag.totalStreamedTrees).toBe(coldDiag.trees);
        expect(builder.treeInstances.length).toBe(coldDiag.trees);
        // Every impostor instance was retired as its wave landed.
        const retired = armed.diag.perWave.reduce((s, w) => s + (w.retiredImpostors ?? 0), 0);
        expect(retired).toBe(coldDiag.trees);
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

    it('low tier arms no streamer at all - impostor-only island (Cycle 88 P4)', () => {
        const grassSystem = { buildStreamedGrass: vi.fn(() => ({ built: true, clumps: 5 })) };
        const game = makeStubGame(newsheepdogland, { grassSystem });
        expect(armFoliageStreaming(game, { startDelayMs: 0, tier: 'low' })).toBeNull();
        expect(grassSystem.buildStreamedGrass).not.toHaveBeenCalled();
    });

    it('starts within one idle slot of the warmup-complete signal (Cycle 88 P4)', async () => {
        vi.useFakeTimers();
        const game = makeStubGame();
        let warmupCb = null;
        game.qualityGovernor = { onWarmupComplete: (cb) => { warmupCb = cb; } };
        const armed = armFoliageStreaming(game, { tier: 'med' });
        expect(warmupCb).toBeTypeOf('function');
        // Nothing runs before the signal (short of the 10s fallback).
        await vi.advanceTimersByTimeAsync(2000);
        expect(armed.diag.startedAt).toBe(0);
        warmupCb();
        await vi.runAllTimersAsync();
        expect(armed.diag.wavesDone).toBe(NSL_PLANNED_WAVES);
    });

    it('falls back to the bounded timer when the signal never fires (Cycle 88 P4)', async () => {
        vi.useFakeTimers();
        const game = makeStubGame();
        game.qualityGovernor = { onWarmupComplete: () => { /* never fires */ } };
        const armed = armFoliageStreaming(game, { tier: 'med' });
        await vi.advanceTimersByTimeAsync(FALLBACK_START_DELAY_MS - 1000);
        expect(armed.diag.startedAt).toBe(0);
        await vi.runAllTimersAsync();
        expect(armed.diag.wavesDone).toBe(NSL_PLANNED_WAVES);
    });

    it('a signal after the fallback already started does not double-run', async () => {
        vi.useFakeTimers();
        const game = makeStubGame();
        let warmupCb = null;
        game.qualityGovernor = { onWarmupComplete: (cb) => { warmupCb = cb; } };
        const armed = armFoliageStreaming(game, { tier: 'med' });
        await vi.runAllTimersAsync(); // fallback fires, full stream completes
        expect(armed.diag.wavesDone).toBe(NSL_PLANNED_WAVES);
        const treesAfterFirstRun = game.terrainBuilder.treeInstances.length;
        warmupCb();
        await vi.runAllTimersAsync();
        expect(game.terrainBuilder.treeInstances.length).toBe(treesAfterFirstRun);
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

    it('bounds the signal wait with the documented fallback delay', () => {
        expect(FALLBACK_START_DELAY_MS).toBe(10_000);
    });
});
