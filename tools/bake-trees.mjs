/**
 * Cycle 14 Phase 3: bake stylized tree GLBs at build time.
 *
 * Drives Playwright Chromium against `tools/bake-trees/bake.html` to:
 *   - Generate trees via EZ-Tree (`@dgreenheck/ez-tree`, MIT, v1.1.0+)
 *     with tuned per-recipe parameters.
 *   - Normalize each tree to ~1m height so the existing TerrainBuilder
 *     placement code's scale-variance ranges work unchanged.
 *   - Export each as a binary GLB via three.js `GLTFExporter`.
 *   - Write to `assets/models/trees/<name>.glb`.
 *
 * Run as `npm run bake-trees`. Output is committed (deterministic per
 * the seeded recipes below — same seed + same EZ-Tree version === same
 * bytes). Re-run after editing recipes; the existing TerrainBuilder
 * loader picks up new GLBs automatically the next time the dev server
 * reloads.
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
const OUT_DIR = resolve(ROOT, 'assets/models/trees');

// ---------------------------------------------------------------------
// Recipes — each maps an SDS tree-type registry name to an EZ-Tree
// preset + per-recipe overrides + per-recipe normalized height.
//
// Heights are tuned so the existing placement scale ranges
// (~3–5x in TerrainBuilder) put trees at 3–7m visible — same as the
// current Resource_Tree*.glb baseline. Adjust here if the visual sweep
// flags trees as too tall/short; re-run `npm run bake-trees`.
//
// Seeds are fixed so the bake is byte-stable across machines.
// ---------------------------------------------------------------------
// Shared bark/branch overrides for the cozy-game low-poly target.
//
//   - bark.textured = false: drop the full PBR bark texture stack
//     (color + normal + roughness + metalness + AO at 1K each ≈ 1.5MB
//     per tree). Solid-color bark lands in the same ballpark as the
//     existing baseline and reads as stylized.
//
//   - bark.tint = warm brown: EZ-Tree's preset tints are near-white
//     cream (0xFFEAB1), designed to MODULATE a bark texture. With
//     `textured: false` the tint becomes the full surface color, and
//     near-white reads as "dead birch" instead of healthy bark. Per-
//     recipe brown overrides below; this default kept as fallback.
//
//   - bark.flatShading = true: faceted shading matches the low-poly
//     world aesthetic (sheep, dog, terrain are all faceted).
//
//   - branch.sections + segments halved: ~4x trunk-tris reduction
//     without visible silhouette change at the camera distances trees
//     are seen from in SDS (always ≥10m away).
//
//   - branch.children kept close to EZ-Tree defaults so the canopy
//     reads as a proper leafy tree silhouette. Earlier (4/2/0) cut
//     produced visibly skeletal "dead birch" trees in the first
//     deploy. (6/4/2) is the lightest pruning that still reads as
//     a full canopy.
//
//   - leaves.count bumped well above EZ-Tree's defaults — at the
//     camera distances + scale ranges trees are placed at, more leaves
//     produce a fuller silhouette without showing the underlying
//     branch structure. Per-recipe tweaks below tune density per type.
const STYLIZED_BARK = {
    bark: { textured: false, flatShading: true, tint: 0x6b4226 },
    branch: {
        sections: { 0: 4, 1: 3, 2: 2, 3: 1 },
        segments: { 0: 5, 1: 4, 2: 3, 3: 3 },
        children: { 0: 8, 1: 5, 2: 3 }
    },
    leaves: { count: 48, sizeVariance: 0.55 }
};

const RECIPES = [
    {
        name: 'tree1',
        preset: 'Aspen Medium',
        seed: 7,
        normalizeHeight: 1.0,
        // Aspen — slim vertical silhouette for cozy pasture scenes.
        // Slightly lighter brown for the aspen species.
        tweaks: {
            ...STYLIZED_BARK,
            bark: { ...STYLIZED_BARK.bark, tint: 0x7a5a3a }
        }
    },
    {
        name: 'tree2',
        preset: 'Oak Medium',
        seed: 13,
        normalizeHeight: 1.0,
        // Oak — broad canopy anchor for field/RH scenes. Darker bark +
        // even more leaves than the shared default for that "rounder,
        // fuller" Studio Ghibli oak silhouette.
        tweaks: {
            ...STYLIZED_BARK,
            bark: { ...STYLIZED_BARK.bark, tint: 0x5a3a26 },
            leaves: { count: 64, sizeVariance: 0.6 }
        }
    },
    {
        name: 'pine',
        preset: 'Pine Medium',
        seed: 21,
        normalizeHeight: 1.0,
        // Pine — conifer evergreen, billboarded frond leaves. Dark
        // brown bark. Pine's preset default ships 82 children at
        // level 0 (vs the shared 8); restore some of that volume so
        // the conifer reads as full rather than a sparse stick.
        tweaks: {
            ...STYLIZED_BARK,
            bark: { ...STYLIZED_BARK.bark, tint: 0x4a3525 },
            branch: {
                ...STYLIZED_BARK.branch,
                children: { 0: 14, 1: 6, 2: 3 }
            }
        }
    }
];

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
    await mkdir(OUT_DIR, { recursive: true });
    const { server, port } = await startServer();
    const url = `http://127.0.0.1:${port}/bake.html`;
    console.log(`[BAKE] static server on ${url}`);

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

        let totalBytes = 0;
        for (const recipe of RECIPES) {
            const t0 = Date.now();
            const result = await page.evaluate(async (r) => await window.__bakeTree(r), recipe);
            const buf = Buffer.from(result.bytesB64, 'base64');
            const outPath = join(OUT_DIR, `${recipe.name}.glb`);
            await writeFile(outPath, buf);
            totalBytes += buf.length;
            const ms = Date.now() - t0;
            console.log(
                `[OK] ${recipe.name}.glb  ${(buf.length / 1024).toFixed(1)} KB  ` +
                `~${result.triangleCount} tris  native h=${result.nativeHeight.toFixed(1)}m → ${result.normalizedHeight}m  ${ms}ms`
            );
        }
        console.log(`[BAKE] total ${(totalBytes / 1024).toFixed(1)} KB across ${RECIPES.length} GLBs → ${OUT_DIR}`);
    } finally {
        await browser.close();
        server.close();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
