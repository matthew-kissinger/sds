// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import KDBush from 'kdbush';

/**
 * SceneObstacles — proxy collider primitive for "things in the world."
 *
 * Visual meshes are decoration; the sim sees only logical shapes:
 *   - Tree trunks → 2D circles {x, z, radiusXZ}
 *   - Rocks → 2D circles
 *   - Buildings (farmhouse) → AABB
 *
 * Built once at scene load on both client and Worker from the same
 * scene def + seeded placement, so collision data and visual placement
 * cannot drift. Lives in shared/ so the Worker imports it without
 * pulling Three.js.
 *
 * Trees and rocks are indexed via kdbush — a static k-d tree:
 *   - ArrayBuffer-backed (cheap to transfer to Workers)
 *   - Build cost ~µs for hundreds of points
 *   - Radius queries O(log N + k) where k is result count
 *   - Deterministic across V8 versions IFF input order is canonical
 *
 * Buildings are an AABB array — small count, brute-force is fine.
 *
 * @typedef {Object} ObstacleCircle
 * @property {number} x
 * @property {number} z
 * @property {number} radiusXZ
 *
 * @typedef {Object} ObstacleAABB
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minZ
 * @property {number} maxZ
 *
 * @typedef {Object} SceneObstacleSet
 * @property {ObstacleCircle[]} trees
 * @property {KDBush} treeIndex
 * @property {ObstacleCircle[]} rocks
 * @property {KDBush} rockIndex
 * @property {ObstacleAABB[]} buildings
 * @property {(point: {x: number, z: number}, radius: number) => ObstacleCircle[]} queryTrees
 * @property {(point: {x: number, z: number}, radius: number) => ObstacleCircle[]} queryRocks
 */

/**
 * Sort obstacles canonically by (x, z) so kdbush construction order is
 * stable across V8 versions. This is the contract that lets client + Worker
 * produce identical spatial indices from identical input lists.
 *
 * Mutates and returns the input array (caller-friendly for chaining).
 * @param {ObstacleCircle[]} obstacles
 * @returns {ObstacleCircle[]}
 */
export function canonicalSort(obstacles) {
    obstacles.sort((a, b) => {
        if (a.x !== b.x) return a.x - b.x;
        return a.z - b.z;
    });
    return obstacles;
}

/**
 * Build a kdbush index over a list of {x, z}-bearing obstacles.
 * Caller is responsible for canonicalSort first if cross-V8 determinism matters.
 * @param {ObstacleCircle[]} obstacles
 * @returns {KDBush}
 */
function buildIndex(obstacles) {
    const index = new KDBush(obstacles.length);
    for (const o of obstacles) {
        index.add(o.x, o.z);
    }
    index.finish();
    return index;
}

/**
 * Build the SceneObstacles bundle from raw obstacle arrays. Caller-supplied
 * lists are canonical-sorted in place before indexing.
 *
 * @param {Object} input
 * @param {ObstacleCircle[]} [input.trees]
 * @param {ObstacleCircle[]} [input.rocks]
 * @param {ObstacleAABB[]} [input.buildings]
 * @returns {SceneObstacleSet}
 */
export function buildSceneObstacles({ trees = [], rocks = [], buildings = [] } = {}) {
    canonicalSort(trees);
    canonicalSort(rocks);
    const treeIndex = buildIndex(trees);
    const rockIndex = buildIndex(rocks);

    const queryFactory = (list, index) => (point, radius) => {
        const ids = index.within(point.x, point.z, radius);
        // kdbush's `within` returns ids in arbitrary order — sort for caller-determinism
        ids.sort((a, b) => a - b);
        const out = new Array(ids.length);
        for (let i = 0; i < ids.length; i++) {
            out[i] = list[ids[i]];
        }
        return out;
    };

    return {
        trees,
        treeIndex,
        rocks,
        rockIndex,
        buildings,
        queryTrees: queryFactory(trees, treeIndex),
        queryRocks: queryFactory(rocks, rockIndex),
    };
}

/**
 * Empty obstacle set — use as the initial value for scenes that haven't
 * declared trees/rocks/buildings yet. All queries return [].
 * @returns {SceneObstacleSet}
 */
export function emptyObstacles() {
    return buildSceneObstacles();
}

/**
 * Repulsion force from nearby static obstacles (trees/rocks). Used by
 * MovementPhysics to push entities out of overlapping circles.
 *
 * Returns {x, z} steer (scaled vector). Caller adds it to acceleration.
 *
 * @param {{x: number, z: number}} entityPos
 * @param {number} entityRadius
 * @param {ObstacleCircle[]} nearby - from queryTrees/queryRocks
 * @param {Object} [config]
 * @param {number} [config.strength=1]
 * @returns {{x: number, z: number}}
 */
export function obstacleAvoidance(entityPos, entityRadius, nearby, config = {}) {
    const { strength = 1 } = config;
    let fx = 0;
    let fz = 0;
    for (const o of nearby) {
        const dx = entityPos.x - o.x;
        const dz = entityPos.z - o.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = entityRadius + o.radiusXZ;
        if (dist < minDist && dist > 1e-6) {
            // Linear push-out, magnitude proportional to overlap
            const overlap = minDist - dist;
            const inv = 1 / dist;
            fx += dx * inv * overlap * strength;
            fz += dz * inv * overlap * strength;
        }
    }
    return { x: fx, z: fz };
}

/**
 * Test if a point is inside any building AABB. Used by sheep spawn / target
 * placement to reject positions inside the farmhouse footprint.
 * @param {{x: number, z: number}} point
 * @param {ObstacleAABB[]} buildings
 * @param {number} [margin=0]
 * @returns {boolean}
 */
export function pointInsideBuilding(point, buildings, margin = 0) {
    for (const b of buildings) {
        if (point.x >= b.minX - margin && point.x <= b.maxX + margin &&
            point.z >= b.minZ - margin && point.z <= b.maxZ + margin) {
            return true;
        }
    }
    return false;
}
