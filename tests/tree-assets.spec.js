import { describe, it, expect } from 'vitest';
import { statSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tree-asset contract (Cycle 15 Phase 4).
 *
 * The trees are seed→build-time GLBs baked by `tools/bake-trees.mjs` into
 * `assets/models/trees/`. The committed bytes ARE the contract — the
 * runtime loader at `js/GameAssetLoader.js` references these paths
 * directly. This spec pins three load-bearing facts:
 *
 *   1. The 3 GLB files exist (regression guard if a re-bake fails
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

const TREE_FILES = ['tree1.glb', 'tree2.glb', 'pine.glb'];
const TOTAL_SIZE_CEILING_BYTES = 3 * 1024 * 1024; // 3 MB

describe('tree assets — committed GLBs', () => {
    it.each(TREE_FILES)('%s exists', (filename) => {
        const path = resolve(TREES_DIR, filename);
        expect(existsSync(path), `Missing baked GLB at ${path}. Run \`npm run bake-trees\`.`).toBe(true);
    });

    it.each(TREE_FILES)('%s is non-empty', (filename) => {
        const path = resolve(TREES_DIR, filename);
        const size = statSync(path).size;
        expect(size, `Empty GLB at ${path}. Re-bake (\`rm assets/_originals/models/trees/*.glb && npm run bake-trees && npm run compress-glbs\`).`).toBeGreaterThan(0);
    });

    it('total size stays under the 3 MB ceiling', () => {
        const total = TREE_FILES.reduce((acc, f) => acc + statSync(resolve(TREES_DIR, f)).size, 0);
        expect(total).toBeLessThan(TOTAL_SIZE_CEILING_BYTES);
    });
});
