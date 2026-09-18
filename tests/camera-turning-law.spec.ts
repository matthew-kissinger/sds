// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The three parts of the Follow bearing law that the rate cap does not cover.
 *
 * `camera-rotation-cap` pins the ceiling, the end stop and the resting dead
 * zone. Each of those is a bound on a single frame. What the plan actually leans
 * on for comfort is three pieces of state that bound a MANOEUVRE, and none of
 * them had a test:
 *
 *  - the dead zone's direction hysteresis. A rig capped at 25 deg/s reports 0%
 *    of time above 60 deg/s by construction, which makes that receipt
 *    unfalsifiable, and the case it hides is the one herding produces most: a
 *    player weaving a flock drives a 0.2 to 0.4 Hz oscillation that lands just
 *    under the cap, so the cap never engages. What separates a weave from a turn
 *    is that a weave reverses, so the threshold to keep turning the way the rig
 *    already turns is small and the threshold to reverse is wide.
 *  - the approach hold and its displacement release. Letting a dog run at the
 *    camera and out the other side removes the 180-degree reversal, but a hold
 *    with no exit strands a player fetching a bolted sheep: the yaw freezes at
 *    half a turn of error while the rig retreats at 25 m/s.
 *  - `reseat`. At the `off` end stop the bearing never moves, so re-entering
 *    Follow is the whole of the player's camera authority.
 *
 * The probes below script the ERROR rather than the dog's world direction, by
 * pointing the dog at a fixed angle off the rig's CURRENT bearing every frame.
 * That is deliberate: these are laws about what the rig does with a given error,
 * and letting the loop close would let the rig change the input to its own law.
 * Where a closed loop is the point - the weave - the dog's world direction is
 * scripted instead, and the test says so.
 */

import { describe, expect, it } from 'vitest';
import type { Dog } from '@sim/types';
import {
  createFollowFraming,
  followBearing,
  type FollowFraming,
  type FollowTurning,
} from '@app/camera/followFraming';
import { cameraViewProfile } from '@app/camera/viewProfile';
import { FOLLOW_YAW_TAU, MAX_FOLLOW_YAW_RATE, easeInOut, smoothing } from '@app/camera/feel';

const DT = 1 / 60;
const DEG = Math.PI / 180;
const VIEW = cameraViewProfile(16 / 9).follow;

/** The gentle profile's resting dead zone, and the two thresholds around it.
 *  Restated rather than imported: the rig's table is private, and a test that
 *  read it could not fail if the table were wrong. */
const DEAD_ZONE = 20 * DEG;
const CONTINUE = DEAD_ZONE * 0.75;
const REVERSE = DEAD_ZONE * 1.875;

/** Where the approach hold begins and ends, and what releases it. */
const HOLD_START = 100 * DEG;
const HOLD_END = 120 * DEG;
const HOLD_RELEASE_TRAVEL = 20;

/** Ground speed for every probe, m/s, so a frame is exactly 0.2 m of travel. */
const SPEED = 12;
const PER_FRAME = SPEED * DT;

function makeDog(): Dog {
  return {
    position: { x: 0, z: 0 },
    velocity: { x: 0, z: 0 },
    heading: { x: 0, z: 1 },
  } as unknown as Dog;
}

/** A framing seated on a dog running up the field, bearing exactly zero. */
function seat(mode: FollowTurning = 'gentle'): { framing: FollowFraming; dog: Dog } {
  const framing = createFollowFraming(VIEW, mode);
  const dog = makeDog();
  dog.velocity.z = SPEED;
  framing.update(DT, dog);
  return { framing, dog };
}

/** Send the dog off at `angle`, advancing its position by one frame of travel. */
function travel(dog: Dog, angle: number): void {
  dog.velocity.x = Math.sin(angle) * SPEED;
  dog.velocity.z = Math.cos(angle) * SPEED;
  dog.position.x += dog.velocity.x * DT;
  dog.position.z += dog.velocity.z * DT;
}

/** One frame at `error` off the rig's current bearing. Returns the step taken. */
function step(framing: FollowFraming, dog: Dog, error: number): number {
  const before = framing.bearing;
  travel(dog, before + error);
  framing.update(DT, dog);
  return framing.bearing - before;
}

/** `frames` frames at `error` off the bearing. Returns the total |rotation|. */
function hold(framing: FollowFraming, dog: Dog, error: number, frames: number): number {
  let sum = 0;
  for (let frame = 0; frame < frames; frame += 1) sum += Math.abs(step(framing, dog, error));
  return sum;
}

/** What the law owes for an error outside its threshold, before the rate cap. */
function demand(error: number, threshold: number): number {
  return Math.sign(error) * (Math.abs(error) - threshold) * smoothing(DT, FOLLOW_YAW_TAU);
}

describe('dead zone direction hysteresis', () => {
  /** Commit the rig to turning one way, and return it still turning that way. */
  function spinning(sign: number): { framing: FollowFraming; dog: Dog } {
    const seated = seat();
    const committed = step(seated.framing, seated.dog, sign * DEAD_ZONE * 2);
    expect(Math.sign(committed)).toBe(sign);
    return seated;
  }

  it.each([1, -1])('keeps turning at 0.75 of the resting zone, direction %i', (sign) => {
    // 15 degrees at the gentle profile's 20. A sustained turn never asks for a
    // reversal, so it only ever meets this one and does not notice the rule.
    const { framing, dog } = spinning(sign);
    expect(step(framing, dog, sign * (CONTINUE - 1e-6))).toBe(0);
    for (const excess of [1e-6, 1e-3, 1e-2]) {
      const { framing: rig, dog: subject } = spinning(sign);
      expect(step(rig, subject, sign * (CONTINUE + excess)))
        .toBeCloseTo(demand(sign * excess, 0), 12);
    }
  });

  it.each([1, -1])('needs 1.875 of the resting zone to reverse, from direction %i', (sign) => {
    // 37.5 degrees. This is the whole mechanism: a weave pays it on every flank
    // change, which is what stops it driving the camera.
    const { framing, dog } = spinning(sign);
    expect(step(framing, dog, -sign * (REVERSE - 1e-6))).toBe(0);
    for (const excess of [1e-6, 1e-3, 1e-2]) {
      const { framing: rig, dog: subject } = spinning(sign);
      expect(step(rig, subject, -sign * (REVERSE + excess)))
        .toBeCloseTo(demand(-sign * excess, 0), 12);
    }
  });

  it('holds the direction bit through the error passing back to zero', () => {
    // Clearing the bit at zero error would hand every flank change of a weave
    // the resting dead zone again, which is the case this exists for. It clears
    // only when the yaw is genuinely idle.
    const { framing, dog } = spinning(1);
    expect(hold(framing, dog, 0, 30)).toBe(0);
    expect(step(framing, dog, CONTINUE + 1e-3)).toBeGreaterThan(0);

    // Idle means the dog stopped. Then the resting zone is back in force.
    dog.velocity.x = 0;
    dog.velocity.z = 0;
    framing.update(DT, dog);
    expect(step(framing, dog, CONTINUE + 1e-3)).toBe(0);
    expect(step(framing, dog, DEAD_ZONE + 1e-3)).toBeGreaterThan(0);
  });

  it('stops a weave driving the camera at all, at every frequency in the band', () => {
    // The closed loop, because that is the claim: the dog's WORLD direction
    // oscillates about a fixed mean and the rig chases it. 25 degrees of
    // amplitude is 50 peak to peak, which is what the 37.5 reverse threshold
    // buys - it kills weaves up to about 26 degrees of amplitude. Measured over
    // 20 s: 8.8 degrees in total, of which 7.3 is the rig committing once on
    // the first flank and 1.5 is everything after, an average of 0.15 deg/s.
    // The plan's figure for a weave WITHOUT this rule is 1,500 to 1,700 degrees
    // over two minutes, so the whole mechanism is in the ratio between those.
    for (const frequency of [0.2, 0.3, 0.4]) {
      const { framing, dog } = seat();
      let total = 0;
      let late = 0;
      const frames = Math.round(20 / DT);
      for (let frame = 0; frame < frames; frame += 1) {
        const before = framing.bearing;
        travel(dog, Math.sin(frame * DT * frequency * 2 * Math.PI) * 25 * DEG);
        framing.update(DT, dog);
        const moved = Math.abs(framing.bearing - before);
        total += moved;
        if (frame > frames / 2) late += moved;
      }
      // The lower bound is the half that stops this passing on a rig that has
      // stopped turning at all. Suppressing a weave is only worth anything from
      // a rig that still commits to the first flank, and that commit is 7.3 of
      // the 8.8 degrees. Without it the end stop would pass this test.
      expect(total / DEG, `${frequency} Hz`).toBeGreaterThan(5);
      expect(total / DEG, `${frequency} Hz`).toBeLessThan(10);
      expect(late / DEG, `${frequency} Hz, second half`).toBeLessThan(2);
    }
  });
});

describe('approach hold', () => {
  it('ramps the gain out between 100 and 120 degrees, with no corner', () => {
    // A threshold would chatter. The ramp is the same smoothstep the mode blend
    // uses, applied to the gain, so the rig arrives at zero rotation smoothly.
    for (const fraction of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const { framing, dog } = seat();
      const error = HOLD_START + (HOLD_END - HOLD_START) * fraction;
      const gain = 1 - easeInOut(fraction);
      const limit = MAX_FOLLOW_YAW_RATE * DT;
      const owed = demand(error, DEAD_ZONE) * gain;
      expect(step(framing, dog, error)).toBeCloseTo(Math.min(owed, limit), 12);
    }
  });

  it('gives a reversal exactly zero rotation until the run is committed', () => {
    // The worst case the hold exists for. Zero, not nearly zero: a feint or a
    // dodge must cost the camera nothing, and 20 m at a full run is 1.3 s, far
    // longer than any of them.
    const { framing, dog } = seat();
    const seated = framing.bearing;
    const frames = Math.round(HOLD_RELEASE_TRAVEL / PER_FRAME) - 1;
    expect(hold(framing, dog, Math.PI, frames)).toBe(0);
    expect(framing.bearing).toBe(seated);
  });

  it('releases on 20 m of displacement, not on a timer', () => {
    // A timer would cut off a slow retrieval and a fast feint at the same
    // moment. Displacement is what tells them apart, so the release must land
    // at the same METRES however long they take.
    for (const speed of [4, 12, 25]) {
      const framing = createFollowFraming(VIEW, 'gentle');
      const dog = makeDog();
      dog.velocity.z = speed;
      framing.update(DT, dog);
      let travelled = 0;
      let releasedAt = -1;
      for (let frame = 0; frame < 2000 && releasedAt < 0; frame += 1) {
        const before = framing.bearing;
        const angle = before + Math.PI;
        dog.velocity.x = Math.sin(angle) * speed;
        dog.velocity.z = Math.cos(angle) * speed;
        framing.update(DT, dog);
        travelled += speed * DT;
        if (framing.bearing !== before) releasedAt = travelled;
      }
      // Within one frame of travel of the threshold, at every speed.
      expect(releasedAt, `${speed} m/s`).toBeGreaterThan(HOLD_RELEASE_TRAVEL - speed * DT);
      expect(releasedAt, `${speed} m/s`).toBeLessThanOrEqual(HOLD_RELEASE_TRAVEL + speed * DT);
    }
  });

  it('does not let a dip below the cone edge re-arm the accumulator', () => {
    // A jink is defined by being brief, so evidence of a committed run has to
    // survive one. Zeroing the count on every dip let a dog weaving across the
    // cone edge oftener than once per 20 m restart it every time, so the
    // release never fired and the failure the hold exists to prevent - the dog
    // held head-on for an unbounded time - was reachable by ordinary weaving.
    // Every duty cycle below spends under 20 m inside the cone per pass, so
    // under the zeroing rule not one of them would ever release.
    for (const [inside, outside] of [[60, 15], [45, 15], [30, 10], [90, 30], [20, 10]] as const) {
      const { framing, dog } = seat();
      let travelled = 0;
      let releasedAt = -1;
      let phase = 0;
      for (let frame = 0; frame < 600 && releasedAt < 0; frame += 1) {
        const within = phase < inside;
        const moved = step(framing, dog, (within ? 125 : 95) * DEG);
        travelled += PER_FRAME;
        if (within && moved !== 0) releasedAt = travelled;
        phase = (phase + 1) % (inside + outside);
      }
      expect(releasedAt, `${inside} in / ${outside} out`).toBeGreaterThan(0);
      expect(releasedAt, `${inside} in / ${outside} out`).toBeLessThan(60);
    }
  });

  it('decays the count back to nothing over the same metres', () => {
    // Surviving a dip is not the same as never forgetting. A dog that leaves
    // the cone and stays out has to buy the whole 20 m again, or a single old
    // jink would make the next genuine approach turn the camera immediately.
    const { framing, dog } = seat();
    hold(framing, dog, 130 * DEG, 50); // 10 m banked.
    hold(framing, dog, 0, Math.round(20 / PER_FRAME)); // 20 m of straight running.
    const frames = Math.round(HOLD_RELEASE_TRAVEL / PER_FRAME) - 1;
    expect(hold(framing, dog, 130 * DEG, frames)).toBe(0);
    // The count is a sum of `speed * dt`, so which side of 20 m the hundredth
    // frame lands on is float dust. Two frames of slack, 0.4 m, settles it.
    expect(hold(framing, dog, 130 * DEG, 2)).toBeGreaterThan(0);
  });
});

describe('Follow reseat', () => {
  it('is the only camera authority an Off player has', () => {
    // The bearing is pinned, so without this a player who armed it facing north
    // and then herded south would view the dog head-on for the rest of the
    // session. The documented gesture is the camera key twice.
    const { framing, dog } = seat('off');
    expect(framing.bearing).toBe(0);
    expect(hold(framing, dog, Math.PI / 2, 600)).toBe(0);
    expect(framing.bearing).toBe(0);

    // Re-entering Follow re-arms it on the dog's direction of travel, exactly.
    framing.reseat();
    const heading = 2.1;
    travel(dog, heading);
    framing.update(DT, dog);
    expect(framing.bearing).toBeCloseTo(heading, 12);
    expect(followBearing()).toBe(framing.bearing);

    // And it is still pinned afterwards, at the new bearing.
    expect(hold(framing, dog, Math.PI / 2, 600)).toBe(0);
  });

  it('re-arms a turning profile too, and drops the state the old bearing owned', () => {
    // The hysteresis bit and the hold count are facts about a bearing that no
    // longer exists. Carrying either across a re-arm would hand the next frame
    // the continue threshold, or a banked approach, for no reason the player
    // could see.
    const { framing, dog } = seat();
    expect(step(framing, dog, DEAD_ZONE * 2)).toBeGreaterThan(0);
    hold(framing, dog, 130 * DEG, 50);

    framing.reseat();
    travel(dog, -1.3);
    framing.update(DT, dog);
    expect(framing.bearing).toBeCloseTo(-1.3, 12);
    // The resting zone, not the 0.75 continue threshold: the bit is gone.
    expect(step(framing, dog, CONTINUE + 1e-3)).toBe(0);
    expect(step(framing, dog, DEAD_ZONE + 1e-3)).toBeGreaterThan(0);
    // And the full 20 m of hold is owed again rather than the 10 m banked above.
    const { framing: fresh, dog: subject } = seat();
    fresh.reseat();
    travel(subject, 0);
    fresh.update(DT, subject);
    expect(hold(fresh, subject, Math.PI, Math.round(HOLD_RELEASE_TRAVEL / PER_FRAME) - 1)).toBe(0);
  });

  it('asks for the state a fresh rig already has when called before the first frame', () => {
    const framing = createFollowFraming(VIEW, 'gentle');
    framing.reseat();
    const dog = makeDog();
    travel(dog, 1.9);
    framing.update(DT, dog);
    expect(framing.bearing).toBeCloseTo(1.9, 12);
  });
});
