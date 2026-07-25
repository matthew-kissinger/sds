// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { StructureBuilder } from '../js/StructureBuilder.js';

/**
 * Characterization tests for js/StructureBuilder.js (Three.js structure +
 * fence builder). READ-ONLY: these lock the CURRENT ACTUAL behavior so a
 * future refactor that changes it has to do so deliberately. They are not
 * aspirational — where the source's behavior contradicts its own docstring
 * (the "idempotent" claim on _surfaceToTerrain only holds for the rail/slope
 * path, not for plain tagged posts), the test asserts what the code really
 * does today.
 *
 * Heightfield stub: a plane sample(x, z) = 12 + x - z. Linear so endpoint
 * means and slopes are hand-checkable.
 *
 * No GLB models are loaded, so FencePresets falls back to procedural
 * BoxGeometry/CylinderGeometry meshes — exactly the per-call-geometry path
 * clearAllStructures is responsible for disposing.
 */

const STUB_HF = { sample: (x, z) => 12 + x - z };

function makeBuilder(withHeightfield = true) {
  const scene = new THREE.Scene();
  const sb = new StructureBuilder(scene);
  if (withHeightfield) sb.setHeightfield(STUB_HF);
  return { scene, sb };
}

function makeModule(name, meshName, geometry, meshY = 0) {
  const group = new THREE.Group();
  group.name = name;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = meshName;
  mesh.position.y = meshY;
  group.add(mesh);
  return group;
}

function makeGateAssemblyWithLeafPivots() {
  const group = new THREE.Group();
  group.name = 'Gate_Assembly';
  group.userData.authoredWidth = 8;
  const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 0.3), new THREE.MeshBasicMaterial());
  leftPost.name = 'Mesh_LeftPostCombined';
  leftPost.position.set(-4, 1.1, 0);
  const rightPost = leftPost.clone();
  rightPost.name = 'Mesh_RightPostCombined';
  rightPost.position.x = 4;
  group.add(leftPost, rightPost);

  const leftLeaf = new THREE.Group();
  leftLeaf.name = 'LeftLeafPivot';
  leftLeaf.position.set(-3.8, 0, 0);
  leftLeaf.rotation.y = THREE.MathUtils.degToRad(-72);
  const leftWood = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.4, 0.12), new THREE.MeshBasicMaterial());
  leftWood.name = 'Mesh_LeftGateWood';
  leftWood.position.set(1.8, 0.9, 0);
  leftLeaf.add(leftWood);

  const rightLeaf = new THREE.Group();
  rightLeaf.name = 'RightLeafPivot';
  rightLeaf.position.set(3.8, 0, 0);
  rightLeaf.rotation.y = THREE.MathUtils.degToRad(-72);
  const rightWood = leftWood.clone();
  rightWood.name = 'Mesh_RightGateWood';
  rightWood.position.x = -1.8;
  rightLeaf.add(rightWood);

  group.add(leftLeaf, rightLeaf);
  return group;
}

function installFenceKit(sb) {
  sb.fencePresets.useGLBModels = true;
  sb.fencePresets.models.fencePost = makeModule(
    'Fence_Post',
    'Mesh_Fence_Post_Runtime',
    new THREE.BoxGeometry(0.4, 2, 0.4),
    1,
  );
  sb.fencePresets.models.fenceRail = makeModule(
    'Fence_Rail',
    'Mesh_Fence_Rail_Runtime',
    new THREE.BoxGeometry(1, 0.1, 0.12),
  );
}

function instancePosition(instancedMesh, index) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  instancedMesh.getMatrixAt(index, matrix);
  position.setFromMatrixPosition(matrix);
  return position;
}

/**
 * The post WRAPPER origin (the foot the terrain sample places), recovered from
 * an instance matrix. Cycle 114 gave posts a seeded per-instance lean and
 * height scale, so the mesh centre inside the wrapper no longer sits at a fixed
 * offset above the foot. The fixture post mesh is authored 1m up inside its
 * wrapper, so back that offset out through whatever rotation and scale the
 * instance carries.
 */
function instancePostBase(instancedMesh, index) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  instancedMesh.getMatrixAt(index, matrix);
  matrix.decompose(position, quaternion, scale);
  const meshOffset = new THREE.Vector3(0, 1, 0).multiply(scale).applyQuaternion(quaternion);
  return position.sub(meshOffset);
}

describe('buildHomesteadGate — authored gate asset vs fallback door', () => {
  const HOMESTEAD = {
    gate: { x: 0, z: 0, width: 8, facingDeg: 90 },
    pen: { center: { x: 20, z: 0 }, radius: 24 },
  };

  it('uses authored GLB leaf pivots for gate animation without rotating the whole asset', () => {
    const { sb } = makeBuilder(false);
    sb.fencePresets.useGLBModels = true;
    sb.fencePresets.models.gateAssembly = makeGateAssemblyWithLeafPivots();

    const group = sb.buildHomesteadGate(HOMESTEAD);
    const door = group.getObjectByName('HomesteadGateAssetDoor');
    const leftLeaf = group.getObjectByName('HomesteadGateDoorLeft');
    const rightLeaf = group.getObjectByName('HomesteadGateDoorRight');

    expect(group.getObjectByName('Gate_Assembly')).toBeTruthy();
    expect(group.getObjectByName('HomesteadGateDoor')).toBeUndefined();
    expect(sb._homesteadDoor).toBe(door);
    expect(door.rotation.y).toBeCloseTo(0, 6);
    expect(leftLeaf.rotation.y).toBeCloseTo(THREE.MathUtils.degToRad(-72), 6);
    expect(rightLeaf.rotation.y).toBeCloseTo(THREE.MathUtils.degToRad(-72), 6);
    sb.setHomesteadGateOpen(false);
    sb.updateGate(1);
    expect(door.rotation.y).toBeCloseTo(0, 6);
    expect(leftLeaf.rotation.y).toBeCloseTo(0, 6);
    expect(rightLeaf.rotation.y).toBeCloseTo(0, 6);
  });

  it('keeps the procedural swing door as the no-asset fallback', () => {
    const { sb } = makeBuilder(false);
    sb.fencePresets.useGLBModels = false;

    const group = sb.buildHomesteadGate(HOMESTEAD);
    const door = group.getObjectByName('HomesteadGateDoor');

    expect(door).toBeTruthy();
    expect(sb._homesteadDoor).toBe(door);
    sb.setHomesteadGateOpen(false);
    sb.updateGate(1);
    expect(door.rotation.y).toBeCloseTo(0, 6);
  });
});

describe('GLB fence segment instancing', () => {
  it('collapses repeated GLB posts and rails into terrain-aware instanced meshes', () => {
    const { scene, sb } = makeBuilder();
    installFenceKit(sb);

    const segment = sb.buildFenceSegment({ x: -5, z: 0 }, { x: 5, z: 0 });
    scene.add(segment);

    sb._surfaceToTerrain(segment);

    const posts = segment.getObjectByName('Fence_Post_Instances');
    const rails = segment.getObjectByName('Fence_Rail_Instances');
    expect(posts).toBeInstanceOf(THREE.InstancedMesh);
    expect(rails).toBeInstanceOf(THREE.InstancedMesh);
    expect(segment.getObjectByName('Fence_Post')).toBeUndefined();
    expect(segment.getObjectByName('Fence_Rail')).toBeUndefined();
    expect(posts.count).toBe(3);
    expect(rails.count).toBe(6);
    expect(segment.userData.fenceInstanceCounts).toEqual({ posts: 3, rails: 6 });

    // Each post's foot lands on its own terrain sample: sample(-5, 0) = 7 and
    // sample(5, 0) = 17. Rails are not jittered, so their midpoint is still the
    // endpoint-height mean plus the rail height: (7 + 17)/2 + 0.5 = 10.
    expect(instancePostBase(posts, 0).y).toBeCloseTo(7, 6);
    expect(instancePostBase(posts, 2).y).toBeCloseTo(17, 6);
    expect(instancePosition(rails, 0).y).toBeCloseTo(10, 6);
  });

  it('rebuilds flat instance matrices when terrain becomes available later', () => {
    const { scene, sb } = makeBuilder(false);
    installFenceKit(sb);

    const segment = sb.buildFenceSegment({ x: -5, z: 0 }, { x: 5, z: 0 });
    scene.add(segment);
    sb._surfaceToTerrain(segment);

    const flatPosts = segment.getObjectByName('Fence_Post_Instances');
    expect(instancePostBase(flatPosts, 0).y).toBeCloseTo(0, 6);
    expect(segment.userData.fenceInstancedWithTerrain).toBe(false);

    sb.setHeightfield(STUB_HF);
    sb._surfaceToTerrain(segment);

    const terrainPosts = segment.getObjectByName('Fence_Post_Instances');
    expect(instancePostBase(terrainPosts, 0).y).toBeCloseTo(7, 6);
    expect(segment.userData.fenceInstancedWithTerrain).toBe(true);
  });
});

describe('_surfaceToTerrain — plain tagged node (post / flag / gate group)', () => {
  it('adds heightfield.sample(worldX, worldZ) to the node local Y', () => {
    const { scene, sb } = makeBuilder();
    const root = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    post.position.set(10, 0, 4); // sample(10,4) = 12 + 10 - 4 = 18
    post.userData.surfaceToTerrain = true;
    root.add(post);
    scene.add(root);

    sb._surfaceToTerrain(root);
    expect(post.position.y).toBeCloseTo(18, 10);
  });

  it('samples at the node WORLD (x,z), including any parent offset', () => {
    const { scene, sb } = makeBuilder();
    const root = new THREE.Group();
    root.position.set(5, 0, -5); // shifts world x/z used for the sample
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    post.position.set(10, 0, 4); // world (15, 0, -1) -> sample = 12 + 15 - (-1) = 28
    post.userData.surfaceToTerrain = true;
    root.add(post);
    scene.add(root);

    sb._surfaceToTerrain(root);
    expect(post.position.y).toBeCloseTo(28, 10);
  });

  it('re-running on a plain post DOUBLE-LIFTS (not idempotent): it re-samples the already-lifted node', () => {
    // The docstring calls _surfaceToTerrain idempotent, but for non-rail
    // tagged nodes getWorldPosition reports the post-lift Y; x/z are
    // unchanged so the same sample value is added again. This is the
    // current actual behavior and is locked here intentionally.
    const { scene, sb } = makeBuilder();
    const root = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    post.position.set(10, 0, 4); // sample = 18
    post.userData.surfaceToTerrain = true;
    root.add(post);
    scene.add(root);

    sb._surfaceToTerrain(root);
    expect(post.position.y).toBeCloseTo(18, 10);
    sb._surfaceToTerrain(root);
    expect(post.position.y).toBeCloseTo(36, 10); // 18 + 18, lifted twice
  });

  it('is a no-op when no heightfield is set', () => {
    const { scene, sb } = makeBuilder(false); // no heightfield
    const root = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    post.position.set(10, 0, 4);
    post.userData.surfaceToTerrain = true;
    root.add(post);
    scene.add(root);

    sb._surfaceToTerrain(root);
    expect(post.position.y).toBe(0);
  });

  it('ignores untagged nodes', () => {
    const { scene, sb } = makeBuilder();
    const root = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    post.position.set(10, 0, 4); // would sample to 18 if tagged
    // no userData.surfaceToTerrain
    root.add(post);
    scene.add(root);

    sb._surfaceToTerrain(root);
    expect(post.position.y).toBe(0);
  });
});

describe('_slopeRailToTerrain — repositions to endpoint-height mean and tilts to slope', () => {
  // Rail centred at parent-local (0, baseY, 0), horizontal axis, halfLen 5.
  // Endpoints sample at world x = -5 and +5 (z = 0):
  //   hA = sample(-5, 0) = 12 - 5 - 0 = 7
  //   hB = sample(+5, 0) = 12 + 5 - 0 = 17
  //   lifted endpoint Ys: 7 + baseY and 17 + baseY
  //   midpoint Y = ((7+baseY) + (17+baseY)) / 2 = 12 + baseY  (mean of the two)
  // Slope over dx = 10 is dy = 10 -> a clean 45 degrees about Z.
  const BASE_Y = 1.2;

  function makeRailRoot() {
    const root = new THREE.Group();
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    rail.position.set(0, BASE_Y, 0);
    rail.userData.surfaceToTerrain = true;
    rail.userData.railSpan = { halfLen: 5, axis: 'horizontal', geomAxis: 'x', baseY: BASE_Y };
    root.add(rail);
    return { root, rail };
  }

  it('moves the rail Y to the mean of its two endpoint terrain heights (+ baseY)', () => {
    const { scene, sb } = makeBuilder();
    const { root, rail } = makeRailRoot();
    scene.add(root);

    sb._surfaceToTerrain(root);
    // mean endpoint height = (7 + 17)/2 = 12, plus baseY = 13.2
    expect(rail.position.y).toBeCloseTo(12 + BASE_Y, 6);
    // X/Z midpoint unchanged (endpoints symmetric about local origin)
    expect(rail.position.x).toBeCloseTo(0, 6);
    expect(rail.position.z).toBeCloseTo(0, 6);
  });

  it('tilts the rail toward the slope (quaternion is a non-identity rotation about Z)', () => {
    const { scene, sb } = makeBuilder();
    const { root, rail } = makeRailRoot();
    scene.add(root);

    sb._surfaceToTerrain(root);

    // geomAxis 'x' base unit vector (1,0,0) rotated to the A->B direction.
    // Slope rises +10 over +10 in X -> 45 deg about -? axis. Components:
    const q = rail.quaternion;
    // Pure rotation about Z: x and y quaternion components are ~0.
    expect(Math.abs(q.x)).toBeLessThan(1e-9);
    expect(Math.abs(q.y)).toBeLessThan(1e-9);
    expect(Math.abs(q.z)).toBeGreaterThan(0.1); // clearly non-identity
    // 45-degree slope -> half-angle 22.5 deg -> sin(22.5) ~= 0.38268
    expect(Math.abs(q.z)).toBeCloseTo(Math.sin(Math.PI / 8), 5);

    // The rail's local +X axis ends up pointing up-slope (+x, +y, equal parts).
    const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(dir.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(dir.y).toBeCloseTo(Math.SQRT1_2, 5);
    expect(dir.z).toBeCloseTo(0, 6);
  });

  it('is idempotent: a second pass recomputes from railSpan, no drift in position or rotation', () => {
    const { scene, sb } = makeBuilder();
    const { root, rail } = makeRailRoot();
    scene.add(root);

    sb._surfaceToTerrain(root);
    const y1 = rail.position.y;
    const q1 = rail.quaternion.clone();

    sb._surfaceToTerrain(root);
    expect(rail.position.y).toBeCloseTo(y1, 10);
    expect(rail.quaternion.x).toBeCloseTo(q1.x, 10);
    expect(rail.quaternion.y).toBeCloseTo(q1.y, 10);
    expect(rail.quaternion.z).toBeCloseTo(q1.z, 10);
    expect(rail.quaternion.w).toBeCloseTo(q1.w, 10);
  });

  it('uses geomAxis "z" base vector when tagged so (rotation still spans the slope)', () => {
    // A vertical-orientation procedural rail tags geomAxis 'z'. With a
    // horizontal-span railSpan the endpoints are still along X, so the base
    // axis (0,0,1) must rotate to a +x/+y direction: that is a rotation that
    // mixes axes (not a pure single-component quaternion). We only assert it
    // produces a finite, non-identity rotation that lands the long axis on
    // the slope direction.
    const { scene, sb } = makeBuilder();
    const root = new THREE.Group();
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    rail.position.set(0, BASE_Y, 0);
    rail.userData.surfaceToTerrain = true;
    rail.userData.railSpan = { halfLen: 5, axis: 'horizontal', geomAxis: 'z', baseY: BASE_Y };
    root.add(rail);
    scene.add(root);

    sb._surfaceToTerrain(root);
    const q = rail.quaternion;
    expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true);
    // local +Z maps onto the A->B slope direction (+x, +y equal parts).
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(dir.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(dir.y).toBeCloseTo(Math.SQRT1_2, 5);
    // Y still lands on the endpoint-height mean.
    expect(rail.position.y).toBeCloseTo(12 + BASE_Y, 6);
  });

  it('does nothing if the rail has no parent', () => {
    const { sb } = makeBuilder();
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    rail.position.set(0, BASE_Y, 0);
    rail.userData.railSpan = { halfLen: 5, axis: 'horizontal', geomAxis: 'x', baseY: BASE_Y };
    // parent is null
    const before = rail.position.clone();
    sb._slopeRailToTerrain(rail);
    expect(rail.position.equals(before)).toBe(true);
  });
});

describe('closestPointOnSegment', () => {
  it('returns the perpendicular foot for an interior projection (t in (0,1))', () => {
    const { sb } = makeBuilder(false);
    // Segment along +X from (0,0) to (10,0); query above the midpoint.
    const r = sb.closestPointOnSegment(4, 3, { x: 0, z: 0 }, { x: 10, z: 0 });
    expect(r.x).toBeCloseTo(4, 10);
    expect(r.z).toBeCloseTo(0, 10);
    expect(r.t).toBeCloseTo(0.4, 10);
  });

  it('clamps to the start endpoint when the projection falls before the segment (t = 0)', () => {
    const { sb } = makeBuilder(false);
    const r = sb.closestPointOnSegment(-5, 2, { x: 0, z: 0 }, { x: 10, z: 0 });
    expect(r.x).toBeCloseTo(0, 10);
    expect(r.z).toBeCloseTo(0, 10);
    expect(r.t).toBe(0);
  });

  it('clamps to the end endpoint when the projection falls past the segment (t = 1)', () => {
    const { sb } = makeBuilder(false);
    const r = sb.closestPointOnSegment(20, 2, { x: 0, z: 0 }, { x: 10, z: 0 });
    expect(r.x).toBeCloseTo(10, 10);
    expect(r.z).toBeCloseTo(0, 10);
    expect(r.t).toBe(1);
  });

  it('returns the start point with t = 0 for a zero-length segment', () => {
    const { sb } = makeBuilder(false);
    const r = sb.closestPointOnSegment(7, 9, { x: 3, z: 4 }, { x: 3, z: 4 });
    expect(r.x).toBe(3);
    expect(r.z).toBe(4);
    expect(r.t).toBe(0);
  });
});

describe('buildPolygonBorderFences — gate gap on the correct edge, pen flipped outward', () => {
  // Axis-aligned 100x100 square, vertices listed so edge 0 is the south edge
  // (z = -50) running +X. Gate sits on the south edge at x = 0.
  const SQUARE = [
    { x: -50, z: -50 }, // 0
    { x: 50, z: -50 },  // 1  (edge 0: south, z=-50)
    { x: 50, z: 50 },   // 2
    { x: -50, z: 50 },  // 3
  ];
  const GATE = { width: 8, position: { x: 0, z: -50 } };
  const PASTURE = { minX: -20, maxX: 20, minZ: -30, maxZ: 30 }; // width 40, depth 60

  function findGateStructure(group) {
    // The gate structure is the child placed by createGateStructure: it is a
    // Group containing two gate posts + arch + threshold. The fence segments
    // are also Groups, but the gate is the one whose position lands on the
    // gap centre (south edge, z ~= -50, x ~= 0). Identify by position.
    return group.children.find(
      c => Math.abs(c.position.z - (-50)) < 0.5 && Math.abs(c.position.x - 0) < 0.5,
    );
  }

  it('places the gate structure on the south edge at the gate x (gap centre)', () => {
    const { sb } = makeBuilder(false);
    const group = sb.buildPolygonBorderFences(SQUARE, GATE, null);

    const gate = findGateStructure(group);
    expect(gate).toBeTruthy();
    expect(gate.position.x).toBeCloseTo(0, 3);
    expect(gate.position.z).toBeCloseTo(-50, 3);
    // South edge runs along +X, so the gate's gap direction is ~horizontal:
    // rotation.y = -atan2(0, +dx) = 0.
    expect(gate.rotation.y).toBeCloseTo(0, 3);
  });

  it('leaves a gap in the south-edge fencing the width of the gate (no fence spans the gate centre)', () => {
    const { sb } = makeBuilder(false);
    const group = sb.buildPolygonBorderFences(SQUARE, GATE, null);

    // Collect every fence-segment child (Groups that are NOT the gate
    // structure) and check none is centred at the gate gap on the south edge.
    const gate = findGateStructure(group);
    const segments = group.children.filter(c => c !== gate);

    // No segment midpoint should sit inside the 8-wide gap centred at x=0 on
    // the south edge. Border segments built along the south edge keep z ~= -50;
    // their midpoints must be outside [-4, 4] in x.
    const southSegsInGap = segments.filter(
      c => Math.abs(c.position.z - (-50)) < 0.5 && Math.abs(c.position.x) < 3.9,
    );
    expect(southSegsInGap.length).toBe(0);

    // Sanity: the south edge still produced fencing on BOTH sides of the gap.
    const southSegs = segments.filter(c => Math.abs(c.position.z - (-50)) < 0.5);
    const leftOfGap = southSegs.some(c => c.position.x < -4);
    const rightOfGap = southSegs.some(c => c.position.x > 4);
    expect(leftOfGap).toBe(true);
    expect(rightOfGap).toBe(true);
  });

  it('flips the pasture pen OUTWARD: back fence sits beyond the south edge (z < -50)', () => {
    const { sb } = makeBuilder(false);
    const group = sb.buildPolygonBorderFences(SQUARE, GATE, PASTURE);

    // Pen depth is 60. Outward from the south edge is -Z, so the back fence
    // (and side fences' far ends) must extend to roughly z = -50 - 60 = -110,
    // i.e. OUTSIDE the polygon, not into it (z > -50).
    // Gather positions of all fence-segment children south of the edge.
    const childZ = group.children.map(c => c.position.z);
    const minZ = Math.min(...childZ);
    expect(minZ).toBeLessThan(-50); // pen extends outward past the edge

    // And nothing was pushed deep INTO the field (the pen is not inward).
    // The deepest inward fencing is the far (north) edge at z ~= +50; assert
    // the pen did not create a back fence near z = +10 (which is where an
    // inward, un-flipped pen of depth 60 would have landed: -50 + 60).
    const inwardPenBack = group.children.some(
      c => Math.abs(c.position.z - 10) < 1 && Math.abs(c.position.x) < 25,
    );
    expect(inwardPenBack).toBe(false);
  });

  it('returns a named THREE.Group containing fence + gate children', () => {
    const { sb } = makeBuilder(false);
    const group = sb.buildPolygonBorderFences(SQUARE, GATE, PASTURE);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe('PolygonBorderFences');
    expect(group.children.length).toBeGreaterThan(0);
  });
});

describe('clearAllStructures — disposes per-call geometry, preserves shared materials, empties arrays', () => {
  it('disposes each element geometry exactly once', () => {
    const { scene, sb } = makeBuilder(false);
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    g.add(mesh);
    scene.add(g);
    sb.structures.fences.push(g);

    const geoSpy = vi.spyOn(geo, 'dispose');
    const matSpy = vi.spyOn(mat, 'dispose');

    sb.clearAllStructures();

    expect(geoSpy).toHaveBeenCalledTimes(1);
    // GLB-shared materials must survive (next clone would otherwise re-upload
    // textures). clearAllStructures only disposes geometry.
    expect(matSpy).not.toHaveBeenCalled();
  });

  it('does NOT dispose materials even across multiple meshes sharing one material', () => {
    const { scene, sb } = makeBuilder(false);
    const shared = new THREE.MeshBasicMaterial();
    const g = new THREE.Group();
    const geoA = new THREE.BoxGeometry(1, 1, 1);
    const geoB = new THREE.CylinderGeometry(1, 1, 2, 8);
    g.add(new THREE.Mesh(geoA, shared));
    g.add(new THREE.Mesh(geoB, shared));
    scene.add(g);
    sb.structures.fences.push(g);

    const sharedSpy = vi.spyOn(shared, 'dispose');
    const geoASpy = vi.spyOn(geoA, 'dispose');
    const geoBSpy = vi.spyOn(geoB, 'dispose');

    sb.clearAllStructures();

    expect(sharedSpy).not.toHaveBeenCalled();
    expect(geoASpy).toHaveBeenCalledTimes(1);
    expect(geoBSpy).toHaveBeenCalledTimes(1);
  });

  it('removes elements from their parent and empties every structures array', () => {
    const { scene, sb } = makeBuilder(false);
    const fence = new THREE.Group();
    fence.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    const deco = new THREE.Group();
    deco.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    scene.add(fence);
    scene.add(deco);
    sb.structures.fences.push(fence);
    sb.structures.decorations.push(deco);

    expect(fence.parent).toBe(scene);

    sb.clearAllStructures();

    expect(fence.parent).toBe(null);
    expect(deco.parent).toBe(null);
    expect(sb.structures.fences.length).toBe(0);
    expect(sb.structures.gates.length).toBe(0);
    expect(sb.structures.pastures.length).toBe(0);
    expect(sb.structures.decorations.length).toBe(0);
  });

  it('is safe to call when all arrays are already empty', () => {
    const { sb } = makeBuilder(false);
    expect(() => sb.clearAllStructures()).not.toThrow();
    expect(sb.structures.fences.length).toBe(0);
  });
});
