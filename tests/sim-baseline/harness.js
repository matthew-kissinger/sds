// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Minimal tick-loop harness for the SDS server simulation.
 *
 * Why this exists:
 *   server/GameSimulation.js has too much ceremony to import directly in a test
 *   (RoomManager, leaderboard, broadcast callbacks, console noise, timers). The
 *   behaviors the Cycle-2 retry is most at risk of regressing live inside a
 *   small set of shared/ primitives plus three inline routines in GameSimulation:
 *
 *     - updateSheepMovementClientStyle (sheep velocity integration, uses DELTA_TIME*60)
 *     - updateSheepdogMovementTimeStyle (dog damping/velocity smoothing/stop threshold)
 *     - The rotation smoothing and clientPosition interpolation blocks
 *
 * This harness faithfully mirrors those routines in pure JS at a configurable
 * tick rate so we can capture reference traces at 60Hz and later compare them
 * against a 20Hz retry implementation.
 *
 * DO NOT let this drift from GameSimulation.js. If the server changes, update
 * this and regenerate fixtures (see README). The whole point is that these two
 * stay bit-identical at 60Hz.
 */

import {
    Vector2D,
    calculateFlockingForce,
    calculateFlee,
    getNeighbors,
    applyAcceleration,
    updateStamina,
    calculateBoundaryAvoidanceWithGate,
    applyHardBoundaryConstraints,
    updateSheepCorralRetirements,
    updateCompetitiveSheepRetirements,
    createCompetitiveGameState,
    calculateBoundaryAvoidanceWithMultipleGates,
    applyHardBoundaryConstraintsWithMultipleGates,
    validateEntityState,
    createGameState,
    createBoidConfig,
    createMovementConfig,
    tickBarkSteering,
    loadScene,
    createObjective,
    tickObjective,
    isCorralOpen,
    resolveDogSheepCollisions,
    createSheepCollisionScratch,
    resolveSheepSheepCollisions
} from '../../shared/index.js';

const islandCollisionScratch = createSheepCollisionScratch();
const coopCollisionScratch = createSheepCollisionScratch();
const competitiveCollisionScratch = createSheepCollisionScratch();

/**
 * Small, fast, reproducible PRNG (Mulberry32). We need this because
 * shared/GameStateValidation.js generateInitialSheepPositions uses Math.random()
 * and Node ships no seedable RNG. The retry must use the SAME PRNG if it wants
 * to compare against this fixture.
 *
 * The constants are from the public-domain mulberry32 reference; do not change.
 */
export function mulberry32(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Monkey-patch Math.random with a seeded PRNG for the duration of fn().
 * Always restores, even on throw. Returns whatever fn() returned.
 */
export function withSeededRandom(seed, fn) {
    const rng = mulberry32(seed);
    const original = Math.random;
    Math.random = rng;
    try {
        return fn();
    } finally {
        Math.random = original;
    }
}

/**
 * Build a small flock of sheep at deterministic positions. Does NOT use
 * Math.random so the caller doesn't need to seed. Used for traces where we
 * want zero dependency on PRNG choices.
 */
export function makeDeterministicFlock(count, centerX = -20, centerZ = -20, spacing = 1.5) {
    const sheep = [];
    // Lay sheep out on a regular grid inside a square cluster. Order matters
    // because the flocking neighbor loop iterates this array.
    const side = Math.ceil(Math.sqrt(count));
    for (let i = 0; i < count; i++) {
        const col = i % side;
        const row = Math.floor(i / side);
        sheep.push(makeSheep(
            i,
            centerX + (col - side / 2) * spacing,
            centerZ + (row - side / 2) * spacing
        ));
    }
    return sheep;
}

export function makeSheep(id, x, z) {
    return {
        id,
        position: new Vector2D(x, z),
        velocity: new Vector2D(0, 0),
        acceleration: new Vector2D(0, 0),
        hasPassedGate: false,
        isRetiring: false,
        retirementTarget: null,
        state: 0,
        fleeRadius: 8,
        gateAttraction: 0.5,
        assignedGate: null,
        animationPhase: 0,
        facingDirection: 0
    };
}

export function makeSheepdog(id, x, z, overrides = {}) {
    return {
        id,
        dogType: 'jep',
        position: new Vector2D(x, z),
        velocity: new Vector2D(0, 0),
        acceleration: new Vector2D(0, 0),
        maxSpeed: 30,
        sprintSpeed: 50,
        maxStamina: 100,
        stamina: 100,
        isSprinting: false,
        rotation: 0,
        targetRotation: 0,
        inputSequence: 0,
        lastInputTime: 0,
        pendingInputs: [],
        isInterpolatingToClient: false,
        clientStopTarget: null,
        ...overrides
    };
}

export function makeCoopGameState() {
    // Cycle 25 follow-up: pin sceneId to 'field' explicitly. Sim baselines
    // exercise the gated-pasture coop case; relying on DEFAULT_SCENE_ID
    // would couple the fixtures to whatever scene is currently the
    // landing-page default.
    return createGameState({
        sceneId: 'field',
        totalSheep: 200,
        bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }
    });
}

/**
 * Cycle 34 Phase 1: build a sim state from an island scene def. Uses the
 * scene's boundary (kind: 'island') and corral verbatim. No gate or pasture
 * (islands use corral retirement instead). Used by the island-boundary and
 * corral-retirement baseline fixtures.
 *
 * @param {string} sceneId  'rolling-hills' or 'open-country'
 * @param {number} totalSheep  Sheep count for sim state
 */
export function makeIslandGameState(sceneId, totalSheep = 50) {
    const scene = loadScene(sceneId);
    return createGameState({
        sceneId,
        totalSheep
    });
}

/**
 * Cycle 34 Phase 1: per-scene boid config. Mirrors `GameSim.js:96-102` —
 * the multiplayer baseline merged with the scene's `flocking` override.
 * OC declares `perceptionRadius: 9`; RH and Field use the baseline.
 */
export function makeIslandSheepConfig(sceneId) {
    const scene = loadScene(sceneId);
    return createBoidConfig({
        maxSpeed: 0.24,
        maxForce: 0.05,
        perceptionRadius: 6,
        separationDistance: 2.5,
        ...(scene.flocking || {})
    });
}

function applyIslandCollisionPass(sheepArray, sheepdogs, gameState) {
    const sheepCollision = resolveSheepSheepCollisions(sheepArray, {
        scratch: islandCollisionScratch,
        bounds: gameState.boundary || gameState.bounds
    });
    if (sheepCollision.moved === 0) return;

    for (const index of islandCollisionScratch.movedIndices) {
        const sheep = sheepArray[index];
        resolveDogSheepCollisions(sheep, sheepdogs);
        if (!sheep.hasPassedGate && !sheep.isRetiring) {
            sheep.position = applyHardBoundaryConstraints(
                sheep,
                gameState.boundary || gameState.bounds,
                null,
                { margin: 0.5 }
            );
        }
        if (sheep.velocity.magnitude() > 0.001) {
            sheep.facingDirection = sheep.velocity.angle();
        }
        validateEntityState(sheep, new Vector2D(0, 0));
    }
}

function applyCoopCollisionPass(sheepArray, sheepdogs, gameState) {
    const sheepCollision = resolveSheepSheepCollisions(sheepArray, {
        scratch: coopCollisionScratch,
        bounds: gameState.bounds
    });
    if (sheepCollision.moved === 0) return;

    for (const index of coopCollisionScratch.movedIndices) {
        const sheep = sheepArray[index];
        resolveDogSheepCollisions(sheep, sheepdogs);
        if (!sheep.hasPassedGate && !sheep.isRetiring) {
            sheep.position = applyHardBoundaryConstraints(
                sheep,
                gameState.bounds,
                gameState.gate,
                { margin: 0.5, allowGatePassage: true }
            );
        }
        if (sheep.velocity.magnitude() > 0.001) {
            sheep.facingDirection = sheep.velocity.angle();
        }
        validateEntityState(sheep, new Vector2D(-20, -20));
    }
}

/**
 * Cycle 34 Phase 1: one tick of sheep update for an island/corral scene.
 * Mirrors `GameSimulation.updateSheep` for the corral-retirement path
 * (Rolling Hills, Open Country) without an `objective` gate. Phase 2 adds
 * the objective gate; this function deliberately runs unconditional corral
 * retirement so it stays a pure regression net for the boundary path.
 */
export function tickSheepIslandCoop(sheepArray, sheepdogs, gameState, deltaTime, sheepConfig) {
    const cfg = sheepConfig;
    const activeSheep = sheepArray.filter(s => s.state === 0);

    for (const sheep of sheepArray) {
        if (sheep.state === 1 || sheep.state === 2) {
            sheep.velocity.set(0, 0);
            sheep.acceleration.set(0, 0);
            continue;
        }

        const neighbors = getNeighbors(sheep, activeSheep, cfg.perceptionRadius);
        const flockingForce = calculateFlockingForce(sheep, neighbors, cfg);
        sheep.acceleration.add(flockingForce);

        for (const dog of sheepdogs) {
            const fleeForce = calculateFlee(
                sheep,
                dog.position,
                sheep.fleeRadius,
                cfg.maxSpeed,
                cfg.maxForce
            );
            if (fleeForce.magnitude() > 0) {
                fleeForce.multiply(1.2);
                sheep.acceleration.add(fleeForce);
            }
        }

        tickBarkSteering(sheep);

        // Island scenes have no gate, so always run boundary avoidance.
        const boundaryForce = calculateBoundaryAvoidanceWithGate(
            sheep,
            gameState.boundary || gameState.bounds,
            null,
            { margin: 4, maxSpeed: cfg.maxSpeed, maxForce: cfg.maxForce }
        );
        sheep.acceleration.add(boundaryForce);

        // === updateSheepMovementClientStyle inlined (same as tickSheepCoop) ===
        const dampingFactor = 0.98;
        const velocitySmoothing = 0.85;
        const minMovementThreshold = 0.001;

        const previousVelocity = sheep.velocity.clone();

        sheep.velocity.add(sheep.acceleration);
        sheep.velocity.limit(cfg.maxSpeed);
        sheep.velocity.multiply(dampingFactor);

        const smoothedVelocity = previousVelocity
            .multiply(velocitySmoothing)
            .add(sheep.velocity.clone().multiply(1 - velocitySmoothing));

        if (smoothedVelocity.magnitude() > minMovementThreshold) {
            sheep.velocity = smoothedVelocity;
            sheep.position.add(sheep.velocity.clone().multiply(deltaTime * 60));
        } else {
            sheep.velocity.multiply(0);
        }
        sheep.acceleration.multiply(0);

        // Cycle 56: dog<->sheep hard separation, between integration and the
        // boundary clamp (mirrors GameSim.updateSheep order).
        resolveDogSheepCollisions(sheep, sheepdogs);

        if (!sheep.hasPassedGate && !sheep.isRetiring) {
            sheep.position = applyHardBoundaryConstraints(
                sheep,
                gameState.boundary || gameState.bounds,
                null,
                { margin: 0.5 }
            );
        }

        if (sheep.velocity.magnitude() > 0.001) {
            sheep.facingDirection = sheep.velocity.angle();
        }

        validateEntityState(sheep, new Vector2D(0, 0));
    }

    applyIslandCollisionPass(sheepArray, sheepdogs, gameState);

    // Corral retirement (RH, OC). updateSheepCorralRetirements flips
    // hasPassedGate + isRetiring inline; the trace records the resulting
    // state per tick.
    if (gameState.corral) {
        updateSheepCorralRetirements(sheepArray, gameState.corral);
    }
}

export const SHEEP_CONFIG = createBoidConfig({
    maxSpeed: 0.24,
    maxForce: 0.05,
    perceptionRadius: 6,
    separationDistance: 2.5
});

export const DOG_CONFIG = createMovementConfig({
    maxSpeed: 30,
    acceleration: 80,
    deceleration: 100
});

/**
 * One tick of sheep update. Mirrors GameSimulation.updateSheep for the
 * cooperative, non-retiring case (the only case we exercise in baselines).
 *
 * Inputs
 *   sheepArray        : Array of sheep entities (all will be updated)
 *   sheepdogs         : Iterable of sheepdog entities (for flee forces)
 *   gameState         : { bounds, gate } - coop mode only
 *   deltaTime         : seconds per tick (1/60, 1/20, etc)
 */
export function tickSheepCoop(sheepArray, sheepdogs, gameState, deltaTime) {
    const activeSheep = sheepArray.filter(s => s.state === 0);

    for (const sheep of sheepArray) {
        if (sheep.state === 1 || sheep.state === 2) {
            sheep.velocity.set(0, 0);
            sheep.acceleration.set(0, 0);
            continue;
        }

        const neighbors = getNeighbors(sheep, activeSheep, SHEEP_CONFIG.perceptionRadius);
        const flockingForce = calculateFlockingForce(sheep, neighbors, SHEEP_CONFIG);
        sheep.acceleration.add(flockingForce);

        for (const dog of sheepdogs) {
            const fleeForce = calculateFlee(
                sheep,
                dog.position,
                sheep.fleeRadius,
                SHEEP_CONFIG.maxSpeed,
                SHEEP_CONFIG.maxForce
            );
            if (fleeForce.magnitude() > 0) {
                fleeForce.multiply(1.2);
                sheep.acceleration.add(fleeForce);
            }
        }

        tickBarkSteering(sheep);

        // Gate-passage-zone check - skip boundary force if in passage.
        const zone = gameState.gate.passageZone;
        const inGatePassageZone =
            sheep.position.x >= zone.minX && sheep.position.x <= zone.maxX &&
            sheep.position.z >= zone.minZ && sheep.position.z <= zone.maxZ;

        if (!inGatePassageZone) {
            const boundaryForce = calculateBoundaryAvoidanceWithGate(
                sheep,
                gameState.bounds,
                gameState.gate,
                { margin: 4, maxSpeed: SHEEP_CONFIG.maxSpeed, maxForce: SHEEP_CONFIG.maxForce }
            );
            sheep.acceleration.add(boundaryForce);
        }

        // === updateSheepMovementClientStyle inlined ===
        const maxSpeed = SHEEP_CONFIG.maxSpeed;
        const dampingFactor = 0.98;
        const velocitySmoothing = 0.85;
        const minMovementThreshold = 0.001;

        const previousVelocity = sheep.velocity.clone();

        sheep.velocity.add(sheep.acceleration);
        sheep.velocity.limit(maxSpeed);
        sheep.velocity.multiply(dampingFactor);

        const smoothedVelocity = previousVelocity
            .multiply(velocitySmoothing)
            .add(sheep.velocity.clone().multiply(1 - velocitySmoothing));

        if (smoothedVelocity.magnitude() > minMovementThreshold) {
            sheep.velocity = smoothedVelocity;
            // Matches GameSimulation.js:632 - calibrated to 60 FPS baseline
            sheep.position.add(sheep.velocity.clone().multiply(deltaTime * 60));
        } else {
            sheep.velocity.multiply(0);
        }
        sheep.acceleration.multiply(0);

        // Cycle 56: dog<->sheep hard separation, between integration and the
        // boundary clamp (mirrors GameSim.updateSheep order).
        resolveDogSheepCollisions(sheep, sheepdogs);

        if (!sheep.hasPassedGate && !sheep.isRetiring) {
            sheep.position = applyHardBoundaryConstraints(
                sheep,
                gameState.bounds,
                gameState.gate,
                { margin: 0.5, allowGatePassage: true }
            );
        }

        if (sheep.velocity.magnitude() > 0.001) {
            sheep.facingDirection = sheep.velocity.angle();
        }

        validateEntityState(sheep, new Vector2D(-20, -20));
    }

    applyCoopCollisionPass(sheepArray, sheepdogs, gameState);
}

/**
 * P0-DETTEST: build a competitive game state via the real shared/ factory.
 * Player order matters: createCompetitiveGameState assigns gate 0 (north,
 * +Z) to playerIds[0] and gate 1 (south, -Z) to playerIds[1], and inserts
 * playerScores keys in playerIds order.
 */
export function makeCompetitiveGameState(playerIds, totalSheep = 200) {
    return createCompetitiveGameState({ totalSheep }, playerIds);
}

/**
 * Mirror of GameSim.applySheepBoundaryConstraint for the competitive branch:
 * pre-retirement sheep get the multi-gate hard clamp (gate gaps open), a
 * retiring sheep with a target gets the extended +-35m clamp so it can walk
 * into the pasture outside the play bounds.
 */
function applyCompetitiveSheepBoundaryConstraint(sheep, gameState) {
    if (!sheep.hasPassedGate && !sheep.isRetiring) {
        sheep.position = applyHardBoundaryConstraintsWithMultipleGates(
            sheep,
            gameState.bounds,
            gameState.competitiveGates,
            { margin: 0.5, allowGatePassage: true }
        );
    } else if (sheep.isRetiring && sheep.retirementTarget) {
        const b = gameState.bounds;
        sheep.position.x = Math.max(b.minX - 35, Math.min(b.maxX + 35, sheep.position.x));
        sheep.position.z = Math.max(b.minZ - 35, Math.min(b.maxZ + 35, sheep.position.z));
    }
}

function applyCompetitiveCollisionPass(sheepArray, sheepdogs, gameState) {
    const sheepCollision = resolveSheepSheepCollisions(sheepArray, {
        scratch: competitiveCollisionScratch,
        bounds: gameState.bounds
    });
    if (sheepCollision.moved === 0) return;

    for (const index of competitiveCollisionScratch.movedIndices) {
        const sheep = sheepArray[index];
        resolveDogSheepCollisions(sheep, sheepdogs);
        applyCompetitiveSheepBoundaryConstraint(sheep, gameState);
        if (sheep.velocity.magnitude() > 0.001) {
            sheep.facingDirection = sheep.velocity.angle();
        }
        validateEntityState(sheep, new Vector2D(-20, -20));
    }
}

/**
 * P0-DETTEST: one tick of sheep update for COMPETITIVE mode. Mirrors
 * `worker/src/GameSim.js updateSheep` for the competitive branch at the same
 * fidelity level as tickSheepCoop (flocking + flee + multi-gate boundary +
 * client-style integration + dog/sheep separation + multi-gate hard clamp +
 * competitive retirement and per-gate scoring). Like tickSheepCoop, the
 * gate-attraction steer (shouldSeekGate) is out of harness scope; the trace
 * is a self-regression pin for the shared/ competitive primitives, not a
 * byte-for-byte Worker replica.
 *
 * `rng` must be a seeded PRNG (mulberry32) - it feeds the retirement-target
 * placement inside the winning gate's pasture, exactly like the Worker's
 * per-game seeded rng.
 *
 * Returns the per-tick retirement result ({playerRetirements, totalRetired})
 * after accumulating it into gameState.playerScores / sheepRetired the same
 * way GameSim does.
 */
export function tickSheepCompetitive(sheepArray, sheepdogs, gameState, deltaTime, rng) {
    const cfg = SHEEP_CONFIG;
    const activeSheep = sheepArray.filter(s => s.state === 0);

    for (const sheep of sheepArray) {
        if (sheep.state === 1 || sheep.state === 2) {
            sheep.velocity.set(0, 0);
            sheep.acceleration.set(0, 0);
            continue;
        }

        const neighbors = getNeighbors(sheep, activeSheep, cfg.perceptionRadius);
        const flockingForce = calculateFlockingForce(sheep, neighbors, cfg);
        sheep.acceleration.add(flockingForce);

        for (const dog of sheepdogs) {
            const fleeForce = calculateFlee(
                sheep,
                dog.position,
                sheep.fleeRadius,
                cfg.maxSpeed,
                cfg.maxForce
            );
            if (fleeForce.magnitude() > 0) {
                fleeForce.multiply(1.2);
                sheep.acceleration.add(fleeForce);
            }
        }

        tickBarkSteering(sheep);

        // Multi-gate passage-zone check: skip boundary force while a sheep
        // is inside ANY gate's passage zone (mirrors GameSim).
        let inGatePassageZone = false;
        for (const gate of gameState.competitiveGates) {
            if (sheep.position.x >= gate.passageZone.minX &&
                sheep.position.x <= gate.passageZone.maxX &&
                sheep.position.z >= gate.passageZone.minZ &&
                sheep.position.z <= gate.passageZone.maxZ) {
                inGatePassageZone = true;
                break;
            }
        }

        if (!inGatePassageZone) {
            const boundaryForce = calculateBoundaryAvoidanceWithMultipleGates(
                sheep,
                gameState.bounds,
                gameState.competitiveGates,
                { margin: 4, maxSpeed: cfg.maxSpeed, maxForce: cfg.maxForce }
            );
            sheep.acceleration.add(boundaryForce);
        }

        // === updateSheepMovementClientStyle inlined (same as tickSheepCoop) ===
        const dampingFactor = 0.98;
        const velocitySmoothing = 0.85;
        const minMovementThreshold = 0.001;

        const previousVelocity = sheep.velocity.clone();

        sheep.velocity.add(sheep.acceleration);
        sheep.velocity.limit(cfg.maxSpeed);
        sheep.velocity.multiply(dampingFactor);

        const smoothedVelocity = previousVelocity
            .multiply(velocitySmoothing)
            .add(sheep.velocity.clone().multiply(1 - velocitySmoothing));

        if (smoothedVelocity.magnitude() > minMovementThreshold) {
            sheep.velocity = smoothedVelocity;
            sheep.position.add(sheep.velocity.clone().multiply(deltaTime * 60));
        } else {
            sheep.velocity.multiply(0);
        }
        sheep.acceleration.multiply(0);

        resolveDogSheepCollisions(sheep, sheepdogs);

        applyCompetitiveSheepBoundaryConstraint(sheep, gameState);

        if (sheep.velocity.magnitude() > 0.001) {
            sheep.facingDirection = sheep.velocity.angle();
        }

        validateEntityState(sheep, new Vector2D(-20, -20));
    }

    applyCompetitiveCollisionPass(sheepArray, sheepdogs, gameState);

    // Competitive retirement + per-gate scoring (mirrors GameSim updateSheep
    // tail: updateCompetitiveSheepRetirements with the seeded rng, then the
    // per-player score accumulation).
    const retirementResult = updateCompetitiveSheepRetirements(
        sheepArray,
        gameState.competitiveGates,
        rng
    );
    for (const [playerId, newRetirements] of Object.entries(retirementResult.playerRetirements)) {
        if (Object.prototype.hasOwnProperty.call(gameState.playerScores, playerId)) {
            gameState.playerScores[playerId] += newRetirements;
        }
    }
    gameState.sheepRetired = retirementResult.totalRetired;
    return retirementResult;
}

/**
 * One tick of a sheepdog's movement + rotation update. Mirrors
 * GameSimulation.updateSheepdogs + updateSheepdogMovementTimeStyle for the
 * non-client-interpolating case (used for sheep trace and rotation trace).
 *
 * Pass `input` as null to simulate no-input (coast + damp). Pass
 *   { direction: {x, z}, sprint: bool, inputSequence: N, timestamp: 0, clientPosition: null }
 * to drive the dog.
 */
export function tickSheepdog(dog, gameState, deltaTime, input = null) {
    if (input) {
        applyInput(dog, input, deltaTime);
    }

    // === updateSheepdogMovementTimeStyle inlined (no client interp branch) ===
    const maxSpeed = dog.isSprinting ? dog.sprintSpeed : dog.maxSpeed;
    const dampingFactor = 0.85;
    const velocitySmoothing = 0.6;
    const minMovementThreshold = 0.1;

    const previousVelocity = dog.velocity.clone();
    dog.velocity.add(dog.acceleration);
    dog.velocity.limit(maxSpeed);
    dog.velocity.multiply(dampingFactor);

    const smoothedVelocity = previousVelocity
        .multiply(velocitySmoothing)
        .add(dog.velocity.clone().multiply(1 - velocitySmoothing));

    if (smoothedVelocity.magnitude() > minMovementThreshold) {
        dog.velocity = smoothedVelocity;
        dog.position.add(dog.velocity.clone().multiply(deltaTime));
    } else {
        dog.velocity.multiply(0);
    }
    dog.acceleration.multiply(0);

    // Rotation smoothing (identical to GameSimulation.js:340-346)
    if (dog.velocity.magnitude() > 0.1) {
        dog.targetRotation = -dog.velocity.angle() + Math.PI / 2;
    }
    let rotationDiff = dog.targetRotation - dog.rotation;
    while (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI;
    while (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI;
    dog.rotation += rotationDiff * 8 * deltaTime;

    dog.position = applyHardBoundaryConstraints(
        dog, gameState.bounds, null, { margin: 1 }
    );
    validateEntityState(dog, new Vector2D(0, 0));
}

/**
 * Apply one input the way GameSimulation.applyPlayerInput does.
 * Extracted so the client-reconciliation trace can re-enter it.
 */
export function applyInput(dog, input, deltaTime) {
    const { direction, sprint, inputSequence, clientPosition } = input;

    if (inputSequence <= dog.inputSequence) return;
    dog.inputSequence = inputSequence;

    const targetVelocity = new Vector2D(direction.x, direction.z);
    const currentMaxSpeed = sprint && dog.stamina > 10 ? dog.sprintSpeed : dog.maxSpeed;
    if (targetVelocity.magnitude() > 0) {
        targetVelocity.normalize().multiply(currentMaxSpeed);
    }

    if (clientPosition && targetVelocity.magnitude() === 0) {
        const dx = clientPosition.x - dog.position.x;
        const dz = clientPosition.z - dog.position.z;
        if (dx * dx + dz * dz > 25) {
            return; // cheat guard
        }
        dog.clientStopTarget = new Vector2D(clientPosition.x, clientPosition.z);
        dog.isInterpolatingToClient = true;
        dog.velocity.multiply(0);
        dog.acceleration.multiply(0);
    } else {
        dog.clientStopTarget = null;
        dog.isInterpolatingToClient = false;
        applyAcceleration(dog, targetVelocity, deltaTime, DOG_CONFIG);
    }

    const staminaResult = updateStamina(dog, sprint, deltaTime, {
        maxStamina: dog.maxStamina,
        drainRate: 35,
        regenRate: 25,
        minStaminaToConsume: 10
    });
    dog.stamina = staminaResult.current;
    dog.isSprinting = staminaResult.isConsuming;
}

/**
 * One tick of the client-stop interpolation branch. Mirrors the first half of
 * updateSheepdogMovementTimeStyle when isInterpolatingToClient is set. The
 * retry is expected to touch this code (the `8 * deltaTime` factor jumps 3x
 * going from 60Hz to 20Hz - that is exactly what cycle-1-audit flagged).
 */
export function tickSheepdogClientInterp(dog, deltaTime) {
    if (!dog.isInterpolatingToClient || !dog.clientStopTarget) {
        return { factor: 0, distance: 0 };
    }
    const target = dog.clientStopTarget;
    const distance = Math.sqrt(
        (target.x - dog.position.x) ** 2 + (target.z - dog.position.z) ** 2
    );
    if (distance < 0.05) {
        dog.position.x = target.x;
        dog.position.z = target.z;
        dog.velocity.multiply(0);
        dog.isInterpolatingToClient = false;
        dog.clientStopTarget = null;
        return { factor: 1, distance: 0 };
    }
    const interpolationSpeed = 8.0;
    const factor = Math.min(interpolationSpeed * deltaTime, 0.8);
    dog.position.x += (target.x - dog.position.x) * factor;
    dog.position.z += (target.z - dog.position.z) * factor;
    dog.velocity.multiply(0);
    dog.acceleration.multiply(0);
    return { factor, distance };
}

/**
 * Round a float to N decimals. Used when writing fixtures so that
 * platform-drift in the last few bits of a double doesn't create spurious
 * diffs. 4 decimals is plenty for a 200x200m field at 0.24 m/s max sheep
 * speed - way below anything a player could perceive.
 */
export function round4(n) {
    // Cycle 34 Phase 1: `+ 0` collapses -0 to 0 so JSON serialisation and
    // `toEqual` round-trips agree. Without it, sheep on the z=0 axis can
    // produce -0 from velocity damping (e.g. `-0.0000001 * 0.85`) and the
    // fixture (which serialises to `0`) won't match the next run's `-0`.
    return Math.round(n * 10000) / 10000 + 0;
}
