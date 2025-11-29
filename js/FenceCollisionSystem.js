/**
 * FenceCollisionSystem - Handles collision detection for all fence segments
 *
 * Provides efficient collision checking for:
 * - Border fences (field perimeter)
 * - Custom internal fences (sandbox mode)
 * - Gate passages (allow-through zones)
 *
 * Uses line segment collision with configurable thickness
 */

import { Vector2D } from './Vector2D.js';

export class FenceCollisionSystem {
    constructor() {
        // All fence segments for collision
        this.fenceSegments = [];

        // Gate passages (areas where sheep can pass through)
        this.gatePassages = [];

        // Collision parameters
        this.fenceThickness = 1.5; // How thick fences are for collision
        this.collisionBuffer = 0.5; // Extra buffer for smoother collision

        // Spatial partitioning for performance (grid-based)
        this.gridSize = 20;
        this.spatialGrid = new Map();

        console.log('[FENCE COLLISION] System initialized');
    }

    /**
     * Clear all fence segments
     */
    clear() {
        this.fenceSegments = [];
        this.gatePassages = [];
        this.spatialGrid.clear();
        console.log('[FENCE COLLISION] Cleared all segments');
    }

    /**
     * Add a fence segment
     * @param {Object} start - Start point {x, z}
     * @param {Object} end - End point {x, z}
     * @param {string} type - 'border' or 'internal'
     */
    addFenceSegment(start, end, type = 'internal') {
        const segment = {
            id: `fence_${this.fenceSegments.length}`,
            start: { x: start.x, z: start.z },
            end: { x: end.x, z: end.z },
            type: type,
            // Pre-calculate for collision detection
            dx: end.x - start.x,
            dz: end.z - start.z,
            length: Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.z - start.z, 2))
        };

        // Calculate normal vector (perpendicular to fence)
        if (segment.length > 0) {
            segment.normalX = -segment.dz / segment.length;
            segment.normalZ = segment.dx / segment.length;
        } else {
            segment.normalX = 0;
            segment.normalZ = 1;
        }

        this.fenceSegments.push(segment);
        this.addToSpatialGrid(segment);

        return segment.id;
    }

    /**
     * Add border fences from polygon points
     * @param {Array} points - Array of {x, z} points defining the polygon
     * @param {Object} gate - Gate configuration with position and width
     */
    addPolygonBorder(points, gate) {
        if (!points || points.length < 3) return;

        const gateHalfWidth = (gate?.width || 8) / 2;
        const gateX = gate?.position?.x || 0;
        const gateZ = gate?.position?.z || 0;

        // Find which edge the gate is on
        let gateEdgeIndex = -1;
        let gateEdgeT = 0;

        for (let i = 0; i < points.length; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];

            // Check if gate position is near this edge
            const closest = this.closestPointOnSegmentStatic(gateX, gateZ, start, end);
            const dist = Math.sqrt(Math.pow(gateX - closest.x, 2) + Math.pow(gateZ - closest.z, 2));

            if (dist < 5) {
                gateEdgeIndex = i;
                gateEdgeT = closest.t;
                break;
            }
        }

        // Add all edges, splitting the gate edge if needed
        for (let i = 0; i < points.length; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];

            if (i === gateEdgeIndex) {
                // This edge has the gate - split it
                const edgeDx = end.x - start.x;
                const edgeDz = end.z - start.z;
                const edgeLength = Math.sqrt(edgeDx * edgeDx + edgeDz * edgeDz);

                if (edgeLength > 0) {
                    const unitX = edgeDx / edgeLength;
                    const unitZ = edgeDz / edgeLength;

                    // Calculate gate positions along edge
                    const gateStart = {
                        x: gateX - unitX * gateHalfWidth,
                        z: gateZ - unitZ * gateHalfWidth
                    };
                    const gateEnd = {
                        x: gateX + unitX * gateHalfWidth,
                        z: gateZ + unitZ * gateHalfWidth
                    };

                    // Add segments before and after gate
                    const distToGateStart = Math.sqrt(
                        Math.pow(gateStart.x - start.x, 2) + Math.pow(gateStart.z - start.z, 2)
                    );
                    const distToGateEnd = Math.sqrt(
                        Math.pow(end.x - gateEnd.x, 2) + Math.pow(end.z - gateEnd.z, 2)
                    );

                    if (distToGateStart > 1) {
                        this.addFenceSegment(start, gateStart, 'border');
                    }
                    if (distToGateEnd > 1) {
                        this.addFenceSegment(gateEnd, end, 'border');
                    }

                    // Calculate edge angle for gate passage
                    // Use the edge angle so the passage zone is rotated correctly
                    const edgeAngle = Math.atan2(edgeDz, edgeDx);

                    // Add gate passage with edge angle
                    this.addGatePassage(gateX, gateZ, gate.width, edgeAngle);
                    console.log(`[FENCE COLLISION] Added angled gate passage at angle ${(edgeAngle * 180 / Math.PI).toFixed(1)}°`);
                }
            } else {
                // Regular edge
                this.addFenceSegment(start, end, 'border');
            }
        }

        console.log(`[FENCE COLLISION] Added polygon border with ${points.length} points`);
    }

    /**
     * Static version for polygon calculation
     */
    closestPointOnSegmentStatic(x, z, start, end) {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dz * dz);

        if (length === 0) {
            return { x: start.x, z: start.z, t: 0 };
        }

        const t = Math.max(0, Math.min(1,
            ((x - start.x) * dx + (z - start.z) * dz) / (length * length)
        ));

        return {
            x: start.x + t * dx,
            z: start.z + t * dz,
            t: t
        };
    }

    /**
     * Add border fences for a rectangular field
     * @param {Object} bounds - {minX, maxX, minZ, maxZ}
     * @param {Object} gate - Gate configuration with position and width
     */
    addBorderFences(bounds, gate) {
        const { minX, maxX, minZ, maxZ } = bounds;
        const gateHalfWidth = (gate?.width || 8) / 2;
        const gateX = gate?.position?.x || 0;
        const gateZ = gate?.position?.z || maxZ;

        // Determine which edge has the gate
        const gateOnNorth = Math.abs(gateZ - maxZ) < 5;
        const gateOnSouth = Math.abs(gateZ - minZ) < 5;
        const gateOnEast = Math.abs(gateX - maxX) < 5;
        const gateOnWest = Math.abs(gateX - minX) < 5;

        // North edge
        if (gateOnNorth) {
            // Split for gate
            if (gateX - gateHalfWidth > minX) {
                this.addFenceSegment({ x: minX, z: maxZ }, { x: gateX - gateHalfWidth, z: maxZ }, 'border');
            }
            if (gateX + gateHalfWidth < maxX) {
                this.addFenceSegment({ x: gateX + gateHalfWidth, z: maxZ }, { x: maxX, z: maxZ }, 'border');
            }
            // Add gate passage
            this.addGatePassage(gateX, gateZ, gate.width, 'north');
        } else {
            this.addFenceSegment({ x: minX, z: maxZ }, { x: maxX, z: maxZ }, 'border');
        }

        // South edge
        if (gateOnSouth) {
            if (gateX - gateHalfWidth > minX) {
                this.addFenceSegment({ x: minX, z: minZ }, { x: gateX - gateHalfWidth, z: minZ }, 'border');
            }
            if (gateX + gateHalfWidth < maxX) {
                this.addFenceSegment({ x: gateX + gateHalfWidth, z: minZ }, { x: maxX, z: minZ }, 'border');
            }
            this.addGatePassage(gateX, gateZ, gate.width, 'south');
        } else {
            this.addFenceSegment({ x: minX, z: minZ }, { x: maxX, z: minZ }, 'border');
        }

        // East edge
        if (gateOnEast) {
            if (gateZ - gateHalfWidth > minZ) {
                this.addFenceSegment({ x: maxX, z: minZ }, { x: maxX, z: gateZ - gateHalfWidth }, 'border');
            }
            if (gateZ + gateHalfWidth < maxZ) {
                this.addFenceSegment({ x: maxX, z: gateZ + gateHalfWidth }, { x: maxX, z: maxZ }, 'border');
            }
            this.addGatePassage(gateX, gateZ, gate.width, 'east');
        } else {
            this.addFenceSegment({ x: maxX, z: minZ }, { x: maxX, z: maxZ }, 'border');
        }

        // West edge
        if (gateOnWest) {
            if (gateZ - gateHalfWidth > minZ) {
                this.addFenceSegment({ x: minX, z: minZ }, { x: minX, z: gateZ - gateHalfWidth }, 'border');
            }
            if (gateZ + gateHalfWidth < maxZ) {
                this.addFenceSegment({ x: minX, z: gateZ + gateHalfWidth }, { x: minX, z: maxZ }, 'border');
            }
            this.addGatePassage(gateX, gateZ, gate.width, 'west');
        } else {
            this.addFenceSegment({ x: minX, z: minZ }, { x: minX, z: maxZ }, 'border');
        }

        console.log(`[FENCE COLLISION] Added border fences, total segments: ${this.fenceSegments.length}`);
    }

    /**
     * Add custom fences from sandbox configuration
     * @param {Array} customFences - Array of {start: {x, z}, end: {x, z}}
     */
    addCustomFences(customFences) {
        if (!customFences || customFences.length === 0) return;

        customFences.forEach(fence => {
            this.addFenceSegment(fence.start, fence.end, 'internal');
        });

        console.log(`[FENCE COLLISION] Added ${customFences.length} custom fences, total: ${this.fenceSegments.length}`);
    }

    /**
     * Add a gate passage zone
     * @param {number} x - Gate center X
     * @param {number} z - Gate center Z
     * @param {number} width - Gate width
     * @param {string|number} direction - 'north', 'south', 'east', 'west' OR angle in radians
     */
    addGatePassage(x, z, width, direction) {
        const halfWidth = width / 2;
        const depth = 8; // How deep the passage zone extends

        // Check if direction is an angle (number) or cardinal direction (string)
        if (typeof direction === 'number') {
            // Angled gate passage - use rotated zone
            const angle = direction;
            const passage = {
                x: x,
                z: z,
                halfWidth: halfWidth + 2, // Add buffer
                depth: depth,
                angle: angle,
                isAngled: true
            };
            this.gatePassages.push(passage);
        } else {
            // Cardinal direction - use axis-aligned box
            let passage;
            if (direction === 'north' || direction === 'south') {
                passage = {
                    minX: x - halfWidth - 2,
                    maxX: x + halfWidth + 2,
                    minZ: z - depth,
                    maxZ: z + depth,
                    direction: direction,
                    isAngled: false
                };
            } else {
                passage = {
                    minX: x - depth,
                    maxX: x + depth,
                    minZ: z - halfWidth - 2,
                    maxZ: z + halfWidth + 2,
                    direction: direction,
                    isAngled: false
                };
            }
            this.gatePassages.push(passage);
        }
    }

    /**
     * Add segment to spatial grid for efficient lookup
     */
    addToSpatialGrid(segment) {
        // Get all grid cells this segment passes through
        const cells = this.getSegmentCells(segment);
        cells.forEach(cellKey => {
            if (!this.spatialGrid.has(cellKey)) {
                this.spatialGrid.set(cellKey, []);
            }
            this.spatialGrid.get(cellKey).push(segment);
        });
    }

    /**
     * Get grid cells a segment passes through
     */
    getSegmentCells(segment) {
        const cells = new Set();
        const steps = Math.ceil(segment.length / this.gridSize) + 1;

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = segment.start.x + t * segment.dx;
            const z = segment.start.z + t * segment.dz;
            const cellKey = this.getCellKey(x, z);
            cells.add(cellKey);
        }

        return cells;
    }

    /**
     * Get cell key for a position
     */
    getCellKey(x, z) {
        const cellX = Math.floor(x / this.gridSize);
        const cellZ = Math.floor(z / this.gridSize);
        return `${cellX},${cellZ}`;
    }

    /**
     * Get nearby fence segments for a position
     */
    getNearbySegments(x, z) {
        const segments = new Set();

        // Check current cell and neighbors
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const cellX = Math.floor(x / this.gridSize) + dx;
                const cellZ = Math.floor(z / this.gridSize) + dz;
                const cellKey = `${cellX},${cellZ}`;

                if (this.spatialGrid.has(cellKey)) {
                    this.spatialGrid.get(cellKey).forEach(seg => segments.add(seg));
                }
            }
        }

        return Array.from(segments);
    }

    /**
     * Check if a position is in a gate passage
     */
    isInGatePassage(x, z) {
        return this.gatePassages.some(passage => {
            if (passage.isAngled) {
                // For angled gates, transform point to gate's local coordinate system
                const dx = x - passage.x;
                const dz = z - passage.z;

                // Rotate point by negative gate angle to get local coords
                const cos = Math.cos(-passage.angle);
                const sin = Math.sin(-passage.angle);
                const localX = dx * cos - dz * sin;
                const localZ = dx * sin + dz * cos;

                // Check if within local bounds
                return Math.abs(localX) <= passage.halfWidth &&
                       Math.abs(localZ) <= passage.depth;
            } else {
                // Axis-aligned passage
                return x >= passage.minX && x <= passage.maxX &&
                       z >= passage.minZ && z <= passage.maxZ;
            }
        });
    }

    /**
     * Check collision with all fences and return collision response
     * @param {number} x - Current X position
     * @param {number} z - Current Z position
     * @param {number} radius - Entity radius for collision
     * @returns {Object|null} - Collision info or null if no collision
     */
    checkCollision(x, z, radius = 1) {
        // Skip collision if in gate passage
        if (this.isInGatePassage(x, z)) {
            return null;
        }

        const nearbySegments = this.getNearbySegments(x, z);
        const totalRadius = radius + this.fenceThickness / 2 + this.collisionBuffer;

        let closestCollision = null;
        let closestDistance = Infinity;

        for (const segment of nearbySegments) {
            const collision = this.checkSegmentCollision(x, z, segment, totalRadius);
            if (collision && collision.distance < closestDistance) {
                closestDistance = collision.distance;
                closestCollision = collision;
            }
        }

        return closestCollision;
    }

    /**
     * Check collision with a single fence segment
     */
    checkSegmentCollision(x, z, segment, radius) {
        // Find closest point on line segment to position
        const closest = this.closestPointOnSegment(x, z, segment);

        // Calculate distance to closest point
        const dx = x - closest.x;
        const dz = z - closest.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // Check if within collision range
        if (distance < radius) {
            // Calculate push direction (away from fence)
            const pushMagnitude = radius - distance;
            let pushX, pushZ;

            if (distance > 0.01) {
                pushX = (dx / distance) * pushMagnitude;
                pushZ = (dz / distance) * pushMagnitude;
            } else {
                // If exactly on the fence, use fence normal
                pushX = segment.normalX * pushMagnitude;
                pushZ = segment.normalZ * pushMagnitude;
            }

            return {
                segment: segment,
                distance: distance,
                closestPoint: closest,
                pushX: pushX,
                pushZ: pushZ,
                normalX: distance > 0.01 ? dx / distance : segment.normalX,
                normalZ: distance > 0.01 ? dz / distance : segment.normalZ
            };
        }

        return null;
    }

    /**
     * Find closest point on a line segment to a position
     */
    closestPointOnSegment(x, z, segment) {
        const { start, end, dx, dz, length } = segment;

        if (length === 0) {
            return { x: start.x, z: start.z };
        }

        // Project point onto line
        const t = Math.max(0, Math.min(1,
            ((x - start.x) * dx + (z - start.z) * dz) / (length * length)
        ));

        return {
            x: start.x + t * dx,
            z: start.z + t * dz
        };
    }

    /**
     * Apply collision response to a position
     * @param {number} x - Current X
     * @param {number} z - Current Z
     * @param {number} radius - Entity radius
     * @returns {Object} - Corrected position {x, z, collided}
     */
    resolveCollision(x, z, radius = 1) {
        const collision = this.checkCollision(x, z, radius);

        if (collision) {
            return {
                x: x + collision.pushX,
                z: z + collision.pushZ,
                collided: true,
                normalX: collision.normalX,
                normalZ: collision.normalZ
            };
        }

        return { x, z, collided: false };
    }

    /**
     * Check if moving from one position to another would cross a fence
     * @returns {Object|null} - Intersection point or null
     */
    checkMovementCollision(fromX, fromZ, toX, toZ, radius = 1) {
        const nearbySegments = this.getNearbySegments((fromX + toX) / 2, (fromZ + toZ) / 2);

        for (const segment of nearbySegments) {
            const intersection = this.lineSegmentIntersection(
                fromX, fromZ, toX, toZ,
                segment.start.x, segment.start.z, segment.end.x, segment.end.z
            );

            if (intersection) {
                // Check if in gate passage at intersection point
                if (!this.isInGatePassage(intersection.x, intersection.z)) {
                    return {
                        ...intersection,
                        segment: segment
                    };
                }
            }
        }

        return null;
    }

    /**
     * Line segment intersection test
     */
    lineSegmentIntersection(x1, z1, x2, z2, x3, z3, x4, z4) {
        const denom = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
        if (Math.abs(denom) < 0.0001) return null; // Parallel

        const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (z1 - z3) - (z1 - z2) * (x1 - x3)) / denom;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                z: z1 + t * (z2 - z1),
                t: t
            };
        }

        return null;
    }

    /**
     * Get all fence segments for debugging/visualization
     */
    getAllSegments() {
        return this.fenceSegments;
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            totalSegments: this.fenceSegments.length,
            borderSegments: this.fenceSegments.filter(s => s.type === 'border').length,
            internalSegments: this.fenceSegments.filter(s => s.type === 'internal').length,
            gatePassages: this.gatePassages.length,
            gridCells: this.spatialGrid.size
        };
    }
}

// Singleton instance for global access
let fenceCollisionInstance = null;

export function getFenceCollisionSystem() {
    if (!fenceCollisionInstance) {
        fenceCollisionInstance = new FenceCollisionSystem();
    }
    return fenceCollisionInstance;
}

export function resetFenceCollisionSystem() {
    if (fenceCollisionInstance) {
        fenceCollisionInstance.clear();
    }
    fenceCollisionInstance = new FenceCollisionSystem();
    return fenceCollisionInstance;
}
