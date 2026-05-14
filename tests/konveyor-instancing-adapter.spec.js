import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { createKonveyorNativeTreeInstancingPreview } from '../js/world/konveyorTreeInstancingAdapter.js';

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
});
