import { Vector2D } from './Vector2D.js';

/**
 * Base Boid class implementing flocking behavior
 */
export class Boid {
    constructor(x, z, config = {}) {
        this.position = new Vector2D(x, z);
        this.velocity = Vector2D.random();
        this.acceleration = new Vector2D(0, 0);
        
        // Configuration
        this.maxSpeed = config.maxSpeed || 1.5;
        this.maxForce = config.maxForce || 0.05;
        this.perceptionRadius = config.perceptionRadius || 5;
        
        // Behavior weights
        this.separationWeight = config.separationWeight || 1.5;
        this.alignmentWeight = config.alignmentWeight || 1.0;
        this.cohesionWeight = config.cohesionWeight || 1.0;
        
        // Anti-jittering properties
        this.previousVelocity = this.velocity.clone();
        this.velocitySmoothing = 0.85; // Higher = more smoothing
        this.minMovementThreshold = 0.001; // Minimum velocity to prevent micro-movements
        this.forceAccumulator = new Vector2D(0, 0);
        this.dampingFactor = 0.98; // Velocity damping to reduce oscillations
        
        // Visual representation
        this.mesh = null;
    }

    // Apply a force to the boid with smoothing
    applyForce(force) {
        // Accumulate forces instead of applying directly
        this.forceAccumulator.add(force);
    }

    // Main flocking behavior
    flock(boids, separationDistance) {
        const neighbors = this.getNeighbors(boids);
        
        if (neighbors.length > 0) {
            // Calculate flocking forces
            const separation = this.separate(neighbors, separationDistance);
            const alignment = this.align(neighbors);
            const cohesion = this.cohere(neighbors);
            
            // Weight and apply forces
            separation.multiply(this.separationWeight);
            alignment.multiply(this.alignmentWeight);
            cohesion.multiply(this.cohesionWeight);
            
            this.applyForce(separation);
            this.applyForce(alignment);
            this.applyForce(cohesion);
        }
    }

    // Separation: steer to avoid crowding local flockmates
    separate(neighbors, desiredSeparation) {
        const steer = new Vector2D(0, 0);
        let count = 0;

        for (let neighbor of neighbors) {
            const distance = this.position.distanceTo(neighbor.position);
            
            if (distance > 0 && distance < desiredSeparation) {
                // Calculate vector pointing away from neighbor
                const diff = this.position.clone().subtract(neighbor.position);
                diff.normalize();
                diff.divide(distance); // Weight by distance (closer = stronger)
                steer.add(diff);
                count++;
            }
        }

        if (count > 0) {
            steer.divide(count);
            steer.normalize();
            steer.multiply(this.maxSpeed);
            steer.subtract(this.velocity);
            steer.limit(this.maxForce);
        }

        return steer;
    }

    // Alignment: steer towards the average heading of local flockmates
    align(neighbors) {
        const sum = new Vector2D(0, 0);
        
        for (let neighbor of neighbors) {
            sum.add(neighbor.velocity);
        }
        
        sum.divide(neighbors.length);
        sum.normalize();
        sum.multiply(this.maxSpeed);
        
        const steer = sum.subtract(this.velocity);
        steer.limit(this.maxForce);
        
        return steer;
    }

    // Cohesion: steer to move toward the average position of local flockmates
    cohere(neighbors) {
        const sum = new Vector2D(0, 0);
        
        for (let neighbor of neighbors) {
            sum.add(neighbor.position);
        }
        
        sum.divide(neighbors.length);
        return this.seek(sum);
    }

    // Seek a target position
    seek(target) {
        const desired = target.clone().subtract(this.position);
        desired.normalize();
        desired.multiply(this.maxSpeed);
        
        const steer = desired.subtract(this.velocity);
        steer.limit(this.maxForce);
        
        return steer;
    }

    // Flee from a target position
    flee(target, fleeRadius = 10) {
        const distance = this.position.distanceTo(target);
        
        if (distance < fleeRadius) {
            const desired = this.position.clone().subtract(target);
            desired.normalize();
            desired.multiply(this.maxSpeed);
            
            const steer = desired.subtract(this.velocity);
            steer.limit(this.maxForce * 2); // Stronger flee force
            
            return steer;
        }
        
        return new Vector2D(0, 0);
    }

    // Boundary avoidance
    avoidBoundaries(bounds) {
        const margin = 10; // Increased margin for earlier activation
        const steer = new Vector2D(0, 0);
        const position = this.position;
        
        // Calculate distances to boundaries
        const distToMinX = position.x - bounds.minX;
        const distToMaxX = bounds.maxX - position.x;
        const distToMinZ = position.z - bounds.minZ;
        const distToMaxZ = bounds.maxZ - position.z;
        
        // Apply repulsion force based on proximity to boundary (reduced multipliers)
        if (distToMinX < margin) {
            const force = (margin - distToMinX) / margin;
            steer.x = this.maxSpeed * force * 1.2; // Reduced from 2
        } else if (distToMaxX < margin) {
            const force = (margin - distToMaxX) / margin;
            steer.x = -this.maxSpeed * force * 1.2;
        }
        
        if (distToMinZ < margin) {
            const force = (margin - distToMinZ) / margin;
            steer.z = this.maxSpeed * force * 1.2;
        } else if (distToMaxZ < margin) {
            const force = (margin - distToMaxZ) / margin;
            steer.z = -this.maxSpeed * force * 1.2;
        }
        
        if (steer.magnitude() > 0) {
            steer.normalize();
            steer.multiply(this.maxSpeed * 1.5); // Reduced from 2
            steer.subtract(this.velocity);
            steer.limit(this.maxForce * 2.5); // Reduced from 5
        }
        
        return steer;
    }

    // Get neighboring boids within perception radius
    getNeighbors(boids) {
        const neighbors = [];
        
        for (let boid of boids) {
            if (boid !== this) {
                const distance = this.position.distanceTo(boid.position);
                if (distance < this.perceptionRadius) {
                    neighbors.push(boid);
                }
            }
        }
        
        return neighbors;
    }

    // Update position based on velocity and acceleration
    update(deltaTime = 0.016) {
        // Apply accumulated forces to acceleration with damping
        this.acceleration.add(this.forceAccumulator);
        this.forceAccumulator.multiply(0); // Reset force accumulator
        
        // Store previous velocity for smoothing
        this.previousVelocity = this.velocity.clone();
        
        // Update velocity
        this.velocity.add(this.acceleration);
        this.velocity.limit(this.maxSpeed);
        
        // Apply velocity damping to reduce oscillations
        this.velocity.multiply(this.dampingFactor);
        
        // Smooth velocity with previous velocity to reduce jittering
        const smoothedVelocity = this.previousVelocity.clone()
            .multiply(this.velocitySmoothing)
            .add(this.velocity.clone().multiply(1 - this.velocitySmoothing));
        
        // Only apply movement if above threshold to prevent micro-movements
        if (smoothedVelocity.magnitude() > this.minMovementThreshold) {
            this.velocity = smoothedVelocity;
            this.position.add(this.velocity);
        } else {
            // Stop micro-movements
            this.velocity.multiply(0);
        }
        
        // Reset acceleration
        this.acceleration.multiply(0);
        
        // Update mesh position if it exists
        if (this.mesh) {
            this.mesh.position.x = this.position.x;
            this.mesh.position.z = this.position.z;
            
            // Rotate mesh to face movement direction (only if moving significantly)
            if (this.velocity.magnitude() > this.minMovementThreshold * 10) {
                this.mesh.rotation.y = -this.velocity.angle() + Math.PI / 2;
            }
        }
    }
} 