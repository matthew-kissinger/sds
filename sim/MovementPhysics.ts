// SPDX-License-Identifier: AGPL-3.0-or-later
// Lifted from sds/shared/MovementPhysics.js; same license and copyright holder.
//
// Pure movement and physics calculation functions.
// Stateless and deterministic - no external dependencies, no rng.
//
// Arithmetic is preserved operation-for-operation from the sds source: the
// damping multiply happens after the limit, the smoothing lerp keeps its
// `prev * s + cur * (1 - s)` form, and the micro-movement threshold compares
// the SMOOTHED magnitude before the position add. Do not reorder or simplify;
// the trace fixtures are bit-compares.

import { Vector2D } from './Vector2D';

/**
 * Per-tick allocation pool for `applyAcceleration`. These two module-level
 * scratch vectors replace the `targetVelocity.clone()` and `velocityDiff.clone()`
 * temporaries in the acceleration lerp. The math is byte-identical:
 * `_velocityDiff.set(targetVelocity.x, targetVelocity.z)` holds the same
 * components a `clone()` would before the same `.subtract`, and
 * `_velocityChange` does the same on the diff before the same `.multiply`.
 * Single-threaded by contract; each call fully consumes both scratches (folding
 * `_velocityChange` into `entity.velocity`) before returning, so no state leaks
 * across calls. The returned `entity.velocity.clone()` is deliberately left
 * un-pooled so callers keep a non-aliased velocity snapshot.
 */
const _velocityDiff = new Vector2D(0, 0);
const _velocityChange = new Vector2D(0, 0);

export interface MovementEntity {
  position: Vector2D;
  velocity: Vector2D;
  acceleration: Vector2D;
}

export interface MovementConfig {
  maxSpeed?: number;
  /** Bleeds off velocity every tick so steering forces cannot ring. */
  dampingFactor?: number;
  /** Weight of the PREVIOUS velocity in the smoothing lerp; kills per-tick jitter. */
  velocitySmoothing?: number;
  /** Below this smoothed magnitude the entity is parked outright, not crawled. */
  minMovementThreshold?: number;
}

export interface MovementResult {
  position: Vector2D;
  velocity: Vector2D;
  speed: number;
}

/**
 * Update entity position and velocity based on forces and constraints.
 *
 * sds also returned a `facingDirection` here, computed with `Vector2D.angle()`
 * (Math.atan2) on the tick path, which AGENTS.md rule 5 bans. Nothing in herd's
 * sim reads a facing angle: the dog carries a unit heading vector slewed
 * without trig, and sheep facing is derived in the presentation layer
 * (FlockSim.ts), where atan2 is allowed because its result never re-enters sim
 * state. The field is gone rather than unread (hard rule 10).
 *
 * @param _deltaTime - Accepted and ignored, exactly as in sds: velocities here
 * are already per-tick deltas, so nothing in the body reads it. The parameter
 * slot is kept so call sites port over unchanged.
 */
export function updateMovement(
  entity: MovementEntity,
  _deltaTime: number = 0.016,
  config: MovementConfig = {}
): MovementResult {
  const {
    maxSpeed = 1.5,
    dampingFactor = 0.98,
    velocitySmoothing = 0.85,
    minMovementThreshold = 0.001,
  } = config;

  // Store previous velocity for smoothing
  const previousVelocity = entity.velocity.clone();

  // Update velocity with acceleration
  entity.velocity.add(entity.acceleration);
  entity.velocity.limit(maxSpeed);

  // Apply velocity damping to reduce oscillations
  entity.velocity.multiply(dampingFactor);

  // Smooth velocity with previous velocity to reduce jittering
  const smoothedVelocity = previousVelocity
    .multiply(velocitySmoothing)
    .add(entity.velocity.clone().multiply(1 - velocitySmoothing));

  // Only apply movement if above threshold to prevent micro-movements
  if (smoothedVelocity.magnitude() > minMovementThreshold) {
    entity.velocity = smoothedVelocity;
    entity.position.add(entity.velocity);
  } else {
    // Stop micro-movements
    entity.velocity.multiply(0);
  }

  // Reset acceleration for next frame
  entity.acceleration.multiply(0);

  return {
    position: entity.position.clone(),
    velocity: entity.velocity.clone(),
    speed: entity.velocity.magnitude(),
  };
}

export interface AcceleratingEntity {
  velocity: Vector2D;
}

export interface AccelerationConfig {
  acceleration?: number;
  deceleration?: number;
  maxSpeed?: number;
}

/**
 * Apply smooth acceleration/deceleration to an entity.
 * Deceleration is deliberately gentler than acceleration so stops coast.
 * @returns a non-aliased clone of the updated velocity
 */
export function applyAcceleration(
  entity: AcceleratingEntity,
  targetVelocity: Vector2D,
  deltaTime: number,
  config: AccelerationConfig = {}
): Vector2D {
  const { acceleration = 40, deceleration = 30, maxSpeed = 15 } = config;

  // Determine if we're accelerating or decelerating
  const isAccelerating = targetVelocity.magnitude() > 0;
  const accelerationRate = isAccelerating ? acceleration : deceleration;

  // Calculate velocity change
  const velocityDiff = _velocityDiff
    .set(targetVelocity.x, targetVelocity.z)
    .subtract(entity.velocity);
  const velocityChange = _velocityChange
    .set(velocityDiff.x, velocityDiff.z)
    .multiply(accelerationRate * deltaTime);

  // Apply velocity change
  entity.velocity.add(velocityChange);

  // Limit to max speed
  if (entity.velocity.magnitude() > maxSpeed) {
    entity.velocity.normalize().multiply(maxSpeed);
  }

  return entity.velocity.clone();
}

export interface StaminaEntity {
  stamina: number;
  velocity?: Vector2D | null;
}

export interface StaminaConfig {
  maxStamina?: number;
  drainRate?: number;
  regenRate?: number;
  /** Hysteresis floor: below this the sprint is cut and cannot restart. */
  minStaminaToConsume?: number;
}

export interface StaminaResult {
  current: number;
  max: number;
  percentage: number;
  canConsume: boolean;
  isConsuming: boolean;
}

/**
 * Update stamina based on activity.
 * Idle regen is deliberately double the moving regen so standing still is the
 * fast way back to a sprint.
 */
export function updateStamina(
  entity: StaminaEntity,
  isConsuming: boolean,
  deltaTime: number,
  config: StaminaConfig = {}
): StaminaResult {
  const { maxStamina = 100, drainRate = 30, regenRate = 20, minStaminaToConsume = 10 } = config;

  // sds writes `entity.velocity && entity.velocity.magnitude() > 0.1`; the
  // `!= null` form has identical truthiness and narrows for strict mode.
  const isMoving = entity.velocity != null && entity.velocity.magnitude() > 0.1;

  if (isConsuming && isMoving && entity.stamina >= minStaminaToConsume) {
    // Drain stamina
    entity.stamina = Math.max(0, entity.stamina - drainRate * deltaTime);
  } else {
    // Regenerate stamina - faster when idle
    const currentRegenRate = isMoving ? regenRate : regenRate * 2;
    entity.stamina = Math.min(maxStamina, entity.stamina + currentRegenRate * deltaTime);
  }

  // Force stop consuming if stamina is depleted
  const canConsume = entity.stamina >= minStaminaToConsume;

  return {
    current: entity.stamina,
    max: maxStamina,
    percentage: (entity.stamina / maxStamina) * 100,
    canConsume: canConsume,
    isConsuming: isConsuming && canConsume,
  };
}

/**
 * Calculate interpolated position for smooth rendering.
 * Render-side only: this runs off the sim tick and never writes sim state.
 */
export function interpolatePosition(
  currentPosition: Vector2D,
  renderPosition: Vector2D,
  deltaTime: number,
  interpolationSpeed: number = 8.0
): Vector2D {
  const positionDiff = currentPosition.clone().subtract(renderPosition);
  const interpolationAmount = Math.min(1.0, interpolationSpeed * deltaTime);

  return renderPosition.clone().add(positionDiff.multiply(interpolationAmount));
}

/**
 * Calculate interpolated rotation for smooth rendering.
 * Render-side only: this runs off the sim tick and never writes sim state.
 * The while-loop wrapping (rather than a modulo) is kept verbatim.
 */
export function interpolateRotation(
  targetRotation: number,
  currentRotation: number,
  deltaTime: number,
  rotationSpeed: number = 12.0
): number {
  // Handle angle wrapping for smooth rotation
  let angleDiff = targetRotation - currentRotation;

  // Normalize angle difference to [-PI, PI]
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  // Apply rotation interpolation
  const rotationInterpolationAmount = Math.min(1.0, rotationSpeed * deltaTime);
  let newRotation = currentRotation + angleDiff * rotationInterpolationAmount;

  // Normalize final angle
  while (newRotation > Math.PI) newRotation -= 2 * Math.PI;
  while (newRotation < -Math.PI) newRotation += 2 * Math.PI;

  return newRotation;
}

export interface ValidatableEntity {
  position: Vector2D;
  velocity: Vector2D;
  acceleration?: Vector2D | null;
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
}

/**
 * Validate and clamp entity values to prevent NaN/Infinity.
 * A poisoned position also zeroes velocity, so one bad tick cannot keep
 * launching the entity after the fallback snap.
 */
export function validateEntityState(
  entity: ValidatableEntity,
  fallbackPosition: Vector2D = new Vector2D(0, 0)
): ValidationResult {
  const issues: string[] = [];

  // Check velocity
  if (
    isNaN(entity.velocity.x) ||
    isNaN(entity.velocity.z) ||
    !isFinite(entity.velocity.x) ||
    !isFinite(entity.velocity.z)
  ) {
    entity.velocity.set(0, 0);
    issues.push('velocity_nan');
  }

  // Check position
  if (
    isNaN(entity.position.x) ||
    isNaN(entity.position.z) ||
    !isFinite(entity.position.x) ||
    !isFinite(entity.position.z)
  ) {
    entity.position = fallbackPosition.clone();
    entity.velocity.set(0, 0);
    issues.push('position_nan');
  }

  // Check acceleration if present
  if (entity.acceleration) {
    if (
      isNaN(entity.acceleration.x) ||
      isNaN(entity.acceleration.z) ||
      !isFinite(entity.acceleration.x) ||
      !isFinite(entity.acceleration.z)
    ) {
      entity.acceleration.set(0, 0);
      issues.push('acceleration_nan');
    }
  }

  return {
    isValid: issues.length === 0,
    issues: issues,
  };
}
