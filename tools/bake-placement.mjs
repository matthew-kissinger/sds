// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Bake the Field tree-placement manifest.
 *
 * Phase 1 of Cycle 45 measured Field as the one scene where seeded Poisson
 * tree scatter (~489ms) is a top scene-load cost, not GLB loading. Field is a
 * flat starter pasture that scattered ~1359 trees out to +/-800m. This script
 * runs that scatter once at build time and writes the positions to
 * public/placement/field.json; the renderer loads them instead of re-running
 * the scatter on every scene-load (see js/world/TreePlacement.js placeTrees).
 *
 * Two deliberate departures from the runtime default scatter:
 *   1. The treeline is pulled inward (FIELD_TREELINE_ZONES below): the outer
 *      zone rects shrink so trees stop ~430m out instead of ~800m. Field's
 *      shared terrain.zones stay at +/-800 (so the ground mesh still reaches
 *      the horizon and both placement goldens keep passing); the thinned zones
 *      live here, bake-time only.
 *   2. A radial clamp (FIELD_TREELINE_RADIUS) trims the rect corners to a clean
 *      circular treeline so the diagonals don't bulge a square forest silhouette
 *      out past the cardinal treeline once it sits forward of the fog wall.
 *
 * Rocks are NOT applied here. Runtime rocks are Math.random (non-deterministic
 * per load), so the bake stays pure/deterministic and placeTrees re-rejects
 * baked trees against each load's actual rocks. This keeps the manifest
 * reproducible (the determinism test in tests/placement-manifest.spec.js
 * re-runs buildFieldPlacementManifest and byte-compares the committed trees).
 *
 * Run:  node tools/bake-placement.mjs
 * (or:  npm run bake-placement)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { generateTrees } from '../shared/TreePlacement.js';
import { mulberry32 } from '../shared/Random.js';
import { field } from '../shared/scenes/field.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MANIFEST_VERSION = 1;

/**
 * Pulled-in treeline zones. nearField/playArea match Field's shared zones (the
 * inner play approach is untouched); midField/farField/horizon shrink so the
 * outer treeline lands in Matt's "380-450m" band rather than at +/-800m.
 * @type {Record<string, {minX:number,maxX:number,minZ:number,maxZ:number}>}
 */
export const FIELD_TREELINE_ZONES = {
    playArea:  { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    nearField: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    midField:  { minX: -300, maxX: 300, minZ: -300, maxZ: 300 },
    farField:  { minX: -380, maxX: 380, minZ: -380, maxZ: 380 },
    horizon:   { minX: -450, maxX: 450, minZ: -450, maxZ: 450 },
};

/**
 * Radial clamp (m). Trees beyond this distance from origin are dropped so the
 * treeline reads as a clean disc instead of a square with bulging corners. Set
 * inside the horizon rect (+/-450) so the disc is fully Poisson-filled.
 */
export const FIELD_TREELINE_RADIUS = 430;

/**
 * Build the Field placement manifest object. Pure + deterministic: same output
 * every run (seeded mulberry32(0), no rocks). The CLI block writes this to
 * public/placement/field.json; the determinism test re-runs it and compares.
 *
 * @returns {{
 *   version: number, scene: string, seed: number,
 *   treelineZones: Record<string, {minX:number,maxX:number,minZ:number,maxZ:number}>,
 *   treelineRadius: number, treeCount: number, maxRadius: number,
 *   trees: import('../shared/TreePlacement.js').TreeInstance[]
 * }}
 */
export function buildFieldPlacementManifest() {
    const seed = field.terrain?.seed ?? 0;
    const thinnedScene = {
        ...field,
        terrain: { ...field.terrain, zones: FIELD_TREELINE_ZONES },
    };

    // No rocks / no competitive pastures: the bake is the cooperative
    // scene-load scatter. placeTrees re-applies rock rejection at runtime,
    // and competitive mode re-runs generateTrees with its pastures.
    const scattered = generateTrees(thinnedScene, mulberry32(seed));
    const trees = scattered.filter(
        (t) => Math.hypot(t.x, t.z) <= FIELD_TREELINE_RADIUS,
    );

    let maxRadius = 0;
    for (const t of trees) {
        const d = Math.hypot(t.x, t.z);
        if (d > maxRadius) maxRadius = d;
    }

    return {
        version: MANIFEST_VERSION,
        scene: 'field',
        seed,
        treelineZones: FIELD_TREELINE_ZONES,
        treelineRadius: FIELD_TREELINE_RADIUS,
        treeCount: trees.length,
        maxRadius: +maxRadius.toFixed(3),
        trees,
    };
}

// Ring histogram for the console readout (matches the Phase 3 probe bins so
// the bake's distribution is comparable to field-tree-probe.mjs).
const RINGS = [120, 200, 250, 300, 350, 400, 430, 450];
function histogram(trees) {
    const counts = new Array(RINGS.length).fill(0);
    let beyond = 0;
    for (const t of trees) {
        const d = Math.hypot(t.x, t.z);
        let placed = false;
        for (let i = 0; i < RINGS.length; i++) {
            if (d <= RINGS[i]) { counts[i]++; placed = true; break; }
        }
        if (!placed) beyond++;
    }
    return { counts, beyond };
}

async function main() {
    const manifest = buildFieldPlacementManifest();
    const outPath = resolve(__dirname, '../public/placement/field.json');
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(manifest), 'utf8');

    const { counts, beyond } = histogram(manifest.trees);
    console.log(`Baked Field placement manifest -> ${outPath}`);
    console.log(`  seed ${manifest.seed}  trees ${manifest.treeCount}  maxRadius ${manifest.maxRadius}m  (clamp ${FIELD_TREELINE_RADIUS}m)`);
    console.log(`  by ring (m): ${RINGS.map((r) => `<=${r}`).join('  ')}  >${RINGS[RINGS.length - 1]}`);
    console.log(`               ${counts.map((c) => String(c).padStart(4)).join('  ')}  ${String(beyond).padStart(4)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
