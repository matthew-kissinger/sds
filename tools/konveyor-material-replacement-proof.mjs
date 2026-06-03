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

import {
  replaceRockMaterialsByTraversal,
  replaceTreeMaterialsByName,
} from '../js/diagnostics/webgpuMaterialReplacement.js';

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
  const args = { out: 'cycle36-validation/runtime/material-replacement-proof.json' };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--(\w+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
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

function primitiveCloneScene(document) {
  const primitiveMeshes = [];
  for (const mesh of document.getRoot().listMeshes()) {
    mesh.listPrimitives().forEach((primitive, primitiveIndex) => {
      primitiveMeshes.push({
        isMesh: true,
        name: mesh.getName() || null,
        primitiveIndex,
        material: { name: primitive.getMaterial()?.getName() || '' },
      });
    });
  }

  return {
    primitiveMeshes,
    root: {
      traverse(visitor) {
        primitiveMeshes.forEach(visitor);
      },
    },
  };
}

function materialNames(meshes) {
  return meshes.map((mesh) => mesh.material?.name || '(runtime-default)');
}

function replacementMaterial(name) {
  return {
    name,
    isNodeMaterial: true,
  };
}

function applyReplacement(asset, root) {
  if (asset.role === 'tree') {
    return replaceTreeMaterialsByName(root, {
      branches: () => replacementMaterial('konveyor-node-branches'),
      leaves: () => replacementMaterial('konveyor-node-leaves'),
    });
  }

  return replaceRockMaterialsByTraversal(
    root,
    () => replacementMaterial('konveyor-node-rock-rim')
  );
}

function summarize(files) {
  const treeFiles = files.filter((file) => file.role === 'tree');
  const rockFiles = files.filter((file) => file.role === 'rock');
  return {
    treeTargetsResolved: treeFiles.every((file) => file.replacement.missingTargets.length === 0),
    treeReplacedMaterials: treeFiles.reduce((sum, file) => sum + file.replacement.replacedMaterials, 0),
    rockReplacedMaterials: rockFiles.reduce((sum, file) => sum + file.replacement.replacedMaterials, 0),
    treeReplacementStrategy: 'material-name',
    rockReplacementStrategy: 'asset-class-traversal',
  };
}

async function run() {
  const args = parseArgs(process.argv);
  const io = await createIo();
  const files = [];

  for (const asset of ASSETS) {
    const document = await io.read(resolve(ROOT, asset.path));
    const { primitiveMeshes, root } = primitiveCloneScene(document);
    const beforeMaterialNames = materialNames(primitiveMeshes);
    const replacement = applyReplacement(asset, root);
    const afterMaterialNames = materialNames(primitiveMeshes);
    const nodeMaterialCount = primitiveMeshes.filter((mesh) => mesh.material?.isNodeMaterial).length;
    files.push({
      ...asset,
      beforeMaterialNames,
      replacement,
      afterMaterialNames,
      nodeMaterialCount,
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
  console.error('[KONVEYOR-MATERIAL-REPLACEMENT-PROOF] fatal:', err);
  process.exit(1);
});
