// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 98 - encode the LIVE tree-impostor atlases to UASTC .ktx2.
 *
 * A PNG -> KTX2 post-process over the committed Kiln atlases. It does NOT
 * re-render: it reuses the bake matrix exported by bake-tree-impostors.mjs
 * (enabledImpostorTargets) so the two never drift, filters to the live
 * latlon-hemi-y layout (the octahedral set is dead in prod), and encodes each
 * atlas to UASTC + zstd via the dependency-free ktx2-encoder wasm - no native
 * toktx / KTX-Software install needed. PNG decode is via sharp (already a devDep).
 *
 * Per map:
 *   - albedo  -> UASTC + zstd, perceptual / sRGB transfer (alpha preserved)
 *   - normal  -> UASTC + zstd, linear (faithful RGB; NOT normal-map mode - the
 *                atlas stores capture-view-space RGB, not a tangent normal)
 *   - depth   -> UASTC + zstd, linear
 *
 * No mipmaps (atlas tiles are distinct azimuth/elevation views; mips glint
 * across borders). Y-flipped at encode so the KTX2 (compressed, flipY ignored
 * at upload) samples like the old flipY=true PNG upload the impostor UVs assume.
 *
 * Output: <base>.imposter.ktx2 / .imposter.normal.ktx2 / .imposter.depth.ktx2
 * beside the PNGs (PNGs stay in source for regen / diagnostics / fallback).
 *
 * Run: npm run encode-impostors-ktx2
 */

import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadManifest, enabledImpostorTargets } from './bake-tree-impostors.mjs';

// Production render layout; the octahedral layout is lab-gated, not loaded in prod.
const LIVE_LAYOUT = 'latlon-hemi-y';

// sharp PNG -> top-down RGBA raster (basis wants R,G,B,A, first texel top-left).
const imageDecoder = async (buffer) => {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8Array(data) };
};

const BASE = {
    isUASTC: true,
    isKTX2File: true,
    needSupercompression: true,  // zstd on the UASTC payload (the wire/dist win)
    uastcLDRQualityLevel: 3,     // 0-3, max LDR quality (this encode is quality-sensitive)
    generateMipmap: false,       // atlas tiles are distinct views; mips glint
    isYFlip: true,               // match three's flipY=true PNG convention
    imageDecoder,
};
const COLOR = { ...BASE, isPerceptual: true, isSetKTX2SRGBTransferFunc: true };
const DATA = { ...BASE, isPerceptual: false, isSetKTX2SRGBTransferFunc: false };

const MAPS = [
    { suffix: '', opts: COLOR },
    { suffix: '.normal', opts: DATA },
    { suffix: '.depth', opts: DATA },
];

async function encodeMap(pngPath, ktx2Path, opts) {
    const png = new Uint8Array(readFileSync(pngPath));
    const ktx2 = await encodeToKTX2(png, opts);
    writeFileSync(ktx2Path, ktx2);
    return { inBytes: png.length, outBytes: ktx2.length };
}

async function main() {
    const manifest = loadManifest();
    const targets = [...enabledImpostorTargets(manifest)].filter((t) => t.layoutId === LIVE_LAYOUT);
    if (targets.length === 0) throw new Error(`no live (${LIVE_LAYOUT}) impostor targets in manifest`);

    let totalIn = 0, totalOut = 0, count = 0;
    for (const t of targets) {
        // atlasPath is an absolute <id>.imposter.png; base drops the .png.
        const base = t.atlasPath.replace(/\.png$/, '');
        for (const { suffix, opts } of MAPS) {
            const pngPath = `${base}${suffix}.png`;
            const ktx2Path = `${base}${suffix}.ktx2`;
            if (!existsSync(pngPath)) {
                console.warn(`[ktx2] skip missing ${pngPath}`);
                continue;
            }
            const { inBytes, outBytes } = await encodeMap(pngPath, ktx2Path, opts);
            totalIn += inBytes;
            totalOut += outBytes;
            count++;
            console.log(`[ktx2] ${t.obj.id}${suffix || ' (albedo)'}  ${(inBytes / 1024).toFixed(0)} KB png -> ${(outBytes / 1024).toFixed(0)} KB ktx2`);
        }
    }
    console.log(`\n[ktx2] ${count} atlases: ${(totalIn / 1048576).toFixed(2)} MB png -> ${(totalOut / 1048576).toFixed(2)} MB ktx2 (${(100 * totalOut / totalIn).toFixed(0)}% of png)`);
}

main().catch((err) => {
    console.error('[ktx2] FAILED:', err);
    process.exit(1);
});
