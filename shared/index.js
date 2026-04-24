/**
 * Shared Simulation Logic
 * Pure functions with no dependencies on DOM/Three.js
 * 
 * This module exports all the core simulation algorithms that can be used
 * by both client-side and server-side code for consistent behavior.
 */

// Import Vector2D for use in utility functions
import { Vector2D } from './Vector2D.js';
import { loadScene, DEFAULT_SCENE_ID } from './scenes/index.js';

// Core data structures
export { Vector2D } from './Vector2D.js';

// Scene registry (data-driven biomes)
export { loadScene, listScenes, DEFAULT_SCENE_ID } from './scenes/index.js';

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
    calculateBoundaryAvoidanceWithMultipleGates,
    applyHardBoundaryConstraints,
    applyHardBoundaryConstraintsWithMultipleGates,
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
    generateCompetitiveBalancedSpawns,
    calculateBalancedSpawnClusters,
    resetGameState,
    calculateHerdingEffectiveness,
    generateCompetitiveGateLayout,
    assignGatesToPlayers,
    updateCompetitiveSheepRetirements,
    checkCompetitiveCompletion,
    validateCompetitiveGameState,
    createCompetitiveGameState
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
    const { sceneId = DEFAULT_SCENE_ID, totalSheep, bounds, gatePosition, gateWidth, pastureConfig } = config;
    const scene = loadScene(sceneId);

    const effectiveBounds = bounds ?? scene.bounds;
    const effectiveGatePos = gatePosition ?? scene.gate.position;
    const effectiveGateWidth = gateWidth ?? scene.gate.width;
    const effectivePasture = pastureConfig ?? scene.pasture;
    const effectiveTotalSheep = totalSheep ?? scene.sheepSpawn.count;

    return {
        bounds: effectiveBounds,
        gate: {
            position: new Vector2D(effectiveGatePos.x, effectiveGatePos.z),
            width: effectiveGateWidth,
            height: 4,
            passageZone: {
                minX: -effectiveGateWidth / 2,
                maxX: effectiveGateWidth / 2,
                minZ: effectiveGatePos.z - 2,
                maxZ: effectiveGatePos.z + 2
            }
        },
        pasture: effectivePasture,
        params: {
            speed: 0.1,
            cohesion: 1.0,
            separationDistance: 2.0
        },
        sheep: [],
        sheepdog: null,
        sheepRetired: 0,
        totalSheep: effectiveTotalSheep,
        gameCompleted: false,
        gameActive: false
    };
}