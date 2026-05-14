import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  createKonveyorNativeRockInstancingPreview,
  createKonveyorNativeTreeInstancingPreview,
} from '../js/world/konveyorNativeInstancingAdapter.js';

function treeRoot() {
  const root = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.8, 0.1),
    new THREE.MeshBasicMaterial({ name: 'konveyor-node-branches' })
  );
  trunk.name = 'trunk';
  trunk.position.y = 0.4;
  root.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 1.0, 2, 2),
    new THREE.MeshBasicMaterial({ name: 'konveyor-node-leaves' })
  );
  leaves.name = 'leaves';
  leaves.position.y = 1.0;
  root.add(leaves);
  return root;
}

function rockRoot() {
  const root = new THREE.Group();
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.45, 1),
    new THREE.MeshBasicMaterial({ name: 'konveyor-node-rock-rim' })
  );
  rock.name = 'rock';
  rock.position.y = 0.3;
  root.add(rock);
  return root;
}

describe('konveyor native tree instancing adapter', () => {
  it('builds native Three instanced groups without depending on InstancedMesh2', () => {
    const scene = new THREE.Scene();
    const plan = {
      types: ['tree1'],
      samples: [
        { type: 'tree1', production: { rotationY: 0 } },
        { type: 'tree1', production: { rotationY: Math.PI / 2 } },
      ],
    };

    const result = createKonveyorNativeTreeInstancingPreview({
      scene,
      rootsByAsset: new Map([['tree-lod0:tree1-lod0', treeRoot()]]),
      plan,
      createDisplayTransform: (sample, index = plan.samples.indexOf(sample)) => ({
        x: index,
        y: 0,
        z: index * 0.5,
        scaleMultiplier: 1 + index,
        rotationY: sample.production.rotationY,
      }),
      three: {
        Box3: THREE.Box3,
        InstancedMesh: THREE.InstancedMesh,
        Matrix4: THREE.Matrix4,
        Object3D: THREE.Object3D,
      },
    });

    expect(result.summary).toMatchObject({
      ok: true,
      source: 'THREE.InstancedMesh',
      productionReference: 'TerrainBuilder InstancedMesh2.addInstances',
      lod: 'lod0-only',
      instancedMesh2Status: 'not imported in WebGPU diagnostic',
      treeInstances: 2,
      instanceMatrices: 4,
      renderedInstanceMeshes: 2,
      missingTypes: [],
    });
    expect(result.summary.groups.map((group) => group.meshName)).toEqual(['trunk', 'leaves']);
    expect(result.summary.groups.map((group) => group.materialName)).toEqual([
      'konveyor-node-branches',
      'konveyor-node-leaves',
    ]);
    expect(result.roots.every((root) => root.isInstancedMesh)).toBe(true);
    expect(scene.children).toHaveLength(2);
  });

  it('builds native Three instanced rock groups from diagnostic placement transforms', () => {
    const scene = new THREE.Scene();
    const plan = {
      source: 'diagnostic-rock-placement-transform-samples',
      types: ['rock1'],
      samples: [
        { type: 'rock1', production: { rotationX: 0.1, rotationY: 0.2, rotationZ: 0.3 } },
        { type: 'rock1', production: { rotationX: 0.2, rotationY: 0.3, rotationZ: 0.4 } },
      ],
    };

    const result = createKonveyorNativeRockInstancingPreview({
      scene,
      rootsByAsset: new Map([['rock-lod0:rock1-lod0', rockRoot()]]),
      plan,
      createDisplayTransform: (sample, index = plan.samples.indexOf(sample)) => ({
        x: index,
        y: 0,
        z: index * 0.5,
        rotationX: sample.production.rotationX,
        rotationY: sample.production.rotationY,
        rotationZ: sample.production.rotationZ,
        scaleX: 1 + index,
        scaleY: 0.7 + index,
        scaleZ: 1.2 + index,
      }),
      three: {
        Box3: THREE.Box3,
        InstancedMesh: THREE.InstancedMesh,
        Matrix4: THREE.Matrix4,
        Object3D: THREE.Object3D,
      },
    });

    expect(result.summary).toMatchObject({
      ok: true,
      source: 'THREE.InstancedMesh',
      productionReference: 'RockPlacement InstancedMesh2.addInstances',
      instanceSource: 'diagnostic-rock-placement-transform-samples',
      lod: 'lod0-only',
      instancedMesh2Status: 'not imported in WebGPU diagnostic',
      rockInstances: 2,
      instanceMatrices: 2,
      renderedInstanceMeshes: 1,
      missingTypes: [],
    });
    expect(result.summary.groups[0]).toMatchObject({
      type: 'rock1',
      meshName: 'rock',
      materialName: 'konveyor-node-rock-rim',
      instances: 2,
      isInstancedMesh: true,
    });
    expect(result.roots.every((root) => root.isInstancedMesh)).toBe(true);
    expect(scene.children).toHaveLength(1);
  });
});
