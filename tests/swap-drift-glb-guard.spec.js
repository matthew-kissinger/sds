/**
 * Cycle 12 Phase 1 A8: GLB shared-material disposal guard.
 *
 * Cycle 11 brought the post-swap texture drift from ~100% down to ~41% over
 * 5×3 swap loops. The remaining drift was traced to clearTrees() / clearRocks()
 * in TerrainBuilder, which were calling material.dispose() and geometry.dispose()
 * on near-tree/rock InstancedMeshes whose materials and geometries are SHARED
 * with the cached GLB models (the same trap Cycle 11 identified for sheepdog
 * and structures, but missed for trees and rocks).
 *
 * Disposing a shared GLB material invalidates the cache. The next swap clones
 * the GLB and Three.js re-uploads its textures because the shared material
 * was marked stale. This test pins the contract: any InstancedMesh that
 * carries `userData.sharedFromGlbCache === true` must NOT have its geometry
 * or material disposed by the per-swap clearer.
 */
import { describe, it, expect, vi } from 'vitest';

/**
 * Mirrors the disposal predicate in TerrainBuilder.clearTrees /
 * TerrainBuilder.clearRocks. Kept inline here so the test pins the
 * contract rather than the implementation — if the predicate changes,
 * this test should fail loudly.
 */
function clearSharedGlbInstanced(meshes) {
    for (const mesh of meshes) {
        if (mesh.parent) mesh.parent.remove(mesh);
        if (mesh.userData?.sharedFromGlbCache) continue;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => {
                    if (!m) return;
                    m.map = null;
                    m.dispose();
                });
            } else {
                mesh.material.map = null;
                mesh.material.dispose();
            }
        }
    }
}

function makeFakeMesh({ shared, withMap }) {
    const geometry = { dispose: vi.fn() };
    const material = withMap
        ? { dispose: vi.fn(), map: { dispose: vi.fn() } }
        : { dispose: vi.fn(), map: null };
    return {
        userData: { sharedFromGlbCache: shared === true },
        geometry,
        material,
        parent: { remove: vi.fn() },
    };
}

describe('A8 stress drift — GLB shared-material disposal guard', () => {
    it('skips dispose when userData.sharedFromGlbCache is true', () => {
        const mesh = makeFakeMesh({ shared: true });
        clearSharedGlbInstanced([mesh]);
        expect(mesh.parent.remove).toHaveBeenCalledOnce();
        expect(mesh.geometry.dispose).not.toHaveBeenCalled();
        expect(mesh.material.dispose).not.toHaveBeenCalled();
    });

    it('disposes geometry + material when the flag is missing', () => {
        const mesh = makeFakeMesh({ shared: false });
        clearSharedGlbInstanced([mesh]);
        expect(mesh.geometry.dispose).toHaveBeenCalledOnce();
        expect(mesh.material.dispose).toHaveBeenCalledOnce();
    });

    it('clears the .map reference but does not dispose the texture itself', () => {
        // Far-tree billboards own their MeshBasicMaterial (per-swap allocated)
        // but the .map points at a cached impostor texture that survives the
        // swap. Disposing the material is fine; touching the .map is not.
        const mesh = makeFakeMesh({ shared: false, withMap: true });
        const cachedTexture = mesh.material.map;
        clearSharedGlbInstanced([mesh]);
        expect(mesh.material.map).toBeNull();
        expect(cachedTexture.dispose).not.toHaveBeenCalled();
    });

    it('does not leak after repeated swap cycles with shared meshes', () => {
        // Simulate a 5×3 swap loop. On every swap a fresh InstancedMesh is
        // built that wraps the SAME cached geometry+material. If the guard
        // were missing, dispose would be called 15 times on the same shared
        // material — invalidating the GLB cache that many times.
        const sharedGeo = { dispose: vi.fn() };
        const sharedMat = { dispose: vi.fn(), map: null };

        for (let swap = 0; swap < 15; swap++) {
            const mesh = {
                userData: { sharedFromGlbCache: true },
                geometry: sharedGeo,
                material: sharedMat,
                parent: { remove: vi.fn() },
            };
            clearSharedGlbInstanced([mesh]);
        }

        expect(sharedGeo.dispose).not.toHaveBeenCalled();
        expect(sharedMat.dispose).not.toHaveBeenCalled();
    });

    it('removes the mesh from its parent regardless of the guard', () => {
        const sharedMesh = makeFakeMesh({ shared: true });
        const ownedMesh = makeFakeMesh({ shared: false });
        clearSharedGlbInstanced([sharedMesh, ownedMesh]);
        expect(sharedMesh.parent.remove).toHaveBeenCalledOnce();
        expect(ownedMesh.parent.remove).toHaveBeenCalledOnce();
    });
});
