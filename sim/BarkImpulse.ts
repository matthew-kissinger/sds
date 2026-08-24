// SPDX-License-Identifier: AGPL-3.0-or-later
// Structure and the hybrid forward/radial steering idea lifted from
// sds/shared/BarkImpulse.js; same license and copyright holder.
//
// REDESIGNED (user-ordered, STATUS.md "Direction changes", 2026-08-21).
// sds's bark reached 24 m through a 100 degree cone and expired in 36 ticks,
// which made it a nudge rather than a verb: a player could bark into a spread
// flock and watch four sheep drift a metre. The geometry, the magnitude, the
// duration and the cooldown are all retuned here, and a startle ripple is new.
// The bark-scatter fixture diff is that decision, recorded.

/**
 * Deterministic bark steering.
 *
 * A bark does not push sheep by editing velocity. It marks active sheep with a
 * decaying steering intent; the ordinary sheep tick adds that as acceleration,
 * so the existing max-speed clamp, damping and smoothing own the final motion.
 * That is the Calm pillar in one sentence: a bark can hold a sheep at its top
 * speed for a second, and can never move it faster than a sheep can run.
 *
 * THE SHAPE OF ONE BARK
 * ---------------------
 *   direct  every active sheep inside `nearRadius`, plus every active sheep
 *           inside `range` and inside the forward cone, takes the full impulse
 *           on the same tick the bark is issued. No delay: the player's input
 *           and the flock's reaction share a frame.
 *   ripple  every other active sheep within `rippleRadius` of a directly hit
 *           one takes a scaled, shortened impulse, delayed by a whole number of
 *           ticks proportional to its distance from the dog. The flock reads as
 *           a body passing a startle outward rather than a set of independent
 *           agents, and the delay is the same number the presentation layer
 *           expands its ring on.
 *
 * The delay needs no new sheep field: `barkSteerTicks` counts down from
 * `duration + delay`, and every tick above `duration` is a silent one.
 *
 * Determinism contract: pure, no DOM/Three/window, no Math.random, no Date.now,
 * no rng, and no trig. The cone test is a dot product against a precomputed
 * cosine. Only +, -, *, /, Math.sqrt, Math.floor and comparisons appear here.
 */

import type { SheepLifecycle } from './types';

/** Anything with XZ components: a Vector2D instance or a plain literal. */
export interface BarkVec {
  x: number;
  z: number;
}

/** Duck-typed sheep view this module reads and mutates. */
export interface BarkSheep {
  position: BarkVec;
  acceleration: BarkVec;
  /** Absent means "assume active", which is what sds's `state === undefined` did. */
  state?: SheepLifecycle | undefined;
  barkSteerTicks?: number | undefined;
  barkSteerDurationTicks?: number | undefined;
  barkSteerX?: number | undefined;
  barkSteerZ?: number | undefined;
  barkSteerForce?: number | undefined;
}

export interface BarkConfig {
  /** Cone reach, m. */
  range: number;
  /** Cosine of the cone half-angle. Precomputed; no trig on the tick path. */
  minDot: number;
  /**
   * Radius inside which the cone test is skipped, m. A bark at your shoulder
   * startles you whichever way the dog is looking, and it stops the tool from
   * feeling fiddly when the dog is inside the flock.
   */
  nearRadius: number;
  /** Peak steering force, metres per tick of velocity change per tick. */
  steerForce: number;
  /** Ticks the direct push decays over, linearly, to zero. */
  durationTicks: number;
  /** Push direction is `forward * forwardWeight + radial * radialWeight`. */
  forwardWeight: number;
  radialWeight: number;
  /** Force multiplier at `range`; it is 1 at the dog and interpolates linearly. */
  minFalloff: number;
  /** How far the startle spreads from a directly hit sheep, m. */
  rippleRadius: number;
  /** Fraction of the peak force a rippled sheep gets. */
  rippleForceScale: number;
  /** Fraction of `durationTicks` a rippled push lasts. */
  rippleDurationScale: number;
  /** Ticks of ripple delay per metre from the dog. The startle's travel time. */
  rippleDelayTicksPerMetre: number;
  /** Ceiling on that delay, ticks. */
  rippleMaxDelayTicks: number;
}

/**
 * The bark, as the tick reads it. See the table in sim/tuning.ts for the old
 * sds value beside each of these and the one-line reason it moved.
 */
export const DEFAULT_BARK_CONFIG: Readonly<BarkConfig> = {
  range: 40,
  minDot: 0.5, // cos(60 deg), precomputed: no trig on the tick path
  nearRadius: 10,
  steerForce: 0.34,
  durationTicks: 75,
  forwardWeight: 0.45,
  radialWeight: 0.55,
  minFalloff: 0.55,
  rippleRadius: 6,
  rippleForceScale: 0.38,
  rippleDurationScale: 0.5,
  rippleDelayTicksPerMetre: 0.25,
  rippleMaxDelayTicks: 18,
};

/** What one bark did, for tests, traces and the presentation layer's ring. */
export interface BarkResult {
  /** Sheep that took the full impulse on this tick. */
  steered: number;
  /** Sheep that took the scaled impulse on a later tick. */
  rippled: number;
  /** Largest ripple delay handed out, ticks. Zero when nothing rippled. */
  maxDelayTicks: number;
}

/**
 * Per-bark scratch: one flag per sheep, marking the direct hits so the ripple
 * pass can skip them. Same contract as the pools in step.ts and
 * FlockingAlgorithms: single-threaded by construction, length reset and fully
 * rewritten before any read, so nothing leaks between calls or between states.
 */
const _hit: number[] = [];

/**
 * sds conjoined five fields here (`state === 0 && !isRetiring && !isAscending
 * && !dormant && !killed`). herd has one lifecycle enum, so the test is one
 * comparison with identical semantics: a sheep already in the pen ignores barks.
 */
function isBarkSteerable(sheep: BarkSheep | null | undefined): sheep is BarkSheep {
  return Boolean(
    sheep
      && sheep.position
      && sheep.acceleration
      && (sheep.state === undefined || sheep.state === 'active'),
  );
}

function clearBarkSteering(sheep: BarkSheep): void {
  sheep.barkSteerTicks = 0;
  sheep.barkSteerDurationTicks = 0;
  sheep.barkSteerForce = 0;
}

/** 1 at the dog, `minFalloff` at `range` and beyond. Linear between. */
function falloffAt(dist: number, range: number, minFalloff: number): number {
  if (dist >= range) return minFalloff;
  return minFalloff + (1 - minFalloff) * (1 - dist / range);
}

/**
 * Falloff shortens the push as well as weakening it, and this is the line that
 * makes `range` mean something.
 *
 * Measured, not assumed: `updateMovement` clamps a sheep to
 * SHEEP_MAX_SPEED_PER_TICK and then smooths, so ANY steering force above about
 * 0.0025 m/tick/tick drives a sheep to 98 percent of its top speed within a
 * dozen ticks. Weakening a bark by distance therefore changed the measured
 * 60-tick displacement at 35 m by 12 cm - the far sheep ran exactly as fast as
 * the near one, just as long. What distance can honestly buy is TIME under
 * push. Scaling the duration by the same falloff turns the range into a
 * gradient the player can read: hard shove up close, startle at the edge.
 */
function durationAt(durationTicks: number, falloff: number): number {
  const t = Math.floor(durationTicks * falloff);
  return t < 1 ? 1 : t;
}

/**
 * Write one steering intent. `delayTicks` silent ticks are prepended by
 * counting down from `duration + delay`; see the module header.
 */
function setBarkSteering(
  sheep: BarkSheep,
  dirX: number,
  dirZ: number,
  force: number,
  duration: number,
  delayTicks: number,
): boolean {
  const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
  // Unreachable with the shipped weights (0.45 forward against 0.55 radial
  // cannot cancel, and both inputs are unit vectors), but a bark that writes no
  // direction must not be counted as a bark either.
  if (len < 1e-9) return false;
  sheep.barkSteerDurationTicks = duration;
  sheep.barkSteerTicks = duration + delayTicks;
  sheep.barkSteerX = dirX / len;
  sheep.barkSteerZ = dirZ / len;
  sheep.barkSteerForce = force;
  return true;
}

/**
 * Issue one bark from `origin` facing `forward`.
 *
 * Cost is one pass over the flock plus, for each sheep the first pass missed, a
 * scan of the sheep it hit. Barks are gated by a cooldown far longer than a
 * tick, so this never runs twice in the same frame.
 *
 * @returns what it did; `step` ignores it, tests and traces read it.
 */
export function startBarkSteering(
  sheep: readonly (BarkSheep | undefined)[] | null | undefined,
  origin: BarkVec,
  forward: BarkVec,
  config: BarkConfig = DEFAULT_BARK_CONFIG,
): BarkResult {
  if (!sheep || sheep.length === 0) return { steered: 0, rippled: 0, maxDelayTicks: 0 };

  const {
    range, minDot, nearRadius, steerForce, durationTicks,
    forwardWeight, radialWeight, minFalloff,
    rippleRadius, rippleForceScale, rippleDurationScale,
    rippleDelayTicksPerMetre, rippleMaxDelayTicks,
  } = config;
  const rangeSq = range * range;
  const nearSq = nearRadius * nearRadius;
  const rippleSq = rippleRadius * rippleRadius;
  const fx = forward.x;
  const fz = forward.z;
  let steered = 0;

  // --- pass 1: the cone, immediate -----------------------------------------
  _hit.length = sheep.length;
  for (let i = 0; i < sheep.length; i++) {
    _hit[i] = 0;
    const s = sheep[i];
    if (!isBarkSteerable(s)) continue;

    const dx = s.position.x - origin.x;
    const dz = s.position.z - origin.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > rangeSq && distSq > nearSq) continue;

    const dist = Math.sqrt(distSq);
    if (dist < 1e-6) {
      // Point-blank: full force straight along the facing, cone test moot.
      if (setBarkSteering(s, fx, fz, steerForce, durationTicks, 0)) {
        _hit[i] = 1;
        steered++;
      }
      continue;
    }

    const rx = dx / dist;
    const rz = dz / dist;
    const inNear = distSq <= nearSq;
    // Cone test: dot of the (dog -> sheep) unit vector against the forward
    // unit. Skipped inside nearRadius, where the push is purely radial.
    if (!inNear && rx * fx + rz * fz < minDot) continue;

    const falloff = falloffAt(dist, range, minFalloff);
    const wf = inNear ? 0 : forwardWeight;
    const wr = inNear ? 1 : radialWeight;
    const written = setBarkSteering(
      s,
      fx * wf + rx * wr,
      fz * wf + rz * wr,
      steerForce * falloff,
      durationAt(durationTicks, falloff),
      0,
    );
    if (!written) continue;
    _hit[i] = 1;
    steered++;
  }

  if (steered === 0) return { steered: 0, rippled: 0, maxDelayTicks: 0 };

  // --- pass 2: the startle ripple, delayed ---------------------------------
  // Every sheep the cone missed but that stands next to a sheep it hit. The
  // push is radially away from the dog, because what the neighbour saw was the
  // dog, and it is weaker and shorter: a flinch, not a run.
  const rippleTicks = durationTicks * rippleDurationScale;
  const rippleForce = steerForce * rippleForceScale;
  let rippled = 0;
  let maxDelayTicks = 0;

  for (let i = 0; i < sheep.length; i++) {
    if (_hit[i] === 1) continue;
    const s = sheep[i];
    if (!isBarkSteerable(s)) continue;

    let touched = false;
    for (let j = 0; j < sheep.length; j++) {
      if (_hit[j] !== 1) continue;
      const n = sheep[j]!;
      const nx = s.position.x - n.position.x;
      const nz = s.position.z - n.position.z;
      if (nx * nx + nz * nz <= rippleSq) {
        touched = true;
        break;
      }
    }
    if (!touched) continue;

    const dx = s.position.x - origin.x;
    const dz = s.position.z - origin.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1e-6) continue;

    let delay = Math.floor(dist * rippleDelayTicksPerMetre);
    if (delay > rippleMaxDelayTicks) delay = rippleMaxDelayTicks;
    const falloff = falloffAt(dist, range, minFalloff);
    const written = setBarkSteering(
      s,
      dx / dist,
      dz / dist,
      rippleForce * falloff,
      durationAt(rippleTicks, falloff),
      delay,
    );
    if (!written) continue;
    if (delay > maxDelayTicks) maxDelayTicks = delay;
    rippled++;
  }

  return { steered, rippled, maxDelayTicks };
}

/**
 * Apply one tick of a pending bark steering intent. Mutates acceleration only;
 * normal movement integration applies speed limits and smoothing.
 *
 * @returns true when a steering force was applied. False while a rippled sheep
 * is still counting down its delay, which is not the same as "no intent".
 */
export function tickBarkSteering(sheep: BarkSheep | null | undefined): boolean {
  if (!sheep || (sheep.barkSteerTicks ?? 0) <= 0) return false;
  if (!isBarkSteerable(sheep)) {
    clearBarkSteering(sheep);
    return false;
  }

  // The `!` reads are provable: barkSteerTicks > 0 only after setBarkSteering
  // wrote the whole intent set in one statement.
  const ticks = sheep.barkSteerTicks!;
  const duration = sheep.barkSteerDurationTicks!;
  sheep.barkSteerTicks = ticks - 1;

  // Silent ticks: the startle has not reached this sheep yet.
  if (ticks > duration) return false;

  const force = sheep.barkSteerForce! * (ticks / duration);
  sheep.acceleration.x += sheep.barkSteerX! * force;
  sheep.acceleration.z += sheep.barkSteerZ! * force;
  if (sheep.barkSteerTicks <= 0) clearBarkSteering(sheep);
  return true;
}
