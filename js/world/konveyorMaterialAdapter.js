// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import {
    replaceRockMaterialsByTraversal,
    replaceTreeMaterialsByName,
} from './materialReplacement.js';
import { getWindowSearch } from '../rendering/konveyorRuntimeMode.js';
import {
    createKonveyorMaterialAdapter,
    reportKonveyorMaterialDegradation,
} from './createKonveyorAdaptedMaterial.js';

// [P3-KONVEYOR] Tree/rock keeps its traversal-replacement logic here; only
// the flag/factories/summary boilerplate comes from the shared helper.
const adapter = createKonveyorMaterialAdapter({
    flagParam: 'konveyorMaterials',
    factoriesGlobal: '__sdsKonveyorMaterialFactories',
    summaryGlobal: '__sdsKonveyorMaterialAdapter',
});

export const shouldApplyKonveyorMaterials = adapter.shouldApply;

export function applyKonveyorTreeRockMaterials({
    trees = {},
    treesLod1 = {},
    rocks = {},
    createTreeBranchMaterial,
    createTreeLeafMaterial,
    createRockMaterial,
}) {
    const treeFactories = {
        branches: createTreeBranchMaterial,
        leaves: createTreeLeafMaterial,
    };
    const treeResults = [];
    const rockResults = [];

    for (const [key, root] of Object.entries(trees)) {
        if (!root) continue;
        treeResults.push({
            group: 'tree-lod0',
            key,
            ...replaceTreeMaterialsByName(root, treeFactories),
        });
    }

    for (const [key, root] of Object.entries(treesLod1)) {
        if (!root) continue;
        treeResults.push({
            group: 'tree-lod1',
            key,
            ...replaceTreeMaterialsByName(root, treeFactories),
        });
    }

    for (const [key, root] of Object.entries(rocks)) {
        if (!root) continue;
        rockResults.push({
            group: 'rock-lod0',
            key,
            ...replaceRockMaterialsByTraversal(root, createRockMaterial),
        });
    }

    const treeTargetsResolved = treeResults.every((result) => result.missingTargets.length === 0);
    const treeReplacedMaterials = treeResults.reduce((sum, result) => sum + result.replacedMaterials, 0);
    const rockReplacedMaterials = rockResults.reduce((sum, result) => sum + result.replacedMaterials, 0);

    return {
        applied: true,
        ok: treeTargetsResolved && treeReplacedMaterials > 0 && rockReplacedMaterials > 0,
        treeTargetsResolved,
        treeReplacedMaterials,
        rockReplacedMaterials,
        treeResults,
        rockResults,
    };
}

export function maybeApplyKonveyorTreeRockMaterials(builder, options = {}) {
    const search = options.search ?? getWindowSearch();
    if (!shouldApplyKonveyorMaterials(search)) {
        return adapter.exposeSummary({ applied: false, reason: 'flag-disabled' });
    }

    const factories = options.factories ?? adapter.getWindowFactories();
    const hasFactories = typeof factories?.createTreeBranchMaterial === 'function'
        && typeof factories?.createTreeLeafMaterial === 'function'
        && typeof factories?.createRockMaterial === 'function';

    if (!hasFactories) {
        reportKonveyorMaterialDegradation('tree-rock', 'missing-factories');
        return adapter.exposeSummary({ applied: false, reason: 'missing-factories' });
    }

    return adapter.exposeSummary(applyKonveyorTreeRockMaterials({
        trees: builder.models?.trees,
        treesLod1: builder.models?.treesLod1,
        rocks: builder.models?.rocks,
        ...factories,
    }));
}
