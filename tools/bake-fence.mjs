#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 115 Phase 1: bake the fence kit from source.
 *
 * The kit had no authoring source of any kind. `Fence_Kit-v1.0.0.glb` arrived
 * as an opaque binary, which is why every ask in the cycle (a real chamfer,
 * vertex-colour weathering, rail sag) was blocked on the same missing thing:
 * you cannot re-cut a chamfer you never cut. This regenerates the kit from
 * `tools/bake-fence/kitPieces.mjs`.
 *
 * Follows `tools/bake-rocks.mjs`, which D10 names as the pattern: a tiny static
 * server hands `tools/bake-fence/bake.html` to a headless Chromium, three.js
 * `GLTFExporter` writes a binary GLB, and gltf-transform then applies the same
 * Draco + meshopt chain every other asset gets from `scripts/compress-glbs.mjs`.
 *
 * Two things happen here rather than in the browser:
 *
 *   1. The 32x4 `PaletteBaseColor` image is lifted VERBATIM out of the shipped
 *      kit and attached to the new one. Re-encoding those six flat colours
 *      through a canvas would change the bytes for no reason, and the whole
 *      point of commit 190847b6 was one shared texture across the kit.
 *   2. The silhouette is measured against the shipped kit and printed. Cycle
 *      115 Q2 froze it (2.18m post, rails at 0.5 / 1.2 / 1.9): moving it would
 *      move every placement in `js/StructureBuilder.js` and invalidate the
 *      entrance heroes. `--tolerance` fails the bake if it drifts.
 *
 * Output defaults to `assets/models/Fence_Kit-v2.0.0.glb`, ALONGSIDE the v1
 * kit rather than over it, so reverting is one constant in
 * `js/FencePresets.js`.
 *
 * Usage:
 *   node tools/bake-fence.mjs
 *   node tools/bake-fence.mjs --out=tools/asset-gallery/staging/fence/kit.glb --no-compress
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, meshopt, prune, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = Object.fromEntries(
    process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);

const OUT_REL = args.out ?? 'assets/models/Fence_Kit-v2.0.0.glb';
const OUT_PATH = resolve(ROOT, OUT_REL);
/** The kit whose palette image is reused and whose silhouette is the contract. */
const REFERENCE_REL = args.reference ?? 'assets/models/Fence_Kit-v1.0.0.glb';
const REFERENCE_PATH = resolve(ROOT, REFERENCE_REL);
const COMPRESS = args['no-compress'] !== true;
/** Metres of drift allowed on the silhouette before the bake refuses to write. */
const TOLERANCE = Number(args.tolerance ?? 0.02);

/**
 * The silhouette contract, measured off the shipped kit. `Fence_Post.height`
 * and `Fence_Rail.length` are the two numbers `js/StructureBuilder.js` and
 * `js/FencePresets.js` actually compute against; the footprints are here so a
 * re-authored post that fattens or shrinks its cross-section is caught too,
 * since `createFencePostJitter`'s lean cap is derived from them.
 */
const SILHOUETTE = {
    Fence_Post: { height: 2.1800, halfX: 0.2092, halfZ: 0.1990 },
    Fence_Rail: { height: 0.0992, halfX: 0.5000, halfZ: 0.0606 },
    Gate_Post: { height: 1.4303, halfX: 0.2089, halfZ: 0.2400 },
    Gate_Arch: { height: 2.2191, halfX: 0.6594, halfZ: 0.1456 },
};

// ---------------------------------------------------------------------
// Tiny static server (same pattern as bake-rocks.mjs / bake-trees.mjs).
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
            if (url === '/' || url === '/bake.html') url = '/tools/bake-fence/bake.html';
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
    return new Promise((res, rej) => {
        server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
        server.on('error', rej);
    });
}

// ---------------------------------------------------------------------

async function makeIO() {
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;
    return new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
            'draco3d.decoder': await draco3d.createDecoderModule(),
            'draco3d.encoder': await draco3d.createEncoderModule(),
            'meshopt.decoder': MeshoptDecoder,
            'meshopt.encoder': MeshoptEncoder,
        });
}

/**
 * Pull the shared palette image (and its sampler settings) out of a kit GLB.
 * NEAREST matters: the palette packs six colours into four-texel bands and any
 * filtering between them would bleed one hue into the next at a mip boundary.
 */
function readPalette(document) {
    const texture = document.getRoot().listTextures()
        .find((t) => t.getName() === 'PaletteBaseColor') ?? document.getRoot().listTextures()[0];
    if (!texture) throw new Error('reference kit has no palette texture');
    const material = document.getRoot().listMaterials()
        .find((m) => m.getBaseColorTexture() === texture);
    const info = material?.getBaseColorTextureInfo();
    return {
        name: texture.getName(),
        mimeType: texture.getMimeType(),
        image: texture.getImage(),
        size: texture.getSize(),
        minFilter: info?.getMinFilter() ?? 9728,
        magFilter: info?.getMagFilter() ?? 9728,
        wrapS: info?.getWrapS() ?? 10497,
        wrapT: info?.getWrapT() ?? 10497,
    };
}

/** Per-piece bbox + counts, keyed by the wrapper node name the runtime looks up. */
function measureKit(document) {
    const out = {};
    const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
    const visit = (node, wrapper) => {
        const name = node.getName();
        const owner = SILHOUETTE[name] ? name : wrapper;
        const mesh = node.getMesh?.();
        if (mesh && owner) {
            const entry = out[owner] ??= {
                min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity],
                vertices: 0, triangles: 0, attributes: new Set(),
            };
            const t = node.getTranslation();
            for (const prim of mesh.listPrimitives()) {
                for (const semantic of prim.listSemantics()) entry.attributes.add(semantic);
                const pos = prim.getAttribute('POSITION');
                const array = pos.getArray();
                for (let i = 0; i < pos.getCount(); i++) {
                    for (let k = 0; k < 3; k++) {
                        const v = array[i * 3 + k] + t[k];
                        if (v < entry.min[k]) entry.min[k] = v;
                        if (v > entry.max[k]) entry.max[k] = v;
                    }
                }
                entry.vertices += pos.getCount();
                entry.triangles += (prim.getIndices()?.getCount() ?? pos.getCount()) / 3;
            }
        }
        for (const child of node.listChildren()) visit(child, owner);
    };
    for (const node of scene.listChildren()) visit(node, null);
    return out;
}

async function main() {
    const io = await makeIO();

    if (!existsSync(REFERENCE_PATH)) {
        throw new Error(`reference kit not found: ${REFERENCE_REL}`);
    }
    const referenceDoc = await io.read(REFERENCE_PATH);
    const palette = readPalette(referenceDoc);
    const referenceKit = measureKit(referenceDoc);

    const { server, port } = await startServer();
    const url = `http://127.0.0.1:${port}/bake.html`;
    console.log(`[BAKE] static server on ${url}`);

    // Explicitly headless. Per .claude/rules/scene-and-render.md an automated
    // bake must never open a real browser window, and the finally below closes
    // the browser and the listener even when the bake throws.
    const browser = await chromium.launch({ headless: true });
    let bytes;
    let report;
    try {
        const page = await browser.newPage();
        page.on('pageerror', (err) => console.error('[PAGE ERROR]', err.message));
        page.on('console', (msg) => {
            const t = msg.type();
            if (t === 'error' || t === 'warning') console.log(`[PAGE ${t}]`, msg.text());
        });
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => window.__bakeReady === true, null, { timeout: 30000 });
        const result = await page.evaluate(async () => await window.__bakeFenceKit());
        bytes = Buffer.from(result.bytesB64, 'base64');
        report = result.report;
    } finally {
        await browser.close();
        server.close();
    }

    console.log(`[BAKE] exported ${(bytes.length / 1024).toFixed(1)} KB from the harness`);
    for (const piece of report) {
        console.log(
            `       ${piece.node.padEnd(11)} ${String(piece.triangles).padStart(4)} tris  ` +
            `${String(piece.vertices).padStart(4)} verts  palette bands [${piece.bands.join(', ')}]`
        );
    }

    // ---- attach the shared palette -------------------------------------
    const document = await io.readBinary(new Uint8Array(bytes));
    const material = document.getRoot().listMaterials()
        .find((m) => m.getName() === 'PaletteMaterial001') ?? document.getRoot().listMaterials()[0];
    if (!material) throw new Error('baked kit has no material');
    const texture = document.createTexture(palette.name)
        .setMimeType(palette.mimeType)
        .setImage(palette.image);
    material.setBaseColorTexture(texture);
    const info = material.getBaseColorTextureInfo();
    info.setMinFilter(palette.minFilter);
    info.setMagFilter(palette.magFilter);
    info.setWrapS(palette.wrapS);
    info.setWrapT(palette.wrapT);
    document.getRoot().getAsset().generator = 'tools/bake-fence.mjs';

    // ---- silhouette gate ------------------------------------------------
    const bakedKit = measureKit(document);
    let worst = 0;
    const rows = [];
    for (const [node, want] of Object.entries(SILHOUETTE)) {
        const got = bakedKit[node];
        if (!got) throw new Error(`baked kit is missing the ${node} wrapper node`);
        const have = {
            height: got.max[1] - got.min[1],
            halfX: Math.max(Math.abs(got.min[0]), Math.abs(got.max[0])),
            halfZ: Math.max(Math.abs(got.min[2]), Math.abs(got.max[2])),
        };
        const drift = {
            height: have.height - want.height,
            halfX: have.halfX - want.halfX,
            halfZ: have.halfZ - want.halfZ,
        };
        worst = Math.max(worst, ...Object.values(drift).map(Math.abs));
        const ref = referenceKit[node];
        rows.push(
            `       ${node.padEnd(11)} h ${have.height.toFixed(4)} (${drift.height >= 0 ? '+' : ''}${drift.height.toFixed(4)})  ` +
            `x ${have.halfX.toFixed(4)} (${drift.halfX >= 0 ? '+' : ''}${drift.halfX.toFixed(4)})  ` +
            `z ${have.halfZ.toFixed(4)} (${drift.halfZ >= 0 ? '+' : ''}${drift.halfZ.toFixed(4)})  ` +
            `tris ${Math.round(ref?.triangles ?? 0)} -> ${Math.round(got.triangles)}  ` +
            `[${[...got.attributes].sort().join(' ')}]`
        );
    }
    console.log('[BAKE] silhouette vs the shipped kit (drift in metres):');
    for (const row of rows) console.log(row);

    if (worst > TOLERANCE) {
        throw new Error(
            `silhouette drifted ${worst.toFixed(4)}m, over the ${TOLERANCE}m tolerance. ` +
            'Cycle 115 Q2 froze it: moving it moves every placement in js/StructureBuilder.js ' +
            'and invalidates the entrance heroes. Stop and surface before widening this.'
        );
    }

    const missingColor = Object.entries(bakedKit)
        .filter(([, m]) => !m.attributes.has('COLOR_0'))
        .map(([node]) => node);
    if (missingColor.length) {
        throw new Error(`no COLOR_0 on: ${missingColor.join(', ')}. Phase 2 weathering needs the channel on every mesh.`);
    }

    // ---- write ----------------------------------------------------------
    await mkdir(dirname(OUT_PATH), { recursive: true });

    // The pristine, uncompressed document is the backup `scripts/compress-glbs.mjs`
    // reads from. Writing it here means that script sees an already-compressed
    // live file (under its 70% skip threshold) and leaves this kit alone rather
    // than re-deriving it from a file it did not produce.
    const rawBytes = Buffer.from(await io.writeBinary(document));
    const backupPath = resolve(ROOT, 'assets/_originals', relative(resolve(ROOT, 'assets'), OUT_PATH));
    if (OUT_PATH.startsWith(resolve(ROOT, 'assets'))) {
        await mkdir(dirname(backupPath), { recursive: true });
        await writeFile(backupPath, rawBytes);
    }

    let finalBytes = rawBytes;
    if (COMPRESS) {
        await document.transform(
            dedup(), weld(), prune(),
            // Same knobs as scripts/compress-glbs.mjs, so the kit lands on the
            // same decoder path as every other asset the loader already handles.
            draco({ method: 'edgebreaker', encodeSpeed: 0, decodeSpeed: 5 }),
            meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
        );
        finalBytes = Buffer.from(await io.writeBinary(document));
    }
    await writeFile(OUT_PATH, finalBytes);

    const referenceBytes = (await readFile(REFERENCE_PATH)).length;
    console.log(
        `[BAKE] ${OUT_REL}  ${(finalBytes.length / 1024).toFixed(1)} KB` +
        `${COMPRESS ? ` (raw ${(rawBytes.length / 1024).toFixed(1)} KB)` : ''}` +
        `  vs shipped ${(referenceBytes / 1024).toFixed(1)} KB`
    );
    console.log(`[BAKE] palette reused verbatim: ${palette.size?.join('x')} ${palette.mimeType}, ${palette.image.byteLength} bytes`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
