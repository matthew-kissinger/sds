#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 91 Phase 7: wolf vertex-color gradient. The night antagonist is a
 * handful of flat material colors and reads as a uniform dark mass; bake a
 * bind-pose-Y gradient into COLOR_0 (GLTFLoader auto-enables vertexColors)
 * so the spine reads as warm grizzled fur and the belly/legs fall into
 * cooler shadow. Survey-gated: revert the GLB from assets/_originals if it
 * reads worse.
 *
 * Usage: node scripts/bake-wolf-gradient.mjs
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH = join(resolve(__dirname, '..'), 'assets', 'models', 'Wolf.glb');

// Bottom (belly/paws) and top (spine/head) multipliers - fur-like; COLOR_0
// is a float accessor so the top side may exceed 1 (it multiplies a dark
// base). First pass (0.74/1.0) read near-invisible at harness distance.
const BOTTOM = [0.58, 0.58, 0.66];
const TOP = [1.14, 1.07, 0.96];

const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
        'draco3d.encoder': await draco3d.createEncoderModule(),
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
    });

const doc = await io.read(PATH);
const root = doc.getRoot();

// The wolf's bind pose lies the body along +Y with HEIGHT on the Z axis
// (X span ~0.011 = width, Y ~0.055 = length, Z ~0.027 = height; the node
// transform re-orients at load). Gradient runs along bind-pose Z.
const AXIS = 2;
let minA = Infinity;
let maxA = -Infinity;
for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const el = [];
        for (let i = 0; i < pos.getCount(); i++) {
            pos.getElement(i, el);
            if (el[AXIS] < minA) minA = el[AXIS];
            if (el[AXIS] > maxA) maxA = el[AXIS];
        }
    }
}
const span = Math.max(maxA - minA, 1e-6);
console.log(`[WOLF] bind-pose axis-${AXIS} range ${minA.toFixed(3)}..${maxA.toFixed(3)}`);

const buffer = root.listBuffers()[0];
let primCount = 0;
for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const count = pos.getCount();
        const colors = new Float32Array(count * 3);
        const el = [];
        for (let i = 0; i < count; i++) {
            pos.getElement(i, el);
            // Smoothstep the gradient so the midline transition is soft.
            let t = (el[AXIS] - minA) / span;
            t = t * t * (3 - 2 * t);
            colors[i * 3] = BOTTOM[0] + (TOP[0] - BOTTOM[0]) * t;
            colors[i * 3 + 1] = BOTTOM[1] + (TOP[1] - BOTTOM[1]) * t;
            colors[i * 3 + 2] = BOTTOM[2] + (TOP[2] - BOTTOM[2]) * t;
        }
        const accessor = doc.createAccessor()
            .setType('VEC3')
            .setArray(colors)
            .setBuffer(buffer);
        prim.setAttribute('COLOR_0', accessor);
        primCount++;
    }
}
const out = await io.writeBinary(doc);
await writeFile(PATH, out);
console.log(`[WOLF] COLOR_0 gradient baked into ${primCount} primitives -> ${(out.byteLength / 1024).toFixed(0)} KB`);
