// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import {
    replaceRockMaterialsByTraversal,
    replaceTreeMaterialsByName,
} from './webgpuMaterialReplacement.js';

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;

export const RUNTIME_GLB_MATERIAL_PROOF_ASSETS = [
    { group: 'tree-lod0', role: 'tree', path: 'assets/models/trees/tree1.glb' },
    { group: 'tree-lod0', role: 'tree', path: 'assets/models/trees/tree2.glb' },
    { group: 'tree-lod1', role: 'tree', path: 'assets/models/trees/tree1_lod1.glb' },
    { group: 'tree-lod1', role: 'tree', path: 'assets/models/trees/tree2_lod1.glb' },
    { group: 'rock-lod0', role: 'rock', path: 'assets/models/rocks/rock1.glb' },
    { group: 'rock-lod0', role: 'rock', path: 'assets/models/rocks/rock2.glb' },
    { group: 'rock-lod0', role: 'rock', path: 'assets/models/rocks/rock3.glb' },
];

export function parseGlbJson(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    if (view.getUint32(0, true) !== GLB_MAGIC) {
        throw new Error('not a GLB payload');
    }
    const byteLength = view.getUint32(8, true);
    let offset = 12;
    while (offset + 8 <= byteLength) {
        const chunkLength = view.getUint32(offset, true);
        const chunkType = view.getUint32(offset + 4, true);
        offset += 8;
        if (chunkType === GLB_JSON_CHUNK) {
            const bytes = new Uint8Array(arrayBuffer, offset, chunkLength);
            return JSON.parse(new TextDecoder().decode(bytes).trim());
        }
        offset += chunkLength;
    }
    throw new Error('GLB JSON chunk not found');
}

function primitiveMaterialName(gltf, primitive) {
    if (primitive.material === undefined) return '';
    return gltf.materials?.[primitive.material]?.name || '';
}

function primitiveCloneScene(gltf) {
    const primitiveMeshes = [];
    for (const mesh of gltf.meshes || []) {
        for (const [primitiveIndex, primitive] of (mesh.primitives || []).entries()) {
            primitiveMeshes.push({
                isMesh: true,
                name: mesh.name || null,
                primitiveIndex,
                material: { name: primitiveMaterialName(gltf, primitive) },
            });
        }
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

export function createGlbMaterialReplacementProof(asset, gltf) {
    const { primitiveMeshes, root } = primitiveCloneScene(gltf);
    const beforeMaterialNames = materialNames(primitiveMeshes);
    const replacement = asset.role === 'tree'
        ? replaceTreeMaterialsByName(root, {
            branches: () => replacementMaterial('webgpu-node-branches'),
            leaves: () => replacementMaterial('webgpu-node-leaves'),
        })
        : replaceRockMaterialsByTraversal(
            root,
            () => replacementMaterial('webgpu-node-rock-rim')
        );
    const afterMaterialNames = materialNames(primitiveMeshes);
    const nodeMaterialCount = primitiveMeshes.filter((mesh) => mesh.material?.isNodeMaterial).length;
    return {
        ...asset,
        beforeMaterialNames,
        replacement,
        afterMaterialNames,
        nodeMaterialCount,
    };
}

function summarize(files) {
    const treeFiles = files.filter((file) => file.role === 'tree');
    const rockFiles = files.filter((file) => file.role === 'rock');
    return {
        ok: treeFiles.every((file) => file.replacement.missingTargets.length === 0)
            && rockFiles.every((file) => file.replacement.replacedMaterials > 0),
        treeTargetsResolved: treeFiles.every((file) => file.replacement.missingTargets.length === 0),
        treeReplacedMaterials: treeFiles.reduce((sum, file) => sum + file.replacement.replacedMaterials, 0),
        rockReplacedMaterials: rockFiles.reduce((sum, file) => sum + file.replacement.replacedMaterials, 0),
        treeReplacementStrategy: 'material-name',
        rockReplacementStrategy: 'asset-class-traversal',
    };
}

export async function createRuntimeGlbMaterialReplacementProof(fetchAsset = window.fetch.bind(window)) {
    const files = [];
    for (const asset of RUNTIME_GLB_MATERIAL_PROOF_ASSETS) {
        const response = await fetchAsset(asset.path);
        if (!response.ok) {
            throw new Error(`${asset.path} returned HTTP ${response.status}`);
        }
        const gltf = parseGlbJson(await response.arrayBuffer());
        files.push(createGlbMaterialReplacementProof(asset, gltf));
    }

    return {
        assets: RUNTIME_GLB_MATERIAL_PROOF_ASSETS.length,
        files,
        summary: summarize(files),
    };
}
