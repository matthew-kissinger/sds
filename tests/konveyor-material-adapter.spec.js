import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DoubleSide, MeshStandardNodeMaterial, TSL } from 'three/webgpu';

import {
  applyKonveyorTreeRockMaterials,
  maybeApplyKonveyorTreeRockMaterials,
  shouldApplyKonveyorMaterials,
} from '../js/world/konveyorMaterialAdapter.js';
import { TerrainBuilder } from '../js/TerrainBuilder.js';
import { createKonveyorTreeLeafNodeMaterial } from '../js/world/konveyorTreeLeafNodeMaterial.js';

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

  it('can route tree leaves through the reusable WebGPU node material candidate', () => {
    const branchMaterial = new THREE.MeshBasicMaterial({ name: 'branches' });
    const leafMaterial = new THREE.MeshBasicMaterial({ name: 'leaves' });
    const rockMaterial = new THREE.MeshBasicMaterial({ name: '' });
    leafMaterial.side = THREE.DoubleSide;
    leafMaterial.transparent = false;
    leafMaterial.depthWrite = true;
    leafMaterial.depthTest = true;
    leafMaterial.alphaHash = true;
    leafMaterial.alphaTest = 0.08;

    const tree = root({ isMesh: true, material: branchMaterial }, { isMesh: true, material: leafMaterial });
    const rock = root({ isMesh: true, material: rockMaterial });

    const summary = applyKonveyorTreeRockMaterials({
      trees: { tree1: tree },
      treesLod1: {},
      rocks: { rock1: rock },
      createTreeBranchMaterial: ({ previous }) => new THREE.MeshBasicMaterial({ name: `konveyor-${previous.name}` }),
      createTreeLeafMaterial: ({ previous }) => createKonveyorTreeLeafNodeMaterial(
        { MeshStandardNodeMaterial, DoubleSide, TSL },
        {
          baseColor: [0.18, 0.34, 0.12],
          tipColor: [0.5, 0.68, 0.24],
          windDirection: [0.7, 0.7],
          windStrength: 0.72,
          treeBaseY: -0.525,
          treeTopY: 0.525,
          occluderStrength: 0.55,
          occluderPeak: 0.62,
          occluderUv: [0.5, 0.42],
          alphaHash: previous.alphaHash,
          alphaTest: previous.alphaTest,
          side: previous.side,
          transparent: previous.transparent,
          depthWrite: previous.depthWrite,
          depthTest: previous.depthTest,
        }
      ),
      createRockMaterial: () => new THREE.MeshBasicMaterial({ name: 'konveyor-rock' }),
    });

    const leaves = tree.children[1].material;
    try {
      expect(summary.ok).toBe(true);
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
    } finally {
      branchMaterial.dispose();
      leafMaterial.dispose();
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
