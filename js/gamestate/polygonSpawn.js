/**
 * Polygon-spawn helpers — Cycle 29 Stream B2.
 *
 * Pure-function geometry. Extracted from GameState's
 * calculatePolygonSpawnConfig / pointToSegmentDistance / isPointInPolygon
 * methods so the orchestrator can stay slim and these helpers become
 * trivially unit-testable without constructing a GameState.
 *
 * No imports from js/. No state. No mutations of input. Returns plain
 * data the caller can drop into spawnConfig.
 *
 * Note: separate copies of pointToSegmentDistance / isPointInPolygon
 * also live in js/OptimizedSheep.js, js/SandboxConfig.js, and
 * js/StructureBuilder.js — those are out of scope for Cycle 29 (the
 * cycle's goal is decomposing GameState, not de-duplicating across
 * unrelated modules). A future cycle could unify them all here.
 */

/**
 * Distance from point (px, pz) to the line segment (start, end).
 *
 * @param {number} px
 * @param {number} pz
 * @param {{x: number, z: number}} start
 * @param {{x: number, z: number}} end
 * @returns {number}
 */
export function pointToSegmentDistance(px, pz, start, end) {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.sqrt(dx * dx + dz * dz);

    if (length === 0) {
        return Math.sqrt(Math.pow(px - start.x, 2) + Math.pow(pz - start.z, 2));
    }

    const t = Math.max(0, Math.min(1,
        ((px - start.x) * dx + (pz - start.z) * dz) / (length * length)
    ));

    const closestX = start.x + t * dx;
    const closestZ = start.z + t * dz;

    return Math.sqrt(Math.pow(px - closestX, 2) + Math.pow(pz - closestZ, 2));
}

/**
 * Ray-casting point-in-polygon test. Returns true for points inside
 * the polygon defined by `points`. Returns true (assumes-inside) when
 * `points` is null or has < 3 vertices, matching the original behavior
 * of GameState.isPointInPolygon — callers depended on that "no
 * polygon = no constraint" branch.
 *
 * @param {number} x
 * @param {number} z
 * @param {Array<{x: number, z: number}> | null | undefined} points
 * @returns {boolean}
 */
export function isPointInPolygon(x, z, points) {
    if (!points || points.length < 3) return true;

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
 * Calculate spawn configuration for a polygon-shaped field. Uses the
 * polygon centroid as the spawn center, biased 30% toward south (away
 * from the gate's Z if the gate is to the north). For concave polygons
 * the centroid may fall outside; in that case a 10x10 grid search inside
 * the bounds finds the most-interior point and uses that. Spawn radius
 * is 60% of the distance from spawn-center to the nearest polygon edge,
 * with a 10-unit minimum.
 *
 * @param {object} args
 * @param {Array<{x: number, z: number}>} args.borderPoints
 * @param {{minX: number, maxX: number, minZ: number, maxZ: number}} args.bounds
 * @param {{position?: {z: number}} | null | undefined} args.gate
 * @returns {{centerX: number, centerZ: number, spreadRadius: number}}
 */
export function calculatePolygonSpawnConfig({ borderPoints, bounds, gate }) {
    const points = borderPoints;

    // Calculate centroid of polygon
    let centroidX = 0;
    let centroidZ = 0;
    for (const point of points) {
        centroidX += point.x;
        centroidZ += point.z;
    }
    centroidX /= points.length;
    centroidZ /= points.length;

    // Move spawn center slightly away from gate (toward south)
    const gateZ = gate?.position?.z || bounds.maxZ;
    let spawnCenterX = centroidX;
    let spawnCenterZ = centroidZ - (gateZ - centroidZ) * 0.3; // Move 30% away from gate

    // For concave polygons, the centroid or adjusted position might be outside
    // Validate and find a valid spawn center if needed
    if (!isPointInPolygon(spawnCenterX, spawnCenterZ, points)) {
        console.log(`[SPAWN] Initial spawn center (${spawnCenterX.toFixed(1)}, ${spawnCenterZ.toFixed(1)}) is outside polygon, searching for valid point...`);

        // Try the raw centroid first
        if (isPointInPolygon(centroidX, centroidZ, points)) {
            spawnCenterX = centroidX;
            spawnCenterZ = centroidZ;
        } else {
            // Search for a valid point using a grid search within bounds
            const gridSize = 10;
            const stepX = (bounds.maxX - bounds.minX) / gridSize;
            const stepZ = (bounds.maxZ - bounds.minZ) / gridSize;
            let bestPoint = null;
            let bestDistFromEdges = 0;

            for (let gx = 1; gx < gridSize; gx++) {
                for (let gz = 1; gz < gridSize; gz++) {
                    const testX = bounds.minX + gx * stepX;
                    const testZ = bounds.minZ + gz * stepZ;

                    if (isPointInPolygon(testX, testZ, points)) {
                        // Calculate minimum distance to any edge
                        let minDist = Infinity;
                        for (let i = 0; i < points.length; i++) {
                            const start = points[i];
                            const end = points[(i + 1) % points.length];
                            const dist = pointToSegmentDistance(testX, testZ, start, end);
                            minDist = Math.min(minDist, dist);
                        }

                        // Prefer points further from edges (more "inside")
                        if (minDist > bestDistFromEdges) {
                            bestDistFromEdges = minDist;
                            bestPoint = { x: testX, z: testZ };
                        }
                    }
                }
            }

            if (bestPoint) {
                spawnCenterX = bestPoint.x;
                spawnCenterZ = bestPoint.z;
                console.log(`[SPAWN] Found valid spawn center at (${spawnCenterX.toFixed(1)}, ${spawnCenterZ.toFixed(1)}), dist from edge: ${bestDistFromEdges.toFixed(1)}`);
            }
        }
    }

    // Calculate safe spawn radius (distance to nearest edge from spawn center)
    let minDistToEdge = Infinity;
    for (let i = 0; i < points.length; i++) {
        const start = points[i];
        const end = points[(i + 1) % points.length];
        const dist = pointToSegmentDistance(spawnCenterX, spawnCenterZ, start, end);
        minDistToEdge = Math.min(minDistToEdge, dist);
    }

    // Use 60% of the distance to edge as spawn radius for safety margin
    const spreadRadius = minDistToEdge * 0.6;

    return {
        centerX: spawnCenterX,
        centerZ: spawnCenterZ,
        spreadRadius: Math.max(spreadRadius, 10) // Minimum 10 units
    };
}
