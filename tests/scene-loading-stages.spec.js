// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 88 Phase 5: the per-scene loading-stage contract.
 *
 * Every scene declares - explicitly, in this table - which loading shape it
 * ships: ALL-COLD (everything builds before first-interactive) or STREAMED
 * (a bounded cold corridor at first-interactive, impostor coverage island-
 * wide from the first frame, LOD0 waves upgrading zones afterwards). Either
 * is a valid budgeted decision; what this spec forbids is the accident - a
 * scene whose cold scatter quietly grows past its budget, or a new scene
 * landing without declaring its shape at all (the completeness guard fails
 * on any registry entry missing from the table).
 *
 * Durable rule: .claude/rules/scene-and-render.md "Scene loading stages".
 * Cold tree counts measured 2026-06-10; bounds carry ~1.3-1.5x headroom so
 * seed-stable jitter never flakes, while real density creep still fails.
 */
import { describe, it, expect } from 'vitest';

import { listScenes, loadScene } from '../shared/scenes/index.js';
import { generateTrees } from '../shared/TreePlacement.js';
import { mulberry32 } from '../shared/Random.js';

/**
 * The loading-stage declaration table. One entry per registered scene.
 *   shape:        'all-cold' | 'streamed'
 *   coldTreesMax: bound on the cold-path scatter (first-interactive budget).
 */
const LOADING_STAGES = {
    'field': { shape: 'all-cold', coldTreesMax: 1_800 }, // measured 1,359
    'rolling-hills': { shape: 'all-cold', coldTreesMax: 150 }, // measured 61
    'open-country': { shape: 'all-cold', coldTreesMax: 400 }, // measured 204
    'newsheepdogland': { shape: 'streamed', coldTreesMax: 110 }, // measured 81
};

function coldTreeCount(scene) {
    const seed = scene?.terrain?.seed ?? 0;
    return generateTrees(scene, mulberry32(seed), {}).length;
}

describe('scene loading-stage contract (Cycle 88 Phase 5)', () => {
    it('every registered scene declares its loading shape (completeness guard)', () => {
        for (const scene of listScenes()) {
            expect(LOADING_STAGES[scene.id],
                `scene "${scene.id}" must declare its loading shape in LOADING_STAGES `
                + '(all-cold or streamed, with a cold-tree budget) - see '
                + '.claude/rules/scene-and-render.md "Scene loading stages"').toBeTruthy();
        }
        // And no stale table rows for scenes that no longer exist.
        for (const id of Object.keys(LOADING_STAGES)) {
            expect(() => loadScene(id)).not.toThrow();
        }
    });

    for (const [id, stage] of Object.entries(LOADING_STAGES)) {
        describe(`${id} (${stage.shape})`, () => {
            const scene = loadScene(id);

            it(`keeps the cold tree scatter under ${stage.coldTreesMax}`, () => {
                expect(coldTreeCount(scene)).toBeLessThan(stage.coldTreesMax);
            });

            if (stage.shape === 'all-cold') {
                it('declares no streamed zones (all-cold is the explicit choice)', () => {
                    expect(scene.terrain?.streamedZones).toBeUndefined();
                    expect(scene.grass?.streamed).toBeUndefined();
                });
            } else {
                it('declares streamed zones so the cold corridor is a bounded choice', () => {
                    expect(scene.terrain?.streamedZones).toBeTruthy();
                    expect(Object.keys(scene.terrain.streamedZones).length).toBeGreaterThan(0);
                });
            }
        });
    }
});
