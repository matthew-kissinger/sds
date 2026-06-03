// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DoubleSide, MeshStandardNodeMaterial, TSL } from 'three/webgpu';

import {
  applyKonveyorTreeRockMaterials,
  maybeApplyKonveyorTreeRockMaterials,
  shouldApplyKonveyorMaterials,
} from '../js/world/konveyorMaterialAdapter.js';
import { TerrainBuilder } from '../js/TerrainBuilder.js';
import { createKonveyorTreeRockNodeMaterialFactories } from '../js/world/konveyorTreeRockNodeMaterialFactories.js';

function mesh(materialName) {
  return {
    isMesh: true,
    material: { name: materialName },
  };
}

function root(...children) {
  return { children };
}

const factories = {
  createTreeBranchMaterial: ({ previous }) => ({ name: 'konveyor-branches', previousName: previous.name }),
  createTreeLeafMaterial: ({ previous }) => ({ name: 'konveyor-leaves', previousName: previous.name }),
  createRockMaterial: ({ previous }) => ({ name: 'konveyor-rock', previousName: previous.name || '(runtime-default)' }),
};

describe('konveyor production material adapter', () => {
  it('requires the explicit WebGPU material flag', () => {
    expect(shouldApplyKonveyorMaterials('?renderer=webgpu&konveyorMaterials=1')).toBe(true);
    expect(shouldApplyKonveyorMaterials('?renderer=webgpu&diagnostic=1')).toBe(false);
    expect(shouldApplyKonveyorMaterials('?renderer=webgl&konveyorMaterials=1')).toBe(false);
    expect(shouldApplyKonveyorMaterials('')).toBe(false);
  });

  it('replaces tree LOD0/LOD1 by material name and rocks by traversal', () => {
    const treeLod0 = root(mesh('branches'), mesh('leaves'));
    const treeLod1 = root(mesh('branches'), mesh('leaves'));
    const rock = root(mesh(''));

    const summary = applyKonveyorTreeRockMaterials({
      trees: { tree1: treeLod0 },
      treesLod1: { tree1: treeLod1 },
      rocks: { rock1: rock },
      ...factories,
    });

    expect(summary.ok).toBe(true);
    expect(summary.treeTargetsResolved).toBe(true);
    expect(summary.treeReplacedMaterials).toBe(4);
    expect(summary.rockReplacedMaterials).toBe(1);
    expect(treeLod0.children.map((child) => child.material.name)).toEqual(['konveyor-branches', 'konveyor-leaves']);
    expect(treeLod1.children.map((child) => child.material.name)).toEqual(['konveyor-branches', 'konveyor-leaves']);
    expect(rock.children[0].material.name).toBe('konveyor-rock');
  });

  it('leaves production materials untouched unless flag and factories are both present', () => {
    const builder = {
      models: {
        trees: { tree1: root(mesh('branches'), mesh('leaves')) },
        treesLod1: {},
        rocks: { rock1: root(mesh('')) },
      },
    };

    expect(maybeApplyKonveyorTreeRockMaterials(builder, {
      search: '?renderer=webgpu',
      factories,
    })).toEqual({ applied: false, reason: 'flag-disabled' });
    expect(builder.models.trees.tree1.children.map((child) => child.material.name)).toEqual(['branches', 'leaves']);

    expect(maybeApplyKonveyorTreeRockMaterials(builder, {
      search: '?renderer=webgpu&konveyorMaterials=1',
    })).toEqual({ applied: false, reason: 'missing-factories' });
    expect(builder.models.rocks.rock1.children[0].material.name).toBe('');
  });

  it('applies through the TerrainBuilder-facing adapter when explicitly enabled', () => {
    const builder = {
      models: {
        trees: { tree1: root(mesh('branches'), mesh('leaves')) },
        treesLod1: { tree1: root(mesh('branches'), mesh('leaves')) },
        rocks: { rock1: root(mesh('')) },
      },
    };

    const summary = maybeApplyKonveyorTreeRockMaterials(builder, {
      search: '?renderer=webgpu&konveyorMaterials=1',
      factories,
    });

    expect(summary.applied).toBe(true);
    expect(summary.ok).toBe(true);
    expect(builder.models.trees.tree1.children[0].material.name).toBe('konveyor-branches');
    expect(builder.models.rocks.rock1.children[0].material.name).toBe('konveyor-rock');
  });

  it('can route tree and rock replacements through reusable WebGPU node material candidates', () => {
    const branchMaterial = new THREE.MeshBasicMaterial({ name: 'branches' });
    const leafMaterial = new THREE.MeshBasicMaterial({ name: 'leaves' });
    const leafTexture = new THREE.DataTexture(new Uint8Array([24, 96, 12, 255]), 1, 1, THREE.RGBAFormat);
    leafTexture.needsUpdate = true;
    const rockMaterial = new THREE.MeshBasicMaterial({ name: '' });
    branchMaterial.color.setRGB(0.26, 0.16, 0.08);
    leafMaterial.color.setRGB(1.0, 0.95, 0.12);
    leafMaterial.map = leafTexture;
    leafMaterial.side = THREE.DoubleSide;
    leafMaterial.transparent = false;
    leafMaterial.depthWrite = true;
    leafMaterial.depthTest = true;
    leafMaterial.alphaHash = true;
    leafMaterial.alphaTest = 0.08;

    const tree = root({ isMesh: true, material: branchMaterial }, { isMesh: true, material: leafMaterial });
    const rock = root({ isMesh: true, material: rockMaterial });
    const nodeFactories = createKonveyorTreeRockNodeMaterialFactories(
      { MeshStandardNodeMaterial, DoubleSide, TSL },
      {
        treeBranch: {
          baseColor: [0.20, 0.11, 0.055],
          roughness: 0.94,
          metalness: 0.0,
        },
        treeLeaf: {
          baseColor: [0.18, 0.34, 0.12],
          tipColor: [0.5, 0.68, 0.24],
          windDirection: [0.7, 0.7],
          windStrength: 0.72,
          treeBaseY: -0.525,
          treeTopY: 0.525,
          occluderStrength: 0.55,
          occluderPeak: 0.62,
          occluderUv: [0.5, 0.42],
        },
        rockRim: {
          baseColor: [0.32, 0.29, 0.25],
          rimColor: [0.7, 0.54, 0.36],
          rimPower: 2.25,
          rimStrength: 0.22,
          roughness: 0.86,
          metalness: 0.0,
        },
      }
    );

    const summary = applyKonveyorTreeRockMaterials({
      trees: { tree1: tree },
      treesLod1: {},
      rocks: { rock1: rock },
      ...nodeFactories,
    });

    const branches = tree.children[0].material;
    const leaves = tree.children[1].material;
    const rockRim = rock.children[0].material;
    try {
      expect(summary.ok).toBe(true);
      expect(branches.name).toBe('konveyor-node-branches');
      expect(branches.isNodeMaterial).toBe(true);
      expect(branches.isMeshStandardNodeMaterial).toBe(true);
      expect(branches.colorNode).toBeTruthy();
      expect(branches.userData.konveyorUsesSourceColor).toBe(true);
      expect(branches.userData.konveyorUsesDistanceFog).toBe(true);
      expect(branches.userData.konveyorTreeWindNodeUniforms).toBeTruthy();
      expect(branches.userData.konveyorTreeNodeMaterialControls?.setWind).toBeInstanceOf(Function);
      expect(branches.roughnessNode).toBeTruthy();
      expect(branches.metalnessNode).toBeTruthy();
      expect(branches.transparent).toBe(false);
      expect(branches.depthWrite).toBe(true);
      expect(branches.depthTest).toBe(true);
      expect(leaves.name).toBe('konveyor-node-leaves');
      expect(leaves.isNodeMaterial).toBe(true);
      expect(leaves.isMeshStandardNodeMaterial).toBe(true);
      expect(leaves.side).toBe(THREE.DoubleSide);
      expect(leaves.transparent).toBe(false);
      expect(leaves.depthWrite).toBe(true);
      expect(leaves.depthTest).toBe(true);
      expect(leaves.alphaHash).toBe(true);
      expect(leaves.alphaTest).toBe(0.08);
      expect(leaves.colorNode).toBeTruthy();
      expect(leaves.opacityNode).toBeTruthy();
      expect(leaves.positionNode).toBeTruthy();
      expect(leaves.userData.konveyorUsesSourceMap).toBe(true);
      expect(leaves.userData.konveyorUsesSourceTint).toBe(true);
      expect(leaves.userData.konveyorUsesDistanceFog).toBe(true);
      expect(leaves.userData.konveyorSourceMapScale).toBe(0.58);
      expect(leaves.userData.konveyorTreeWindNodeUniforms).toBeTruthy();
      expect(leaves.userData.konveyorTreeLeafOccluderNodeUniforms).toBeTruthy();
      expect(leaves.userData.konveyorTreeNodeMaterialControls?.setOccluder).toBeInstanceOf(Function);
      expect(rockRim.name).toBe('konveyor-node-rock-rim');
      expect(rockRim.isNodeMaterial).toBe(true);
      expect(rockRim.isMeshStandardNodeMaterial).toBe(true);
      expect(rockRim.colorNode).toBeTruthy();
      expect(rockRim.emissiveNode).toBeTruthy();
      expect(rockRim.roughnessNode).toBeTruthy();
      expect(rockRim.metalnessNode).toBeTruthy();
      expect(rockRim.transparent).toBe(false);
      expect(rockRim.depthWrite).toBe(true);
      expect(rockRim.depthTest).toBe(true);
    } finally {
      branchMaterial.dispose();
      leafMaterial.dispose();
      leafTexture.dispose();
      rockMaterial.dispose();
      tree.children.forEach((child) => child.material?.dispose?.());
      rock.children.forEach((child) => child.material?.dispose?.());
    }
  });

  it('wires TerrainBuilder model caches through the fail-closed material seam', async () => {
    const builder = new TerrainBuilder(new THREE.Scene(), false, null, {
      search: '?renderer=webgpu&konveyorMaterials=1',
      konveyorMaterialFactories: factories,
    });
    builder.models = {
      trees: { tree1: root(mesh('branches'), mesh('leaves')) },
      treesLod1: { tree1: root(mesh('branches'), mesh('leaves')) },
      rocks: { rock1: root(mesh('')) },
      mountains: {},
      buildings: {},
      animals: {},
    };

    const summary = await builder._applyKonveyorTreeRockMaterials();

    expect(summary).toBe(builder.konveyorTreeRockMaterialSummary);
    expect(summary.applied).toBe(true);
    expect(summary.treeReplacedMaterials).toBe(4);
    expect(summary.rockReplacedMaterials).toBe(1);
    expect(builder.models.trees.tree1.children.map((child) => child.material.name)).toEqual([
      'konveyor-branches',
      'konveyor-leaves',
    ]);
    expect(builder.models.rocks.rock1.children[0].material.name).toBe('konveyor-rock');
  });
});
