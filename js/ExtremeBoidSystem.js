// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * ExtremeBoidSystem - High-performance spatial hash-based boid flocking
 *
 * Optimized for 1000+ boids using:
 * - Spatial hash grid for O(n) neighbor lookups instead of O(n^2)
 * - Pre-allocated typed arrays (zero per-frame allocations)
 * - Structure of Arrays (SoA) for cache efficiency
 * - Optimized force calculations
 *
 * Used for:
 * - Extreme mode (1000 sheep)
 * - Insane mode (3000 sheep)
 * - Chaos mode (5000 sheep)
 * - Sandbox mode (when enabled for performance)
 */

import { boundaryToBounds } from '../shared/index.js';

// Constants
// Default capacity for high-count modes. The system can grow dynamically if needed.
const MAX_BOIDS = 5000;
const MAX_NEIGHBORS = 50;
const MAX_FORCE = 0.6;  // Higher for better reactivity

/**
 * Normalize the polymorphic bounds input (legacy rect with no `kind`, or
 * discriminated boundary `{kind:'rect'|'island',...}`) into the legacy
 * rect AABB the spatial hash and edge-turn force consume. Delegates the
 * boundary→AABB formula to the shared helper so islands don't have to
 * duplicate the math here.
 */
function normalizeBoundsToRect(bounds) {
    if (bounds && bounds.kind) {
        return boundaryToBounds(bounds);
    }
    return bounds;
}

/**
 * ExtremeBoidSystem manages high-performance flocking calculations
 * using spatial hashing for efficient neighbor lookups
 */
export class ExtremeBoidSystem {
    constructor(config = {}) {
        this.maxBoids = config.maxBoids || MAX_BOIDS;
        this.enabled = false;
        this.boidCount = 0;

        this._allocateBoidArrays(this.maxBoids);

        // Spatial hash grid
        this.gridCellSize = 10; // Tuned for perception radius ~5-8
        this.gridWidth = 1;
        this.gridHeight = 1;
        this.gridCells = null;
        this.cellCounts = null;

        // Pre-allocated neighbor collection array
        this.neighborIndices = new Int32Array(MAX_NEIGHBORS);

        // Flocking parameters (tuned for extreme mode - pastoral, spread out)
        this.perception = config.perception || 7;
        this.separationWeight = config.separationWeight || 2.2;  // Strong separation to spread out
        this.alignmentWeight = config.alignmentWeight || 0.6;   // Less alignment = more natural
        this.cohesionWeight = config.cohesionWeight || 0.5;     // Low cohesion = pastoral spread
        this.maxSpeed = config.maxSpeed || 0.35;  // Slightly slower for grazing feel
        this.separationDistance = config.separationDistance || 3.0;  // Larger personal space

        // Bounds for edge avoidance
        this.bounds = null;
        this.edgeMargin = 10;
        this.edgeTurnForce = 0.3;
    }

    /**
     * Allocate or reallocate boid arrays to a given capacity.
     * These arrays are SoA typed buffers for cache-friendly iteration.
     */
    _allocateBoidArrays(capacity) {
        // Boid state - Structure of Arrays for cache efficiency
        this.px = new Float32Array(capacity);  // Position X
        this.pz = new Float32Array(capacity);  // Position Z (using z instead of y for 3D world)
        this.vx = new Float32Array(capacity);  // Velocity X
        this.vz = new Float32Array(capacity);  // Velocity Z

        // Temporary force accumulators (reused each frame)
        this.ax = new Float32Array(capacity);
        this.az = new Float32Array(capacity);

        // State flags (0: active, 1: retiring, 2: retired/grazing)
        this.states = new Uint8Array(capacity);
    }

    /**
     * Ensure internal buffers can hold the required boid count.
     * Grows capacity exponentially to avoid frequent reallocations.
     */
    ensureCapacity(requiredCount) {
        if (requiredCount <= this.maxBoids) return;
        const newCapacity = Math.max(requiredCount, this.maxBoids * 2);
        this.maxBoids = newCapacity;
        this._allocateBoidArrays(newCapacity);
        console.log(`[ExtremeBoidSystem] Resized boid buffers to ${newCapacity}`);
    }

    /**
     * Initialize the spatial grid based on bounds. Accepts either a legacy
     * rect or a discriminated boundary; islands collapse to their AABB
     * (per-sheep radial clamping happens in OptimizedSheep, so the AABB
     * corners outside the disc just stay empty in the spatial hash).
     */
    initSpatialGrid(bounds) {
        const rect = normalizeBoundsToRect(bounds);
        this.bounds = rect;

        const width = rect.maxX - rect.minX;
        const depth = rect.maxZ - rect.minZ;

        // Cell size should be at least as large as perception radius
        this.gridCellSize = Math.max(this.perception * 1.5, 10);

        this.gridWidth = Math.ceil(width / this.gridCellSize) + 2;
        this.gridHeight = Math.ceil(depth / this.gridCellSize) + 2;

        const totalCells = this.gridWidth * this.gridHeight;
        this.gridCells = new Array(totalCells);
        this.cellCounts = new Int32Array(totalCells);

        // Pre-allocate space for boids per cell
        for (let i = 0; i < totalCells; i++) {
            this.gridCells[i] = new Int32Array(64);
        }

        console.log(`[ExtremeBoidSystem] Spatial grid initialized: ${this.gridWidth}x${this.gridHeight} cells, cellSize=${this.gridCellSize.toFixed(1)}`);
    }

    /**
     * Enable the system and sync with sheep array
     */
    enable(sheep, bounds) {
        this.enabled = true;
        this.ensureCapacity(sheep.length);
        this.boidCount = sheep.length;

        // Initialize spatial grid
        this.initSpatialGrid(bounds);

        // Sync positions from sheep
        this.syncFromSheep(sheep);

        console.log(`[ExtremeBoidSystem] Enabled with ${this.boidCount} boids`);
    }

    /**
     * Disable the system
     */
    disable() {
        this.enabled = false;
        console.log('[ExtremeBoidSystem] Disabled');
    }

    /**
     * Sync internal arrays from sheep objects
     */
    syncFromSheep(sheep) {
        for (let i = 0; i < sheep.length && i < this.maxBoids; i++) {
            this.px[i] = sheep[i].position.x;
            this.pz[i] = sheep[i].position.z;
            this.vx[i] = sheep[i].velocity.x;
            this.vz[i] = sheep[i].velocity.z;
            this.states[i] = sheep[i].state || 0;
        }
        this.boidCount = Math.min(sheep.length, this.maxBoids);
    }

    /**
     * Sync internal arrays back to sheep objects
     */
    syncToSheep(sheep) {
        for (let i = 0; i < this.boidCount && i < sheep.length; i++) {
            // Only update velocity - position update is handled by sheep's own update
            sheep[i].forceAccumulator.x = this.ax[i];
            sheep[i].forceAccumulator.z = this.az[i];
        }
    }

    /**
     * Get cell index for a position
     */
    getCellIndex(x, z) {
        if (!this.bounds) return 0;

        const cx = Math.floor((x - this.bounds.minX) / this.gridCellSize) + 1;
        const cz = Math.floor((z - this.bounds.minZ) / this.gridCellSize) + 1;
        const clampedCx = Math.max(0, Math.min(this.gridWidth - 1, cx));
        const clampedCz = Math.max(0, Math.min(this.gridHeight - 1, cz));
        return clampedCz * this.gridWidth + clampedCx;
    }

    /**
     * Build spatial hash grid for current frame
     */
    buildSpatialHash() {
        const totalCells = this.gridWidth * this.gridHeight;

        // Clear cell counts
        for (let i = 0; i < totalCells; i++) {
            this.cellCounts[i] = 0;
        }

        // Assign boids to cells (only active boids)
        for (let i = 0; i < this.boidCount; i++) {
            if (this.states[i] !== 0) continue; // Skip non-active sheep

            const cellIdx = this.getCellIndex(this.px[i], this.pz[i]);
            const countInCell = this.cellCounts[cellIdx];

            // Grow cell array if needed
            if (countInCell >= this.gridCells[cellIdx].length) {
                const newArr = new Int32Array(this.gridCells[cellIdx].length * 2);
                newArr.set(this.gridCells[cellIdx]);
                this.gridCells[cellIdx] = newArr;
            }

            this.gridCells[cellIdx][countInCell] = i;
            this.cellCounts[cellIdx]++;
        }
    }

    /**
     * Get neighbors for a boid using spatial hash
     */
    getNeighbors(boidIdx) {
        const bx = this.px[boidIdx];
        const bz = this.pz[boidIdx];
        const perceptionSq = this.perception * this.perception;

        // Calculate cell range to check
        const minCx = Math.floor((bx - this.bounds.minX - this.perception) / this.gridCellSize) + 1;
        const maxCx = Math.floor((bx - this.bounds.minX + this.perception) / this.gridCellSize) + 1;
        const minCz = Math.floor((bz - this.bounds.minZ - this.perception) / this.gridCellSize) + 1;
        const maxCz = Math.floor((bz - this.bounds.minZ + this.perception) / this.gridCellSize) + 1;

        let neighborCount = 0;

        // Check all cells in range
        for (let cz = Math.max(0, minCz); cz <= Math.min(this.gridHeight - 1, maxCz); cz++) {
            for (let cx = Math.max(0, minCx); cx <= Math.min(this.gridWidth - 1, maxCx); cx++) {
                const cellIdx = cz * this.gridWidth + cx;
                const cellBoids = this.gridCells[cellIdx];
                const count = this.cellCounts[cellIdx];

                for (let j = 0; j < count; j++) {
                    const otherIdx = cellBoids[j];
                    if (otherIdx === boidIdx) continue;

                    const dx = this.px[otherIdx] - bx;
                    const dz = this.pz[otherIdx] - bz;
                    const distSq = dx * dx + dz * dz;

                    if (distSq < perceptionSq && distSq > 0.0001) {
                        if (neighborCount < MAX_NEIGHBORS) {
                            this.neighborIndices[neighborCount++] = otherIdx;
                        }
                    }
                }
            }
        }

        return neighborCount;
    }

    /**
     * Update all boids - calculates flocking forces
     * Call this once per frame before individual sheep updates
     */
    update(sheep, _deltaTime) {
        if (!this.enabled || !this.bounds) return;

        // Sheep count can change on restart or tuning; keep buffers in sync.
        if (sheep.length > this.maxBoids) {
            this.ensureCapacity(sheep.length);
        }

        // Sync positions from sheep (they may have moved due to other forces)
        this.syncFromSheep(sheep);

        // Build spatial hash for this frame
        this.buildSpatialHash();

        const sepWeight = this.separationWeight;
        const aliWeight = this.alignmentWeight;
        const cohWeight = this.cohesionWeight;
        const maxSpeed = this.maxSpeed;
        const sepDist = this.separationDistance;
        const sepDistSq = sepDist * sepDist;

        // Calculate forces for all active boids
        for (let i = 0; i < this.boidCount; i++) {
            // Skip non-active sheep
            if (this.states[i] !== 0) {
                this.ax[i] = 0;
                this.az[i] = 0;
                continue;
            }

            const bx = this.px[i];
            const bz = this.pz[i];
            const bvx = this.vx[i];
            const bvz = this.vz[i];

            const minCx = Math.max(0, Math.floor((bx - this.bounds.minX - this.perception) / this.gridCellSize) + 1);
            const maxCx = Math.min(this.gridWidth - 1, Math.floor((bx - this.bounds.minX + this.perception) / this.gridCellSize) + 1);
            const minCz = Math.max(0, Math.floor((bz - this.bounds.minZ - this.perception) / this.gridCellSize) + 1);
            const maxCz = Math.min(this.gridHeight - 1, Math.floor((bz - this.bounds.minZ + this.perception) / this.gridCellSize) + 1);
            const perceptionSq = this.perception * this.perception;
            let sepX = 0, sepZ = 0;
            let aliX = 0, aliZ = 0;
            let cohX = 0, cohZ = 0;
            let neighborCount = 0;
            let sepCount = 0;

            neighborSearch:
            for (let cz = minCz; cz <= maxCz; cz++) {
                for (let cx = minCx; cx <= maxCx; cx++) {
                    const cellIdx = cz * this.gridWidth + cx;
                    const cellBoids = this.gridCells[cellIdx];
                    const count = this.cellCounts[cellIdx];
                    for (let n = 0; n < count; n++) {
                        const j = cellBoids[n];
                        if (j === i) continue;
                        const dx = bx - this.px[j];
                        const dz = bz - this.pz[j];
                        const distSq = dx * dx + dz * dz;
                        if (distSq >= perceptionSq || distSq <= 0.0001) continue;

                        if (distSq < sepDistSq) {
                            const distance = Math.sqrt(distSq);
                            const invDist = 1 / distance;
                            sepX += dx * invDist / distance;
                            sepZ += dz * invDist / distance;
                            sepCount++;
                        }
                        aliX += this.vx[j];
                        aliZ += this.vz[j];
                        cohX += this.px[j];
                        cohZ += this.pz[j];
                        neighborCount++;
                        if (neighborCount === MAX_NEIGHBORS) break neighborSearch;
                    }
                }
            }

            if (neighborCount > 0) {
                const invCount = 1 / neighborCount;

                // Separation steering
                if (sepCount > 0) {
                    sepX /= sepCount;
                    sepZ /= sepCount;
                    let sepMag = Math.sqrt(sepX * sepX + sepZ * sepZ);
                    if (sepMag > 0.0001) {
                        sepX = sepX / sepMag * maxSpeed - bvx;
                        sepZ = sepZ / sepMag * maxSpeed - bvz;
                        sepMag = Math.sqrt(sepX * sepX + sepZ * sepZ);
                        if (sepMag > MAX_FORCE) {
                            sepX = sepX / sepMag * MAX_FORCE;
                            sepZ = sepZ / sepMag * MAX_FORCE;
                        }
                    }
                }

                // Alignment steering
                aliX *= invCount;
                aliZ *= invCount;
                let aliMag = Math.sqrt(aliX * aliX + aliZ * aliZ);
                if (aliMag > 0.0001) {
                    aliX = aliX / aliMag * maxSpeed - bvx;
                    aliZ = aliZ / aliMag * maxSpeed - bvz;
                    aliMag = Math.sqrt(aliX * aliX + aliZ * aliZ);
                    if (aliMag > MAX_FORCE) {
                        aliX = aliX / aliMag * MAX_FORCE;
                        aliZ = aliZ / aliMag * MAX_FORCE;
                    }
                }

                // Cohesion steering
                cohX = cohX * invCount - bx;
                cohZ = cohZ * invCount - bz;
                let cohMag = Math.sqrt(cohX * cohX + cohZ * cohZ);
                if (cohMag > 0.0001) {
                    cohX = cohX / cohMag * maxSpeed - bvx;
                    cohZ = cohZ / cohMag * maxSpeed - bvz;
                    cohMag = Math.sqrt(cohX * cohX + cohZ * cohZ);
                    if (cohMag > MAX_FORCE) {
                        cohX = cohX / cohMag * MAX_FORCE;
                        cohZ = cohZ / cohMag * MAX_FORCE;
                    }
                }
            }

            // Combined acceleration
            let accX = sepX * sepWeight + aliX * aliWeight + cohX * cohWeight;
            let accZ = sepZ * sepWeight + aliZ * aliWeight + cohZ * cohWeight;

            // Edge avoidance (soft turn)
            if (this.bounds) {
                const margin = this.edgeMargin;
                const turnForce = this.edgeTurnForce;

                if (bx < this.bounds.minX + margin) {
                    accX += turnForce * (margin - (bx - this.bounds.minX)) / margin;
                }
                if (bx > this.bounds.maxX - margin) {
                    accX -= turnForce * (margin - (this.bounds.maxX - bx)) / margin;
                }
                if (bz < this.bounds.minZ + margin) {
                    accZ += turnForce * (margin - (bz - this.bounds.minZ)) / margin;
                }
                if (bz > this.bounds.maxZ - margin) {
                    accZ -= turnForce * (margin - (this.bounds.maxZ - bz)) / margin;
                }
            }

            this.ax[i] = accX;
            this.az[i] = accZ;
        }

        // Sync forces back to sheep objects
        this.syncToSheep(sheep);
    }

    /**
     * Update parameters from game config
     */
    setParams(params) {
        if (params.separationDistance !== undefined) {
            this.separationDistance = params.separationDistance;
        }
        if (params.speed !== undefined) {
            this.maxSpeed = params.speed;
        }
        if (params.cohesion !== undefined) {
            this.cohesionWeight = params.cohesion;
        }
        if (params.separationWeight !== undefined) {
            this.separationWeight = params.separationWeight;
        }
        if (params.alignmentWeight !== undefined) {
            this.alignmentWeight = params.alignmentWeight;
        }
        if (params.edgeMargin !== undefined) {
            this.edgeMargin = params.edgeMargin;
        }
        if (params.edgeTurnForce !== undefined) {
            this.edgeTurnForce = params.edgeTurnForce;
        }
        if (params.perception !== undefined) {
            this.perception = params.perception;
            // Rebuild grid if perception changed significantly
            if (this.bounds && Math.abs(params.perception * 1.5 - this.gridCellSize) > 2) {
                this.initSpatialGrid(this.bounds);
            }
        }
    }

    /**
     * Update bounds (e.g., when field size changes)
     */
    setBounds(bounds) {
        this.bounds = normalizeBoundsToRect(bounds);
        if (this.enabled) {
            this.initSpatialGrid(this.bounds);
        }
    }
}

// Singleton instance
let extremeBoidSystem = null;

/**
 * Get the singleton ExtremeBoidSystem instance
 */
export function getExtremeBoidSystem() {
    if (!extremeBoidSystem) {
        extremeBoidSystem = new ExtremeBoidSystem();
    }
    return extremeBoidSystem;
}

/**
 * Reset the singleton instance (useful for testing or full game restart)
 */
export function resetExtremeBoidSystem() {
    if (extremeBoidSystem) {
        extremeBoidSystem.disable();
    }
    extremeBoidSystem = null;
}
