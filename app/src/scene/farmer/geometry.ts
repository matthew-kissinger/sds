// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Owned low-poly farmer recipe, one merged body, thirteen actual skin joints. */
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '@app/tsl/palette';

export const FARMER_JOINTS = [
  ['hips', -1, 0, 1.1, 0], ['spine', 0, 0, 0.48, 0], ['head', 1, 0, 0.65, 0],
  ['leftArm', 1, 0.39, 0.40, 0], ['leftElbow', 3, 0, -0.42, 0],
  ['rightArm', 1, -0.39, 0.40, 0], ['rightElbow', 5, 0, -0.42, 0],
  ['leftLeg', 0, 0.18, 0, 0], ['leftKnee', 7, 0, -0.53, 0], ['leftFoot', 8, 0, -0.53, 0],
  ['rightLeg', 0, -0.18, 0, 0], ['rightKnee', 10, 0, -0.53, 0], ['rightFoot', 11, 0, -0.53, 0],
] as const;
export type FarmerJoint = (typeof FARMER_JOINTS)[number][0];
export type FarmerBones = Record<FarmerJoint, THREE.Bone>;

export function buildFarmer() {
  const list: THREE.Bone[] = [];
  const bones = {} as FarmerBones;
  for (const [name, parent, x, y, z] of FARMER_JOINTS) {
    const bone = new THREE.Bone(); bone.name = name; bone.position.set(x, y, z);
    if (parent >= 0) list[parent]!.add(bone);
    list.push(bone); bones[name] = bone;
  }
  list[0]!.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const tint = new THREE.Color();
  const add = (geometry: THREE.BufferGeometry, joint: FarmerJoint, tone: string,
    x: number, y: number, z: number) => {
    geometry.translate(x, y, z);
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    const indices = new Uint16Array(count * 4);
    const weights = new Float32Array(count * 4);
    const jointIndex = list.indexOf(bones[joint]); tint.set(tone);
    for (let i = 0; i < count; i++) {
      colors.set([tint.r, tint.g, tint.b], i * 3);
      indices[i * 4] = jointIndex; weights[i * 4] = 1;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
    parts.push(geometry);
  };
  const round = (joint: FarmerJoint, tone: string, x: number, y: number, z: number,
    sx: number, sy: number, sz: number) => {
    const g = new THREE.SphereGeometry(1, 10, 6); g.scale(sx, sy, sz);
    add(g, joint, tone, x, y, z);
  };
  const tube = (joint: FarmerJoint, tone: string, x: number, y: number, z: number,
    top: number, bottom: number, height: number) => {
    add(new THREE.CylinderGeometry(top, bottom, height, 8), joint, tone, x, y, z);
  };
  // A supported waist and sloping shoulder replace the narrow spherical shirt.
  // Lathe normals turn through the same shared lighting ramp as all other solids.
  const shirt = new THREE.LatheGeometry([
    new THREE.Vector2(0, -0.42), new THREE.Vector2(0.29, -0.42),
    new THREE.Vector2(0.35, -0.24), new THREE.Vector2(0.42, 0.06),
    new THREE.Vector2(0.40, 0.22), new THREE.Vector2(0.31, 0.35),
    new THREE.Vector2(0.14, 0.44), new THREE.Vector2(0, 0.44),
  ], 10);
  shirt.scale(1, 1, 0.67);
  add(shirt, 'spine', PALETTE.farmerShirt, 0, 1.76, 0);
  round('hips', PALETTE.farmerOveralls, 0, 1.22, 0, 0.32, 0.30, 0.23);
  add(new THREE.BoxGeometry(0.40, 0.48, 0.045), 'spine', PALETTE.farmerOveralls, 0, 1.65, 0.245);
  for (const x of [-0.15, 0.15]) {
    add(new THREE.BoxGeometry(0.065, 0.33, 0.07), 'spine', PALETTE.farmerOveralls, x, 1.96, 0.19);
    round('spine', PALETTE.farmerHat, x, 1.81, 0.275, 0.028, 0.028, 0.016);
  }
  tube('head', PALETTE.farmerSkin, 0, 2.15, 0, 0.12, 0.13, 0.23);
  round('head', PALETTE.farmerSkin, 0, 2.38, 0, 0.25, 0.29, 0.23);
  round('head', PALETTE.farmerSkin, 0, 2.37, 0.23, 0.075, 0.08, 0.08);
  // A broad asymmetrical brim and pinched crown carry identity at gameplay scale.
  const brim = new THREE.CylinderGeometry(0.47, 0.47, 0.055, 12); brim.scale(1, 1, 0.88); brim.rotateZ(-0.065);
  add(brim, 'head', PALETTE.farmerHat, 0, 2.60, 0);
  tube('head', PALETTE.farmerHat, 0, 2.73, 0, 0.23, 0.30, 0.27);
  tube('head', PALETTE.farmerBoots, 0, 2.64, 0, 0.29, 0.30, 0.055);
  for (const x of [-0.095, 0.095]) round('head', PALETTE.farmerInk, x, 2.43, 0.215, 0.026, 0.029, 0.02);
  for (const side of ['left', 'right'] as const) {
    const x = side === 'left' ? 1 : -1;
    const sleeve = new THREE.LatheGeometry([
      new THREE.Vector2(0, -0.215), new THREE.Vector2(0.12, -0.215),
      new THREE.Vector2(0.14, -0.14), new THREE.Vector2(0.155, 0.045),
      new THREE.Vector2(0.13, 0.16), new THREE.Vector2(0.055, 0.23),
      new THREE.Vector2(0, 0.23),
    ], 8);
    sleeve.rotateZ(x * 0.045);
    add(sleeve, `${side}Arm`, PALETTE.farmerShirt, x * 0.39, 1.79, 0);
    tube(`${side}Elbow`, PALETTE.farmerSkin, x * 0.40, 1.36, 0, 0.115, 0.09, 0.42);
    round(`${side}Elbow`, PALETTE.farmerSkin, x * 0.40, 1.12, 0, 0.105, 0.14, 0.09);
    tube(`${side}Leg`, PALETTE.farmerOveralls, x * 0.18, 0.86, 0, 0.17, 0.125, 0.53);
    tube(`${side}Knee`, PALETTE.farmerOveralls, x * 0.18, 0.36, 0, 0.13, 0.115, 0.51);
    round(`${side}Foot`, PALETTE.farmerBoots, x * 0.18, 0.11, 0.10, 0.16, 0.11, 0.25);
  }
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const skeleton = new THREE.Skeleton(list);
  return { geometry, skeleton, root: list[0]!, bones };
}
