// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

const ASSET_ROOT = 'assets/models/homestead/';
const PALETTE_ID = 'sds-pastoral-survival-v1';

const ASSETS = Object.freeze({
    utilityShed: Object.freeze({ key: 'utility-shed', path: `${ASSET_ROOT}utility-shed.glb`, kind: 'packyard' }),
    hayBalesA: Object.freeze({ key: 'hay-bales-a', path: `${ASSET_ROOT}hay-bales-a.glb`, kind: 'packyard' }),
    hayBalesB: Object.freeze({ key: 'hay-bales-b', path: `${ASSET_ROOT}hay-bales-b.glb`, kind: 'packyard' }),
    troughBucket: Object.freeze({ key: 'trough-bucket', path: `${ASSET_ROOT}trough-bucket.glb`, kind: 'packyard' }),
    crateStack: Object.freeze({ key: 'crate-stack', path: `${ASSET_ROOT}crate-stack.glb`, kind: 'packyard' }),
    barrelRope: Object.freeze({ key: 'barrel-rope', path: `${ASSET_ROOT}barrel-rope.glb`, kind: 'packyard' }),
    logPileStump: Object.freeze({ key: 'log-pile-stump', path: `${ASSET_ROOT}log-pile-stump.glb`, kind: 'natural-accent' }),
    stoneMarker: Object.freeze({ key: 'stone-marker', path: `${ASSET_ROOT}stone-marker.glb`, kind: 'natural-accent' }),
    wildflowerA: Object.freeze({ key: 'wildflower-a', path: `${ASSET_ROOT}wildflower-a.glb`, kind: 'natural-accent' }),
    wildflowerB: Object.freeze({ key: 'wildflower-b', path: `${ASSET_ROOT}wildflower-b.glb`, kind: 'natural-accent' }),
    signpost: Object.freeze({ key: 'signpost', path: `${ASSET_ROOT}signpost.glb`, kind: 'packyard' }),
});

function p(assetKey, id, x, z, rotationY, targetHeight) {
    return Object.freeze({ assetKey, id, x, z, rotationY, targetHeight });
}

const PACKYARD_FIELD = Object.freeze([
    p('utilityShed', 'utility-shed', 164, 143, -0.6, 3.4),
    p('hayBalesA', 'hay-bales-a', 173, 138, 0.25, 1.05),
    p('hayBalesB', 'hay-bales-b', 178, 141, -0.45, 0.9),
    p('troughBucket', 'trough-bucket', 188, 147, 0.15, 0.85),
    p('crateStack', 'crate-stack', 170, 151, 0.45, 1.55),
    p('barrelRope', 'barrel-rope', 177, 153, -0.35, 0.75),
    p('logPileStump', 'log-pile-stump', 188, 137, 0.65, 0.8),
    p('signpost', 'signpost', 156, 150, Math.PI * 0.72, 2),
    p('stoneMarker', 'stone-marker', 160, 135, 0.25, 1.1),
    p('wildflowerA', 'wildflower-a', 158, 132, -0.45, 0.62),
    p('wildflowerB', 'wildflower-b', 163, 132, 0.5, 0.62),
]);

const PACKYARD_NSL = Object.freeze([
    p('utilityShed', 'utility-shed', 618, -1005, -0.7, 3.4),
    p('hayBalesA', 'hay-bales-a', 608, -1008, 0.35, 1.05),
    p('hayBalesB', 'hay-bales-b', 612, -1012, -0.3, 0.9),
    p('troughBucket', 'trough-bucket', 623, -998, 0.25, 0.85),
    p('crateStack', 'crate-stack', 608, -994, 0.55, 1.55),
    p('barrelRope', 'barrel-rope', 614, -992, -0.4, 0.75),
    p('logPileStump', 'log-pile-stump', 621, -991, 0.65, 0.8),
    p('signpost', 'signpost', 630, -1006, Math.PI * 0.9, 2),
    p('stoneMarker', 'stone-marker', 601, -1002, -0.2, 1.1),
    p('wildflowerA', 'wildflower-a', 597, -1009, 0.35, 0.62),
    p('wildflowerB', 'wildflower-b', 597, -995, -0.5, 0.62),
]);

const ACCENTS_ROLLING_HILLS = Object.freeze([
    p('stoneMarker', 'stone-marker', 90, 47, -0.15, 1.3),
    p('wildflowerA', 'wildflower-a', 94, 44, 0.45, 0.95),
    p('wildflowerB', 'wildflower-b', 98, 48, -0.35, 0.95),
    p('logPileStump', 'log-pile-stump', 103, 45, 0.7, 1.05),
]);

const ACCENTS_OPEN_COUNTRY = Object.freeze([
    p('stoneMarker', 'stone-marker', -38, 48, 0.35, 1.3),
    p('wildflowerA', 'wildflower-a', -35, 45, -0.4, 0.95),
    p('wildflowerB', 'wildflower-b', -32, 51, 0.2, 0.95),
    p('logPileStump', 'log-pile-stump', -27, 47, -0.8, 1.05),
]);

const SCENE_PLACEMENTS = Object.freeze({
    field: PACKYARD_FIELD,
    newsheepdogland: PACKYARD_NSL,
    'rolling-hills': ACCENTS_ROLLING_HILLS,
    'open-country': ACCENTS_OPEN_COUNTRY,
});

export function getHomesteadPlayfieldPlacements(sceneId) {
    const placements = SCENE_PLACEMENTS[sceneId] ?? [];
    return placements.map((placement) => {
        const asset = ASSETS[placement.assetKey];
        return {
            ...asset,
            ...placement,
            paletteId: PALETTE_ID,
            name: `HomesteadPlayfieldProp_${sceneId}_${placement.id}`,
        };
    });
}

export function getHomesteadPlayfieldSceneSummary(sceneId) {
    const placements = getHomesteadPlayfieldPlacements(sceneId);
    const kinds = new Set(placements.map((placement) => placement.kind));
    return {
        sceneId,
        paletteId: PALETTE_ID,
        count: placements.length,
        kinds: Array.from(kinds).sort(),
        assets: placements.map((placement) => placement.key),
    };
}
