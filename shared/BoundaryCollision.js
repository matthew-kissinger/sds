import { Vector2D } from './Vector2D.js';

/**
 * Pure boundary and collision detection functions
 * Stateless and deterministic - no external dependencies
 */

/**
 * Calculate boundary avoidance force for standard boundaries
 * @param {Object} entity - Entity with position and velocity
 * @param {Object} bounds - Boundary definition {minX, maxX, minZ, maxZ}
 * @param {Object} config - Boundary configuration
 * @returns {Vector2D} - Boundary avoidance force
 */
export function calculateBoundaryAvoidance(entity, bounds, config = {}) {
    const {
        margin = 10,
        maxSpeed = 1.5,
        maxForce = 0.05,
        forceMultiplier = 1.5
    } = config;
    
    const steer = new Vector2D(0, 0);
    const position = entity.position;
    
    // Calculate distances to boundaries
    const distToMinX = position.x - bounds.minX;
    const distToMaxX = bounds.maxX - position.x;
    const distToMinZ = position.z - bounds.minZ;
    const distToMaxZ = bounds.maxZ - position.z;
    
    // Apply repulsion force based on proximity to boundary
    if (distToMinX < margin) {
        const force = (margin - distToMinX) / margin;
        steer.x = maxSpeed * force * 1.2;
    } else if (distToMaxX < margin) {
        const force = (margin - distToMaxX) / margin;
        steer.x = -maxSpeed * force * 1.2;
    }
    
    if (distToMinZ < margin) {
        const force = (margin - distToMinZ) / margin;
        steer.z = maxSpeed * force * 1.2;
    } else if (distToMaxZ < margin) {
        const force = (margin - distToMaxZ) / margin;
        steer.z = -maxSpeed * force * 1.2;
    }
    
    if (steer.magnitude() > 0) {
        steer.normalize();
        steer.multiply(maxSpeed * forceMultiplier);
        steer.subtract(entity.velocity);
        steer.limit(maxForce * 2.5);
    }
    
    return steer;
}

/**
 * Calculate boundary avoidance force that excludes gate area
 * @param {Object} entity - Entity with position and velocity
 * @param {Object} bounds - Boundary definition
 * @param {Object} gate - Gate definition {position, width}
 * @param {Object} config - Configuration
 * @returns {Vector2D} - Boundary avoidance force
 */
export function calculateBoundaryAvoidanceWithGate(entity, bounds, gate, config = {}) {
    const {
        margin = 3,
        maxSpeed = 0.1,
        maxForce = 0.02
    } = config;
    
    const steer = new Vector2D(0, 0);
    const position = entity.position;
    
    const distToMinX = position.x - bounds.minX;
    const distToMaxX = bounds.maxX - position.x;
    const distToMinZ = position.z - bounds.minZ;
    const distToMaxZ = bounds.maxZ - position.z;
    
    if (distToMinX < margin) {
        const force = (margin - distToMinX) / margin;
        steer.x = maxSpeed * force * 1.2;
    } else if (distToMaxX < margin) {
        const force = (margin - distToMaxX) / margin;
        steer.x = -maxSpeed * force * 1.2;
    }
    
    if (distToMinZ < margin) {
        const force = (margin - distToMinZ) / margin;
        steer.z = maxSpeed * force * 1.2;
    } else if (distToMaxZ < margin) {
        // Only check for gate if gate exists
        const nearGateX = gate ? Math.abs(position.x - gate.position.x) < gate.width / 2 + 2 : false;
        if (!nearGateX) {
            const force = (margin - distToMaxZ) / margin;
            steer.z = -maxSpeed * force * 1.2;
        }
    }
    
    if (steer.magnitude() > 0) {
        steer.normalize();
        steer.multiply(maxSpeed * 1.5);
        steer.subtract(entity.velocity);
        steer.limit(maxForce * 2.5);
    }
    
    return steer;
}

/**
 * Apply hard boundary constraints to entity position
 * @param {Object} entity - Entity with position
 * @param {Object} bounds - Boundary definition
 * @param {Object} gate - Optional gate definition
 * @param {Object} config - Configuration
 * @returns {Vector2D} - Constrained position
 */
export function applyHardBoundaryConstraints(entity, bounds, gate = null, config = {}) {
    const {
        margin = 0.2,
        allowGatePassage = false
    } = config;
    
    const position = entity.position.clone();
    
    // Check if entity is in the gate area
    const inGateArea = allowGatePassage && gate && 
        Math.abs(position.x) <= gate.width / 2 && 
        position.z >= gate.position.z - 2 && 
        position.z <= gate.position.z + 2;
    
    if (!inGateArea) {
        // Apply hard constraints
        position.x = Math.max(bounds.minX + margin, Math.min(bounds.maxX - margin, position.x));
        position.z = Math.max(bounds.minZ + margin, Math.min(bounds.maxZ - margin, position.z));
    } else if (gate) {
        // In gate area - only constrain X to gate width, allow Z movement
        position.x = Math.max(-gate.width / 2, Math.min(gate.width / 2, position.x));
    }
    
    return position;
}

/**
 * Check if entity is within a specific area
 * @param {Vector2D} position - Entity position
 * @param {Object} area - Area definition {minX, maxX, minZ, maxZ}
 * @returns {boolean} - Whether entity is within area
 */
export function isWithinArea(position, area) {
    return position.x >= area.minX && 
           position.x <= area.maxX && 
           position.z >= area.minZ && 
           position.z <= area.maxZ;
}

/**
 * Check if entity has passed through a gate
 * @param {Vector2D} position - Entity position
 * @param {Vector2D} velocity - Entity velocity
 * @param {Object} gatePassageZone - Gate passage zone definition
 * @returns {boolean} - Whether entity has passed through gate
 */
export function checkGatePassage(position, velocity, gatePassageZone) {
    const inGateX = position.x >= gatePassageZone.minX && 
                   position.x <= gatePassageZone.maxX;
    const inGateZ = position.z >= gatePassageZone.minZ && 
                   position.z <= gatePassageZone.maxZ;
    
    // Must be in gate area and moving forward (positive Z direction)
    return inGateX && inGateZ && velocity.z > 0;
}

/**
 * Calculate distance to nearest boundary
 * @param {Vector2D} position - Entity position
 * @param {Object} bounds - Boundary definition
 * @returns {Object} - Distance info {distance, side, isNear}
 */
export function getDistanceToNearestBoundary(position, bounds) {
    const distances = {
        left: position.x - bounds.minX,
        right: bounds.maxX - position.x,
        bottom: position.z - bounds.minZ,
        top: bounds.maxZ - position.z
    };
    
    // Find minimum distance and corresponding side
    let minDistance = Infinity;
    let nearestSide = null;
    
    for (const [side, distance] of Object.entries(distances)) {
        if (distance < minDistance) {
            minDistance = distance;
            nearestSide = side;
        }
    }
    
    return {
        distance: minDistance,
        side: nearestSide,
        isNear: minDistance < 10, // Within warning distance
        distances: distances
    };
}

/**
 * Generate random position within bounds
 * @param {Object} bounds - Boundary definition
 * @param {Object} config - Configuration {margin, exclusionZones}
 * @returns {Vector2D} - Random position within bounds
 */
export function generateRandomPositionInBounds(bounds, config = {}) {
    const {
        margin = 5,
        exclusionZones = [],
        maxAttempts = 50
    } = config;
    
    const availableBounds = {
        minX: bounds.minX + margin,
        maxX: bounds.maxX - margin,
        minZ: bounds.minZ + margin,
        maxZ: bounds.maxZ - margin
    };
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const x = availableBounds.minX + Math.random() * (availableBounds.maxX - availableBounds.minX);
        const z = availableBounds.minZ + Math.random() * (availableBounds.maxZ - availableBounds.minZ);
        const position = new Vector2D(x, z);
        
        // Check if position is in any exclusion zone
        let inExclusionZone = false;
        for (const zone of exclusionZones) {
            if (isWithinArea(position, zone)) {
                inExclusionZone = true;
                break;
            }
        }
        
        if (!inExclusionZone) {
            return position;
        }
    }
    
    // Fallback to center if no valid position found
    return new Vector2D(
        (availableBounds.minX + availableBounds.maxX) / 2,
        (availableBounds.minZ + availableBounds.maxZ) / 2
    );
} 