import * as THREE from 'three';
import * as SkeletonUtils from 'https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/utils/SkeletonUtils.js';
import { Vector2D } from './Vector2D.js';
import { getTerrainBuilder, getSceneManager } from './GameBridge.js';

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
    },
    SITTING: {
        animations: {
            start: 'Sitting_start',
            loop: ['Sitting_loop_1', 'Sitting_loop_2'],
            end: 'Sitting_end'
        },
        priority: 1,
        transitionTime: 0.4
    }
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
 * Sheepdog class - Professional player controlled entity with advanced animation system
 */
export class Sheepdog {
    constructor(x, z, dogType = 'jep') {
        this.position = new Vector2D(x, z);
        this.velocity = new Vector2D(0, 0);
        this.targetVelocity = new Vector2D(0, 0);
        this.dogType = dogType;
        
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
            sittingPhase: 'none', // 'none', 'starting', 'sitting', 'ending'
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
    }
    
    /**
     * Initialize the model and set up the mesh group
     */
    initializeModel() {
        this.mesh = new THREE.Group();
        this.mesh.position.set(this.position.x, 0, this.position.z);
        
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
        animations.forEach(clip => {
            const action = this.animationSystem.mixer.clipAction(clip);
            this.animationSystem.actions.set(clip.name, action);
        });
        
        // Start with first idle animation
        this.transitionToState('IDLE');
        
        console.log(`[DOG] Animation system ready with ${animations.length} animations`);
        console.log('[DOG] Available animations:', animations.map(anim => anim.name).sort());
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
            // Handle special sitting state
            if (state === 'SITTING') {
                switch (this.animationSystem.sittingPhase) {
                    case 'starting':
                        return stateConfig.animations.start;
                    case 'sitting':
                        const loopAnimations = stateConfig.animations.loop;
                        const loopIndex = Math.floor(Math.random() * loopAnimations.length);
                        return loopAnimations[loopIndex];
                    case 'ending':
                        return stateConfig.animations.end;
                    default:
                        return stateConfig.animations.start;
                }
            }
            
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
     * Determine appropriate animation state based on speed and context - Improved
     */
    determineAnimationState() {
        const speed = this.velocity.magnitude();
        const targetSpeed = this.targetVelocity.magnitude();
        
        // Check for special states first (removed barking)
        if (this.animationSystem.sittingPhase !== 'none') {
            return 'SITTING';
        }
        
        // Use target velocity to immediately stop idle when input is detected
        // This ensures idle stops as soon as the player starts moving
        if (speed < SPEED_THRESHOLDS.IDLE && targetSpeed < SPEED_THRESHOLDS.IDLE) {
            return 'IDLE';
        }
        
        // Speed-based states with smooth progression
        if (speed < SPEED_THRESHOLDS.WALKING) {
            return 'WALKING';
        } else if (speed < SPEED_THRESHOLDS.TROTTING) {
            return 'TROTTING';
        } else if (speed < SPEED_THRESHOLDS.RUNNING) {
            return 'RUNNING';
        } else {
            return 'SPRINTING';
        }
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
                
            case 'SITTING':
                if (this.animationSystem.sittingPhase === 'none') {
                    this.animationSystem.sittingPhase = 'starting';
                }
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
            
            // Check for sitting after long idle
            const timeSinceMovement = performance.now() - this.animationSystem.lastMovementTime;
            if (timeSinceMovement > 15000 && this.animationSystem.sittingPhase === 'none' && Math.random() < 0.001) {
                this.animationSystem.sittingPhase = 'starting';
            }
        }
        
        // Handle sitting state machine
        this.updateSittingStateMachine();
        
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
     * Update sitting state machine
     */
    updateSittingStateMachine() {
        if (this.animationSystem.sittingPhase === 'none') return;
        
        const speed = this.velocity.magnitude();
        
        // Exit sitting if moving
        if (speed > SPEED_THRESHOLDS.IDLE) {
            if (this.animationSystem.sittingPhase === 'sitting') {
                this.animationSystem.sittingPhase = 'ending';
                this.transitionToState('SITTING');
            } else {
                this.animationSystem.sittingPhase = 'none';
            }
            return;
        }
        
        // Handle sitting phases
        switch (this.animationSystem.sittingPhase) {
            case 'starting':
                if (this.animationSystem.stateTimer > 1250) { // Sitting_start duration
                    this.animationSystem.sittingPhase = 'sitting';
                    this.transitionToState('SITTING');
                }
                break;
                
            case 'sitting':
                // Randomly switch between sitting loop animations
                if (this.animationSystem.stateTimer > 3000 && Math.random() < 0.01) {
                    this.transitionToState('SITTING');
                }
                break;
                
            case 'ending':
                if (this.animationSystem.stateTimer > 1040) { // Sitting_end duration
                    this.animationSystem.sittingPhase = 'none';
                }
                break;
        }
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
        
        // Set target velocity
        this.targetVelocity = direction.clone().normalize().multiply(currentMaxSpeed);
        
        // Smooth acceleration/deceleration
        const accelerationRate = direction.magnitude() > 0 ? this.acceleration : this.deceleration;
        const velocityDiff = this.targetVelocity.clone().subtract(this.velocity);
        const velocityChange = velocityDiff.clone().multiply(accelerationRate * deltaTime);
        
        // Apply velocity change
        this.velocity.add(velocityChange);
        
        // Limit to current max speed
        if (this.velocity.magnitude() > currentMaxSpeed) {
            this.velocity.normalize().multiply(currentMaxSpeed);
        }
        
        // Calculate new position
        const newPosition = this.position.clone().add(this.velocity.clone().multiply(deltaTime));
        this.position = newPosition;
        
        // Apply boundary constraints
        this.applyBoundaryConstraints(bounds);
        
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
            
            // Smooth rotation
            this.updateRotation(deltaTime);
            
            // Update animation system
            this.updateAnimationSystem(deltaTime);
        }
    }
    
    /**
     * Apply boundary constraints with velocity correction
     */
    applyBoundaryConstraints(bounds) {
        let hitBoundary = false;
        
        if (this.position.x < bounds.minX) {
            this.position.x = bounds.minX;
            this.velocity.x = Math.max(0, this.velocity.x);
            hitBoundary = true;
        }
        if (this.position.x > bounds.maxX) {
            this.position.x = bounds.maxX;
            this.velocity.x = Math.min(0, this.velocity.x);
            hitBoundary = true;
        }
        if (this.position.z < bounds.minZ) {
            this.position.z = bounds.minZ;
            this.velocity.z = Math.max(0, this.velocity.z);
            hitBoundary = true;
        }
        if (this.position.z > bounds.maxZ) {
            this.position.z = bounds.maxZ;
            this.velocity.z = Math.min(0, this.velocity.z);
            hitBoundary = true;
        }
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
     * Update stamina system
     */
    updateStamina(wantsSprint, deltaTime) {
        const isMoving = this.velocity.magnitude() > 0.1;
        
        if (wantsSprint && isMoving && this.stamina >= this.minStaminaToSprint) {
            this.isSprinting = true;
            this.stamina = Math.max(0, this.stamina - this.staminaDrainRate * deltaTime);
        } else {
            this.isSprinting = false;
            const regenRate = isMoving ? this.staminaRegenRate : this.staminaRegenRate * 2;
            this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * deltaTime);
        }
        
        if (this.stamina <= 0) {
            this.isSprinting = false;
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
            canSprint: this.stamina >= this.minStaminaToSprint
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
     */
    animatePlayerIcon(deltaTime) {
        if (this.playerIcon && this.playerIcon.userData) {
            this.playerIcon.userData.animationTime += deltaTime;
            const floatOffset = Math.sin(this.playerIcon.userData.animationTime * 2) * 0.1;
            this.playerIcon.position.y = this.playerIcon.userData.originalY + floatOffset;
        }
    }
    
    /**
     * Main animation update - called from move() method
     */
    animate(deltaTime) {
        // Update player icon animation
        this.animatePlayerIcon(deltaTime);

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
        if (this.distanceIndicator) {
            if (this.distanceIndicator.parent) {
                this.distanceIndicator.parent.remove(this.distanceIndicator);
            }
            this.distanceIndicator.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.distanceIndicator = null;
        }
    }

    /**
     * Update distance indicator - follows the dog position
     * @param {number} cameraDistance - Distance from camera to dog
     * @param {number} deltaTime - Time since last frame
     */
    updateDistanceIndicator(cameraDistance, deltaTime) {
        // Ensure indicator is attached
        this.ensureIndicatorAttached();

        if (!this.distanceIndicator || !this.distanceIndicator.userData) return;

        // Update position to follow dog using mesh position (updated by Three.js)
        if (this.mesh) {
            this.distanceIndicator.position.set(this.mesh.position.x, 0, this.mesh.position.z);
        }

        const data = this.distanceIndicator.userData;
        data.animationTime += deltaTime;

        // Update arrow - bob up and down
        if (data.arrow) {
            const bob = Math.sin(data.animationTime * 3) * 0.3;
            data.arrow.position.y = 6 + bob;
        }

        // Update diamond - rotate and bob
        if (data.diamond) {
            const bob2 = Math.sin(data.animationTime * 2.5 + Math.PI) * 0.3;
            data.diamond.position.y = 8 + bob2;
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
