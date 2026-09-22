// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The Follow camera against a THUMB, which is the input the desktop never has.
//
// Reported as "the camera jitters when it rotates with you, on a phone, in
// third person but not aerial". The cause was `YAW_ENGAGE_SPEED`, then a hard
// boolean: below 1 m/s the bearing held, at or above it the bearing chased.
// Against `DOG_MAX_SPEED` of 15 that switch sits at 6.7% of commanded effort,
// 3.2 px of offset on the 48 px `STICK_RADIUS`, and a thumb does not hold
// 3.2 px. A keyboard commands 0 or 1 and cannot reach the band at all.
//
// WHAT THE FIX HAS TO BE MEASURED AGAINST is not smoothness. A camera that is
// merely rough while turning one way reads as a frame rate problem; a camera
// that REVERSES reads as shake, and reversal is what the defect produced - a
// quarter of all frames at 33 fps. So the metric here is the largest single
// frame rotation that reverses the direction the camera was already turning.
// A legitimate fast turn never reverses, so the bound can be tight without
// constraining how hard the rig is allowed to work.
//
// RULED OUT ON THE WAY, each with its own arm, none of them the cause:
//   - subject interpolation: identical yaw with and without it, every scenario
//   - tick-quantised velocity: identical at phone rates; a 2x excess at 144 fps
//     only, where frames outrun the 60 Hz tick, which is a desktop artifact
//   - frame pacing: +/-12 ms of spread on a 33 fps clock moves the view
//     direction's wobble by under 0.1 degrees. The rig is clock-independent.
//
// TWO MEASUREMENT TRAPS, BOTH HIT HERE FIRST, BOTH WORTH LEAVING WRITTEN DOWN:
//
// 1. A plain second difference of yaw assumes an even dt. These traces carry
//    several ms of spread on purpose, so smooth motion scores as rough on that
//    metric, and the first version of this file "found" a defect that was only
//    the trace. Angular velocity dyaw/dt is well defined at any spacing.
//
// 2. A fast arc saturates the 25 deg/s rate cap, and a saturated rate cap is
//    the smoothest the rig ever is: it emits exactly rate * dt regardless of
//    its input. Sweeping only a fast arc measures the one regime that cannot
//    chatter, and reports the defect as absent.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import { CpuDeterministicSim } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import { FIXED_DT, DOG_MAX_SPEED } from '@sim/tuning';
import { createCameraSubject } from '@app/camera/subject';
import { createComposedRig, type ComposedRigInput } from '@app/camera/composedRig';
import { cameraViewProfile } from '@app/camera/viewProfile';
import { studioLayout } from '@app/camera/studioLayout';

const DEG = 180 / Math.PI;
const MAX_STEPS_PER_FRAME = 5;

/**
 * Commanded efforts to sweep. `YAW_ENGAGE_SPEED / DOG_MAX_SPEED` is 0.0667, so
 * these straddle the band from well under it to a full run. Expressed against
 * the tuning rather than written out, so moving either constant moves the
 * sweep with it instead of quietly sliding it off the feature under test.
 */
const ENGAGE_EFFORT = 1 / DOG_MAX_SPEED;
const EFFORTS = [0.6, 0.75, 0.9, 0.98, 1.05, 1.2, 1.5, 2.25, 4.5, 15]
  .map((speed) => (speed / DOG_MAX_SPEED));

interface Turn {
  /** deg, the largest single frame rotation that reversed the turn. */
  worstReversal: number;
  /** Share of frames whose rotation reversed the previous one. */
  reversals: number;
  /** deg/s^2, mean absolute angular acceleration of the view direction. */
  accel: number;
  /** m/s, the speed the dog settled to. */
  speed: number;
}

/**
 * One steady turn at a commanded effort, driven through the real chain: sim,
 * the accumulator from `useGameLoop`, `createCameraSubject`, `createComposedRig`
 * and `camera.lookAt`.
 *
 * `breathe` is the fractional wobble on the commanded effort. Zero is a stick
 * held in a vice, which is the only thing a keyboard can produce and is not
 * what a phone delivers; 0.15 is a thumb.
 */
function turn(effort: number, breathe: number, dtMs: number, spreadMs: number): Turn {
  const sim = new CpuDeterministicSim(HOME_FIELD, 25, 8);
  const subject = createCameraSubject();
  const view = cameraViewProfile(390 / 844);
  const camera = new THREE.PerspectiveCamera(view.fov, 390 / 844, 0.1, 2000);
  const pipeline = createComposedRig({ follow: true, sim, view: view.follow, turning: 'gentle' });
  pipeline.setFollowView(view.follow);
  pipeline.setStudioDistance(studioLayout(390, 844).distanceScale);
  const input: ComposedRigInput = {
    sim, follow: true, reducedMotion: false, turning: 'gentle',
    complete: false, customize: false, customizeTab: 'dog',
    customizeDogAngle: 'hero', customizeOrbitAngle: 0, customizeSelectedSheep: 0,
    sheep: sim.state.sheep,
  };

  let s = 0x9e3779b9;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000);
  const forward = new THREE.Vector3();
  const yaws: number[] = [];
  const dts: number[] = [];
  let accumulator = 0, elapsed = 0, speedSum = 0, samples = 0;

  for (let frame = 0; frame < 600; frame += 1) {
    const dt = Math.max(0.001, (dtMs + (rand() * 2 - 1) * spreadMs) / 1000);
    // A thumb pushing a steady turn, and breathing while it does it. 5.3 rad/s
    // is 0.84 Hz, the rate a resting hand actually wanders at - fast enough to
    // be inside a frame's reach, slow enough that no input filter reads it as
    // a gesture and opens its cutoff.
    const e = Math.max(0, effort * (1 + Math.sin(elapsed * 5.3) * breathe));
    const heading = elapsed * 0.35;
    const direction = { x: Math.sin(heading) * e, z: Math.cos(heading) * e };
    elapsed += dt;

    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      sim.step([{ direction, sprint: false, bark: false }], FIXED_DT);
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) accumulator = 0;

    const live = sim.state.dogs[0]!;
    speedSum += Math.hypot(live.velocity.x, live.velocity.z);
    samples += 1;

    const dog = subject.sample(sim, dt);
    if (!dog) continue;
    input.sim = sim;
    input.sheep = sim.state.sheep;
    pipeline.frame(dt, dog, input);
    camera.position.copy(pipeline.position);
    camera.lookAt(pipeline.aim);
    camera.getWorldDirection(forward);
    yaws.push(Math.atan2(forward.x, forward.z));
    dts.push(dt);
  }

  // Unwrap, so a crossing of +/-PI is not read as a whole turn.
  for (let i = 1; i < yaws.length; i += 1) {
    let d = yaws[i]! - yaws[i - 1]!;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    yaws[i] = yaws[i - 1]! + d;
  }

  const omega: number[] = [];
  for (let i = 1; i < yaws.length; i += 1) omega.push((yaws[i]! - yaws[i - 1]!) / dts[i]!);

  let worstReversal = 0, reversals = 0, accel = 0, counted = 0;
  for (let i = 1; i < omega.length; i += 1) {
    const span = (dts[i]! + dts[i + 1]!) / 2;
    accel += Math.abs(omega[i]! - omega[i - 1]!) / span;
    counted += 1;
    if (omega[i]! * omega[i - 1]! < 0) {
      reversals += 1;
      // The rotation the eye is handed on the frame the direction flipped.
      const excursion = Math.abs(omega[i]!) * dts[i + 1]!;
      if (excursion > worstReversal) worstReversal = excursion;
    }
  }

  return {
    worstReversal: worstReversal * DEG,
    reversals: reversals / Math.max(1, counted),
    accel: (accel / Math.max(1, counted)) * DEG,
    speed: speedSum / Math.max(1, samples),
  };
}

const CLOCKS = [
  { name: '60 fps', dtMs: 16.67, spreadMs: 0.6 },
  { name: '33 fps', dtMs: 30, spreadMs: 6 },
] as const;

/**
 * Degrees. The defect measured 0.87 at its worst and the fix measures under
 * 0.05, so this sits an order of magnitude below the failure and well above
 * the pass. It is a bound on a REVERSING frame only: the rig may rotate as
 * hard as its own rate cap lets it, and routinely covers 0.75 degrees in a
 * frame at 33 fps doing so, without coming near this.
 */
const SHAKE_LIMIT = 0.15;

describe('Follow camera against a thumb', () => {
  it('does not shake when the commanded effort breathes across the engage band', () => {
    // The whole failure: a thumb parked near the engage speed. Before the band
    // and its lag, this reversed the camera on 23.7% of frames at 33 fps with
    // excursions up to 0.87 degrees, which is the shake that was reported.
    for (const clock of CLOCKS) {
      for (const effort of EFFORTS) {
        const result = turn(effort, 0.15, clock.dtMs, clock.spreadMs);
        expect(
          result.worstReversal,
          `${clock.name} at effort ${effort.toFixed(3)} (${result.speed.toFixed(2)} m/s)`,
        ).toBeLessThan(SHAKE_LIMIT);
      }
    }
  });

  it('holds that bound hardest exactly where the engage band sits', () => {
    // Pinned separately from the sweep above so that widening the band, or
    // dropping the lag, fails HERE with the reason attached rather than as one
    // unexplained row of a table.
    for (const clock of CLOCKS) {
      const result = turn(ENGAGE_EFFORT, 0.15, clock.dtMs, clock.spreadMs);
      expect(result.speed, clock.name).toBeGreaterThan(0.85);
      expect(result.speed, clock.name).toBeLessThan(1.15);
      // No reversal at all, not merely a small one: inside the band the lagged
      // authority moves too slowly for a 0.84 Hz breath to turn it around.
      expect(result.reversals, clock.name).toBe(0);
    }
  });

  it('leaves a steady thumb and a full run exactly as smooth as they were', () => {
    // The fix must not buy the band by roughening anything either side of it.
    // A run at full effort is the case every existing camera test covers, and
    // it is untouched: above the band the authority is pinned at 1.
    for (const clock of CLOCKS) {
      const running = turn(1, 0, clock.dtMs, clock.spreadMs);
      expect(running.reversals, clock.name).toBe(0);
      expect(running.accel, clock.name).toBeLessThan(5);

      const crawling = turn(ENGAGE_EFFORT, 0, clock.dtMs, clock.spreadMs);
      expect(crawling.reversals, clock.name).toBe(0);
      expect(crawling.accel, clock.name).toBeLessThan(5);
    }
  });
});
