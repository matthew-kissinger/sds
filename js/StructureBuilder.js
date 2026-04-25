import * as THREE from 'three';
import { FencePresets, FenceConfigBuilder } from './FencePresets.js';
import { sumObjectTreeTriangles } from './utils/TriangleCount.js';

/**
 * StructureBuilder - Structure builder with modular fence system
 *
 * Features:
 * - Uses modular FencePresets for reusable components
 * - Properly handles 3-4 player configurations
 * - Supports polygon-shaped fields
 * - Optimized geometry with instancing support
 */
export class StructureBuilder {
    constructor(scene) {
        this.scene = scene;
        this.structures = {
            fences: [],
            gates: [],
            pastures: [],
            decorations: []
        };

        // Initialize modular fence system
        this.fencePresets = new FencePresets();
        this.fenceConfigBuilder = new FenceConfigBuilder(this.fencePresets);
        this.modelsLoaded = false;

        // Optional heightfield. When set, surfaceToTerrain() lifts each
        // tagged structure piece to sit on the displaced terrain instead of
        // the y=0 baseline (where it would be buried in heightmapped scenes).
        /** @type {import('../shared/terrain/Heightfield.js').Heightfield | null} */
        this.heightfield = null;
        this._tmpWorldPos = new THREE.Vector3();
    }

    /**
     * Provide (or clear) the scene's heightfield. Called from main.js after
     * the heightmap loads. Pieces marked with `userData.surfaceToTerrain`
     * are offset by `heightfield.sample(worldX, worldZ)` so fence posts,
     * gates, and corner flags rise/fall with the terrain.
     * @param {import('../shared/terrain/Heightfield.js').Heightfield | null} heightfield
     */
    setHeightfield(heightfield) {
        this.heightfield = heightfield ?? null;
    }

    /**
     * Walk a structure subtree and lift each tagged node onto the terrain.
     * Tags must be set by the structure builders (FencePresets, corner flags)
     * before the parent group is committed to the scene. We tag at the
     * granularity of "rigid pieces": individual posts/rails ride terrain
     * independently, but a gate group rides as one unit so its two posts
     * stay coplanar on slopes.
     *
     * Call AFTER the group is added to the scene so getWorldPosition reports
     * the correct world (x,z). Idempotent — re-running on an already-surfaced
     * group is a no-op for siblings since each tagged node samples once.
     * @param {THREE.Object3D} root
     * @private
     */
    _surfaceToTerrain(root) {
        if (!this.heightfield || !root) return;
        root.updateMatrixWorld(true);
        const liftSamples = [];
        const slopeSamples = [];
        root.traverse(node => {
            if (!node.userData?.surfaceToTerrain) return;
            // Rails get the slope-along-terrain treatment so they actually
            // span the height difference between adjacent posts. Everything
            // else (posts, gate group, corner flags) just rides the terrain
            // height at its own (x,z).
            if (node.userData.railSpan && node.parent) {
                slopeSamples.push(node);
            } else {
                node.getWorldPosition(this._tmpWorldPos);
                const dy = this.heightfield.sample(this._tmpWorldPos.x, this._tmpWorldPos.z);
                liftSamples.push({ node, dy });
            }
        });

        // Lift posts/gates first so any rail's parent matrix already reflects
        // its surfaced state if the parent itself was tagged (defensive — in
        // practice the parent isn't tagged when rails are).
        for (const { node, dy } of liftSamples) {
            node.position.y += dy;
        }

        // Slope rails to span between their two posts.
        for (const node of slopeSamples) {
            this._slopeRailToTerrain(node);
        }
    }

    /**
     * Re-orient a tagged rail so its long axis spans the slope between the
     * two posts it sits between. Reads `userData.railSpan` for span metadata,
     * samples the heightfield at both endpoints, and rebuilds the rail's
     * position + quaternion so it lands flush on both posts.
     *
     * Replaces (not composes with) any prior rotation, so the rail's geometry
     * long axis must be tagged via `geomAxis` ('x' for GLB rails and procedural
     * horizontal segments, 'z' for procedural vertical segments).
     *
     * @param {THREE.Object3D} rail
     * @private
     */
    _slopeRailToTerrain(rail) {
        const span = rail.userData.railSpan;
        if (!span || !rail.parent) return;
        const { halfLen, axis, geomAxis, baseY } = span;
        rail.parent.updateMatrixWorld(true);
        const parentMatrix = rail.parent.matrixWorld;

        // Local-frame endpoints of the rail (relative to parent group).
        // The rail's current local position is its midpoint between two posts
        // — but we recompute from the post-pair offsets because subsequent
        // calls would otherwise double-apply.
        const midLocal = rail.position.clone();
        const dxLocal = axis === 'horizontal' ? halfLen : 0;
        const dzLocal = axis === 'horizontal' ? 0 : halfLen;
        const aLocal = new THREE.Vector3(midLocal.x - dxLocal, 0, midLocal.z - dzLocal);
        const bLocal = new THREE.Vector3(midLocal.x + dxLocal, 0, midLocal.z + dzLocal);

        // World-space endpoints (parent transform applied).
        const aWorld = aLocal.clone().applyMatrix4(parentMatrix);
        const bWorld = bLocal.clone().applyMatrix4(parentMatrix);

        // Sample terrain at each post's world (x, z).
        const hA = this.heightfield.sample(aWorld.x, aWorld.z);
        const hB = this.heightfield.sample(bWorld.x, bWorld.z);
        aWorld.y = hA + baseY;
        bWorld.y = hB + baseY;

        // Convert lifted endpoints back to parent-local space.
        const parentInv = parentMatrix.clone().invert();
        const aLocalLifted = aWorld.clone().applyMatrix4(parentInv);
        const bLocalLifted = bWorld.clone().applyMatrix4(parentInv);

        // Rail at midpoint, oriented to span A→B in parent-local space. The
        // rail mesh's geometry long axis is `geomAxis` (+x or +z), so the
        // base unit vector for the quaternion picks the right axis.
        rail.position.copy(aLocalLifted).add(bLocalLifted).multiplyScalar(0.5);
        const dir = bLocalLifted.clone().sub(aLocalLifted).normalize();
        const baseAxis = geomAxis === 'z'
            ? new THREE.Vector3(0, 0, 1)
            : new THREE.Vector3(1, 0, 0);
        rail.quaternion.setFromUnitVectors(baseAxis, dir);
    }

    /**
     * Load GLB fence models (call this before building structures)
     */
    async loadModels() {
        if (this.modelsLoaded) return;

        console.log('[BUILD] Loading fence GLB models...');
        await this.fencePresets.loadModels();
        this.modelsLoaded = true;
        console.log('[BUILD] Fence models loaded');
    }
    
    /**
     * Clear all structures from scene
     */
    clearAllStructures() {
        console.log('[BUILD] Clearing all structures');
        
        Object.values(this.structures).forEach(structureArray => {
            structureArray.forEach(element => {
                if (element.parent) {
                    element.parent.remove(element);
                }
                
                // Dispose of geometries and materials
                if (element.geometry) element.geometry.dispose();
                if (element.material) {
                    if (Array.isArray(element.material)) {
                        element.material.forEach(mat => mat.dispose());
                    } else {
                        element.material.dispose();
                    }
                }
                
                // Recursively dispose children
                if (element.children) {
                    element.traverse(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(mat => mat.dispose());
                            } else {
                                child.material.dispose();
                            }
                        }
                    });
                }
            });
            structureArray.length = 0;
        });
    }
    
    /**
     * Build structures for single player mode.
     * @param {Object} bounds
     * @param {Object} gate
     * @param {Object} pasture
     * @param {Object} [opts]
     * @param {boolean} [opts.perimeterFence=true] When false, only the gate
     *  + pen are built (no four border segments). For "no fences" scenes
     *  like Open Country.
     */
    buildSinglePlayerStructures(bounds, gate, pasture, opts = {}) {
        const { perimeterFence = true, corral = null } = opts;
        console.log(`[BUILD] Building single player structures (perimeterFence=${perimeterFence}, corral=${!!corral})`);

        this.clearAllStructures();

        // Cycle 5+ corral scene (Rolling Hills): the corral marker replaces
        // the perimeter pen+gate. Even if FieldConfig still surfaces a legacy
        // gate object, corral wins — no fence ring, no pen at the perimeter.
        if (corral) {
            this.buildCorralStructure(corral);
            console.log('[OK] Corral structures built');
            return;
        }

        const fenceGroup = perimeterFence
            ? this.fenceConfigBuilder.buildSinglePlayerFences(bounds, gate, pasture)
            : this.fenceConfigBuilder.buildGateAndPenOnly(bounds, gate, pasture);
        this.scene.add(fenceGroup);
        this.structures.fences.push(fenceGroup);
        this._surfaceToTerrain(fenceGroup);

        // Decorative corner flags only make sense with a perimeter; skip for
        // fence-less scenes to avoid floating flags in the middle of nowhere.
        if (perimeterFence) {
            this.addFieldDecorations(bounds);
        }

        console.log('[OK] Single player structures built');
    }

    /**
     * Cycle 5+ corral marker. Builds a tall flag pillar at corral.center so
     * the destination is findable from the far shore. The corral disc itself
     * is the retirement-trigger zone (no fence walls); sheep within
     * `corral.radius` of the centre enter retirement.
     *
     * @param {{center: {x: number, z: number}, radius: number}} corral
     */
    buildCorralStructure(corral) {
        const group = new THREE.Group();
        group.name = 'CorralMarker';

        // Pillar: 8m tall wooden post
        const pillarHeight = 8;
        const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.22, pillarHeight, 8),
            new THREE.MeshLambertMaterial({ color: 0x6b4a30 })
        );
        pillar.position.set(corral.center.x, pillarHeight / 2, corral.center.z);
        pillar.castShadow = true;
        pillar.userData.surfaceToTerrain = true;
        group.add(pillar);

        // Flag: a small banner near the top
        const flagWidth = 1.6;
        const flagHeight = 1.0;
        const flag = new THREE.Mesh(
            new THREE.PlaneGeometry(flagWidth, flagHeight),
            new THREE.MeshLambertMaterial({
                color: 0xc83a3a,
                side: THREE.DoubleSide,
                emissive: 0x4a0c0c,
                emissiveIntensity: 0.15
            })
        );
        flag.position.set(corral.center.x + flagWidth / 2, pillarHeight - flagHeight / 2 - 0.5, corral.center.z);
        // Surface flag follows pillar's terrain offset
        flag.userData.surfaceToTerrain = true;
        group.add(flag);

        // Faint ground ring at the corral radius — anime-style flat disc, subtle
        const ringGeo = new THREE.RingGeometry(corral.radius - 0.4, corral.radius, 48);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xeaf6ff,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(corral.center.x, 0.05, corral.center.z);
        ring.userData.surfaceToTerrain = true;
        group.add(ring);

        this.scene.add(group);
        this.structures.fences.push(group);
        this._surfaceToTerrain(group);
    }

    /**
     * Build structures for sandbox mode with custom fences
     * @param {Object} bounds - Field boundaries
     * @param {Object} gate - Gate configuration
     * @param {Object} pasture - Pasture configuration
     * @param {Array} customFences - Array of custom fence segments
     * @param {Array} borderPoints - Optional polygon border points for custom shapes
     * @param {string} fieldShape - The field shape type ('square', 'custom', etc.)
     */
    buildSandboxStructures(bounds, gate, pasture, customFences = [], borderPoints = null, fieldShape = 'square') {
        console.log('[BUILD] Building sandbox structures');
        console.log(`[BUILD] Shape: ${fieldShape}, Bounds: ${JSON.stringify(bounds)}`);
        console.log(`[BUILD] Gate: ${JSON.stringify(gate?.position)}, edgeAngle: ${gate?.edgeAngle}`);

        this.clearAllStructures();

        let fenceGroup;

        // Determine which fence building approach to use:
        // - Rectangular shapes (square, wide, tall): use simple buildSinglePlayerFences
        // - Polygon shapes (hexagon, octagon, diamond, lShape, custom): use buildPolygonBorderFences
        const isRectangularShape = ['square', 'wide', 'tall'].includes(fieldShape);

        if (!isRectangularShape && borderPoints && borderPoints.length >= 3) {
            console.log(`[BUILD] Using polygon fence building for ${fieldShape} shape`);
            fenceGroup = this.buildPolygonBorderFences(borderPoints, gate, pasture);
        } else {
            console.log('[BUILD] Using simplified rectangular fence building');
            fenceGroup = this.fenceConfigBuilder.buildSinglePlayerFences(bounds, gate, pasture);
        }

        this.scene.add(fenceGroup);
        this.structures.fences.push(fenceGroup);
        this._surfaceToTerrain(fenceGroup);

        // Build custom internal fences
        if (customFences && customFences.length > 0) {
            const customFenceGroup = this.buildCustomFences(customFences);
            this.scene.add(customFenceGroup);
            this.structures.fences.push(customFenceGroup);
            this._surfaceToTerrain(customFenceGroup);
        }

        // Add decorative elements
        this.addFieldDecorations(bounds);

        console.log('[OK] Sandbox structures built');
    }

    /**
     * Build border fences from polygon points
     * Uses a perimeter-based approach for accurate gate placement
     * @param {Array} points - Array of {x, z} points defining the polygon
     * @param {Object} gate - Gate configuration
     * @param {Object} pasture - Pasture configuration
     * @returns {THREE.Group} - Group containing all border fences
     */
    buildPolygonBorderFences(points, gate, pasture) {
        const group = new THREE.Group();
        group.name = 'PolygonBorderFences';

        const gateWidth = gate?.width || 8;
        const gateHalfWidth = gateWidth / 2;
        const gateX = gate?.position?.x ?? 0;
        const gateZ = gate?.position?.z ?? gate?.position?.y ?? 0;

        console.log(`[BUILD] Polygon border: ${points.length} points, gate at (${gateX}, ${gateZ})`);

        // STEP 1: Calculate cumulative perimeter distances for each vertex
        const edgeLengths = [];
        const cumulativeDistances = [0]; // Distance from start to each vertex
        let totalPerimeter = 0;

        for (let i = 0; i < points.length; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];
            const length = Math.sqrt(
                Math.pow(end.x - start.x, 2) + Math.pow(end.z - start.z, 2)
            );
            edgeLengths.push(length);
            totalPerimeter += length;
            cumulativeDistances.push(totalPerimeter);
        }

        console.log(`[BUILD] Total perimeter: ${totalPerimeter.toFixed(1)}, edges: ${edgeLengths.map(l => l.toFixed(1)).join(', ')}`);

        // STEP 2: Find where the gate center projects onto the perimeter
        let gatePerimeterDist = 0;
        let gapStartPoint = null;
        let gapEndPoint = null;

        // Find the closest point on the perimeter to the gate position
        let minDist = Infinity;
        for (let i = 0; i < points.length; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];
            const result = this.closestPointOnSegment(gateX, gateZ, start, end);
            const dist = Math.sqrt(Math.pow(gateX - result.x, 2) + Math.pow(gateZ - result.z, 2));

            if (dist < minDist) {
                minDist = dist;
                // Calculate perimeter distance to this point
                gatePerimeterDist = cumulativeDistances[i] + result.t * edgeLengths[i];
            }
        }

        // STEP 3: Calculate gap start and end as perimeter distances
        let gapStartDist = gatePerimeterDist - gateHalfWidth;
        let gapEndDist = gatePerimeterDist + gateHalfWidth;

        // Handle wrap-around (gap might cross the start/end point)
        if (gapStartDist < 0) gapStartDist += totalPerimeter;
        if (gapEndDist > totalPerimeter) gapEndDist -= totalPerimeter;

        console.log(`[BUILD] Gate perimeter: ${gatePerimeterDist.toFixed(1)}, gap: [${gapStartDist.toFixed(1)}, ${gapEndDist.toFixed(1)}]`);

        // Helper function to get point at a given perimeter distance
        const getPointAtDistance = (dist) => {
            // Normalize distance to [0, totalPerimeter)
            while (dist < 0) dist += totalPerimeter;
            while (dist >= totalPerimeter) dist -= totalPerimeter;

            for (let i = 0; i < points.length; i++) {
                if (dist <= cumulativeDistances[i + 1]) {
                    const start = points[i];
                    const end = points[(i + 1) % points.length];
                    const t = (dist - cumulativeDistances[i]) / edgeLengths[i];
                    return {
                        x: start.x + (end.x - start.x) * t,
                        z: start.z + (end.z - start.z) * t,
                        edgeIndex: i,
                        t: t
                    };
                }
            }
            return { ...points[0], edgeIndex: 0, t: 0 };
        };

        // Helper to check if a perimeter distance is inside the gap
        const isInGap = (dist) => {
            // Normalize
            while (dist < 0) dist += totalPerimeter;
            while (dist >= totalPerimeter) dist -= totalPerimeter;

            if (gapStartDist <= gapEndDist) {
                // Normal case: gap doesn't wrap around
                return dist >= gapStartDist && dist <= gapEndDist;
            } else {
                // Gap wraps around the start/end point
                return dist >= gapStartDist || dist <= gapEndDist;
            }
        };

        // Get actual gap endpoints
        gapStartPoint = getPointAtDistance(gapStartDist);
        gapEndPoint = getPointAtDistance(gapEndDist);

        console.log(`[BUILD] Gap start: (${gapStartPoint.x.toFixed(1)}, ${gapStartPoint.z.toFixed(1)}) on edge ${gapStartPoint.edgeIndex}`);
        console.log(`[BUILD] Gap end: (${gapEndPoint.x.toFixed(1)}, ${gapEndPoint.z.toFixed(1)}) on edge ${gapEndPoint.edgeIndex}`);

        // STEP 4: Build fence segments for each edge, excluding the gap
        for (let i = 0; i < points.length; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];
            const edgeStartDist = cumulativeDistances[i];
            const edgeEndDist = cumulativeDistances[i + 1];
            const edgeLength = edgeLengths[i];

            if (edgeLength < 1) continue;

            // Determine what portions of this edge are outside the gap
            const segments = [];

            if (gapStartDist <= gapEndDist) {
                // Normal case: gap doesn't wrap
                if (edgeEndDist <= gapStartDist || edgeStartDist >= gapEndDist) {
                    // Edge is entirely outside gap
                    segments.push({ start: 0, end: 1 });
                } else if (edgeStartDist >= gapStartDist && edgeEndDist <= gapEndDist) {
                    // Edge is entirely inside gap - no fence
                } else if (edgeStartDist < gapStartDist && edgeEndDist > gapEndDist) {
                    // Gap is entirely within this edge - two segments
                    segments.push({ start: 0, end: (gapStartDist - edgeStartDist) / edgeLength });
                    segments.push({ start: (gapEndDist - edgeStartDist) / edgeLength, end: 1 });
                } else if (edgeStartDist < gapStartDist) {
                    // Gap starts within this edge
                    segments.push({ start: 0, end: (gapStartDist - edgeStartDist) / edgeLength });
                } else {
                    // Gap ends within this edge
                    segments.push({ start: (gapEndDist - edgeStartDist) / edgeLength, end: 1 });
                }
            } else {
                // Gap wraps around - more complex logic
                const inGapAtStart = isInGap(edgeStartDist);
                const inGapAtEnd = isInGap(edgeEndDist);

                if (!inGapAtStart && !inGapAtEnd) {
                    // Check if gap passes through this edge
                    if (edgeStartDist <= gapStartDist && edgeEndDist >= gapStartDist) {
                        // Gap starts in this edge
                        segments.push({ start: 0, end: (gapStartDist - edgeStartDist) / edgeLength });
                    } else if (edgeStartDist <= gapEndDist && edgeEndDist >= gapEndDist) {
                        // Gap ends in this edge
                        segments.push({ start: (gapEndDist - edgeStartDist) / edgeLength, end: 1 });
                    } else {
                        // Edge entirely outside gap
                        segments.push({ start: 0, end: 1 });
                    }
                } else if (inGapAtStart && inGapAtEnd) {
                    // Edge entirely in gap - no fence
                } else if (inGapAtStart) {
                    // Starts in gap, ends outside
                    segments.push({ start: (gapEndDist - edgeStartDist) / edgeLength, end: 1 });
                } else {
                    // Starts outside, ends in gap
                    segments.push({ start: 0, end: (gapStartDist - edgeStartDist) / edgeLength });
                }
            }

            // Build fence segments
            for (const seg of segments) {
                if (seg.end - seg.start < 0.02) continue; // Skip tiny segments

                const segStart = {
                    x: start.x + (end.x - start.x) * seg.start,
                    z: start.z + (end.z - start.z) * seg.start
                };
                const segEnd = {
                    x: start.x + (end.x - start.x) * seg.end,
                    z: start.z + (end.z - start.z) * seg.end
                };

                const fence = this.buildFenceSegment(segStart, segEnd);
                if (fence) group.add(fence);
            }
        }

        // STEP 5: Place the gate structure
        const gapCenter = {
            x: (gapStartPoint.x + gapEndPoint.x) / 2,
            z: (gapStartPoint.z + gapEndPoint.z) / 2
        };
        const actualGateAngle = Math.atan2(
            gapEndPoint.z - gapStartPoint.z,
            gapEndPoint.x - gapStartPoint.x
        );

        const gateStructure = this.fencePresets.createGateStructure(gateWidth, 'horizontal');
        gateStructure.position.set(gapCenter.x, 0, gapCenter.z);
        gateStructure.rotation.y = -actualGateAngle;
        group.add(gateStructure);

        console.log(`[BUILD] Gate placed at (${gapCenter.x.toFixed(1)}, ${gapCenter.z.toFixed(1)}), angle=${(actualGateAngle * 180 / Math.PI).toFixed(1)}°`);

        // STEP 6: Build pasture fencing - SIMPLE approach like classic mode
        // The pasture attaches directly at the gate gap - NO front fence needed
        // Just 3 sides: two extending outward from gate, one back fence
        if (pasture) {
            const pastureDepth = pasture.maxZ - pasture.minZ;
            const pastureWidth = pasture.maxX - pasture.minX;

            // Calculate the direction perpendicular to the gate edge (pointing outward)
            // The gate edge goes from gapStartPoint to gapEndPoint
            const gateEdgeDx = gapEndPoint.x - gapStartPoint.x;
            const gateEdgeDz = gapEndPoint.z - gapStartPoint.z;
            const gateEdgeLength = Math.sqrt(gateEdgeDx * gateEdgeDx + gateEdgeDz * gateEdgeDz);

            // Perpendicular direction (outward from field)
            // Rotate 90 degrees: (dx, dz) -> (dz, -dx)
            let perpDx = gateEdgeDz / gateEdgeLength;
            let perpDz = -gateEdgeDx / gateEdgeLength;

            // Determine which direction is "outward" by testing if a point in that direction
            // is inside or outside the polygon
            const testDist = 5;
            const testX = gapCenter.x + perpDx * testDist;
            const testZ = gapCenter.z + perpDz * testDist;

            // If test point is INSIDE the polygon, we're pointing inward - flip it
            if (this.isPointInPolygon(testX, testZ, points)) {
                perpDx = -perpDx;
                perpDz = -perpDz;
                console.log(`[BUILD] Flipped pasture direction - was pointing into polygon`);
            }

            // Calculate the gate edge direction (normalized)
            const edgeDirX = gateEdgeDx / gateEdgeLength;
            const edgeDirZ = gateEdgeDz / gateEdgeLength;

            // Use FULL pasture width, centered on gate center
            const halfPastureWidth = pastureWidth / 2;

            // Calculate front corners based on full pasture width, centered on gate
            const frontLeft = {
                x: gapCenter.x - edgeDirX * halfPastureWidth,
                z: gapCenter.z - edgeDirZ * halfPastureWidth
            };
            const frontRight = {
                x: gapCenter.x + edgeDirX * halfPastureWidth,
                z: gapCenter.z + edgeDirZ * halfPastureWidth
            };

            // Calculate back corners by extending perpendicular from front corners
            const backLeft = {
                x: frontLeft.x + perpDx * pastureDepth,
                z: frontLeft.z + perpDz * pastureDepth
            };
            const backRight = {
                x: frontRight.x + perpDx * pastureDepth,
                z: frontRight.z + perpDz * pastureDepth
            };

            // Left side fence: from front left to back left
            const leftSide = this.buildFenceSegment(frontLeft, backLeft);
            if (leftSide) group.add(leftSide);

            // Right side fence: from front right to back right
            const rightSide = this.buildFenceSegment(frontRight, backRight);
            if (rightSide) group.add(rightSide);

            // Back fence: connects the two back corners
            const back = this.buildFenceSegment(backLeft, backRight);
            if (back) group.add(back);

            console.log(`[BUILD] Pasture built: 3-sided pen, width=${pastureWidth}, depth=${pastureDepth}`);
        }

        console.log(`[BUILD] Built polygon border with ${points.length} edges`);
        return group;
    }

    /**
     * Build a single fence segment between two points
     */
    buildFenceSegment(start, end) {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dz * dz);

        if (length < 1) return null;

        // Calculate angle from start to end
        const angle = Math.atan2(dz, dx);

        // Always create as horizontal segment (oriented along X axis)
        // Then rotate to match the actual angle
        const segment = this.fencePresets.createBorderSegment(length, 'horizontal');

        // Position at midpoint
        const midX = (start.x + end.x) / 2;
        const midZ = (start.z + end.z) / 2;
        segment.position.set(midX, 0, midZ);

        // Rotate to match the actual angle
        // The horizontal segment is along the X axis, so we rotate by the angle
        segment.rotation.y = -angle;

        return segment;
    }

    /**
     * Find closest point on a line segment
     */
    closestPointOnSegment(x, z, start, end) {
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
     * Check if a point is inside a polygon using ray casting
     */
    isPointInPolygon(x, z, points) {
        if (!points || points.length < 3) return false;

        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x, zi = points[i].z;
            const xj = points[j].x, zj = points[j].z;

            if (((zi > z) !== (zj > z)) &&
                (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Build custom fence segments from sandbox configuration
     * @param {Array} fenceSegments - Array of fence segment definitions
     * @returns {THREE.Group} - Group containing all custom fences
     */
    buildCustomFences(fenceSegments) {
        const group = new THREE.Group();
        group.name = 'CustomFences';

        fenceSegments.forEach((segment, index) => {
            const { start, end, type } = segment;

            // Calculate fence properties
            const dx = end.x - start.x;
            const dz = end.z - start.z;
            const length = Math.sqrt(dx * dx + dz * dz);

            if (length < 1) return; // Skip very short fences

            // Calculate angle from start to end
            const angle = Math.atan2(dz, dx);

            // Create fence segment using presets
            // Always create as horizontal segment, then rotate to match the actual angle
            // This matches how buildFenceSegment works for border fences
            let fenceSegmentGroup;

            if (type === 'gate') {
                // Create a gate structure
                fenceSegmentGroup = this.fencePresets.createGateStructure(
                    Math.min(length, 10), // Gates are smaller
                    'horizontal',
                    { color: 0xfbbf24 }
                );
            } else {
                // Create a regular fence segment
                fenceSegmentGroup = this.fencePresets.createBorderSegment(length, 'horizontal');
            }

            // Position at midpoint
            const midX = (start.x + end.x) / 2;
            const midZ = (start.z + end.z) / 2;
            fenceSegmentGroup.position.set(midX, 0, midZ);

            // Rotate to match the actual angle (consistent with buildFenceSegment)
            fenceSegmentGroup.rotation.y = -angle;

            group.add(fenceSegmentGroup);
        });

        console.log(`[BUILD] Created ${fenceSegments.length} custom fence segments`);
        return group;
    }
    
    /**
     * Build structures for competitive multiplayer mode
     */
    buildCompetitiveStructures(bounds, competitiveGates) {
        console.log(`[BUILD] Building competitive structures for ${competitiveGates.length} players`);
        
        this.clearAllStructures();
        
        // Build fences with multiple gates
        const fenceGroup = this.fenceConfigBuilder.buildCompetitiveFences(bounds, competitiveGates);
        this.scene.add(fenceGroup);
        this.structures.fences.push(fenceGroup);
        this._surfaceToTerrain(fenceGroup);

        // Create individual gate markers and pastures
        competitiveGates.forEach(gate => {
            this.createCompetitiveGateMarker(gate);
        });

        // Add field decorations
        this.addFieldDecorations(bounds);
        
        console.log('[OK] Competitive structures built');
    }
    
    
    /**
     * Create visual marker for competitive gate
     */
    createCompetitiveGateMarker(gate) {
        // No additional markers needed - gates have their own visual identity
        // Player colors are already shown on the gate structures themselves
    }
    
    /**
     * Create player label sprite
     */
    createPlayerLabel(x, y, z, playerId, parent) {
        // Create canvas for text
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        
        // Draw player label
        context.fillStyle = 'white';
        context.font = 'bold 48px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`P${playerId}`, 64, 32);
        
        // Create sprite
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(x, y, z);
        sprite.scale.set(2, 1, 1);
        
        parent.add(sprite);
    }
    
    /**
     * Add decorative elements to the field
     */
    addFieldDecorations(bounds) {
        // Corner flags
        const cornerPositions = [
            { x: bounds.minX, z: bounds.minZ },
            { x: bounds.maxX, z: bounds.minZ },
            { x: bounds.maxX, z: bounds.maxZ },
            { x: bounds.minX, z: bounds.maxZ }
        ];
        
        cornerPositions.forEach(pos => {
            const flag = this.createCornerFlag(pos.x, pos.z);
            // Surface the whole flag (pole + flag) as one unit so they stay
            // anchored together on hills.
            flag.userData.surfaceToTerrain = true;
            this.scene.add(flag);
            this.structures.decorations.push(flag);
            this._surfaceToTerrain(flag);
        });
    }
    
    /**
     * Create corner flag decoration
     */
    createCornerFlag(x, z) {
        const group = new THREE.Group();
        
        // Flag pole
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 2, 6),
            new THREE.MeshPhongMaterial({ color: 0xffffff })
        );
        pole.position.y = 1;
        group.add(pole);
        
        // Flag
        const flagGeometry = new THREE.PlaneGeometry(0.5, 0.3);
        const flagMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            side: THREE.DoubleSide,
            emissive: 0x440000,
            emissiveIntensity: 0.1
        });
        
        const flag = new THREE.Mesh(flagGeometry, flagMaterial);
        flag.position.set(0.25, 1.7, 0);
        group.add(flag);
        
        group.position.set(x, 0, z);
        return group;
    }
    
    
    /**
     * Create optimized fence system using instancing
     * For very large fields or many fences
     */
    createOptimizedFenceSystem(fenceSegments) {
        return this.fencePresets.createInstancedFenceSystem(fenceSegments);
    }
    
    /**
     * Update structures (for animations, etc)
     */
    update(deltaTime) {
        // Animate flags waving
        this.structures.decorations.forEach(decoration => {
            decoration.traverse(child => {
                if (child.geometry && child.geometry.type === 'PlaneGeometry' && child.material.color.r > 0.5) {
                    // Simple flag waving animation
                    child.rotation.z = Math.sin(Date.now() * 0.002) * 0.1;
                }
            });
        });
    }

    /**
     * Estimate total triangle count across all built structures
     * (fences + gates + pastures + decorations). Called once post-build;
     * includes all mesh children inside fence/gate/flag groups.
     * InstancedMesh instances are multiplied by instance count.
     * @returns {number}
     */
    getTotalTriangleEstimate() {
        const allStructures = Object.values(this.structures).flat();
        return Math.round(sumObjectTreeTriangles(allStructures));
    }
}