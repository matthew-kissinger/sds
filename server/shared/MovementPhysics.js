import { Vector2D } from './Vector2D.js';

/**
 * Pure movement and physics calculation functions
 * Stateless and deterministic - no external dependencies
 */

/**
 * Update entity position and velocity based on forces and constraints
 * @param {Object} entity - Entity with position, velocity, acceleration
 * @param {number} deltaTime - Time step
 * @param {Object} config - Movement configuration
 * @returns {Object} - Updated entity state
 */
export function updateMovement(entity, deltaTime = 0.016, config = {}) {
    const {
        maxSpeed = 1.5,
        dampingFactor = 0.98,
        velocitySmoothing = 0.85,
        minMovementThreshold = 0.001
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
        facingDirection: entity.velocity.magnitude() > minMovementThreshold ? entity.velocity.angle() : null
    };
}

/**
 * Apply smooth acceleration/deceleration to an entity
 * @param {Object} entity - Entity with velocity
 * @param {Vector2D} targetVelocity - Desired velocity
 * @param {number} deltaTime - Time step
 * @param {Object} config - Acceleration configuration
 * @returns {Vector2D} - Updated velocity
 */
export function applyAcceleration(entity, targetVelocity, deltaTime, config = {}) {
    const {
        acceleration = 40,
        deceleration = 30,
        maxSpeed = 15
    } = config;
    
    // Determine if we're accelerating or decelerating
    const isAccelerating = targetVelocity.magnitude() > 0;
    const accelerationRate = isAccelerating ? acceleration : deceleration;
    
    // Calculate velocity change
    const velocityDiff = targetVelocity.clone().subtract(entity.velocity);
    const velocityChange = velocityDiff.clone().multiply(accelerationRate * deltaTime);
    
    // Apply velocity change
    entity.velocity.add(velocityChange);
    
    // Limit to max speed
    if (entity.velocity.magnitude() > maxSpeed) {
        entity.velocity.normalize().multiply(maxSpeed);
    }
    
    return entity.velocity.clone();
}

/**
 * Update stamina based on activity
 * @param {Object} entity - Entity with stamina properties
 * @param {boolean} isConsuming - Whether stamina is being consumed
 * @param {number} deltaTime - Time step
 * @param {Object} config - Stamina configuration
 * @returns {Object} - Updated stamina info
 */
export function updateStamina(entity, isConsuming, deltaTime, config = {}) {
    const {
        maxStamina = 100,
        drainRate = 30,
        regenRate = 20,
        minStaminaToConsume = 10
    } = config;
    
    const isMoving = entity.velocity && entity.velocity.magnitude() > 0.1;
    
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
        isConsuming: isConsuming && canConsume
    };
}

/**
 * Calculate interpolated position for smooth rendering
 * @param {Vector2D} currentPosition - Current physics position
 * @param {Vector2D} renderPosition - Current render position
 * @param {number} deltaTime - Time step
 * @param {number} interpolationSpeed - Speed of interpolation
 * @returns {Vector2D} - New interpolated render position
 */
export function interpolatePosition(currentPosition, renderPosition, deltaTime, interpolationSpeed = 8.0) {
    const positionDiff = currentPosition.clone().subtract(renderPosition);
    const interpolationAmount = Math.min(1.0, interpolationSpeed * deltaTime);
    
    return renderPosition.clone().add(positionDiff.multiply(interpolationAmount));
}

/**
 * Calculate interpolated rotation for smooth rendering
 * @param {number} targetRotation - Target rotation in radians
 * @param {number} currentRotation - Current render rotation
 * @param {number} deltaTime - Time step
 * @param {number} rotationSpeed - Speed of rotation interpolation
 * @returns {number} - New interpolated rotation
 */
export function interpolateRotation(targetRotation, currentRotation, deltaTime, rotationSpeed = 12.0) {
    // Handle angle wrapping for smooth rotation
    let angleDiff = targetRotation - currentRotation;
    
    // Normalize angle difference to [-π, π]
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

/**
 * Validate and clamp entity values to prevent NaN/Infinity
 * @param {Object} entity - Entity to validate
 * @param {Vector2D} fallbackPosition - Safe fallback position
 * @returns {Object} - Validation results
 */
export function validateEntityState(entity, fallbackPosition = new Vector2D(0, 0)) {
    const issues = [];
    
    // Check velocity
    if (isNaN(entity.velocity.x) || isNaN(entity.velocity.z) || 
        !isFinite(entity.velocity.x) || !isFinite(entity.velocity.z)) {
        entity.velocity.set(0, 0);
        issues.push('velocity_nan');
    }
    
    // Check position
    if (isNaN(entity.position.x) || isNaN(entity.position.z) ||
        !isFinite(entity.position.x) || !isFinite(entity.position.z)) {
        entity.position = fallbackPosition.clone();
        entity.velocity.set(0, 0);
        issues.push('position_nan');
    }
    
    // Check acceleration if present
    if (entity.acceleration) {
        if (isNaN(entity.acceleration.x) || isNaN(entity.acceleration.z) ||
            !isFinite(entity.acceleration.x) || !isFinite(entity.acceleration.z)) {
            entity.acceleration.set(0, 0);
            issues.push('acceleration_nan');
        }
    }
    
    return {
        isValid: issues.length === 0,
        issues: issues
    };
} 