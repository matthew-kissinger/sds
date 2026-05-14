import {
    replaceRockMaterialsByTraversal,
    replaceTreeMaterialsByName,
} from './materialReplacement.js';

const FLAG_PARAM = 'konveyorMaterials';
const RENDERER_PARAM = 'renderer';

function getWindowSearch() {
    if (typeof window === 'undefined') return '';
    return window.location?.search ?? '';
}

function getWindowFactories() {
    if (typeof window === 'undefined') return null;
    return window.__sdsKonveyorMaterialFactories ?? null;
}

function exposeSummary(summary) {
    if (typeof window !== 'undefined') {
        window.__sdsKonveyorMaterialAdapter = summary;
    }
}

export function shouldApplyKonveyorMaterials(search = getWindowSearch()) {
    const params = new URLSearchParams(search);
    return params.get(RENDERER_PARAM) === 'webgpu' && params.get(FLAG_PARAM) === '1';
}

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
        const summary = { applied: false, reason: 'flag-disabled' };
        exposeSummary(summary);
        return summary;
    }

    const factories = options.factories ?? getWindowFactories();
    const hasFactories = typeof factories?.createTreeBranchMaterial === 'function'
        && typeof factories?.createTreeLeafMaterial === 'function'
        && typeof factories?.createRockMaterial === 'function';

    if (!hasFactories) {
        const summary = { applied: false, reason: 'missing-factories' };
        exposeSummary(summary);
        return summary;
    }

    const summary = applyKonveyorTreeRockMaterials({
        trees: builder.models?.trees,
        treesLod1: builder.models?.treesLod1,
        rocks: builder.models?.rocks,
        ...factories,
    });
    exposeSummary(summary);
    return summary;
}
