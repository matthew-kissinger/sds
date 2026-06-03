// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { loadScene as loadSceneDef } from '../../shared/scenes/index.js';
import { mulberry32 } from '../../shared/Random.js';
import {
    generateRockPlacementPlan,
    ROCK_Y_SCALE,
    ROCK_Z_SCALE,
} from '../world/rockPlacementPlan.js';
import {
    KONVEYOR_ROCK_PLACEMENT_SEED_OFFSET,
} from '../world/konveyorRockPlacementAdapter.js';

export const DIAGNOSTIC_ROCK_PLACEMENT_SCENE_ID = 'field';
const DIAGNOSTIC_ROCK_PLACEMENT_MAX_ROCKS = 6;

function round(value) {
    return Number(value.toFixed(4));
}

function isInRect(point, rect, buffer = 0) {
    return point.x >= rect.minX - buffer
        && point.x <= rect.maxX + buffer
        && point.z >= rect.minZ - buffer
        && point.z <= rect.maxZ + buffer;
}

function generateDiagnosticRocks(sceneDef, seed) {
    const rng = mulberry32(seed + KONVEYOR_ROCK_PLACEMENT_SEED_OFFSET);
    const zones = sceneDef?.terrain?.zones;
    const farmHouseArea = sceneDef?.farmHouse?.exclusionArea ?? null;

    return generateRockPlacementPlan({
        zones,
        sceneDef,
        rng,
        isInFarmHouseArea: (x, z) => farmHouseArea ? isInRect({ x, z }, farmHouseArea) : false,
    }).placements;
}

function sampleRocks(rocks, maxRendered) {
    const byType = new Map();
    for (const rock of rocks) {
        if (!byType.has(rock.type)) byType.set(rock.type, []);
        byType.get(rock.type).push(rock);
    }
    const types = [...byType.keys()].sort();
    const samples = [];
    while (samples.length < maxRendered) {
        let added = false;
        for (const type of types) {
            const next = byType.get(type).shift();
            if (!next) continue;
            samples.push(next);
            added = true;
            if (samples.length >= maxRendered) break;
        }
        if (!added) break;
    }
    return samples;
}

function rockSample(sample) {
    return {
        sourceIndex: sample.sourceIndex,
        type: sample.type,
        production: {
            x: round(sample.position.x),
            y: round(sample.position.y),
            z: round(sample.position.z),
            scale: round(sample.finalScale),
            rotationX: round(sample.rotation.x),
            rotationY: round(sample.rotation.y),
            rotationZ: round(sample.rotation.z),
            scaleY: ROCK_Y_SCALE,
            scaleZ: ROCK_Z_SCALE,
            radius: Number(sample.obstacle.radius.toFixed(3)),
            colliderRadius: Number(sample.obstacle.colliderRadius.toFixed(3)),
            isObstacle: sample.obstacle.isObstacle,
        },
    };
}

export function createDiagnosticRockPlacementPlan({
    sceneId = DIAGNOSTIC_ROCK_PLACEMENT_SCENE_ID,
    maxRendered = DIAGNOSTIC_ROCK_PLACEMENT_MAX_ROCKS,
} = {}) {
    const sceneDef = loadSceneDef(sceneId);
    const seed = sceneDef?.terrain?.seed ?? 0;
    const rocks = generateDiagnosticRocks(sceneDef, seed);
    const samples = sampleRocks(rocks, maxRendered).map(rockSample);

    return {
        ok: samples.length > 0,
        sceneId: sceneDef.id,
        seed,
        rng: 'mulberry32(sceneSeed + Rock)',
        source: 'diagnostic-rock-placement-generated-from-scene-zones',
        productionReference: 'js/world/RockPlacement.js rockInstances transform contract',
        obstacleContract: 'recorded-only-not-wired-to-shared/SceneObstacles',
        generatedRocks: rocks.length,
        sampledRocks: samples.length,
        types: [...new Set(samples.map((sample) => sample.type))].sort(),
        samples,
    };
}
