// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  createKonveyorNativeRockInstancingPreview,
  createKonveyorNativeTreeInstancingPreview,
} from '../js/world/konveyorNativeInstancingAdapter.js';
import { placeEnvironmentDetails } from '../js/world/RockPlacement.js';
import { placeTrees, resolveKonveyorNativeTreeImpostorRoute } from '../js/world/TreePlacement.js';
import {
  createKonveyorTreeImpostorGeometry,
  installKonveyorTreeHybridRuntime,
  installKonveyorTreeImpostorRuntime,
  syncKonveyorTreeHybridVisibility,
  syncKonveyorTreeImpostorMesh,
} from '../js/world/TreeImpostorRuntime.js';
import { loadScene } from '../shared/scenes/index.js';

function setProductionWebGpuWindow() {
  globalThis.window = {
    location: { search: '?renderer=webgpu&konveyorProduction=1' },
    __sdsRendererMode: { effective: 'webgpu-production' },
    __sdsG: { productionWebGpu: { enabled: true } },
  };
}

afterEach(() => {
  delete globalThis.window;
});

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
  it('promotes the explicit production tree impostor route to octahedral v2 with a latlon rollback', () => {
    expect(resolveKonveyorNativeTreeImpostorRoute('?renderer=webgpu&konveyorNativeTreeImpostors=1')).toMatchObject({
      active: true,
      useOctahedral: true,
      baseDir: 'assets/models/trees/octahedral',
      lod: 'production-hybrid-lod0-octahedral-v2-impostor-explicit',
      runtimeMode: 'octahedral-production',
      sidecarLayout: 'octahedral',
      sidecarVersion: 2,
      rollbackQuery: '?renderer=webgpu&konveyorNativeTreeImpostors=latlon',
    });

    expect(resolveKonveyorNativeTreeImpostorRoute('?renderer=webgpu&konveyorNativeTreeImpostors=latlon')).toMatchObject({
      active: true,
      useLatLonRollback: true,
      baseDir: 'assets/models/trees',
      lod: 'rollback-hybrid-lod0-latlon-hemi-impostor-explicit',
      runtimeMode: 'latlon-hemi-rollback',
      sidecarLayout: 'latlon-hemi-y',
      sidecarVersion: 1,
    });

    expect(resolveKonveyorNativeTreeImpostorRoute('?renderer=webgpu')).toMatchObject({
      active: false,
      sidecarLayout: null,
      sidecarVersion: null,
    });
  });

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

  it('uses native Three instancing for production scene-body tree placement under the guarded flag', async () => {
    setProductionWebGpuWindow();
    const scene = new THREE.Scene();
    const builder = {
      modelsLoaded: true,
      scene,
      sceneDef: loadScene('field'),
      rockPositions: [],
      models: {
        trees: {
          tree1: treeRoot(),
          tree2: treeRoot(),
        },
      },
      isMobile: false,
      _groundY: () => 0,
    };

    const meshes = await placeTrees(builder);

    expect(builder.konveyorNativeTreeInstancingSummary).toMatchObject({
      applied: true,
      ok: true,
      source: 'THREE.InstancedMesh',
      route: 'konveyor-production-scene-body',
      productionReference: 'TerrainBuilder InstancedMesh2.addInstances',
    });
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every((mesh) => mesh.isInstancedMesh === true)).toBe(true);
    expect(meshes.some((mesh) => mesh.isInstancedMesh2 === true)).toBe(false);
    expect(scene.children.some((child) => child.isInstancedMesh2 === true)).toBe(false);
  });

  it('syncs production tree impostor tiles and world-up billboard matrices per instance', () => {
    const sidecar = {
      layout: 'latlon',
      axis: 'hemi-y',
      tilesX: 4,
      tilesY: 4,
      elevations: [Math.PI * 0.35, Math.PI * 0.2, Math.PI * 0.05, -Math.PI * 0.1],
      bbox: {
        min: [0, 0, 0],
        max: [0, 1, 0],
      },
      yOffset: 0.5,
    };
    const instances = [
      {
        position: new THREE.Vector3(0, 0, 0),
        rotation: new THREE.Euler(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        groundY: 0,
        scaleScalar: 1,
      },
      {
        position: new THREE.Vector3(4, 2, 0),
        rotation: new THREE.Euler(0, Math.PI / 2, 0),
        scale: new THREE.Vector3(2, 2, 2),
        groundY: 2,
        scaleScalar: 2,
      },
    ];
    const runtime = createKonveyorTreeImpostorGeometry(new THREE.PlaneGeometry(1, 1), instances, sidecar);
    const mesh = new THREE.InstancedMesh(runtime.geometry, new THREE.MeshBasicMaterial(), instances.length);
    installKonveyorTreeImpostorRuntime(mesh, {
      ...runtime,
      sidecar,
      treeType: 'tree1',
      chunkKey: '0:0',
    });

    const camera = { position: new THREE.Vector3(0, 1, 10) };
    expect(syncKonveyorTreeImpostorMesh(mesh, camera)).toBe(true);
    const firstOffset = [
      runtime.attributes.tileOffsets[0].getX(0),
      runtime.attributes.tileOffsets[0].getY(0),
    ];
    const firstWeightSum = runtime.attributes.tileWeights.getX(0)
      + runtime.attributes.tileWeights.getY(0)
      + runtime.attributes.tileWeights.getZ(0);
    expect(firstWeightSum).toBeCloseTo(1, 6);
    expect(mesh.instanceMatrix.array[13]).toBeCloseTo(0.5, 6);
    expect(mesh.instanceMatrix.array[16 + 13]).toBeCloseTo(3, 6);

    camera.position.set(10, 1, 0);
    expect(syncKonveyorTreeImpostorMesh(mesh, camera)).toBe(true);
    const nextOffset = [
      runtime.attributes.tileOffsets[0].getX(0),
      runtime.attributes.tileOffsets[0].getY(0),
    ];
    expect(nextOffset).not.toEqual(firstOffset);
    expect(mesh.userData.konveyorNativeTreeImpostor).toMatchObject({
      layout: 'latlon-hemi-y',
      selection: 'camera-driven-per-instance-instanced-attributes',
      billboardProjection: 'cpu-world-up-locked-camera-facing',
      terrainGroundedPivots: true,
      syncCount: 2,
    });

    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it('syncs octahedral tree impostor tiles from v2 sidecar metadata', () => {
    const sidecar = {
      version: 2,
      layout: 'octahedral',
      axis: 'octahedral',
      hemi: false,
      directionEncoding: 'octahedral',
      tilesX: 8,
      tilesY: 8,
      directions: Array.from({ length: 64 }, () => [0, 1, 0]),
      bbox: {
        min: [0, 0, 0],
        max: [0, 1, 0],
      },
      yOffset: 0.5,
    };
    const instances = [{
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      groundY: 0,
      scaleScalar: 1,
    }];
    const runtime = createKonveyorTreeImpostorGeometry(new THREE.PlaneGeometry(1, 1), instances, sidecar);
    const mesh = new THREE.InstancedMesh(runtime.geometry, new THREE.MeshBasicMaterial(), instances.length);
    installKonveyorTreeImpostorRuntime(mesh, {
      ...runtime,
      sidecar,
      treeType: 'tree1',
      chunkKey: '0:0',
    });

    const camera = { position: new THREE.Vector3(0, 1, 10) };
    expect(syncKonveyorTreeImpostorMesh(mesh, camera)).toBe(true);
    const firstOffset = [
      runtime.attributes.tileOffsets[0].getX(0),
      runtime.attributes.tileOffsets[0].getY(0),
    ];
    camera.position.set(10, 1, 0);
    expect(syncKonveyorTreeImpostorMesh(mesh, camera)).toBe(true);
    const nextOffset = [
      runtime.attributes.tileOffsets[0].getX(0),
      runtime.attributes.tileOffsets[0].getY(0),
    ];

    expect(nextOffset).not.toEqual(firstOffset);
    expect(mesh.userData.konveyorNativeTreeImpostor).toMatchObject({
      source: 'kiln-v2-octahedral-sidecar',
      version: 2,
      layout: 'octahedral',
      lastSelectionLayout: 'octahedral',
      syncCount: 2,
    });

    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it('keeps near tree chunks geometric and switches far chunks to impostors', () => {
    const nearMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
    const midMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
    const farMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial(), 1);
    const chunkCenter = new THREE.Vector3(0, 0, 0);
    installKonveyorTreeHybridRuntime(nearMesh, {
      role: 'near-lod0',
      chunkCenter,
      nearDistance: 5,
      switchDistance: 10,
    });
    installKonveyorTreeHybridRuntime(midMesh, {
      role: 'mid-lod1',
      chunkCenter,
      nearDistance: 5,
      switchDistance: 10,
    });
    installKonveyorTreeHybridRuntime(farMesh, {
      role: 'far-impostor',
      chunkCenter,
      nearDistance: 5,
      switchDistance: 10,
    });

    const camera = { position: new THREE.Vector3(0, 0, 2) };
    expect(syncKonveyorTreeHybridVisibility(nearMesh, camera)).toBe(true);
    expect(syncKonveyorTreeHybridVisibility(midMesh, camera)).toBe(true);
    expect(syncKonveyorTreeHybridVisibility(farMesh, camera)).toBe(true);
    expect(nearMesh.visible).toBe(true);
    expect(midMesh.visible).toBe(false);
    expect(farMesh.visible).toBe(false);

    camera.position.set(7, 0, 0);
    syncKonveyorTreeHybridVisibility(nearMesh, camera);
    syncKonveyorTreeHybridVisibility(midMesh, camera);
    syncKonveyorTreeHybridVisibility(farMesh, camera);
    expect(nearMesh.visible).toBe(false);
    expect(midMesh.visible).toBe(true);
    expect(farMesh.visible).toBe(false);

    camera.position.set(20, 0, 0);
    syncKonveyorTreeHybridVisibility(nearMesh, camera);
    syncKonveyorTreeHybridVisibility(midMesh, camera);
    syncKonveyorTreeHybridVisibility(farMesh, camera);
    expect(nearMesh.visible).toBe(false);
    expect(midMesh.visible).toBe(false);
    expect(farMesh.visible).toBe(true);

    nearMesh.geometry.dispose();
    nearMesh.material.dispose();
    midMesh.geometry.dispose();
    midMesh.material.dispose();
    farMesh.geometry.dispose();
    farMesh.material.dispose();
  });

  it('uses native Three instancing for production scene-body rock placement under the guarded flag', async () => {
    setProductionWebGpuWindow();
    const sceneDef = loadScene('field');
    const scene = new THREE.Scene();
    const builder = {
      modelsLoaded: true,
      scene,
      sceneDef,
      zones: sceneDef.terrain.zones,
      models: {
        rocks: {
          rock1: rockRoot(),
          rock2: rockRoot(),
          rock3: rockRoot(),
        },
      },
      isMobile: false,
      isInFarmHouseArea: () => false,
      _groundY: () => 0,
    };

    const meshes = await placeEnvironmentDetails(builder);

    expect(builder.konveyorNativeRockInstancingSummary).toMatchObject({
      applied: true,
      ok: true,
      source: 'THREE.InstancedMesh',
      route: 'konveyor-production-scene-body',
      productionReference: 'RockPlacement InstancedMesh2.addInstances',
    });
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every((mesh) => mesh.isInstancedMesh === true)).toBe(true);
    expect(meshes.some((mesh) => mesh.isInstancedMesh2 === true)).toBe(false);
    expect(scene.children.some((child) => child.isInstancedMesh2 === true)).toBe(false);
    expect(builder.konveyorRockPlacementPlan.totalRocks).toBe(builder.konveyorNativeRockInstancingSummary.rockInstances);
  });

  it('accepts empty native rock placement when an island scene filters every rock candidate', async () => {
    setProductionWebGpuWindow();
    const scene = new THREE.Scene();
    const sceneDef = {
      id: 'zero-rock-island',
      boundary: {
        kind: 'island',
        center: { x: 0, z: 0 },
        radius: 10,
        falloff: 4,
      },
      terrain: {
        seed: 7,
      },
    };
    const farZone = { minX: 100, maxX: 100, minZ: 100, maxZ: 100 };
    const builder = {
      modelsLoaded: true,
      scene,
      sceneDef,
      zones: {
        playArea: farZone,
        nearField: farZone,
        midField: farZone,
        farField: farZone,
        horizon: farZone,
      },
      models: {
        rocks: {
          rock1: rockRoot(),
          rock2: rockRoot(),
          rock3: rockRoot(),
        },
      },
      isMobile: false,
      isInFarmHouseArea: () => false,
      _groundY: () => 0,
    };

    const meshes = await placeEnvironmentDetails(builder);

    expect(meshes).toEqual([]);
    expect(builder.konveyorRockPlacementPlan.totalRocks).toBe(0);
    expect(builder.konveyorNativeRockInstancingSummary).toMatchObject({
      applied: true,
      ok: true,
      rockInstances: 0,
      renderedInstanceMeshes: 0,
      emptyPlacement: true,
      groups: [],
    });
    expect(scene.children).toHaveLength(0);
  });
});
