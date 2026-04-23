import { Vector2D } from './Vector2D';

/**
 * Pure movement and physics calculation functions
 * Stateless and deterministic - no external dependencies
 */

export interface MovingEntity {
  position: Vector2D;
  velocity: Vector2D;
  acceleration: Vector2D;
  stamina?: number;
}

export interface MovementConfig {
  maxSpeed?: number;
  dampingFactor?: number;
  velocitySmoothing?: number;
  minMovementThreshold?: number;
}

export interface MovementResult {
  position: Vector2D;
  velocity: Vector2D;
  speed: number;
  facingDirection: number | null;
}

/**
 * Update entity position and velocity based on forces and constraints
 */
export function updateMovement(entity: MovingEntity, deltaTime = 0.016, config: MovementConfig = {}): MovementResult {
  const {
    maxSpeed = 1.5,
    dampingFactor = 0.98,
    velocitySmoothing = 0.85,
    minMovementThreshold = 0.001
  } = config;

  const previousVelocity = entity.velocity.clone();

  entity.velocity.add(entity.acceleration);
  entity.velocity.limit(maxSpeed);
  entity.velocity.multiply(dampingFactor);

  const smoothedVelocity = previousVelocity
    .multiply(velocitySmoothing)
    .add(entity.velocity.clone().multiply(1 - velocitySmoothing));

  if (smoothedVelocity.magnitude() > minMovementThreshold) {
    entity.velocity = smoothedVelocity;
    entity.position.add(entity.velocity);
  } else {
    entity.velocity.multiply(0);
  }

  entity.acceleration.multiply(0);

  return {
    position: entity.position.clone(),
    velocity: entity.velocity.clone(),
    speed: entity.velocity.magnitude(),
    facingDirection: entity.velocity.magnitude() > minMovementThreshold ? entity.velocity.angle() : null
  };
}

export interface AccelerationConfig {
  acceleration?: number;
  deceleration?: number;
  maxSpeed?: number;
}

/**
 * Apply smooth acceleration/deceleration to an entity
 */
export function applyAcceleration(entity: MovingEntity, targetVelocity: Vector2D, deltaTime: number, config: AccelerationConfig = {}): Vector2D {
  const {
    acceleration = 40,
    deceleration = 30,
    maxSpeed = 15
  } = config;

  const isAccelerating = targetVelocity.magnitude() > 0;
  const accelerationRate = isAccelerating ? acceleration : deceleration;

  const velocityDiff = targetVelocity.clone().subtract(entity.velocity);
  const velocityChange = velocityDiff.clone().multiply(accelerationRate * deltaTime);

  entity.velocity.add(velocityChange);

  if (entity.velocity.magnitude() > maxSpeed) {
    entity.velocity.normalize().multiply(maxSpeed);
  }

  return entity.velocity.clone();
}

export interface StaminaConfig {
  maxStamina?: number;
  drainRate?: number;
  regenRate?: number;
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
 * Update stamina based on activity
 */
export function updateStamina(entity: MovingEntity & { stamina: number }, isConsuming: boolean, deltaTime: number, config: StaminaConfig = {}): StaminaResult {
  const {
    maxStamina = 100,
    drainRate = 30,
    regenRate = 20,
    minStaminaToConsume = 10
  } = config;

  const isMoving = entity.velocity && entity.velocity.magnitude() > 0.1;

  if (isConsuming && isMoving && entity.stamina >= minStaminaToConsume) {
    entity.stamina = Math.max(0, entity.stamina - drainRate * deltaTime);
  } else {
    const currentRegenRate = isMoving ? regenRate : regenRate * 2;
    entity.stamina = Math.min(maxStamina, entity.stamina + currentRegenRate * deltaTime);
  }

  const canConsume = entity.stamina >= minStaminaToConsume;

  return {
    current: entity.stamina,
    max: maxStamina,
    percentage: (entity.stamina / maxStamina) * 100,
    canConsume,
    isConsuming: isConsuming && canConsume
  };
}

/**
 * Calculate interpolated position for smooth rendering
 */
export function interpolatePosition(currentPosition: Vector2D, renderPosition: Vector2D, deltaTime: number, interpolationSpeed = 8.0): Vector2D {
  const positionDiff = currentPosition.clone().subtract(renderPosition);
  const interpolationAmount = Math.min(1.0, interpolationSpeed * deltaTime);

  return renderPosition.clone().add(positionDiff.multiply(interpolationAmount));
}

/**
 * Calculate interpolated rotation for smooth rendering
 */
export function interpolateRotation(targetRotation: number, currentRotation: number, deltaTime: number, rotationSpeed = 12.0): number {
  let angleDiff = targetRotation - currentRotation;

  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  const rotationInterpolationAmount = Math.min(1.0, rotationSpeed * deltaTime);
  let newRotation = currentRotation + angleDiff * rotationInterpolationAmount;

  while (newRotation > Math.PI) newRotation -= 2 * Math.PI;
  while (newRotation < -Math.PI) newRotation += 2 * Math.PI;

  return newRotation;
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
}

/**
 * Validate and clamp entity values to prevent NaN/Infinity
 */
export function validateEntityState(entity: MovingEntity, fallbackPosition = new Vector2D(0, 0)): ValidationResult {
  const issues: string[] = [];

  if (isNaN(entity.velocity.x) || isNaN(entity.velocity.z) ||
      !isFinite(entity.velocity.x) || !isFinite(entity.velocity.z)) {
    entity.velocity.set(0, 0);
    issues.push('velocity_nan');
  }

  if (isNaN(entity.position.x) || isNaN(entity.position.z) ||
      !isFinite(entity.position.x) || !isFinite(entity.position.z)) {
    entity.position = fallbackPosition.clone();
    entity.velocity.set(0, 0);
    issues.push('position_nan');
  }

  if (entity.acceleration) {
    if (isNaN(entity.acceleration.x) || isNaN(entity.acceleration.z) ||
        !isFinite(entity.acceleration.x) || !isFinite(entity.acceleration.z)) {
      entity.acceleration.set(0, 0);
      issues.push('acceleration_nan');
    }
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
