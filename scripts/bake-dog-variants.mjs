#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 91 Phase 6: dog animation dedup.
 *
 * The five dog GLBs each embed the identical clip set (~800 KB x5 of
 * duplicated keyframe data). Jep - the critical-loaded default dog - keeps
 * its animations and acts as the shared clip source; this script strips the
 * animations from the other four and re-compresses them, and the loader
 * (TerrainBuilder._loadAnimalModel) falls back to Jep's clips for any dog
 * GLB that ships without animations.
 *
 * Guard: before stripping anything, every dog's clip set is compared to
 * Jep's (clip names + per-clip channel target-path multiset). A mismatch
 * aborts, because then the clips are NOT interchangeable and the dedup
 * premise is wrong.
 *
 * Usage: node scripts/bake-dog-variants.mjs
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, prune, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS = join(resolve(__dirname, '..'), 'assets', 'models');

const SOURCE_DOG = 'Jep.glb';
const STRIP_DOGS = ['Pip.glb', 'Sally.glb', 'Shiloh.glb', 'George_Washington.glb'];

const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
        'draco3d.encoder': await draco3d.createEncoderModule(),
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
    });

function clipSignature(doc) {
    return doc.getRoot().listAnimations().map((anim) => ({
        name: anim.getName(),
        channels: anim.listChannels()
            .map((ch) => `${ch.getTargetNode()?.getName() ?? '?'}:${ch.getTargetPath()}`)
            .sort(),
    })).sort((a, b) => a.name.localeCompare(b.name));
}

const jepDoc = await io.read(join(MODELS, SOURCE_DOG));
const jepSig = JSON.stringify(clipSignature(jepDoc));
console.log(`[DOGS] ${SOURCE_DOG}: ${jepDoc.getRoot().listAnimations().length} clips (shared source)`);

for (const file of STRIP_DOGS) {
    const path = join(MODELS, file);
    const doc = await io.read(path);
    const sig = JSON.stringify(clipSignature(doc));
    if (sig !== jepSig) {
        console.error(`[DOGS] ABORT: ${file} clip set differs from ${SOURCE_DOG} - clips are not interchangeable.`);
        process.exit(1);
    }
    const before = (await io.writeBinary(doc)).byteLength;
    for (const anim of doc.getRoot().listAnimations()) {
        for (const ch of anim.listChannels()) ch.dispose();
        for (const s of anim.listSamplers()) s.dispose();
        anim.dispose();
    }
    await doc.transform(dedup(), weld(), prune(), draco({ encodeSpeed: 0, decodeSpeed: 5 }));
    const out = await io.writeBinary(doc);
    await writeFile(path, out);
    console.log(`[DOGS] ${file}: ${(before / 1024).toFixed(0)} KB -> ${(out.byteLength / 1024).toFixed(0)} KB (animations stripped; loader reuses ${SOURCE_DOG}'s clips)`);
}
console.log('[DOGS] done');
