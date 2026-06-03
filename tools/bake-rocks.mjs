// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 14 followup: bake stylized procedural rock GLBs at build time.
 *
 * Mirrors `tools/bake-trees.mjs`: a tiny static server serves
 * `tools/bake-rocks/bake.html` to a headless Chromium that generates
 * each rock with three.js `IcosahedronGeometry` + 3D simplex noise
 * displacement, then exports it via `GLTFExporter` as a binary GLB.
 *
 * Why a Playwright harness? `GLTFExporter` encodes embedded resources
 * via canvas APIs — we don't ship textures here, but staying in
 * lockstep with the tree pipeline keeps the dev story uniform: same
 * `npm run bake-X` cadence, same output layout, same compress-glbs
 * step. (The browser also gives us three.js for free without polluting
 * Node with a rendering stack.)
 *
 * Output: `assets/models/rocks/{rock1,rock2,rock3}.glb`.
 *
 * Replaces the prior Quaternius MegaKit rocks (which read as broken
 * mesh shards in playtest). The downstream loader in
 * `js/TerrainBuilder.js` is unchanged: same file paths, same
 * `ROCK_NATIVE_HEIGHT` normalization, same `_patchRockMaterial`
 * fresnel rim-light. We just hand it better geometry.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES } from './bake-rocks/recipes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Cycle 15 Phase 1: bake into the gallery staging dir by default so the
// pipeline is "bake all variations → review → pick → integrate." Pass
// `--out=assets/models/rocks` to bake directly into committed assets
// (canonical post-pick flow), but the integrate.mjs script handles the
// promotion + rename to rock1/rock2/rock3 from a curated subset.
const args = Object.fromEntries(
    process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);
const OUT_REL = args.out ?? 'tools/asset-gallery/staging/rocks';
const OUT_DIR = resolve(ROOT, OUT_REL);

// ---------------------------------------------------------------------
// Tiny static server (same pattern as bake-trees.mjs).
// ---------------------------------------------------------------------
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.css': 'text/css'
};

function startServer() {
    const server = createServer(async (req, res) => {
        try {
            let url = decodeURIComponent(req.url.split('?')[0]);
            if (url === '/' || url === '/bake.html') url = '/tools/bake-rocks/bake.html';
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
            const result = await page.evaluate(async (r) => await window.__bakeRock(r), recipe);
            const buf = Buffer.from(result.bytesB64, 'base64');
            const outPath = join(OUT_DIR, `${recipe.name}.glb`);
            await writeFile(outPath, buf);
            totalBytes += buf.length;
            const ms = Date.now() - t0;
            console.log(
                `[OK] ${recipe.name}.glb  ${(buf.length / 1024).toFixed(1)} KB  ` +
                `${result.triangleCount} tris  height=${result.height.toFixed(3)}m  ${ms}ms`
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
