import { describe, expect, it } from 'vitest';

import { generateRockPlacementPlan } from '../js/world/rockPlacementPlan.js';
import { mulberry32 } from '../shared/Random.js';
import { loadScene } from '../shared/scenes/index.js';

const ROCK_PLACEMENT_SEED_OFFSET = 0x526f636b;

function isInRect(point, rect, buffer = 0) {
    return point.x >= rect.minX - buffer
        && point.x <= rect.maxX + buffer
        && point.z >= rect.minZ - buffer
        && point.z <= rect.maxZ + buffer;
}

function createPlan(sceneId) {
    const sceneDef = loadScene(sceneId);
    const farmHouseArea = sceneDef?.farmHouse?.exclusionArea ?? null;
    return generateRockPlacementPlan({
        zones: sceneDef.terrain.zones,
        sceneDef,
        rng: mulberry32((sceneDef.terrain.seed ?? 0) + ROCK_PLACEMENT_SEED_OFFSET),
        isInFarmHouseArea: (x, z) => farmHouseArea ? isInRect({ x, z }, farmHouseArea) : false,
    });
}

describe('rock placement plan', () => {
    it('is deterministic with an injected RNG for the field scene', () => {
        const first = createPlan('field');
        const second = createPlan('field');

        expect(first.totalRocks).toBe(334);
        expect(first.placements).toEqual(second.placements);
        expect(first.rockPositions).toEqual(second.rockPositions);
        expect(Object.values(first.rockInstances).flat()).toHaveLength(first.totalRocks);
        expect([...new Set(first.placements.map((placement) => placement.type))].sort()).toEqual([
            'rock1',
            'rock2',
            'rock3',
        ]);
    });

    it('keeps island rock plans on land and out of rock3 scale', () => {
        const sceneDef = loadScene('rolling-hills');
        const plan = createPlan('rolling-hills');
        const islandBoundary = sceneDef.boundary;
        const safeRadius = islandBoundary.radius - islandBoundary.falloff - 4;
        const corral = sceneDef.corral;

        expect(plan.totalRocks).toBe(9);
        expect([...new Set(plan.placements.map((placement) => placement.type))].sort()).toEqual([
            'rock1',
            'rock2',
        ]);

        for (const placement of plan.placements) {
            const dx = placement.position.x - islandBoundary.center.x;
            const dz = placement.position.z - islandBoundary.center.z;
            const distanceSq = dx * dx + dz * dz;
            expect(distanceSq).toBeLessThanOrEqual(safeRadius * safeRadius);

            const corralDx = placement.position.x - corral.center.x;
            const corralDz = placement.position.z - corral.center.z;
            const corralKeepout = corral.radius + 8;
            expect(corralDx * corralDx + corralDz * corralDz).toBeGreaterThanOrEqual(
                corralKeepout * corralKeepout
            );
        }
    });
});
