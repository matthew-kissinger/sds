#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 38 mobile tree-budget bake.
 *
 * Production tree GLBs must be author-time assets with known geometry budgets:
 * tree1 LOD0 <= 4k tris, tree2 LOD0 <= 8k tris, and LOD1 <= 25% of LOD0.
 * This bake is deterministic and writes runtime GLBs under assets/models/trees.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, draco, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const ORIGINALS = join(ROOT, 'assets', '_originals', 'models', 'trees');
const RUNTIME = join(ROOT, 'assets', 'models', 'trees');
const PICKS_PATH = join(ROOT, 'tools', 'asset-gallery', 'picks.json');
const REPORT_PATH = join(ROOT, 'cycle38-validation', 'assets', 'mobile-tree-budget-bake.json');

const TREE_BAKES = Object.freeze({
    tree1: { lod0Ratio: 0.65, lod1Ratio: 0.45, lod0Budget: 4000 },
    tree2: { lod0Ratio: 0.42, lod1Ratio: 0.35, lod0Budget: 8000 },
});

async function makeIO() {
    await MeshoptEncoder.ready;
    await MeshoptDecoder.ready;
    await MeshoptSimplifier.ready;
    return new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
            'draco3d.decoder': await draco3d.createDecoderModule(),
            'draco3d.encoder': await draco3d.createEncoderModule(),
            'meshopt.decoder': MeshoptDecoder,
            'meshopt.encoder': MeshoptEncoder,
        });
}

function sourcePath(name) {
    const original = join(ORIGINALS, `${name}.glb`);
    return existsSync(original) ? original : join(RUNTIME, `${name}.glb`);
}

function countTriangles(document) {
    const byMaterial = {};
    let total = 0;
    let verts = 0;
    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const indices = primitive.getIndices();
            const position = primitive.getAttribute('POSITION');
            const tris = indices ? indices.getCount() / 3 : 0;
            const mat = primitive.getMaterial()?.getName() || 'unmaterialed';
            byMaterial[mat] = (byMaterial[mat] ?? 0) + tris;
            total += tris;
            verts += position?.getCount?.() ?? 0;
        }
    }
    return { total, verts, byMaterial };
}

function cardScore(cardIndex, indexArray, position) {
    const tmp = [];
    let x = 0;
    let y = 0;
    let z = 0;
    const unique = new Set();
    for (let i = 0; i < 6; i++) unique.add(indexArray[cardIndex * 6 + i]);
    for (const vertexIndex of unique) {
        position.getElement(vertexIndex, tmp);
        x += tmp[0] ?? 0;
        y += tmp[1] ?? 0;
        z += tmp[2] ?? 0;
    }
    const inv = 1 / Math.max(1, unique.size);
    const seed = (x * inv) * 12.9898 + (y * inv) * 78.233 + (z * inv) * 37.719 + cardIndex * 0.137;
    return Math.sin(seed) * 43758.5453 - Math.floor(Math.sin(seed) * 43758.5453);
}

function decimateLeafPrimitive(document, primitive, keepFraction) {
    const indices = primitive.getIndices();
    const position = primitive.getAttribute('POSITION');
    if (!indices || !position || keepFraction >= 0.999) return;

    const indexArray = indices.getArray();
    const cardSize = 6;
    const cardCount = Math.floor(indexArray.length / cardSize);
    if (cardCount <= 0) return;

    const keepCount = Math.max(1, Math.min(cardCount, Math.floor(cardCount * keepFraction)));
    const keepCards = Array.from({ length: cardCount }, (_, index) => ({
        index,
        score: cardScore(index, indexArray, position),
    }))
        .sort((a, b) => a.score - b.score)
        .slice(0, keepCount)
        .sort((a, b) => a.index - b.index);

    const next = new indexArray.constructor(keepCards.length * cardSize);
    let cursor = 0;
    for (const card of keepCards) {
        for (let i = 0; i < cardSize; i++) {
            next[cursor++] = indexArray[card.index * cardSize + i];
        }
    }

    const accessor = document.createAccessor(`${indices.getName() || 'leaf_indices'}_mobile`)
        .setArray(next)
        .setType('SCALAR')
        .setBuffer(indices.getBuffer() ?? position.getBuffer());
    primitive.setIndices(accessor);
    compactPrimitive(primitive);
}

function decimateLeavesToBudget(document, maxTriangles) {
    const before = countTriangles(document);
    const leafPrimitives = [];
    let nonLeafTriangles = 0;
    let leafTriangles = 0;

    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const tris = primitive.getIndices()?.getCount?.() ? primitive.getIndices().getCount() / 3 : 0;
            const materialName = primitive.getMaterial()?.getName() || '';
            if (/leaves/i.test(materialName)) {
                leafPrimitives.push(primitive);
                leafTriangles += tris;
            } else {
                nonLeafTriangles += tris;
            }
        }
    }

    const leafBudget = Math.max(0, maxTriangles - nonLeafTriangles);
    const keepFraction = leafTriangles > 0 ? Math.min(1, leafBudget / leafTriangles) : 1;
    for (const primitive of leafPrimitives) decimateLeafPrimitive(document, primitive, keepFraction);

    return {
        before,
        after: countTriangles(document),
        leafBudget,
        keepFraction,
    };
}

async function bakeDocument(io, name, ratio) {
    const document = await io.read(sourcePath(name));
    await document.transform(
        dedup(),
        weld(),
        simplify({
            simplifier: MeshoptSimplifier,
            ratio,
            error: 0.05,
            lockBorder: false,
        }),
        prune(),
    );
    return document;
}

async function writeRuntime(io, document, filename) {
    const runtimePath = join(RUNTIME, filename);
    await mkdir(dirname(runtimePath), { recursive: true });

    const originalBytes = await io.writeBinary(document);
    const compressedDocument = await io.readBinary(originalBytes);
    await compressedDocument.transform(
        dedup(),
        weld(),
        prune(),
        draco({ method: 'edgebreaker', encodeSpeed: 0, decodeSpeed: 5 }),
        meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    const runtimeBytes = await io.writeBinary(compressedDocument);
    await writeFile(runtimePath, runtimeBytes);

    const runtimeDocument = await io.read(runtimePath);
    return {
        runtimePath,
        intermediateBytes: originalBytes.length,
        runtimeBytes: runtimeBytes.length,
        runtimeTriangles: countTriangles(runtimeDocument),
    };
}

async function updatePicks(report) {
    const picksDoc = JSON.parse(await readFile(PICKS_PATH, 'utf8'));
    for (const pick of picksDoc.picks) {
        const baked = report.assets[pick.canonicalName];
        if (!baked) continue;
        pick.tris = baked.runtimeTriangles.total;
        if (pick.canonicalName === 'tree1.glb') {
            pick._role = `slim pasture silhouette (${baked.runtimeTriangles.total} tris mobile LOD0)`;
        } else if (pick.canonicalName === 'tree2.glb') {
            pick._role = `broad canopy anchor (${baked.runtimeTriangles.total} tris mobile LOD0)`;
        } else if (pick.canonicalName.endsWith('_lod1.glb')) {
            pick._role = `mobile LOD1 sibling (${baked.runtimeTriangles.total} tris, <=25% of paired LOD0)`;
        }
    }
    await writeFile(PICKS_PATH, `${JSON.stringify(picksDoc, null, 2)}\n`, 'utf8');
}

async function main() {
    const io = await makeIO();
    const report = {
        capturedAt: new Date().toISOString(),
        budgets: TREE_BAKES,
        assets: {},
    };

    for (const [name, config] of Object.entries(TREE_BAKES)) {
        const lod0Document = await bakeDocument(io, name, config.lod0Ratio);
        const lod0Metrics = countTriangles(lod0Document);
        if (lod0Metrics.total > config.lod0Budget) {
            throw new Error(`${name}.glb exceeds LOD0 budget: ${lod0Metrics.total} > ${config.lod0Budget}`);
        }
        report.assets[`${name}.glb`] = {
            config: { ratio: config.lod0Ratio, budget: config.lod0Budget },
            source: sourcePath(name),
            ...await writeRuntime(io, lod0Document, `${name}.glb`),
        };

        const lod1Budget = Math.floor(lod0Metrics.total * 0.25);
        const lod1Document = await bakeDocument(io, name, config.lod1Ratio);
        const decimation = decimateLeavesToBudget(lod1Document, lod1Budget);
        const lod1Metrics = countTriangles(lod1Document);
        if (lod1Metrics.total > lod1Budget) {
            throw new Error(`${name}_lod1.glb exceeds 25% LOD1 budget: ${lod1Metrics.total} > ${lod1Budget}`);
        }
        report.assets[`${name}_lod1.glb`] = {
            config: { ratio: config.lod1Ratio, budget: lod1Budget },
            source: sourcePath(name),
            decimation,
            ...await writeRuntime(io, lod1Document, `${name}_lod1.glb`),
        };
    }

    await updatePicks(report);
    await mkdir(dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    for (const [filename, asset] of Object.entries(report.assets)) {
        const size = existsSync(asset.runtimePath) ? statSync(asset.runtimePath).size : asset.runtimeBytes;
        console.log(`${filename}: ${asset.runtimeTriangles.total} tris, ${(size / 1024).toFixed(1)} KB`);
    }
    console.log(`Report -> ${REPORT_PATH}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
