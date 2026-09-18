// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The dog's weight, pinned as a pure function.
 *
 * The conditioner is the half of the comfort change that lives in the input
 * layer: it rate-limits the INTENT so the tracked signal can no longer rotate
 * half a turn in one tick, which is what makes a rate cap on the camera a cap
 * rather than a debt repaid later as a snap. It touches no clock and no DOM and
 * reads nothing from `sim/`, so a fixed sequence in gives a fixed sequence out.
 *
 * Five properties are load-bearing and each replaces a defect:
 *
 *  - the speed ramp ARRIVES at its target. Zero is the only intent that puts
 *    the sim on its deceleration branch, so a ramp that merely approached zero
 *    would leave the dog creeping after every release,
 *  - the turn is a constant lateral acceleration, `A_LAT / v`, floored and
 *    capped, so slow is nimble and fast is committed,
 *  - re-pressing during a coast resumes the ramp rather than restarting it,
 *    because restarting at the launch speed commands a brake nobody asked for,
 *  - the camera basis is latched on entry from neutral. Camera-relative input
 *    under a camera that follows the dog is a feedback loop; holding the basis
 *    cuts it, measured at 3,828 degrees of camera yaw down to 542,
 *  - and turn authority scales with heading error: full below 45 degrees, none
 *    past 135. A dog at speed cannot be asked to spend its whole commanded
 *    speed on a direction it is not pointed in, because the sim answers that by
 *    carrying the old velocity and the camera answers it by chasing a heading
 *    the dog never takes. Below AUTHORITY_FREE_SPEED the scaling lifts, so a
 *    standing or walking dog still turns on the spot.
 *
 * Plus the frame-rate check the old heading limit failed, and it has to be run
 * against EVOLVING state to mean anything. The bug class is a rate that is
 * really a per-frame step, and `DOG_HEADING_STEP_LIMIT` is the one that shipped:
 * 8.02 degrees a frame reads as 481 deg/s at 60 Hz and 962 on a 120 Hz phone.
 * The check here used to hold the dog's velocity FIXED at 12 m/s, which makes
 * `A_LAT / v` a constant - and a constant rate integrated over a fixed wall
 * clock gives the same answer however it is sliced, whether or not the step is
 * per frame. So it asserted a number that could not move. It now flies a closed
 * loop: the commanded move drives a dog, the dog's velocity comes back in as the
 * momentum the turn budget is priced against, and the whole TRAJECTORY is
 * compared at 30, 60 and 144 Hz.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  DOG_ACCELERATION,
  DOG_DECELERATION,
  DOG_MAX_SPEED,
  DOG_SPRINT_SPEED,
  SHEEP_FLEE_RADIUS,
  SHEEP_PERCEPTION_RADIUS,
} from '@sim/tuning';
import type { WorldMove } from '@app/input/axis';
import {
  ACCEL_DOWN,
  ACCEL_UP,
  AUTHORITY_FREE_SPEED,
  AUTHORITY_FULL_DEG,
  AUTHORITY_ZERO_DEG,
  A_LAT,
  BASIS_RESAMPLE_DEG,
  BASIS_TRACK_TAU,
  LAUNCH_SPEED,
  MAX_INPUT_DT,
  TURN_RATE_MAX,
  TURN_RATE_MIN,
  conditionMove,
  invalidateBasis,
  latchBasis,
  resetConditioning,
  type MoveRequest,
} from '@app/input/conditioning';

const DT = 1 / 60;
const DEG = Math.PI / 180;

beforeEach(resetConditioning);

/** A full-effort press up the field from a standing dog, unless overridden. */
function press(over: Partial<MoveRequest> = {}): MoveRequest {
  return {
    dirX: 0,
    dirZ: 1,
    effort: 1,
    sprintDevice: false,
    sprintAvailable: true,
    stamina: 100,
    velocityX: 0,
    velocityZ: 0,
    dt: DT,
    ...over,
  };
}

/** Everything released. */
function release(over: Partial<MoveRequest> = {}): MoveRequest {
  return press({ dirX: 0, dirZ: 0, effort: 0, ...over });
}

/** The commanded direction, as an angle. Valid while the effort is nonzero. */
function angleOf(move: { x: number; z: number }): number {
  return Math.atan2(move.x, move.z);
}

/** The turn rate the law owes a dog carrying `speed`, rad/s. */
function turnRate(speed: number): number {
  return Math.min(TURN_RATE_MAX * DEG, Math.max(TURN_RATE_MIN * DEG, A_LAT / speed));
}

describe('commanded speed ramp', () => {
  it('moves on the first frame and arrives exactly, without overshooting', () => {
    // Onset survives: frame one is already a launch speed plus one step of ramp
    // rather than a time constant creeping off zero.
    const first = conditionMove(press());
    expect(first.speed).toBeCloseTo(LAUNCH_SPEED + ACCEL_UP * DT, 12);

    let peak = first.speed;
    let out = first;
    for (let frame = 0; frame < 60; frame++) {
      out = conditionMove(press());
      peak = Math.max(peak, out.speed);
    }
    // Exactly the ceiling, and never a fraction above it on the way.
    expect(out.speed).toBe(DOG_MAX_SPEED);
    expect(peak).toBe(DOG_MAX_SPEED);
    expect(out.effort).toBe(1);

    for (let frame = 0; frame < 60; frame++) out = conditionMove(release());
    // Zero, not nearly zero: anything above it is a held intent to the sim.
    expect(out.speed).toBe(0);
    expect(out.effort).toBe(0);
    expect(out.x).toBe(0);
    expect(out.z).toBe(0);
  });

  it('spends ACCEL_UP going up and ACCEL_DOWN coming down', () => {
    let previous = conditionMove(press()).speed;
    for (let frame = 0; frame < 5; frame++) {
      const next = conditionMove(press()).speed;
      expect(next - previous).toBeCloseTo(ACCEL_UP * DT, 12);
      previous = next;
    }
    for (let frame = 0; frame < 5; frame++) {
      const next = conditionMove(release()).speed;
      expect(previous - next).toBeCloseTo(ACCEL_DOWN * DT, 12);
      previous = next;
    }
  });

  it('holds a stalled frame to MAX_INPUT_DT instead of taking it whole', () => {
    // A backgrounded tab hands the first frame back a delta worth seconds. One
    // step of that would be the whole ramp at once.
    const out = conditionMove(press({ dt: 5 }));
    expect(out.speed).toBeCloseTo(LAUNCH_SPEED + ACCEL_UP * MAX_INPUT_DT, 12);
  });
});

describe('commanded turn rate', () => {
  /** One frame of a right-angle request against a dog carrying `speed`. */
  function stepAt(speed: number): number {
    resetConditioning();
    const seated = conditionMove(press({ velocityZ: speed }));
    const before = angleOf(seated);
    const turned = conditionMove(press({ dirX: 1, dirZ: 0, velocityZ: speed }));
    return angleOf(turned) - before;
  }

  it.each([2, 13.79, 10, 15, 25, 50])('turns at A_LAT over v at %s m/s', (speed) => {
    expect(stepAt(speed)).toBeCloseTo(turnRate(speed) * DT, 12);
  });

  it('pivots at the ceiling when slow and is committed when fast', () => {
    // The two ends of the law, stated as the numbers they are: a flat 270 deg/s
    // below the 13.79 m/s crossover, and 149 deg/s at a sprint.
    expect(turnRate(4) * DT).toBeCloseTo(stepAt(4), 12);
    expect(stepAt(4) / DT / DEG).toBeCloseTo(TURN_RATE_MAX, 9);
    expect(stepAt(25) / DT / DEG).toBeCloseTo(149, 0);
    // And the floor keeps it steerable past any speed the sim can reach, so no
    // retune of the dog's ceiling can make the control unusable. The speed that
    // exercises it is derived, because where the floor starts binding is a
    // function of A_LAT: raising A_LAT pushes it up, and a literal speed here
    // would quietly stop testing the floor instead of failing.
    const floorBinds = A_LAT / (TURN_RATE_MIN * DEG);
    expect(floorBinds).toBeGreaterThan(DOG_SPRINT_SPEED);
    expect(stepAt(floorBinds * 2) / DT / DEG).toBeCloseTo(TURN_RATE_MIN, 9);
  });

  it('turns inside the pressure zone at a run and outside it at a sprint', () => {
    // A_LAT is chosen against a radius, not a rate, so the radius is what gets
    // pinned. `v / omega` is the circle the dog can hold at a given speed, and
    // the numbers it has to sit between belong to the sim, not to this file:
    // herding is the act of standing inside a sheep's flee radius, so a run
    // that cannot turn inside that radius cannot correct without releasing the
    // pressure it is correcting with. At the 28 m/s^2 this law started at the
    // run circle was 8.0 m, the flee radius exactly, which is the defect this
    // pins against rather than a margin anyone picked.
    const radius = (speed: number): number => speed / (stepAt(speed) / DT);
    expect(radius(DOG_MAX_SPEED)).toBeLessThan(SHEEP_PERCEPTION_RADIUS);
    // And a sprint deliberately cannot: it stays a gear for closing distance
    // rather than a way to corner inside the flock.
    expect(radius(DOG_SPRINT_SPEED)).toBeGreaterThan(SHEEP_FLEE_RADIUS);
  });

  it('prices the turn against the dog momentum, not the speed just commanded', () => {
    // During a hard corner the command has already braked while the dog is
    // still travelling. Pricing off the lower number sells an arc the animal
    // cannot make, so the two must differ here and the dog must win.
    resetConditioning();
    conditionMove(press({ velocityZ: 20 }));
    const braking = conditionMove(press({ dirX: 1, dirZ: 0, velocityZ: 20 }));
    expect(braking.speed).toBeLessThan(20);
    expect(angleOf(braking)).toBeCloseTo(turnRate(20) * DT, 12);
    expect(turnRate(20)).toBeLessThan(turnRate(braking.speed));
  });
});

describe('turn authority', () => {
  /** The commanded speed a request `degrees` off the dog's momentum settles at. */
  function settled(degrees: number, momentum: number): Readonly<{ speed: number; effort: number }> {
    resetConditioning();
    const radians = degrees * DEG;
    const frame = (): MoveRequest =>
      press({ dirX: Math.sin(radians), dirZ: Math.cos(radians), velocityZ: momentum });
    let out = conditionMove(frame());
    for (let tick = 0; tick < 120; tick++) out = conditionMove(frame());
    return { speed: out.speed, effort: out.effort };
  }

  /** The share of effort the law owes at `degrees`: full, then linear, then none. */
  function authority(degrees: number): number {
    const span = AUTHORITY_ZERO_DEG - AUTHORITY_FULL_DEG;
    return 1 - Math.max(0, Math.min(1, (degrees - AUTHORITY_FULL_DEG) / span));
  }

  it.each([0, 20, 45, 60, 90, 120, 135, 150, 180])(
    'scales the commanded effort by the angle to momentum, at %i degrees',
    (degrees) => {
      // This is what replaces a skid state machine, and the whole reason it can
      // is that it is continuous in the angle: a 90-degree corner costs half
      // effort so the dog sheds speed into it, a reversal costs all of it so the
      // dog brakes, and the turn cap widens as it slows and it powers out on an
      // arc. Nothing latches and there is no threshold to chatter against.
      const share = authority(degrees);
      const out = settled(degrees, 10);
      expect(out.speed).toBeCloseTo(DOG_MAX_SPEED * share, 9);
      expect(out.effort).toBeCloseTo(share, 9);
    },
  );

  it('is full below 45 degrees and exactly zero past 135', () => {
    // The two ends stated as the numbers they are, because the linear middle
    // above would pass on a law that merely trended the right way.
    expect(settled(AUTHORITY_FULL_DEG - 1e-9, 10).effort).toBe(1);
    expect(settled(AUTHORITY_FULL_DEG, 10).effort).toBe(1);
    expect(settled(AUTHORITY_ZERO_DEG, 10).speed).toBe(0);
    expect(settled(180, 10).speed).toBe(0);
  });

  it('restores it outright below the speed there is momentum worth respecting', () => {
    // Close work must stay light. A nearly stationary dog has nothing to argue
    // with, so the angle stops costing anything at all.
    expect(settled(180, AUTHORITY_FREE_SPEED - 1e-9).speed).toBe(DOG_MAX_SPEED);
    expect(settled(180, AUTHORITY_FREE_SPEED).speed).toBe(0);
  });
});

describe('re-pressing out of a coast', () => {
  /** Full press to the ceiling, then `frames` of release. */
  function coast(frames: number, over: Partial<MoveRequest> = {}): number {
    for (let frame = 0; frame < 60; frame++) conditionMove(press());
    let out = conditionMove(release(over));
    for (let frame = 1; frame < frames; frame++) out = conditionMove(release(over));
    return out.speed;
  }

  it('resumes from the dog momentum when that is the highest of the three', () => {
    const carried = coast(6, { velocityZ: 14 });
    expect(carried).toBeLessThan(14);
    const pressed = conditionMove(press({ velocityZ: 14 }));
    // Not the launch speed, and not the decayed command either: the dog is
    // travelling at 14, so anything below it is a brake the player never asked
    // for. The ramp resumes from the momentum and climbs.
    expect(pressed.speed).toBeCloseTo(14 + ACCEL_UP * DT, 12);
    expect(pressed.speed).toBeGreaterThan(carried);
  });

  it('resumes from the carried command when the dog has fallen behind it', () => {
    const carried = coast(6, { velocityZ: 2 });
    const pressed = conditionMove(press({ velocityZ: 2 }));
    expect(pressed.speed).toBeCloseTo(carried + ACCEL_UP * DT, 12);
  });

  it('starts from the launch speed on a genuine standing start', () => {
    const out = conditionMove(press());
    expect(out.speed).toBeCloseTo(LAUNCH_SPEED + ACCEL_UP * DT, 12);
  });

  it('caps the launch speed at the target, so a walk does not lurch', () => {
    // 0.2 of the ceiling is 3 m/s, under the launch speed. Handing a walking
    // command the full launch would make the gentlest input the fastest onset.
    const out = conditionMove(press({ effort: 0.2 }));
    expect(out.speed).toBe(DOG_MAX_SPEED * 0.2);
  });
});

describe('tracking movement basis', () => {
  const out: WorldMove = { x: 0, z: 0 };
  /** Bearing of the basis the call just wrote, radians. */
  const bearing = (): number => Math.atan2(out.x, out.z);

  it('holds the sample while a camera-mode blend is in flight', () => {
    // The mode blend is the one motion of the basis that is not the player's:
    // it sweeps between two framings, up to half a turn, for a reason the hand
    // had no part in. Tracking it would swing a held dog through the whole arc.
    expect(latchBasis(DT, false, 0, 1, 0, 1, out)).toEqual({ x: 0, z: 1 });
    for (const deg of [10, 45, 90, 180]) {
      latchBasis(DT, true, 0, 1, Math.sin(deg * DEG), Math.cos(deg * DEG), out);
      expect(out, `${deg} deg of camera mid-blend`).toEqual({ x: 0, z: 1 });
    }
  });

  it('tracks the camera once the blend has settled', () => {
    // THE PROPERTY THE OWNER ASKED FOR. This basis used to be frozen for the
    // whole hold, so holding a turn rounded one corner and then ran straight
    // down the compass direction the key meant when it was pressed. It now
    // follows the bearing, and what bounds how fast it can follow is the Follow
    // turning ceiling moving that bearing, not anything in this file.
    latchBasis(DT, false, 0, 1, 0, 1, out);
    const target = 90 * DEG;
    const step = 1 - Math.exp(-DT / BASIS_TRACK_TAU);
    latchBasis(DT, false, 0, 1, Math.sin(target), Math.cos(target), out);
    expect(bearing()).toBeCloseTo(target * step, 12);

    // And it converges rather than orbiting: a thousand frames of a camera held
    // at the target leave the basis on the target.
    for (let frame = 0; frame < 1000; frame += 1) {
      latchBasis(DT, false, 0, 1, Math.sin(target), Math.cos(target), out);
    }
    expect(bearing()).toBeCloseTo(target, 9);
  });

  it('never overshoots the bearing it is chasing, from either side', () => {
    // An ease that overshoots would put rotation into the controls that the
    // camera's own ceiling never authorised, which is the whole thing the rate
    // caps in this project exist to prevent.
    for (const target of [30 * DEG, -30 * DEG, 179 * DEG, -179 * DEG]) {
      invalidateBasis();
      latchBasis(DT, false, 0, 1, 0, 1, out);
      let previous = 0;
      for (let frame = 0; frame < 400; frame += 1) {
        latchBasis(DT, false, 0, 1, Math.sin(target), Math.cos(target), out);
        const now = bearing();
        const progress = target >= 0 ? now : -now;
        expect(progress, `${(target / DEG).toFixed(0)} deg, frame ${frame}`)
          .toBeLessThanOrEqual(Math.abs(target) + 1e-12);
        expect(progress).toBeGreaterThanOrEqual(previous - 1e-12);
        previous = progress;
      }
    }
  });

  it('takes the short way round a half turn rather than through zero', () => {
    // Shortest arc on the angle, not a lerp of the two vectors: opposed
    // bearings lerped as vectors collapse to no length at the crossing, which
    // is the same degeneracy the camera rig has in its own blends.
    invalidateBasis();
    latchBasis(DT, false, 0, 1, 0, 1, out);
    const target = -170 * DEG;
    for (let frame = 0; frame < 600; frame += 1) {
      latchBasis(DT, false, 0, 1, Math.sin(target), Math.cos(target), out);
      expect(Math.hypot(out.x, out.z), `frame ${frame}`).toBeCloseTo(1, 9);
      expect(bearing(), `frame ${frame}`).toBeLessThanOrEqual(1e-12);
    }
    expect(bearing()).toBeCloseTo(target, 9);
  });

  it('does not resample below BASIS_RESAMPLE_DEG', () => {
    invalidateBasis();
    expect(latchBasis(0, false, 0, 1, 0, 1, out)).toEqual({ x: 0, z: 1 });

    // A screen direction just inside the threshold keeps the old basis. dt of
    // zero so the tracking above cannot be what moves it.
    const held = BASIS_RESAMPLE_DEG - 1;
    latchBasis(0, false, Math.sin(held * DEG), Math.cos(held * DEG), 1, 0, out);
    expect(out).toEqual({ x: 0, z: 1 });

    // At the threshold it re-samples. 44 rather than 45 is why adding or
    // releasing the second key of a diagonal always does.
    latchBasis(0, false, Math.sin(45 * DEG), Math.cos(45 * DEG), 1, 0, out);
    expect(out).toEqual({ x: 1, z: 0 });
  });

  it('tracks the live camera while neutral and re-latches on the next press', () => {
    latchBasis(DT, false, 0, 1, 0, 1, out);
    latchBasis(DT, false, 0, 0, 1, 0, out);
    // Released: the next press must sample where the player is looking now,
    // not where they were looking when they let go.
    expect(out).toEqual({ x: 1, z: 0 });
    latchBasis(DT, false, 0, 1, 1, 0, out);
    expect(out).toEqual({ x: 1, z: 0 });
  });

  it('drops the latch for a camera-mode change or a new run', () => {
    latchBasis(DT, false, 0, 1, 0, 1, out);
    invalidateBasis();
    latchBasis(DT, false, 0, 1, 1, 0, out);
    expect(out).toEqual({ x: 1, z: 0 });
  });

  it('refuses to latch a degenerate forward', () => {
    // A camera aimed straight down. Latching it would freeze the world-axis
    // fallback in for the whole hold, which is a framing change rather than the
    // safety net it is meant to be.
    invalidateBasis();
    latchBasis(DT, false, 0, 1, 0, 0, out);
    expect(out).toEqual({ x: 0, z: 0 });
    latchBasis(DT, false, 0, 1, 0, 1, out);
    expect(out).toEqual({ x: 0, z: 1 });
  });
});

describe('frame-rate independence', () => {
  /**
   * The sim's dog, as the two lines of it this test needs.
   *
   * `sim/step` builds a target velocity of `unit(direction) * maxSpeed * effort`
   * and hands it to `applyAcceleration`, which is an exponential approach at
   * DOG_ACCELERATION toward that target and at DOG_DECELERATION toward rest,
   * clamped to the ceiling. That is mirrored here rather than imported, for the
   * reason the camera helper gives for mirroring the rig: `stepSimulation` wants
   * a whole world, and what this needs is only that the velocity the conditioner
   * reads next frame is a function of the ones it commanded before. Every
   * constant in it comes from `@sim/tuning`, so the shape cannot drift silently.
   */
  interface Runner {
    x: number;
    z: number;
    vx: number;
    vz: number;
  }

  function carry(dog: Runner, move: Readonly<{ x: number; z: number }>, dt: number): void {
    const effort = Math.hypot(move.x, move.z);
    const targetX = effort > 0 ? (move.x / effort) * DOG_MAX_SPEED * effort : 0;
    const targetZ = effort > 0 ? (move.z / effort) * DOG_MAX_SPEED * effort : 0;
    const rate = effort > 0 ? DOG_ACCELERATION : DOG_DECELERATION;
    dog.vx += (targetX - dog.vx) * rate * dt;
    dog.vz += (targetZ - dog.vz) * rate * dt;
    const speed = Math.hypot(dog.vx, dog.vz);
    if (speed > DOG_MAX_SPEED) {
      dog.vx = (dog.vx / speed) * DOG_MAX_SPEED;
      dog.vz = (dog.vz / speed) * DOG_MAX_SPEED;
    }
    dog.x += dog.vx * dt;
    dog.z += dog.vz * dt;
  }

  /**
   * One script in wall-clock seconds: stand up, run, corner, throw it round and
   * power out, release.
   *
   * Every phase after the first is priced against a speed the phase before it
   * produced, which is the whole point. The 110-degree throw is the strongest
   * state dependence the law has: turn authority takes the effort away, the dog
   * brakes, `A_LAT / v` widens as it slows, and it comes out on an arc. A rate
   * that was secretly per-frame would take a different arc at every rate.
   */
  const SCRIPT: readonly { seconds: number; degrees: number | null }[] = [
    { seconds: 1.2, degrees: 0 },
    { seconds: 1.2, degrees: 90 },
    { seconds: 1.8, degrees: 200 },
    { seconds: 1.8, degrees: 90 },
    { seconds: 0.4, degrees: null },
  ];

  /** Sample the trajectory on the wall clock, not on the frame. */
  const SAMPLE_SECONDS = 0.1;

  interface Flight {
    /** The dog's position at each 0.1 s of wall clock. */
    samples: readonly { x: number; z: number }[];
    /** Seconds from each phase's start until the command reached its request. */
    aligned: readonly number[];
    /** Ground covered, m. What a divergence is measured beside. */
    path: number;
  }

  function fly(hz: number): Flight {
    resetConditioning();
    const dt = 1 / hz;
    const dog: Runner = { x: 0, z: 0, vx: 0, vz: 0 };
    const samples: { x: number; z: number }[] = [];
    const aligned: number[] = [];
    let clock = 0;
    let nextSample = SAMPLE_SECONDS;
    let path = 0;
    let lastX = 0;
    let lastZ = 0;

    SCRIPT.forEach((phase, index) => {
      const phaseStart = clock;
      // atan2 answers in (-PI, PI], so a request past the half turn - the 200
      // degrees below - has to be wrapped onto the same branch or it can never
      // compare equal to the command that reached it.
      const raw = (phase.degrees ?? 0) * DEG;
      const radians = Math.atan2(Math.sin(raw), Math.cos(raw));
      const engaged = phase.degrees !== null;
      for (let frame = 0; frame < Math.round(phase.seconds * hz); frame += 1) {
        const move = conditionMove(press({
          dirX: engaged ? Math.sin(radians) : 0,
          dirZ: engaged ? Math.cos(radians) : 0,
          effort: engaged ? 1 : 0,
          velocityX: dog.vx,
          velocityZ: dog.vz,
          dt,
        }));
        if (engaged && aligned[index] === undefined
          && Math.abs(angleOf(move) - radians) < 1e-9) {
          aligned[index] = clock + dt - phaseStart;
        }
        carry(dog, move, dt);
        clock += dt;
        if (clock >= nextSample - 1e-9) {
          samples.push({ x: dog.x, z: dog.z });
          path += Math.hypot(dog.x - lastX, dog.z - lastZ);
          lastX = dog.x;
          lastZ = dog.z;
          nextSample += SAMPLE_SECONDS;
        }
      }
    });
    return { samples, aligned, path };
  }

  /** The worst distance between two flights at the same wall-clock sample, m. */
  function divergence(a: Flight, b: Flight): number {
    let worst = 0;
    for (let i = 0; i < Math.min(a.samples.length, b.samples.length); i += 1) {
      worst = Math.max(worst, Math.hypot(
        a.samples[i]!.x - b.samples[i]!.x,
        a.samples[i]!.z - b.samples[i]!.z,
      ));
    }
    return worst;
  }

  it('flies the same trajectory at 30, 60 and 144 Hz', () => {
    const coarse = fly(30);
    const normal = fly(60);
    const fine = fly(144);

    // What is left between the three is the first-order error of integrating the
    // turn, which is O(dt) and converges: measured over an 86.2 m path, 0.438 m
    // between 30 and 60, 0.305 m between 60 and 144, and 0.732 m between the two
    // ends. The bound is stated as coarse-rate travel rather than as a fraction
    // of the path, because that is the quantity the error is proportional to:
    // 0.732 m is 1.46 frames of a 30 Hz dog at full run.
    //
    // It is nowhere near tight enough to be fragile and nowhere near loose enough
    // to pass the bug. A rate that was really a per-frame step would turn 4.8
    // times faster at 144 Hz than at 30, taking the 90-degree corner on a 1.7 m
    // radius instead of 8.0 m, which separates the two paths by more than 6 m -
    // four times this bound and an order of magnitude over what is left.
    const budget = 3 * (DOG_MAX_SPEED / 30);
    // `divergence` walks the SHORTER of the two sample lists and returns zero
    // for an empty one, so all three flights have to be shown to have flown
    // before the three comparisons below mean anything. Guarding only the
    // coarse one would let a rate that produced no samples pass silently.
    for (const flight of [coarse, normal, fine]) {
      expect(flight.path).toBeGreaterThan(80);
      expect(flight.samples.length).toBe(coarse.samples.length);
    }
    expect(divergence(coarse, normal)).toBeLessThan(budget);
    expect(divergence(normal, fine)).toBeLessThan(budget);
    expect(divergence(coarse, fine)).toBeLessThan(budget);
  });

  it('takes the same wall-clock time to come round, at every rate', () => {
    // The sharper half, and the one that needs no distance tolerance. Phase 0 is
    // excluded because a standing dog SNAPS to its first direction by design -
    // below DIRECTION_SNAP_SPEED there is no arc to respect - so its alignment is
    // one frame at any rate and is a property of the snap, not of the turn. Every
    // other phase is a genuine arc, and the time it takes is the law's own rate
    // integrated: 0.767 s to come round the 90-degree corner at 30 and 60 and
    // 0.757 at 144, then 0.867, 0.867 and 0.861 for each 110-degree throw.
    const turning = [30, 60, 144].map((hz) => fly(hz).aligned.slice(1));
    for (const times of turning) {
      expect(times.length).toBe(3);
      for (const time of times) expect(time).toBeGreaterThan(0);
    }
    // One 30 Hz frame of slack: below that the comparison is measuring which
    // frame the coarsest rate happened to land the last degree on.
    for (let phase = 0; phase < 3; phase += 1) {
      const times = turning.map((row) => row[phase]!);
      expect(Math.max(...times) - Math.min(...times), `phase ${phase + 1}`)
        .toBeLessThan(1 / 30);
    }
  });
});
