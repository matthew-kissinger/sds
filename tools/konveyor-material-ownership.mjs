// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import {
  EXTMeshoptCompression,
  KHRDracoMeshCompression,
  KHRMeshQuantization,
} from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const ASSETS = [
  { group: 'tree-lod0', role: 'tree', path: 'assets/models/trees/tree1.glb' },
  { group: 'tree-lod0', role: 'tree', path: 'assets/models/trees/tree2.glb' },
  { group: 'tree-lod1', role: 'tree', path: 'assets/models/trees/tree1_lod1.glb' },
  { group: 'tree-lod1', role: 'tree', path: 'assets/models/trees/tree2_lod1.glb' },
  { group: 'rock-lod0', role: 'rock', path: 'assets/models/rocks/rock1.glb' },
  { group: 'rock-lod0', role: 'rock', path: 'assets/models/rocks/rock2.glb' },
  { group: 'rock-lod0', role: 'rock', path: 'assets/models/rocks/rock3.glb' },
];

function parseArgs(argv) {
  const args = { out: 'cycle36-validation/runtime/material-ownership.json' };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--(\w+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function materialSnapshot(mat) {
  return {
    name: mat.getName() || null,
    alphaMode: mat.getAlphaMode(),
    alphaCutoff: mat.getAlphaCutoff(),
    doubleSided: mat.getDoubleSided(),
    baseColorFactor: mat.getBaseColorFactor().map((v) => Number(v.toFixed(4))),
    baseColorTexture: mat.getBaseColorTexture()?.getName() || null,
    normalTexture: mat.getNormalTexture()?.getName() || null,
    occlusionTexture: mat.getOcclusionTexture()?.getName() || null,
    emissiveFactor: mat.getEmissiveFactor().map((v) => Number(v.toFixed(4))),
  };
}

function meshSnapshot(mesh) {
  return {
    name: mesh.getName() || null,
    primitives: mesh.listPrimitives().map((prim) => ({
      material: prim.getMaterial()?.getName() || null,
      mode: prim.getMode(),
    })),
  };
}

function summarize(files) {
  const treeFiles = files.filter((file) => file.role === 'tree');
  const rockFiles = files.filter((file) => file.role === 'rock');
  const treeMaterialNames = [...new Set(treeFiles.flatMap((file) => file.materials.map((m) => m.name || '(unnamed)')))].sort();
  const leafMaterials = treeFiles.flatMap((file) => file.materials.filter((m) => m.name === 'leaves'));
  const branchMaterials = treeFiles.flatMap((file) => file.materials.filter((m) => m.name === 'branches'));
  const rockPrimitiveMaterialNames = [...new Set(rockFiles.flatMap((file) => file.meshes.flatMap((mesh) => mesh.primitives.map((p) => p.material || '(runtime-default)'))))].sort();

  return {
    treeMaterialNames,
    treeLeafMaterialsStable: leafMaterials.length === treeFiles.length
      && leafMaterials.every((m) => m.alphaMode === 'MASK' && m.doubleSided === true),
    treeBranchMaterialsStable: branchMaterials.length === treeFiles.length
      && branchMaterials.every((m) => m.alphaMode === 'OPAQUE' && m.doubleSided === false),
    rockPrimitiveMaterialNames,
    rockMaterialNamesStable: rockPrimitiveMaterialNames.length === 1 && rockPrimitiveMaterialNames[0] !== '(runtime-default)',
    productionReplacementStrategy: {
      trees: 'Target GLB materials by name: leaves for wind/alpha/occluder, branches for opaque bark. Preserve LOD0 and LOD1 parity.',
      rocks: 'Do not target rocks by material name. Rock primitives currently load through runtime-default material ownership, so replacement must happen by rock asset class or mesh traversal.',
    },
  };
}

async function createIo() {
  await MeshoptDecoder.ready;
  const dracoDecoder = await draco3d.createDecoderModule();
  return new NodeIO()
    .registerExtensions([KHRDracoMeshCompression, EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({
      'draco3d.decoder': dracoDecoder,
      'meshopt.decoder': MeshoptDecoder,
    });
}

async function run() {
  const args = parseArgs(process.argv);
  const io = await createIo();
  const files = [];
  for (const asset of ASSETS) {
    const document = await io.read(resolve(ROOT, asset.path));
    const root = document.getRoot();
    files.push({
      ...asset,
      materials: root.listMaterials().map(materialSnapshot),
      meshes: root.listMeshes().map(meshSnapshot),
    });
  }

  const result = {
    capturedAt: new Date().toISOString(),
    files,
    summary: summarize(files),
  };

  const outPath = resolve(ROOT, args.out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

run().catch((err) => {
  console.error('[KONVEYOR-MATERIAL-OWNERSHIP] fatal:', err);
  process.exit(1);
});
