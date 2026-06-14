// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 96 Phase 5 (harness-first): deterministic per-scene rock collision
// footprints. A rock re-bake changes rock GLB geometry (tools/bake-rocks.mjs);
// this helper pins the placement plan's collision output under a fixed seed so a
// future visual re-bake cannot silently move what the sim collides against.
//
// Production places rocks with a Math.random-backed RNG, so this seeded snapshot
// is the parity instrument, not a copy of any single production layout: it locks
// the placement algorithm and the collider-radius derivation
// (colliderRadius = finalScale * 0.55, isObstacle = formationScale >= 0.8, plus
// the zone and farmhouse exclusion rules). The sim collides against the
// isObstacle rocks using radiusXZ = colliderRadius (see shared/SceneObstacles.js
// and js/main.js buildSceneObstacles).

import { generateRockPlacementPlan } from '../../js/world/rockPlacementPlan.js';
import { mulberry32 } from '../../shared/Random.js';
import { loadScene } from '../../shared/scenes/index.js';

// Same offset the determinism spec uses (tests/rock-placement-plan.spec.js), so
// the two harnesses describe the same seeded world.
export const ROCK_PLACEMENT_SEED_OFFSET = 0x526f636b;

export const ROCK_COLLIDER_SCENES = Object.freeze([
    'field',
    'rolling-hills',
    'open-country',
    'newsheepdogland',
]);

function isInRect(point, rect, buffer = 0) {
    return point.x >= rect.minX - buffer
        && point.x <= rect.maxX + buffer
        && point.z >= rect.minZ - buffer
        && point.z <= rect.maxZ + buffer;
}

// 4 decimals is sub-millimeter against metre-scale positions - finer than any
// collision tolerance, and it keeps the committed fixture readable and free of
// last-ULP float-formatting noise.
const round = (v) => Number(v.toFixed(4));

export function computeRockColliderFootprints(sceneId) {
    const sceneDef = loadScene(sceneId);
    const farmHouseArea = sceneDef?.farmHouse?.exclusionArea ?? null;
    const plan = generateRockPlacementPlan({
        zones: sceneDef.terrain.zones,
        sceneDef,
        rng: mulberry32((sceneDef.terrain.seed ?? 0) + ROCK_PLACEMENT_SEED_OFFSET),
        isInFarmHouseArea: (x, z) => (farmHouseArea ? isInRect({ x, z }, farmHouseArea) : false),
    });
    const colliders = plan.rockPositions
        .filter((r) => r.isObstacle)
        .map((r) => ({ x: round(r.x), z: round(r.z), colliderRadius: round(r.colliderRadius) }));
    return {
        sceneId,
        totalRocks: plan.totalRocks,
        obstacleCount: colliders.length,
        colliders,
    };
}

export function computeAllRockColliderFootprints() {
    return ROCK_COLLIDER_SCENES.map((id) => computeRockColliderFootprints(id));
}
