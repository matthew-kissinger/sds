// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Three.js-based GLB inspector. Unlike the gltf-transform-based version,
 * this dequantizes meshopt-compressed positions before reading bbox so
 * the values are actual world-space metres.
 *
 * Usage: node tools/inspect-glb-three.mjs <path1.glb> [<path2.glb> ...]
 */
// Polyfill browser globals GLTFLoader needs.
globalThis.self = globalThis;
if (typeof globalThis.ProgressEvent === 'undefined') {
    globalThis.ProgressEvent = class ProgressEvent extends Event {
        constructor(type, init) { super(type, init); Object.assign(this, init); }
    };
}
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);

for (const path of process.argv.slice(2)) {
    const abs = resolve(path);
    const buf = await readFile(abs);
    // ArrayBuffer view that GLTFLoader.parse expects.
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const gltf = await new Promise((res, rej) => {
        loader.parse(ab, '', res, rej);
    });
    console.log(`\n=== ${path} ===`);
    const bbox = new THREE.Box3();
    bbox.makeEmpty();
    let totalTris = 0;
    let meshCount = 0;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        meshCount++;
        const mb = new THREE.Box3().setFromBufferAttribute(child.geometry.attributes.position);
        const mbWorld = mb.clone().applyMatrix4(child.matrixWorld);
        bbox.union(mbWorld);
        const idx = child.geometry.index;
        const tris = idx ? idx.count / 3 : child.geometry.attributes.position.count / 3;
        totalTris += tris;
        console.log(
            `  mesh "${child.name || '(unnamed)'}"`,
            `verts=${child.geometry.attributes.position.count}`,
            `tris=${Math.round(tris)}`,
            `bbox y=[${mbWorld.min.y.toFixed(3)}, ${mbWorld.max.y.toFixed(3)}]`
        );
    });
    const span = (a, b) => (b - a).toFixed(3);
    console.log(
        `  scene bbox  ` +
        `x=[${bbox.min.x.toFixed(3)}, ${bbox.max.x.toFixed(3)}] (span ${span(bbox.min.x, bbox.max.x)}m)  ` +
        `y=[${bbox.min.y.toFixed(3)}, ${bbox.max.y.toFixed(3)}] (span ${span(bbox.min.y, bbox.max.y)}m)  ` +
        `z=[${bbox.min.z.toFixed(3)}, ${bbox.max.z.toFixed(3)}] (span ${span(bbox.min.z, bbox.max.z)}m)`
    );
    console.log(`  total: ${meshCount} mesh(es), ~${Math.round(totalTris)} tris`);
    if (bbox.min.y > -0.01) console.log('  pivot: at base (y=0 bottom — good)');
    else if (Math.abs(Math.abs(bbox.min.y) - Math.abs(bbox.max.y)) < 0.05 * Math.max(Math.abs(bbox.min.y), Math.abs(bbox.max.y))) {
        console.log('  pivot: at centroid (need bbox compensation at load)');
    } else {
        console.log('  pivot: offset (need bbox compensation at load)');
    }
}

process.exit(0);
