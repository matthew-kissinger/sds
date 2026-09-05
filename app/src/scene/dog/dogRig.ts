// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Real bone hierarchy shared by coat and outline, with authored pose blending and foot contacts. */
import * as THREE from 'three/webgpu';
import type { Heightfield } from '@app/world/heightfield';
import { DOG_PAW_CONTACTS } from './dogGeometry';
import { DOG_JOINTS, DOG_LEG_ROOTS } from './dogRigDefinition';
import { sampleDogPaw, type DogPawPose } from './dogGait';
import { DogLegSolver } from './dogLegSolver';
import type { DogMaterial } from './dogMaterial';
import type { DogMotion } from './dogMotion';

export class DogRig {
  readonly bones: THREE.Bone[];
  readonly skeleton: THREE.Skeleton;
  readonly coat: THREE.SkinnedMesh;
  readonly outline: THREE.SkinnedMesh;
  private readonly restPositions: THREE.Vector3[];
  private readonly solvers: DogLegSolver[];
  private readonly target = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private readonly rotationInverse = new THREE.Quaternion();
  private readonly paws: DogPawPose[] = Array.from({ length: 4 }, () => ({ travel: 0, lift: 0, planted: true, recovery: 0 }));
  private readonly locks = new Float64Array(8);
  private readonly recoveryOffsets = new Float64Array(8);
  private readonly planted = [false, false, false, false];
  constructor(geometry: THREE.BufferGeometry, material: DogMaterial) {
    this.bones = DOG_JOINTS.map((joint) => {
      const bone = new THREE.Bone();
      bone.name = joint.name;
      bone.position.fromArray(joint.position);
      if (joint.parent >= 0) bone.position.sub(new THREE.Vector3().fromArray(DOG_JOINTS[joint.parent]!.position));
      return bone;
    });
    for (let i = 1; i < this.bones.length; i++) this.bones[DOG_JOINTS[i]!.parent]!.add(this.bones[i]!);
    this.restPositions = this.bones.map((bone) => bone.position.clone());
    this.coat = new THREE.SkinnedMesh(geometry, material.material);
    this.outline = new THREE.SkinnedMesh(geometry, material.outlineMaterial);
    this.coat.name = 'collie-skinned-coat';
    this.outline.name = 'collie-skinned-outline';
    this.coat.add(this.bones[0]!);
    this.coat.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.coat.bind(this.skeleton);
    this.outline.bind(this.skeleton, this.coat.bindMatrix);
    // A single nearby player mesh: do not use rest-pose bounds to cull posed ears/feet.
    this.coat.frustumCulled = false;
    this.outline.frustumCulled = false;
    this.solvers = DOG_LEG_ROOTS.map((index) => new DogLegSolver(this.bones, index));
  }
  reset(): void {
    this.planted.fill(false);
    this.recoveryOffsets.fill(0);
    this.resetBones();
  }
  private resetBones(): void {
    for (let i = 0; i < this.bones.length; i++) {
      this.bones[i]!.position.copy(this.restPositions[i]!);
      this.bones[i]!.quaternion.identity();
      this.bones[i]!.scale.setScalar(1);
    }
  }
  pose(motion: DogMotion, field: Pick<Heightfield, 'groundY'>,
    x: number, z: number, ground: number, yaw: number, secondaryMotion: number): void {
    this.resetBones();
    const bones = this.bones;
    const moving = Math.min(1, motion.locomotionSpeed / 1.5);
    // Bend the body into its stride envelope so fixed-length limbs can reach,
    // instead of stretching a paw to compensate for a rigid high torso.
    bones[0]!.position.y = -0.17 * moving * (1 - motion.sit) + motion.bob;
    bones[1]!.position.y -= motion.sit * 0.3;
    bones[1]!.position.z -= motion.sit * 0.06;
    bones[1]!.rotation.set(-motion.sit * 0.35, 0, motion.roll * 0.35);
    bones[2]!.rotation.x = motion.sit * 0.22;
    bones[3]!.rotation.set(motion.lean, motion.roll * -0.22, motion.roll * 0.6);
    bones[4]!.rotation.x = -motion.bark * 0.12 - motion.sit * 0.09;
    bones[5]!.rotation.set(motion.effort * 0.035 - motion.bark * 0.11, motion.roll * -0.4, motion.headTilt);
    bones[6]!.rotation.z = Math.sin(motion.clock * 0.7) * 0.035 * secondaryMotion;
    bones[7]!.rotation.z = Math.sin(motion.clock * 0.7 + 1.7) * 0.035 * secondaryMotion;
    bones[8]!.rotation.set(motion.effort * 0.06, Math.sin(motion.clock * 2.1) * 0.10 * secondaryMotion, 0);
    bones[9]!.rotation.y = Math.sin(motion.clock * 2.1 - 0.6) * 0.1 * secondaryMotion;
    this.coat.updateWorldMatrix(true, true);
    this.inverse.copy(this.coat.matrixWorld).invert();
    this.coat.getWorldQuaternion(this.rotationInverse).invert();
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (let foot = 0; foot < 4; foot++) {
      const paw = this.paws[foot]!;
      sampleDogPaw(motion.gaitPhase, motion.locomotionSpeed, foot, paw);
      const rest = DOG_PAW_CONTACTS[foot]!;
      const travel = paw.travel * (1 - motion.sit);
      const seatedAdvance = foot >= 2 ? motion.sit * 0.16 : 0;
      let localX = rest.x;
      let localZ = rest.z + travel + seatedAdvance;
      let worldX = x + localX * c + localZ * s;
      let worldZ = z - localX * s + localZ * c;
      const lock = paw.planted && motion.speed > 0.08 && motion.sit < 0.05;
      if (lock && this.planted[foot]) {
        worldX = this.locks[foot * 2]!;
        worldZ = this.locks[foot * 2 + 1]!;
        const dx = worldX - x;
        const dz = worldZ - z;
        localX = dx * c - dz * s;
        localZ = dx * s + dz * c;
      } else if (!this.planted[foot] || paw.planted) {
        this.locks[foot * 2] = worldX;
        this.locks[foot * 2 + 1] = worldZ;
      }
      if (!paw.planted) {
        // A turning stance ends away from the straight-ahead foot line. Preserve
        // that actual lift-off target, then return smoothly over the swing.
        if (this.planted[foot]) {
          const dx = this.locks[foot * 2]! - x;
          const dz = this.locks[foot * 2 + 1]! - z;
          this.recoveryOffsets[foot * 2] = dx * c - dz * s - localX;
          this.recoveryOffsets[foot * 2 + 1] = dx * s + dz * c - localZ;
        }
        const remaining = 1 - paw.recovery * paw.recovery * (3 - 2 * paw.recovery);
        localX += this.recoveryOffsets[foot * 2]! * remaining;
        localZ += this.recoveryOffsets[foot * 2 + 1]! * remaining;
        worldX = x + localX * c + localZ * s;
        worldZ = z - localX * s + localZ * c;
      } else this.recoveryOffsets.fill(0, foot * 2, foot * 2 + 2);
      this.planted[foot] = lock;
      const lift = paw.lift * (1 - motion.sit);
      const terrain = field.groundY(worldX, worldZ) - ground;
      this.target.set(localX, 0.2 + terrain + lift, localZ - 0.068);
      this.solvers[foot]!.solve(this.target, this.inverse, this.rotationInverse);
    }
    this.coat.updateWorldMatrix(true, true);
    this.skeleton.update();
  }
  dispose(): void { this.skeleton.dispose(); }
}
