// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// GPU compute-driven per-instance culling for the consolidated native trees
// (Cycle 81, productionizing the Cycle 80 proof; Cycle 91 adds appendable
// capacity + distance LOD). Each tree child-mesh renders as ONE InstancedMesh
// across the whole scene via DATA-COMPACTION: a TSL renderer.compute() pass
// tests every instance and writes the survivors' full matrices into a
// compacted storage instanceMatrix, which THREE's InstanceNode consumes
// unchanged - material-agnostic, so the real branch/leaf node materials need
// no edits. One drawIndexedIndirect per consolidated mesh, whose
// instanceCount the compute pass writes.
//
// Cycle 91 (Phase 2.5 item 4 + Phase 3 consolidation):
// - Controllers are APPENDABLE: source storage is allocated at `capacity`
//   and `append()` writes new instances into the tail + bumps a liveCount
//   uniform, so streamed waves extend the same controller instead of minting
//   per-wave controllers (~108 on NSL collapsed to <= 8).
// - Optional distance LOD rides the cull condition: `lodRole: 'near'`
//   controllers drop instances beyond `lodDistance` (camera XZ), 'far'
//   controllers keep the complement. The camera-relative threshold is safe
//   here, unlike the WebGL billboard rule's distance-from-origin requirement:
//   the pass re-evaluates per frame with no mesh/render-list switching
//   (data-compaction only changes instance counts; meshes stay pinned).
//
// `webGpuModules` is the three.webgpu namespace passed in so js/ keeps no
// static three/tsl import and the WebGL bundle stays clean.

export function createTreeComputeCull(webGpuModules, opts) {
    const {
        InstancedMesh, Vector2, Vector4, Frustum, Matrix4,
        StorageInstancedBufferAttribute, IndirectStorageBufferAttribute, TSL,
    } = webGpuModules;
    const {
        Fn, storage, instanceIndex, uint, float, bool, dot, If, uniform,
        atomicAdd, atomicStore,
    } = TSL;

    const {
        geometry, material, matrices, offsets, count,
        cullRadius = 15.0, castShadow = false, receiveShadow = true,
        lodRole = null, lodDistance = 0, lodEnabled = false,
    } = opts;
    const capacity = Math.max(opts.capacity ?? count, count, 1);
    let used = count;

    const geo = geometry.clone();
    const indexCount = geo.index ? geo.index.count : geo.attributes.position.count;
    const indirectAttr = new IndirectStorageBufferAttribute(new Uint32Array([indexCount, 0, 0, 0, 0]), 1);
    geo.setIndirect(indirectAttr);

    // Capacity-sized source stores. If the caller's arrays already match the
    // capacity (the registry's pre-sized impostor store), adopt them in place
    // so append() writes one shared buffer; otherwise copy into fresh stores.
    const sourceMatrices = matrices.length === capacity * 16
        ? matrices
        : (() => { const a = new Float32Array(capacity * 16); a.set(matrices.subarray(0, count * 16)); return a; })();
    const sourceOffsets = offsets.length === capacity * 3
        ? offsets
        : (() => { const a = new Float32Array(capacity * 3); a.set(offsets.subarray(0, count * 3)); return a; })();

    const sourceMatricesAttr = new StorageInstancedBufferAttribute(sourceMatrices, 16);
    const sourceOffsetsAttr = new StorageInstancedBufferAttribute(sourceOffsets, 3);
    const compactedMatrices = new StorageInstancedBufferAttribute(new Float32Array(capacity * 16), 16);
    const sourceMat = storage(sourceMatricesAttr, 'mat4', capacity).toReadOnly();
    const sourceOff = storage(sourceOffsetsAttr, 'vec3', capacity).toReadOnly();
    const compactMat = storage(compactedMatrices, 'mat4', capacity);
    const indirectStore = storage(indirectAttr, 'uint', 5).toAtomic();

    const planeUniforms = Array.from({ length: 6 }, () => uniform(new Vector4(0, 1, 0, 1e9)));
    const radius = float(cullRadius);
    const liveCount = uniform(used);
    const cameraXZ = uniform(new Vector2(0, 0));
    const lodDistSq = uniform(lodDistance * lodDistance);
    const lodGate = uniform(lodEnabled ? 1 : 0);

    const resetPass = Fn(() => {
        atomicStore(indirectStore.element(1), uint(0));
    })().compute(1);

    const cullPass = Fn(() => {
        const i = instanceIndex;
        // Appendable tail guard: instances past liveCount are unwritten.
        If(float(i).lessThan(liveCount), () => {
            const off = sourceOff.element(i);
            const visible = bool(true).toVar();
            for (let p = 0; p < 6; p++) {
                const pl = planeUniforms[p];
                const signedDist = dot(pl.xyz, off).add(pl.w);
                If(signedDist.lessThan(radius.negate()), () => { visible.assign(bool(false)); });
            }
            if (lodRole) {
                const dx = off.x.sub(cameraXZ.x);
                const dz = off.z.sub(cameraXZ.y);
                const distSq = dx.mul(dx).add(dz.mul(dz));
                if (lodRole === 'near') {
                    If(lodGate.greaterThan(0.5).and(distSq.greaterThanEqual(lodDistSq)), () => {
                        visible.assign(bool(false));
                    });
                } else {
                    If(distSq.lessThan(lodDistSq), () => { visible.assign(bool(false)); });
                }
            }
            If(visible, () => {
                const slot = atomicAdd(indirectStore.element(1), uint(1));
                compactMat.element(slot).assign(sourceMat.element(i)); // data-compaction
            });
        });
    })().compute(capacity);

    // The compacted storage buffer IS the mesh's instanceMatrix (InstanceNode storage path).
    const mesh = new InstancedMesh(geo, material, capacity);
    mesh.instanceMatrix = compactedMatrices;
    mesh.frustumCulled = false;
    mesh.count = capacity;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.userData.webgpuTreeComputeCull = true;

    const frustum = new Frustum();
    const projView = new Matrix4();
    const diag = {
        count: used,
        used,
        capacity,
        lodRole,
        lodDistance,
        lodEnabled: !!lodEnabled,
        indirectAttached: geo.indirect === indirectAttr,
        error: null,
    };

    return {
        mesh,
        diag,
        // Batched-submit path (Cycle 90): the driver updates uniforms here and
        // collects `passes` from every live controller into ONE
        // renderer.compute(array) call. Each renderer.compute() is its own
        // command encoder + queue.submit() in the WebGPU backend; per-wave
        // streaming had fanned NSL out to ~110 controllers = 220 submits per
        // frame (measured 36 vs 145 FPS median, cycle90-validation).
        // WebGPU guarantees dispatch ordering within one compute pass, so
        // reset-then-cull stays correct inside the shared pass.
        passes: [resetPass, cullPass],
        updateCullUniforms(camera) {
            projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            frustum.setFromProjectionMatrix(projView);
            for (let p = 0; p < 6; p++) {
                const pl = frustum.planes[p];
                planeUniforms[p].value.set(pl.normal.x, pl.normal.y, pl.normal.z, pl.constant);
            }
            const e = camera.matrixWorld.elements;
            cameraXZ.value.set(e[12], e[14]);
        },
        runCull(camera, renderer) {
            if (!renderer || !camera || !renderer.compute) return;
            try {
                this.updateCullUniforms(camera);
                renderer.compute(this.passes);
            } catch (e) {
                diag.error = String(e?.message || e);
            }
        },
        /**
         * Append instances into the controller's tail (Cycle 91). Full-buffer
         * re-upload via needsUpdate - appends happen at wave cadence (~13 per
         * NSL load), not per frame. Returns how many fit.
         */
        append(addMatrices, addOffsets, addCount) {
            const n = Math.max(0, Math.min(addCount, capacity - used));
            if (n === 0) return 0;
            sourceMatrices.set(addMatrices.subarray(0, n * 16), used * 16);
            sourceOffsets.set(addOffsets.subarray(0, n * 3), used * 3);
            used += n;
            liveCount.value = used;
            sourceMatricesAttr.needsUpdate = true;
            sourceOffsetsAttr.needsUpdate = true;
            diag.used = used;
            diag.count = used;
            return n;
        },
        setLodEnabled(on) {
            lodGate.value = on ? 1 : 0;
            diag.lodEnabled = !!on;
        },
        setLodDistance(d) {
            lodDistSq.value = d * d;
            diag.lodDistance = d;
        },
        getAppendState() {
            return { matrices: sourceMatrices, offsets: sourceOffsets, used, capacity };
        },
        dispose() {
            // Disposes only the cloned geometry it owns; the material is shared
            // (GLB cache) and torn down by clearTrees, never here.
            try { geo.dispose(); } catch { /* ignore */ }
        },
    };
}
