// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The camera's feel numbers and the math they are used with.
 *
 * Follow used to carry four time constants, one per smoothed quantity: yaw,
 * position, aim and a normalized speed that scaled the look-ahead. Two of those
 * are gone. The aim is no longer a smoother at all, because it is now built
 * from the rig's own bearing, and the look-ahead is a constant distance rather
 * than one scaled by speed. What is left is a rig with three degrees of
 * freedom, x, z and one bearing, and a lag for each:
 *
 *  - bearing 1.0 s, under a rate ceiling, a dead zone and an approach hold.
 *    The lag alone is no longer the contract; see MAX_FOLLOW_YAW_RATE.
 *  - position 0.15 s, the glide to the point behind the dog.
 *
 * `1 - exp(-dt/tau)` is the closed-form continuous blend: the same amount of
 * smoothing per second at 30, 60 or 144 fps. A raw per-frame alpha is not
 * frame-rate independent and is why sds's Classic lerp had to be written as an
 * alpha-at-60 and converted; CLASSIC_POSITION_TAU below is that conversion,
 * done once, here.
 *
 * The two pieces of geometry that live here rather than in a rig are
 * `createOrbitBlend`, because it is what makes MODE_BLEND_SECONDS mean anything
 * - a duration is only a feel number if the path it times is safe to travel -
 * and `createOrbitCarry`, which is the same geometry applied to a framing that
 * has just been handed a pose it did not travel to.
 */

import * as THREE from 'three/webgpu';

/** Scratch for `approach`. One vector, reused: the camera allocates nothing. */
const step = new THREE.Vector3();

/**
 * Follow: camera bearing lag. 1.0 s, against the 0.35 s this rig inherited from
 * spec/06, which came from a camera whose comfort was never measured.
 *
 * The number is chosen for where its corner sits, not for how it feels on a
 * single turn. A first-order lag passes `1 / sqrt(1 + (2*pi*f*tau)^2)`, so at
 * 1.0 s the corner is 0.159 Hz, on the low edge of the 0.2 to 0.4 Hz band that
 * visually induced sickness peaks in. A player weaving a flock drives the
 * tracking error at exactly those frequencies, and this is what stops most of
 * it reaching the picture.
 */
export const FOLLOW_YAW_TAU = 1.0;

/** Follow: rig position lag. */
export const FOLLOW_POSITION_TAU = 0.15;

/**
 * Ceiling on how fast the Follow rig's bearing may turn, rad/s. 25 deg/s.
 *
 * Measured over the two-minute herding run, this holds the peak at exactly the
 * cap with no time at all above 35 deg/s, against a 373 deg/s peak and 38% of
 * the run above 35 deg/s on the rig it replaces, and cuts total rotation by
 * 69%. It is the default; the rig's turning profiles may ask for less.
 *
 * Two implementation notes that are part of the number. It is clamped AFTER the
 * smoothing, because clamping before leaks the ceiling into the time constant,
 * and it is integrated as `cap * dt`, because a fixed step per frame makes the
 * effective rate scale with the display.
 *
 * It also pairs with the yaw dead zone and must not be moved alone. At 25 deg/s
 * with a 20 degree dead zone the camera is never in debt against its cap; at
 * 35 with 15 it is, and a dog with any weight to its turns then costs 42% more
 * rotation over the same script.
 */
export const MAX_FOLLOW_YAW_RATE = (25 * Math.PI) / 180;

/**
 * Ceiling on the per-frame position blend. One dropped frame must not
 * teleport the rig most of the way to its target. Engages below ~19 fps and is
 * a no-op above it, so it is a crash guard rather than a comfort mechanism.
 */
export const MAX_POSITION_K = 0.3;

/**
 * Classic: rig position lag. sds ran Classic on a fixed 0.05 lerp per frame at
 * 60 Hz; the equivalent time constant is `-(1/60) / ln(1 - 0.05)` = 0.325 s,
 * which is what we use so the mode is frame-rate independent like Follow.
 */
export const CLASSIC_POSITION_TAU = 0.325;

/** Seconds for a full Classic <-> Follow swap. Eased at both ends. */
export const MODE_BLEND_SECONDS = 0.8;

/**
 * THE COMPOSED VIEW'S ROTATION BUDGET, rad/s: 90 deg/s at MODE_BLEND_SECONDS.
 * The rig scales it with the transition's duration, so Reduce motion, which
 * lengthens the blend, runs the budget at 60 rather than leaving the one player
 * who asked for less motion with everyone else's peak.
 *
 * ONE BUDGET, NOT A CEILING PER STAGE. This began as a limit on what a Classic
 * <-> Follow swap contributed, and the name is still that. It is now the
 * allowance for the FINAL view direction, and every stage draws from it: the
 * mode blend, the Studio blend, the carry that unwinds a re-aim, the completion
 * pull-back. The reason is the defect it is written against. Capping
 * contributors separately does not cap what they compose to - several paths
 * each inside its own ceiling still sum - so the honest bound grew every time a
 * path was added, and the Studio blend's own 150 deg/s sat on top of this one
 * rather than inside it. `viewBudget.ts` now opens one allowance per frame
 * against the pose the camera actually holds, each stage resolves its weight
 * against what is left of it, and the commit clamps the composed direction. A
 * path added later draws from the same allowance and cannot raise the total.
 *
 * The number itself is chosen rather than watched, and the reasoning it rests
 * on is unchanged: this is the toggle a motion-sensitive player reaches for
 * repeatedly, and the gameplay rig underneath runs at a 25 deg/s ceiling. 90
 * sits above that and well below what a panel entry used to be allowed.
 * PENDING A MOTION REVIEW.
 *
 * WHAT THE PICTURE MEASURES IS NOW THIS NUMBER. Measured this round over 21
 * scenarios - swaps in both directions, a swap toggled again mid-flight,
 * Studio entries and exits including one entered during a swap, a sim replaced
 * under each mode and mid-swap, the re-aim gesture, and the completion phase
 * entered, left by restart and left with the same sim - crossed with the three
 * turning profiles, 30, 60 and 144 Hz, and a spiky schedule with frames past
 * MAX_FRAME_DT: the composed view peaks at 90.000 deg/s with Reduce motion off
 * and 60.000 deg/s with it on, in every one of them, including at the `off` end
 * stop. The view comes no nearer than 45.0 degrees to either pole, so no
 * transition goes near the `lookAt` singularity, and the roll stays at
 * 2.8e-16 rad, which is float noise.
 *
 * The horizon - the camera's right vector - is a different quantity and is NOT
 * budgeted: it measured at most 121.8 deg/s, and 84.6 with Reduce motion on.
 * It is not independent either, and that is the useful half. Under yaw the
 * right vector and the view turn about the same axis, so the horizon is
 * `view / sin(theta)` for a view `theta` off vertical - the view's rate and the
 * framing's elevation multiplied - which is why its ceiling is derived from
 * this number and the 30 degree degeneracy floor rather than chosen, and why
 * 121.8 sits where it does.
 *
 * NOTHING IN THAT SWEEP TURNS THE VIEW FASTER WITH REDUCE MOTION ON, compared
 * configuration by configuration and not peak against peak. The HORIZON can be,
 * and it is worth saying rather than rounding off: Reduce motion runs the rig
 * at the `off` end stop, which is a different framing and not a slower one, so
 * it can sit at a steeper elevation and carry the same or less view rotation
 * further round. Measured at the widest case, it turns the view slower -
 * 14.7704 against 14.8167 deg/s - while carrying the horizon 0.406 deg/s
 * faster, entirely because it sits 3.70 degrees steeper. That is the pose term
 * above, not rotation, and `camera-composed-view` asserts each of the two
 * accordingly: the view monotone, the horizon against its absolute ceiling.
 *
 * WHAT IT COSTS. Across that sweep the composed view is AT the budget on 3.3%
 * to 6.4% of frames with Reduce motion off and 9.0% to 11.7% with it on, and
 * below it on the rest, so this is a peak limiter rather than the thing driving
 * the transition. A swap keeps its duration to the frame: 1.90 s at the `off`
 * end stop and 1.93 s at gentle, before and after, at all three rates. A Studio
 * entry and exit together go from 3.43-3.47 s to 3.80-3.85 s, which is what the
 * peak is bought with.
 */
export const MODE_MAX_TURN_RATE = (90 * Math.PI) / 180;

/**
 * Longest frame the rig will integrate. A backgrounded tab hands the first
 * frame back a delta worth seconds; without this the mode blend would jump a
 * whole transition in one frame. 0.1 s is a 10 fps floor.
 */
export const MAX_FRAME_DT = 0.1;

/**
 * Ceiling on Cartesian tracking travel, m/s. Follow applies this to the centre
 * its framing is built around; its bearing uses the separate rate cap above. An
 * exponential smoother moves at a speed proportional to the gap, which is right
 * for chasing and wrong for a discontinuity: a run reset puts the dog back at
 * the spawn, and measured against HOME_FIELD this round that is 161.2 m from
 * the gate a run ends at and 200.0 m from the far corner of the field, which
 * uncapped is a whip-pan. Chasing a 25 m/s dog the rig settles at 25 m/s, so on
 * a framing's own travel this only engages on a discontinuity, where it turns
 * the recentre into a glide.
 *
 * IT IS ALSO THE COMPOSED RESULT'S TRAVEL BUDGET, and the reason for that is a
 * defect worth recording rather than quietly fixing. The line here used to claim
 * the clamp only ever engaged on a discontinuity, and for the composed result
 * that was false. The eye covers 66.6 m between the Classic and Follow poses at
 * the worst bearing, measured again this round on all three turning profiles,
 * and a smoothstep peaks at 1.5x its mean rate, so a swap demanded 124.8 m/s
 * against this 55. The round that found it measured the consequence: the clamp
 * fired on most frames of most swaps, stretched a nominal 0.8 s to between 1.02
 * and 1.28 s, and was still moving the eye at 28 to 42 m/s the frame before it
 * stopped dead, which is precisely the arrival the smoothstep is there to
 * prevent. A ceiling applied to the output cannot produce an eased arrival; only
 * one applied to the weight can.
 *
 * So it is carried the same way MODE_MAX_TURN_RATE is, and by the same object.
 * `viewBudget.ts` opens an allowance of `MAX_RIG_SPEED * dt` per frame from
 * `camera.position`, which is the only point the eye was ever actually at;
 * every stage resolves its weight against the part of that allowance still
 * unspent, so an eased arrival survives composition; and the commit holds the
 * eye to it once, at the end, however many stages contributed. Anchoring on the
 * camera rather than on a stage's own reference is load-bearing: a budget
 * measured from a pose part-way down the frame that the camera never occupied
 * leaves a backlog nothing can see, which arrives later as a spike.
 *
 * Measured over this round's 21-scenario sweep at 30, 60 and 144 Hz and on a
 * spiky schedule, the worst eye step is exactly the allowance and never above
 * it: a factor of 1.000. An ordinary swap reaches it too, and that is the
 * blend working rather than a clamp taking over - the eye has 66.6 m to cover
 * and this is one of the two things pacing the weight, so what arrives at the
 * ceiling is the weight, and the arrival is still eased.
 */
export const MAX_RIG_SPEED = 55;

/**
 * Every component of a point is a finite number.
 *
 * The rig is float arithmetic end to end, and one non-finite intermediate is
 * not a frame's worth of damage: a NaN pose is stored as the pose the next
 * frame measures against, so it reproduces itself for the rest of the session.
 * This is what the two places that can hold a pose between frames - the carry
 * below and the rig's own commit - check before they keep one.
 */
export function isFinitePoint(point: THREE.Vector3): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

/** Frame-rate-independent blend weight for a time constant. */
export function smoothing(dt: number, tau: number): number {
  if (dt <= 0) return 0;
  return 1 - Math.exp(-dt / tau);
}

/** `smoothing`, held under the posK cap. Used for every rig position blend. */
export function positionSmoothing(dt: number, tau: number): number {
  return Math.min(smoothing(dt, tau), MAX_POSITION_K);
}

/**
 * One exponential step of `current` toward `desired`, held under MAX_RIG_SPEED.
 * Every rig position moves through here, so nothing in the camera can
 * cover ground faster than a fast glide. Writes in place, allocates nothing.
 */
export function approach(
  current: THREE.Vector3,
  desired: THREE.Vector3,
  k: number,
  dt: number,
): void {
  step.subVectors(desired, current).multiplyScalar(k);
  const limit = MAX_RIG_SPEED * dt;
  const length = step.length();
  if (length > limit) step.multiplyScalar(limit / length);
  current.add(step);
}

const TWO_PI = Math.PI * 2;

/** Shortest-arc angle blend. Plain lerp would unwind the long way at +/-PI. */
export function lerpAngle(from: number, to: number, k: number): number {
  let delta = (to - from) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta < -Math.PI) delta += TWO_PI;
  return from + delta * k;
}

/**
 * Smoothstep. The mode blend advances linearly and is shaped by this, so the
 * swap starts and ends at zero velocity (no visible kick at either end) and
 * reverses cleanly if the player toggles again mid-transition. Follow's
 * approach hold shapes its gain ramp with the same curve, for the same reason:
 * nothing should turn on or off with a corner.
 */
export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Scratch for `OrbitBlend.reach`. One rig, one blend, one pair. */
const reachEye = new THREE.Vector3();
const reachAim = new THREE.Vector3();

export interface OrbitBlend {
  /**
   * Seat the blend on this frame's two poses. `weight` is where the blend
   * already sits, and it is read for one thing: a blend parked at an end takes
   * the shortest arc afresh, while one in flight keeps the winding it left on.
   *
   * Shortest arc alone is discontinuous where the two bearings are opposed,
   * which is exactly the case this exists for, and the Follow bearing drifts
   * across that line under its own 25 deg/s cap while a swap is running. A sign
   * flip there would reverse a half-turn orbit inside one frame, so in flight
   * the arc is unwrapped onto the branch nearest the one already in hand.
   */
  seat(
    fromEye: THREE.Vector3, fromAim: THREE.Vector3,
    toEye: THREE.Vector3, toAim: THREE.Vector3,
    weight: number,
  ): void;
  /**
   * The view direction at `weight`, into `out`. It is built from the
   * decomposition and never from the aim, because moving eye and aim together
   * cannot rotate anything: that is what lets a ceiling on this be honest about
   * everything the weight contributes to the picture.
   */
  view(weight: number, out: THREE.Vector3): THREE.Vector3;
  /** The pose at `weight`, into `outEye` and `outAim`. */
  pose(weight: number, outEye: THREE.Vector3, outAim: THREE.Vector3): void;
  /**
   * Metres from `anchor` to the eye this blend would put at `weight`. The
   * caller passes where the eye actually was last frame, so what this measures
   * is the whole of the result's travel and not only the weight's share of it:
   * the framings are moving underneath it as well.
   */
  reach(weight: number, anchor: THREE.Vector3): number;
}

/**
 * A blend between two camera poses that goes around the subject instead of
 * across it. One instance per transition; it holds a decomposition for a frame.
 *
 * WHY NOT A LERP. Classic stands 40.71 m south of its own aim and 40.56 m above
 * it. Follow, with the dog running down-field, stands 26.00 m NORTH of its aim
 * and 12.40 m above it at the `off` end stop - 30.00 m at gentle, 31.00 at
 * quick, and 32.46 to 36.22 m in portrait, where the view profile pulls the
 * camera back. All of them put the eye on the dog's own line, so a Cartesian
 * lerp of eye and aim keeps the whole view in one vertical plane, and the
 * horizontal component of `aim - eye` is `40.71 - 66.71 w` metres: exactly zero
 * at w = 0.610, where the vertical component is -23.4. The view direction passes
 * precisely through nadir. Traced this round at 200,000 steps, that lerp comes
 * within 0.0003 degrees of world up, and there `camera.lookAt` against a world
 * up of (0, 1, 0) is undefined: `up x direction` goes to zero and the horizon
 * flips half a turn in a single frame, 10,800 deg/s at 60 Hz and 21,600 at 120.
 * A rate ceiling is no answer, because travelling slowly through a singularity
 * still goes through it. The path itself has to leave.
 *
 * WHAT THIS DOES INSTEAD. Each pose is decomposed about ITS OWN aim into a
 * bearing, a horizontal radius and a height. The bearing takes the shortest arc,
 * radius and height are linear, and the eye is rebuilt from the blended aim.
 * What makes that a fix rather than a tuning is that both guarantees fall out of
 * the construction and not out of these particular poses. The radius is linear
 * between two POSITIVE endpoints, so it is positive at every weight; and a
 * straight segment in the (radius, height) plane that misses the origin has a
 * monotonic polar angle, so the pitch at every weight lies between the two
 * endpoints' pitches. Any pair of poses that are not already at the pole
 * therefore blends without reaching it.
 *
 * For the pair above that means a radius between 40.71 m and 26.00 m and a pitch
 * between 21.80 and 44.90 degrees across the three turning profiles. The Studio
 * pair is the tightest in the rig - 4.09 m radius in landscape, 10.28 m in
 * portrait, pitches from 5.42 to 36.87 degrees - and is bounded for the same
 * reason rather than by being far from the pole. Traced at the same resolution
 * as the lerp above, the orbit stays 45.11 degrees off world up and costs 143.8
 * degrees of view rotation where the lerp costs 109.6: the eye swings around the
 * side of the dog rather than over the top of it. That is the trade being made
 * deliberately. The shorter path is shorter because it crosses the pole.
 *
 * Both ends are exact by copying rather than by arithmetic. Neither this
 * decomposition nor a lerp returns its endpoints bit-for-bit through floating
 * point, and a seam at the moment a blend finishes is the thing it is here to
 * avoid.
 */
export function createOrbitBlend(): OrbitBlend {
  const fromEye = new THREE.Vector3();
  const fromAim = new THREE.Vector3();
  const toEye = new THREE.Vector3();
  const toAim = new THREE.Vector3();
  const offset = new THREE.Vector3();
  let fromBearing = 0, fromRadius = 0, fromHeight = 0;
  let toRadius = 0, toHeight = 0;
  /** Signed bearing change across the blend, unwrapped; see `seat`. */
  let sweep = 0;

  function pose(weight: number, outEye: THREE.Vector3, outAim: THREE.Vector3): void {
    if (weight <= 0) {
      outEye.copy(fromEye);
      outAim.copy(fromAim);
      return;
    }
    if (weight >= 1) {
      outEye.copy(toEye);
      outAim.copy(toAim);
      return;
    }
    outAim.lerpVectors(fromAim, toAim, weight);
    const bearing = fromBearing + sweep * weight;
    const radius = fromRadius + (toRadius - fromRadius) * weight;
    outEye.set(
      outAim.x + Math.sin(bearing) * radius,
      outAim.y + fromHeight + (toHeight - fromHeight) * weight,
      outAim.z + Math.cos(bearing) * radius,
    );
  }

  return {
    pose,
    seat(a, aAim, b, bAim, weight): void {
      fromEye.copy(a);
      fromAim.copy(aAim);
      toEye.copy(b);
      toAim.copy(bAim);
      offset.subVectors(a, aAim);
      fromBearing = Math.atan2(offset.x, offset.z);
      fromRadius = Math.hypot(offset.x, offset.z);
      fromHeight = offset.y;
      offset.subVectors(b, bAim);
      toRadius = Math.hypot(offset.x, offset.z);
      toHeight = offset.y;
      // `lerpAngle` at k = 1 is the +/-PI unwind, so taking the delta back out
      // of it keeps one implementation of that wrap rather than two.
      const shortest =
        lerpAngle(fromBearing, Math.atan2(offset.x, offset.z), 1) - fromBearing;
      sweep = weight <= 0 || weight >= 1
        ? shortest
        : shortest + TWO_PI * Math.round((sweep - shortest) / TWO_PI);
    },
    view(weight, out): THREE.Vector3 {
      const bearing = fromBearing + sweep * weight;
      const radius = fromRadius + (toRadius - fromRadius) * weight;
      return out.set(
        -Math.sin(bearing) * radius,
        -(fromHeight + (toHeight - fromHeight) * weight),
        -Math.cos(bearing) * radius,
      ).normalize();
    },
    reach(weight, anchor): number {
      pose(weight, reachEye, reachAim);
      return reachEye.distanceTo(anchor);
    },
  };
}

/** Scratch for `OrbitCarry.track`. One rig, one carry, one pair of views. */
const carryView = new THREE.Vector3();
const carryFrom = new THREE.Vector3();
const carryTo = new THREE.Vector3();

export interface OrbitCarry {
  /**
   * The framing is about to be handed a pose it did not travel to. Take the
   * step out of the picture and pay it back through `track` instead.
   */
  hold(): void;
  /**
   * The share of its two allowances this carry may spend from the frames here
   * on, 1 being all of them: `rate` rad/s of rotation and MAX_RIG_SPEED of
   * travel. Reduce motion scales every allowance in the rig by one factor and
   * a recovery is not an exception to that; `composedRig` is what sets this,
   * and 1 is the default. It scales both because either can be what paces a
   * recovery: a re-armed bearing is turn-bound and a run reset, which puts the
   * dog back 161 m away, is travel-bound.
   */
  setScale(scale: number): void;
  /**
   * The pose to frame from this frame, given the framing's own live pose, into
   * `outEye` and `outAim`. With nothing outstanding that is the live pose,
   * copied, so a framing that is not recovering passes through bit for bit and
   * the ends of a swap stay exactly the framings themselves.
   */
  track(
    dt: number,
    eye: THREE.Vector3, aim: THREE.Vector3,
    outEye: THREE.Vector3, outAim: THREE.Vector3,
  ): void;
}

/**
 * A framing's own recovery from a pose it was given rather than reached.
 *
 * WHAT IT IS FOR. `followFraming.reseat` re-arms the bearing from the dog's
 * direction of travel, and the next update writes a whole new pose: centre,
 * radius, lead and a bearing up to half a turn away. Two things ask for that -
 * the sim being replaced under the rig, and the player's own re-aim, the camera
 * key twice, which at the `off` end stop is the whole of their camera authority.
 * Neither is a reason to move the picture instantly, and letting a
 * metres-per-second ceiling downstream resolve the step is worse than either:
 * a shared factor marching eye and aim along their own straight lines is a
 * Cartesian co-lerp by another name, and the round that found it measured the
 * view 0.026 degrees from straight down with the horizon at 25,920 deg/s.
 *
 * WHAT IT DOES. The step is absorbed, and paid back as an orbit about the
 * framing's own aim, on the geometry `createOrbitBlend` carries: the radius runs
 * between two positive numbers, so the eye goes around the dog rather than over
 * it. Both ceilings are on the weight rather than the output, so the recovery
 * eases out of its last frame instead of stopping dead.
 *
 * WHAT IT COSTS. `rate` is on top of what the framing itself asked for this
 * frame, not instead of it, because the two are not alternatives: the rig turns
 * under its own cap while the carry unwinds under this one. Taking the larger
 * of the two instead would be the tighter law and cannot be used: a rig already
 * turning at its cap would never leave the carry any room, and the recovery
 * would never end. What makes a sum safe here is that it is no longer the last
 * word. The carry is one contributor to MODE_MAX_TURN_RATE's composed budget,
 * which is opened on the pose the camera committed to and clamps whatever the
 * stages add up to, so this limit shapes the recovery rather than bounding the
 * picture on its own.
 *
 * A half-turn re-aim takes roughly 180 / rate seconds. Measured this round at
 * MAX_FOLLOW_YAW_RATE, over both arc directions and framing turn rates from -25
 * to +25 deg/s at 30, 60 and 144 Hz, the worst is 6.49 s, with the framing
 * otherwise at rest; a framing that is itself turning closes the arc from the
 * other side and finishes in 2.30 s. For that long the picture is behind the
 * bearing the input layer latches its movement basis from, which is the real
 * cost of this and the one thing an owner might weigh differently. The trade is
 * a bounded orbit the player asked for, at the rate the camera turns at anyway,
 * against an instant re-aim through a singularity.
 */
export function createOrbitCarry(rate: number): OrbitCarry {
  const orbit = createOrbitBlend();
  const shownEye = new THREE.Vector3();
  const shownAim = new THREE.Vector3();
  /** Last frame's LIVE view direction, which is what `demand` is measured on. */
  const lastView = new THREE.Vector3();
  let scale = 1;
  let carrying = false;
  let seated = false;
  let held = false;

  return {
    hold(): void {
      held = true;
    },
    setScale(next: number): void {
      scale = next;
    },
    track(dt, eye, aim, outEye, outAim): void {
      carryView.subVectors(aim, eye).normalize();
      // What the framing itself asked for. On the frame it is handed a pose,
      // it asked for nothing: that rotation is the step being taken out.
      const demand = seated && !held ? lastView.angleTo(carryView) : 0;
      lastView.copy(carryView);
      if (held) {
        // The first frame of the page has no pose to carry from, and a rig
        // that seats has nothing to recover from either.
        carrying = seated;
        held = false;
      }
      // A pose that has already gone non-finite is not something to orbit away
      // from: there is no arc from a NaN, and seating on one writes NaN into
      // every frame after it. Drop the recovery and take the live pose, which
      // is the only finite thing on offer.
      if (carrying && !(isFinitePoint(shownEye) && isFinitePoint(shownAim))) carrying = false;
      // A frame worth no time buys no rotation and no travel, so an
      // outstanding carry simply holds what it is showing. It must not resolve
      // and it must not finish: a zero allowance used to be divided by, and
      // `0 / 0` put NaN in the weight, in the shown pose and in the rig from
      // there on. A duplicated frame, a paused clock or a backgrounded tab is
      // enough to produce one.
      if (carrying && dt > 0) {
        orbit.seat(shownEye, shownAim, eye, aim, 0);
        // `demand` is NOT scaled. It is what the framing itself did this frame
        // and the carry has to be allowed at least that much or it can never
        // close; what Reduce motion slows is the pay-back on top of it.
        const turnLimit = demand + rate * scale * dt;
        const travelLimit = MAX_RIG_SPEED * dt;
        // The aim is linear in the weight, so its travel is exact rather than
        // sampled; the eye's is not, which is what `reach` is for.
        const aimSpan = shownAim.distanceTo(aim);
        const from = orbit.view(0, carryFrom);
        let weight = 1;
        // Three passes, for the reason the rig's own blends give: the turn is
        // far from linear in the weight. The round that added this measured the
        // run reset at the `off` end stop against a 25 deg/s ceiling: one pass
        // left 31.4 deg/s on the screen, two 25.1, three 25.0, and a fourth
        // changed nothing.
        for (let pass = 0; pass < 3; pass += 1) {
          const turn = from.angleTo(orbit.view(weight, carryTo));
          const travel = Math.max(orbit.reach(weight, shownEye), aimSpan * weight);
          // Each term is a share of its own allowance and is taken only when
          // it is over it. A quantity that is inside its limit contributes
          // nothing, which is the same answer the division gave and is defined
          // when both are zero - the case at the end of a recovery, where the
          // weight has already been driven to zero and the division was `0 / 0`.
          const excess = Math.max(
            turn > turnLimit ? turn / turnLimit : 0,
            travel > travelLimit ? travel / travelLimit : 0,
          );
          if (excess <= 1) break;
          weight /= excess;
        }
        // Whatever the arithmetic above did, a weight that is not a number is
        // no progress rather than a poisoned pose.
        if (!Number.isFinite(weight)) weight = 0;
        if (weight >= 1) carrying = false;
        else orbit.pose(weight, shownEye, shownAim);
      }
      if (!carrying) {
        shownEye.copy(eye);
        shownAim.copy(aim);
      }
      seated = true;
      outEye.copy(shownEye);
      outAim.copy(shownAim);
    },
  };
}
