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

function makeStubGame(sceneDef = newsheepdogland) {
    const builder = {
        sceneDef,
        treeInstances: [],
        rockPositions: [],
        models: { trees: {} },
        trees: [],
        isMobile: false,
        scene: { add() {} },
        _groundY: () => 1, // above the waterline; water cull keeps everything
    };
    return {
        currentScene: sceneDef,
        terrainBuilder: builder,
        isMultiplayer: false,
        gameState: { obstacles: null, gameMode: 'solo' },
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('planFoliageWaves', () => {
    it('plans one wave per streamed zone in near-to-far order', () => {
        const waves = planFoliageWaves(newsheepdogland);
        expect(waves.map((w) => w.name)).toEqual(['nearField', 'midField', 'farField', 'horizon']);
        expect(waves[0].zoneRect).toEqual(newsheepdogland.terrain.streamedZones.nearField);
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
        expect(armed.planned).toBe(4);
        await vi.runAllTimersAsync();
        expect(armed.diag.wavesDone).toBe(4);
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
        expect(armed.diag.wavesDone).toBeLessThan(4);
    });

    it('uses the documented default start delay', () => {
        expect(START_DELAY_MS).toBe(6500);
    });
});
