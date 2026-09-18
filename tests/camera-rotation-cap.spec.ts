// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The property the camera comfort work rests on: the Follow rig's bearing is
 * the only rotating quantity in the picture, and it cannot turn faster than its
 * law allows. Nothing asserted this before, because there was nothing to read
 * it from. The framing publishes its bearing now, so it can be measured.
 *
 * Four things are pinned here and each one is a defect the old rig had: the
 * rate ceiling holds instantaneously at every frame rate and across a stalled
 * frame, because a cap integrated per frame rather than per second is not a cap
 * at all; the `off` profile reaches exactly zero rotation, not nearly zero,
 * which is what an accessibility end stop means; the dead zone comes off the
 * ERROR, so what it passes falls continuously to zero at the boundary instead
 * of stepping off a cliff; and the aim is bolted to the bearing with a constant
 * pitch, so no rotation reaches the picture by a route the bearing does not
 * account for. The rig this replaces smoothed its aim separately and measured a
 * 166 deg/s peak against a 35 deg/s clamp on the orbit.
 *
 * The rate figures are the framing's own turning table, which is private to it.
 * Gentle is `MAX_FOLLOW_YAW_RATE`; quick is repeated below, because a test that
 * imported the table could not fail if the table were wrong.
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
import { FOLLOW_YAW_TAU, MAX_FRAME_DT, MAX_FOLLOW_YAW_RATE, smoothing } from '@app/camera/feel';

const DT = 1 / 60;
const DEG = Math.PI / 180;
const VIEW = cameraViewProfile(16 / 9).follow;

/** Rate ceilings per turning profile, rad/s. */
const RATE: Record<FollowTurning, number> = {
  off: 0,
  gentle: MAX_FOLLOW_YAW_RATE,
  quick: 40 * DEG,
};

/**
 * Look-ahead scale per turning profile, restated from the same table. `off`
 * aims at the dog because it has no bearing authority to spend on where the dog
 * is going; `quick` leans a quarter further ahead than `gentle` does.
 */
const LEAD: Record<FollowTurning, number> = { off: 0, gentle: 1, quick: 1.25 };

/** The gentle profile's resting dead zone on the bearing error, rad. */
const GENTLE_DEAD_ZONE = 20 * DEG;

/** Float slack on a comparison against `rate * dt`. Well under a millidegree. */
const SLACK = 1e-12;

type Script = (seconds: number) => { x: number; z: number };

function makeDog(): Dog {
  return {
    position: { x: 0, z: 0 },
    velocity: { x: 0, z: 0 },
    heading: { x: 0, z: 1 },
  } as unknown as Dog;
}

/**
 * Adversarial commanded velocities: the three pathological inputs the plan
 * names, plus one that crosses the speed below which the rig stops reading a
 * direction at all, so the target appears and disappears under the law.
 */
const SCRIPTS: Record<string, Script> = {
  // A held reversal. The one input that asks for half a turn in a single tick.
  reversal: (t) => ({ x: 0, z: Math.floor(t * 2) % 2 === 0 ? 18 : -18 }),
  // A slow stick rotation, which is what a weave down the field looks like.
  weave: (t) => {
    const angle = Math.sin(t * 1.9) * 1.4;
    return { x: Math.sin(angle) * 12, z: Math.cos(angle) * 12 };
  },
  // A held circling input: the worst sustained demand there is.
  circle: (t) => ({ x: Math.sin(t * 3.2) * 15, z: Math.cos(t * 3.2) * 15 }),
  // Spinning on the spot at walking pace, in and out of the engage speed.
  stutter: (t) => {
    const speed = Math.abs(Math.sin(t * 3)) * 4;
    return { x: Math.sin(t * 5) * speed, z: Math.cos(t * 5) * speed };
  },
};

/**
 * Seat the framing, then drive it through a script. `onFrame` is called with a
 * delta of zero after the seat, so a caller can record the armed bearing
 * without counting arming it as a rotation, and then after every update.
 */
function drive(
  framing: FollowFraming,
  script: Script,
  deltas: readonly number[],
  onFrame?: (delta: number) => void,
): void {
  const dog = makeDog();
  dog.velocity.z = 12;
  framing.update(DT, dog);
  onFrame?.(0);
  let elapsed = 0;
  for (const delta of deltas) {
    const velocity = script(elapsed);
    dog.velocity.x = velocity.x;
    dog.velocity.z = velocity.z;
    dog.position.x += velocity.x * delta;
    dog.position.z += velocity.z * delta;
    framing.update(delta, dog);
    onFrame?.(delta);
    elapsed += delta;
  }
}

/** The worst rotation rate and the worst single displayed step over a run. */
function measure(
  framing: FollowFraming,
  script: Script,
  deltas: readonly number[],
): { worstRate: number; worstStep: number } {
  let previous = 0;
  let worstRate = 0;
  let worstStep = 0;
  drive(framing, script, deltas, (delta) => {
    if (delta > 0) {
      const step = Math.abs(framing.bearing - previous);
      worstStep = Math.max(worstStep, step);
      worstRate = Math.max(worstRate, step / delta);
    }
    previous = framing.bearing;
  });
  return { worstRate, worstStep };
}

/** `seconds` of frames at a fixed rate. */
function steady(hz: number, seconds: number): number[] {
  return Array.from({ length: Math.round(seconds * hz) }, () => 1 / hz);
}

/**
 * A spiky schedule: 60 Hz with dropped frames and a periodic half-second hitch,
 * held under MAX_FRAME_DT the way `CameraRig` holds it before calling here.
 */
function spiky(frames: number): number[] {
  return Array.from({ length: frames }, (_, frame) =>
    Math.min(frame % 37 === 0 ? 0.5 : frame % 7 === 0 ? 1 / 22 : 1 / 60, MAX_FRAME_DT));
}

describe('Follow bearing rate cap', () => {
  it.each(['gentle', 'quick'] as const)('holds %s under its ceiling at any frame rate', (mode) => {
    for (const [name, script] of Object.entries(SCRIPTS)) {
      for (const deltas of [steady(30, 20), steady(60, 20), steady(144, 20), spiky(1200)]) {
        const { worstRate } = measure(createFollowFraming(VIEW, mode), script, deltas);
        expect(worstRate, `${mode} / ${name}`).toBeLessThanOrEqual(RATE[mode] + SLACK);
      }
    }
  });

  it('reaches its ceiling rather than merely staying under it', () => {
    // A ceiling nothing ever touches would pass every assertion above while
    // hiding a rig that had stopped tracking. The circling input is the one
    // that should pin the rate at the cap for most of its run.
    const { worstRate } = measure(createFollowFraming(VIEW, 'gentle'), SCRIPTS.circle!,
      steady(60, 20));
    expect(worstRate).toBeCloseTo(MAX_FOLLOW_YAW_RATE, 9);
  });

  it('integrates the cap as a rate, so a stalled frame is not a whip-pan', () => {
    // The framing owes `rate * dt` for whatever delta it is handed, including
    // deltas well past MAX_FRAME_DT.
    for (const delta of [1 / 144, 1 / 60, 1 / 30, MAX_FRAME_DT, 0.25, 0.5]) {
      const framing = createFollowFraming(VIEW, 'gentle');
      const dog = makeDog();
      dog.velocity.z = 12;
      framing.update(DT, dog);
      const seated = framing.bearing;
      dog.velocity.x = -12; // A right angle, far outside the dead zone.
      dog.velocity.z = 0;
      framing.update(delta, dog);
      // An equality, not a bound. A right angle is far enough outside the dead
      // zone that the lag demands more than the cap allows at every delta in
      // the list - 0.62 degrees against 0.17 at 144 Hz, 35.4 against 12.5 at
      // half a second - so the cap binds on all of them and the step IS
      // `rate * dt`. Asserting only the bound would pass on a rig that had
      // stopped turning, which is the failure this whole file is about.
      expect(Math.abs(framing.bearing - seated))
        .toBeCloseTo(MAX_FOLLOW_YAW_RATE * delta, 12);
    }

    // And the caller holds the delta at MAX_FRAME_DT, so half a second of
    // backgrounded tab cannot arrive as half a second of rotation in one
    // displayed step. A tenth of a second of the cap is 2.5 degrees.
    const { worstStep } = measure(createFollowFraming(VIEW, 'gentle'), SCRIPTS.reversal!,
      spiky(1200));
    expect(worstStep).toBeLessThanOrEqual(MAX_FOLLOW_YAW_RATE * MAX_FRAME_DT + SLACK);
  });
});

describe('Follow bearing end stop', () => {
  it('never turns at all once the rig has seated', () => {
    // Exactly zero, not nearly zero. This is the accessibility end stop, and
    // the claim Reduce motion makes on the player's behalf.
    for (const [name, script] of Object.entries(SCRIPTS)) {
      const framing = createFollowFraming(VIEW, 'off');
      let seated = Number.NaN;
      drive(framing, script, spiky(3600), (delta) => {
        if (delta === 0) seated = framing.bearing;
        else expect(framing.bearing, name).toBe(seated);
      });
    }
  });

  it('freezes the bearing the moment the end stop is selected mid-run', () => {
    const framing = createFollowFraming(VIEW, 'gentle');
    const { worstRate } = measure(framing, SCRIPTS.circle!, steady(60, 4));
    expect(worstRate).toBeGreaterThan(0);
    const turned = framing.bearing;

    framing.setTurning('off');
    const dog = makeDog();
    dog.velocity.x = 15;
    for (let frame = 0; frame < 600; frame++) {
      dog.velocity.z = frame % 2 === 0 ? 15 : -15;
      framing.update(DT, dog);
      expect(framing.bearing).toBe(turned);
    }
  });

  it('publishes the same bearing the input layer latches its basis against', () => {
    // `IntentResolver` builds its movement basis from `lerpAngle(CLASSIC_BEARING,
    // followBearing(), cameraModeBlend())` rather than from the camera transform,
    // because that transform is a blend of this rig, Classic, the completion move
    // and the Studio layout. So what the player's controls mean is this number
    // exactly, and a published value that lagged the rig by a frame would mean
    // the basis and the picture disagreed for the whole of every turn.
    const framing = createFollowFraming(VIEW, 'gentle');
    measure(framing, SCRIPTS.weave!, steady(60, 6));
    expect(followBearing()).toBe(framing.bearing);
  });
});

describe('Follow bearing dead zone', () => {
  /** The bearing after one frame of a dog travelling `error` off the seat. */
  function stepForError(error: number): number {
    const framing = createFollowFraming(VIEW, 'gentle');
    const dog = makeDog();
    dog.velocity.z = 12;
    framing.update(DT, dog);
    expect(framing.bearing).toBe(0);
    dog.velocity.x = Math.sin(error) * 12;
    dog.velocity.z = Math.cos(error) * 12;
    framing.update(DT, dog);
    return framing.bearing;
  }

  it('gives exactly no step to an error inside it', () => {
    // Most of herding is small course corrections. They move the camera not at
    // all, rather than moving it a little.
    for (const fraction of [0, 0.01, 0.5, 0.9, 0.999999]) {
      expect(stepForError(GENTLE_DEAD_ZONE * fraction)).toBe(0);
      expect(stepForError(-GENTLE_DEAD_ZONE * fraction)).toBe(0);
    }
  });

  it('falls continuously to zero at the boundary rather than off a cliff', () => {
    // The zone comes off the ERROR, so what survives it is the excess and the
    // step is that excess through the one first-order lag. Taking it off the
    // OUTPUT instead would hand a boundary-crossing error the full step.
    const gain = smoothing(DT, FOLLOW_YAW_TAU);
    for (const excess of [1e-6, 1e-4, 1e-3, 1e-2]) {
      expect(stepForError(GENTLE_DEAD_ZONE + excess)).toBeCloseTo(excess * gain, 12);
      expect(stepForError(-GENTLE_DEAD_ZONE - excess)).toBeCloseTo(-excess * gain, 12);
    }
  });
});

describe('Follow aim and pitch', () => {
  it('keeps the aim rigidly on the bearing, every frame', () => {
    // There is no separate aim smoother any more. Rig, centre and aim are
    // colinear on the ground plane, so the direction from eye to aim IS the
    // bearing and the look-ahead costs exactly zero degrees.
    for (const mode of ['off', 'gentle', 'quick'] as const) {
      const ahead = VIEW.distance + VIEW.lookAhead * LEAD[mode];
      const framing = createFollowFraming(VIEW, mode);
      drive(framing, SCRIPTS.weave!, spiky(1800), () => {
        expect(framing.aim.x - framing.position.x)
          .toBeCloseTo(Math.sin(framing.bearing) * ahead, 9);
        expect(framing.aim.z - framing.position.z)
          .toBeCloseTo(Math.cos(framing.bearing) * ahead, 9);
      });
    }
  });

  it('holds the pitch exactly constant wherever the dog runs', () => {
    // Height and aim are both world-locked to one field datum. Sampling the
    // ground under the rig heaved it 1.64 m at the peak of the human sickness
    // response, on straight runs, and moved the pitch with it. The target is
    // 0.00 m of heave, so this is an equality.
    //
    // Node reaches `groundY` before the heightfield bytes load, so the field
    // under this run is flat and the ridge clamp cannot engage. What it pins is
    // that no per-position term exists, not that a real ridge is survived; see
    // ridge-clamp for the clamp's own behaviour against shaped ground.
    const framing = createFollowFraming(VIEW, 'gentle');
    const pitch = (): number => Math.atan2(
      framing.position.y - framing.aim.y,
      Math.hypot(framing.aim.x - framing.position.x, framing.aim.z - framing.position.z),
    );
    let eyeY = Number.NaN;
    let aimY = Number.NaN;
    let seated = Number.NaN;
    drive(framing, SCRIPTS.circle!, spiky(1800), (delta) => {
      if (delta === 0) {
        eyeY = framing.position.y;
        aimY = framing.aim.y;
        seated = pitch();
        return;
      }
      expect(framing.position.y).toBe(eyeY);
      expect(framing.aim.y).toBe(aimY);
      expect(pitch()).toBeCloseTo(seated, 12);
    });
  });
});
