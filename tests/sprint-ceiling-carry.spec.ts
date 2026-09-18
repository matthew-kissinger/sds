// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * What a sprint release does to the dog, measured against the real sim.
 *
 * `sim/` clamps the dog's velocity to whichever ceiling this tick's `sprint`
 * selects, and does it as a hard clamp rather than a ramp. So the tick a sprint
 * ends while the dog is still travelling at the sprint speed is a 10 m/s step in
 * one tick: about 600 m/s^2, which is the pop `feel.ts` has an apology for in its
 * own comments and the largest single acceleration in the game by a factor of
 * roughly fifteen. It is also the thing that throws every camera term derived
 * from the dog's velocity.
 *
 * The fix is in the input layer and nowhere else: the commanded ceiling trails
 * the device, so `intent.sprint` stays up for the few ticks the commanded speed
 * spends above the walk ceiling and the sim's clamp has nothing to fire on. The
 * dog then comes down the conditioner's own ACCEL_DOWN ramp instead.
 *
 * Two things have to be true at once and this file pins both, because getting
 * one without the other is the failure mode the plan warns about at length:
 *
 *  - the peak braking through a voluntary release is a fraction of 600,
 *  - and the carry never reaches the exhaustion latch. `setSprint` clears the
 *    latch on a release edge, so feeding the trailing value to it would fire
 *    that edge while the value was still true and hand a player who exhausts
 *    sprint, releases above the walk ceiling and re-presses a free burst. That
 *    is a leaderboard-visible behaviour change.
 *
 * The loop below is `IntentResolver`'s frame body and `useGameLoop`'s tick in the
 * order the page runs them, against a real `CpuDeterministicSim`. Nothing here
 * writes to `sim/`; the whole point of the conditioner is that it does not.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { CpuDeterministicSim } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import {
  DOG_MAX_SPEED,
  DOG_SPRINT_SPEED,
  FIXED_DT,
  MIN_STAMINA_TO_SPRINT,
  STAMINA_DRAIN_RATE,
} from '@sim/tuning';
import { ACCEL_DOWN, conditionMove, type MoveRequest } from '@app/input/conditioning';
import {
  clearIntent,
  currentIntent,
  isSprintExhausted,
  resolveSprintForTick,
  setMoveDirection,
  setSprint,
  setSprintCarry,
} from '@app/input/intent';

/** The velocity step the sim's clamp produces unaided, m/s^2. */
const UNFIXED_STEP = (DOG_SPRINT_SPEED - DOG_MAX_SPEED) / FIXED_DT;

/**
 * Ceiling on the braking any sprint edge may cost the dog, m/s^2. A quarter of
 * the unaided step.
 *
 * A plain voluntary release measures exactly ACCEL_DOWN, 45 m/s^2, and the
 * voluntary case below asserts that equality rather than this bound. What this
 * number is for is the adversarial edges: the exhaustion cut costs 67.5 and a
 * player tapping sprint on and off every 37 ticks costs 112.5, against 595.7
 * for the same tapping with the carry dropped. Set as a fraction of the unaided
 * step rather than as a figure of its own, so it moves if either dog speed does.
 */
const RELEASE_CEILING = UNFIXED_STEP / 4;

interface Sample {
  /**
   * Worst DECELERATION the dog experienced over the run, m/s^2.
   *
   * Braking rather than |dv/dt|, because the largest acceleration in any of
   * these runs is the launch, and the launch is deliberate: the plan measures
   * 2.71 m/s on the first tick after a press, 163 m/s^2, and preserves it on
   * purpose because onset is the one thing a control cannot spend. The sim's
   * ceiling clamp can only ever brake, so this is the quantity it moves.
   */
  braking: number;
  /** Top speed reached, so a run that never sprinted cannot pass quietly. */
  top: number;
  /** Whether the trailing ceiling was ever asked for. */
  carried: boolean;
}

/**
 * Drive the real sim for `ticks`, sprinting while `sprinting(tick)` is true.
 * `wire` is how the trailing ceiling reaches the intent: the shipped path passes
 * it to `setSprintCarry`, and the control below drops it on the floor.
 */
function run(
  ticks: number,
  sprinting: (tick: number) => boolean,
  wire: (carry: boolean) => void = setSprintCarry,
): Sample {
  clearIntent();
  const sim = new CpuDeterministicSim(HOME_FIELD, 25, 7103);
  const request: MoveRequest = {
    dirX: 0,
    dirZ: 1,
    effort: 1,
    sprintDevice: false,
    sprintAvailable: false,
    stamina: 0,
    velocityX: 0,
    velocityZ: 0,
    dt: FIXED_DT,
  };
  const sample: Sample = { braking: 0, top: 0, carried: false };

  for (let tick = 0; tick < ticks; tick += 1) {
    const dog = sim.state.dogs[0]!;
    const velocityX = dog.velocity.x;
    const velocityZ = dog.velocity.z;
    const before = Math.hypot(velocityX, velocityZ);
    const device = sprinting(tick);

    // IntentResolver, in its own order: the device sprint reaches the latch
    // first, before anything derived from it exists to be confused with it.
    setSprint(device, false);
    request.sprintDevice = device;
    request.sprintAvailable =
      before > 0.1 &&
      !isSprintExhausted() &&
      dog.stamina - STAMINA_DRAIN_RATE * FIXED_DT >= MIN_STAMINA_TO_SPRINT;
    request.stamina = dog.stamina;
    request.velocityX = velocityX;
    request.velocityZ = velocityZ;

    const move = conditionMove(request);
    if (move.sprintCarry) sample.carried = true;
    wire(move.sprintCarry);
    setMoveDirection(move.x, move.z);

    // useGameLoop: resolve the latch against this tick's stamina, then step.
    resolveSprintForTick(dog.stamina);
    sim.step([currentIntent()], FIXED_DT);

    const after = Math.hypot(dog.velocity.x, dog.velocity.z);
    sample.top = Math.max(sample.top, after);
    if (after < before) {
      sample.braking = Math.max(sample.braking, (before - after) / FIXED_DT);
    }
  }
  return sample;
}

/** Sprint for `held` ticks from a standing start, then keep running. */
function release(held: number) {
  return (tick: number): boolean => tick < held;
}

afterEach(clearIntent);

describe('sprint release acceleration', () => {
  it('costs the dog a fraction of what the unclamped release costs', () => {
    // 90 ticks is a second and a half: long enough to be at the sprint ceiling
    // and short enough that stamina is nowhere near the floor, so this is a
    // VOLUNTARY release and not the exhaustion cut.
    const carried = run(240, release(90));
    expect(carried.top).toBeGreaterThan(DOG_MAX_SPEED + 1);
    expect(carried.carried).toBe(true);
    expect(carried.braking).toBeLessThan(RELEASE_CEILING);
    // And the conditioner's own ramp, which is the claim: the dog is no longer
    // being clamped by the sim at all, it is riding the command down. Measured
    // 44.99997 rather than 45 because the dog tracks the falling command through
    // its own 1/40 s approach, so it is a hair behind it the whole way.
    expect(carried.braking).toBeCloseTo(ACCEL_DOWN, 3);

    // The control. Same run, same sim, same seed, with the trailing ceiling
    // dropped on the floor - which is the shipped behaviour before this change
    // and what the conditioner would be worth nothing without.
    const unfixed = run(240, release(90), () => {});
    expect(unfixed.braking).toBeGreaterThan(UNFIXED_STEP * 0.9);
    expect(carried.braking).toBeLessThan(unfixed.braking / 4);
  });

  it('holds at every hold length, so it is not one lucky tick', () => {
    // 24 ticks and not 20. At 20 the commanded ramp has only reached the walk
    // ceiling, so the dog never sprints, nothing is ever carried and the sim's
    // clamp has nothing to fire on: the row passed while testing none of this.
    // 24 is the shortest hold that puts the dog above the walk ceiling, and the
    // `top` guard below is what stops the table quietly losing a row again.
    // 300 ticks is past exhaustion, so that row is the cut rather than a
    // release, which is the other end of the same bound.
    for (const held of [24, 45, 90, 150, 300]) {
      const sample = run(held + 150, release(held));
      expect(sample.top, `${held} ticks held`).toBeGreaterThan(DOG_MAX_SPEED + 1);
      expect(sample.braking, `${held} ticks held`).toBeLessThan(RELEASE_CEILING);
    }
  });

  it('holds through a player tapping sprint on and off', () => {
    // Every release edge is a chance for the ceiling and the command to
    // disagree, so the worst case is a player who never holds it long.
    for (const period of [6, 11, 20, 37]) {
      const sample = run(600, (tick) => tick % period < period / 2);
      // Same guard as the table above: a tapping pattern too fast to leave the
      // walk ceiling would report a small number for the reason that there was
      // nothing to brake from.
      expect(sample.top, `${period}-tick tapping`).toBeGreaterThan(DOG_MAX_SPEED + 1);
      expect(sample.carried, `${period}-tick tapping`).toBe(true);
      expect(sample.braking, `${period}-tick tapping`).toBeLessThan(RELEASE_CEILING);
    }
  });

  it('keeps the exhaustion cut out of the carry, where the sim owns the ceiling', () => {
    // Held to exhaustion the ceiling drops for a reason the carry cannot argue
    // with, so the carry stands aside. What it must NOT do is clear the latch on
    // the way past: the device is still held, so the dog stays cut off.
    const sample = run(900, () => true);
    expect(sample.top).toBeGreaterThan(DOG_MAX_SPEED + 1);
    expect(isSprintExhausted()).toBe(true);
    expect(currentIntent().sprint).toBe(false);
    // And the cut itself is still far better than the unaided step, because the
    // conditioner eases the commanded ceiling out ahead of the sim's floor.
    expect(sample.braking).toBeLessThan(UNFIXED_STEP / 2);
  });
});
