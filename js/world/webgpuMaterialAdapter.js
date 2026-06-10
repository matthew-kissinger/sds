// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import {
    replaceRockMaterialsByTraversal,
    replaceTreeMaterialsByName,
} from './materialReplacement.js';
import { getWindowSearch } from '../rendering/webgpuRuntimeMode.js';
import {
    createWebGpuMaterialAdapter,
    reportWebGpuMaterialDegradation,
} from './createWebGpuAdaptedMaterial.js';

// [P3-WEBGPU] Tree/rock keeps its traversal-replacement logic here; only
// the flag/factories/summary boilerplate comes from the shared helper.
const adapter = createWebGpuMaterialAdapter({
    flagParam: 'webgpuMaterials',
    factoriesGlobal: '__sdsWebGpuMaterialFactories',
    summaryGlobal: '__sdsWebGpuMaterialAdapter',
});

export const shouldApplyWebGpuMaterials = adapter.shouldApply;

export function applyWebGpuTreeRockMaterials({
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

export function maybeApplyWebGpuTreeRockMaterials(builder, options = {}) {
    const search = options.search ?? getWindowSearch();
    if (!shouldApplyWebGpuMaterials(search)) {
        return adapter.exposeSummary({ applied: false, reason: 'flag-disabled' });
    }

    const factories = options.factories ?? adapter.getWindowFactories();
    const hasFactories = typeof factories?.createTreeBranchMaterial === 'function'
        && typeof factories?.createTreeLeafMaterial === 'function'
        && typeof factories?.createRockMaterial === 'function';

    if (!hasFactories) {
        reportWebGpuMaterialDegradation('tree-rock', 'missing-factories');
        return adapter.exposeSummary({ applied: false, reason: 'missing-factories' });
    }

    return adapter.exposeSummary(applyWebGpuTreeRockMaterials({
        trees: builder.models?.trees,
        treesLod1: builder.models?.treesLod1,
        rocks: builder.models?.rocks,
        ...factories,
    }));
}
