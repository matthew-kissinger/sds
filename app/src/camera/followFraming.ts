// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Follow: the elevated chase on a slow compass.
 *
 * Three degrees of freedom and no more: x, z, and one bearing. The rig stands
 * `distance` back along that bearing and looks at a point `lookAhead` in front
 * of its own centre along the same one, so the aim cannot contribute any
 * rotation of its own and the look-ahead is a pure framing control that costs
 * exactly zero degrees.
 *
 * That is the structural change everything else here depends on. The rig this
 * replaces smoothed an aim direction separately from the orbit, which meant a
 * rate cap on the orbit capped nothing the player could see: what is seen is
 * the direction from camera to aim, and with the aim on its own smoother a
 * camera standing perfectly still still whipped its view across the screen on
 * every reversal. Measured, that was a 166 deg/s peak against a 35 deg/s clamp.
 *
 * The bearing law runs in one order and each step has its own constant below:
 * the target is the direction the dog is TRAVELLING, not the direction it
 * faces; a dead zone with direction hysteresis is taken off the ERROR; an
 * approach hold ramps the gain out as the dog turns into the camera; then one
 * first-order lag at FOLLOW_YAW_TAU, and the rate cap last.
 *
 * The height is world-locked to FIELD_DATUM_Y rather than sampled under the
 * rig. Sampling under the rig heaved it 1.64 m at 0.1 to 0.2 Hz, which is the
 * peak of the human sickness response, on straight runs, with no player input
 * causing it, while world-locked Classic measures 0.00 m and draws no
 * complaints. The aim is locked to the same datum, so no term of the pitch is
 * sampled from the ground under the dog and the top of the frame is a stable
 * horizon reference. That is not the same as the pitch being constant: see the
 * aim at the end of the update for what does move it. The ridge clamp stays as
 * the line-of-sight safety net it already is, and is the one path by which
 * ground reaches the height at all; at 14 to 17.5 m of elevation over 4.67 m of
 * relief it should effectively never engage.
 */

import * as THREE from 'three/webgpu';
import type { Dog } from '@sim/types';
import {
  FOLLOW_POSITION_TAU,
  FOLLOW_YAW_TAU,
  MAX_FOLLOW_YAW_RATE,
  MAX_RIG_SPEED,
  approach,
  easeInOut,
  lerpAngle,
  positionSmoothing,
  smoothing,
} from './feel';
import type { CameraFraming } from './framing';
import { createRidgeClamp } from './ridgeClamp';
import type { FollowViewProfile } from './viewProfile';

const DEG = Math.PI / 180;

/** Landscape, from viewProfile. The rig is built before a size is known. */
const DEFAULT_VIEW: FollowViewProfile = {
  distance: 26,
  height: 14,
  lookAhead: 4,
};

/**
 * The world-locked ground datum the rig and its aim both sit above, m.
 *
 * Measured: the mean of `groundY` over the 200 x 200 m play field, sampled on a
 * 0.5 m lattice, is 0.0605 m, across a range of -2.16 m to +2.02 m. A single
 * number is the point. Any per-position sample, however smoothed, puts a
 * terrain-frequency oscillation back on the vertical axis, and the harm there
 * is tied to the frequency rather than the amplitude, so attenuating it is not
 * good enough: the target is 0.00 m of heave.
 */
const FIELD_DATUM_Y = 0.06;

/** Aim height above the datum, m. The dog's shoulder. */
const AIM_HEIGHT = 1.6;

/**
 * Ground speed below which the velocity direction is noise rather than intent,
 * m/s. The bearing holds where it is instead of chasing it.
 */
const YAW_ENGAGE_SPEED = 1;

/**
 * Hysteresis, as fractions of the turning profile's resting dead zone. At the
 * gentle 20 degrees these are exactly the measured 15 and 37.5.
 *
 * What separates a weave from a turn is that a weave reverses, so a small
 * threshold keeps the camera rotating the way it already is and a much larger
 * one is needed to start it rotating the other way. A sustained turn never asks
 * for a reversal and does not notice; a weave pays the wide one on every flank
 * change and stops driving the camera at all. Fractions rather than absolute
 * degrees so a profile that widens the dead zone widens both with it, and the
 * ordering continue < resting < reverse cannot invert.
 */
const CONTINUE_FRACTION = 0.75;
const REVERSE_FACTOR = 1.875;

/** Approach hold: the yaw gain starts falling here and is zero by HOLD_END. */
const HOLD_START = 100 * DEG;
const HOLD_END = 120 * DEG;

/**
 * Metres travelled inside the hold cone that make it a committed run rather
 * than a jink, at which point the hold releases and the rate cap resolves the
 * turn. At full run 20 m is 1.3 s, far longer than any feint. Displacement
 * rather than a timer, because a timer would cut off a slow retrieval and a
 * fast feint at the same moment. Without the exit, a player fetching a bolted
 * sheep back down the field holds a bearing inside the cone for the whole
 * retrieval and runs into off-screen space.
 */
const HOLD_RELEASE_TRAVEL = 20;

/** Below this heading length the facing is degenerate; seat at zero. */
const MIN_HEADING = 1e-4;

/**
 * How hard the rig is allowed to turn. `off` is the end stop: the bearing arms
 * once when the rig seats or reseats and never turns in between, which measures
 * 119 degrees of total rotation over a two-minute run against 5,204 on the rig
 * this replaces, and frames the dog better than any rotating variant, because
 * the rig still follows the dog's position and only its bearing is pinned. It
 * is also what makes the automatic camera effect adjustable to zero rather than
 * reduced. `reseat` is the release valve: pinned is not the same as stuck.
 */
export type FollowTurning = 'off' | 'gentle' | 'quick';

/**
 * The profiles in order of how much the camera moves, least first.
 *
 * `off` is the end stop: the bearing stays where it was armed and never tracks
 * the dog at all. The two above it track, at different rates.
 */
const TURNING_ORDER: readonly FollowTurning[] = ['off', 'gentle', 'quick'];

/**
 * What Reduce motion clamps the turning DOWN to. Deliberately the slowest
 * profile that still tracks rather than `off`, because the setting follows the
 * operating system until a player touches it, so most of the people who get it
 * did not ask for it, and `off` takes the camera's tracking away entirely.
 */
export const REDUCED_MOTION_TURNING: FollowTurning = 'gentle';

/** Whichever of the two profiles moves the camera less. */
export function slowerTurning(a: FollowTurning, b: FollowTurning): FollowTurning {
  return TURNING_ORDER.indexOf(a) <= TURNING_ORDER.indexOf(b) ? a : b;
}

interface TurningLaw {
  /** Rate ceiling, rad/s. Zero pins the bearing. */
  readonly rate: number;
  /** Resting dead zone on the bearing error, rad. */
  readonly deadZone: number;
  /** Multiplier on the view's look-ahead. Zero at the end stop. */
  readonly leadScale: number;
}

const TURNING: Record<FollowTurning, TurningLaw> = {
  off: { rate: 0, deadZone: 0, leadScale: 0 },
  gentle: { rate: MAX_FOLLOW_YAW_RATE, deadZone: 20 * DEG, leadScale: 1 },
  // Quick is pinned at 5 m of look-ahead and landscape carries 4 m, so 1.25. A
  // ratio rather than metres because portrait is pinned nowhere and its profile
  // sets a shorter look-ahead deliberately, a tall frame needing less downward
  // bias; a flat 5 m would overwrite that in the orientation least able to
  // afford it. The ratio carries instead, and portrait's 3 m becomes 3.75.
  quick: { rate: 40 * DEG, deadZone: 25 * DEG, leadScale: 1.25 },
};

/**
 * The rig's current bearing, published at module scope, radians.
 *
 * MODULE-SCOPE MUTABLE, and the sanctioned exception rather than an oversight.
 * The input layer latches its movement basis against this instead of reading
 * `camera.getWorldDirection`, because the camera transform is a blend of this
 * rig, Classic, the completion move and the Studio layout, and some of those
 * are themselves uncapped rotation paths. A per-frame value cannot go through
 * the store, and a window global or a bridge singleton is not allowed, so a
 * named module-scope value behind an accessor is what is left. The app builds
 * exactly one Follow framing; if a second existed the last to update would win.
 */
let publishedBearing = 0;

/** The Follow rig's ground-plane bearing, radians, three.js convention. */
export function followBearing(): number {
  return publishedBearing;
}

/**
 * Signed shortest-arc error from `from` to `to`. `lerpAngle` at k = 1 is that
 * same wrap, so taking the delta back out of it keeps one implementation of the
 * +/-PI unwind rather than two that could drift apart.
 */
function angleError(from: number, to: number): number {
  return lerpAngle(from, to, 1) - from;
}

export interface FollowFraming extends CameraFraming {
  /** The rig's ground-plane bearing, radians. The value `followBearing` reads. */
  readonly bearing: number;
  setView(view: FollowViewProfile): void;
  setTurning(mode: FollowTurning): void;
  /**
   * Re-arm the bearing from where the dog is going now, on Follow re-entry. At
   * the `off` end stop it is the whole of the player's camera authority: the
   * bearing is pinned to whatever it was armed to, so without this a player who
   * armed it facing north and then herded south would view the dog head-on for
   * the rest of the session with no recourse.
   */
  reseat(): void;
}

export function createFollowFraming(
  initialView: FollowViewProfile = DEFAULT_VIEW,
  initialTurning: FollowTurning = 'gentle',
): FollowFraming {
  const position = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const center = new THREE.Vector3();
  const desiredCenter = new THREE.Vector3();
  let radius = initialView.distance;
  let lead = initialView.lookAhead * TURNING[initialTurning].leadScale;
  let yaw = 0;
  /** Which way the bearing is currently turning: -1, 0 or 1. See the step. */
  let spinning = 0;
  /** Metres travelled since the dog's direction entered the hold cone. */
  let held = 0;
  let seated = false;
  let view = initialView;
  let turning = initialTurning;
  const ridge = createRidgeClamp();

  return {
    position,
    aim,
    get bearing(): number {
      return yaw;
    },
    setView(nextView: FollowViewProfile): void {
      view = nextView;
    },
    setTurning(mode: FollowTurning): void {
      if (mode === turning) return;
      turning = mode;
      // The law changed underneath the hysteresis bit and the hold, so what
      // they recorded is no longer a fact about the law now in force.
      spinning = 0;
      held = 0;
    },
    reseat(): void {
      // Arming happens on the next update, not here: the direction the dog is
      // travelling is only readable with a dog in hand, and the call site
      // re-enters Follow between frames. Calling this before the first update
      // therefore asks for the state the rig already starts in.
      seated = false;
      spinning = 0;
      held = 0;
    },
    update(dt: number, dog: Dog): void {
      const law = TURNING[turning];
      const speed = Math.hypot(dog.velocity.x, dog.velocity.z);
      const moving = speed >= YAW_ENGAGE_SPEED;
      const leadTarget = view.lookAhead * law.leadScale;
      // Yaw is measured the three.js way (0 = +z) everywhere below, so the
      // forward is (sin yaw, cos yaw) and "behind" is the negative of that.

      if (!seated) {
        // A dog standing still at the seat has no velocity to read, so its
        // facing is the only sensible direction to arm the bearing from. At the
        // `off` end stop this and `reseat` are the only times it is ever set.
        yaw = moving
          ? Math.atan2(dog.velocity.x, dog.velocity.z)
          : Math.abs(dog.heading.x) + Math.abs(dog.heading.z) > MIN_HEADING
            ? Math.atan2(dog.heading.x, dog.heading.z)
            : 0;
        publishedBearing = yaw;
        seated = true;
        center.set(dog.position.x, 0, dog.position.z);
        radius = view.distance;
        lead = leadTarget;
        position.set(
          center.x - Math.sin(yaw) * radius,
          FIELD_DATUM_Y + view.height,
          center.z - Math.cos(yaw) * radius,
        );
        position.y = ridge.clamp(
          position.y,
          position.x,
          position.z,
          dog.position.x,
          dog.position.z,
          dt,
        );
        aim.set(
          center.x + Math.sin(yaw) * lead,
          FIELD_DATUM_Y + AIM_HEIGHT,
          center.z + Math.cos(yaw) * lead,
        );
        return;
      }

      const target = moving ? Math.atan2(dog.velocity.x, dog.velocity.z) : yaw;
      const error = angleError(yaw, target);
      const magnitude = Math.abs(error);

      // The dead zone is taken off the error, not off the output, so what
      // survives it falls continuously to zero at the boundary. Most of herding
      // is small course corrections, and they now move the camera not at all.
      let threshold = law.deadZone;
      if (spinning !== 0) {
        threshold =
          error * spinning > 0
            ? law.deadZone * CONTINUE_FRACTION
            : law.deadZone * REVERSE_FACTOR;
      }
      const demand =
        magnitude > threshold ? Math.sign(error) * (magnitude - threshold) : 0;

      // Let a dog running at the camera run past it and out the other side.
      // Ramping the gain out between 100 and 120 degrees leaves no threshold to
      // chatter against, and removes the worst case, the 180-degree reversal.
      let gain = 1;
      if (magnitude > HOLD_START) {
        // Integrated from speed rather than from the change in dog position, so
        // a run reset teleporting the dog across the field cannot fill it in a
        // single frame, and stopped at the release travel rather than left to
        // grow, so a long retrieval cannot bank a count needing kilometres to
        // unwind.
        held = Math.min(HOLD_RELEASE_TRAVEL, held + speed * dt);
        if (held < HOLD_RELEASE_TRAVEL) {
          const t = Math.min(1, (magnitude - HOLD_START) / (HOLD_END - HOLD_START));
          gain = 1 - easeInOut(t);
        }
      } else {
        // Decayed, never zeroed. A jink is defined by being brief, so evidence
        // of a committed run has to survive one. Zeroing let a dog weaving
        // across the cone edge oftener than once per 20 m of travel restart the
        // count on every dip, so the release never fired and the failure it
        // exists to prevent - the dog held head-on for an unbounded time - was
        // reachable by ordinary weaving. The same metres per metre back out is
        // enough: below HOLD_START the gain is already 1, so the rig turns at
        // its cap throughout the dip and the count only has to not forget.
        held = Math.max(0, held - speed * dt);
      }

      // The cap goes on last. Clamping before the smoothing would leak the
      // ceiling into the time constant, and clamping to a fixed step per frame
      // would make the sustained rate scale with the display.
      const step = demand * gain * smoothing(dt, FOLLOW_YAW_TAU);
      const limit = law.rate * dt;
      const capped = step > limit ? limit : step < -limit ? -limit : step;
      yaw += capped;

      // The direction bit survives the error passing back through zero, which
      // is the whole point of it: clearing it there would hand every flank
      // change of a weave the resting dead zone again. It clears when the yaw
      // is genuinely idle, meaning the dog stopped or the hold closed the gain.
      if (capped !== 0) spinning = capped > 0 ? 1 : -1;
      else if (!moving || gain === 0) spinning = 0;

      publishedBearing = yaw;

      // Smooth translation separately from orbit. Blending the final eye in
      // Cartesian space cuts across turns and can collapse the chase distance
      // during sustained camera-relative input.
      const positionK = positionSmoothing(dt, FOLLOW_POSITION_TAU);
      desiredCenter.set(dog.position.x, 0, dog.position.z);
      approach(center, desiredCenter, positionK, dt);
      radius += (view.distance - radius) * positionK;
      // Same lag as the radius beside it, for the same reason: the look-ahead
      // moves only when the view profile or the turning law changes underneath
      // it, and both of those are steps. Written straight through, toggling
      // Reduce motion took landscape pitch from atan(12.4/30) to atan(12.4/26)
      // in one frame - 3.04 degrees, 182 deg/s at 60 Hz, on the exact control a
      // motion-sensitive player reaches for. On this lag the widest first frame
      // any profile change makes is 0.44 degrees, 27 deg/s, off to quick. It
      // stays one scalar rather than becoming a smoothed aim point: the aim is
      // still centre plus forward times this number, so it cannot rotate
      // independently of the bearing, which is the defect the rig removed.
      lead += (leadTarget - lead) * positionK;
      const forwardX = Math.sin(yaw);
      const forwardZ = Math.cos(yaw);
      // World-locked: the only thing that moves this term is the view profile
      // changing on an orientation change, and the lag plus the clamp on it is
      // what keeps that from being a step. The ridge clamp below is the other
      // hand on this axis, and the only one that reads the ground.
      const heightStep = (FIELD_DATUM_Y + view.height - position.y) * positionK;
      position.set(
        center.x - forwardX * radius,
        position.y +
          Math.max(-MAX_RIG_SPEED * dt, Math.min(MAX_RIG_SPEED * dt, heightStep)),
        center.z - forwardZ * radius,
      );
      // What keeps a ridge between the rig and the dog from swallowing the dog.
      position.y = ridge.clamp(
        position.y,
        position.x,
        position.z,
        dog.position.x,
        dog.position.z,
        dt,
      );

      // Bolted to the bearing, and to the same centre the rig stands behind, so
      // rig, centre and aim are colinear on the ground plane and the pitch is
      // atan((position.y - FIELD_DATUM_Y - AIM_HEIGHT) / (radius + lead)). No
      // term of that is sampled from the ground under the dog, which is what
      // the datum bought and is the property that matters: terrain passing
      // beneath the dog cannot pitch the view. It is not constant, though, and
      // this line used to claim it was. Three terms move when the view profile
      // or the turning law changes - radius and lead on the lag above,
      // position.y on the same lag under the MAX_RIG_SPEED step and the ridge
      // clamp after it - and a phone rotated to portrait moves the pitch 1.66
      // degrees over 0.45 s, peaking at 12.3 deg/s. Nothing else reaches them,
      // so through every frame of ordinary play the pitch does hold. The
      // aim needs no smoother of its own: the centre is already held under
      // MAX_RIG_SPEED by `approach`, so a discontinuous dog eases the aim over
      // rather than whipping it.
      aim.set(
        center.x + forwardX * lead,
        FIELD_DATUM_Y + AIM_HEIGHT,
        center.z + forwardZ * lead,
      );
    },
  };
}
