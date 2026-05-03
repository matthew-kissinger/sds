import { describe, it, expect } from 'vitest';
import { statSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tree-asset contract (Cycle 15 Phase 4 + Cycle 16 Phase 1).
 *
 * The trees are seed→build-time GLBs baked by `tools/bake-trees.mjs` into
 * `assets/models/trees/`. The committed bytes ARE the contract — the
 * runtime loader at `js/GameAssetLoader.js` references these paths
 * directly, and `js/TerrainBuilder.js` wires them into the
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

const LOD0_FILES = ['tree1.glb', 'tree2.glb', 'pine.glb'];
const LOD1_FILES = ['tree1_lod1.glb', 'tree2_lod1.glb', 'pine_lod1.glb'];
const TREE_FILES = [...LOD0_FILES, ...LOD1_FILES];

// Cycle 16: LOD1 sibling GLBs roughly 30-50% the LOD0 size after draco,
// so the 6-GLB total is ~+50% over the 3-GLB total. Ceiling raised
// 3 MB → 4 MB to absorb. Single-tree LOD1 sizes are ~150-300 KB
// post-draco; if any one ships >500 KB something's wrong with the
// LOD1 recipe (probably leaves.count not actually halved).
const TOTAL_SIZE_CEILING_BYTES = 4 * 1024 * 1024; // 4 MB

describe('tree assets — committed GLBs', () => {
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
});
