// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three/webgpu';
import sourceDigests from '../assets/farmer/source-digests.json';
import { HOME_FIELD } from '@sim/field';
import { BARN, BARN_AT, BARN_YAW, HOUSE, HOUSE_AT, YAW, WING, WING_ALONG, WING_OUT, WING_SKEW } from '@app/scene/farmhouse/plan';
import { buildFarmer } from '@app/scene/farmer/geometry';
import { poseFarmer } from '@app/scene/farmer/animation';
import { advanceFarmerMotion, createFarmerMotion, FARMER_CYCLE_SECONDS } from '@app/scene/farmer/route';

const wingX = HOUSE_AT.x + WING_ALONG * Math.cos(YAW) + WING_OUT * Math.sin(YAW);
const wingZ = HOUSE_AT.z - WING_ALONG * Math.sin(YAW) + WING_OUT * Math.cos(YAW);
const buildings = [
  { ...HOUSE_AT, yaw: YAW, shape: HOUSE },
  { x: wingX, z: wingZ, yaw: YAW + WING_SKEW, shape: WING },
  { ...BARN_AT, yaw: BARN_YAW, shape: BARN },
];
describe('ambient farmer', () => {
  it.each(['left', 'right'] as const)('keeps the actual skinned %s stance boot on flat ground throughout a stride', (side) => {
    const rig = buildFarmer();
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.SkinnedMesh(rig.geometry, material);
    mesh.add(rig.root); mesh.bind(rig.skeleton);
    const position = rig.geometry.getAttribute('position');
    const skin = rig.geometry.getAttribute('skinIndex');
    const footIndex = rig.skeleton.bones.indexOf(rig.bones[`${side}Foot`]);
    const motion = createFarmerMotion();
    motion.activity = 'walk'; motion.speed = 0.85;
    const point = new THREE.Vector3();
    for (const phase of [0, 0.15, 0.30, 0.45, 0.59]) {
      motion.distance = ((phase + (side === 'right' ? 0.5 : 0)) % 1) * 1.1;
      poseFarmer(rig.bones, motion, false, () => 0, 0);
      mesh.updateMatrixWorld(true); rig.skeleton.update();
      let sole = Infinity;
      for (let i = 0; i < position.count; i++) {
        if (skin.getX(i) !== footIndex) continue;
        point.fromBufferAttribute(position, i);
        mesh.applyBoneTransform(i, point);
        sole = Math.min(sole, point.y);
      }
      expect(Math.abs(sole), `stance phase ${phase}`).toBeLessThan(0.005);
    }
    rig.geometry.dispose(); rig.skeleton.dispose(); material.dispose();
  });
  it('pins the editable geometry, rig, animation and route recipe', () => {
    for (const [path, expected] of Object.entries(sourceDigests.sha256)) {
      const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
      expect(createHash('sha256').update(source).digest('hex')).toBe(expected);
    }
  });
  it('walks a complete continuous cycle clear of actual buildings and fenced pasture', () => {
    const motion = createFarmerMotion();
    const activities = new Set<string>();
    for (let i = 0; i < Math.ceil(FARMER_CYCLE_SECONDS * 60) + 30; i++) {
      const x = motion.x; const z = motion.z;
      advanceFarmerMotion(motion, 1 / 60, false);
      expect(Math.hypot(motion.x - x, motion.z - z)).toBeLessThan(0.02);
      expect(motion.z).toBeGreaterThan(HOME_FIELD.bounds.maxZ + 2);
      expect(motion.x > HOME_FIELD.pen.maxX + 1 || motion.z > HOME_FIELD.pen.maxZ + 1).toBe(true);
      for (const building of buildings) {
        const dx = motion.x - building.x; const dz = motion.z - building.z;
        const localX = dx * Math.cos(building.yaw) - dz * Math.sin(building.yaw);
        const localZ = dx * Math.sin(building.yaw) + dz * Math.cos(building.yaw);
        expect(Math.abs(localX) > building.shape.length / 2 + 1 || Math.abs(localZ) > building.shape.width / 2 + 1).toBe(true);
      }
      activities.add(motion.activity);
    }
    expect([...activities].sort()).toEqual(['inspect', 'look', 'walk']);
  });
  it('freezes route and animation phase during pause', () => {
    const motion = createFarmerMotion(); advanceFarmerMotion(motion, 0.04, false);
    const snapshot = { ...motion };
    advanceFarmerMotion(motion, 5, true); expect(motion).toEqual(snapshot);
  });
  it('builds a small actual skeleton with finite normalized skin weights', () => {
    const rig = buildFarmer();
    expect(rig.skeleton.bones.length).toBe(13);
    expect(rig.geometry.index!.count / 3).toBeLessThan(3500);
    const weights = rig.geometry.getAttribute('skinWeight');
    const indices = rig.geometry.getAttribute('skinIndex');
    for (let i = 0; i < weights.count; i++) {
      expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1);
      expect(indices.getX(i)).toBeLessThan(rig.skeleton.bones.length);
    }
    expect(rig.geometry.boundingBox!.min.y).toBeCloseTo(0);
    rig.geometry.dispose(); rig.skeleton.dispose();
  });
  it('uses distinct chores and distance-driven leg articulation, retaining walking under reduced motion', () => {
    const rig = buildFarmer(); const motion = createFarmerMotion();
    motion.activityTime = 3; motion.waitRemaining = 4;
    poseFarmer(rig.bones, motion, false, () => 0, 0);
    expect(rig.bones.spine.rotation.x).toBeGreaterThan(0.3);
    motion.activity = 'look';
    poseFarmer(rig.bones, motion, false, () => 0, 0);
    expect(rig.bones.rightArm.rotation.x).toBeLessThan(-1);
    motion.activity = 'walk'; motion.speed = 0.85; motion.distance = 0.36;
    poseFarmer(rig.bones, motion, true, () => 0, 0);
    expect(Math.abs(rig.bones.leftLeg.rotation.x - rig.bones.rightLeg.rotation.x)).toBeGreaterThan(0.1);
    expect(rig.bones.spine.rotation.z).toBe(0);
    rig.geometry.dispose(); rig.skeleton.dispose();
  });
});
