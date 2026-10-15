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
  DOG_HEADING_SNAP_CEILING,
  DOG_HEADING_STEP_RATE,
  advanceDogMotion,
  createDogMotion,
} from '@app/scene/dog/dogMotion';
import { smoothHeadingInto } from '@app/scene/flock/headingSmoothing';
import {
  HOOF_LIFT,
  SHEEP_HEADING_STEP_LIMIT,
  SHEEP_MAX_SPEED_MPS,
  BODY_BOB_RUN,
  SHEEP_HEADING_TAU_REST,
  SHEEP_HEADING_TAU_RUN,
  YAW_JITTER,
  sheepHeadingTauForAgitation,
  sheepYawOffsetShareForAgitation,
  BODY_BREATH,
  SHEEP_STANCE_WALK,
  sheepBodyBob,
  sheepStanceShareForAgitation,
  sheepGaitRateForAgitation,
  sheepLegPose,
  sheepStrideForAgitation,
  KNEE_COMPLIANCE,
  sheepKneeBend,
} from '@app/scene/flock/flockTuning';
import {
  SHEEP_HOOF_BASELINE,
  SHEEP_AUTHORED_LEG_SPAN,
  SHEEP_BACK_BONES,
  SHEEP_FRONT_BONES,
  SHEEP_HOOF_CONTACTS,
  SHEEP_HOOF_SOLE_POINTS,
  type SheepLegBones,
} from '@app/scene/flock/sheepParts';
import {
  SHEEP_TERRAIN_OFFSET_LIMIT,
  footTerrainOffset,
  writeSheepTerrainOffsets,
} from '@app/scene/flock/terrainPlanting';
import { buildSheepGeometry } from '@app/scene/flock/sheepGeometry';

/** The cadence guard in flockTuning. Stated rather than exported, because the
 *  tests below assert it is never reached and an export would invite reading it
 *  as a knob. */
const GAIT_RATE_CEILING = 20;

/** Farthest the fleece lump can push, both octaves at once, in local metres. */
const FLEECE_LUMP_REACH = 0.066 + 0.02;

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
          sheepLegPose(phase, foot === 0 || foot === 3 ? 1 : -1, SHEEP_STANCE_WALK).travel * stride,
        ));
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        for (const sole of SHEEP_HOOF_SOLE_POINTS) {
          const pose = sheepLegPose(phase, sole.legSign, SHEEP_STANCE_WALK);
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
      const positiveSwing = sheepLegPose(phase, 1, SHEEP_STANCE_WALK).travel * 0.24;
      const negativeSwing = sheepLegPose(phase, -1, SHEEP_STANCE_WALK).travel * 0.24;
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

describe('sheep facing', () => {
  // The sim writes headings[i] = velocity.angle(), so the heading IS the travel
  // direction - and the angle of a nearly-zero vector is nearly meaningless. A
  // settling sheep sits just above the sim's own movement threshold, where the
  // reported angle swings tens of degrees between ticks on a small change in
  // the flocking terms. Both curves below exist to stop the drawn body copying
  // that, and both ride the same walk knee so the presentation has one speed
  // curve rather than three that disagree.

  it('damps the facing hard at rest and releases it once the legs are walking', () => {
    expect(sheepHeadingTauForAgitation(0)).toBe(SHEEP_HEADING_TAU_REST);
    expect(sheepHeadingTauForAgitation(0.25)).toBeCloseTo(SHEEP_HEADING_TAU_RUN, 9);
    expect(sheepHeadingTauForAgitation(1)).toBeCloseTo(SHEEP_HEADING_TAU_RUN, 9);
    // Monotonic, so no speed is damped less than a slower one.
    let previous = Number.POSITIVE_INFINITY;
    for (const agitation of [0, 0.05, 0.1, 0.2, 0.25, 0.6, 1]) {
      const tau = sheepHeadingTauForAgitation(agitation);
      expect(tau).toBeLessThanOrEqual(previous);
      previous = tau;
    }
    // A moving animal still turns promptly: at 60 Hz a fifth of the remaining
    // angle is taken in one frame, so a turn is done in a few of them.
    expect(1 - Math.exp(-(1 / 60) / sheepHeadingTauForAgitation(1))).toBeGreaterThan(0.12);
  });

  it('stops carrying the standing yaw offset into a run', () => {
    // YAW_JITTER is 26 degrees of spread, so up to 13 either way. Applied as a
    // constant it pointed a bolting sheep 13 degrees off the line it was
    // travelling along, which is not facing askew, it is crabbing - and it left
    // the body a permanent rotation error for the smoothing to work against.
    expect(sheepYawOffsetShareForAgitation(0)).toBe(1);
    expect(sheepYawOffsetShareForAgitation(0.25)).toBe(0);
    expect(sheepYawOffsetShareForAgitation(1)).toBe(0);
    const worstCrabAtSpeed = (YAW_JITTER / 2) * sheepYawOffsetShareForAgitation(0.3);
    expect(worstCrabAtSpeed).toBe(0);
  });
});

describe('sheep fleece containment', () => {
  // "Their legs go out the sides of the wool sometimes because it shakes so
  // fast." The shaking was not what did it. The fleece lump was a SIGNED field:
  // it bulged outward and carved inward by the same amount, and where it carved
  // it pulled the wool surface back behind the leg hanging under it. Seeded per
  // instance, so it happened to some sheep and not others - which is what
  // "sometimes" meant.
  const LEGS = [
    { name: 'front +x', x: 0.225, z: 0.22 },
    { name: 'front -x', x: -0.225, z: 0.22 },
    { name: 'back +x', x: 0.21, z: -0.28 },
    { name: 'back -x', x: -0.21, z: -0.28 },
  ] as const;

  /** Widest wool, and widest leg, in one leg's own quarter of the body. */
  function margins() {
    const geometry = buildSheepGeometry();
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const uv1 = geometry.getAttribute('uv1');
    return LEGS.map((leg) => {
      let wool = 0;
      let limb = 0;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        if (Math.sign(x) !== Math.sign(leg.x)) continue;
        const z = position.getZ(i);
        const onLeg = Math.abs(uv1.getX(i)) > 0.5;
        if (onLeg) {
          if (Math.abs(z - leg.z) <= 0.2) limb = Math.max(limb, Math.abs(x));
          continue;
        }
        const y = position.getY(i);
        if (uv.getX(i) <= 0.5) continue;
        if (Math.abs(z - leg.z) > 0.18 || y < 0.3 || y > 0.8) continue;
        wool = Math.max(wool, Math.abs(x));
      }
      return { name: leg.name, margin: wool - limb };
    });
  }

  it('authors every leg inside the wool it hangs from', () => {
    for (const { margin } of margins()) expect(margin).toBeGreaterThan(0);
  });

  it('keeps a margin the lump cannot spend, because the lump only adds', () => {
    // The authored margin is 0.065 m at its worst, on the front -x leg. The
    // lump's two octaves reach 0.066 + 0.02 = 0.086 m, so a SIGNED field had
    // 0.021 m more inward travel than the tightest quarter of this body could
    // afford. Rectified, its inward travel is zero and the margin is whole at
    // every phase, on every instance, however hard the fleece is shaken.
    const worst = Math.min(...margins().map((entry) => entry.margin));
    expect(worst).toBeGreaterThan(FLEECE_LUMP_REACH - 0.025);
    expect(worst).toBeLessThan(FLEECE_LUMP_REACH);

    const source = readFileSync(
      join(process.cwd(), 'app', 'src', 'scene', 'flock', 'sheepMotion.ts'),
      'utf8',
    );
    // Both octaves remapped from -1..1 to 0..1 before they are scaled.
    expect(source.match(/\.mul\(float\(0\.5\)\)\.add\(float\(0\.5\)\)/g)).toHaveLength(2);
    expect(source).toContain('const lump = broadLump');
  });

  it('drives the fleece at one frequency, so the envelope cannot beat', () => {
    const source = readFileSync(
      join(process.cwd(), 'app', 'src', 'scene', 'flock', 'sheepMotion.ts'),
      'utf8',
    );
    // Twice the gait is the bob's rate, and the bob is what the wool hangs off.
    // A second term at THREE times the gait beat against it once per stride,
    // swelling and collapsing the envelope - fast wool is not the same thing as
    // wool with a pulse, and only the second one reads as a seizure.
    expect(source).toContain('sin(bobArg.sub(float(JIGGLE_LAG)))');
    expect(source).not.toContain('gait.mul(float(3))');
    expect(source).not.toContain('responseJiggle');
  });
});

describe('sheep body bob', () => {
  // The bob is the half of the gait that is not the legs. Four limbs cycling
  // under a torso held at one height is a walk cycle on a hovercraft, and the
  // phase relationship is the whole content of the fix: a body that rises when
  // a foot lands reads as a bounce, not as a bound.
  const TURNS = 720;

  function extremaTurns(agitation: number): { low: number; high: number } {
    const share = sheepStanceShareForAgitation(agitation);
    let low = 0;
    let high = 0;
    for (let i = 0; i < TURNS; i++) {
      const turn = i / TURNS;
      const value = sheepBodyBob(turn * Math.PI * 2, agitation, share);
      if (value < sheepBodyBob(low * Math.PI * 2, agitation, share)) low = turn;
      if (value > sheepBodyBob(high * Math.PI * 2, agitation, share)) high = turn;
    }
    return { low, high };
  }

  it('sits lowest under the stance and highest in the suspension, at every speed', () => {
    for (const agitation of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
      const share = sheepStanceShareForAgitation(agitation);
      const { low, high } = extremaTurns(agitation);
      // The bob runs at twice the gait, so it has TWO lows and TWO highs per
      // cycle and an extremum scan finds whichever equivalent point it meets
      // first. Compare modulo the half-turn period, or the test reports a
      // correct bob as broken the moment the stance share crosses a half.
      const period = (turn: number): number => ((turn % 0.5) + 0.5) % 0.5;
      // Pair P is planted over turns [0, share); its mid-stance is share / 2,
      // and the body is lowest there, under the loaded diagonal. A quarter of
      // a cycle later it is highest - which is mid-suspension while the share
      // is under a half, and mid-overlap once it is over one and the gait has
      // become a walk with no suspension left to be high in.
      expect(period(low)).toBeCloseTo(period(share / 2), 2);
      expect(period(high)).toBeCloseTo(period(share / 2 + 0.25), 2);
    }
  });

  it('never moves a planted sole, because the taper is the leg weight', () => {
    // The shader multiplies the bob by (1 - legWeight) and the sole rings are
    // authored at legWeight 1. This is the arithmetic that lets hoof contact
    // and terrain planting carry no term for the bob at all.
    const soleWeight = 1;
    for (const agitation of [0.25, 1]) {
      const share = sheepStanceShareForAgitation(agitation);
      for (let i = 0; i < 64; i++) {
        const atSole = sheepBodyBob(i / 64 * Math.PI * 2, agitation, share)
          * (1 - soleWeight);
        expect(Math.abs(atSole)).toBe(0);
      }
    }
  });

  it('opens with speed, closes to a breath at a graze, and stays under a pogo', () => {
    // Over the cycle, not at phase zero: the stance offset means phase zero is
    // partway up the swell rather than at either end of it.
    let standing = 0;
    for (let i = 0; i < TURNS; i++) {
      standing = Math.max(standing, Math.abs(sheepBodyBob(
        i / TURNS * Math.PI * 2, 0, SHEEP_STANCE_WALK,
      )));
    }
    expect(standing).toBeCloseTo(BODY_BREATH, 6);

    const boltAmplitude = BODY_BREATH + BODY_BOB_RUN;
    // Peak to peak against a 0.72 m withers. Real trotting quadrupeds oscillate
    // four to six per cent of height; a tenth of stride measured eleven.
    const peakToPeakFraction = boltAmplitude * 2 / 0.72;
    expect(peakToPeakFraction).toBeGreaterThan(0.04);
    expect(peakToPeakFraction).toBeLessThan(0.065);

    // And well inside the free-flight rise for the same suspension, because a
    // leg is a spring: a bob at or over ballistic is a body nothing caught.
    const share = sheepStanceShareForAgitation(1);
    const cycle = Math.PI * 2 / sheepGaitRateForAgitation(1);
    const suspension = (0.5 - share) * cycle;
    expect(boltAmplitude).toBeLessThan(9.81 * suspension * suspension / 8);

    // AND IT DOES NOT SATURATE. Riding stride instead looked right and was
    // not: stride's walk term is full by agitation 0.25, so an ambling sheep
    // carried seventy per cent of a bolt's bob and read as bouncing rather
    // than walking. A quarter of the speed must get about a quarter of it.
    let previous = 0;
    for (const agitation of [0, 0.25, 0.5, 0.75, 1]) {
      const amplitude = BODY_BREATH + agitation * BODY_BOB_RUN;
      expect(amplitude).toBeGreaterThan(previous);
      previous = amplitude;
    }
    const walk = BODY_BREATH + 0.25 * BODY_BOB_RUN;
    expect((walk - BODY_BREATH) / (boltAmplitude - BODY_BREATH)).toBeCloseTo(0.25, 6);
  });

  it('is twinned by the shader, not re-derived there', () => {
    const source = readFileSync(
      join(process.cwd(), 'app', 'src', 'scene', 'flock', 'sheepMotion.ts'),
      'utf8',
    );
    // bobArg is gait * 2, so the TSL expression below is the same function as
    // sheepBodyBob: two cycles per stride, offset by the stance share, tapered
    // by the leg weight and added into `rise`.
    expect(source).toContain('cos(bobArg.sub(stanceShare.mul(float(TAU))))');
    expect(source).toContain('float(BODY_BREATH).add(agitation.mul(float(BODY_BOB_RUN)))');
    expect(source).toContain('.mul(float(1).sub(legs.y))');
    expect(source).toContain('.add(bodyBob)');
  });
});

describe('sheep gait', () => {
  it('plants backward and recovers forward while lifted', () => {
    const share = SHEEP_STANCE_WALK;
    const strike = sheepLegPose(0, 1, share);
    const toeOff = sheepLegPose((share - 1e-4) * Math.PI * 2, 1, share);
    const recovery = sheepLegPose(
      (share + (1 - share) * 0.5) * Math.PI * 2,
      1,
      share,
    );
    const nextStrike = sheepLegPose((1 - 1e-4) * Math.PI * 2, 1, share);

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

  it('plants the hoof exactly, at every speed in the range', () => {
    // THE RANGE IS THE POINT, and the tolerance is now the point too. This once
    // tested 0.1 and 0.25 only, held them to 15 per cent slip, and never
    // measured the bolt at all - where the shipped gait slipped 51 per cent.
    // Widening the range exposed that; deriving the cadence from the planting
    // constraint rather than blending 85 per cent of it removed it outright.
    //
    // A planted foot sweeps 2 * stride while the body covers speed * stance
    // time. Those are now equal by construction, so the honest assertion is
    // equality, not a budget. A tolerance here would only hide the next
    // regression - any slide at all means the cadence stopped being derived.
    for (const agitation of [0.05, 0.1, 0.25, 0.4, 0.6, 0.8, 1]) {
      const stride = sheepStrideForAgitation(agitation);
      const rate = sheepGaitRateForAgitation(agitation);
      const bodyTravelDuringStance = agitation * SHEEP_MAX_SPEED_MPS
        * sheepStanceShareForAgitation(agitation) * Math.PI * 2 / rate;
      const plantedHoofSweep = stride * 2;

      expect(plantedHoofSweep / bodyTravelDuringStance).toBeCloseTo(1, 9);

      // And the cadence that falls out stays where a small quadruped's does.
      // It peaks near three strides a second at a canter, which is what an
      // animal this size covering 4.3 m/s actually runs; the old 1.8 bound
      // belonged to a gait whose feet were sliding to make up the difference.
      expect(rate / (Math.PI * 2)).toBeLessThan(3.2);
      expect(rate).toBeLessThanOrEqual(GAIT_RATE_CEILING);
    }
  });

  it('walks with feet on the ground and only leaves it to bound', () => {
    // A walk is DEFINED by never having fewer than two feet down, which with
    // diagonal pairs offset half a cycle needs a duty factor over a half. The
    // old walking share was 0.34, so an animal ambling at a third of a metre a
    // second spent a third of its time airborne. That is not a walk, and brief
    // touches with air between them is exactly what "tap, tap, tap" described.
    const airborne = (agitation: number): number =>
      Math.max(0, 1 - 2 * sheepStanceShareForAgitation(agitation));

    expect(airborne(0)).toBe(0);
    expect(airborne(0.1)).toBe(0);
    expect(airborne(0.25)).toBe(0);
    // And by a bolt it is mostly in the air, which is what a bound is.
    expect(airborne(1)).toBeGreaterThan(0.5);
    // Monotonic: no speed is more airborne than a faster one.
    let previous = -1;
    for (const agitation of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      expect(airborne(agitation)).toBeGreaterThanOrEqual(previous);
      previous = airborne(agitation);
    }
  });

  it('keeps rest breathing slow, and never reaches the cadence ceiling', () => {
    expect(sheepGaitRateForAgitation(0)).toBeCloseTo(1.6, 6);
    // The ceiling is a guard against a degenerate stride asking for an
    // unbounded cadence, not a tuning knob - so the interesting assertion is
    // that nothing in range touches it. If it ever binds, a hoof is sliding
    // again, because the cadence below it is the one that plants the foot.
    let peak = 0;
    for (let agitation = 0; agitation <= 1; agitation += 1 / 512) {
      peak = Math.max(peak, sheepGaitRateForAgitation(agitation));
    }
    expect(peak).toBeLessThan(GAIT_RATE_CEILING);
    expect(peak).toBeGreaterThan(18);
  });

  it('makes walking travel read wider than its vertical hoof lift', () => {
    const stride = sheepStrideForAgitation(0.25);
    expect(stride).toBeGreaterThan(0.2);
    expect(stride * HOOF_LIFT).toBeLessThan(0.12);
  });
});

describe('sheep knee solve', () => {
  const PAIRS: readonly (readonly [string, SheepLegBones])[] = [
    ['front', SHEEP_FRONT_BONES],
    ['back', SHEEP_BACK_BONES],
  ];
  const FRAME = 1 / 60;

  /** The shader's knee, on the CPU: the span the pose asks the chain for, and
   *  the bend that span implies. Deliberately mirrors sheepMotion's `spanRise`
   *  and `spanReach` term for term, INCLUDING the absence of the body bob. */
  function kneeAt(
    bones: SheepLegBones,
    gait: number,
    agitation: number,
    ground: number,
  ): { readonly bend: number; readonly hoofRise: number; readonly hoofReach: number } {
    const stride = sheepStrideForAgitation(agitation);
    const pose = sheepLegPose(gait, 1, sheepStanceShareForAgitation(agitation));
    const hoofRise = pose.lift * stride * HOOF_LIFT + ground;
    const hoofReach = pose.travel * stride;
    const span = Math.hypot(bones.restRise - hoofRise, bones.restReach + hoofReach);
    return { bend: sheepKneeBend(span, bones.upper, bones.lower), hoofRise, hoofReach };
  }

  /** Every pose the asset can be in: both pairs, the whole agitation range, the
   *  terrain limit either way, and a full gait cycle walked in real frames. */
  function envelope(
    visit: (
      bones: SheepLegBones,
      now: ReturnType<typeof kneeAt>,
      previous: ReturnType<typeof kneeAt>,
      agitation: number,
      ground: number,
    ) => void,
  ): void {
    for (const ground of [0, 0.08, -0.08, 0.04, -0.04]) {
      for (let agitation = 0; agitation <= 1.0001; agitation += 0.02) {
        const rate = sheepGaitRateForAgitation(agitation);
        for (const [, bones] of PAIRS) {
          let previous = kneeAt(bones, 0, agitation, ground);
          for (let i = 1; i * rate * FRAME < Math.PI * 4; i++) {
            const now = kneeAt(bones, i * rate * FRAME, agitation, ground);
            visit(bones, now, previous, agitation, ground);
            previous = now;
          }
        }
      }
    }
  }

  it('reproduces the authored knee, which is how the solver and the mesh stay married', () => {
    // sheepParts measures the chain off the same rings the loft is built from,
    // so the solve has to land back on the joint the modeller placed. It does,
    // to a hundredth of a millimetre on both pairs: the front carpus stands
    // 0.050 m off the shoulder-to-sole chord and the hind hock 0.053, and the
    // law of cosines returns those from the bone lengths alone.
    //
    // This is the whole drift guard. Retune a leg ring and the solve follows it;
    // retune it so far that the solve no longer agrees, and this fires.
    const authored = { front: 0.04994, back: -0.05298 };
    for (const [name, bones] of PAIRS) {
      const solved = Math.sqrt(bones.restBend ** 2 - KNEE_COMPLIANCE ** 2);
      expect(solved * bones.foldDirection).toBeCloseTo(
        authored[name as 'front' | 'back'],
        4,
      );
    }
  });

  it('keeps both chains off full extension, where the solve is singular', () => {
    // A two-bone bend goes as the SQUARE ROOT of how far the limb has shortened,
    // so a chain authored dead straight sits on a cusp with infinite slope and
    // answers the first millimetre of hoof lift with a 76 mm snap. Both pairs
    // therefore carry real slack - the hock always did, and the carpus was moved
    // forward to 0.065 to match it.
    for (const [, bones] of PAIRS) {
      const chain = bones.upper + bones.lower;
      expect((chain - bones.span) / chain).toBeGreaterThan(0.018);
    }
  });

  it('shares one bend ring between the pairs, so the fold profile is one number', () => {
    // sheepMotion reads KNEE_T off the front chain and applies it to both.
    expect(SHEEP_BACK_BONES.kneeT).toBe(SHEEP_FRONT_BONES.kneeT);
  });

  it('leaves an idle sheep on flat ground exactly as modelled', () => {
    // The title screen stands one sheep in front of the camera doing nothing.
    // At rest the stride is zero, so the only term that could reach the knee is
    // the breathing bob - and the bob is deliberately not in the span, because
    // it is the thorax riding over the scapula rather than the shoulder joint
    // moving. Were it in, 4 mm of breath would come back as 9 mm of knee.
    let drift = 0;
    for (const [, bones] of PAIRS) {
      for (let i = 0; i < 1500; i++) {
        drift = Math.max(drift, Math.abs(kneeAt(bones, i * 0.011, 0, 0).bend - bones.restBend));
      }
    }
    expect(drift).toBe(0);
  });

  it('bends a standing leg to meet the terrain, which the authored fold never did', () => {
    // This is what the change bought. The old fold was the swing arc times a
    // constant and was gated to the airborne half of the cycle, so a sheep
    // standing across a hummock bent nothing at all and took the whole 0.08 m
    // as stretch. Now the uphill knee folds 0.070 m and the downhill one
    // straightens 0.026 toward its chord.
    for (const [, bones] of PAIRS) {
      expect(kneeAt(bones, 0, 0, SHEEP_TERRAIN_OFFSET_LIMIT).bend - bones.restBend)
        .toBeGreaterThan(0.065);
      expect(kneeAt(bones, 0, 0, -SHEEP_TERRAIN_OFFSET_LIMIT).bend - bones.restBend)
        .toBeLessThan(-0.02);
    }
  });

  it('never folds a leg through its own rest pose', () => {
    // The fold is signed by which side of the chord the MODELLED joint is on, so
    // the front carpus flexes forward and the hind hock back. An over-reaching
    // pose drives the bend down to the compliance floor, which pulls the joint
    // back toward the chord - and the floor can never reach it, because
    // sqrt(authored^2 + c^2) - c is less than `authored` for any c. Held here on
    // the real envelope rather than on the algebra.
    envelope((bones, now) => {
      const posed = Math.sqrt(bones.restBend ** 2 - KNEE_COMPLIANCE ** 2)
        + (now.bend - bones.restBend);
      expect(posed).toBeGreaterThan(0);
    });
  });

  it('moves the knee no faster than the hoof it is following', () => {
    // The anti-pop receipt. Worst case over the whole envelope is 2.60 - 16.1 mm
    // of knee against 6.2 mm of hoof in one frame, at an agitation of 0.04 where
    // the stride has just snapped open and the chain crosses full extension. In
    // absolute terms the worst frame anywhere is 71.7 mm, and it happens at a
    // dead run where the hoof itself is covering 153 mm per frame.
    let ratio = 0;
    let travel = 0;
    envelope((_bones, now, previous) => {
      const knee = Math.abs(now.bend - previous.bend);
      const hoof = Math.hypot(
        now.hoofRise - previous.hoofRise,
        now.hoofReach - previous.hoofReach,
      );
      travel = Math.max(travel, knee);
      if (hoof > 1e-9) ratio = Math.max(ratio, knee / hoof);
    });
    expect(ratio).toBeLessThan(2.8);
    expect(travel).toBeLessThan(0.08);
  });

  it('keeps the fold on straight bones instead of bowing them', () => {
    // Bones are rigid, so the rings between the joints ride straight lines. The
    // tent is what the chain does; the sine the old fold used gave the t=0.2
    // ring 0.59 of full bend where the chain gives 0.36, which bowed the radius
    // outward and is its own share of why a folding leg read as rubber.
    const kneeT = SHEEP_FRONT_BONES.kneeT;
    const tent = (t: number): number => Math.min(t / kneeT, (1 - t) / (1 - kneeT));
    expect(tent(0)).toBe(0);
    expect(tent(1)).toBe(0);
    expect(tent(kneeT)).toBeCloseTo(1, 12);
    expect(tent(0.2)).toBeCloseTo(0.357, 3);
    expect(tent(0.86)).toBeCloseTo(0.318, 3);
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

    // The dog now carries two separate limits and only one of them binds here.
    // A quarter second of the sustained rate is 2.1 rad, so what holds the
    // displayed step down across a stalled frame is the per-frame snap ceiling.
    const dog = createDogMotion();
    advanceDogMotion(dog, 1 / 60, 4, 0, 1);
    const dogStep = advanceDogMotion(dog, 0.25, 4, 0, -1);
    expect(Math.abs(dogStep)).toBeCloseTo(DOG_HEADING_SNAP_CEILING, 6);
  });

  it('turns the dog at a rate per second rather than a step per frame', () => {
    // The limit this replaces was 0.14 rad per FRAME, so the same reversal
    // turned the dog - and the camera tracking it - at 481 deg/s on a desktop
    // and 962 deg/s on a 120 Hz phone. Read as a rate, 60 Hz is unchanged and
    // the step halves when the refresh doubles.
    function reversalStep(hz: number): number {
      const dog = createDogMotion();
      advanceDogMotion(dog, 1 / hz, 12, 0, 1);
      return Math.abs(advanceDogMotion(dog, 1 / hz, 12, 0, -1));
    }
    const at60 = reversalStep(60);
    const at120 = reversalStep(120);
    expect(at60 * 60).toBeCloseTo(DOG_HEADING_STEP_RATE, 6);
    expect(at120 * 120).toBeCloseTo(DOG_HEADING_STEP_RATE, 6);
    expect(reversalStep(144) * 144).toBeCloseTo(DOG_HEADING_STEP_RATE, 6);
    expect(at120).toBeCloseTo(at60 / 2, 9);
  });
});
