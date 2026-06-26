// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 16 Phase 1: bake stylized tree GLBs at build time, with LOD chain.
 * Cycle 91: re-grounded on ez-tree GitHub main (sibling clone at ../ez-tree,
 * pinned commit 48dc193, built via `npm run build:lib`). Main adds stratified
 * leaf/branch placement (kills the spiral artifacts), geometry-level rounded
 * leaf normals, the world-axis growth-force fix, and externalized textures -
 * the bake now supplies real ambientcg PBR bark (color+AO+normal, downscaled
 * to a deliberate size) and a chosen leaf-texture resolution instead of the
 * 1.1.0 bundled flat-tint setup.
 *
 * Drives Playwright Chromium against `tools/bake-trees/bake.html` to:
 *   - Generate trees via EZ-Tree with tuned per-recipe parameters.
 *   - Normalize each tree to ~1m height so the existing TerrainBuilder
 *     placement code's scale-variance ranges work unchanged.
 *   - Export each as a binary GLB via three.js `GLTFExporter`.
 *
 * Cycle 16 expansion: bakes a 36-GLB matrix into staging:
 *   - 24 LOD0 candidates → tools/asset-gallery/staging/trees/
 *     (4 species × 3 scales × 2 billboard modes — Double + Single sibling
 *      per recipe so the gallery can A/B the visual tradeoff)
 *   - 12 LOD1 candidates → tools/asset-gallery/staging/trees-lod1/
 *     (same species/scales, always Single, halved leaf count, fewer
 *      branch.children — used as the mid-distance addLOD entry)
 *
 * Run as `npm run bake-trees`. Pass `--set=lod0|lod1|all` to bake a
 * subset (default: all). Output is gitignored (staging/); only picked +
 * integrated assets land in `assets/models/`.
 *
 * Why a Playwright harness instead of plain Node? GLTFExporter encodes
 * embedded textures via canvas.toDataURL — that needs a DOM. Spinning
 * up a tiny static server + a headless browser is simpler than
 * polyfilling node-canvas, and we already have Playwright as a dev dep.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Sibling clone of dgreenheck/ez-tree at the pinned main-branch commit.
// Setup (one-time):
//   git clone https://github.com/dgreenheck/ez-tree.git ../ez-tree
//   cd ../ez-tree && git checkout 48dc193 && npm install && npm run build:lib
// Set SDS_EZ_TREE_ROOT for validation bakes against a separate worktree.
const EZ_TREE_ROOT = resolve(ROOT, process.env.SDS_EZ_TREE_ROOT ?? '../ez-tree');
const EZ_TREE_PINNED_COMMIT = '48dc193';

const args = Object.fromEntries(
    process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);
const SET = args.set ?? 'all'; // 'lod0' | 'lod1' | 'all'
const OUT_OVERRIDE = args.out;

// ---------------------------------------------------------------------
// Cycle 16 recipe matrix; Cycle 91 first-principles texture re-ground.
//
// Bark is now REAL ambientcg PBR (ez-tree main externalized textures and
// the presets carry a Bark00X type the harness resolves to maps). The old
// flat-shaded hex tints existed because 1.1.0 bakes never enabled
// bark.textured; with textures carrying the color, tint stays neutral
// white and BARK_TYPES picks the texture set per species instead.
// Oak overrides the preset's Bark001 (shared with ash) so the two
// production species stay distinguishable up close.
// ---------------------------------------------------------------------
// Cycle 22: pine species removed — recipe entries deleted across BARK_TINTS,
// SEEDS, LEAF_COUNTS, LOD1_BRANCH_PINE / LOD0_BRANCH_PINE, SPECIES_TO_PRESET.
// 2026-06-11 second pass: the preset defaults (Bark001 grey-brown, Bark002
// pale birch) washed to WHITE under SDS's bright ambient (Matt flagged
// in-game; same failure mode as the Cycle 17 white-bark precedent).
// Re-picked from a visual pass over all 11 shipped sets: Bark014 is a
// proper red-brown with strong relief, Bark015 a warm olive-tan.
const BARK_TYPES = {
    ash:   'Bark015',
    aspen: 'Bark014',   // tree1 slot - 70% of placements, the white offender
    oak:   'Bark015'    // tree2 slot - warm tan, keeps the species distinct
};
const BARK_TINT = 0xffffff;

// Re-rolled seeds (Q2) — fresh LCG region from the Cycle 15 set so
// per-recipe symmetric canopies have a fresh shot. The gallery review
// is the authoritative pick step; if any seed lands asymmetric, swap
// the entry below and re-bake.
const SEEDS = {
    // species:  [smallSeed, mediumSeed, largeSeed]
    ash:   [27, 39, 51],
    aspen: [11, 23, 41],
    oak:   [5,  17, 53]
};

// Cycle 91 re-ground: `leaves.count` is PER TERMINAL BRANCH (each last-level
// branch generates `count` leaf cards). The Cycle 16-21 LOD0 branch/leaf
// overrides were tuned against an older bake, fought the author-tuned
// preset structure (children 8-10 at level 0 vs the presets' 4), and were
// never re-baked into production. LOD0 now ships the preset structure
// unmodified; only LOD1 thins geometry.

// LOD1 cuts: fewer level-2 children = fewer leaf-bearing tips, plus
// halved leaf count (leafCountScale 0.5 in the harness) = ~75% fewer
// leaf tris vs LOD0 same-species. Trunk tessellation also halved at
// level 0 for a small extra trunk-tris cut.
const LOD1_BRANCH_DEFAULT = {
    sections: { 0: 3, 1: 2, 2: 2, 3: 1 },
    segments: { 0: 4, 1: 3, 2: 3, 3: 3 },
    children: { 0: 6, 1: 4, 2: 0 }
};

// Cycle 22: LOD1_BRANCH_PINE removed (pine species deleted).

const SPECIES_TO_PRESET = {
    ash:   ['Ash Small',   'Ash Medium',   'Ash Large'],
    aspen: ['Aspen Small', 'Aspen Medium', 'Aspen Large'],
    oak:   ['Oak Small',   'Oak Medium',   'Oak Large']
};

const SCALES = ['small', 'medium', 'large'];

/**
 * Build a single recipe.
 *
 * @param species   'ash' | 'aspen' | 'oak'
 * @param scaleIdx  0=small, 1=medium, 2=large
 * @param tier      'lod0' | 'lod1'
 * @param billboard 'single' | 'double'  (per EZ-Tree Billboard enum —
 *                  internally a lowercase string; capital-case is silently
 *                  ignored by EZ-Tree's `=== L.Double` check, fix-up date
 *                  2026-05-03)
 */
function buildRecipe(species, scaleIdx, tier, billboard, sizeBoost = 1.0) {
    const preset = SPECIES_TO_PRESET[species][scaleIdx];
    const seed = SEEDS[species][scaleIdx];
    const barkType = BARK_TYPES[species];

    // Cycle 91: LOD0 trusts the preset's branch structure and leaf tuning
    // outright - the author-tuned presets (levels/children/count/size) read
    // better than the Cycle 16 overrides, which multiplied terminals
    // (children 8-10 at level 0 vs the presets' 4) and then starved each
    // of leaves. Only textures, billboard, and seed vary per recipe.
    // LOD1 still thins geometry: reduced branch tessellation + half the
    // preset's per-terminal leaf count (applied multiplicatively in the
    // harness via leafCountScale, since the count lives in the preset).
    const branch = tier === 'lod1' ? LOD1_BRANCH_DEFAULT : null;

    const tweaks = {
        bark: {
            // Cycle 91: real PBR bark. The harness resolves bark.type to
            // ambientcg color+AO+normal maps; tint stays neutral so the
            // texture carries the color.
            textured: true,
            flatShading: false,
            tint: BARK_TINT
        },
        leaves: {
            billboard,
            // Geometry-level canopy-rounded normals (ez-tree main). The
            // default is already true; explicit so the intent greps.
            roundedNormals: true
        }
    };
    if (branch) tweaks.branch = branch;
    // Single-billboard variants compensate for the missing perpendicular
    // quad with a modest size bump applied multiplicatively on the
    // preset's own leaf size (sizeBoost stacks for deliberate sweeps).
    const leafSizeScale = sizeBoost * (billboard === 'single' ? 1.25 : 1.0);

    const tierSlug = tier === 'lod1' ? '_lod1' : '';
    const name = `${species}_${SCALES[scaleIdx]}_${billboard}${tierSlug}`;
    const outSubdir = tier === 'lod1' ? 'tools/asset-gallery/staging/trees-lod1'
                                       : 'tools/asset-gallery/staging/trees';

    return {
        name, preset, seed, normalizeHeight: 1.0, tweaks, outSubdir,
        barkType,
        leafSizeScale: leafSizeScale !== 1.0 ? leafSizeScale : undefined,
        leafCountScale: tier === 'lod1' ? 0.5 : undefined,
        // 512 bark maps: 1K natives would dominate the GLB budget; 512 holds
        // up at the <= 10m viewing distances trees get in SDS. Leaf texture
        // lifted 384 -> 512 with the quality pass (survey arbitrates).
        barkTextureSize: 512,
        leafTextureSize: 512
    };
}

// ---------------------------------------------------------------------
// Generate the 36-GLB matrix.
//   LOD0: 4 species × 3 scales × 2 billboard modes = 24
//   LOD1: 4 species × 3 scales × Single only       = 12
// ---------------------------------------------------------------------
function buildAllRecipes() {
    const out = [];
    const species = Object.keys(SPECIES_TO_PRESET);
    if (SET === 'all' || SET === 'lod0') {
        for (const sp of species) {
            for (let s = 0; s < 3; s++) {
                out.push(buildRecipe(sp, s, 'lod0', 'double'));
                out.push(buildRecipe(sp, s, 'lod0', 'single'));
            }
        }
        // Cycle 91 tree1-slot variants: the preset-pure aspen reads as an
        // authentic-but-spindly sapling (canopy starts 45% up a 24-unit
        // trunk). Lowering the canopy is a deliberate single-knob tweak,
        // not a structure fight. The green variant swaps the autumn-yellow
        // aspen leaf texture for ash's green - same structure - as the
        // color-decision candidate (NSL reads garish with 70% yellow trees).
        const lowCanopy = { branch: { start: { 1: 0.28 }, length: { 0: 19 } } };
        for (const [name, extraTweaks, leafType] of [
            ['aspen_small_double_lowcanopy', lowCanopy, undefined],
            ['aspen_small_double_lowcanopy_green', lowCanopy, 'ash'],
        ]) {
            const r = buildRecipe('aspen', 0, 'lod0', 'double');
            r.name = name;
            r.tweaks = structuredClone(r.tweaks);
            for (const [k, v] of Object.entries(extraTweaks)) {
                r.tweaks[k] = { ...(r.tweaks[k] ?? {}), ...v };
            }
            if (leafType) r.leafType = leafType;
            out.push(r);
        }
    }
    if (SET === 'all' || SET === 'lod1') {
        for (const sp of species) {
            for (let s = 0; s < 3; s++) {
                out.push(buildRecipe(sp, s, 'lod1', 'single'));
            }
        }
        // LOD1 sibling of the tree1-slot variant (same lowcanopy + green
        // leaf tweaks, LOD1 branch thinning + halved leaf count).
        const r = buildRecipe('aspen', 0, 'lod1', 'double');
        r.name = 'aspen_small_double_lowcanopy_green_lod1';
        r.tweaks = structuredClone(r.tweaks);
        r.tweaks.branch = {
            ...r.tweaks.branch,
            start: { 1: 0.28 },
            length: { 0: 19 },
        };
        r.leafType = 'ash';
        out.push(r);
    }
    return out;
}

const RECIPES = buildAllRecipes();

// ---------------------------------------------------------------------
// Tiny static server: serves /node_modules/* + /tools/bake-trees/*.
// Constrained to ROOT for path-traversal safety.
// ---------------------------------------------------------------------
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.glsl': 'text/plain',
    '.css': 'text/css'
};

function startServer() {
    const server = createServer(async (req, res) => {
        try {
            let url = decodeURIComponent(req.url.split('?')[0]);
            if (url === '/' || url === '/bake.html') url = '/tools/bake-trees/bake.html';
            // /ez-tree/* serves the sibling clone (lib build + demo textures).
            let path;
            if (url.startsWith('/ez-tree/')) {
                path = resolve(EZ_TREE_ROOT, '.' + url.slice('/ez-tree'.length));
                if (!path.startsWith(EZ_TREE_ROOT)) {
                    res.writeHead(403); res.end('Forbidden'); return;
                }
            } else {
                path = resolve(ROOT, '.' + url);
                if (!path.startsWith(ROOT)) {
                    res.writeHead(403); res.end('Forbidden'); return;
                }
            }
            const data = await readFile(path);
            res.setHeader('Content-Type', MIME[extname(path).toLowerCase()] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-store');
            res.end(data);
        } catch (err) {
            res.writeHead(404);
            res.end(`Not found: ${req.url}\n${err.message}`);
        }
    });
    return new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
        server.on('error', reject);
    });
}

// ---------------------------------------------------------------------

async function main() {
    try {
        await readFile(join(EZ_TREE_ROOT, 'build', 'ez-tree.es.js'));
    } catch {
        console.error(
            `[BAKE] ez-tree lib build not found at ${EZ_TREE_ROOT}\\build\\ez-tree.es.js\n` +
            `Set it up once:\n` +
            `  git clone https://github.com/dgreenheck/ez-tree.git ${EZ_TREE_ROOT}\n` +
            `  cd ${EZ_TREE_ROOT} && git checkout ${EZ_TREE_PINNED_COMMIT} && npm install && npm run build:lib`
        );
        process.exit(1);
    }
    const { server, port } = await startServer();
    const url = `http://127.0.0.1:${port}/bake.html`;
    console.log(`[BAKE] static server on ${url}`);
    console.log(`[BAKE] set=${SET} → ${RECIPES.length} recipes`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('pageerror', err => console.error('[PAGE ERROR]', err.message));
    page.on('console', msg => {
        const t = msg.type();
        if (t === 'error' || t === 'warning') console.log(`[PAGE ${t}]`, msg.text());
    });

    try {
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => window.__bakeReady === true, null, { timeout: 30000 });

        const bytesByDir = new Map();
        for (const recipe of RECIPES) {
            const t0 = Date.now();
            const result = await page.evaluate(async (r) => await window.__bakeTree(r), recipe);
            const buf = Buffer.from(result.bytesB64, 'base64');
            const outRel = OUT_OVERRIDE ?? recipe.outSubdir;
            const outDir = resolve(ROOT, outRel);
            await mkdir(outDir, { recursive: true });
            const outPath = join(outDir, `${recipe.name}.glb`);
            await writeFile(outPath, buf);
            bytesByDir.set(outRel, (bytesByDir.get(outRel) ?? 0) + buf.length);
            const ms = Date.now() - t0;
            console.log(
                `[OK] ${recipe.name}.glb  ${(buf.length / 1024).toFixed(1)} KB  ` +
                `~${result.triangleCount} tris  → ${outRel}  ${ms}ms`
            );
        }
        for (const [dir, total] of bytesByDir) {
            console.log(`[BAKE] ${dir}/  total ${(total / 1024).toFixed(1)} KB`);
        }
    } finally {
        await browser.close();
        server.close();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
