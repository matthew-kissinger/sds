// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The tick. One exported function; the Durable Object, the client predictor and
 * the trace fixtures all import this same `step`. There is no harness
 * reimplementation (sds failure mode: an 810-line hand-mirrored harness meant
 * the fixtures pinned the harness, not the sim).
 *
 * CONTRACT
 * --------
 * `step` mutates `state` in place and returns the same object. It is a pure
 * function of (state, inputs, rng): no clocks, no globals, no Math.random, no
 * hidden state anywhere except the module-level scratch pool below, which is
 * fully reset before every read. Same state + same inputs + same rng sequence
 * produces the same result, on any platform, in any of the three toolchains.
 *
 * Returning the same reference rather than a fresh state is the sds style and
 * is deliberate: the flock is a fixed set of allocation-stable entities and the
 * 60 Hz tick must not churn the heap. Callers that want history snapshot what
 * they need (see FlockSim's typed arrays).
 *
 * SYSTEM ORDER (fixed; reordering is a behaviour change and moves fixtures)
 * ------------------------------------------------------------------------
 *   1. inputs -> dog stamina, acceleration, integration, heading
 *   2. bark -> steering intent seeded into sheep inside the forward cone
 *   3. sheep -> flocking + flee from every dog + bark tick + ambient drift
 *               + gate-aware fence force, then integration
 *   4. dog/sheep hard-body separation (inside the sheep loop, as in sds)
 *   5. sheep/sheep hard-body separation (one batched spatial-hash pass)
 *   6. pen barrier: fence containment for sheep and dogs, plus retirement
 *   7. hard perimeter clamp for whatever is still in the field
 *   8. lifecycle: penned count and the win predicate
 *
 * Steps 6 and 7 are in this order on purpose. The pen sits outside the
 * perimeter rect, so a sheep that has just crossed the gate line must be
 * retired by the barrier BEFORE the perimeter clamp runs, or the clamp would
 * yank it back into the field. sds solved the same problem with a
 * `hasPassedGate` flag; the lifecycle enum answers it without one.
 */

import { Vector2D } from './Vector2D';
import { calculateFlockingForce, calculateFlee, getNeighbors } from './FlockingAlgorithms';
import { updateMovement, applyAcceleration, updateStamina, validateEntityState } from './MovementPhysics';
import { startBarkSteering, tickBarkSteering } from './BarkImpulse';
import { calculateBoundaryAvoidanceWithGate, applyHardBoundaryConstraints } from './boundary';
import { resolveDogSheepCollisions, resolveSheepSheepCollisions } from './EntityCollision';
import {
  AMBIENT_IDLE_FRACTION,
  AMBIENT_SPEED_FRACTION,
  AMBIENT_STRENGTH_IDLE,
  AMBIENT_STRENGTH_MOVING,
  AMBIENT_WANDER_TICKS,
  BARK_COOLDOWN_TICKS,
  DOG_HEADING_MIN_SPEED,
  DOG_MAX_SPEED,
  DOG_MOVEMENT,
  DOG_SPRINT_SPEED,
  DOG_STAMINA,
  FIXED_DT,
  GATE_PASSAGE_DEPTH,
  HARD_BOUNDARY,
  SHEEP_BARK,
  SHEEP_BOUNDARY,
  SHEEP_FLEE_RADIUS,
  SHEEP_FLOCKING,
  SHEEP_MAX_FORCE,
  SHEEP_MAX_SPEED_PER_TICK,
  SHEEP_MOVEMENT,
  SHEEP_PERCEPTION_RADIUS,
  DOG_TURN_RATE,
} from './tuning';
import type { Rng } from './rng';
import type { Dog, PlayerInputs, Sheep, SimState } from './types';

/**
 * Per-tick scratch. Same contract as the pools inside FlockingAlgorithms and
 * MovementPhysics: single-threaded by construction (one Worker tick or one
 * client predictor tick at a time), every buffer reset before it is read, so
 * nothing leaks between calls or between SimState instances.
 */
const _active: Sheep[] = [];
const _dogTarget = new Vector2D(0, 0);
const _fallback = new Vector2D(0, 0);
/** Only `maxSpeed` varies (sprint), so the config object is reused, not rebuilt. */
const _dogAccel = { ...DOG_MOVEMENT };

/** A player who sent nothing this tick stands still. */
const IDLE_INPUT: PlayerInputs = { direction: { x: 0, z: 0 }, sprint: false, bark: false };

/**
 * Slew the dog's heading toward its velocity direction without trig: lerp the
 * unit vector and renormalize. Opposing unit vectors otherwise normalize back
 * to the original heading forever at our fixed step. Start that ambiguous
 * reversal with a small, deterministic right turn, then use the usual slew.
 */
function updateHeading(dog: Dog, dt: number): void {
  const speed = dog.velocity.magnitude();
  if (speed <= DOG_HEADING_MIN_SPEED) return;

  const inv = 1 / speed;
  const dx = dog.velocity.x * inv;
  const dz = dog.velocity.z * inv;

  let k = DOG_TURN_RATE * dt;
  if (k > 1) k = 1;

  if (dog.heading.x * dx + dog.heading.z * dz < -0.999999) {
    const hx = dog.heading.x;
    dog.heading.x += dog.heading.z * k;
    dog.heading.z -= hx * k;
    dog.heading.normalize();
    return;
  }

  dog.heading.x += (dx - dog.heading.x) * k;
  dog.heading.z += (dz - dog.heading.z) * k;
  dog.heading.normalize();
  if (dog.heading.magnitude() < 0.5) dog.heading.set(dx, dz);
}

/**
 * Ambient grazing drift. herd's replacement for sds's `updateAmbientMotion`,
 * which derived a wander angle from the animation clock and applied it with
 * cos/sin. Both are banned on the tick path, so the direction is a rejection
 * sampled unit vector from the shared tick rng, held for a fixed number of
 * ticks. This is the only rng consumer in the tick; without it the damping term
 * settles a still flock into a frozen blob within a couple of seconds.
 */
function applyAmbientDrift(sheep: Sheep, rng: Rng): void {
  const speed = sheep.velocity.magnitude();
  if (speed > SHEEP_MAX_SPEED_PER_TICK * AMBIENT_SPEED_FRACTION) return;

  sheep.wanderTicks -= 1;
  if (sheep.wanderTicks <= 0) {
    let wx = 0;
    let wz = 0;
    let lenSq = 0;
    do {
      wx = rng() * 2 - 1;
      wz = rng() * 2 - 1;
      lenSq = wx * wx + wz * wz;
    } while (lenSq > 1 || lenSq < 1e-6);
    const inv = 1 / Math.sqrt(lenSq);
    sheep.wanderX = wx * inv;
    sheep.wanderZ = wz * inv;
    sheep.wanderTicks = AMBIENT_WANDER_TICKS;
  }

  const strength =
    SHEEP_MAX_FORCE *
    (speed < SHEEP_MAX_SPEED_PER_TICK * AMBIENT_IDLE_FRACTION
      ? AMBIENT_STRENGTH_IDLE
      : AMBIENT_STRENGTH_MOVING);
  sheep.acceleration.x += sheep.wanderX * strength;
  sheep.acceleration.z += sheep.wanderZ * strength;
}

/**
 * Advance the sim by exactly one fixed 60 Hz tick.
 *
 * @param state mutated in place and returned
 * @param inputs one entry per dog, by index. Missing entries idle.
 * @param rng REQUIRED seeded stream, shared by every entity in this tick.
 *   Derive it with `createTickRng(seed)`; there is no default (spec/02).
 */
export function step(state: SimState, inputs: readonly PlayerInputs[], rng: Rng): SimState {
  const dt = FIXED_DT;
  const { field, sheep, dogs, penBarrier } = state;
  const bounds = field.bounds;
  const gate = field.gate;
  const gateX = gate.position.x;
  const gateZ = gate.position.z;
  const gateHalf = gate.width / 2;

  // --- 1. dogs ------------------------------------------------------------
  for (let i = 0; i < dogs.length; i++) {
    const dog = dogs[i]!;
    const input = inputs[i] ?? IDLE_INPUT;

    if (dog.barkCooldownTicks > 0) dog.barkCooldownTicks -= 1;

    // sds gated the sprint on movement as well as on stamina; updateStamina
    // applies the same test internally, so the two agree by construction.
    const isMoving = dog.velocity.magnitude() > 0.1;
    const stamina = updateStamina(dog, input.sprint, dt, DOG_STAMINA);
    dog.sprinting = stamina.isConsuming && isMoving;

    const maxSpeed = dog.sprinting ? DOG_SPRINT_SPEED : DOG_MAX_SPEED;
    _dogAccel.maxSpeed = maxSpeed;
    _dogTarget.set(input.direction.x, input.direction.z);
    // Partial stick/thumb travel gives precise walking near the flock. Keep
    // unit/digital input on the exact existing full-speed arithmetic path.
    const intentLength = _dogTarget.magnitude();
    const effort = intentLength >= 0.9999 ? 1 : intentLength;
    _dogTarget.normalize().multiply(maxSpeed * effort);
    applyAcceleration(dog, _dogTarget, dt, _dogAccel);

    dog.position.x += dog.velocity.x * dt;
    dog.position.z += dog.velocity.z * dt;

    updateHeading(dog, dt);

    // --- 2. bark ----------------------------------------------------------
    if (input.bark && dog.barkCooldownTicks === 0) {
      startBarkSteering(sheep, dog.position, dog.heading, SHEEP_BARK);
      dog.barkCooldownTicks = BARK_COOLDOWN_TICKS;
    }
  }

  // --- 3. sheep -----------------------------------------------------------
  _active.length = 0;
  for (let i = 0; i < sheep.length; i++) {
    const s = sheep[i]!;
    if (s.state === 'active') _active.push(s);
  }

  for (let i = 0; i < _active.length; i++) {
    const s = _active[i]!;

    const neighbors = getNeighbors(s, _active, SHEEP_PERCEPTION_RADIUS);
    s.acceleration.add(calculateFlockingForce(s, neighbors, SHEEP_FLOCKING));

    // Co-op rule (spec/02): sheep flee all dogs equally. No owner, no weight.
    for (let d = 0; d < dogs.length; d++) {
      const flee = calculateFlee(
        s,
        dogs[d]!.position,
        SHEEP_FLEE_RADIUS,
        SHEEP_MAX_SPEED_PER_TICK,
        SHEEP_MAX_FORCE,
      );
      if (flee.magnitude() > 0) s.acceleration.add(flee);
    }

    tickBarkSteering(s);

    // The fence force is suppressed inside the gate passage slot, so a sheep
    // being pushed at the opening is not shoved back off it.
    const inGatePassage =
      s.position.x >= gateX - gateHalf &&
      s.position.x <= gateX + gateHalf &&
      s.position.z >= gateZ - GATE_PASSAGE_DEPTH &&
      s.position.z <= gateZ + GATE_PASSAGE_DEPTH;
    if (!inGatePassage) {
      s.acceleration.add(calculateBoundaryAvoidanceWithGate(s, bounds, gate, SHEEP_BOUNDARY));
    }

    applyAmbientDrift(s, rng);

    updateMovement(s, dt, SHEEP_MOVEMENT);

    // --- 4. dog bodies ----------------------------------------------------
    resolveDogSheepCollisions(s, dogs);
  }

  // --- 5. sheep bodies ----------------------------------------------------
  resolveSheepSheepCollisions(sheep, {
    scratch: state.collisionScratch,
    bounds,
  });

  // --- 6. pen ------------------------------------------------------------
  // `null` dog: the single-dog branch inside update() keeps one inside-flag,
  // which cannot serve co-op. Every dog goes through containDog with its own
  // memory instead, including the solo case, so there is one path.
  const pennedCount = penBarrier.update(sheep, null, true, dt);
  for (let i = 0; i < dogs.length; i++) {
    const dog = dogs[i]!;
    penBarrier.containDog(dog.position, true, dog.penMemory);
  }

  // --- 7. perimeter -------------------------------------------------------
  _fallback.set(field.spawn.center.x, field.spawn.center.z);
  for (let i = 0; i < _active.length; i++) {
    const s = _active[i]!;
    // A sheep the barrier retired this tick is inside the pen, which is
    // outside the perimeter rect: leave it alone.
    if (s.state !== 'active') continue;
    s.position = applyHardBoundaryConstraints(s, bounds, gate, HARD_BOUNDARY);
    validateEntityState(s, _fallback);
  }
  for (let i = 0; i < dogs.length; i++) {
    const dog = dogs[i]!;
    if (!dog.penMemory.inside) {
      dog.position = applyHardBoundaryConstraints(dog, bounds, gate, HARD_BOUNDARY);
    }
    validateEntityState(dog, _fallback);
  }

  // --- 8. lifecycle -------------------------------------------------------
  state.pennedCount = pennedCount;
  state.completed = pennedCount === sheep.length;
  state.tick += 1;

  return state;
}
