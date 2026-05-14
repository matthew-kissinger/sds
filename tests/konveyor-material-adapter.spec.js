import { describe, expect, it } from 'vitest';

import {
  applyKonveyorTreeRockMaterials,
  maybeApplyKonveyorTreeRockMaterials,
  shouldApplyKonveyorMaterials,
} from '../js/world/konveyorMaterialAdapter.js';

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
});
