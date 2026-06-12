// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Vector2D } from './Vector2D.js';
import { getTerrainBuilder, getSceneManager, getGameState } from './GameBridge.js';
import { getFenceCollisionSystem } from './FenceCollisionSystem.js';
import { obstacleAvoidance } from '../shared/SceneObstacles.js';
import { DEFAULT_BARK_CONFIG } from '../shared/BarkImpulse.js';
import { getCoastlineField, sampleSignedDistance, coastlineInwardDir, isOutsideGrid } from '../shared/CoastlineField.js';

// Reused inward-direction scratch for the coastline dog clamp (no per-call alloc).
const _dogInward = { x: 0, z: 0 };

// Cycle 6 Phase 2 — dog obstacle hard push-out (treat trunks like fences).
// Cycle 7 Phase 1b — force-based pre-contact avoidance gentler than sheep
// (4.0 vs 6.0) so the dog doesn't fight the player's input too hard.
const DOG_OBSTACLE_QUERY_RADIUS = 30;
const DOG_RADIUS = 1.2;
const DOG_OBSTACLE_STRENGTH = 4.0;

/**
 * Animation States - Simplified and robust state machine for Sheep Dog animations
 */
const ANIMATION_STATES = {
    IDLE: {
        animations: ['Idle_1', 'Idle_2', 'Idle_3', 'Idle_4', 'Idle_6', 'Idle_7'],
        priority: 0,
        transitionTime: 0.5
    },
    WALKING: {
        animations: {
            forward: 'Walk_F_IP',
            left: 'Walk_L_IP',
            right: 'Walk_R_IP'
        },
        priority: 1,
        transitionTime: 0.3
    },
    TROTTING: {
        animations: {
            forward: 'Trot_F_IP',
            left: 'Trot_L_IP',
            right: 'Trot_R_IP'
        },
        priority: 2,
        transitionTime: 0.25
    },
    RUNNING: {
        animations: {
            forward: 'Run_F_IP',
            left: 'Run_L_IP',
            right: 'Run_R_IP'
        },
        priority: 3,
        transitionTime: 0.2
    },
    SPRINTING: {
        animations: {
            forward: 'RunFast_F_IP',
            left: 'RunFast_L_IP',
            right: 'RunFast_R_IP'
        },
        priority: 4,
        transitionTime: 0.15
    },
    BARKING: {
        animations: ['Bark'],
        priority: 5,
        transitionTime: 0.2,
        duration: 4.58 // From animation data
    }
    // NOTE: No sitting animation available in the dog models
    // Available animations: Bark, Idle_1-7, Walk_F/L/R_IP, Trot_F/L/R_IP, Run_F/L/R_IP, RunFast_F/L/R_IP
};

/**
 * Speed thresholds for animation state transitions
 */
const SPEED_THRESHOLDS = {
    IDLE: 0.1,      // Much lower threshold for immediate idle stop
    WALKING: 5.0,   // Start walking animation sooner
    TROTTING: 12.0, // Adjusted for better progression
    RUNNING: 18.0,  // Adjusted for better progression
    SPRINTING: 24.0 // Slightly lower sprint threshold
};

/**
 * Hysteresis margin (units/sec) applied to SPEED_THRESHOLDS in determineAnimationState.
 * Prevents rapid oscillation between adjacent animation states when speed hovers at a boundary.
 */
const SPEED_HYSTERESIS = 1.0;

/**
 * "Ideal" speed (units/sec) each movement clip was designed for. Used to modulate mixer
 * action timeScale so the legs visually match the body's actual speed instead of churning
 * at 1x when the dog is gliding slowly (e.g. after stamina exhaustion while still in
 * SPRINTING state). Values roughly match the upper edge of each SPEED_THRESHOLDS band;
 * SPRINTING is set to 30 (above the 24 entry threshold) so the sprint clip plays at 1x
 * during normal max-speed sprinting. Non-movement states (IDLE, BARKING) are omitted so
 * their clips play at authored 1x speed.
 */
const SPEED_STATE_MAX = {
    WALKING: 5.0,
    TROTTING: 12.0,
    RUNNING: 18.0,
    SPRINTING: 30.0
};

/**
 * Sheepdog class - Professional player controlled entity with advanced animation system
 */
export class Sheepdog {
    constructor(x, z, dogType = 'jep', heightfield = null) {
        this.position = new Vector2D(x, z);
        this.velocity = new Vector2D(0, 0);
        this.targetVelocity = new Vector2D(0, 0);

        // Latched facing unit vector for bark steering. Updated from velocity
        // while moving and held when the dog stops.
        this._barkForward = { x: 0, z: 1 };
        // Per-frame scratch reused inside move() to compute the velocity
        // delta in place (targetVelocity - velocity) * (accel * dt). Avoids
        // two Vector2D allocations per frame. Math is identical: same
        // operands, same operation order.
        this._scratchVel = new Vector2D(0, 0);
        // Per-frame scratch reused by updateTerrainTilt to hold the surface
        // normal read from the heightfield. Inlining the central-difference
        // normal here (instead of Heightfield.normal returning a fresh
        // {x,y,z}) drops one allocation per frame without touching the
        // shared heightfield. Same sample calls, same math, same order.
        this._normalScratch = { x: 0, y: 1, z: 0 };
        this.dogType = dogType;
        /** @type {import('../shared/terrain/Heightfield.js').Heightfield | null} */
        this.heightfield = heightfield;
        
        // Player identification for competitive mode
        this.playerId = null;
        this.playerIcon = null;

        // Distance indicator (always visible marker for local player)
        this.distanceIndicator = null;
        this.isLocalPlayer = false;
        
        // Configure dog stats based on type
        this.configureDogStats(dogType);
        
        // Animation system
        this.animationSystem = {
            mixer: null,
            currentState: 'IDLE',
            currentAction: null,
            currentDirection: 'forward',
            actions: new Map(),
            stateTimer: 0,
            idleVariationTimer: 0,
            idleVariationIndex: 0,
            barkTimer: 0,
            // Note: No sitting animation available in model
            lastMovementTime: 0,
            turnDirection: null,
            turnStartTime: 0
        };
        
        // Movement and rotation
        this.currentRotation = 0;
        this.targetRotation = 0;
        this.lastVelocityAngle = 0;
        this.isMoving = false;
        
        // Model references
        this.mesh = null;
        this.sheepdogModel = null;
        
        // Audio and behavior
        this.audioManager = null;
        this.lastBarkTime = 0;
        this.barkCooldown = 3000;
        this.nearSheep = false;

        // Player-triggered bark command. Separate cooldown from the passive
        // near-sheep audio above; this gate is the single bark limiter.
        this.lastPlayerBarkTime = 0;
        this.playerBarkCooldown = DEFAULT_BARK_CONFIG.cooldownMs;
        
        // Performance tracking
        this._lastLogTime = 0;
        
        this.initializeModel();
    }
    
    /**
     * Configure dog statistics based on type - Balanced 9-point system
     */
    configureDogStats(dogType) {
        const configs = {
            'jep': {
                // Balanced (Speed: 3, Stamina: 3, Range: 3) = 9 points
                maxSpeed: 15,
                sprintSpeed: 25,
                acceleration: 40,
                deceleration: 30,
                turnSpeed: 8,
                maxStamina: 100,
                staminaDrainRate: 30,
                staminaRegenRate: 20,
                fleeRadius: 8
            },
            'pip': {
                // Range Specialist (Speed: 2, Stamina: 2, Range: 5) = 9 points
                maxSpeed: 12,
                sprintSpeed: 20,
                acceleration: 35,
                deceleration: 25,
                turnSpeed: 7,
                maxStamina: 70,
                staminaDrainRate: 35,
                staminaRegenRate: 15,
                fleeRadius: 12
            },
            'sally': {
                // Speed Demon (Speed: 5, Stamina: 2, Range: 2) = 9 points
                maxSpeed: 22,
                sprintSpeed: 35,
                acceleration: 60,
                deceleration: 45,
                turnSpeed: 12,
                maxStamina: 70,
                staminaDrainRate: 40,
                staminaRegenRate: 15,
                fleeRadius: 6
            },
            'shiloh': {
                // Endurance Expert (Speed: 2, Stamina: 5, Range: 2) = 9 points
                maxSpeed: 12,
                sprintSpeed: 20,
                acceleration: 35,
                deceleration: 25,
                turnSpeed: 7,
                maxStamina: 150,
                staminaDrainRate: 20,
                staminaRegenRate: 30,
                fleeRadius: 6
            },
            'george_washington': {
                // Tactical (Speed: 3, Stamina: 4, Range: 2) = 9 points
                maxSpeed: 15,
                sprintSpeed: 25,
                acceleration: 40,
                deceleration: 30,
                turnSpeed: 8,
                maxStamina: 120,
                staminaDrainRate: 25,
                staminaRegenRate: 25,
                fleeRadius: 6
            }
        };
        
        const config = configs[dogType] || configs['jep'];
        Object.assign(this, config);
        
        this.stamina = this.maxStamina;
        this.minStaminaToSprint = 10;
        this.isSprinting = false;
        // Cycle 23 Phase B: re-add the release-shift lock removed in Cycle 8.
        // v1.3.0 playtest found Cycle 8's auto-resume produced ~0.83s
        // stutter cycles (0.33s sprint / 0.5s walk) that visually read as
        // "sprint continues until input stops" — exactly what Cycle 8
        // simplification was trying to avoid. Lock is set when stamina
        // depletes mid-sprint; cleared when wantsSprint becomes false
        // (player releases Shift). canStartSprint vs canContinueSprint
        // remain separate gates per Cycle 7 settled decision.
        this._sprintLockOut = false;
        // Smoothed speed cap. Tracks `currentMaxSpeed` (sprint vs walk) but
        // eases on the way DOWN with τ≈0.2s so the velocity clamp doesn't
        // pop velocity 25→15 in one frame on sprint exhaustion. Snaps on the
        // way UP so pressing sprint stays responsive. See `move()`.
        this.smoothMaxSpeed = this.maxSpeed;
    }
    
    /**
     * Initialize the model and set up the mesh group
     */
    initializeModel() {
        this.mesh = new THREE.Group();
        // YXZ rotation order so yaw is applied first (around world Y), then
        // pitch/roll (around the dog's local axes). With the default XYZ
        // order, terrain-tilt and yaw fight each other.
        this.mesh.rotation.order = 'YXZ';
        const initY = this.heightfield ? this.heightfield.sample(this.position.x, this.position.z) : 0;
        this.mesh.position.set(this.position.x, initY, this.position.z);

        // Load the Sheep Dog model
        this.loadSheepdogModel();
    }
    
    /**
     * Load individual dog model based on dogType and set up comprehensive animation system
     */
    loadSheepdogModel() {
        const terrainBuilder = getTerrainBuilder();

        if (!terrainBuilder?.models?.animals?.[this.dogType]) {
            console.error(`[ERROR] ${this.dogType} model not available from TerrainBuilder`);
            return;
        }

        const originalModel = terrainBuilder.models.animals[this.dogType];
        const animations = terrainBuilder.models.animals[this.dogType + '_animations'] || [];

        console.log(`[DOG] Loading ${this.dogType} model with ${animations.length} animations`);

        // Clone the model using SkeletonUtils for proper animation support
        this.sheepdogModel = SkeletonUtils.clone(originalModel);

        // Configure model - Make it bigger and more visible
        this.sheepdogModel.scale.set(4,4,4)
        this.sheepdogModel.rotation.y = 0;
        this.sheepdogModel.position.set(0, 0, 0);

        // Configure shadows and materials
        this.sheepdogModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                // Ensure materials work with fog
                if (child.material) {
                    child.material.fog = true;
                }
            }
        });

        // Add to mesh group
        this.mesh.add(this.sheepdogModel);

        // Set up animation system
        this.setupAnimationSystem(animations);

        console.log(`[OK] ${this.dogType} model loaded and animation system initialized`);
    }
    
    /**
     * Set up comprehensive animation system with all 113 animations
     */
    setupAnimationSystem(animations) {
        if (animations.length === 0) {
            console.warn('[WARN] No animations found for Sheep Dog model');
            return;
        }

        // Create animation mixer
        this.animationSystem.mixer = new THREE.AnimationMixer(this.sheepdogModel);

        // Create actions for all animations and organize by state
        const animNames = [];
        animations.forEach(clip => {
            const action = this.animationSystem.mixer.clipAction(clip);
            this.animationSystem.actions.set(clip.name, action);
            animNames.push(clip.name);
        });

        // Start with first idle animation
        this.transitionToState('IDLE');

        console.log(`[DOG] Animation system ready with ${animations.length} animations`);
        console.log('[DOG] Available animations:', animNames.sort());
    }

    /**
     * Get the appropriate animation name based on current state and direction
     */
    getAnimationForState(state, direction = 'forward') {
        const stateConfig = ANIMATION_STATES[state];
        if (!stateConfig) return null;
        
        if (Array.isArray(stateConfig.animations)) {
            // Simple array of animations (like IDLE, BARKING)
            if (state === 'IDLE') {
                // Cycle through idle variations
                return stateConfig.animations[this.animationSystem.idleVariationIndex];
            }
            return stateConfig.animations[0];
        } else if (typeof stateConfig.animations === 'object') {
            // Handle turning state
            if (state === 'TURNING') {
                const turnDirection = this.animationSystem.turnDirection;
                if (turnDirection === 'left') {
                    return stateConfig.animations.left;
                } else if (turnDirection === 'right') {
                    return stateConfig.animations.right;
                }
                return stateConfig.animations.left; // Default
            }
            
            // Directional animations (WALKING, TROTTING, RUNNING, SPRINTING)
            return stateConfig.animations[direction] || stateConfig.animations.forward;
        }
        
        return null;
    }
    
    /**
     * Determine movement direction based on velocity - Always use forward unless actively turning
     */
    getMovementDirection() {
        // Always use forward animation - no turning animations
        // This ensures we never get stuck in turning animations
        return 'forward';
    }
    
    /**
     * Normalize angle to [-π, π] range
     */
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }
    
    /**
     * Determine appropriate animation state based on speed and context.
     *
     * Applies SPEED_HYSTERESIS around SPEED_THRESHOLDS: climbing to a higher state requires
     * speed >= (threshold + hysteresis), dropping to a lower state requires
     * speed < (threshold - hysteresis). This prevents rapid flip-flop when speed hovers at
     * a boundary (e.g. walking <-> trotting near 5.0).
     */
    determineAnimationState() {
        const speed = this.velocity.magnitude();
        const targetSpeed = this.targetVelocity.magnitude();
        const currentState = this.animationSystem.currentState;
        const h = SPEED_HYSTERESIS;

        // Use target velocity to immediately stop idle when input is detected
        // This ensures idle stops as soon as the player starts moving
        if (speed < SPEED_THRESHOLDS.IDLE && targetSpeed < SPEED_THRESHOLDS.IDLE) {
            return 'IDLE';
        }

        // The "natural" state given raw thresholds; used when there is no movement state to
        // bias toward (IDLE / BARKING / first call) and as the target on any boundary crossing.
        const natural = (
            speed < SPEED_THRESHOLDS.WALKING   ? 'WALKING'
            : speed < SPEED_THRESHOLDS.TROTTING ? 'TROTTING'
            : speed < SPEED_THRESHOLDS.RUNNING  ? 'RUNNING'
            : 'SPRINTING'
        );

        // Climbing past an upper boundary requires +h margin.
        const upperThreshold = {
            WALKING:   SPEED_THRESHOLDS.TROTTING  + h,
            TROTTING:  SPEED_THRESHOLDS.RUNNING   + h,
            RUNNING:   SPEED_THRESHOLDS.SPRINTING + h
        }[currentState];
        // Dropping below a lower boundary requires -h margin.
        const lowerThreshold = {
            SPRINTING: SPEED_THRESHOLDS.RUNNING  - h,
            RUNNING:   SPEED_THRESHOLDS.TROTTING - h,
            TROTTING:  SPEED_THRESHOLDS.WALKING  - h
        }[currentState];

        // Not in a movement state (IDLE / BARKING / first call): no bias, enter at exact threshold.
        if (upperThreshold === undefined && lowerThreshold === undefined) {
            return natural;
        }
        if (upperThreshold !== undefined && speed >= upperThreshold) return natural;
        if (lowerThreshold !== undefined && speed <  lowerThreshold) return natural;
        return currentState;
    }
    
    /**
     * Transition to a new animation state
     */
    transitionToState(newState, direction = null) {
        if (!this.animationSystem.mixer) return;
        
        const oldState = this.animationSystem.currentState;
        
        // Update direction if provided
        if (direction) {
            this.animationSystem.currentDirection = direction;
        }
        
        // Get animation name for new state
        const animationName = this.getAnimationForState(newState, this.animationSystem.currentDirection);
        if (!animationName) {
            console.warn(`[WARN] No animation found for state: ${newState}, direction: ${this.animationSystem.currentDirection}`);
            return;
        }
        
        const newAction = this.animationSystem.actions.get(animationName);
        if (!newAction) {
            console.warn(`[WARN] Animation action not found: ${animationName}`);
            return;
        }
        
        // Handle state transition
        if (oldState !== newState || this.animationSystem.currentAction !== newAction) {
            const stateConfig = ANIMATION_STATES[newState];
            const transitionTime = stateConfig?.transitionTime || 0.25;
            
            // Fade out current action
            if (this.animationSystem.currentAction) {
                this.animationSystem.currentAction.fadeOut(transitionTime);
            }
            
            // Fade in new action
            newAction.reset().fadeIn(transitionTime).play();
            
            // Update state
            this.animationSystem.currentState = newState;
            this.animationSystem.currentAction = newAction;
            this.animationSystem.stateTimer = 0;
            
            // Handle special state logic
            this.handleStateTransition(newState, oldState);
            
            console.log(`[DOG] Animation transition: ${oldState} -> ${newState} (${animationName})`);
        }
    }
    
    /**
     * Handle special logic for state transitions
     */
    handleStateTransition(newState, oldState) {
        switch (newState) {
            case 'IDLE':
                if (oldState !== 'IDLE') {
                    this.animationSystem.idleVariationTimer = 3000 + Math.random() * 4000; // 3-7 seconds
                    this.animationSystem.lastMovementTime = performance.now();
                }
                break;
                
            case 'BARKING':
                this.animationSystem.barkTimer = ANIMATION_STATES.BARKING.duration * 1000;
                break;
        }
    }
    
    /**
     * Update animation system
     */
    updateAnimationSystem(deltaTime) {
        if (!this.animationSystem.mixer) return;

        // Update mixer
        this.animationSystem.mixer.update(deltaTime);

        // Scale the active clip's playback rate to match body speed. Without this, when
        // the dog slows (e.g. post-sprint exhaustion) while still in the SPRINTING state,
        // the RunFast clip continues at timeScale=1 and the legs churn while the dog glides.
        // Non-movement states (IDLE, BARKING) play at authored 1x speed.
        const currentAction = this.animationSystem.currentAction;
        if (currentAction) {
            const stateMax = SPEED_STATE_MAX[this.animationSystem.currentState];
            if (stateMax && stateMax > 0) {
                const speed = this.velocity.magnitude();
                currentAction.timeScale = THREE.MathUtils.clamp(speed / stateMax, 0.5, 1.5);
            } else {
                currentAction.timeScale = 1.0;
            }
        }

        // Update timers
        this.animationSystem.stateTimer += deltaTime * 1000;
        
        // Handle bark timer
        if (this.animationSystem.barkTimer > 0) {
            this.animationSystem.barkTimer -= deltaTime * 1000;
            if (this.animationSystem.barkTimer <= 0) {
                this.animationSystem.barkTimer = 0;
            }
        }
        
        // Handle idle variations
        if (this.animationSystem.currentState === 'IDLE') {
            this.animationSystem.idleVariationTimer -= deltaTime * 1000;
            if (this.animationSystem.idleVariationTimer <= 0) {
                this.cycleIdleAnimation();
            }
        }

        // Determine and transition to appropriate state
        const targetState = this.determineAnimationState();
        const targetDirection = this.getMovementDirection();
        
        if (targetState !== this.animationSystem.currentState || 
            targetDirection !== this.animationSystem.currentDirection) {
            this.transitionToState(targetState, targetDirection);
        }
    }
    
    /**
     * Cycle through idle animation variations
     */
    cycleIdleAnimation() {
        const idleAnimations = ANIMATION_STATES.IDLE.animations;
        this.animationSystem.idleVariationIndex = (this.animationSystem.idleVariationIndex + 1) % idleAnimations.length;
        
        // Reset timer for next variation
        this.animationSystem.idleVariationTimer = 3000 + Math.random() * 4000;
        
        // Transition to new idle animation
        this.transitionToState('IDLE');
    }
    
    /**
     * Trigger bark animation
     */
    triggerBark() {
        if (this.animationSystem.barkTimer <= 0) {
            this.animationSystem.barkTimer = ANIMATION_STATES.BARKING.duration * 1000;
            this.transitionToState('BARKING');
        }
    }

    /**
     * Player bark command. Plays the bark animation + sound on
     * demand, gated by playerBarkCooldown so it cannot be spammed. Returns true
     * only when it actually fired; false while still cooling down.
     */
    triggerPlayerBark() {
        const now = Date.now();
        if (now - this.lastPlayerBarkTime < this.playerBarkCooldown) return false;
        this.lastPlayerBarkTime = now;
        this.triggerBark();
        if (this.audioManager) this.audioManager.playSheepdogBark(this.dogType);
        return true;
    }

    /**
     * Unit vector of the dog's facing for bark steering. Tracks the live
     * velocity direction while moving and latches the last facing when stopped.
     * Pure sqrt-normalize (no trig), matching the deterministic bark module's
     * contract. Returns a reused object - do not retain it.
     */
    getBarkForward() {
        const vx = this.velocity.x;
        const vz = this.velocity.z;
        const sp = Math.sqrt(vx * vx + vz * vz);
        if (sp > 0.01) {
            this._barkForward.x = vx / sp;
            this._barkForward.z = vz / sp;
        }
        return this._barkForward;
    }
    
    /**
     * Create Three.js mesh for the sheepdog
     */
    createMesh() {
        return this.mesh;
    }
    
    /**
     * Smooth movement with acceleration and advanced animation
     */
    move(direction, bounds, deltaTime = 0.016, wantsSprint = false) {
        // Update stamina
        this.updateStamina(wantsSprint, deltaTime);
        
        // Determine current max speed
        const currentMaxSpeed = this.isSprinting ? this.sprintSpeed : this.maxSpeed;

        // Smooth the speed cap on the way down (sprint→walk transitions),
        // snap on the way up (sprint press stays responsive). Without this,
        // the safety clamp below would force velocity from 25 → 15 in one
        // frame the instant stamina runs out, which:
        //   - skips the RUNNING animation hysteresis band (SPRINT → TROT in
        //     one transition rather than passing through RUNNING)
        //   - pops the camera look-ahead distance (speedNorm halves instantly)
        //   - lets the camera position lerp surge forward as soon as the dog
        //     decelerates
        // Easing the cap lets the existing acceleration system bring velocity
        // down naturally over ~75ms. The animation state passes cleanly
        // through SPRINTING → RUNNING and the camera tracks smoothly.
        if (currentMaxSpeed >= this.smoothMaxSpeed) {
            this.smoothMaxSpeed = currentMaxSpeed;
        } else {
            const k = 1 - Math.exp(-deltaTime / 0.2);
            this.smoothMaxSpeed += (currentMaxSpeed - this.smoothMaxSpeed) * k;
        }

        // Cycle 7 Phase 1a: target velocity uses smoothMaxSpeed, not raw
        // currentMaxSpeed. smoothMaxSpeed snaps up on sprint-on (line above)
        // so responsiveness is preserved, but eases down on sprint-out so
        // the diagonal stamina-exhaustion case no longer steps the target
        // velocity magnitude in one frame. Without this, the camera's
        // speedNorm + look-ahead would still pop even though the safety
        // clamp at the bottom of the function was already smoothed.
        this.targetVelocity.set(direction.x, direction.z).normalize().multiply(this.smoothMaxSpeed);

        // Smooth acceleration/deceleration
        const accelerationRate = direction.magnitude() > 0 ? this.acceleration : this.deceleration;
        // velocityChange = (targetVelocity - velocity) * (accelerationRate * deltaTime),
        // computed in a reused scratch to avoid two clones per frame.
        const velocityChange = this._scratchVel
            .set(this.targetVelocity.x, this.targetVelocity.z)
            .subtract(this.velocity)
            .multiply(accelerationRate * deltaTime);

        // Apply velocity change
        this.velocity.add(velocityChange);

        // Cycle 7 Phase 1b: force-based pre-contact avoidance from trees +
        // rocks. Same shared `obstacleAvoidance` the sheep use; the force
        // fires when entity overlaps the obstacle radius and grows with
        // overlap depth, so the velocity is steered tangentially before
        // the hard push-out below ever has to reflect. Length-guard
        // preserves Field's behavior. Computed once and reused for the
        // hard-contact pass below.
        const obstacles = getGameState()?.obstacles;
        let nearbyTrees = null;
        let nearbyRocks = null;
        if (obstacles && (obstacles.trees.length > 0 || obstacles.rocks.length > 0)) {
            nearbyTrees = obstacles.trees.length
                ? obstacles.queryTrees(this.position, DOG_OBSTACLE_QUERY_RADIUS)
                : [];
            nearbyRocks = obstacles.rocks.length
                ? obstacles.queryRocks(this.position, DOG_OBSTACLE_QUERY_RADIUS)
                : [];
            if (nearbyTrees.length > 0) {
                const f = obstacleAvoidance(this.position, DOG_RADIUS, nearbyTrees, { strength: DOG_OBSTACLE_STRENGTH });
                if (f.x !== 0 || f.z !== 0) {
                    this.velocity.x += f.x * deltaTime;
                    this.velocity.z += f.z * deltaTime;
                }
            }
            if (nearbyRocks.length > 0) {
                const f = obstacleAvoidance(this.position, DOG_RADIUS, nearbyRocks, { strength: DOG_OBSTACLE_STRENGTH });
                if (f.x !== 0 || f.z !== 0) {
                    this.velocity.x += f.x * deltaTime;
                    this.velocity.z += f.z * deltaTime;
                }
            }
        }

        // Soft cap using the smoothed max speed (rare safety net for
        // collision-induced velocity spikes; absorbs sprint→walk pop).
        if (this.velocity.magnitude() > this.smoothMaxSpeed) {
            this.velocity.normalize().multiply(this.smoothMaxSpeed);
        }

        // Calculate new position. Integrate in place — identical to
        // position + velocity * deltaTime, same operands and order — and
        // keeps the same object the hard push-out below already mutates.
        this.position.x += this.velocity.x * deltaTime;
        this.position.z += this.velocity.z * deltaTime;

        // Cycle 6 Phase 2: hard push-out from tree trunks + large rocks.
        // Treats obstacles like fences — corrects position directly, then
        // reflects velocity along the contact normal so the dog doesn't
        // glue to the trunk. Cycle 7 Phase 1b kept this as a fallback for
        // edge cases (sprint into trunk, frame jumps) where the force-based
        // avoidance above didn't fully deflect. Reuses the kdbush queries
        // computed above to avoid double work.
        if (nearbyTrees && (nearbyTrees.length > 0 || nearbyRocks.length > 0)) {
            for (const list of [nearbyTrees, nearbyRocks]) {
                for (const o of list) {
                    const dx = this.position.x - o.x;
                    const dz = this.position.z - o.z;
                    const distSq = dx * dx + dz * dz;
                    const minDist = DOG_RADIUS + o.radiusXZ;
                    if (distSq < minDist * minDist && distSq > 1e-6) {
                        const dist = Math.sqrt(distSq);
                        const overlap = minDist - dist;
                        const inv = 1 / dist;
                        const nx = dx * inv;
                        const nz = dz * inv;
                        this.position.x += nx * overlap;
                        this.position.z += nz * overlap;
                        // Reflect inward velocity component
                        const vDotN = this.velocity.x * nx + this.velocity.z * nz;
                        if (vDotN < 0) {
                            this.velocity.x -= vDotN * nx;
                            this.velocity.z -= vDotN * nz;
                            this.velocity.x *= 0.85;
                            this.velocity.z *= 0.85;
                        }
                    }
                }
            }
        }

        // Apply boundary constraints
        this.applyBoundaryConstraints(bounds);

        // Apply fence collision - check both border and internal fences
        const fenceSystem = getFenceCollisionSystem();
        if (fenceSystem && fenceSystem.fenceSegments.length > 0) {
            const collision = fenceSystem.resolveCollision(this.position.x, this.position.z, 1.2);
            if (collision.collided) {
                this.position.x = collision.x;
                this.position.z = collision.z;

                // Reflect velocity off the fence
                const dot = this.velocity.x * collision.normalX + this.velocity.z * collision.normalZ;
                if (dot < 0) {
                    this.velocity.x -= 1.5 * dot * collision.normalX;
                    this.velocity.z -= 1.5 * dot * collision.normalZ;
                    // Slight dampening on collision
                    this.velocity.x *= 0.8;
                    this.velocity.z *= 0.8;
                }
            }
        }

        // Update movement state
        this.isMoving = this.velocity.magnitude() > 0.5;
        
        // Removed barking animation - audio only
        if (this.audioManager && this.isMoving && this.nearSheep) {
            const now = Date.now();
            if (now - this.lastBarkTime > this.barkCooldown) {
                this.audioManager.playSheepdogBark(this.dogType);
                this.lastBarkTime = now;
            }
        }
        
        // Update mesh position and rotation
        if (this.mesh) {
            this.mesh.position.x = this.position.x;
            this.mesh.position.z = this.position.z;
            if (this.heightfield) {
                this.mesh.position.y = this.heightfield.surfaceY(this.position.x, this.position.z);
            }

            // Smooth rotation
            this.updateRotation(deltaTime);

            // Tilt mesh to terrain slope (pitch + roll). Subtle — clamped to
            // ~22° max so the dog reads as planted on the ground without
            // looking like it's "flying" on cliffs.
            this.updateTerrainTilt(deltaTime);

            // Update animation system
            this.updateAnimationSystem(deltaTime);
        }
    }

    /**
     * Tilt the mesh's pitch (rotation.x) and roll (rotation.z) to follow the
     * terrain slope, projected against the dog's facing direction. Yaw
     * (rotation.y) stays controlled by `updateRotation`.
     */
    updateTerrainTilt(deltaTime) {
        if (!this.heightfield || !this.mesh) return;

        // Inlined copy of Heightfield.normal (central finite differences,
        // eps = 1m) writing into a reused scratch instead of allocating a
        // fresh {x,y,z} every frame. The sample calls, operands, and order
        // are byte-identical to Heightfield.normal; sample() is read-only,
        // so the shared heightfield is untouched.
        const n = this._normalScratch;
        {
            const eps = 1;
            const hL = this.heightfield.sample(this.position.x - eps, this.position.z);
            const hR = this.heightfield.sample(this.position.x + eps, this.position.z);
            const hD = this.heightfield.sample(this.position.x, this.position.z - eps);
            const hU = this.heightfield.sample(this.position.x, this.position.z + eps);

            const nx = -(hR - hL);
            const ny = 2 * eps;
            const nz = -(hU - hD);

            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (len < 1e-9) {
                n.x = 0; n.y = 1; n.z = 0;
            } else {
                n.x = nx / len; n.y = ny / len; n.z = nz / len;
            }
        }

        // Slope vector in XZ plane: where would a ball roll? That's -(nx, nz)
        // scaled by 1/ny. Pitch+roll come from this vector projected against
        // the dog's facing direction.
        // currentRotation: yaw such that the model's local +Z faces world
        // (sin(yaw), 0, cos(yaw)) — based on the existing convention in
        // updateRotation. Forward = (sin(yaw), -, cos(yaw)).
        const yaw = this.currentRotation;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);

        // Pitch: how much forward direction goes "uphill". +pitch tips nose down.
        // Slope rise per unit horizontal toward forward = -(n.x*fx + n.z*fz)/n.y.
        const slopeForward = -(n.x * fx + n.z * fz) / Math.max(n.y, 0.001);
        // Roll: how much sideways direction goes "uphill". Right vector for a
        // mesh that faces +z when yaw=0 is (cos(yaw), 0, -sin(yaw)).
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        const slopeRight = -(n.x * rx + n.z * rz) / Math.max(n.y, 0.001);

        // Convert slope (rise/run) to angle, clamp to ~22° so the tilt stays
        // tasteful even on the steepest baked terrain. With YXZ rotation
        // order: pitch is negated (positive rx tips nose down, but we want
        // the nose UP when going uphill), roll keeps its sign (positive rz
        // tips the right side up, matching slope-rises-to-right).
        const maxTilt = 0.38; // ~22°
        const targetPitch = Math.max(-maxTilt, Math.min(maxTilt, -Math.atan(slopeForward)));
        const targetRoll  = Math.max(-maxTilt, Math.min(maxTilt,  Math.atan(slopeRight)));

        // Smooth toward target so the tilt doesn't snap when the dog crosses
        // a sharp gradient. ~6 Hz convergence — fast enough to feel grounded,
        // slow enough to absorb noise.
        const k = Math.min(1, deltaTime * 6);
        this.mesh.rotation.x += (targetPitch - this.mesh.rotation.x) * k;
        this.mesh.rotation.z += (targetRoll  - this.mesh.rotation.z) * k;
    }
    
    /**
     * Apply boundary constraints with velocity correction.
     * Accepts either legacy `bounds` rect or new discriminated `Boundary`.
     */
    applyBoundaryConstraints(boundsOrBoundary) {
        // Coastline branch (Cycle 64) — clamp inside the shore along the SDF
        // gradient + zero the outward velocity component, mirroring the island
        // clamp. Uses the same field the sim steers on.
        if (boundsOrBoundary && boundsOrBoundary.kind === 'coastline') {
            const field = getCoastlineField(boundsOrBoundary);
            const margin = 0.2;
            const sd = sampleSignedDistance(field, this.position.x, this.position.z);
            if (sd < margin) {
                let nx;
                let nz;
                if (isOutsideGrid(field, this.position.x, this.position.z)) {
                    // Past the padded grid: aim at the polygon's deepest-interior
                    // point (inside even on a concave shape, unlike the bbox centre).
                    nx = field.interiorX - this.position.x;
                    nz = field.interiorZ - this.position.z;
                    const m = Math.sqrt(nx * nx + nz * nz);
                    if (m > 1e-9) { nx /= m; nz /= m; } else { nx = 0; nz = 0; }
                } else {
                    coastlineInwardDir(field, this.position.x, this.position.z, _dogInward);
                    nx = _dogInward.x;
                    nz = _dogInward.z;
                }
                if (nx !== 0 || nz !== 0) {
                    this.position.x += nx * (margin - sd);
                    this.position.z += nz * (margin - sd);
                    // Project velocity onto the inward half-space (drop outward component).
                    const vDotIn = this.velocity.x * nx + this.velocity.z * nz;
                    if (vDotIn < 0) {
                        this.velocity.x -= vDotIn * nx;
                        this.velocity.z -= vDotIn * nz;
                    }                }
            }
            return;
        }

        // Island branch — radial clamp + zero-out outward velocity component
        if (boundsOrBoundary && boundsOrBoundary.kind === 'island') {
            const center = boundsOrBoundary.center;
            const radius = boundsOrBoundary.radius;
            const dx = this.position.x - center.x;
            const dz = this.position.z - center.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > radius && dist > 1e-6) {
                const inv = 1 / dist;
                const nx = dx * inv;  // unit outward normal
                const nz = dz * inv;
                this.position.x = center.x + nx * radius;
                this.position.z = center.z + nz * radius;
                // Project velocity onto inward half-space (zero out outward component)
                const vDotN = this.velocity.x * nx + this.velocity.z * nz;
                if (vDotN > 0) {
                    this.velocity.x -= vDotN * nx;
                    this.velocity.z -= vDotN * nz;
                }            }
            return;
        }

        // Rect path — preserved
        const bounds = boundsOrBoundary;
        if (this.position.x < bounds.minX) {
            this.position.x = bounds.minX;
            this.velocity.x = Math.max(0, this.velocity.x);        }
        if (this.position.x > bounds.maxX) {
            this.position.x = bounds.maxX;
            this.velocity.x = Math.min(0, this.velocity.x);        }
        if (this.position.z < bounds.minZ) {
            this.position.z = bounds.minZ;
            this.velocity.z = Math.max(0, this.velocity.z);        }
        if (this.position.z > bounds.maxZ) {
            this.position.z = bounds.maxZ;
            this.velocity.z = Math.min(0, this.velocity.z);        }
    }
    
    /**
     * Update rotation with smooth turning - Improved
     */
    updateRotation(deltaTime) {
        const speed = this.velocity.magnitude();
        
        if (speed > 0.1) {
            // Calculate target rotation from velocity
            const velocityAngle = this.velocity.angle();
            this.targetRotation = -velocityAngle + Math.PI / 2;
            
            // Calculate rotation difference
            let rotationDiff = this.normalizeAngle(this.targetRotation - this.currentRotation);
            
            // Detect if we're making a sharp turn
            const isSharpTurn = Math.abs(rotationDiff) > Math.PI / 3; // 60 degrees
            
            // Adjust turn speed based on movement speed and turn sharpness
            let effectiveTurnSpeed = this.turnSpeed;
            
            if (isSharpTurn) {
                // Slower movement allows sharper turns
                effectiveTurnSpeed *= (1 + (1 - Math.min(speed / this.maxSpeed, 1)) * 0.5);
            } else {
                // Gradual turns are smoother at higher speeds
                effectiveTurnSpeed *= (0.8 + Math.min(speed / this.maxSpeed, 1) * 0.4);
            }
            
            // Apply rotation with improved smoothing
            const rotationStep = rotationDiff * effectiveTurnSpeed * deltaTime;
            
            // Prevent overshooting on small adjustments
            if (Math.abs(rotationDiff) < 0.1 && Math.abs(rotationStep) > Math.abs(rotationDiff)) {
                this.currentRotation = this.targetRotation;
            } else {
                this.currentRotation += rotationStep;
            }
            
            // Normalize rotation
            this.currentRotation = this.normalizeAngle(this.currentRotation);
        }
        
        // Apply rotation to mesh
        if (this.mesh) {
            this.mesh.rotation.y = this.currentRotation;
        }
    }
    
    /**
     * Update stamina system.
     *
     * Cycle 23 Phase B: re-add the release-shift lock removed in Cycle 8.
     * Cycle 8 attempted to simplify by removing the lock — auto-resume
     * once stamina passed the threshold — but the v1.3.0 playtest found
     * the resulting ~0.83s stutter cycle (0.33s sprint / 0.5s walk)
     * visually reads as continuous sprint, defeating the depletion gate.
     *
     * The two-gate design (per Cycle 7 settled decision):
     *   - canStartSprint:    requires stamina >= minStaminaToSprint
     *   - canContinueSprint: only valid mid-sprint, drops at stamina <= 0
     *
     * Plus a third condition: after a depletion exit, sprint is locked
     * out until the player releases Shift. The lock-out is the cliff
     * Cycle 8 was missing — it converts depletion into a deliberate
     * "you must let go and let it recover, then re-engage" mechanic.
     */
    updateStamina(wantsSprint, deltaTime) {
        const isMoving = this.velocity.magnitude() > 0.1;

        // Release-shift unlock — clear the lock-out the moment Shift comes up.
        if (!wantsSprint) {
            this._sprintLockOut = false;
        }

        const canStartSprint = this.stamina >= this.minStaminaToSprint && !this._sprintLockOut;
        const canContinueSprint = this.isSprinting && this.stamina > 0;
        const sprintActive = wantsSprint && isMoving && (canStartSprint || canContinueSprint);

        if (sprintActive) {
            this.isSprinting = true;
            this.stamina = Math.max(0, this.stamina - this.staminaDrainRate * deltaTime);
            if (this.stamina <= 0) {
                this.isSprinting = false;
                // Latch the lock so re-engagement requires Shift release.
                this._sprintLockOut = true;
            }
        } else {
            this.isSprinting = false;
            const regenRate = isMoving ? this.staminaRegenRate : this.staminaRegenRate * 2;
            this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * deltaTime);
        }
    }

    /**
     * Get stamina information for UI
     */
    getStaminaInfo() {
        return {
            current: this.stamina,
            max: this.maxStamina,
            percentage: (this.stamina / this.maxStamina) * 100,
            isSprinting: this.isSprinting,
            canSprint: this.stamina >= this.minStaminaToSprint,
            isExhausted: this.stamina <= 0
        };
    }
    
    /**
     * Update speeds for multiplayer mode
     */
    setMultiplayerSpeeds(isMultiplayer = true) {
        const speedMultiplier = isMultiplayer ? 2 : 1;
        this.maxSpeed = 15 * speedMultiplier;
        this.sprintSpeed = 25 * speedMultiplier;
        this.acceleration = 40 * speedMultiplier;
        this.deceleration = 35 * speedMultiplier;
    }
    
    /**
     * Stop movement
     */
    stop() {
        this.targetVelocity.multiply(0);
    }
    
    /**
     * Set audio manager
     */
    setAudioManager(audioManager) {
        this.audioManager = audioManager;
    }
    
    /**
     * Update whether the dog is near sheep for barking purposes
     */
    updateNearSheepStatus(sheep) {
        if (!sheep || sheep.length === 0) {
            this.nearSheep = false;
            return;
        }
        
        const barkRadius = 12;
        this.nearSheep = false;
        
        for (let i = 0; i < sheep.length; i++) {
            const sheepInstance = sheep[i];
            if (sheepInstance && sheepInstance.position) {
                const distance = this.position.distanceTo(sheepInstance.position);
                if (distance < barkRadius) {
                    this.nearSheep = true;
                    break;
                }
            }
        }
    }
    
    /**
     * Create colored player icon for competitive mode
     */
    createPlayerIcon(gateColor) {
        if (this.playerIcon) {
            this.removePlayerIcon();
        }
        
        const iconGeometry = new THREE.ConeGeometry(0.3, 0.4, 4);
        iconGeometry.rotateX(Math.PI);
        
        const iconMaterial = new THREE.MeshToonMaterial({
            color: gateColor,
            emissive: gateColor,
            emissiveIntensity: 0.3,
            fog: true
        });
        
        this.playerIcon = new THREE.Mesh(iconGeometry, iconMaterial);
        
        const iconHeight = this.dogType === 'pip' ? 2.2 : 2.5;
        this.playerIcon.position.set(0, iconHeight, 0);
        
        this.playerIcon.userData = {
            originalY: iconHeight,
            animationTime: Math.random() * Math.PI * 2
        };
        
        if (this.mesh) {
            this.mesh.add(this.playerIcon);
        }
        
        console.log(`[GAME] Created player icon with color: 0x${gateColor.toString(16).toUpperCase()}`);
    }
    
    /**
     * Update player icon color
     */
    updatePlayerIcon(gateColor) {
        if (this.playerIcon && this.playerIcon.material) {
            this.playerIcon.material.color.setHex(gateColor);
            this.playerIcon.material.emissive.setHex(gateColor);
        }
    }
    
    /**
     * Remove player icon
     */
    removePlayerIcon() {
        if (this.playerIcon && this.mesh) {
            this.mesh.remove(this.playerIcon);
            this.playerIcon.geometry.dispose();
            this.playerIcon.material.dispose();
            this.playerIcon = null;
        }
    }
    
    /**
     * Set player information for competitive mode
     */
    setPlayerInfo(playerId, gateColor) {
        this.playerId = playerId;
        if (gateColor !== undefined) {
            this.createPlayerIcon(gateColor);
        }
    }
    
    /**
     * Animate player icon floating effect
     * @param {number} deltaTime - Time since last frame
     * @param {number} cameraDistance - Optional camera distance for scaling in local multiplayer
     */
    animatePlayerIcon(deltaTime, cameraDistance = null) {
        if (this.playerIcon && this.playerIcon.userData) {
            this.playerIcon.userData.animationTime += deltaTime;
            const floatOffset = Math.sin(this.playerIcon.userData.animationTime * 2) * 0.1;
            this.playerIcon.position.y = this.playerIcon.userData.originalY + floatOffset;

            // Scale icon based on camera distance for local multiplayer
            if (cameraDistance) {
                const baseDistance = 80;
                const baseScale = 2.5; // Base scale for local multiplayer (set in startLocalGame)
                const maxScale = 6.0;
                const minScale = baseScale;
                // Calculate scale proportional to camera distance
                const scaleFactor = Math.max(minScale, Math.min(maxScale, baseScale * (cameraDistance / baseDistance)));
                this.playerIcon.scale.set(scaleFactor, scaleFactor, scaleFactor);

                // Also raise the icon higher when camera is zoomed out
                const heightFactor = cameraDistance / baseDistance;
                this.playerIcon.userData.originalY = 3.5 * Math.max(1, heightFactor * 0.7);
            }
        }
    }
    
    /**
     * Main animation update - called from move() method
     * @param {number} deltaTime - Time since last frame
     * @param {number} cameraDistance - Optional camera distance for scaling icons in local multiplayer
     */
    animate(deltaTime, cameraDistance = null) {
        // Update player icon animation with optional camera distance scaling
        this.animatePlayerIcon(deltaTime, cameraDistance);

        // Animation system is handled in updateAnimationSystem()
        // This method is kept for compatibility with existing code
    }

    /**
     * Create distance indicator for local player
     * Floating marker above dog - always visible, added to scene directly
     */
    createDistanceIndicator() {
        if (this.distanceIndicator) {
            this.removeDistanceIndicator();
        }

        // Create a group to hold indicator elements
        this.distanceIndicator = new THREE.Group();
        this.distanceIndicator.renderOrder = 999;

        // Floating arrow/chevron pointing down
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, 0);
        arrowShape.lineTo(-0.8, 1.2);
        arrowShape.lineTo(-0.4, 1.2);
        arrowShape.lineTo(0, 0.5);
        arrowShape.lineTo(0.4, 1.2);
        arrowShape.lineTo(0.8, 1.2);
        arrowShape.lineTo(0, 0);

        const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
        const arrowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        arrow.position.y = 6;
        arrow.renderOrder = 1000;
        this.distanceIndicator.add(arrow);

        // Top diamond
        const diamondGeometry = new THREE.OctahedronGeometry(0.5, 0);
        const diamondMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false
        });
        const diamond = new THREE.Mesh(diamondGeometry, diamondMaterial);
        diamond.position.y = 8;
        diamond.scale.set(1, 1.5, 1);
        diamond.renderOrder = 1000;
        this.distanceIndicator.add(diamond);

        // Store references for animation
        this.distanceIndicator.userData = {
            arrow,
            diamond,
            animationTime: 0
        };

        // Add to scene directly (not as child of mesh) to avoid occlusion
        const scene = getSceneManager()?.getScene();
        if (scene) {
            scene.add(this.distanceIndicator);
            console.log(`[INDICATOR] Created and added to scene for ${this.dogType}`);
        } else {
            console.warn(`[INDICATOR] Scene not available, indicator will be added later`);
        }

        this.isLocalPlayer = true;
    }

    /**
     * Ensure indicator is in the scene
     */
    ensureIndicatorAttached() {
        if (this.isLocalPlayer && this.distanceIndicator && !this.distanceIndicator.parent) {
            const scene = getSceneManager()?.getScene();
            if (scene) {
                scene.add(this.distanceIndicator);
                console.log('Distance indicator attached to scene (deferred)');
            }
        }
    }

    /**
     * Remove distance indicator
     */
    removeDistanceIndicator() {
        console.log(`[INDICATOR] removeDistanceIndicator called, indicator exists: ${!!this.distanceIndicator}`);
        if (this.distanceIndicator) {
            console.log(`[INDICATOR] Indicator parent: ${this.distanceIndicator.parent?.type || 'none'}`);
            if (this.distanceIndicator.parent) {
                this.distanceIndicator.parent.remove(this.distanceIndicator);
                console.log('[INDICATOR] Removed from parent');
            }
            this.distanceIndicator.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.distanceIndicator = null;
            console.log('[INDICATOR] Disposed and nulled');
        }
    }

    /**
     * Update distance indicator - follows the dog position
     * @param {number} cameraDistance - Distance from camera to dog
     * @param {number} deltaTime - Time since last frame
     * @param {boolean} isLocalMultiplayer - Whether this is local 2-player mode
     */
    updateDistanceIndicator(cameraDistance, deltaTime, isLocalMultiplayer = false) {
        // Ensure indicator is attached
        this.ensureIndicatorAttached();

        if (!this.distanceIndicator || !this.distanceIndicator.userData) return;

        // Update position to follow dog using mesh position (updated by Three.js).
        // Track the dog's mesh.y (terrain-clamped) — not world y=0 — so the
        // chevron + diamond stay anchored to the dog on hills. Was: y hard-set
        // to 0, which made the indicator visibly drift uphill as the dog
        // climbed (parallax through the angled camera).
        if (this.mesh) {
            this.distanceIndicator.position.set(
                this.mesh.position.x,
                this.mesh.position.y,
                this.mesh.position.z
            );
        }

        const data = this.distanceIndicator.userData;
        data.animationTime += deltaTime;

        // Calculate scale based on camera distance for local multiplayer
        // When camera zooms out, scale up the indicators so they remain visible
        let scale = 1.0;
        if (isLocalMultiplayer && cameraDistance) {
            // Base scale at distance 80 (default camera distance)
            // Scale up proportionally as camera zooms out
            const baseDistance = 80;
            const maxScale = 3.0; // Maximum scale factor
            const minScale = 1.0; // Minimum scale factor
            scale = Math.max(minScale, Math.min(maxScale, cameraDistance / baseDistance));
        }

        // Apply scale to the indicator group
        this.distanceIndicator.scale.set(scale, scale, scale);

        // Adjust height based on scale for local multiplayer
        const baseArrowHeight = 6;
        const baseDiamondHeight = 8;
        const heightMultiplier = isLocalMultiplayer ? 1.2 : 1.0; // Raise higher in local multiplayer

        // Update arrow - bob up and down
        if (data.arrow) {
            const bob = Math.sin(data.animationTime * 3) * 0.3;
            data.arrow.position.y = (baseArrowHeight * heightMultiplier) + bob;
        }

        // Update diamond - rotate and bob
        if (data.diamond) {
            const bob2 = Math.sin(data.animationTime * 2.5 + Math.PI) * 0.3;
            data.diamond.position.y = (baseDiamondHeight * heightMultiplier) + bob2;
            data.diamond.rotation.y = data.animationTime * 2;
        }
    }

    /**
     * Mark this as the local player and create indicator
     */
    setAsLocalPlayer() {
        this.isLocalPlayer = true;
        this.createDistanceIndicator();
    }
}
