/**
 * TriangleCount.js
 *
 * Shared helpers for estimating triangle counts from Three.js geometry.
 * Used by PerformanceMonitor system-breakdown reporting - display only.
 */

/**
 * Count triangles in a BufferGeometry. Indexed geometries expose index.count,
 * non-indexed fall back to position attribute count / 3.
 * @param {THREE.BufferGeometry | null | undefined} geometry
 * @returns {number}
 */
export function geometryTriangleCount(geometry) {
    if (!geometry) return 0;
    if (geometry.index) return geometry.index.count / 3;
    if (geometry.attributes && geometry.attributes.position) {
        return geometry.attributes.position.count / 3;
    }
    return 0;
}

/**
 * Triangle count for a single Mesh (or zero if missing).
 * @param {THREE.Mesh | null | undefined} mesh
 * @returns {number}
 */
export function countMeshTriangles(mesh) {
    if (!mesh || !mesh.geometry) return 0;
    return geometryTriangleCount(mesh.geometry);
}

/**
 * Sum triangle counts across an array of InstancedMeshes (or InstancedMesh2).
 * Each instance renders the same geometry, so total = trisPerInstance * count.
 *
 * Cycle 23 Phase F: prefer `instancesCount` (set immediately by
 * InstancedMesh2.addInstances) over `count` (re-set per-frame after frustum
 * culling — it can be 0 at init time before the first render). This fix
 * unwedges the "Trees: 0" stat-panel reading for v1.3.0 trees, which use
 * @three.ez/instanced-mesh and were being measured at the post-cull count
 * before the first frame had drawn.
 *
 * @param {Array<THREE.InstancedMesh|InstancedMesh2>} instancedMeshes
 * @returns {number}
 */
export function sumInstancedMeshTriangles(instancedMeshes) {
    if (!Array.isArray(instancedMeshes)) return 0;
    let total = 0;
    for (const mesh of instancedMeshes) {
        if (!mesh) continue;
        const tris = geometryTriangleCount(mesh.geometry);
        const count = typeof mesh.instancesCount === 'number'
            ? mesh.instancesCount
            : (typeof mesh.count === 'number' ? mesh.count : 0);
        total += tris * count;
    }
    return total;
}

/**
 * Walk each Object3D in the array and sum triangles for every child mesh,
 * respecting InstancedMesh instance counts. Used for cloned GLB hierarchies
 * (mountains, fence groups) where a single "instance" is a group of meshes.
 * @param {Array<THREE.Object3D>} roots
 * @returns {number}
 */
export function sumObjectTreeTriangles(roots) {
    if (!Array.isArray(roots)) return 0;
    let total = 0;
    for (const root of roots) {
        if (!root) continue;
        root.traverse(child => {
            if (!child.isMesh) return;
            const tris = geometryTriangleCount(child.geometry);
            const instanceCount = child.isInstancedMesh && typeof child.count === 'number'
                ? child.count
                : 1;
            total += tris * instanceCount;
        });
    }
    return total;
}
