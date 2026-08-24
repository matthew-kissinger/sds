// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Deterministically adapt exact CC0 Fox source shells into one Herd tree family. */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const filename = fileURLToPath(import.meta.url);
const repo = resolve(dirname(filename), '..');
const sourceDir = resolve(repo, 'assets/treeline/sources');

const BALANCED_LOBES = [
  { x: -0.205, y: -0.035, z: 0.025, sx: 0.66, sy: 0.72, sz: 0.78, yaw: -0.08, under: 0.03 },
  { x: -0.015, y: 0.02, z: -0.04, sx: 0.76, sy: 0.92, sz: 0.84, yaw: 0.035, under: 0.09 },
  { x: 0.205, y: -0.015, z: 0.015, sx: 0.62, sy: 0.75, sz: 0.76, yaw: 0.1, under: 0.04 },
];

function adjusted(changes) {
  return BALANCED_LOBES.map((lobe, index) => ({ ...lobe, ...(changes[index] ?? {}) }));
}

export const FOX_HYBRID_RECIPE = {
  id: 'fox-hybrid-family',
  style: 'Fox Hybrid',
  foliageSource: 'fox-tree-spreading.obj',
  woodSource: 'fox-tree-round.obj',
  foliageTuck: 0.05,
  provenance: {
    author: 'mehrasaur',
    url: 'https://opengameart.org/content/fox-trees-pack',
    license: 'CC0-1.0',
    foliageSource: 'assets/treeline/sources/fox-tree-spreading.obj',
    foliageSha256: 'e1fb728c393a53c55b226df6ab434f8891bf517790a24712514ea145e6564441',
    woodSource: 'assets/treeline/sources/fox-tree-round.obj',
    woodSha256: '0185db4da9db2752de368af457044079e2185761bd687e02a177a3a7df20f81d',
  },
  variants: [
    {
      seed: 44191,
      name: 'broad pastoral',
      widthScale: 1.06,
      heightScale: 0.94,
      lobes: adjusted({
        0: { x: -0.23, y: -0.05, sx: 0.68, sy: 0.68 },
        1: { x: -0.005, y: 0, sx: 0.78, sy: 0.9, under: 0.09 },
        2: { x: 0.235, y: -0.025, sx: 0.65, sy: 0.7 },
      }),
      wood: { bendX: -0.035, bendZ: 0.01 },
    },
    {
      seed: 57203,
      name: 'balanced hero',
      widthScale: 1,
      heightScale: 1,
      lobes: BALANCED_LOBES,
      wood: { bendX: -0.018, bendZ: 0.012 },
    },
    {
      seed: 68417,
      name: 'compact high crown',
      widthScale: 0.91,
      heightScale: 1.05,
      lobes: adjusted({
        0: { x: -0.17, y: 0.005, sx: 0.62, sy: 0.76 },
        1: { x: -0.03, y: 0.035, sx: 0.72, sy: 0.96, under: 0.1 },
        2: { x: 0.17, y: -0.005, sx: 0.58, sy: 0.73 },
      }),
      wood: { bendX: 0.022, bendZ: -0.012 },
    },
  ],
};

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
  return { foliage, wood, sourceBounds: { width, height, depth } };
}

function loadTree(source) {
  const scene = new OBJLoader().parse(readFileSync(resolve(sourceDir, source), 'utf8'));
  let leaves;
  let wood;
  scene.traverse((object) => {
    if (!object.isMesh) return;
    if (object.name.includes('leaves')) leaves = object;
    if (object.name.includes('trunk')) wood = object;
  });
  if (!leaves || !wood) throw new Error(`Fox source groups not found in ${source}`);
  return normalizePair(extractTriangles(leaves, 'green'), extractTriangles(wood, 'bark'));
}

function adaptFoliage(source, variant) {
  const ys = source.positions.filter((_, index) => index % 3 === 1);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pivotY = (minY + maxY) * 0.5;
  const positions = [];
  const normals = [];
  const parts = [];
  for (let part = 0; part < variant.lobes.length; part++) {
    const lobe = variant.lobes[part];
    const cosine = Math.cos(lobe.yaw); const sine = Math.sin(lobe.yaw);
    for (let index = 0; index < source.positions.length; index += 3) {
      const sourceX = source.positions[index];
      const sourceY = source.positions[index + 1];
      const sourceZ = source.positions[index + 2];
      const underside = Math.max(0, Math.min(1, (pivotY - sourceY) / Math.max(0.001, pivotY - minY)));
      const scaledX = sourceX * lobe.sx;
      const scaledZ = sourceZ * lobe.sz;
      const x = (scaledX * cosine - scaledZ * sine + lobe.x) * variant.widthScale;
      let y = (pivotY + (sourceY - pivotY) * lobe.sy + lobe.y - underside * lobe.under)
        * variant.heightScale;
      const z = scaledX * sine + scaledZ * cosine + lobe.z;
      if (part === 1) {
        const localX = Math.min(1, Math.abs(x - lobe.x * variant.widthScale)
          / Math.max(0.001, lobe.sx * variant.widthScale * 0.5));
        const roundedFloor = (0.305 + localX * localX * 0.055) * variant.heightScale;
        y = Math.max(y, roundedFloor);
      }
      positions.push(x, y, z);
      const nx = x - lobe.x * variant.widthScale;
      const ny = (y - (pivotY + lobe.y) * variant.heightScale) * 1.1;
      const nz = z - lobe.z;
      const length = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / length, ny / length, nz / length);
      parts.push(part);
    }
  }
  return { positions, normals, parts, triangles: positions.length / 9 };
}

function faceNormals(positions) {
  const normals = [];
  for (let index = 0; index < positions.length; index += 9) {
    const ax = positions[index + 3] - positions[index];
    const ay = positions[index + 4] - positions[index + 1];
    const az = positions[index + 5] - positions[index + 2];
    const bx = positions[index + 6] - positions[index];
    const by = positions[index + 7] - positions[index + 1];
    const bz = positions[index + 8] - positions[index + 2];
    const nx = ay * bz - az * by; const ny = az * bx - ax * bz; const nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz) || 1;
    for (let vertex = 0; vertex < 3; vertex++) normals.push(nx / length, ny / length, nz / length);
  }
  return normals;
}

function adaptWood(source, variant) {
  const maxY = Math.max(...source.positions.filter((_, index) => index % 3 === 1));
  const positions = [];
  for (let index = 0; index < source.positions.length; index += 3) {
    const originalY = source.positions[index + 1];
    const height = Math.max(0, Math.min(1, originalY / maxY));
    const atGround = Math.max(0, Math.min(1, 1 - originalY / 0.14));
    const upper = height * height * (3 - 2 * height);
    const contract = 1 - atGround * 0.58;
    positions.push(
      source.positions[index] * contract + variant.wood.bendX * upper,
      Math.max(0, originalY - atGround * 0.02),
      source.positions[index + 2] * contract + variant.wood.bendZ * upper,
    );
  }
  return { positions, normals: faceNormals(positions), triangles: positions.length / 9 };
}

export function buildFoxHybrid(variantIndex = 1) {
  const spreading = loadTree(FOX_HYBRID_RECIPE.foliageSource);
  const round = loadTree(FOX_HYBRID_RECIPE.woodSource);
  for (let index = 1; index < spreading.foliage.positions.length; index += 3) {
    spreading.foliage.positions[index] -= FOX_HYBRID_RECIPE.foliageTuck;
  }
  const variant = FOX_HYBRID_RECIPE.variants[variantIndex];
  if (!variant) throw new Error(`Fox hybrid has no variant ${variantIndex}`);
  return {
    foliage: adaptFoliage(spreading.foliage, variant),
    wood: adaptWood(round.wood, variant),
    sourceBounds: { foliage: spreading.sourceBounds, wood: round.sourceBounds },
    adaptation: {
      version: 3,
      seed: variant.seed,
      name: variant.name,
      lobeCount: variant.lobes.length,
      widthScale: variant.widthScale,
      heightScale: variant.heightScale,
      lobeTransforms: variant.lobes,
      wood: variant.wood,
      groundFlareContraction: 0.58,
    },
  };
}

function bake() {
  const geometry = buildFoxHybrid();
  writeFileSync(
    resolve(repo, `assets/treeline/${FOX_HYBRID_RECIPE.id}.json`),
    `${JSON.stringify({ version: 3, id: FOX_HYBRID_RECIPE.id, provenance: FOX_HYBRID_RECIPE.provenance, geometry })}\n`,
  );
  console.log(`${FOX_HYBRID_RECIPE.id}: ${geometry.foliage.triangles} foliage + ${geometry.wood.triangles} wood triangles, ${geometry.adaptation.lobeCount} lobes, seed ${geometry.adaptation.seed}`);
}

if (resolve(process.argv[1] ?? '') === filename) bake();
