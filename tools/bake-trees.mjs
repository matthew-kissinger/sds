/**
 * Cycle 16 Phase 1: bake stylized tree GLBs at build time, with LOD chain.
 *
 * Drives Playwright Chromium against `tools/bake-trees/bake.html` to:
 *   - Generate trees via EZ-Tree (`@dgreenheck/ez-tree`, MIT, v1.1.0+)
 *     with tuned per-recipe parameters.
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

const args = Object.fromEntries(
    process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);
const SET = args.set ?? 'all'; // 'lod0' | 'lod1' | 'all'
const OUT_OVERRIDE = args.out;

// ---------------------------------------------------------------------
// Cycle 16 recipe matrix.
//
// Bark tints — per Q1 resolution in cycle-16-tree-research.md. Tightened
// to a brown family (mediums cluster 0x6a-0x7a) but per-species variation
// is preserved so silhouettes still differentiate at sheep-cam.
// ---------------------------------------------------------------------
const BARK_TINTS = {
    // species:           [small,    medium,   large]
    ash:   [0x7a5e3c, 0x6e4f30, 0x6a4928],
    aspen: [0x8c7050, 0x7a5a3a, 0x6a4a32],
    oak:   [0x70502e, 0x6a4630, 0x5a3a26],
    pine:  [0x664a32, 0x583c26, 0x4a3525]
};

// Re-rolled seeds (Q2) — fresh LCG region from the Cycle 15 set so
// per-recipe symmetric canopies have a fresh shot. The gallery review
// is the authoritative pick step; if any seed lands asymmetric, swap
// the entry below and re-bake.
const SEEDS = {
    // species:  [smallSeed, mediumSeed, largeSeed]
    ash:   [27, 39, 51],
    aspen: [11, 23, 41],
    oak:   [5,  17, 53],
    pine:  [9,  33, 67]
};

// Cycle 16: leaf counts dropped from 40-72 → 24-42. Combined with
// Single-vs-Double billboard variants in the gallery, this targets a
// 60-70% reduction on leaf tris vs the Cycle 15 baseline.
const LEAF_COUNTS = {
    // species:  [small, medium, large]
    ash:   [24, 30, 36],
    aspen: [24, 30, 36],
    oak:   [30, 36, 42],
    pine:  [24, 30, 36]
};

// Pine needs more level-0 branches than the deciduous default to read
// as a full conifer fronds silhouette. Other species use the LOD0
// default below.
const LOD0_BRANCH_DEFAULT = {
    sections: { 0: 4, 1: 3, 2: 2, 3: 1 },
    segments: { 0: 5, 1: 4, 2: 3, 3: 3 },
    children: { 0: 8, 1: 5, 2: 3 }
};

const LOD0_BRANCH_PINE = {
    sections: LOD0_BRANCH_DEFAULT.sections,
    segments: LOD0_BRANCH_DEFAULT.segments,
    children: { 0: 14, 1: 6, 2: 3 }
};

// LOD1 cuts: fewer level-2 children = fewer leaf-bearing tips, plus
// halved leaf count = ~75% fewer leaf tris vs LOD0 same-species. Trunk
// tessellation also halved at level 0 for a small extra trunk-tris cut.
const LOD1_BRANCH_DEFAULT = {
    sections: { 0: 3, 1: 2, 2: 2, 3: 1 },
    segments: { 0: 4, 1: 3, 2: 3, 3: 3 },
    children: { 0: 6, 1: 4, 2: 0 }
};

const LOD1_BRANCH_PINE = {
    sections: LOD1_BRANCH_DEFAULT.sections,
    segments: LOD1_BRANCH_DEFAULT.segments,
    children: { 0: 10, 1: 4, 2: 0 }
};

const SPECIES_TO_PRESET = {
    ash:   ['Ash Small',   'Ash Medium',   'Ash Large'],
    aspen: ['Aspen Small', 'Aspen Medium', 'Aspen Large'],
    oak:   ['Oak Small',   'Oak Medium',   'Oak Large'],
    pine:  ['Pine Small',  'Pine Medium',  'Pine Large']
};

const SCALES = ['small', 'medium', 'large'];

/**
 * Build a single recipe.
 *
 * @param species   'ash' | 'aspen' | 'oak' | 'pine'
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
    const tint = BARK_TINTS[species][scaleIdx];

    const baseLeafCount = LEAF_COUNTS[species][scaleIdx];
    const leafCount = tier === 'lod1' ? Math.round(baseLeafCount * 0.5) : baseLeafCount;

    const branch = tier === 'lod1'
        ? (species === 'pine' ? LOD1_BRANCH_PINE : LOD1_BRANCH_DEFAULT)
        : (species === 'pine' ? LOD0_BRANCH_PINE : LOD0_BRANCH_DEFAULT);

    // Cycle 16 follow-up (2026-05-03): Matt flagged leaves as too small
    // in coverage from the gallery. Bumped baseSize 1.0 → 1.6 across the
    // board so canopies read with proper coverage from grazing camera
    // angles. Pine reduced because pine "leaves" are needle clusters
    // that get visually overpowering past size 1.6.
    //
    // Single-billboard leaves still get an extra ~25% bump on top to
    // compensate for the missing perpendicular quad. Net leaf-card
    // dimensions roughly: deciduous-single ~2.0, deciduous-double ~1.6,
    // pine-single ~1.5, pine-double ~1.2. Leaf TRIS stay flat (size
    // affects per-card scale, not card count).
    const baseSize = species === 'pine' ? 1.2 : 1.6;
    const leafSize = baseSize * sizeBoost * (billboard === 'single' ? 1.25 : 1.0);

    const tweaks = {
        bark: {
            textured: false,
            flatShading: true,
            tint
        },
        branch,
        leaves: {
            billboard,
            count: leafCount,
            size: leafSize,
            // 0.55 → 0.65: more variance among individual leaf cards so
            // the canopy reads as a textured cluster rather than a
            // uniform foam wad. Cheap (just per-instance scale jitter).
            sizeVariance: 0.65
        }
    };

    const tierSlug = tier === 'lod1' ? '_lod1' : '';
    const name = `${species}_${SCALES[scaleIdx]}_${billboard}${tierSlug}`;
    const outSubdir = tier === 'lod1' ? 'tools/asset-gallery/staging/trees-lod1'
                                       : 'tools/asset-gallery/staging/trees';

    return { name, preset, seed, normalizeHeight: 1.0, tweaks, outSubdir };
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
    }
    if (SET === 'all' || SET === 'lod1') {
        for (const sp of species) {
            for (let s = 0; s < 3; s++) {
                out.push(buildRecipe(sp, s, 'lod1', 'single'));
            }
        }
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
            const path = resolve(ROOT, '.' + url);
            if (!path.startsWith(ROOT)) {
                res.writeHead(403); res.end('Forbidden'); return;
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
