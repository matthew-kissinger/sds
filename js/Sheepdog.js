import * as THREE from 'three';
import { Vector2D } from './Vector2D.js';

/**
 * Sheepdog class - player controlled entity
 * Toony design with smooth animations and buttery controls
 */
export class Sheepdog {
    constructor(x, z) {
        this.position = new Vector2D(x, z);
        this.velocity = new Vector2D(0, 0);
        this.targetVelocity = new Vector2D(0, 0);
        
        // Movement parameters for smooth control
        this.maxSpeed = 15; // Normal max speed
        this.sprintSpeed = 25; // Sprint max speed
        this.acceleration = 40; // How fast we reach max speed
        this.deceleration = 30; // How fast we stop
        this.turnSpeed = 8; // How fast we rotate
        
        // Stamina system
        this.maxStamina = 100;
        this.stamina = this.maxStamina;
        this.staminaDrainRate = 30; // Stamina per second when sprinting
        this.staminaRegenRate = 20; // Stamina per second when not sprinting
        this.minStaminaToSprint = 10; // Minimum stamina needed to start sprinting
        this.isSprinting = false;
        
        // Animation properties
        this.animationTime = 0;
        this.runCycle = 0;
        this.tailWag = 0;
        this.earFlap = 0;
        this.currentRotation = 0;
        this.targetRotation = 0;
        
        // Idle animation properties
        this.idleTime = 0;
        this.nextIdleAction = 0;
        this.currentIdleAction = 'breathing';
        this.idleActionDuration = 0;
        this.lookDirection = 0;
        this.targetLookDirection = 0;
        
        // Store references to animated parts
        this.animatedParts = {
            body: null,
            head: null,
            tail: null,
            ears: [],
            legs: [],
            tongue: null
        };
        
        this.mesh = null;
        this.isMoving = false;
        this.audioManager = null;
        
        // Audio tracking
        this.lastBarkTime = 0;
        this.barkCooldown = 2000; // 2 seconds between barks
        this.nearSheep = false; // Track if dog is near sheep for barking
        
        // Initialize shared resources
        this.initializeSharedResources();
    }
    
    // Static initialization for shared resources
    initializeSharedResources() {
        if (Sheepdog.sharedGeometries) return;
        
        Sheepdog.sharedGeometries = {
            // Body parts
            body: new THREE.CapsuleGeometry(0.35, 1.0, 6, 8),
            chest: new THREE.SphereGeometry(0.3, 8, 6),
            head: new THREE.SphereGeometry(0.35, 8, 6),
            snout: new THREE.ConeGeometry(0.2, 0.4, 6),
            nose: new THREE.SphereGeometry(0.08, 6, 5),
            
            // Features
            eye: new THREE.SphereGeometry(0.08, 6, 5),
            pupil: new THREE.SphereGeometry(0.04, 5, 4),
            ear: new THREE.TetrahedronGeometry(0.25, 0),
            
            // Limbs
            leg: new THREE.CapsuleGeometry(0.08, 0.4, 4, 6),
            paw: new THREE.SphereGeometry(0.12, 6, 5),
            
            // Tail segments
            tailBase: new THREE.CylinderGeometry(0.12, 0.08, 0.3, 6),
            tailMid: new THREE.CylinderGeometry(0.08, 0.06, 0.3, 6),
            tailTip: new THREE.SphereGeometry(0.08, 6, 5),
            
            // Tongue
            tongue: new THREE.BoxGeometry(0.15, 0.02, 0.2)
        };
        
        Sheepdog.sharedMaterials = {
            // Main colors
            blackFur: new THREE.MeshToonMaterial({ 
                color: 0x2a2a2a,
                emissive: 0x1a1a1a,
                emissiveIntensity: 0.1,
                fog: true
            }),
            whiteFur: new THREE.MeshToonMaterial({ 
                color: 0xffffff,
                emissive: 0xf5f5f5,
                emissiveIntensity: 0.1,
                fog: true
            }),
            
            // Features
            nose: new THREE.MeshToonMaterial({
                color: 0x222222,
                fog: true
            }),
            eye: new THREE.MeshBasicMaterial({ 
                color: 0xffffff,
                fog: false
            }),
            pupil: new THREE.MeshBasicMaterial({ 
                color: 0x000000,
                fog: false
            }),
            tongue: new THREE.MeshToonMaterial({
                color: 0xff6b9d,
                emissive: 0xff4b7d,
                emissiveIntensity: 0.2,
                fog: true
            })
        };
        
        // Create gradient map for toon shading
        const gradientTexture = new THREE.DataTexture(
            new Uint8Array([0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255, 255, 255, 255, 255]),
            4, 1, THREE.RGBAFormat
        );
        gradientTexture.magFilter = THREE.NearestFilter;
        gradientTexture.minFilter = THREE.NearestFilter;
        
        // Apply gradient map
        Sheepdog.sharedMaterials.blackFur.gradientMap = gradientTexture;
        Sheepdog.sharedMaterials.whiteFur.gradientMap = gradientTexture;
        Sheepdog.sharedMaterials.nose.gradientMap = gradientTexture;
        Sheepdog.sharedMaterials.tongue.gradientMap = gradientTexture;
    }

    // Create Three.js mesh for the sheepdog
    createMesh() {
        const geom = Sheepdog.sharedGeometries;
        const mat = Sheepdog.sharedMaterials;
        
        this.mesh = new THREE.Group();
        
        // BODY GROUP (will bounce)
        const bodyGroup = new THREE.Group();
        this.animatedParts.body = bodyGroup;
        
        // Main body (black with white chest)
        const body = new THREE.Mesh(geom.body, mat.blackFur);
        body.rotation.x = Math.PI / 2; // Rotate around X axis to make it horizontal
        body.position.set(0, 0, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        bodyGroup.add(body);
        
        // White chest/belly
        const chest = new THREE.Mesh(geom.chest, mat.whiteFur);
        chest.position.set(0, -0.15, 0.3);
        chest.scale.set(0.6, 0.5, 0.4);
        bodyGroup.add(chest);
        
        // HEAD GROUP
        const headGroup = new THREE.Group();
        this.animatedParts.head = headGroup;
        
        // Head (black)
        const head = new THREE.Mesh(geom.head, mat.blackFur);
        head.scale.set(1, 0.9, 1);
        headGroup.add(head);
        
        // White muzzle marking
        const muzzle = new THREE.Mesh(geom.snout, mat.whiteFur);
        muzzle.rotation.x = -Math.PI / 2;
        muzzle.position.set(0, -0.05, 0.35);
        muzzle.scale.set(0.8, 0.8, 0.9);
        headGroup.add(muzzle);
        
        // Snout (black)
        const snout = new THREE.Mesh(geom.snout, mat.blackFur);
        snout.rotation.x = -Math.PI / 2;
        snout.position.set(0, -0.05, 0.4);
        snout.scale.set(0.6, 0.6, 0.7);
        headGroup.add(snout);
        
        // Nose
        const nose = new THREE.Mesh(geom.nose, mat.nose);
        nose.position.set(0, -0.05, 0.55);
        headGroup.add(nose);
        
        // EYES
        const leftEye = new THREE.Mesh(geom.eye, mat.eye);
        leftEye.position.set(-0.12, 0.05, 0.25);
        headGroup.add(leftEye);
        
        const leftPupil = new THREE.Mesh(geom.pupil, mat.pupil);
        leftPupil.position.set(-0.12, 0.05, 0.3);
        headGroup.add(leftPupil);
        
        const rightEye = new THREE.Mesh(geom.eye, mat.eye);
        rightEye.position.set(0.12, 0.05, 0.25);
        headGroup.add(rightEye);
        
        const rightPupil = new THREE.Mesh(geom.pupil, mat.pupil);
        rightPupil.position.set(0.12, 0.05, 0.3);
        headGroup.add(rightPupil);
        
        // EARS (floppy border collie style)
        const leftEar = new THREE.Mesh(geom.ear, mat.blackFur);
        leftEar.scale.set(1, 1.5, 0.5);
        leftEar.position.set(-0.25, 0.1, -0.1);
        leftEar.rotation.set(0, 0, 0.8);
        this.animatedParts.ears.push(leftEar);
        headGroup.add(leftEar);
        
        const rightEar = new THREE.Mesh(geom.ear, mat.blackFur);
        rightEar.scale.set(1, 1.5, 0.5);
        rightEar.position.set(0.25, 0.1, -0.1);
        rightEar.rotation.set(0, 0, -0.8);
        this.animatedParts.ears.push(rightEar);
        headGroup.add(rightEar);
        
        // TONGUE (hanging out when running)
        const tongue = new THREE.Mesh(geom.tongue, mat.tongue);
        tongue.position.set(0.1, -0.2, 0.45);
        tongue.rotation.z = 0.1;
        tongue.visible = false; // Hidden by default
        this.animatedParts.tongue = tongue;
        headGroup.add(tongue);
        
        headGroup.position.set(0, 0.45, 0.7);
        bodyGroup.add(headGroup);
        
        // TAIL (segmented for wagging)
        const tailGroup = new THREE.Group();
        
        const tailBase = new THREE.Mesh(geom.tailBase, mat.blackFur);
        tailBase.rotation.z = -0.7;
        tailBase.position.set(0, 0.1, -0.6);
        tailGroup.add(tailBase);
        
        const tailMid = new THREE.Mesh(geom.tailMid, mat.blackFur);
        tailMid.rotation.z = -0.5;
        tailMid.position.set(0, 0.25, -0.8);
        tailGroup.add(tailMid);
        
        const tailTip = new THREE.Mesh(geom.tailTip, mat.whiteFur);
        tailTip.position.set(0, 0.35, -0.95);
        tailGroup.add(tailTip);
        
        this.animatedParts.tail = tailGroup;
        bodyGroup.add(tailGroup);
        
        // LEGS - spread out more for realistic dog proportions
        const legPositions = [
            { x: -0.15, z: 0.6, name: 'frontLeft' },
            { x: 0.15, z: 0.6, name: 'frontRight' },
            { x: -0.15, z: -0.6, name: 'backLeft' },
            { x: 0.15, z: -0.6, name: 'backRight' }
        ];
        
        legPositions.forEach((pos, i) => {
            const legGroup = new THREE.Group();
            
            // Upper leg (shorter)
            const leg = new THREE.Mesh(geom.leg, mat.blackFur);
            leg.position.y = -0.15;
            leg.scale.set(1, 0.7, 1); // Make legs shorter
            legGroup.add(leg);
            
            // White sock on front legs
            if (i < 2) {
                const sock = new THREE.Mesh(geom.leg, mat.whiteFur);
                sock.position.y = -0.22;
                sock.scale.set(1.1, 0.4, 1.1);
                legGroup.add(sock);
            }
            
            // Paw
            const paw = new THREE.Mesh(geom.paw, mat.blackFur);
            paw.position.y = -0.32;
            paw.scale.set(0.8, 0.8, 0.8); // Slightly smaller paws
            legGroup.add(paw);
            
            legGroup.position.set(pos.x, -0.15, pos.z);
            legGroup.userData = { 
                index: i, 
                baseX: pos.x,
                baseY: -0.15,
                baseZ: pos.z,
                name: pos.name 
            };
            
            this.animatedParts.legs.push(legGroup);
            bodyGroup.add(legGroup);
        });
        
        bodyGroup.position.y = 0.6;
        this.mesh.add(bodyGroup);
        
        // Position mesh
        this.mesh.position.set(this.position.x, 0, this.position.z);
        
        return this.mesh;
    }

    // Smooth movement with acceleration
    move(direction, bounds, deltaTime = 0.016, wantsSprint = false) {
        // Update stamina based on sprint state
        this.updateStamina(wantsSprint, deltaTime);
        
        // Determine current max speed based on sprint state
        const currentMaxSpeed = this.isSprinting ? this.sprintSpeed : this.maxSpeed;
        
        // Set target velocity based on input
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
        
        // Check boundaries with margin
        const margin = 1;
        if (newPosition.x >= bounds.minX + margin && newPosition.x <= bounds.maxX - margin &&
            newPosition.z >= bounds.minZ + margin && newPosition.z <= bounds.maxZ - margin) {
            this.position = newPosition;
        } else {
            // Bounce off walls slightly
            this.velocity.multiply(0.5);
        }
        
        this.isMoving = this.velocity.magnitude() > 0.5;
        const speedNormalized = Math.min(this.velocity.magnitude() / this.maxSpeed, 1);
        
        // Play bark sound when actively herding sheep (near sheep and moving)
        if (this.audioManager && this.isMoving && this.nearSheep) {
            const now = Date.now();
            if (now - this.lastBarkTime > this.barkCooldown) {
                this.audioManager.playSheepdogBark();
                this.lastBarkTime = now;
            }
        }
        
        // Update mesh position and rotation
        if (this.mesh) {
            this.mesh.position.x = this.position.x;
            this.mesh.position.z = this.position.z;
            
            // Smooth rotation
            if (this.velocity.magnitude() > 0.1) {
                this.targetRotation = -this.velocity.angle() + Math.PI / 2;
            }
            
            // Normalize rotation difference
            let rotationDiff = this.targetRotation - this.currentRotation;
            while (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI;
            while (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI;
            
            // Apply smooth rotation
            this.currentRotation += rotationDiff * this.turnSpeed * deltaTime;
            this.mesh.rotation.y = this.currentRotation;
            
            // Animate
            this.animate(deltaTime);
        }
    }
    
    // Update stamina system
    updateStamina(wantsSprint, deltaTime) {
        const isMoving = this.velocity.magnitude() > 0.1;
        
        // Determine if we can/should sprint
        if (wantsSprint && isMoving && this.stamina >= this.minStaminaToSprint) {
            this.isSprinting = true;
            // Drain stamina when sprinting
            this.stamina = Math.max(0, this.stamina - this.staminaDrainRate * deltaTime);
        } else {
            this.isSprinting = false;
            // Regenerate stamina - faster when idle (not moving)
            const regenRate = isMoving ? this.staminaRegenRate : this.staminaRegenRate * 2;
            this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * deltaTime);
        }
        
        // Force stop sprinting if stamina is depleted
        if (this.stamina <= 0) {
            this.isSprinting = false;
        }
    }
    
    // Get stamina information for UI
    getStaminaInfo() {
        return {
            current: this.stamina,
            max: this.maxStamina,
            percentage: (this.stamina / this.maxStamina) * 100,
            isSprinting: this.isSprinting,
            canSprint: this.stamina >= this.minStaminaToSprint
        };
    }
    
    // Animate the dog based on movement
    animate(deltaTime) {
        if (!this.animatedParts.body) return;
        
        this.animationTime += deltaTime;
        const speed = this.velocity.magnitude();
        const speedNormalized = Math.min(speed / this.maxSpeed, 1);
        
        // Running animation
        if (this.isMoving) {
            // Increase animation speed when sprinting
            const animationMultiplier = this.isSprinting ? 1.5 : 1.0;
            this.runCycle += deltaTime * speed * 0.5 * animationMultiplier;
            
            // Body bounce (more intense when sprinting)
            const bounceIntensity = this.isSprinting ? 0.1 : 0.06;
            const bounce = Math.sin(this.runCycle * 2) * speedNormalized * bounceIntensity;
            this.animatedParts.body.position.y = 0.6 + bounce;
            
            // Body lean forward when running (more when sprinting)
            const leanIntensity = this.isSprinting ? 0.25 : 0.15;
            this.animatedParts.body.rotation.x = speedNormalized * leanIntensity;
            
            // Head bob and reset idle rotations
            const headBob = Math.sin(this.runCycle * 2 + 0.5) * speedNormalized * 0.05;
            this.animatedParts.head.position.y = 0.35 + headBob;
            this.animatedParts.head.rotation.x = Math.sin(this.runCycle * 2) * speedNormalized * 0.1;
            
            // Reset idle head rotations when moving
            this.animatedParts.head.rotation.y *= 0.9; // Reset look direction
            this.animatedParts.head.rotation.z *= 0.9; // Reset head tilt
            this.lookDirection *= 0.9;
            
            // More realistic dog galloping animation
            this.animatedParts.legs.forEach((leg, i) => {
                // Front legs move together, back legs move together (dog gait)
                const isFrontLeg = i < 2;
                const isLeftLeg = i % 2 === 0;
                
                // Different phases for front and back legs
                const frontPhase = 0;
                const backPhase = Math.PI * 0.5; // Back legs slightly offset
                const sideOffset = isLeftLeg ? 0 : Math.PI * 0.1; // Slight left/right offset
                
                const phase = isFrontLeg ? frontPhase : backPhase;
                const cycleSpeed = this.runCycle * 2.5; // Slightly faster cycle
                
                // Leg lift (more subtle)
                const lift = Math.max(0, Math.sin(cycleSpeed + phase + sideOffset)) * speedNormalized;
                leg.position.y = leg.userData.baseY + lift * 0.12;
                
                // Forward/backward leg extension (more realistic)
                const extension = Math.cos(cycleSpeed + phase + sideOffset) * speedNormalized;
                leg.position.z = leg.userData.baseZ + extension * 0.15;
                
                // Leg rotation (more subtle)
                leg.rotation.x = Math.sin(cycleSpeed + phase + sideOffset) * speedNormalized * 0.4;
            });
            
            // Show tongue when running fast or sprinting
            if (this.animatedParts.tongue) {
                this.animatedParts.tongue.visible = speedNormalized > 0.6 || this.isSprinting;
                if (this.animatedParts.tongue.visible) {
                    const tongueIntensity = this.isSprinting ? 0.15 : 0.1;
                    this.animatedParts.tongue.rotation.z = Math.sin(this.runCycle * 3) * tongueIntensity;
                }
            }
        } else {
            // Enhanced idle animation system
            this.runCycle *= 0.9; // Slow down run cycle
            this.idleTime += deltaTime;
            
            // Check if it's time for a new idle action
            if (this.idleTime >= this.nextIdleAction) {
                this.chooseNextIdleAction();
            }
            
            // Perform current idle action
            this.performIdleAction(deltaTime);
            
            // Reset leg positions smoothly
            this.animatedParts.legs.forEach((leg) => {
                leg.position.y += (leg.userData.baseY - leg.position.y) * 0.1;
                leg.position.z += (leg.userData.baseZ - leg.position.z) * 0.1;
                leg.rotation.x *= 0.9;
            });
            
            // Hide tongue when idle
            if (this.animatedParts.tongue) {
                this.animatedParts.tongue.visible = false;
            }
        }
        
        // Tail wagging (faster when moving, even faster when sprinting)
        const tailSpeedMultiplier = this.isSprinting ? 1.5 : 1.0;
        this.tailWag += deltaTime * (2 + speedNormalized * 4) * tailSpeedMultiplier;
        if (this.animatedParts.tail) {
            const wagAmount = 0.3 + speedNormalized * 0.3 + (this.isSprinting ? 0.2 : 0);
            this.animatedParts.tail.rotation.y = Math.sin(this.tailWag) * wagAmount;
            this.animatedParts.tail.rotation.x = Math.cos(this.tailWag * 0.5) * wagAmount * 0.3;
        }
        
        // Ear flapping
        this.earFlap += deltaTime * (1 + speedNormalized * 2);
        this.animatedParts.ears.forEach((ear, i) => {
            const baseRotation = i === 0 ? 0.8 : -0.8;
            const flap = Math.sin(this.earFlap + i * Math.PI * 0.5) * speedNormalized * 0.2;
            ear.rotation.z = baseRotation + flap;
            ear.rotation.x = -0.2 + Math.cos(this.earFlap * 0.5) * speedNormalized * 0.1;
        });
    }

    // Choose next idle action
    chooseNextIdleAction() {
        const actions = ['breathing', 'lookAround', 'headTilt', 'earTwitch', 'stretch', 'sit'];
        const weights = [30, 25, 20, 15, 8, 2]; // Breathing most common, sitting rare
        
        // Weighted random selection
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        let random = Math.random() * totalWeight;
        
        for (let i = 0; i < actions.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                this.currentIdleAction = actions[i];
                break;
            }
        }
        
        // Set duration and next action time
        this.idleActionDuration = 0;
        switch (this.currentIdleAction) {
            case 'breathing':
                this.nextIdleAction = this.idleTime + 2 + Math.random() * 3; // 2-5 seconds
                break;
            case 'lookAround':
                this.nextIdleAction = this.idleTime + 1.5 + Math.random() * 2; // 1.5-3.5 seconds
                this.targetLookDirection = (Math.random() - 0.5) * Math.PI * 0.8; // Look left/right
                break;
            case 'headTilt':
                this.nextIdleAction = this.idleTime + 1 + Math.random() * 1.5; // 1-2.5 seconds
                break;
            case 'earTwitch':
                this.nextIdleAction = this.idleTime + 0.5 + Math.random() * 1; // 0.5-1.5 seconds
                break;
            case 'stretch':
                this.nextIdleAction = this.idleTime + 3 + Math.random() * 2; // 3-5 seconds
                break;
            case 'sit':
                this.nextIdleAction = this.idleTime + 4 + Math.random() * 3; // 4-7 seconds
                break;
        }
    }
    
    // Perform the current idle action
    performIdleAction(deltaTime) {
        this.idleActionDuration += deltaTime;
        
        switch (this.currentIdleAction) {
            case 'breathing':
                this.performBreathing();
                break;
            case 'lookAround':
                this.performLookAround(deltaTime);
                break;
            case 'headTilt':
                this.performHeadTilt();
                break;
            case 'earTwitch':
                this.performEarTwitch();
                break;
            case 'stretch':
                this.performStretch();
                break;
            case 'sit':
                this.performSit();
                break;
        }
    }
    
    // Individual idle animations
    performBreathing() {
        const breathe = Math.sin(this.animationTime * 2.5) * 0.025;
        this.animatedParts.body.position.y = 0.6 + breathe;
        this.animatedParts.body.rotation.x *= 0.95; // Return to neutral slowly
        
        // Gentle head movement
        if (this.animatedParts.head) {
            this.animatedParts.head.position.y = 0.45 + breathe * 0.5;
        }
    }
    
    performLookAround(deltaTime) {
        // Smooth head turning
        const lookDiff = this.targetLookDirection - this.lookDirection;
        this.lookDirection += lookDiff * 2 * deltaTime;
        
        if (this.animatedParts.head) {
            this.animatedParts.head.rotation.y = this.lookDirection;
            
            // Slight body breathing
            const breathe = Math.sin(this.animationTime * 2) * 0.02;
            this.animatedParts.body.position.y = 0.6 + breathe;
        }
    }
    
    performHeadTilt() {
        const tilt = Math.sin(this.idleActionDuration * 3) * 0.3;
        if (this.animatedParts.head) {
            this.animatedParts.head.rotation.z = tilt;
            
            // Breathing
            const breathe = Math.sin(this.animationTime * 2) * 0.02;
            this.animatedParts.body.position.y = 0.6 + breathe;
        }
    }
    
    performEarTwitch() {
        const twitch = Math.sin(this.idleActionDuration * 8) * 0.4;
        this.animatedParts.ears.forEach((ear, i) => {
            const baseRotation = i === 0 ? 0.8 : -0.8;
            ear.rotation.z = baseRotation + (i === 0 ? twitch : -twitch);
        });
        
        // Breathing
        const breathe = Math.sin(this.animationTime * 2) * 0.02;
        this.animatedParts.body.position.y = 0.6 + breathe;
    }
    
    performStretch() {
        const stretchPhase = this.idleActionDuration / 3; // 3 second stretch
        
        if (stretchPhase < 0.3) {
            // Stretch forward
            this.animatedParts.body.rotation.x = -0.2 * (stretchPhase / 0.3);
            this.animatedParts.body.position.y = 0.6 - 0.1 * (stretchPhase / 0.3);
        } else if (stretchPhase < 0.7) {
            // Hold stretch
            this.animatedParts.body.rotation.x = -0.2;
            this.animatedParts.body.position.y = 0.5;
        } else {
            // Return to normal
            const returnPhase = (stretchPhase - 0.7) / 0.3;
            this.animatedParts.body.rotation.x = -0.2 * (1 - returnPhase);
            this.animatedParts.body.position.y = 0.5 + 0.1 * returnPhase;
        }
    }
    
    performSit() {
        const sitPhase = Math.min(this.idleActionDuration / 1, 1); // 1 second to sit
        
        // Lower body and rotate back legs
        this.animatedParts.body.position.y = 0.6 - 0.2 * sitPhase;
        this.animatedParts.body.rotation.x = 0.3 * sitPhase;
        
        // Move back legs
        if (this.animatedParts.legs.length >= 4) {
            this.animatedParts.legs[2].rotation.x = -0.8 * sitPhase; // Back left
            this.animatedParts.legs[3].rotation.x = -0.8 * sitPhase; // Back right
            this.animatedParts.legs[2].position.y = this.animatedParts.legs[2].userData.baseY - 0.1 * sitPhase;
            this.animatedParts.legs[3].position.y = this.animatedParts.legs[3].userData.baseY - 0.1 * sitPhase;
        }
        
        // Gentle breathing while sitting
        const breathe = Math.sin(this.animationTime * 2) * 0.015;
        this.animatedParts.body.position.y += breathe;
    }
    
    // Stop movement
    stop() {
        this.targetVelocity.multiply(0);
        
        // Reset look direction when stopping
        this.targetLookDirection = 0;
    }
    
    setAudioManager(audioManager) {
        this.audioManager = audioManager;
    }
    
    /**
     * Update whether the dog is near sheep for barking purposes
     * @param {Array} sheep - Array of sheep to check distance to
     */
    updateNearSheepStatus(sheep) {
        if (!sheep || sheep.length === 0) {
            this.nearSheep = false;
            return;
        }
        
        const barkRadius = 12; // Slightly larger than sheep flee radius (8)
        this.nearSheep = false;
        
        // Check if any sheep are within barking distance
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
} 