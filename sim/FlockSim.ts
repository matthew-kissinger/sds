// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The buffer contract between the sim and everything that draws or hears it.
 *
 * Two backends will implement this (spec/01): CpuDeterministicSim, below, which
 * is authoritative and is the only one the Worker knows about; and later
 * GpuComputeSim, which runs the boid rules as TSL compute shaders for unranked
 * local scale play and is never authoritative. The renderer, the grass
 * interaction and the audio triggers read only the typed arrays here, so they
 * cannot tell which backend is running. The interface exists now, before the
 * second backend does, because retrofitting the buffer contract is the
 * expensive part.
 *
 * The typed arrays are refilled from sim state at the end of every step. They
 * are presentation state: nothing in `sim/step.ts` reads them back, so the
 * atan2 that derives a heading angle here cannot feed a divergence. That is the
 * sanctioned use of trig under the determinism rules, and the only one in this
 * file.
 */

import { createSimState, createTickRng } from './state';
import { step } from './step';
import { FIXED_DT, MIN_MOVEMENT_SPEED } from './tuning';
import type { Rng } from './rng';
import type { FieldDef, PlayerInputs, SheepLifecycle, SimState } from './types';

export interface FlockSim {
  /** True when this backend's results may be scored and sent on the wire. */
  readonly authoritative: boolean;
  /** Advance one fixed tick. `dtFixed` must equal FIXED_DT; it is not a knob. */
  step(inputs: readonly PlayerInputs[], dtFixed: number): void;
  /** SoA: x, z per sheep. Length 2n. */
  readonly positions: Float32Array;
  /** Facing angle in radians per sheep, atan2(z, x). Length n. */
  readonly headings: Float32Array;
  /** Lifecycle per sheep, as SHEEP_STATE_FLAG. Length n. */
  readonly stateFlags: Uint8Array;
  /** SoA: x, z per dog. Length 2m. Presentation-only. */
  readonly dogPositions: Float32Array;
  /** SoA: x, z per dog. Length 2m. Presentation-only. */
  readonly dogVelocities: Float32Array;
  /** Facing angle in radians per dog. Length m. */
  readonly dogHeadings: Float32Array;
  /** Stamina percentage, 0..1 per dog. Length m. */
  readonly dogStamina: Float32Array;
  /** Monotonic within one run; increments only when a bark passes cooldown. */
  readonly acceptedBarkSerial: number;
  /** Tick and dog index for the most recently accepted bark. */
  readonly acceptedBarkTick: number;
  readonly acceptedBarkDog: number;
}

/**
 * The lifecycle enum as it crosses into the typed-array world. Same three
 * states as `SheepLifecycle`, encoded because a Uint8Array cannot hold strings.
 * This is an encoding, not a second source of truth: `sim/` compares strings,
 * the renderer compares these.
 */
export const SHEEP_STATE_FLAG = {
  active: 0,
  retiring: 1,
  penned: 2,
} as const satisfies Record<SheepLifecycle, number>;

/**
 * The lifted sds sim. Authoritative: ranked solo play and all multiplayer run
 * on this, in the Worker and as the client predictor, from the same `step`.
 */
export class CpuDeterministicSim implements FlockSim {
  readonly authoritative = true;

  readonly state: SimState;
  readonly positions: Float32Array;
  readonly headings: Float32Array;
  readonly stateFlags: Uint8Array;
  readonly dogPositions: Float32Array;
  readonly dogVelocities: Float32Array;
  readonly dogHeadings: Float32Array;
  readonly dogStamina: Float32Array;

  acceptedBarkSerial = 0;
  acceptedBarkTick = -1;
  acceptedBarkDog = -1;

  private readonly rng: Rng;
  private readonly previousBarkCooldowns: Uint16Array;

  constructor(field: FieldDef, flockSize: number, seed: number) {
    this.state = createSimState(field, flockSize, seed);
    this.rng = createTickRng(seed);
    const n = this.state.sheep.length;
    this.positions = new Float32Array(n * 2);
    this.headings = new Float32Array(n);
    this.stateFlags = new Uint8Array(n);
    const dogCount = this.state.dogs.length;
    this.dogPositions = new Float32Array(dogCount * 2);
    this.dogVelocities = new Float32Array(dogCount * 2);
    this.dogHeadings = new Float32Array(dogCount);
    this.dogStamina = new Float32Array(dogCount);
    this.previousBarkCooldowns = new Uint16Array(dogCount);
    this.sync();
  }

  step(inputs: readonly PlayerInputs[], dtFixed: number): void {
    if (dtFixed !== FIXED_DT) {
      throw new Error(
        `FlockSim.step is fixed-rate: expected dt ${FIXED_DT}, got ${dtFixed}. ` +
          'Accumulate variable frame deltas into whole ticks before calling.',
      );
    }
    const dogs = this.state.dogs;
    for (let i = 0; i < dogs.length; i++) {
      this.previousBarkCooldowns[i] = dogs[i]!.barkCooldownTicks;
    }
    step(this.state, inputs, this.rng);
    for (let i = 0; i < dogs.length; i++) {
      if (dogs[i]!.barkCooldownTicks > this.previousBarkCooldowns[i]!) {
        this.acceptedBarkSerial += 1;
        this.acceptedBarkTick = this.state.tick;
        this.acceptedBarkDog = i;
      }
    }
    this.sync();
  }

  /** Sheep inside the pen, `retiring` plus `penned`. */
  get pennedCount(): number {
    return this.state.pennedCount;
  }

  /** The one win predicate: every sheep is in the pen. */
  get completed(): boolean {
    return this.state.completed;
  }

  get tick(): number {
    return this.state.tick;
  }

  /**
   * Copy sim state into the presentation buffers. A sheep moving slower than
   * the micro-movement threshold keeps its previous heading rather than
   * snapping to atan2(0, 0), which is how a settling or grazing sheep holds
   * still without spinning.
   */
  private sync(): void {
    const sheep = this.state.sheep;
    for (let i = 0; i < sheep.length; i++) {
      const s = sheep[i]!;
      this.positions[i * 2] = s.position.x;
      this.positions[i * 2 + 1] = s.position.z;
      this.stateFlags[i] = SHEEP_STATE_FLAG[s.state];
      if (s.velocity.magnitude() > MIN_MOVEMENT_SPEED) {
        this.headings[i] = s.velocity.angle();
      }
    }
    const dogs = this.state.dogs;
    for (let i = 0; i < dogs.length; i++) {
      const dog = dogs[i]!;
      this.dogPositions[i * 2] = dog.position.x;
      this.dogPositions[i * 2 + 1] = dog.position.z;
      this.dogVelocities[i * 2] = dog.velocity.x;
      this.dogVelocities[i * 2 + 1] = dog.velocity.z;
      this.dogHeadings[i] = Math.atan2(dog.heading.z, dog.heading.x);
      this.dogStamina[i] = dog.stamina / 100;
    }
  }
}
