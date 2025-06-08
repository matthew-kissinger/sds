/**
 * Shared Simulation Logic
 * Pure functions with no dependencies on DOM/Three.js
 * 
 * This module exports all the core simulation algorithms that can be used
 * by both client-side and server-side code for consistent behavior.
 */

// Import Vector2D for use in utility functions
import { Vector2D } from './Vector2D.js';

// Core data structures
export { Vector2D } from './Vector2D.js';

// Flocking behavior algorithms
export {
    calculateFlockingForce,
    calculateSeparation,
    calculateAlignment,
    calculateCohesion,
    calculateSeek,
    calculateFlee,
    getNeighbors
} from './FlockingAlgorithms.js';

// Movement and physics calculations
export {
    updateMovement,
    applyAcceleration,
    updateStamina,
    interpolatePosition,
    interpolateRotation,
    validateEntityState
} from './MovementPhysics.js';

// Boundary and collision detection
export {
    calculateBoundaryAvoidance,
    calculateBoundaryAvoidanceWithGate,
    applyHardBoundaryConstraints,
    isWithinArea,
    checkGatePassage,
    getDistanceToNearestBoundary,
    generateRandomPositionInBounds
} from './BoundaryCollision.js';

// Game state validation and management
export {
    updateSheepRetirements,
    checkGameCompletion,
    validateGameState,
    calculateGameProgress,
    generateInitialSheepPositions,
    resetGameState,
    calculateHerdingEffectiveness
} from './GameStateValidation.js';

/**
 * Utility function to create a standard boid configuration
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} - Boid configuration
 */
export function createBoidConfig(overrides = {}) {
    return {
        maxSpeed: 1.5,
        maxForce: 0.05,
        perceptionRadius: 5,
        separationDistance: 2.0,
        separationWeight: 1.5,
        alignmentWeight: 1.0,
        cohesionWeight: 1.0,
        ...overrides
    };
}

/**
 * Utility function to create a standard movement configuration
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} - Movement configuration
 */
export function createMovementConfig(overrides = {}) {
    return {
        maxSpeed: 1.5,
        dampingFactor: 0.98,
        velocitySmoothing: 0.85,
        minMovementThreshold: 0.001,
        acceleration: 40,
        deceleration: 30,
        ...overrides
    };
}

/**
 * Utility function to create a standard boundary configuration
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} - Boundary configuration
 */
export function createBoundaryConfig(overrides = {}) {
    return {
        margin: 10,
        maxSpeed: 1.5,
        maxForce: 0.05,
        forceMultiplier: 1.5,
        ...overrides
    };
}

/**
 * Utility function to create a standard game state structure
 * @param {Object} config - Game configuration
 * @returns {Object} - Initial game state
 */
export function createGameState(config = {}) {
    const {
        totalSheep = 200,
        bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
        gatePosition = { x: 0, z: 100 },
        gateWidth = 8,
        pastureConfig = { centerZ: 115, minX: -30, maxX: 30, minZ: 102, maxZ: 130 }
    } = config;

    return {
        bounds,
        gate: {
            position: new Vector2D(gatePosition.x, gatePosition.z),
            width: gateWidth,
            height: 4,
            passageZone: {
                minX: -gateWidth / 2,
                maxX: gateWidth / 2,
                minZ: gatePosition.z - 2,
                maxZ: gatePosition.z + 2
            }
        },
        pasture: pastureConfig,
        params: {
            speed: 0.1,
            cohesion: 1.0,
            separationDistance: 2.0
        },
        sheep: [],
        sheepdog: null,
        sheepRetired: 0,
        totalSheep,
        gameCompleted: false,
        gameActive: false
    };
} 