// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { buildDogGeometry, DOG_PAW_CONTACTS } from '@app/scene/dog/dogGeometry';
import { makeDogMaterial } from '@app/scene/dog/dogMaterial';
import { DogRig } from '@app/scene/dog/dogRig';
import { SPINE, FORE_LEG } from '@app/scene/dog/dogParts';
import { DOG_JOINTS } from '@app/scene/dog/dogRigDefinition';
import { createDogMotion, advanceDogMotion, resetDogMotion } from '@app/scene/dog/dogMotion';
import { dogGaitRate, dogStanceShare, sampleDogPaw, DOG_GAIT_TAU } from '@app/scene/dog/dogGait';
import { dogOutlineWidth } from '@app/scene/dog/outlineWidth';

function fixture() {
  const geometry = buildDogGeometry();
  const materials = makeDogMaterial();
  const rig = new DogRig(geometry, materials);
  const group = new THREE.Group();
  group.add(rig.coat, rig.outline);
  const dispose = () => { rig.dispose(); geometry.dispose(); materials.material.dispose(); materials.outlineMaterial.dispose(); };
  return { geometry, rig, group, dispose };
}

describe('owned collie skeleton', () => {
  it('pins the complete owned authoring chain and geometry budget', () => {
    const result = spawnSync(process.execPath, ['tools/record-dog-asset.mjs', '--check'], {
      cwd: process.cwd(), encoding: 'utf8', windowsHide: true, timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const ledger = JSON.parse(readFileSync('assets/dog/procedural-manifest.json', 'utf8')) as {
      bones: number; triangles: number; license: string;
    };
    expect(ledger.license).toBe('AGPL-3.0-or-later');
    expect(ledger.bones).toBe(DOG_JOINTS.length);
    const geometry = buildDogGeometry();
    expect(geometry.index!.count / 3).toBe(ledger.triangles);
    expect(ledger.triangles).toBeLessThan(3000);
    geometry.dispose();
  });
  it('has a real shared skeleton, normalized skin weights and a faithful bind pose', () => {
    const { geometry, rig, dispose } = fixture();
    try {
      expect(rig.coat).toBeInstanceOf(THREE.SkinnedMesh);
      expect(rig.outline.skeleton).toBe(rig.coat.skeleton);
      expect(rig.skeleton.bones).toHaveLength(22);
      expect(DOG_JOINTS.every((joint, index) => joint.parent < index)).toBe(true);
      rig.skeleton.update();
      const positions = geometry.getAttribute('position');
      const weights = geometry.getAttribute('skinWeight');
      const indices = geometry.getAttribute('skinIndex');
      const source = new THREE.Vector3();
      const posed = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1, 6);
        expect(Math.max(indices.getX(i), indices.getY(i), indices.getZ(i), indices.getW(i))).toBeLessThan(22);
        source.fromBufferAttribute(positions, i);
        rig.coat.applyBoneTransform(i, posed.copy(source));
        expect(posed.distanceTo(source)).toBeLessThan(1e-5);
      }
    } finally { dispose(); }
  });

  it('keeps chest paint ownership on the torso when forelegs overlap its paint coordinates', () => {
    const geometry = buildDogGeometry();
    try {
      const mask = geometry.getAttribute('dogBodyMask');
      const positions = geometry.getAttribute('position');
      const bodyCount = SPINE.length * 12 + 2;
      const leftForeEnd = bodyCount + FORE_LEG.length * 8 + 2;
      let bodyVertices = 0; let overlappingForelegVertices = 0;
      for (let i = 0; i < mask.count; i++) {
        if (i < bodyCount) {
          expect(mask.getX(i)).toBe(1); bodyVertices++;
        }
        if (i >= bodyCount && i < leftForeEnd) {
          expect(mask.getX(i)).toBe(0);
          if (positions.getZ(i) > 0.44 && positions.getY(i) > 0.7) overlappingForelegVertices++;
        }
      }
      expect(bodyVertices).toBeGreaterThan(100);
      expect(overlappingForelegVertices).toBeGreaterThan(10);
    } finally { geometry.dispose(); }
  });

  it('contains both posed shoulder attachment rings inside the actual skinned torso', () => {
    const { geometry, rig, group, dispose } = fixture();
    try {
      const positions = geometry.getAttribute('position');
      const skin = geometry.getAttribute('skinIndex');
      const mask = geometry.getAttribute('dogBodyMask');
      const triangles = geometry.index!;
      // Foreleg ownership remains in slot zero even where torso influence is 1.
      const roots: number[] = [];
      for (let i = 0; i < positions.count; i++) {
        if ((skin.getX(i) === 10 || skin.getX(i) === 13) && positions.getY(i) > 1.11) roots.push(i);
      }
      expect(roots).toHaveLength(34); // two complete rings + cap center, both shoulders
      const posed = Array.from({ length: positions.count }, () => new THREE.Vector3());
      const ray = new THREE.Ray();
      const hit = new THREE.Vector3();
      const direction = new THREE.Vector3(0.913, 0.217, 0.346).normalize();
      for (const speed of [0, 8, 15, 25]) {
        for (const phase of [0, 0.2, 0.48, 0.68, 0.9]) {
          const motion = createDogMotion();
          advanceDogMotion(motion, 1 / 60, speed, 0, 1);
          motion.gaitPhase = phase * DOG_GAIT_TAU;
          motion.roll = Math.sin(phase * DOG_GAIT_TAU) * 0.12;
          const yaw = phase - 0.5;
          group.rotation.y = yaw; group.updateMatrixWorld(true);
          rig.reset();
          rig.pose(motion, { groundY: () => 0 }, 0, 0, 0, yaw, 1);
          for (let i = 0; i < positions.count; i++) {
            posed[i]!.fromBufferAttribute(positions, i);
            rig.coat.applyBoneTransform(i, posed[i]!);
          }
          for (const root of roots) {
            ray.set(posed[root]!, direction);
            let crossings = 0;
            for (let t = 0; t < triangles.count; t += 3) {
              const a = triangles.getX(t), b = triangles.getX(t + 1), c = triangles.getX(t + 2);
              if (mask.getX(a) !== 1 || mask.getX(b) !== 1 || mask.getX(c) !== 1) continue;
              if (ray.intersectTriangle(posed[a]!, posed[b]!, posed[c]!, false, hit)) crossings++;
            }
            expect(crossings % 2, `root ${root}, speed ${speed}, phase ${phase}`).toBe(1);
          }
        }
      }
    } finally { dispose(); }
  });

  it.each([-0.25, 0.25])('preserves the skinned lift-off position through a %s radian turn', (yaw) => {
    const { geometry, rig, group, dispose } = fixture();
    try {
      const positions = geometry.getAttribute('position');
      const foot = DOG_PAW_CONTACTS[0]!;
      let index = 0; let best = Infinity;
      for (let i = 0; i < positions.count; i++) {
        const d = Math.hypot(positions.getX(i) - foot.x, positions.getY(i) - 0.02, positions.getZ(i) - foot.z);
        if (d < best) { best = d; index = i; }
      }
      const motion = createDogMotion();
      advanceDogMotion(motion, 1 / 60, 8, 0, 1);
      const stance = dogStanceShare(8);
      motion.gaitPhase = (stance - 0.02) * DOG_GAIT_TAU;
      group.position.y = -0.02; group.updateMatrixWorld(true);
      rig.pose(motion, { groundY: () => 0 }, 0, 0, 0, 0, 1);
      const before = new THREE.Vector3().fromBufferAttribute(positions, index);
      rig.coat.applyBoneTransform(index, before).applyMatrix4(rig.coat.matrixWorld);
      motion.gaitPhase = (stance + 1e-6) * DOG_GAIT_TAU;
      group.rotation.y = yaw; group.position.set(0.03, -0.02, 0.12); group.updateMatrixWorld(true);
      rig.pose(motion, { groundY: () => 0 }, 0.03, 0.12, 0, yaw, 1);
      const after = new THREE.Vector3().fromBufferAttribute(positions, index);
      rig.coat.applyBoneTransform(index, after).applyMatrix4(rig.coat.matrixWorld);
      expect(after.distanceTo(before)).toBeLessThan(0.01);
    } finally { dispose(); }
  });

  it.each([[2, 30], [2, 60], [8, 30], [8, 60], [15, 30], [15, 60], [25, 30], [25, 60]])('keeps planted soles near terrain at %s metres per second / %s Hz', (speed, hz) => {
    const { geometry, rig, group, dispose } = fixture();
    try {
      const positions = geometry.getAttribute('position');
      const soles = DOG_PAW_CONTACTS.map((foot) => {
        let nearest = 0;
        let best = Infinity;
        for (let i = 0; i < positions.count; i++) {
          if (Math.abs(positions.getY(i) - 0.02) > 1e-5) continue;
          const distance = Math.hypot(positions.getX(i) - foot.x, positions.getZ(i) - foot.z);
          if (distance < best) { best = distance; nearest = i; }
        }
        return nearest;
      });
      const field = { groundY: (x: number, z: number) => x * 0.018 + z * 0.009 };
      const motion = createDogMotion();
      const paw = { travel: 0, lift: 0, planted: false, recovery: 0 };
      const vertex = new THREE.Vector3();
      let contactError = 0;
      let slide = 0;
      const previous = Array.from({ length: 4 }, () => new THREE.Vector3());
      const previousPlanted = [false, false, false, false];
      for (let frame = 0; frame < 180; frame++) {
        const yaw = Math.sin(frame * 0.006) * 0.12;
        const x = 0;
        const z = frame / hz * speed;
        advanceDogMotion(motion, 1 / hz, speed, Math.sin(yaw), Math.cos(yaw));
        const ground = field.groundY(x, z);
        group.position.set(x, ground - 0.02, z);
        group.rotation.y = yaw;
        group.updateMatrixWorld(true);
        rig.pose(motion, field, x, z, ground, yaw, 1);
        for (let foot = 0; foot < 4; foot++) {
          sampleDogPaw(motion.gaitPhase, motion.locomotionSpeed, foot, paw);
          if (!paw.planted) { previousPlanted[foot] = false; continue; }
          const index = soles[foot]!;
          vertex.fromBufferAttribute(positions, index);
          rig.coat.applyBoneTransform(index, vertex).applyMatrix4(rig.coat.matrixWorld);
          expect([vertex.x, vertex.y, vertex.z].every(Number.isFinite)).toBe(true);
          contactError = Math.max(contactError, Math.abs(vertex.y - field.groundY(vertex.x, vertex.z)));
          if (previousPlanted[foot]) slide = Math.max(slide, vertex.distanceTo(previous[foot]!));
          previous[foot]!.copy(vertex);
          previousPlanted[foot] = true;
        }
      }
      expect(contactError).toBeLessThan(0.035);
      expect(slide).toBeLessThan(0.01);
    } finally { dispose(); }
  });
});

describe('dog animation timing', () => {
  it('plants backward, recovers forward in air and gives sprint its own cadence', () => {
    for (const speed of [2, 8, 15, 25]) {
      const stance = dogStanceShare(speed);
      const out = { travel: 0, lift: 0, planted: false, recovery: 0 };
      sampleDogPaw(0, speed, 0, out);
      const strike = out.travel;
      sampleDogPaw((stance - 1e-5) * DOG_GAIT_TAU, speed, 0, out);
      expect(out.planted).toBe(true);
      expect(out.lift).toBe(0);
      expect(out.travel).toBeLessThan(-strike * 0.99);
      sampleDogPaw((stance + (1 - stance) / 2) * DOG_GAIT_TAU, speed, 0, out);
      expect(out.planted).toBe(false);
      expect(out.lift).toBeGreaterThan(0);
      expect(Math.abs(out.travel)).toBeLessThan(1e-5);
    }
    expect(dogGaitRate(25)).toBeGreaterThan(dogGaitRate(15) * 1.25);
  });
  it('gets up promptly and freezes every pose clock on pause', () => {
    const motion = createDogMotion();
    for (let i = 0; i < 600; i++) advanceDogMotion(motion, 1 / 60, 0, 0, 1);
    expect(motion.sit).toBeGreaterThan(0.99);
    for (let i = 0; i < 12; i++) advanceDogMotion(motion, 1 / 60, 4, 0, 1);
    expect(motion.sit).toBeLessThan(0.08);
    const frozen = { ...motion };
    advanceDogMotion(motion, 10, 25, 1, 0, 1, true);
    expect(motion).toEqual(frozen);
    resetDogMotion(motion);
    expect(motion).toEqual(createDogMotion());
  });
  it('drives one bounded accepted-bark response and retains gait under reduced motion', () => {
    const normal = createDogMotion();
    const reduced = createDogMotion();
    advanceDogMotion(normal, 1 / 60, 0, 0, 1, 1, false, true);
    for (let i = 0; i < 10; i++) advanceDogMotion(normal, 1 / 60, 0, 0, 1);
    expect(normal.bark).toBeGreaterThan(0.8);
    for (let i = 0; i < 30; i++) advanceDogMotion(normal, 1 / 60, 0, 0, 1);
    expect(normal.bark).toBe(0);
    resetDogMotion(normal);
    for (let i = 0; i < 120; i++) {
      advanceDogMotion(normal, 1 / 60, 25, 0, 1, 1);
      advanceDogMotion(reduced, 1 / 60, 25, 0, 1, 0.25);
    }
    expect(reduced.gaitPhase).toBe(normal.gaitPhase);
    expect(reduced.locomotionSpeed).toBe(normal.locomotionSpeed);
    expect(Math.abs(reduced.bob)).toBeCloseTo(Math.abs(normal.bob) * 0.25, 6);
  });
  it('adapts outline metres to the current lens', () => {
    const narrow = 1 / Math.tan(38 * Math.PI / 360);
    const wide = 1 / Math.tan(76 * Math.PI / 360);
    expect(dogOutlineWidth(wide, 8, 900)).toBeGreaterThan(dogOutlineWidth(narrow, 8, 900));
  });
});
