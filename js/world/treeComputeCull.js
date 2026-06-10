// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// GPU compute-driven per-instance frustum culling for the consolidated native
// (lod0) trees (Cycle 81, productionizing the Cycle 80 proof). Each tree child-mesh
// renders as ONE InstancedMesh across the whole scene via DATA-COMPACTION: a TSL
// renderer.compute() pass frustum-tests every instance and writes the survivors'
// full matrices into a compacted storage instanceMatrix, which THREE's InstanceNode
// consumes unchanged - material-agnostic, so the real branch/leaf node materials need
// no edits. One drawIndexedIndirect per consolidated mesh, whose instanceCount the
// compute pass writes. Collapses the per-chunk tree fan-out (~410 InstancedMeshes) to
// one mesh per child-mesh.
//
// Only the lod0-only native path consolidates here (no hybrid impostor LOD to
// preserve). `webGpuModules` is the three.webgpu namespace passed in so js/ keeps no
// static three/tsl import and the WebGL bundle stays clean.

export function createTreeComputeCull(webGpuModules, opts) {
    const {
        InstancedMesh, Vector4, Frustum, Matrix4,
        StorageInstancedBufferAttribute, IndirectStorageBufferAttribute, TSL,
    } = webGpuModules;
    const {
        Fn, storage, instanceIndex, uint, float, bool, dot, If, uniform,
        atomicAdd, atomicStore,
    } = TSL;

    const {
        geometry, material, matrices, offsets, count,
        cullRadius = 15.0, castShadow = false, receiveShadow = true,
    } = opts;

    const geo = geometry.clone();
    const indexCount = geo.index ? geo.index.count : geo.attributes.position.count;
    const indirectAttr = new IndirectStorageBufferAttribute(new Uint32Array([indexCount, 0, 0, 0, 0]), 1);
    geo.setIndirect(indirectAttr);

    // Read-only source matrices/offsets + the compute-written compacted instanceMatrix.
    const sourceMatricesAttr = new StorageInstancedBufferAttribute(matrices, 16);
    const sourceOffsetsAttr = new StorageInstancedBufferAttribute(offsets, 3);
    const compactedMatrices = new StorageInstancedBufferAttribute(new Float32Array(count * 16), 16);
    const sourceMat = storage(sourceMatricesAttr, 'mat4', count).toReadOnly();
    const sourceOff = storage(sourceOffsetsAttr, 'vec3', count).toReadOnly();
    const compactMat = storage(compactedMatrices, 'mat4', count);
    const indirectStore = storage(indirectAttr, 'uint', 5).toAtomic();

    const planeUniforms = Array.from({ length: 6 }, () => uniform(new Vector4(0, 1, 0, 1e9)));
    const radius = float(cullRadius);

    const resetPass = Fn(() => {
        atomicStore(indirectStore.element(1), uint(0));
    })().compute(1);

    const cullPass = Fn(() => {
        const i = instanceIndex;
        const off = sourceOff.element(i);
        const visible = bool(true).toVar();
        for (let p = 0; p < 6; p++) {
            const pl = planeUniforms[p];
            const signedDist = dot(pl.xyz, off).add(pl.w);
            If(signedDist.lessThan(radius.negate()), () => { visible.assign(bool(false)); });
        }
        If(visible, () => {
            const slot = atomicAdd(indirectStore.element(1), uint(1));
            compactMat.element(slot).assign(sourceMat.element(i)); // data-compaction
        });
    })().compute(count);

    // The compacted storage buffer IS the mesh's instanceMatrix (InstanceNode storage path).
    const mesh = new InstancedMesh(geo, material, count);
    mesh.instanceMatrix = compactedMatrices;
    mesh.frustumCulled = false;
    mesh.count = count;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.userData.webgpuTreeComputeCull = true;

    const frustum = new Frustum();
    const projView = new Matrix4();
    const diag = { count, indirectAttached: geo.indirect === indirectAttr, error: null };

    return {
        mesh,
        diag,
        runCull(camera, renderer) {
            if (!renderer || !camera || !renderer.compute) return;
            try {
                projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
                frustum.setFromProjectionMatrix(projView);
                for (let p = 0; p < 6; p++) {
                    const pl = frustum.planes[p];
                    planeUniforms[p].value.set(pl.normal.x, pl.normal.y, pl.normal.z, pl.constant);
                }
                renderer.compute(resetPass);
                renderer.compute(cullPass);
            } catch (e) {
                diag.error = String(e?.message || e);
            }
        },
        dispose() {
            // Disposes only the cloned geometry it owns; the material is shared
            // (GLB cache) and torn down by clearTrees, never here.
            try { geo.dispose(); } catch { /* ignore */ }
        },
    };
}
