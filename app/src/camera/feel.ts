// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The camera's feel numbers and the two bits of math they are used with.
 *
 * These are the carried feel constants from spec/06, not suggestions: the
 * Follow rig was tuned around exactly these four time constants and the posK
 * cap, and the reason there are four rather than one is that each lag hides a
 * different artefact.
 *
 *  - yaw 0.35 s   the camera swings around the dog on a graceful arc, well
 *                 behind the dog's own turn, which is what makes a turn read
 *                 as a turn instead of as the world rotating.
 *  - position 0.15 s  the rig glides to the point behind the dog.
 *  - aim 0.08 s   the look-ahead point is smoothed SEPARATELY and much tighter
 *                 than the yaw. Sharing the yaw lag makes the aim point lead a
 *                 turn by a quarter second and the horizon slews; sharing no
 *                 lag at all lets fence contact and boundary nudges jitter the
 *                 aim at high refresh rates. 0.08 s filters the noise and still
 *                 feels attached to the dog.
 *  - speedNorm 0.1 s  the look-ahead distance scales with speed, so speed has
 *                 to be smoothed or a stamina-out pops the aim point.
 *
 * `1 - exp(-dt/tau)` is the closed-form continuous blend: the same amount of
 * smoothing per second at 30, 60 or 144 fps. A raw per-frame alpha is not
 * frame-rate independent and is why sds's Classic lerp had to be written as an
 * alpha-at-60 and converted; CLASSIC_POSITION_TAU below is that conversion,
 * done once, here.
 */

import * as THREE from 'three/webgpu';

/** Scratch for `approach`. One vector, reused: the camera allocates nothing. */
const step = new THREE.Vector3();

/** Follow: camera yaw lag. */
export const FOLLOW_YAW_TAU = 0.35;
/** Follow: rig position lag. */
export const FOLLOW_POSITION_TAU = 0.15;
/** Follow: look-ahead aim lag, deliberately separate from the yaw lag. */
export const FOLLOW_AIM_TAU = 0.08;
/** Follow: lag on the normalized speed that scales the look-ahead distance. */
export const SPEED_NORM_TAU = 0.1;
/**
 * Ceiling on the per-frame position blend. One dropped frame must not
 * teleport the rig most of the way to its target. Engages below ~22 fps and is
 * a no-op above it.
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
 * Longest frame the rig will integrate. A backgrounded tab hands the first
 * frame back a delta worth seconds; without this the mode blend would jump a
 * whole transition in one frame. 0.1 s is a 10 fps floor.
 */
export const MAX_FRAME_DT = 0.1;

/**
 * Ceiling on how fast a rig travels, m/s. An exponential smoother moves at a
 * speed proportional to the gap, which is right for chasing and wrong for a
 * discontinuity: a run reset puts the dog back at the spawn up to 200 m away,
 * and uncapped that is a whip-pan. Chasing a 25 m/s dog the rig settles at
 * 25 m/s, so this only ever engages on a discontinuity, where it turns the
 * recentre into a glide.
 */
export const MAX_RIG_SPEED = 55;

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
 * Every rig position and aim moves through here, so nothing in the camera can
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

/** Shortest-arc angle blend. Plain lerp would unwind the long way at +/-PI. */
export function lerpAngle(from: number, to: number, k: number): number {
  const twoPi = Math.PI * 2;
  let delta = (to - from) % twoPi;
  if (delta > Math.PI) delta -= twoPi;
  if (delta < -Math.PI) delta += twoPi;
  return from + delta * k;
}

/**
 * Smoothstep. The mode blend advances linearly and is shaped by this, so the
 * swap starts and ends at zero velocity (no visible kick at either end) and
 * reverses cleanly if the player toggles again mid-transition.
 */
export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
