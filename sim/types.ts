// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The canonical sim state shapes. One field name per concept; no aliases, no
 * legacy mirrors, no render state (spec/01, spec/02).
 *
 * UNITS (read this before touching a constant in tuning.ts)
 * ---------------------------------------------------------
 * The sim runs at a fixed 60 Hz. Two velocity units coexist, inherited from
 * sds, deliberately kept rather than harmonised because the tuned numbers are
 * expressed in them:
 *
 *  - The DOG integrates in metres per second: `position += velocity * dt`.
 *    `applyAcceleration` already multiplies by dt, so 15 / 40 / 30 from the
 *    spec/02 appendix land unchanged and mean exactly what they say.
 *  - SHEEP integrate in metres per tick: `position += velocity`, verbatim from
 *    the lifted `updateMovement`. The appendix's sheep numbers are boid units,
 *    not m/s: sds converted them at the integration site with
 *    `Boid.velocityScale`. herd carries the same conversion once, in
 *    tuning.ts's SHEEP_VELOCITY_SCALE, so every appendix value reads verbatim
 *    and the resulting top speed is the playtested one. The steering math is
 *    homogeneous of degree one in (velocity, maxSpeed, maxForce), so folding
 *    the conversion into the constants instead of the integrator is a change
 *    of units, not a change of feel.
 *
 * Distances (perception, separation, flee radius, boundary margin, body radii,
 * bark range) are metres in both unit systems and are never scaled.
 */

import type { Vector2D } from './Vector2D';
import type { PenBarrier, DogPenMemory } from './PenBarrier';
import type { SheepCollisionScratch } from './EntityCollision';
import type { RectBounds, Gate } from './boundary';

/**
 * The single source of truth for "is this sheep in play" (spec/02). No boolean
 * accretion: there is no `penned`, no `isRetiring`, no `hasPassedGate`.
 *
 *  - `active`   in the field, simulated by the flocking tick.
 *  - `retiring` inside the pen, walking to its seeded settle spot. Already home.
 *  - `penned`   settled at its spot, grazing. Terminal.
 *
 * `retiring` and `penned` both mean "inside the pen", which is why
 * `SimState.pennedCount` counts both: crossing the gate is the achievement, the
 * settle walk is just how it looks. The two states are distinct so the renderer
 * can pick walk vs graze without reading positions.
 */
export type SheepLifecycle = 'active' | 'retiring' | 'penned';

/** One sheep. Flat, mutable, allocation-stable for the whole run. */
export interface Sheep {
  readonly id: number;
  /** Reassigned (not mutated) by the hard boundary clamp, exactly as in sds. */
  position: Vector2D;
  velocity: Vector2D;
  acceleration: Vector2D;
  state: SheepLifecycle;

  // --- decaying bark steering intent (BarkImpulse) ---
  barkSteerTicks: number;
  barkSteerDurationTicks: number;
  barkSteerX: number;
  barkSteerZ: number;
  barkSteerForce: number;

  // --- ambient grazing drift (see step.ts) ---
  /** Ticks left on the current drift heading. */
  wanderTicks: number;
  wanderX: number;
  wanderZ: number;

  /** Settle spot inside the pen, drawn once on entry from a seeded stream. */
  settleTarget: Vector2D | null;
}

/** One player-controlled sheepdog. Co-op is N dogs in one array, no branches. */
export interface Dog {
  readonly id: number;
  position: Vector2D;
  velocity: Vector2D;
  acceleration: Vector2D;
  /**
   * Unit forward vector, slewed toward the velocity direction without trig.
   * Kept as a vector rather than an angle precisely so the tick path never
   * calls atan2: the bark cone needs a forward, the renderer derives the angle.
   */
  heading: Vector2D;
  stamina: number;
  sprinting: boolean;
  /** Counts down to zero; a bark is only accepted at zero. */
  barkCooldownTicks: number;
  /** Per-dog inside-the-pen memory for PenBarrier.containDog. */
  penMemory: DogPenMemory;
}

/** One tick of intent from one player. Direction need not be normalized. */
export interface PlayerInputs {
  readonly direction: { readonly x: number; readonly z: number };
  readonly sprint: boolean;
  readonly bark: boolean;
}

/** Where the flock starts: a ring around one centre, rejection sampled. */
export interface SpawnCluster {
  readonly center: { readonly x: number; readonly z: number };
  readonly spreadRadius: number;
}

/**
 * The whole playable geometry. One field, one gate, one pen; there is no shape
 * union and no scene registry to resolve (spec/02: "No multi-shape input
 * resolution").
 */
export interface FieldDef {
  /** Perimeter fence rect. */
  readonly bounds: RectBounds;
  /** The one opening in the perimeter, centred on x = 0. */
  readonly gate: Gate;
  /** Pen rect behind the gate. Deliberately outside `bounds`. */
  readonly pen: RectBounds;
  readonly spawn: SpawnCluster;
  /** Where the dog starts. */
  readonly dogSpawn: { readonly x: number; readonly z: number };
}

/**
 * Everything `step` reads and writes. Constructed only by `createSimState`, so
 * the Worker, the client predictor and the trace tests build byte-identical
 * state from (field, flockSize, seed).
 */
export interface SimState {
  readonly field: FieldDef;
  readonly seed: number;
  /** Ticks elapsed. Advances by exactly one per `step`. */
  tick: number;
  readonly sheep: Sheep[];
  readonly dogs: Dog[];
  readonly penBarrier: PenBarrier;
  /** Reused spatial-hash buffers; the collision pass allocates nothing. */
  readonly collisionScratch: SheepCollisionScratch;
  /** Sheep inside the pen (`retiring` + `penned`). */
  pennedCount: number;
  /** The one win predicate: every sheep is inside the pen. No timers. */
  completed: boolean;
}
