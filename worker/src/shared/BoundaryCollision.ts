import { Vector2D } from './Vector2D';

/**
 * Pure boundary and collision detection functions
 * Stateless and deterministic - no external dependencies
 */

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Gate {
  position: Vector2D;
  width: number;
  direction?: string;
  passageZone?: Bounds;
}

export interface BoundaryConfig {
  margin?: number;
  maxSpeed?: number;
  maxForce?: number;
  forceMultiplier?: number;
}

export interface EntityWithPosition {
  position: Vector2D;
  velocity: Vector2D;
}

/**
 * Calculate boundary avoidance force for standard boundaries
 */
export function calculateBoundaryAvoidance(entity: EntityWithPosition, bounds: Bounds, config: BoundaryConfig = {}): Vector2D {
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
 * Calculate boundary avoidance force that excludes gate area
 */
export function calculateBoundaryAvoidanceWithGate(entity: EntityWithPosition, bounds: Bounds, gate: Gate | null, config: BoundaryConfig = {}): Vector2D {
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
    const nearSouthGateX = gate && gate.position.z <= bounds.minZ + 5
      ? Math.abs(position.x - gate.position.x) < gate.width / 2 + 2
      : false;
    if (!nearSouthGateX) {
      const force = (margin - distToMinZ) / margin;
      steer.z = maxSpeed * force * 1.2;
    }
  } else if (distToMaxZ < margin) {
    const nearNorthGateX = gate && gate.position.z >= bounds.maxZ - 5
      ? Math.abs(position.x - gate.position.x) < gate.width / 2 + 2
      : false;
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
 */
export function calculateBoundaryAvoidanceWithMultipleGates(entity: EntityWithPosition, bounds: Bounds, competitiveGates: Gate[], config: BoundaryConfig = {}): Vector2D {
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

  const isNearGateOnBoundary = (boundaryType: string): boolean => {
    if (!competitiveGates || !Array.isArray(competitiveGates)) {
      return false;
    }

    for (const gate of competitiveGates) {
      let isNearGate = false;

      switch (boundaryType) {
        case 'west':
          if (gate.direction === 'west' && gate.position.x <= bounds.minX + 5) {
            isNearGate = Math.abs(position.z - gate.position.z) < gate.width / 2;
          }
          break;
        case 'east':
          if (gate.direction === 'east' && gate.position.x >= bounds.maxX - 5) {
            isNearGate = Math.abs(position.z - gate.position.z) < gate.width / 2;
          }
          break;
        case 'south':
          if (gate.direction === 'south' && gate.position.z <= bounds.minZ + 5) {
            isNearGate = Math.abs(position.x - gate.position.x) < gate.width / 2;
          }
          break;
        case 'north':
          if (gate.direction === 'north' && gate.position.z >= bounds.maxZ - 5) {
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

export interface HardBoundaryConfig {
  margin?: number;
  allowGatePassage?: boolean;
}

/**
 * Apply hard boundary constraints to entity position
 */
export function applyHardBoundaryConstraints(entity: EntityWithPosition, bounds: Bounds, gate: Gate | null = null, config: HardBoundaryConfig = {}): Vector2D {
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

interface GateConstraints {
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
  center?: Vector2D;
  radius?: number;
  skipZConstraint?: boolean;
  skipXConstraint?: boolean;
}

/**
 * Apply hard boundary constraints with multiple gates (competitive mode)
 */
export function applyHardBoundaryConstraintsWithMultipleGates(entity: EntityWithPosition, bounds: Bounds, competitiveGates: Gate[] = [], config: HardBoundaryConfig = {}): Vector2D {
  const {
    margin = 0.2,
    allowGatePassage = false
  } = config;

  let position = entity.position.clone();

  let inAnyGateArea = false;
  let gateConstraints: GateConstraints | null = null;

  if (allowGatePassage && competitiveGates && Array.isArray(competitiveGates)) {
    for (const gate of competitiveGates) {
      let inGateArea = false;

      switch (gate.direction) {
        case 'north':
          inGateArea = Math.abs(position.x - gate.position.x) <= gate.width / 2 &&
            position.z >= bounds.maxZ - 2;
          break;
        case 'south':
          inGateArea = Math.abs(position.x - gate.position.x) <= gate.width / 2 &&
            position.z <= bounds.minZ + 2;
          break;
        case 'east':
          inGateArea = Math.abs(position.z - gate.position.z) <= gate.width / 2 &&
            position.x >= bounds.maxX - 2;
          break;
        case 'west':
          inGateArea = Math.abs(position.z - gate.position.z) <= gate.width / 2 &&
            position.x <= bounds.minX + 2;
          break;
        case 'southeast':
        case 'southwest': {
          const distanceToGate = Math.sqrt(
            Math.pow(position.x - gate.position.x, 2) +
            Math.pow(position.z - gate.position.z, 2)
          );
          inGateArea = distanceToGate <= gate.width / 2;
          break;
        }
        default:
          inGateArea = Math.abs(position.x - gate.position.x) <= gate.width / 2 &&
            Math.abs(position.z - gate.position.z) <= 2;
          break;
      }

      if (inGateArea) {
        inAnyGateArea = true;

        switch (gate.direction) {
          case 'north':
          case 'south':
            gateConstraints = {
              minX: gate.position.x - gate.width / 2,
              maxX: gate.position.x + gate.width / 2,
              skipZConstraint: true
            };
            break;
          case 'east':
          case 'west':
            gateConstraints = {
              minZ: gate.position.z - gate.width / 2,
              maxZ: gate.position.z + gate.width / 2,
              skipXConstraint: true
            };
            break;
          case 'southeast':
          case 'southwest':
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
    position.x = Math.max(bounds.minX + margin, Math.min(bounds.maxX - margin, position.x));
    position.z = Math.max(bounds.minZ + margin, Math.min(bounds.maxZ - margin, position.z));
  } else if (gateConstraints) {
    if (gateConstraints.minX !== undefined && gateConstraints.maxX !== undefined) {
      position.x = Math.max(gateConstraints.minX, Math.min(gateConstraints.maxX, position.x));
    }
    if (gateConstraints.minZ !== undefined && gateConstraints.maxZ !== undefined) {
      position.z = Math.max(gateConstraints.minZ, Math.min(gateConstraints.maxZ, position.z));
    }
    if (gateConstraints.center && gateConstraints.radius !== undefined) {
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
 */
export function isWithinArea(position: Vector2D, area: Bounds): boolean {
  return position.x >= area.minX &&
    position.x <= area.maxX &&
    position.z >= area.minZ &&
    position.z <= area.maxZ;
}

/**
 * Check if entity has passed through a gate
 */
export function checkGatePassage(position: Vector2D, velocity: Vector2D, gatePassageZone: Bounds, gateDirection = 'north'): boolean {
  const inGateX = position.x >= gatePassageZone.minX &&
    position.x <= gatePassageZone.maxX;
  const inGateZ = position.z >= gatePassageZone.minZ &&
    position.z <= gatePassageZone.maxZ;

  if (!inGateX || !inGateZ) {
    return false;
  }

  switch (gateDirection) {
    case 'north':
      return velocity.z > 0;
    case 'south':
      return velocity.z < 0;
    case 'east':
      return velocity.x > 0;
    case 'west':
      return velocity.x < 0;
    case 'southeast':
      return velocity.x > 0 && velocity.z < 0;
    case 'southwest':
      return velocity.x < 0 && velocity.z < 0;
    default:
      console.warn(`Unknown gate direction: ${gateDirection}, defaulting to north`);
      return velocity.z > 0;
  }
}

export interface BoundaryDistanceResult {
  distance: number;
  side: string | null;
  isNear: boolean;
  distances: Record<string, number>;
}

/**
 * Calculate distance to nearest boundary
 */
export function getDistanceToNearestBoundary(position: Vector2D, bounds: Bounds): BoundaryDistanceResult {
  const distances: Record<string, number> = {
    left: position.x - bounds.minX,
    right: bounds.maxX - position.x,
    bottom: position.z - bounds.minZ,
    top: bounds.maxZ - position.z
  };

  let minDistance = Infinity;
  let nearestSide: string | null = null;

  for (const [side, distance] of Object.entries(distances)) {
    if (distance < minDistance) {
      minDistance = distance;
      nearestSide = side;
    }
  }

  return {
    distance: minDistance,
    side: nearestSide,
    isNear: minDistance < 10,
    distances
  };
}

export interface RandomPositionConfig {
  margin?: number;
  exclusionZones?: Bounds[];
  maxAttempts?: number;
}

/**
 * Generate random position within bounds
 */
export function generateRandomPositionInBounds(bounds: Bounds, config: RandomPositionConfig = {}): Vector2D {
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

  return new Vector2D(
    (availableBounds.minX + availableBounds.maxX) / 2,
    (availableBounds.minZ + availableBounds.maxZ) / 2
  );
}
