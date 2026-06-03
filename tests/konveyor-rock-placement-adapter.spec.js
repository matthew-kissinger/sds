// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';

import { loadScene } from '../shared/scenes/index.js';
import {
    createKonveyorRockPlacementRng,
    KONVEYOR_ROCK_PLACEMENT_SEED_OFFSET,
    shouldApplyKonveyorRockPlacement,
} from '../js/world/konveyorRockPlacementAdapter.js';
import { generateRockPlacementPlan } from '../js/world/rockPlacementPlan.js';

function isInRect(point, rect, buffer = 0) {
    return point.x >= rect.minX - buffer
        && point.x <= rect.maxX + buffer
        && point.z >= rect.minZ - buffer
        && point.z <= rect.maxZ + buffer;
}

function createFlaggedPlan(sceneId) {
    const sceneDef = loadScene(sceneId);
    const farmHouseArea = sceneDef?.farmHouse?.exclusionArea ?? null;
    const { rng, summary } = createKonveyorRockPlacementRng({
        search: '?renderer=webgpu&konveyorRocks=1',
        sceneDef,
    });
    const plan = generateRockPlacementPlan({
        zones: sceneDef.terrain.zones,
        sceneDef,
        rng,
        isInFarmHouseArea: (x, z) => farmHouseArea ? isInRect({ x, z }, farmHouseArea) : false,
    });
    return { plan, summary };
}

describe('konveyor rock placement adapter', () => {
    it('requires the explicit WebGPU rock flag', () => {
        expect(shouldApplyKonveyorRockPlacement('?renderer=webgpu&konveyorRocks=1')).toBe(true);
        expect(shouldApplyKonveyorRockPlacement('?renderer=webgpu&diagnostic=1')).toBe(false);
        expect(shouldApplyKonveyorRockPlacement('?renderer=webgl&konveyorRocks=1')).toBe(false);
        expect(shouldApplyKonveyorRockPlacement('?renderer=webgl&visualGolden=1&konveyorRocks=1')).toBe(true);
        expect(shouldApplyKonveyorRockPlacement('')).toBe(false);
    });

    it('leaves the default RNG untouched without the flag', () => {
        const defaultRng = () => 0.25;
        const result = createKonveyorRockPlacementRng({
            search: '?renderer=webgl&visualGolden=1',
            sceneDef: loadScene('field'),
            defaultRng,
        });

        expect(result.rng).toBe(defaultRng);
        expect(result.summary).toMatchObject({
            kind: 'rock-placement-rng',
            applied: false,
            reason: 'flag-disabled',
        });
    });

    it('creates a deterministic scene-seeded rock plan under the flag', () => {
        const first = createFlaggedPlan('rolling-hills');
        const second = createFlaggedPlan('rolling-hills');

        expect(first.summary).toMatchObject({
            kind: 'rock-placement-rng',
            applied: true,
            reason: null,
            sceneId: 'rolling-hills',
            sceneSeed: 1,
            seed: (1 + KONVEYOR_ROCK_PLACEMENT_SEED_OFFSET) >>> 0,
        });
        expect(first.plan.totalRocks).toBe(9);
        expect(first.plan.placements).toEqual(second.plan.placements);
        expect(first.plan.rockPositions).toEqual(second.plan.rockPositions);
    });

    it('falls back to the default RNG when a scene has no seed', () => {
        const defaultRng = () => 0.5;
        const result = createKonveyorRockPlacementRng({
            search: '?renderer=webgpu&konveyorRocks=1',
            sceneDef: { id: 'missing-seed', terrain: {} },
            defaultRng,
        });

        expect(result.rng).toBe(defaultRng);
        expect(result.summary).toMatchObject({
            applied: false,
            reason: 'missing-scene-seed',
        });
    });
});
