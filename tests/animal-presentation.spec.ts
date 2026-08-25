// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CpuDeterministicSim } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import { FIXED_DT } from '@sim/tuning';
import type { PlayerInputs } from '@sim/types';
import { decodeHeightfield, type HeightfieldManifest } from '@app/world/heightfieldSampler';
import {
  DOG_PAW_BASELINE,
  DOG_PAW_CONTACTS,
  FORE_PAW,
  HIND_PAW,
  buildDogGeometry,
} from '@app/scene/dog/dogGeometry';
import { FORE_LEG, PAW, SPINE, THIGH } from '@app/scene/dog/dogParts';
import {
  DOG_HEADING_STEP_LIMIT,
  advanceDogMotion,
  createDogMotion,
} from '@app/scene/dog/dogMotion';
import { smoothHeadingInto } from '@app/scene/flock/headingSmoothing';
import {
  HOOF_LIFT,
  SHEEP_HEADING_STEP_LIMIT,
  SHEEP_MAX_SPEED_MPS,
  SHEEP_STANCE_SHARE,
  sheepGaitRateForAgitation,
  sheepLegPose,
  sheepStrideForAgitation,
} from '@app/scene/flock/flockTuning';
import {
  SHEEP_HOOF_BASELINE,
  SHEEP_AUTHORED_LEG_SPAN,
  SHEEP_HOOF_CONTACTS,
  SHEEP_HOOF_SOLE_POINTS,
} from '@app/scene/flock/sheepParts';
import {
  SHEEP_TERRAIN_OFFSET_LIMIT,
  footTerrainOffset,
  writeSheepTerrainOffsets,
} from '@app/scene/flock/terrainPlanting';

const terrain = join(process.cwd(), 'assets', 'terrain');
const manifest = JSON.parse(
  readFileSync(join(terrain, 'manifest.json'), 'utf8'),
) as HeightfieldManifest;
const bytes = readFileSync(join(terrain, 'heightfield.bin'));
const field = decodeHeightfield(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  manifest,
);

const DRIVE: readonly PlayerInputs[] = [
  { direction: { x: 0.82, z: 0.57 }, sprint: true, bark: false },
];

function plantedError(
  rootX: number,
  rootZ: number,
  yaw: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  foot: { readonly x: number; readonly z: number },
  swingZ: number,
): number {
  const rootGround = field.groundY(rootX, rootZ);
  const offset = footTerrainOffset(
    field, rootGround, rootX, rootZ, yaw, scaleX, scaleY, scaleZ, foot, swingZ,
  );
  const localX = foot.x * scaleX;
  const localZ = (foot.z + swingZ) * scaleZ;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const worldX = rootX + c * localX + s * localZ;
  const worldZ = rootZ - s * localX + c * localZ;
  return Math.abs(rootGround + offset * scaleY - field.groundY(worldX, worldZ));
}

describe('animal terrain planting', () => {
  it('accounts for the authored dog sole baseline', () => {
    const geometry = buildDogGeometry();
    const position = geometry.getAttribute('position');
    let minimum = Number.POSITIVE_INFINITY;
    for (let i = 0; i < position.count; i++) minimum = Math.min(minimum, position.getY(i));
    expect(minimum).toBeCloseTo(DOG_PAW_BASELINE, 6);
  });

  it('plants moving hoof centres on the drawn heightfield for 25 and 200 sheep paths', () => {
    let maxError = 0;
    for (const count of [25, 200]) {
      const sim = new CpuDeterministicSim(HOME_FIELD, count, 20260821);
      for (let tick = 0; tick < 180; tick++) {
        sim.step(DRIVE, FIXED_DT);
        const swing = Math.sin(tick * 0.137) * 0.24;
        for (let i = 0; i < count; i++) {
          const x = sim.positions[i * 2]!;
          const z = sim.positions[i * 2 + 1]!;
          const yaw = Math.PI / 2 - sim.headings[i]!;
          for (let foot = 0; foot < 4; foot++) {
            const signedSwing = foot === 0 || foot === 3 ? swing : -swing;
            maxError = Math.max(
              maxError,
              plantedError(x, z, yaw, 0.93, 1.08, 1.04, SHEEP_HOOF_CONTACTS[foot]!, signedSwing),
            );
          }
        }
      }
    }
    expect(maxError).toBeLessThan(1e-6);
  });

  it('keeps every authored stance-sole vertex within 3 cm through gait', () => {
    const sim = new CpuDeterministicSim(HOME_FIELD, 200, 20260821);
    let maxError = 0;
    for (let tick = 0; tick < 180; tick++) {
      sim.step(DRIVE, FIXED_DT);
      const phase = tick * 0.137;
      const stride = 0.24;
      for (let i = 0; i < sim.headings.length; i++) {
        const x = sim.positions[i * 2]!;
        const z = sim.positions[i * 2 + 1]!;
        const yaw = Math.PI / 2 - sim.headings[i]!;
        const rootGround = field.groundY(x, z);
        const offsets = SHEEP_HOOF_CONTACTS.map((contact, foot) => footTerrainOffset(
          field,
          rootGround,
          x,
          z,
          yaw,
          0.93,
          1.08,
          1.04,
          contact,
          sheepLegPose(phase, foot === 0 || foot === 3 ? 1 : -1).travel * stride,
        ));
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        for (const sole of SHEEP_HOOF_SOLE_POINTS) {
          const pose = sheepLegPose(phase, sole.legSign);
          if (!pose.planted) continue;
          const localX = sole.x * 0.93;
          const localZ = (sole.z + pose.travel * stride) * 1.04;
          const footX = x + c * localX + s * localZ;
          const footZ = z - s * localX + c * localZ;
          const renderedY = rootGround - SHEEP_HOOF_BASELINE * 1.08
            + (sole.y + offsets[sole.contact]!) * 1.08;
          maxError = Math.max(maxError, Math.abs(renderedY - field.groundY(footX, footZ)));
        }
      }
    }
    expect(maxError).toBeLessThan(0.03);
  });

  it('caps terrain extension without stretching the authored leg span', () => {
    const sim = new CpuDeterministicSim(HOME_FIELD, 200, 20260821);
    const offsets = new Float32Array(4);
    let maxOffset = 0;
    let maxSpan = 0;
    for (let tick = 0; tick < 180; tick++) {
      sim.step(DRIVE, FIXED_DT);
      const phase = tick * 0.137;
      const positiveSwing = sheepLegPose(phase, 1).travel * 0.24;
      const negativeSwing = sheepLegPose(phase, -1).travel * 0.24;
      for (let i = 0; i < sim.headings.length; i++) {
        const x = sim.positions[i * 2]!;
        const z = sim.positions[i * 2 + 1]!;
        const yaw = Math.PI / 2 - sim.headings[i]!;
        writeSheepTerrainOffsets(
          offsets,
          0,
          field,
          field.groundY(x, z),
          x,
          z,
          Math.cos(yaw),
          Math.sin(yaw),
          0.93,
          1.08,
          1.04,
          positiveSwing,
          negativeSwing,
        );
        for (const offset of offsets) {
          maxOffset = Math.max(maxOffset, Math.abs(offset));
          maxSpan = Math.max(maxSpan, SHEEP_AUTHORED_LEG_SPAN - offset);
        }
      }
    }
    expect(maxOffset).toBeLessThan(SHEEP_TERRAIN_OFFSET_LIMIT);
    expect(maxSpan).toBeLessThanOrEqual(
      SHEEP_AUTHORED_LEG_SPAN + SHEEP_TERRAIN_OFFSET_LIMIT,
    );
  });

  it('plants all four dog paw centres through opposing gait travel', () => {
    let maxError = 0;
    for (let phase = 0; phase < Math.PI * 2; phase += 0.07) {
      const swing = Math.sin(phase) * 0.45;
      for (let foot = 0; foot < 4; foot++) {
        const signedSwing = foot === 0 || foot === 3 ? -swing : swing;
        maxError = Math.max(
          maxError,
          plantedError(-18.4, -11.7, 2.4, 1, 1, 1, DOG_PAW_CONTACTS[foot]!, signedSwing),
        );
      }
    }
    expect(maxError).toBeLessThan(1e-6);
  });
});

describe('sheep gait', () => {
  it('plants backward and recovers forward while lifted', () => {
    const strike = sheepLegPose(0, 1);
    const toeOff = sheepLegPose((SHEEP_STANCE_SHARE - 1e-4) * Math.PI * 2, 1);
    const recovery = sheepLegPose(
      (SHEEP_STANCE_SHARE + (1 - SHEEP_STANCE_SHARE) * 0.5) * Math.PI * 2,
      1,
    );
    const nextStrike = sheepLegPose((1 - 1e-4) * Math.PI * 2, 1);

    expect(strike.planted).toBe(true);
    expect(strike.travel).toBeCloseTo(1, 6);
    expect(toeOff.planted).toBe(true);
    expect(toeOff.travel).toBeLessThan(-0.99);
    expect(recovery.planted).toBe(false);
    expect(recovery.lift).toBeCloseTo(1, 6);
    expect(recovery.travel).toBeCloseTo(0, 6);
    expect(nextStrike.planted).toBe(false);
    expect(nextStrike.travel).toBeGreaterThan(0.99);
  });

  it('reduces planted-foot travel error without over-speeding the walk', () => {
    for (const agitation of [0.1, 0.25]) {
      const stride = sheepStrideForAgitation(agitation);
      const rate = sheepGaitRateForAgitation(agitation);
      const bodyTravelDuringStance = agitation * SHEEP_MAX_SPEED_MPS
        * SHEEP_STANCE_SHARE * Math.PI * 2 / rate;
      const plantedHoofSweep = stride * 2;
      const forwardSlip = bodyTravelDuringStance - plantedHoofSweep;

      expect(forwardSlip).toBeGreaterThanOrEqual(0);
      expect(forwardSlip / bodyTravelDuringStance).toBeLessThan(0.15);
      expect(rate / (Math.PI * 2)).toBeLessThan(1.8);
    }
  });

  it('keeps rest breathing slow and caps the running cadence', () => {
    expect(sheepGaitRateForAgitation(0)).toBeCloseTo(1.6, 6);
    expect(sheepGaitRateForAgitation(1)).toBeLessThanOrEqual(14);
  });

  it('makes walking travel read wider than its vertical hoof lift', () => {
    const stride = sheepStrideForAgitation(0.25);
    expect(stride).toBeGreaterThan(0.2);
    expect(stride * HOOF_LIFT).toBeLessThan(0.12);
  });
});

describe('dog anatomy', () => {
  it('keeps the shoulders and thighs under the body envelope with separated legs', () => {
    const ribHalfWidth = SPINE.find((ring) => ring.z === 0.35)!.halfWidth;
    const haunchHalfWidth = SPINE.find((ring) => ring.z === -0.56)!.halfWidth;
    const upperArmHalfWidth = Math.max(...FORE_LEG.map((ring) => ring.halfWidth));
    const thighHalfWidth = Math.max(...THIGH.map((ring) => ring.halfWidth));
    const pawHalfWidth = Math.max(...PAW.map((ring) => ring.halfWidth));

    expect(FORE_PAW.x + upperArmHalfWidth).toBeLessThan(ribHalfWidth);
    expect(HIND_PAW.x + thighHalfWidth).toBeLessThan(haunchHalfWidth);
    expect(FORE_PAW.x - upperArmHalfWidth).toBeGreaterThan(0);
    expect(HIND_PAW.x - thighHalfWidth).toBeGreaterThan(0);
    expect(FORE_PAW.x - pawHalfWidth).toBeGreaterThan(0.1);
    expect(HIND_PAW.x - pawHalfWidth).toBeGreaterThan(0.1);
  });
});

describe('animal heading presentation', () => {
  it('takes the short arc across the angle wrap', () => {
    const start = Math.PI - 0.02;
    const state = new Float32Array([Math.cos(start), Math.sin(start)]);
    const targetX = Math.cos(-Math.PI + 0.02);
    const targetZ = Math.sin(-Math.PI + 0.02);
    smoothHeadingInto(
      state, 0, state[0]!, state[1]!, targetX, targetZ, 1 / 60, 0.1, Math.PI,
    );
    const step = Math.atan2(
      Math.sin(Math.atan2(state[1]!, state[0]!) - start),
      Math.cos(Math.atan2(state[1]!, state[0]!) - start),
    );
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(0.02);
  });

  it('converges independently of render frame rate', () => {
    function run(dt: number): number {
      const state = new Float32Array([0, 1]);
      for (let elapsed = 0; elapsed < 0.6 - 1e-9; elapsed += dt) {
        smoothHeadingInto(state, 0, state[0]!, state[1]!, 1, 0, dt, 0.1, Math.PI);
      }
      return Math.atan2(state[1]!, state[0]!);
    }
    expect(run(1 / 30)).toBeCloseTo(run(1 / 120), 5);
    expect(Math.abs(run(1 / 60))).toBeLessThan(0.01);
  });

  it('bounds a one-frame reversal while still converging', () => {
    const state = new Float32Array([1, 0]);
    smoothHeadingInto(
      state, 0, 1, 0, -1, 0, 1 / 60, 0.1, SHEEP_HEADING_STEP_LIMIT,
    );
    const firstStep = Math.abs(Math.atan2(state[1]!, state[0]!));
    expect(firstStep).toBeCloseTo(SHEEP_HEADING_STEP_LIMIT, 6);
    for (let i = 0; i < 90; i++) {
      smoothHeadingInto(
        state, 0, state[0]!, state[1]!, -1, 0, 1 / 60, 0.1, SHEEP_HEADING_STEP_LIMIT,
      );
    }
    expect(state[0]).toBeLessThan(-0.999);
  });

  it('limits long-frame catch-up for both animal presentations', () => {
    const sheep = new Float32Array([1, 0]);
    const sheepStep = smoothHeadingInto(
      sheep, 0, 1, 0, -1, 0, 0.25, 0.1, SHEEP_HEADING_STEP_LIMIT,
    );
    expect(Math.abs(sheepStep)).toBeCloseTo(SHEEP_HEADING_STEP_LIMIT, 6);

    const dog = createDogMotion();
    advanceDogMotion(dog, 1 / 60, 4, 0, 1);
    const dogStep = advanceDogMotion(dog, 0.25, 4, 0, -1);
    expect(Math.abs(dogStep)).toBeCloseTo(DOG_HEADING_STEP_LIMIT, 6);
  });
});
