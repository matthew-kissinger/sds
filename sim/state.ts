// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The one state factory. The Durable Object, the client predictor and the trace
 * fixtures all call this and only this, so all three build byte-identical state
 * from (field, flockSize, seed). Pattern lifted from sds/shared/index.js
 * `createGameState`, minus the scene registry, the boundary-shape union and the
 * legacy `bounds` override resolution (spec/02: "No multi-shape input
 * resolution").
 *
 * Seed discipline (spec/01): the per-game seed is drawn once at room creation,
 * lives server-side, and never reaches the wire. Clients copy positions from
 * snapshots; they never re-derive spawns. Two independent streams come off it:
 *
 *   spawn stream   mulberry32(seed)                 one shot, here
 *   settle stream  mulberry32(settleSeed ^ sheepId) one shot per pen entry
 *   tick stream    mulberry32(seed ^ TICK_SEED_SALT) owned by the caller of step
 *
 * They are separate so that adding a sheep, or penning one, cannot shift the
 * draws the other streams see.
 */

import { Vector2D } from './Vector2D';
import { mulberry32 } from './rng';
import { PenBarrier } from './PenBarrier';
import { createSheepCollisionScratch } from './EntityCollision';
import { generateInitialSheepPositions } from './spawn';
import { PEN_BARRIER } from './tuning';
import type { Dog, FieldDef, Sheep, SimState } from './types';

/**
 * Salt for the per-tick rng stream, so tick draws never collide with the spawn
 * draws taken from the same seed. Any caller that runs `step` must derive its
 * rng this way or traces will not reproduce.
 */
export const TICK_SEED_SALT = 0x9e3779b9;

/** The tick-path rng for a given game seed. One line, so no call site guesses. */
export function createTickRng(seed: number) {
  return mulberry32((seed ^ TICK_SEED_SALT) >>> 0);
}

function createSheep(id: number, position: Vector2D): Sheep {
  return {
    id,
    position,
    velocity: new Vector2D(0, 0),
    acceleration: new Vector2D(0, 0),
    state: 'active',
    barkSteerTicks: 0,
    barkSteerDurationTicks: 0,
    barkSteerX: 0,
    barkSteerZ: 0,
    barkSteerForce: 0,
    wanderTicks: 0,
    wanderX: 0,
    wanderZ: 0,
    settleTarget: null,
  };
}

function createDog(id: number, x: number, z: number): Dog {
  return {
    id,
    position: new Vector2D(x, z),
    velocity: new Vector2D(0, 0),
    acceleration: new Vector2D(0, 0),
    // Facing the flock: +z, up the field toward the gate.
    heading: new Vector2D(0, 1),
    stamina: 100,
    sprinting: false,
    barkCooldownTicks: 0,
    penMemory: { inside: false },
  };
}

/**
 * Build the canonical starting state.
 *
 * @param field the geometry (herd ships exactly one: HOME_FIELD)
 * @param flockSize 25 / 75 / 200. A config value, never a mode.
 * @param seed the per-game seed. Same seed, same starting positions, always.
 */
export function createSimState(field: FieldDef, flockSize: number, seed: number): SimState {
  const spawnRng = mulberry32(seed >>> 0);
  const positions = generateInitialSheepPositions(
    flockSize,
    field.bounds,
    {
      spreadRadius: field.spawn.spreadRadius,
      centerX: field.spawn.center.x,
      centerZ: field.spawn.center.z,
    },
    spawnRng,
  );

  const sheep: Sheep[] = positions.map((position, i) => createSheep(i, position));

  const penBarrier = new PenBarrier(
    field.pen,
    // The pen's gap sits on the pen's own south fence, sharing the perimeter
    // gate's x and width. See the geometry note in field.ts.
    { x: field.gate.position.x, z: field.pen.minZ, width: field.gate.width },
    { ...PEN_BARRIER, settleSeed: seed >>> 0 },
  );

  return {
    field,
    seed,
    tick: 0,
    sheep,
    dogs: [createDog(0, field.dogSpawn.x, field.dogSpawn.z)],
    penBarrier,
    collisionScratch: createSheepCollisionScratch(),
    pennedCount: 0,
    completed: false,
  };
}
