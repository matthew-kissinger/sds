// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Placements to instanced meshes. Two draw calls for a whole fence, gate and
 * all: one post buffer and one rail buffer, each carrying its reversed outline
 * hull beside the surface. The perimeter is 800 m of timber and the gate is
 * another thirty sticks, and a pier shaft differs from a
 * line post by its instance matrix and one number in an instance attribute, not
 * by a second material, so the landmark costs nothing at draw time.
 *
 * THE OUTLINE SHARES THE SOLID'S MATRICES. It used to carry its own, scaled up
 * by a constant, which grew a post's foot half again as fast as its head and a
 * 20 cm rail four times as fast as its 5 m span - the fat asymmetric blobs at
 * post tops. The shell is now grown along the vertex normal in the shader
 * instead (timberMaterial.ts), which needs nothing per instance but the inverse
 * of that instance's own scale, so the matrix buffer is written once and read
 * twice.
 *
 * Everything here runs once, at mount. Nothing is allocated per frame: a fence
 * does not move, and the ground under it does not either.
 */

import * as THREE from 'three/webgpu';
import type { PostPlacement, RailPlacement } from './placement';
import type { GateLeafAssembly } from './gateKit';
import { postTimberGeometry, railTimberGeometry } from './postGeometry';
import { makeTimberMaterial } from './timberMaterial';

const UP = new THREE.Vector3(0, 1, 0);
const ALONG = new THREE.Vector3(1, 0, 0);

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: Float32Array,
  count: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(matrices, 16);
  // The fence bounds the world, so its bounding volume IS the world; culling it
  // per frame is work with one possible answer.
  mesh.frustumCulled = false;
  return mesh;
}

/** One surface-plus-outline instance batch for every post, line and pier alike. */
export function buildPosts(posts: readonly PostPlacement[]): THREE.InstancedMesh[] {
  const count = posts.length;
  const data = new Float32Array(count * 4);
  const inverse = new Float32Array(count * 3);
  const matrices = new Float32Array(count * 16);
  const dummy = new THREE.Object3D();
  const tilt = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const lift = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const post = posts[i]!;
    axis.set(Math.cos(post.tiltDir) * post.tilt, 1, Math.sin(post.tiltDir) * post.tilt).normalize();
    tilt.setFromUnitVectors(UP, axis);
    spin.setFromAxisAngle(UP, post.yaw);
    dummy.quaternion.copy(tilt).multiply(spin);
    // The foot is the anchor, not the centre: a post leans away from where it
    // was driven into the ground, so the base stays put and the top moves.
    lift.set(0, post.height / 2, 0).applyQuaternion(dummy.quaternion);
    dummy.position.set(post.x + lift.x, post.baseY + lift.y, post.z + lift.z);
    dummy.scale.set(post.girth, post.height, post.girth);
    dummy.updateMatrix();
    dummy.matrix.toArray(matrices, i * 16);

    data[i * 4] = post.seed;
    data[i * 4 + 1] = post.tone;
    data[i * 4 + 2] = post.height;
    data[i * 4 + 3] = post.girth;
    inverse[i * 3] = 1 / post.girth;
    inverse[i * 3 + 1] = 1 / post.height;
    inverse[i * 3 + 2] = 1 / post.girth;
  }

  const material = makeTimberMaterial(
    new THREE.InstancedBufferAttribute(data, 4),
    new THREE.InstancedBufferAttribute(inverse, 3),
    'post',
  );
  return [
    instanced(postTimberGeometry(), material, matrices, count),
  ];
}

export interface FenceRailBatch {
  readonly meshes: readonly THREE.InstancedMesh[];
  /** 0 is the authored open pose, 1 lies both leaves on the fence line. */
  updateGate(progress: number): void;
}

/**
 * One surface-plus-outline batch for every static rail and animated gate board.
 * The moving boards occupy the tail of the instance buffer, so completion only
 * rewrites and uploads that small range. Static rails never move or cross a GPU
 * upload boundary after mount.
 */
export function buildRails(
  rails: readonly RailPlacement[],
  leaves: readonly GateLeafAssembly[] = [],
): FenceRailBatch {
  let gateCount = 0;
  for (const leaf of leaves) gateCount += leaf.parts.length;
  const staticCount = rails.length;
  const count = staticCount + gateCount;
  const data = new Float32Array(count * 4);
  const inverse = new Float32Array(count * 3);
  const matrices = new Float32Array(count * 16);
  const dummy = new THREE.Object3D();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const direction = new THREE.Vector3();

  function writeAttributes(rail: RailPlacement, index: number): void {
    const dx = rail.bx - rail.ax;
    const dy = rail.by - rail.ay;
    const dz = rail.bz - rail.az;
    const span = Math.sqrt(dx * dx + dy * dy + dz * dz);
    data[index * 4] = rail.seed;
    data[index * 4 + 1] = rail.topness;
    data[index * 4 + 2] = span;
    data[index * 4 + 3] = rail.tone;
    inverse[index * 3] = 1 / span;
    inverse[index * 3 + 1] = 1 / rail.thickness;
    inverse[index * 3 + 2] = 1 / rail.depth;
  }

  function writeMatrix(rail: RailPlacement, index: number): void {
    from.set(rail.ax, rail.ay, rail.az);
    to.set(rail.bx, rail.by, rail.bz);
    direction.subVectors(to, from);
    const span = direction.length();
    direction.divideScalar(span);
    // Minimal rotation from the box's own long axis onto the bay: the bar
    // pitches with the ground and yaws with a leaning post, and never rolls.
    dummy.quaternion.setFromUnitVectors(ALONG, direction);
    dummy.position.addVectors(from, to).multiplyScalar(0.5);
    dummy.scale.set(span, rail.thickness, rail.depth);
    dummy.updateMatrix();
    dummy.matrix.toArray(matrices, index * 16);
  }

  for (let i = 0; i < staticCount; i++) {
    const rail = rails[i]!;
    writeAttributes(rail, i);
    writeMatrix(rail, i);
  }

  let gateIndex = staticCount;
  for (const leaf of leaves) {
    for (const rail of leaf.parts) {
      writeAttributes(rail, gateIndex);
      writeMatrix(rail, gateIndex);
      gateIndex++;
    }
  }

  const material = makeTimberMaterial(
    new THREE.InstancedBufferAttribute(data, 4),
    new THREE.InstancedBufferAttribute(inverse, 3),
    'rail',
  );
  const solid = instanced(railTimberGeometry(), material, matrices, count);
  const matrixAttributes = [solid.instanceMatrix] as const;
  let lastProgress = 0;

  function updateGate(progress: number): void {
    if (progress === lastProgress || gateCount === 0) return;
    let write = staticCount;
    for (const leaf of leaves) {
      const angle = leaf.closeTurn * progress;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      for (const rail of leaf.parts) {
        const ax = rail.ax - leaf.hingeX;
        const az = rail.az - leaf.hingeZ;
        const bx = rail.bx - leaf.hingeX;
        const bz = rail.bz - leaf.hingeZ;
        from.set(
          leaf.hingeX + ax * c - az * s,
          rail.ay,
          leaf.hingeZ + ax * s + az * c,
        );
        to.set(
          leaf.hingeX + bx * c - bz * s,
          rail.by,
          leaf.hingeZ + bx * s + bz * c,
        );
        direction.subVectors(to, from);
        const span = direction.length();
        direction.divideScalar(span);
        dummy.quaternion.setFromUnitVectors(ALONG, direction);
        dummy.position.addVectors(from, to).multiplyScalar(0.5);
        dummy.scale.set(span, rail.thickness, rail.depth);
        dummy.updateMatrix();
        dummy.matrix.toArray(matrices, write * 16);
        write++;
      }
    }
    const tailStart = staticCount * 16;
    const tailLength = gateCount * 16;
    for (const attribute of matrixAttributes) {
      attribute.addUpdateRange(tailStart, tailLength);
      attribute.needsUpdate = true;
    }
    lastProgress = progress;
  }

  return { meshes: [solid], updateGate };
}
