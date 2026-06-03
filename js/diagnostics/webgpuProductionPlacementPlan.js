// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { generateTrees } from '../../shared/TreePlacement.js';
import { mulberry32 } from '../../shared/Random.js';
import { loadScene as loadSceneDef } from '../../shared/scenes/index.js';

export const PRODUCTION_PLACEMENT_PREVIEW_SCENE_ID = 'rolling-hills';
const PRODUCTION_PLACEMENT_PREVIEW_MAX_TREES = 8;

function pickEvenly(items, count) {
    if (items.length <= count) return [...items];
    const picked = [];
    const used = new Set();
    for (let i = 0; i < count; i++) {
        let index = Math.floor(((i + 0.5) * items.length) / count);
        while (used.has(index) && index < items.length - 1) index += 1;
        while (used.has(index) && index > 0) index -= 1;
        used.add(index);
        picked.push(items[index]);
    }
    return picked;
}

function selectProductionTreeSamples(instances, maxRendered) {
    const byType = new Map();
    instances.forEach((instance, sourceIndex) => {
        const list = byType.get(instance.type) ?? [];
        list.push({ sourceIndex, ...instance });
        byType.set(instance.type, list);
    });

    const types = [...byType.keys()].sort();
    const perType = Math.max(1, Math.ceil(maxRendered / Math.max(types.length, 1)));
    const samples = [];
    for (const type of types) {
        samples.push(...pickEvenly(byType.get(type), perType));
    }
    return pickEvenly(samples, maxRendered);
}

export function createProductionTreePlacementPlan({
    sceneId = PRODUCTION_PLACEMENT_PREVIEW_SCENE_ID,
    maxRendered = PRODUCTION_PLACEMENT_PREVIEW_MAX_TREES,
} = {}) {
    const sceneDef = loadSceneDef(sceneId);
    const seed = sceneDef?.terrain?.seed ?? 0;
    const generated = generateTrees(sceneDef, mulberry32(seed), { rockPositions: [] });
    const samples = selectProductionTreeSamples(generated, maxRendered);

    return {
        ok: samples.length > 0,
        sceneId: sceneDef.id,
        seed,
        source: 'shared/TreePlacement.generateTrees',
        rockExclusionMode: 'empty-rock-list',
        generatedTrees: generated.length,
        sampledTrees: samples.length,
        types: [...new Set(samples.map((sample) => sample.type))].sort(),
        samples: samples.map((sample) => ({
            sourceIndex: sample.sourceIndex,
            type: sample.type,
            production: {
                x: Number(sample.x.toFixed(3)),
                z: Number(sample.z.toFixed(3)),
                scale: Number(sample.scale.toFixed(3)),
                rotationY: Number(sample.rotationY.toFixed(4)),
                radiusXZ: sample.radiusXZ,
            },
        })),
    };
}
