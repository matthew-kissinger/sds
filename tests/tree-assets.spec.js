// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { beforeAll, describe, it, expect } from 'vitest';
import { statSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

/**
 * Tree-asset contract (Cycle 15 Phase 4 + Cycle 16 Phase 1).
 *
 * The trees are seed→build-time GLBs baked by `tools/bake-trees.mjs` into
 * `assets/models/trees/`. The committed bytes ARE the contract — the
 * runtime loader at `js/TerrainBuilder.js` references these paths
 * directly and wires them into the
 * `InstancedMesh2.addLOD` chain (LOD0 → LOD1 → cross-billboard).
 *
 * Cycle 16 added a sibling LOD1 GLB per tree (reduced leaf count + Single
 * billboard + fewer level-2 branches). Each LOD0 file pairs 1:1 with its
 * `_lod1` sibling; the loader fails closed if either is missing.
 *
 * This spec pins three load-bearing facts:
 *
 *   1. The 6 GLB files exist (regression guard if a re-bake fails
 *      silently or someone deletes one without updating the loader).
 *   2. Each is non-empty (Playwright bake harness can produce empty
 *      files on a server-spinup race; this catches it before deploy).
 *   3. Total size stays under a soft ceiling so the deferred-asset bundle
 *      doesn't quietly bloat past the perf budget that drove Cycle 14
 *      Phase 3 in the first place.
 *
 * If a recipe change pushes total size past the ceiling, the right
 * answer is to either tune the recipe (fewer leaves, simpler bark) or
 * raise the ceiling deliberately — not to silently drift.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const TREES_DIR = resolve(__dirname, '..', 'assets', 'models', 'trees');
const ROCKS_DIR = resolve(__dirname, '..', 'assets', 'models', 'rocks');
const PICKS_PATH = resolve(__dirname, '..', 'tools', 'asset-gallery', 'picks.json');

const LOD0_FILES = ['tree1.glb', 'tree2.glb'];
const LOD1_FILES = ['tree1_lod1.glb', 'tree2_lod1.glb'];
const TREE_FILES = [...LOD0_FILES, ...LOD1_FILES];
const ROCK_FILES = ['rock1.glb', 'rock2.glb', 'rock3.glb'];
const BUDGETED_FILES = [...TREE_FILES, ...ROCK_FILES];

// Cycle 16: LOD1 sibling GLBs roughly 30-50% the LOD0 size after draco,
// so the 6-GLB total is ~+50% over the 3-GLB total. Ceiling raised
// 3 MB → 4 MB to absorb.
// Cycle 91 re-ground: trees re-baked from ez-tree main with real PBR bark
// (color+AO+normal) + 512px leaf textures, WebP-converted by compress-glbs
// (~410-666 KB per GLB; the 4 MB ceiling still holds with textures). Budgets
// re-set deliberately: tree2 8000 -> 9000 (preset-pure mature oak, 8486),
// LOD1s to the measured meshopt output at ratio 0.25 (the simplifier
// bottoms out ~39% on leaf-card geometry - see bake-tree-lod1.mjs).
const TOTAL_SIZE_CEILING_BYTES = 4 * 1024 * 1024; // 4 MB
const ACCEPTED_TRIANGLE_BUDGETS = Object.freeze({
    'tree1.glb': 4000,
    'tree2.glb': 9000,
    'tree1_lod1.glb': 1600,
    'tree2_lod1.glb': 2600,
    'rock1.glb': 500,
    'rock2.glb': 500,
    'rock3.glb': 500,
});
// Picks.json only carries gallery-picked assets since Cycle 91 (LOD1s are
// derived from the LOD0 picks by bake-tree-lod1.mjs, not picked).
const PICKED_BUDGET_FILES = Object.freeze(['tree1.glb', 'tree2.glb', 'rock1.glb', 'rock2.glb', 'rock3.glb']);
const IMPOSTOR_SIDECARS = Object.freeze(['png', 'normal.png', 'depth.png', 'json']);

let runtimeTriangleCounts;

function loadPicksByCanonicalName() {
    const picks = JSON.parse(readFileSync(PICKS_PATH, 'utf8')).picks;
    return new Map(picks.map((pick) => [pick.canonicalName, pick]));
}

function assetPath(filename) {
    return filename.startsWith('rock') ? resolve(ROCKS_DIR, filename) : resolve(TREES_DIR, filename);
}

async function makeIO() {
    await MeshoptDecoder.ready;
    return new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
            'draco3d.decoder': await draco3d.createDecoderModule(),
            'meshopt.decoder': MeshoptDecoder,
        });
}

function countTriangles(document) {
    let triangles = 0;
    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            triangles += (primitive.getIndices()?.getCount?.() ?? 0) / 3;
        }
    }
    return triangles;
}

describe('tree assets — committed GLBs', () => {
    beforeAll(async () => {
        const io = await makeIO();
        runtimeTriangleCounts = new Map();
        for (const filename of BUDGETED_FILES) {
            runtimeTriangleCounts.set(filename, countTriangles(await io.read(assetPath(filename))));
        }
    });

    it.each(TREE_FILES)('%s exists', (filename) => {
        const path = resolve(TREES_DIR, filename);
        expect(existsSync(path), `Missing baked GLB at ${path}. Run \`npm run bake-trees\` then \`node tools/asset-gen/integrate.mjs --compress\`.`).toBe(true);
    });

    it.each(TREE_FILES)('%s is non-empty', (filename) => {
        const path = resolve(TREES_DIR, filename);
        const size = statSync(path).size;
        expect(size, `Empty GLB at ${path}. Re-bake (\`rm assets/_originals/models/trees/*.glb && npm run bake-trees && npm run compress-glbs\`).`).toBeGreaterThan(0);
    });

    it('total size stays under the 4 MB ceiling', () => {
        const total = TREE_FILES.reduce((acc, f) => acc + statSync(resolve(TREES_DIR, f)).size, 0);
        expect(total).toBeLessThan(TOTAL_SIZE_CEILING_BYTES);
    });

    it.each(LOD0_FILES.map((f, i) => [f, LOD1_FILES[i]]))(
        '%s pairs with sibling %s (LOD chain wired in TerrainBuilder)',
        (lod0, lod1) => {
            // Defensive: the addLOD chain in TerrainBuilder.createTrees
            // looks up the LOD1 GLB by sibling name. If the LOD1 sibling
            // is missing, the LOD chain falls back to LOD0-only and we
            // lose the mid-distance perf win silently. Catch at test time.
            expect(existsSync(resolve(TREES_DIR, lod0))).toBe(true);
            expect(existsSync(resolve(TREES_DIR, lod1))).toBe(true);
        }
    );

    it('keeps tree and rock picks inside accepted triangle budgets', () => {
        const picks = loadPicksByCanonicalName();
        for (const canonicalName of PICKED_BUDGET_FILES) {
            const maxTris = ACCEPTED_TRIANGLE_BUDGETS[canonicalName];
            const pick = picks.get(canonicalName);
            expect(pick, `${canonicalName} missing from tools/asset-gallery/picks.json`).toBeTruthy();
            expect(pick.tris, `${canonicalName} exceeds accepted triangle budget`).toBeLessThanOrEqual(maxTris);
        }
    });

    it('keeps committed tree and rock GLBs inside accepted triangle budgets', () => {
        for (const [filename, maxTris] of Object.entries(ACCEPTED_TRIANGLE_BUDGETS)) {
            expect(runtimeTriangleCounts.get(filename), `${filename} committed GLB exceeds accepted triangle budget`).toBeLessThanOrEqual(maxTris);
        }
    });

    it.each(LOD0_FILES.map((f, i) => [f, LOD1_FILES[i]]))(
        '%s sibling %s is no more than 40% of LOD0 triangles',
        (lod0, lod1) => {
            // Cycle 91: 25% -> 40%. The meshopt simplifier bottoms out around
            // 39% of source tris on leaf-card-dominated trees regardless of
            // the requested ratio - collapsing an isolated card deletes it
            // outright, so cards act as a floor (verified against both the
            // in-repo bake and `pixelforge kiln lod` at ratios 0.15-0.25).
            const lod0Tris = runtimeTriangleCounts.get(lod0);
            const lod1Tris = runtimeTriangleCounts.get(lod1);
            expect(lod1Tris, `${lod1} must stay at or below 40% of ${lod0}`).toBeLessThanOrEqual(Math.floor(lod0Tris * 0.4));
        }
    );

    it.each(LOD0_FILES)('%s has committed Kiln impostor sidecars', (filename) => {
        const stem = filename.replace(/\.glb$/, '.imposter');
        for (const ext of IMPOSTOR_SIDECARS) {
            expect(existsSync(resolve(TREES_DIR, `${stem}.${ext}`))).toBe(true);
        }
    });
});
