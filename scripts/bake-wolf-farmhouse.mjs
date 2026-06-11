#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 91 Phase 6 (item 3):
 * - Wolf.glb ships every clip twice (bare + "AnimalArmature|"-prefixed -
 *   12 of 24 are exact duplicates). Wolf.js resolves bare names first and
 *   only tolerates the prefix as a fallback, so the prefixed set strips
 *   clean.
 * - "Farm house.glb" carries textures far larger than its on-screen
 *   footprint warrants; cap at 1024.
 *
 * Usage: node scripts/bake-wolf-farmhouse.mjs
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, prune, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS = join(resolve(__dirname, '..'), 'assets', 'models');

const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
        'draco3d.encoder': await draco3d.createEncoderModule(),
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
    });

// Wolf: strip the prefixed duplicate clip set.
{
    const path = join(MODELS, 'Wolf.glb');
    const doc = await io.read(path);
    const before = (await io.writeBinary(doc)).byteLength;
    let stripped = 0;
    for (const anim of doc.getRoot().listAnimations()) {
        if (!anim.getName().startsWith('AnimalArmature|')) continue;
        for (const ch of anim.listChannels()) ch.dispose();
        for (const s of anim.listSamplers()) s.dispose();
        anim.dispose();
        stripped++;
    }
    await doc.transform(dedup(), weld(), prune(), draco({ encodeSpeed: 0, decodeSpeed: 5 }));
    const out = await io.writeBinary(doc);
    await writeFile(path, out);
    console.log(`[WOLF] stripped ${stripped} duplicate clips: ${(before / 1024).toFixed(0)} KB -> ${(out.byteLength / 1024).toFixed(0)} KB`);
}

// Farm house: 1024 texture cap.
{
    const path = join(MODELS, 'Farm house.glb');
    const doc = await io.read(path);
    const before = (await io.writeBinary(doc)).byteLength;
    await doc.transform(
        textureCompress({ encoder: sharp, resize: [1024, 1024] }),
        dedup(),
        prune(),
    );
    const out = await io.writeBinary(doc);
    await writeFile(path, out);
    console.log(`[FARMHOUSE] 1024 texture cap: ${(before / 1024).toFixed(0)} KB -> ${(out.byteLength / 1024).toFixed(0)} KB`);
}
console.log('[BAKE] done');
