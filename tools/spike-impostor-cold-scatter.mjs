// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Spike: what would island-wide tree SCATTER cost if it ran on the NSL cold
// path (the CPU half of an impostor-first first frame)? Node-only; mesh-build
// cost is measured separately from the live __sdsFoliageStreaming diag.
//
// Run: node tools/spike-impostor-cold-scatter.mjs

import { generateTrees } from '../shared/TreePlacement.js';
import { mulberry32 } from '../shared/Random.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';

const scene = newsheepdogland;
const seed = scene.terrain?.seed ?? 0;

function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

const coldRects = Object.entries(scene.terrain?.zones ?? {})
    .filter(([name]) => name !== 'playArea')
    .map(([, rect]) => rect);

// 1. Cold-path baseline (what the Play click pays today).
let t0 = performance.now();
const coldTrees = generateTrees(scene, mulberry32(seed));
const coldMs = performance.now() - t0;

// 2. Production streaming shape: per-zone salted waves, cumulative canopy
//    checks (same call pattern as js/world/foliageStreaming.js scatterWave).
const order = ['nearField', 'midField', 'farField', 'horizon'];
const streamed = scene.terrain?.streamedZones ?? {};
let existing = [...coldTrees];
let perWaveTotalMs = 0;
const perZone = [];
for (const zone of order.filter((z) => streamed[z])) {
    const rng = mulberry32((seed ^ fnv1a(`foliage-wave:${zone}`)) >>> 0);
    const t = performance.now();
    const trees = generateTrees(scene, rng, {
        zones: { [zone]: streamed[zone], playArea: scene.terrain?.zones?.playArea },
        excludeRects: coldRects,
        existingTrees: existing,
        rockPositions: null,
    });
    const ms = performance.now() - t;
    perWaveTotalMs += ms;
    existing = existing.concat(trees);
    perZone.push({ zone, trees: trees.length, ms: Math.round(ms) });
}

// 3. Impostor-first candidate: ONE scatter pass over the outermost streamed
//    zone (horizon covers the whole island) on the cold path.
const rng3 = mulberry32((seed ^ fnv1a('foliage-wave:horizon')) >>> 0);
t0 = performance.now();
const onePass = generateTrees(scene, rng3, {
    zones: { horizon: streamed.horizon, playArea: scene.terrain?.zones?.playArea },
    excludeRects: coldRects,
    existingTrees: coldTrees,
    rockPositions: null,
});
const onePassMs = performance.now() - t0;

console.log(JSON.stringify({
    coldBaseline: { trees: coldTrees.length, ms: Math.round(coldMs) },
    streamedPerZone: perZone,
    streamedTotal: {
        trees: existing.length - coldTrees.length,
        ms: Math.round(perWaveTotalMs),
    },
    impostorFirstOnePass: { trees: onePass.length, ms: Math.round(onePassMs) },
}, null, 2));
