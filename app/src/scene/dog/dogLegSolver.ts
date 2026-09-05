// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Two-bone limb solver with fixed lengths and a level paw. All scratch is pooled. */
import * as THREE from 'three/webgpu';
import { DOG_JOINTS } from './dogRigDefinition';
export class DogLegSolver {
  private readonly origin = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly knee = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly upperRest = new THREE.Vector3();
  private readonly lowerRest = new THREE.Vector3();
  private readonly desired = new THREE.Quaternion();
  private readonly parent = new THREE.Quaternion();
  private readonly upperLength: number;
  private readonly lowerLength: number;
  constructor(private readonly bones: readonly THREE.Bone[], private readonly index: number) {
    const a = DOG_JOINTS[index]!.position;
    const b = DOG_JOINTS[index + 1]!.position;
    const c = DOG_JOINTS[index + 2]!.position;
    this.upperRest.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this.lowerRest.set(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
    this.upperLength = this.upperRest.length();
    this.lowerLength = this.lowerRest.length();
    this.upperRest.normalize();
    this.lowerRest.normalize();
  }
  solve(target: THREE.Vector3, modelInverse: THREE.Matrix4, modelRotationInverse: THREE.Quaternion): void {
    const upper = this.bones[this.index]!;
    const lower = this.bones[this.index + 1]!;
    const paw = this.bones[this.index + 2]!;
    upper.getWorldPosition(this.origin).applyMatrix4(modelInverse);
    this.direction.subVectors(target, this.origin);
    const requested = this.direction.length();
    const distance = Math.min(this.upperLength + this.lowerLength - 1e-5,
      Math.max(Math.abs(this.upperLength - this.lowerLength) + 1e-5, requested));
    if (requested < 1e-6) this.direction.set(0, -1, 0);
    else this.direction.multiplyScalar(1 / requested);
    this.end.copy(this.origin).addScaledVector(this.direction, distance);
    this.pole.set(0, 0, -1).addScaledVector(this.direction, this.direction.z);
    if (this.pole.lengthSq() < 1e-6) this.pole.set(1, 0, 0);
    this.pole.normalize();
    const along = (this.upperLength ** 2 - this.lowerLength ** 2 + distance ** 2) / (2 * distance);
    const bend = Math.sqrt(Math.max(0, this.upperLength ** 2 - along ** 2));
    this.knee.copy(this.origin).addScaledVector(this.direction, along).addScaledVector(this.pole, bend);
    this.direction.subVectors(this.knee, this.origin).normalize();
    this.desired.setFromUnitVectors(this.upperRest, this.direction);
    upper.parent!.getWorldQuaternion(this.parent).premultiply(modelRotationInverse).invert();
    upper.quaternion.copy(this.parent).multiply(this.desired);
    upper.updateWorldMatrix(false, true);
    this.direction.subVectors(this.end, this.knee).normalize();
    this.desired.setFromUnitVectors(this.lowerRest, this.direction);
    lower.parent!.getWorldQuaternion(this.parent).premultiply(modelRotationInverse).invert();
    lower.quaternion.copy(this.parent).multiply(this.desired);
    lower.updateWorldMatrix(false, true);
    // Soles stay parallel to the local ground plane instead of rolling with the knee.
    paw.parent!.getWorldQuaternion(this.parent).premultiply(modelRotationInverse).invert();
    paw.quaternion.copy(this.parent);
    paw.updateWorldMatrix(false, true);
  }
}
