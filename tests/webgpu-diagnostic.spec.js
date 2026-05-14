import { describe, expect, it } from 'vitest';

import {
  createRockRimDiagnosticState,
  createSkyFogDiagnosticState,
  createTreeLeafDiagnosticState,
} from '../js/diagnostics/webgpuDiagnostic.js';
import {
  replaceRockMaterialsByTraversal,
  replaceTreeMaterialsByName,
} from '../js/diagnostics/webgpuMaterialReplacement.js';
import {
  createGlbMaterialReplacementProof,
  createRuntimeGlbMaterialReplacementProof,
  parseGlbJson,
  RUNTIME_GLB_MATERIAL_PROOF_ASSETS,
} from '../js/diagnostics/webgpuGlbMaterialProof.js';
import { RUNTIME_GLB_RENDER_PREVIEW_ASSETS } from '../js/diagnostics/webgpuRuntimeGlbPreview.js';
import { createProductionTreePlacementPlan } from '../js/diagnostics/webgpuProductionPlacementPlan.js';

function createGlbBuffer(gltf) {
  const json = JSON.stringify(gltf);
  const jsonBytes = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, ' '));
  const buffer = new ArrayBuffer(12 + 8 + jsonBytes.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20).set(jsonBytes);
  return buffer;
}

describe('webgpu diagnostic sky fog state', () => {
  it('keeps fog color derived from the CPU horizon sample', () => {
    const state = createSkyFogDiagnosticState();
    expect(state.horizonColor).toHaveLength(3);
    expect(state.sunColor).toHaveLength(3);
    expect(state.fogColor).toEqual(
      state.horizonColor.map((v) => Number((v * state.fogDarkenMultiplier).toFixed(4)))
    );
    expect(state.fogNear).toBeLessThan(state.fogFar);
  });

  it('drives the diagnostic rock rim from the CPU sun color packet', () => {
    const skyFog = createSkyFogDiagnosticState();
    const rockRim = createRockRimDiagnosticState(skyFog);
    expect(rockRim.rimColor).toBe(skyFog.sunColor);
    expect(rockRim.sunColorSource).toBe('skyFog.sunColor');
    expect(rockRim.rimStrength).toBeGreaterThan(0);
    expect(rockRim.rimPower).toBeGreaterThan(1);
  });

  it('keeps the tree leaf diagnostic scoped to wind and occluder inputs', () => {
    const treeLeaf = createTreeLeafDiagnosticState();
    expect(treeLeaf.windDirection).toHaveLength(2);
    expect(treeLeaf.windStrength).toBeGreaterThan(0);
    expect(treeLeaf.treeBaseY).toBeLessThan(treeLeaf.treeTopY);
    expect(treeLeaf.alphaHash).toBe(true);
    expect(treeLeaf.occluderStrength).toBeGreaterThan(0);
    expect(treeLeaf.occluderPeak).toBeGreaterThan(0);
  });
});

describe('webgpu diagnostic material replacement strategy', () => {
  it('replaces tree materials by stable GLB material names', () => {
    const meshes = [
      { isMesh: true, material: { name: 'branches' } },
      { isMesh: true, material: { name: 'leaves' } },
      { isMesh: true, material: { name: 'bystander' } },
    ];
    const root = {
      traverse(visitor) {
        meshes.forEach(visitor);
      },
    };

    const result = replaceTreeMaterialsByName(root, {
      branches: () => ({ name: 'node-branches' }),
      leaves: () => ({ name: 'node-leaves' }),
    });

    expect(meshes[0].material.name).toBe('node-branches');
    expect(meshes[1].material.name).toBe('node-leaves');
    expect(meshes[2].material.name).toBe('bystander');
    expect(result).toMatchObject({
      strategy: 'material-name',
      targetNames: ['branches', 'leaves'],
      seenNames: ['branches', 'bystander', 'leaves'],
      missingTargets: [],
      visitedMeshes: 3,
      replacedMaterials: 2,
    });
  });

  it('replaces unnamed rock materials by mesh traversal', () => {
    const rock = {
      isMesh: true,
      material: { name: '' },
    };

    const result = replaceRockMaterialsByTraversal(rock, () => ({ name: 'node-rock-rim' }));

    expect(rock.material.name).toBe('node-rock-rim');
    expect(result).toEqual({
      strategy: 'asset-class-traversal',
      visitedMeshes: 1,
      replacedMaterials: 1,
      previousMaterialNames: ['(runtime-default)'],
    });
  });
});

describe('webgpu runtime glb material proof', () => {
  it('parses the JSON chunk from a GLB payload', () => {
    const buffer = createGlbBuffer({ asset: { version: '2.0' }, materials: [{ name: 'leaves' }] });

    expect(parseGlbJson(buffer)).toEqual({
      asset: { version: '2.0' },
      materials: [{ name: 'leaves' }],
    });
  });

  it('applies tree replacement to gltf primitive material names', () => {
    const proof = createGlbMaterialReplacementProof(
      { group: 'tree-lod0', role: 'tree', path: 'tree.glb' },
      {
        materials: [{ name: 'branches' }, { name: 'leaves' }],
        meshes: [{ primitives: [{ material: 0 }, { material: 1 }] }],
      }
    );

    expect(proof.replacement.missingTargets).toEqual([]);
    expect(proof.afterMaterialNames).toEqual(['konveyor-node-branches', 'konveyor-node-leaves']);
    expect(proof.nodeMaterialCount).toBe(2);
  });

  it('applies rock replacement when primitives have no material index', () => {
    const proof = createGlbMaterialReplacementProof(
      { group: 'rock-lod0', role: 'rock', path: 'rock.glb' },
      { meshes: [{ primitives: [{}] }] }
    );

    expect(proof.beforeMaterialNames).toEqual(['(runtime-default)']);
    expect(proof.afterMaterialNames).toEqual(['konveyor-node-rock-rim']);
    expect(proof.nodeMaterialCount).toBe(1);
  });

  it('summarizes fetched runtime GLB material replacement contracts', async () => {
    const payloads = new Map(RUNTIME_GLB_MATERIAL_PROOF_ASSETS.map((asset) => {
      const gltf = asset.role === 'tree'
        ? {
          materials: [{ name: 'branches' }, { name: 'leaves' }],
          meshes: [{ primitives: [{ material: 0 }, { material: 1 }] }],
        }
        : { meshes: [{ primitives: [{}] }] };
      return [asset.path, createGlbBuffer(gltf)];
    }));

    const proof = await createRuntimeGlbMaterialReplacementProof(async (path) => ({
      ok: payloads.has(path),
      status: payloads.has(path) ? 200 : 404,
      arrayBuffer: async () => payloads.get(path),
    }));

    expect(proof.assets).toBe(7);
    expect(proof.summary).toMatchObject({
      ok: true,
      treeTargetsResolved: true,
      treeReplacedMaterials: 8,
      rockReplacedMaterials: 3,
      treeReplacementStrategy: 'material-name',
      rockReplacementStrategy: 'asset-class-traversal',
    });
  });

  it('renders only production GLBs covered by the runtime material proof', () => {
    const proofPaths = new Set(RUNTIME_GLB_MATERIAL_PROOF_ASSETS.map((asset) => asset.path));

    expect(RUNTIME_GLB_RENDER_PREVIEW_ASSETS).toHaveLength(RUNTIME_GLB_MATERIAL_PROOF_ASSETS.length);
    expect([...new Set(RUNTIME_GLB_RENDER_PREVIEW_ASSETS.map((asset) => asset.role).sort())]).toEqual(['rock', 'tree']);
    expect([...new Set(RUNTIME_GLB_RENDER_PREVIEW_ASSETS.map((asset) => asset.group).sort())]).toEqual(['rock-lod0', 'tree-lod0', 'tree-lod1']);
    expect(RUNTIME_GLB_RENDER_PREVIEW_ASSETS.every((asset) => proofPaths.has(asset.path))).toBe(true);
  });

  it('samples real scene tree placement data for the production placement preview', () => {
    const plan = createProductionTreePlacementPlan();

    expect(plan).toMatchObject({
      ok: true,
      sceneId: 'rolling-hills',
      source: 'shared/TreePlacement.generateTrees',
      rockExclusionMode: 'empty-rock-list',
    });
    expect(plan.generatedTrees).toBeGreaterThan(plan.sampledTrees);
    expect(plan.sampledTrees).toBe(8);
    expect(plan.types).toEqual(['tree1', 'tree2']);
    const counts = plan.samples.reduce((acc, sample) => ({
      ...acc,
      [sample.type]: (acc[sample.type] ?? 0) + 1,
    }), {});
    expect(counts).toEqual({ tree1: 4, tree2: 4 });
    expect(plan.samples.every((sample) => Number.isFinite(sample.production.x))).toBe(true);
    expect(plan.samples.every((sample) => Number.isFinite(sample.production.z))).toBe(true);
    expect(plan.samples.every((sample) => sample.production.scale > 0)).toBe(true);
  });
});
