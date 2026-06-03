// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listScenes, loadScene } from '../shared/scenes/index.js';
import { createKonveyorRockPlacementRng } from '../js/world/konveyorRockPlacementAdapter.js';
import { generateRockPlacementPlan } from '../js/world/rockPlacementPlan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SEARCH = '?renderer=webgpu&konveyorRocks=1';

function parseArgs(argv) {
    const args = {
        out: 'cycle36-validation/runtime/rock-placement-flag-proof.json',
    };

    for (const arg of argv.slice(2)) {
        const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
        if (!match) continue;
        const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        args[key] = match[2];
    }

    return args;
}

function isInRect(point, rect, buffer = 0) {
    return point.x >= rect.minX - buffer
        && point.x <= rect.maxX + buffer
        && point.z >= rect.minZ - buffer
        && point.z <= rect.maxZ + buffer;
}

function round(value) {
    return Number(value.toFixed(4));
}

function createPlan(sceneDef) {
    const farmHouseArea = sceneDef?.farmHouse?.exclusionArea ?? null;
    const { rng, summary } = createKonveyorRockPlacementRng({
        search: SEARCH,
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

function samplePlacement(placement) {
    return {
        sourceIndex: placement.sourceIndex,
        type: placement.type,
        x: round(placement.position.x),
        y: round(placement.position.y),
        z: round(placement.position.z),
        scale: round(placement.finalScale),
        rotationY: round(placement.rotation.y),
        colliderRadius: round(placement.obstacle.colliderRadius),
        isObstacle: placement.obstacle.isObstacle,
    };
}

async function run() {
    const args = parseArgs(process.argv);
    const scenes = listScenes().map(({ id }) => {
        const sceneDef = loadScene(id);
        const first = createPlan(sceneDef);
        const second = createPlan(sceneDef);
        const placementsStable = JSON.stringify(first.plan.placements) === JSON.stringify(second.plan.placements);
        const rockPositionsStable = JSON.stringify(first.plan.rockPositions) === JSON.stringify(second.plan.rockPositions);

        return {
            sceneId: id,
            sceneName: sceneDef.name,
            summary: first.summary,
            ok: first.summary.applied === true
                && placementsStable
                && rockPositionsStable,
            hasRocks: first.plan.totalRocks > 0,
            totalRocks: first.plan.totalRocks,
            rockTypes: Object.entries(first.plan.rockInstances)
                .filter(([, instances]) => instances.length > 0)
                .map(([type, instances]) => ({ type, count: instances.length })),
            placementsStable,
            rockPositionsStable,
            samples: first.plan.placements.slice(0, 6).map(samplePlacement),
        };
    });

    const manifest = {
        capturedAt: new Date().toISOString(),
        contract: 'konveyor-rock-placement-flag-proof',
        search: SEARCH,
        ok: scenes.every((scene) => scene.ok),
        scenes,
    };

    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));

    if (!manifest.ok) {
        throw new Error('rock placement flag proof did not satisfy manifest gates');
    }
}

run().catch((error) => {
    console.error('[ROCK-PLACEMENT-PROOF] fatal:', error);
    process.exit(1);
});
