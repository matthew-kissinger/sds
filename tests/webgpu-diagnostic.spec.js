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
