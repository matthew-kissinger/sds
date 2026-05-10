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

// Cycle 34 Phase 2: multi-stage objective state machine (round-up → drive),
// authoritative in the Worker, mirrored client-side via the re-export shim
// at js/gamestate/objective.js.
export { createObjective, refreshObjective, tickObjective, isCorralOpen } from './objective.js';

// getRequiredSheep helper kept exported so the Worker's snapshot code can
// resolve per-mode counts without re-importing from ObjectiveLogic.
export { getRequiredSheep } from './ObjectiveLogic.js';

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
    updateSheepCorralRetirements,
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
 * Synthesise a `Boundary` discriminated union from a scene def. If the scene
 * already has `scene.boundary`, it wins (it's a superset). If only the legacy
 * `bounds` field is present, wrap it as `{ kind: 'rect', ...bounds }`.
 *
 * Caller may pass an override `boundsOverride` (legacy `bounds` shape) which
 * takes priority — this preserves the existing `createGameState({ bounds })`
 * call signature.
 *
 * @param {Object} scene
 * @param {Object} [boundsOverride]
 * @returns {import('./scenes/types.js').Boundary}
 */
export function resolveBoundary(scene, boundsOverride) {
    if (boundsOverride) {
        return { kind: 'rect', ...boundsOverride };
    }
    if (scene.boundary) {
        return scene.boundary;
    }
    if (scene.bounds) {
        return { kind: 'rect', ...scene.bounds };
    }
    throw new Error(`Scene "${scene.id}" has neither boundary nor bounds`);
}

/**
 * Derive legacy rect bounds from a Boundary for code paths that haven't
 * migrated yet (renderer fall-through, prop placement, debug HUD). For
 * islands we return the bounding box of the radius — close enough for
 * non-sim-critical uses; sim code should consume `boundary` directly.
 *
 * @param {import('./scenes/types.js').Boundary} boundary
 * @returns {import('./scenes/types.js').Bounds}
 */
export function boundaryToBounds(boundary) {
    if (boundary.kind === 'rect') {
        return { minX: boundary.minX, maxX: boundary.maxX, minZ: boundary.minZ, maxZ: boundary.maxZ };
    }
    if (boundary.kind === 'island') {
        const r = boundary.radius;
        return { minX: boundary.center.x - r, maxX: boundary.center.x + r, minZ: boundary.center.z - r, maxZ: boundary.center.z + r };
    }
    throw new Error(`Unknown boundary.kind: ${boundary.kind}`);
}

/**
 * Utility function to create a standard game state structure
 * @param {Object} config - Game configuration
 * @returns {Object} - Initial game state
 */
export function createGameState(config = {}) {
    const { sceneId = DEFAULT_SCENE_ID, totalSheep, bounds, gatePosition, gateWidth, pastureConfig } = config;
    const scene = loadScene(sceneId);

    const effectiveBoundary = resolveBoundary(scene, bounds);
    const effectiveBounds = boundaryToBounds(effectiveBoundary);
    const effectiveGatePos = gatePosition ?? scene.gate?.position ?? null;
    const effectiveGateWidth = gateWidth ?? scene.gate?.width ?? null;
    const effectivePasture = pastureConfig ?? scene.pasture ?? null;
    const effectiveTotalSheep = totalSheep ?? scene.sheepSpawn.count;

    const gate = effectiveGatePos
        ? {
            position: new Vector2D(effectiveGatePos.x, effectiveGatePos.z),
            width: effectiveGateWidth,
            height: 4,
            passageZone: {
                minX: -effectiveGateWidth / 2,
                maxX: effectiveGateWidth / 2,
                minZ: effectiveGatePos.z - 2,
                maxZ: effectiveGatePos.z + 2
            }
        }
        : null;

    return {
        boundary: effectiveBoundary,
        bounds: effectiveBounds,
        gate,
        pasture: effectivePasture,
        corral: scene.corral ?? null,
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