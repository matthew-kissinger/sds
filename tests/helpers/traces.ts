// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The trace producers. Every committed fixture under tests/fixtures/ is the
 * output of exactly one function in this file, and the specs compare against
 * the same function. There is no second implementation of the tick anywhere:
 * each of these drives the exported `step` through `createSimState`, which is
 * the whole point (sds pinned an 810-line hand-mirrored harness instead of its
 * sim, so its fixtures could not catch a sim change).
 *
 * Values are rounded to 4 decimals on the way out. That absorbs the last bits
 * of cross-platform double formatting without hiding a behaviour change: 1e-4 m
 * is a tenth of a millimetre, and any real divergence in a chaotic flock grows
 * past that within a handful of ticks.
 */

import { createSimState, createTickRng } from '@sim/state';
import { step } from '@sim/step';
import { startBarkSteering } from '@sim/BarkImpulse';
import { HOME_FIELD } from '@sim/field';
import { SHEEP_BARK } from '@sim/tuning';
import type { PlayerInputs, SimState } from '@sim/types';
import { createHerdingDriver } from './herding-driver';

const IDLE: PlayerInputs = { direction: { x: 0, z: 0 }, sprint: false, bark: false };

/** 4 decimals, and never `-0`, which JSON round-trips inconsistently. */
export function round4(value: number): number {
  const r = Math.round(value * 1e4) / 1e4;
  return r === 0 ? 0 : r;
}

function flockSample(state: SimState): number[] {
  const out: number[] = [];
  for (const s of state.sheep) {
    out.push(round4(s.position.x), round4(s.position.z));
  }
  return out;
}

export interface FlockDriftTrace {
  seed: number;
  flockSize: number;
  ticks: number;
  /** Sheep x,z pairs at each sample tick, keyed by tick. */
  samples: Record<string, number[]>;
}

/**
 * (a) Flock drift with no input at all. Pins flocking, the ambient drift rng
 * stream, sheep/sheep separation and the movement integrator all at once: the
 * spawn cluster is tight enough that separation fires on tick one.
 */
export function traceFlockDrift(seed = 20260821, flockSize = 25, ticks = 300): FlockDriftTrace {
  const state = createSimState(HOME_FIELD, flockSize, seed);
  const rng = createTickRng(seed);
  const sampleAt = new Set([1, 60, 150, ticks]);
  const samples: Record<string, number[]> = {};
  for (let t = 1; t <= ticks; t++) {
    step(state, [IDLE], rng);
    if (sampleAt.has(t)) samples[String(t)] = flockSample(state);
  }
  return { seed, flockSize, ticks, samples };
}

export interface DogRotationTrace {
  seed: number;
  ticks: number;
  /** [tick, headingX, headingZ, speed] rows. */
  rows: number[][];
}

/**
 * (b) Dog rotation convergence under a fixed input. The dog starts facing +z
 * and is told to run +x; the heading slews without trig and must converge
 * monotonically, and the speed curve pins acceleration and the speed cap.
 */
export function traceDogRotation(seed = 20260821, ticks = 120): DogRotationTrace {
  const state = createSimState(HOME_FIELD, 1, seed);
  const rng = createTickRng(seed);
  const input: PlayerInputs = { direction: { x: 1, z: 0 }, sprint: false, bark: false };
  const rows: number[][] = [];
  for (let t = 1; t <= ticks; t++) {
    step(state, [input], rng);
    if (t % 10 === 0) {
      const dog = state.dogs[0]!;
      rows.push([t, round4(dog.heading.x), round4(dog.heading.z), round4(dog.velocity.magnitude())]);
    }
  }
  return { seed, ticks, rows };
}

export interface StaminaTrace {
  seed: number;
  /** [tick, stamina, sprinting] rows; sprinting is 0 or 1. */
  rows: number[][];
}

/**
 * (c) Stamina drain and regen. Phase 1 sprints while running, phase 2 keeps
 * running without sprint, phase 3 stands still. Pins the 30/s drain, the 20/s
 * regen, the doubled idle regen and the minimum-to-sprint hysteresis.
 */
export function traceStamina(seed = 20260821): StaminaTrace {
  const state = createSimState(HOME_FIELD, 1, seed);
  const rng = createTickRng(seed);
  const dog = state.dogs[0]!;
  const rows: number[][] = [];
  const phases: Array<[PlayerInputs, number]> = [
    [{ direction: { x: 1, z: 0 }, sprint: true, bark: false }, 300],
    [{ direction: { x: 1, z: 0 }, sprint: false, bark: false }, 180],
    [IDLE, 180],
  ];
  let t = 0;
  for (const [input, count] of phases) {
    for (let i = 0; i < count; i++) {
      step(state, [input], rng);
      t++;
      if (t % 20 === 0) rows.push([t, round4(dog.stamina), dog.sprinting ? 1 : 0]);
    }
  }
  return { seed, rows };
}

/** One bark, and what the flock did about it. */
export interface BarkShot {
  /** Sheep the cone took outright, on the bark's own tick. */
  steered: number;
  /** Sheep the startle reached second-hand, a few ticks later. */
  rippled: number;
  /** Longest ripple delay handed out, ticks. */
  maxDelayTicks: number;
  /** Per sheep: silent ticks before its push begins. 0 for a direct hit. */
  delays: number[];
  /** Per sheep: ticks its push then lasts. 0 for a sheep the bark missed. */
  durations: number[];
  /** Sheep x,z pairs at each sample tick after the bark. */
  samples: Record<string, number[]>;
}

export interface BarkTrace {
  seed: number;
  flockSize: number;
  /** Dog 10 m behind the flock facing up the field: the shot a player takes. */
  push: BarkShot;
  /** Dog standing in the flock: pins the near radius and the ripple collar. */
  inFlock: BarkShot;
}

/**
 * The delay/duration split, read back off the sheep. `barkSteerTicks` counts
 * down from `duration + delay`, so the difference IS the delay; capturing both
 * pins the ripple's timing, which is the part of the bark a positions-only
 * sample cannot see (a sheep two ticks into its delay has not moved yet).
 */
function barkTiming(state: SimState): { delays: number[]; durations: number[] } {
  const delays: number[] = [];
  const durations: number[] = [];
  for (const s of state.sheep) {
    delays.push(Math.max(0, s.barkSteerTicks - s.barkSteerDurationTicks));
    durations.push(s.barkSteerDurationTicks);
  }
  return { delays, durations };
}

/**
 * Settle a flock, park the dog at `offset` from its centroid facing north, and
 * bark through the public entry point the tick uses. 120 ticks of settling
 * first, so what the sample shows is the bark's doing and not leftover spawn
 * energy.
 */
function barkShot(seed: number, flockSize: number, offsetZ: number): BarkShot {
  const state = createSimState(HOME_FIELD, flockSize, seed);
  const rng = createTickRng(seed);
  for (let t = 0; t < 120; t++) step(state, [IDLE], rng);

  let cx = 0;
  let cz = 0;
  for (const s of state.sheep) {
    cx += s.position.x;
    cz += s.position.z;
  }
  cx /= state.sheep.length;
  cz /= state.sheep.length;

  const dog = state.dogs[0]!;
  dog.position.set(cx, cz + offsetZ);
  dog.velocity.set(0, 0);
  dog.heading.set(0, 1);

  const result = startBarkSteering(state.sheep, dog.position, dog.heading, SHEEP_BARK);
  const timing = barkTiming(state);

  const samples: Record<string, number[]> = { '0': flockSample(state) };
  // 15 is the surge, 30 the half-second the design is specified in, 60 the
  // full second, 90 the settle after the longest push has expired.
  const sampleAt = new Set([15, 30, 60, 90]);
  for (let t = 1; t <= 90; t++) {
    step(state, [IDLE], rng);
    if (sampleAt.has(t)) samples[String(t)] = flockSample(state);
  }

  return {
    steered: result.steered,
    rippled: result.rippled,
    maxDelayTicks: result.maxDelayTicks,
    delays: timing.delays,
    durations: timing.durations,
    samples,
  };
}

/**
 * (d) Bark response, in the two shapes the redesigned bark has to get right.
 *
 * `push` is the herding shot: the dog behind the flock, the whole cone taking
 * the impulse at once and the flock leaving as a body. `inFlock` is the dog
 * standing among the sheep, which exercises the near radius (the cone test is
 * skipped inside it) and leaves a real collar of bystanders for the startle
 * ripple to reach on a delay.
 *
 * REGENERATED as a user-ordered decision (STATUS.md "Direction changes"): the
 * bark's range, force, duration, cooldown and propagation all changed, and this
 * fixture's whole shape changed with them.
 */
export function traceBark(seed = 20260821, flockSize = 25): BarkTrace {
  return {
    seed,
    flockSize,
    push: barkShot(seed, flockSize, -10),
    inFlock: barkShot(seed, flockSize, 0),
  };
}

export interface CompletionTrace {
  seed: number;
  flockSize: number;
  /** Tick on which the last sheep entered the pen. THE acceptance number. */
  completedAtTick: number;
  /** Sheep in the pen at each 100th tick, from tick 100 to completion. */
  pennedPer100: number[];
  /** Terminal penned count. Must equal flockSize; completion happens between
   * 100-tick samples, so pennedPer100 alone never records it. */
  finalPenned: number;
}

/**
 * (e) The acceptance line: a full flock herded into the pen by the scripted
 * driver. Records when it finished and the penning curve on the way.
 *
 * If this stops completing, the driver is what changed or what must change
 * (tests/helpers/herding-driver.ts). Never the sim.
 */
export function traceCompletion(seed = 20260821, flockSize = 25, cap = 60000): CompletionTrace {
  const state = createSimState(HOME_FIELD, flockSize, seed);
  const rng = createTickRng(seed);
  const drive = createHerdingDriver();
  const pennedPer100: number[] = [];
  let t = 0;
  while (t < cap && !state.completed) {
    step(state, [drive(state)], rng);
    t++;
    if (t % 100 === 0) pennedPer100.push(state.pennedCount);
  }
  return {
    seed,
    flockSize,
    completedAtTick: state.completed ? t : -1,
    pennedPer100,
    finalPenned: state.pennedCount,
  };
}

/** Every fixture, by file name, in one place so the generator cannot drift. */
export const FIXTURES = {
  'flock-drift': traceFlockDrift,
  'dog-rotation': traceDogRotation,
  'stamina-curve': traceStamina,
  'bark-scatter': traceBark,
  'completion-run': traceCompletion,
} as const;
