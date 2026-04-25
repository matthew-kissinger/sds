import { Vector2D } from './Vector2D.js';

/**
 * Pure boundary and collision detection functions.
 * Stateless and deterministic — no external dependencies.
 *
 * Cycle 5 introduced a discriminated `Boundary` (rect | island). The public
 * dispatchers accept EITHER a legacy `bounds` object `{minX, maxX, minZ, maxZ}`
 * OR a `Boundary` `{kind, ...}` and route internally on `kind`. Existing
 * call sites passing legacy `bounds` keep working unchanged — the rect path
 * is byte-identical to pre-Cycle-5 behaviour, which protects sim baselines.
 *
 * @typedef {import('./scenes/types.js').Boundary} Boundary
 */

/**
 * Normalise an arg that may be a legacy `bounds` rect object or a tagged
 * `Boundary`. Always returns a tagged Boundary.
 * @param {Object} boundsOrBoundary
 * @returns {Boundary}
 */
function asBoundary(boundsOrBoundary) {
    if (boundsOrBoundary && boundsOrBoundary.kind) {
        return boundsOrBoundary;
    }
    // Legacy: assume rect bounds
    return {
        kind: 'rect',
        minX: boundsOrBoundary.minX,
        maxX: boundsOrBoundary.maxX,
        minZ: boundsOrBoundary.minZ,
        maxZ: boundsOrBoundary.maxZ
    };
}

/**
 * Cached rect view of an island for code paths that need a bounding box
 * (debug HUD, prop placement). For rect boundaries returns the rect directly.
 * @param {Boundary} boundary
 */
function boundaryAsRect(boundary) {
    if (boundary.kind === 'rect') {
        return boundary;
    }
    const r = boundary.radius;
    return {
        minX: boundary.center.x - r,
        maxX: boundary.center.x + r,
        minZ: boundary.center.z - r,
        maxZ: boundary.center.z + r
    };
}

/**
 * Calculate boundary avoidance force for standard boundaries.
 * Accepts legacy `bounds` or new `Boundary`.
 * @param {Object} entity - Entity with position and velocity
 * @param {Object} boundsOrBoundary - Bounds rect or Boundary discriminated union
 * @param {Object} config - Boundary configuration
 * @returns {Vector2D} - Boundary avoidance force
 */
export function calculateBoundaryAvoidance(entity, boundsOrBoundary, config = {}) {
    const boundary = asBoundary(boundsOrBoundary);
    if (boundary.kind === 'island') {
        return calculateIslandAvoidance(entity, boundary, config);
    }
    return calculateRectAvoidance(entity, boundary, config);
}

/**
 * Rect-path implementation. Math preserved byte-identical to pre-Cycle-5.
 */
function calculateRectAvoidance(entity, bounds, config = {}) {
    const {
        margin = 10,
        maxSpeed = 1.5,
        maxForce = 0.05,
        forceMultiplier = 1.5
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
 * Island-path implementation. Radial smoothstep inward force inside the
 * falloff zone; zero force inside the safe zone. Hard clamp at radius
 * is applied separately by applyHardBoundaryConstraints.
 *
 *   safe zone:   d < radius - falloff       → force = 0
 *   falloff:     d ∈ [radius - falloff, radius] → smoothstep ramp inward
 *   outside:     d > radius                 → force at maximum (clamp does the rest)
 */
function calculateIslandAvoidance(entity, boundary, config = {}) {
    const {
        margin = 10,
        maxSpeed = 1.5,
        maxForce = 0.05,
        forceMultiplier = 1.5
    } = config;

    const steer = new Vector2D(0, 0);
    const position = entity.position;
    const center = boundary.center;
    const radius = boundary.radius;
    const falloff = boundary.falloff;

    const dx = position.x - center.x;
    const dz = position.z - center.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const safeRadius = radius - falloff;

    if (dist <= safeRadius) {
        return steer;
    }

    // Smoothstep t in [0, 1] across the falloff zone, saturating outside
    const tRaw = (dist - safeRadius) / falloff;
    const t = Math.min(1, Math.max(0, tRaw));
    const force = t * t * (3 - 2 * t);

    if (dist > 1e-6) {
        // Inward unit vector
        const inv = 1 / dist;
        steer.x = -dx * inv * maxSpeed * force * 1.2;
        steer.z = -dz * inv * maxSpeed * force * 1.2;
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
 * Calculate boundary avoidance force that excludes gate area.
 * Accepts legacy `bounds` or new `Boundary`. Island branch ignores `gate`
 * (islands don't have gates as boundary openings — gates if present are
 * inside the island).
 * @param {Object} entity - Entity with position and velocity
 * @param {Object} boundsOrBoundary - Bounds rect or Boundary discriminated union
 * @param {Object} gate - Gate definition {position, width} (rect only)
 * @param {Object} config - Configuration
 * @returns {Vector2D} - Boundary avoidance force
 */
export function calculateBoundaryAvoidanceWithGate(entity, boundsOrBoundary, gate, config = {}) {
    const boundary = asBoundary(boundsOrBoundary);
    if (boundary.kind === 'island') {
        // Island: same radial avoidance, no gate carve-out
        return calculateIslandAvoidance(entity, boundary, {
            margin: config.margin ?? 3,
            maxSpeed: config.maxSpeed ?? 0.1,
            maxForce: config.maxForce ?? 0.02,
            forceMultiplier: 1.5
        });
    }

    // Rect path — preserved byte-identical.
    const bounds = boundary;
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
        const nearSouthGateX = gate && gate.position.z <= bounds.minZ + 5 ?
            Math.abs(position.x - gate.position.x) < gate.width / 2 + 2 : false;
        if (!nearSouthGateX) {
            const force = (margin - distToMinZ) / margin;
            steer.z = maxSpeed * force * 1.2;
        }
    } else if (distToMaxZ < margin) {
        const nearNorthGateX = gate && gate.position.z >= bounds.maxZ - 5 ?
            Math.abs(position.x - gate.position.x) < gate.width / 2 + 2 : false;
        if (!nearNorthGateX) {
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
 * Calculate boundary avoidance force that excludes multiple gate areas (competitive mode)
 * @param {Object} entity - Entity with position and velocity
 * @param {Object} bounds - Boundary definition
 * @param {Array} competitiveGates - Array of gate configurations for competitive mode
 * @param {Object} config - Configuration
 * @returns {Vector2D} - Boundary avoidance force
 */
export function calculateBoundaryAvoidanceWithMultipleGates(entity, bounds, competitiveGates, config = {}) {
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
    
    // Helper function to check if entity is near any gate on a specific boundary
    const isNearGateOnBoundary = (boundaryType) => {
        if (!competitiveGates || !Array.isArray(competitiveGates)) {
            return false;
        }
        
        for (const gate of competitiveGates) {
            // Check based on gate direction and boundary type
            let isNearGate = false;
            
            switch (boundaryType) {
                case 'west':
                    if (gate.direction === 'west' && gate.position.x <= bounds.minX + 5) {
                        // For west gates, check if entity is aligned with gate - exact gate width
                        isNearGate = Math.abs(position.z - gate.position.z) < gate.width / 2;
                    }
                    break;
                case 'east':
                    if (gate.direction === 'east' && gate.position.x >= bounds.maxX - 5) {
                        // For east gates, check if entity is aligned with gate - exact gate width
                        isNearGate = Math.abs(position.z - gate.position.z) < gate.width / 2;
                    }
                    break;
                case 'south':
                    if (gate.direction === 'south' && gate.position.z <= bounds.minZ + 5) {
                        // For south gates, check if entity is aligned with gate - exact gate width
                        isNearGate = Math.abs(position.x - gate.position.x) < gate.width / 2;
                    }
                    break;
                case 'north':
                    if (gate.direction === 'north' && gate.position.z >= bounds.maxZ - 5) {
                        // For north gates, check if entity is aligned with gate - exact gate width
                        isNearGate = Math.abs(position.x - gate.position.x) < gate.width / 2;
                    }
                    break;
            }
            
            if (isNearGate) {
                return true;
            }
        }
        
        return false;
    };
    
    // Apply boundary forces, checking for gates at each boundary
    if (distToMinX < margin) {
        if (!isNearGateOnBoundary('west')) {
            const force = (margin - distToMinX) / margin;
            steer.x = maxSpeed * force * 1.2;
        }
    } else if (distToMaxX < margin) {
        if (!isNearGateOnBoundary('east')) {
            const force = (margin - distToMaxX) / margin;
            steer.x = -maxSpeed * force * 1.2;
        }
    }
    
    if (distToMinZ < margin) {
        if (!isNearGateOnBoundary('south')) {
            const force = (margin - distToMinZ) / margin;
            steer.z = maxSpeed * force * 1.2;
        }
    } else if (distToMaxZ < margin) {
        if (!isNearGateOnBoundary('north')) {
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
 * Apply hard boundary constraints to entity position.
 * Accepts legacy `bounds` or new `Boundary`. Island branch clamps radially.
 * @param {Object} entity - Entity with position
 * @param {Object} boundsOrBoundary - Bounds rect or Boundary discriminated union
 * @param {Object} gate - Optional gate definition (rect only)
 * @param {Object} config - Configuration
 * @returns {Vector2D} - Constrained position
 */
export function applyHardBoundaryConstraints(entity, boundsOrBoundary, gate = null, config = {}) {
    const boundary = asBoundary(boundsOrBoundary);
    if (boundary.kind === 'island') {
        return applyHardBoundaryConstraintsIsland(entity, boundary, config);
    }

    // Rect path — preserved byte-identical.
    const bounds = boundary;
    const {
        margin = 0.2,
        allowGatePassage = false
    } = config;

    const position = entity.position.clone();

    const inGateArea = allowGatePassage && gate &&
        Math.abs(position.x) <= gate.width / 2 &&
        position.z >= gate.position.z - 2 &&
        position.z <= gate.position.z + 2;

    if (!inGateArea) {
        position.x = Math.max(bounds.minX + margin, Math.min(bounds.maxX - margin, position.x));
        position.z = Math.max(bounds.minZ + margin, Math.min(bounds.maxZ - margin, position.z));
    } else if (gate) {
        position.x = Math.max(-gate.width / 2, Math.min(gate.width / 2, position.x));
    }

    return position;
}

/**
 * Hard radial clamp at island boundary `radius` (with safety margin).
 * Entities cannot leave the island.
 */
function applyHardBoundaryConstraintsIsland(entity, boundary, config = {}) {
    const { margin = 0.2 } = config;
    const position = entity.position.clone();
    const center = boundary.center;
    const maxR = boundary.radius - margin;

    const dx = position.x - center.x;
    const dz = position.z - center.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > maxR && dist > 1e-6) {
        const scale = maxR / dist;
        position.x = center.x + dx * scale;
        position.z = center.z + dz * scale;
    }

    return position;
}

/**
 * Apply hard boundary constraints with multiple gates (competitive mode)
 * @param {Object} entity - Entity with position
 * @param {Object} bounds - Boundary definition
 * @param {Array} competitiveGates - Array of gate configurations
 * @param {Object} config - Configuration
 * @returns {Vector2D} - Constrained position
 */
export function applyHardBoundaryConstraintsWithMultipleGates(entity, bounds, competitiveGates = [], config = {}) {
    const {
        margin = 0.2,
        allowGatePassage = false
    } = config;
    
    let position = entity.position.clone();

    // Check if entity is in any gate area
    let inAnyGateArea = false;
    let gateConstraints = null;
    
    if (allowGatePassage && competitiveGates && Array.isArray(competitiveGates)) {
        for (const gate of competitiveGates) {
            let inGateArea = false;
            
            // Check gate area based on gate direction - simple and exact
            switch (gate.direction) {
                case 'north':
                    // For north gates at top boundary
                    inGateArea = Math.abs(position.x - gate.position.x) <= gate.width / 2 && 
                               position.z >= bounds.maxZ - 2;
                    break;
                    
                case 'south':
                    // For south gates at bottom boundary
                    inGateArea = Math.abs(position.x - gate.position.x) <= gate.width / 2 && 
                               position.z <= bounds.minZ + 2;
                    break;
                    
                case 'east':
                    // For east gates at right boundary
                    inGateArea = Math.abs(position.z - gate.position.z) <= gate.width / 2 && 
                               position.x >= bounds.maxX - 2;
                    break;
                    
                case 'west':
                    // For west gates at left boundary
                    inGateArea = Math.abs(position.z - gate.position.z) <= gate.width / 2 && 
                               position.x <= bounds.minX + 2;
                    break;
                    
                case 'southeast':
                case 'southwest':
                    // For diagonal gates, check both dimensions
                    const distanceToGate = Math.sqrt(
                        Math.pow(position.x - gate.position.x, 2) + 
                        Math.pow(position.z - gate.position.z, 2)
                    );
                    inGateArea = distanceToGate <= gate.width / 2;
                    break;
                    
                default:
                    // Fallback to north/south style check
                    inGateArea = Math.abs(position.x - gate.position.x) <= gate.width / 2 && 
                               Math.abs(position.z - gate.position.z) <= 2;
                    break;
            }
            
            if (inGateArea) {
                inAnyGateArea = true;
                
                // Store gate constraints based on direction - exact gate width
                switch (gate.direction) {
                    case 'north':
                    case 'south':
                        // Constrain X to exact gate width
                        gateConstraints = {
                            minX: gate.position.x - gate.width / 2,
                            maxX: gate.position.x + gate.width / 2,
                            skipZConstraint: true // Don't constrain Z in gate area
                        };
                        break;
                        
                    case 'east':
                    case 'west':
                        // Constrain Z to exact gate width
                        gateConstraints = {
                            minZ: gate.position.z - gate.width / 2,
                            maxZ: gate.position.z + gate.width / 2,
                            skipXConstraint: true // Don't constrain X in gate area
                        };
                        break;
                        
                    case 'southeast':
                    case 'southwest':
                        // For diagonal gates, use exact gate radius
                        gateConstraints = {
                            center: gate.position,
                            radius: gate.width / 2
                        };
                        break;
                }
                
                break;
            }
        }
    }
    
    if (!inAnyGateArea) {
        // Apply hard constraints
        position.x = Math.max(bounds.minX + margin, Math.min(bounds.maxX - margin, position.x));
        position.z = Math.max(bounds.minZ + margin, Math.min(bounds.maxZ - margin, position.z));
    } else if (gateConstraints) {
        // Apply gate-specific constraints
        if (gateConstraints.minX !== undefined) {
            position.x = Math.max(gateConstraints.minX, Math.min(gateConstraints.maxX, position.x));
        }
        if (gateConstraints.minZ !== undefined) {
            position.z = Math.max(gateConstraints.minZ, Math.min(gateConstraints.maxZ, position.z));
        }
        if (gateConstraints.center) {
            // For diagonal gates, constrain to radius
            const distanceToCenter = position.distanceTo(gateConstraints.center);
            if (distanceToCenter > gateConstraints.radius) {
                const direction = position.clone().subtract(gateConstraints.center).normalize();
                position = gateConstraints.center.clone().add(direction.multiply(gateConstraints.radius));
            }
        }
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
 * @param {string} gateDirection - Direction of the gate ('north', 'south', 'east', 'west', etc.)
 * @returns {boolean} - Whether entity has passed through gate
 */
export function checkGatePassage(position, velocity, gatePassageZone, gateDirection = 'north') {
    const inGateX = position.x >= gatePassageZone.minX && 
                   position.x <= gatePassageZone.maxX;
    const inGateZ = position.z >= gatePassageZone.minZ && 
                   position.z <= gatePassageZone.maxZ;
    
    // Must be in gate area and moving in the correct direction based on gate orientation
    if (!inGateX || !inGateZ) {
        return false;
    }
    
    // Check velocity based on gate direction
    switch (gateDirection) {
        case 'north':
            return velocity.z > 0; // Moving north (positive Z)
        case 'south':
            return velocity.z < 0; // Moving south (negative Z)
        case 'east':
            return velocity.x > 0; // Moving east (positive X)
        case 'west':
            return velocity.x < 0; // Moving west (negative X)
        case 'southeast':
            // For diagonal gates, check both X and Z components
            return velocity.x > 0 && velocity.z < 0;
        case 'southwest':
            return velocity.x < 0 && velocity.z < 0;
        default:
            // Default to north for backward compatibility
            console.warn(`Unknown gate direction: ${gateDirection}, defaulting to north`);
            return velocity.z > 0;
    }
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