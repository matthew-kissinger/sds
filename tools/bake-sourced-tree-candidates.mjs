// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Deterministically extract complete wood and foliage from exact CC0 source assets. */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(repo, 'assets/treeline/sources');

function extractTriangles(mesh, materialName) {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const matching = geometry.groups.filter((group) => (
    materials[group.materialIndex]?.name.toLowerCase().includes(materialName)
  ));
  const spans = matching.length > 0 ? matching : [{ start: 0, count: geometry.index?.count ?? positions.count }];
  const outputPositions = [];
  const outputNormals = [];
  for (const span of spans) {
    for (let offset = span.start; offset < span.start + span.count; offset++) {
      const vertex = geometry.index?.getX(offset) ?? offset;
      outputPositions.push(positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex));
      outputNormals.push(normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex));
    }
  }
  geometry.dispose();
  return { positions: outputPositions, normals: outputNormals };
}

function normalizePair(foliage, wood) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const data of [foliage, wood]) {
    for (let index = 0; index < data.positions.length; index += 3) {
      minX = Math.min(minX, data.positions[index]); maxX = Math.max(maxX, data.positions[index]);
      minY = Math.min(minY, data.positions[index + 1]); maxY = Math.max(maxY, data.positions[index + 1]);
      minZ = Math.min(minZ, data.positions[index + 2]); maxZ = Math.max(maxZ, data.positions[index + 2]);
    }
  }
  const width = maxX - minX; const height = maxY - minY; const depth = maxZ - minZ;
  for (const data of [foliage, wood]) {
    for (let index = 0; index < data.positions.length; index += 3) {
      data.positions[index] = (data.positions[index] - (minX + maxX) * 0.5) / width;
      data.positions[index + 1] = (data.positions[index + 1] - minY) / height;
      data.positions[index + 2] = (data.positions[index + 2] - (minZ + maxZ) * 0.5) / depth;
    }
  }
  return {
    foliage: { ...foliage, triangles: foliage.positions.length / 9 },
    wood: { ...wood, triangles: wood.positions.length / 9 },
    sourceBounds: { width, height, depth },
  };
}

function loadFoxTree(filename, foliageTuck = 0) {
  const scene = new OBJLoader().parse(readFileSync(resolve(sourceDir, filename), 'utf8'));
  let leaves;
  let wood;
  scene.traverse((object) => {
    if (!object.isMesh) return;
    if (object.name.includes('leaves')) leaves = object;
    if (object.name.includes('trunk')) wood = object;
  });
  if (!leaves || !wood) throw new Error(`Fox source groups not found in ${filename}`);
  const normalized = normalizePair(
    extractTriangles(leaves, 'green'),
    extractTriangles(wood, 'bark'),
  );
  // A restrained 2.5% downward tuck hides the spreading source's exposed
  // central junction without changing its authored crown outline or wood.
  for (let index = 1; index < normalized.foliage.positions.length; index += 3) {
    normalized.foliage.positions[index] -= foliageTuck;
  }
  return normalized;
}

const spreading = loadFoxTree('fox-tree-spreading.obj', 0.05);
const round = loadFoxTree('fox-tree-round.obj', 0.075);

const candidates = [
  ['fox-broad-spreading', spreading, {
    author: 'mehrasaur', source: 'assets/treeline/sources/fox-tree-spreading.obj',
    url: 'https://opengameart.org/content/fox-trees-pack', license: 'CC0-1.0',
    sha256: 'e1fb728c393a53c55b226df6ab434f8891bf517790a24712514ea145e6564441',
  }],
  ['fox-natural-round', round, {
    author: 'mehrasaur', source: 'assets/treeline/sources/fox-tree-round.obj',
    url: 'https://opengameart.org/content/fox-trees-pack', license: 'CC0-1.0',
    sha256: '0185db4da9db2752de368af457044079e2185761bd687e02a177a3a7df20f81d',
  }],
];
for (const [id, geometry, provenance] of candidates) {
  writeFileSync(
    resolve(repo, `assets/treeline/${id}.json`),
    `${JSON.stringify({ version: 1, id, provenance, geometry })}\n`,
  );
  console.log(`${id}: ${geometry.foliage.triangles} foliage + ${geometry.wood.triangles} wood triangles, ${JSON.stringify(geometry.sourceBounds)}`);
}
