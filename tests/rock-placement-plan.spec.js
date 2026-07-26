// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
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

function createPlan(sceneId, penOverride) {
    const base = loadScene(sceneId);
    // The real scene module, with only `pen` swapped when a caller is probing
    // the keep-out mechanism. Everything else - zones, seed, boundary - is the
    // shipped data.
    const sceneDef = penOverride === undefined ? base : { ...base, pen: penOverride };
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

        // Home Field confines rocks to nearField+midField within a 240m radius
        // (scene.rockPlacement), so the count is far below the legacy all-zone
        // scatter and every rock sits inside the green.
        expect(first.totalRocks).toBe(10);
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
        // Cycle 117 P2: the island's destination is a fenced pasture now, not a
        // corral disc, and the 8m rock keep-out moved with it. A rock inside the
        // pasture would end up behind the rails once Phase 4 raises the fence.
        const pen = sceneDef.pen;
        expect(pen?.scatterKeepOut, 'rolling-hills opts into the pen keep-out').toBe(true);

        expect(plan.totalRocks).toBe(9);
        expect([...new Set(plan.placements.map((placement) => placement.type))].sort()).toEqual([
            'rock1',
            'rock2',
        ]);

        const m = 8;
        for (const placement of plan.placements) {
            const dx = placement.position.x - islandBoundary.center.x;
            const dz = placement.position.z - islandBoundary.center.z;
            const distanceSq = dx * dx + dz * dz;
            expect(distanceSq).toBeLessThanOrEqual(safeRadius * safeRadius);

            const inPasture = placement.position.x > pen.minX - m && placement.position.x < pen.maxX + m
                && placement.position.z > pen.minZ - m && placement.position.z < pen.maxZ + m;
            expect(inPasture, `rock at ${placement.position.x},${placement.position.z}`).toBe(false);
        }
    });

    // The assertion above passes at the shipped seed WITHOUT the keep-out too -
    // measured: nine rocks, none of them anywhere near (50, -76). So on its own
    // it certifies nothing, which is the exact shape of spec this project has
    // shipped three times. This one moves the pen onto a rock the scatter really
    // does place and checks the rock disappears, so the keep-out has to be doing
    // the work rather than the seed.
    it('actually drops a rock that falls inside a pen with the opt-in', () => {
        const sceneDef = loadScene('rolling-hills');
        const unguarded = createPlan('rolling-hills', { ...sceneDef.pen, scatterKeepOut: false });
        expect(unguarded.placements.length).toBeGreaterThan(0);

        // Park a 4x4 pen on the first rock the unguarded scatter lays down.
        const victim = unguarded.placements[0].position;
        const overPen = {
            minX: victim.x - 2, maxX: victim.x + 2,
            minZ: victim.z - 2, maxZ: victim.z + 2,
            gate: sceneDef.pen.gate,
            scatterKeepOut: true,
        };
        const guarded = createPlan('rolling-hills', overPen);

        const at = (plan) => plan.placements.filter(
            (p) => p.position.x === victim.x && p.position.z === victim.z,
        ).length;
        expect(at(unguarded), 'the rock is there without the keep-out').toBe(1);
        expect(at(guarded), 'and gone with it').toBe(0);
        expect(guarded.totalRocks).toBeLessThan(unguarded.totalRocks);
    });
});
