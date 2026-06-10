// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// GPU compute-driven per-instance frustum culling for the consolidated grass field
// (Cycle 81, productionizing the Cycle 80 proof). The whole field renders as ONE
// InstancedMesh: a TSL renderer.compute() pass frustum-tests every clump and stream-
// compacts the survivors' indices into a visibleIdx buffer, and a single
// drawIndexedIndirect (whose instanceCount the compute pass writes) draws only those.
// The webgpu blade material reads per-instance data through the compaction remap and
// folds the clump transform (T*R*S, byte-identical to the per-chunk instanceMatrix)
// into positionNode, so the look is pixel-identical to the per-chunk path while
// collapsing ~740 InstancedMeshes to 1.
//
// `webGpuModules` is the three.webgpu namespace (lazy-loaded by the WebGPU boot),
// passed in so js/ keeps no static three/tsl import and the WebGL bundle stays clean.

export function createGrassComputeCull(webGpuModules, opts) {
    const {
        InstancedMesh, Vector4, Frustum, Matrix4,
        StorageInstancedBufferAttribute, IndirectStorageBufferAttribute, TSL,
    } = webGpuModules;
    const {
        Fn, instancedArray, storage, instanceIndex, uint, float,
        bool, dot, If, uniform, atomicAdd, atomicStore,
    } = TSL;

    const { clumpGeometry, offsets, transforms, count, cullRadius = 4.0 } = opts;
    if (typeof opts.buildMaterial !== 'function') {
        throw new Error('createGrassComputeCull requires opts.buildMaterial');
    }

    // Cloned so attaching the indirect buffer never mutates the shared source
    // geometry. drawIndexedIndirect args: [indexCount, instanceCount, firstIndex,
    // baseVertex, firstInstance]; the compute pass writes the instanceCount slot.
    const geometry = clumpGeometry.clone();
    const indexCount = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    const indirectAttr = new IndirectStorageBufferAttribute(new Uint32Array([indexCount, 0, 0, 0, 0]), 1);
    geometry.setIndirect(indirectAttr);

    // Per-instance source data (read-only in the cull pass and the material).
    const offsetsAttr = new StorageInstancedBufferAttribute(offsets, 3);       // (x, baseY, z)
    const transformsAttr = new StorageInstancedBufferAttribute(transforms, 3); // (yaw, scale, heightMul)
    const offsetsBuf = storage(offsetsAttr, 'vec3', count).toReadOnly();
    const transformsBuf = storage(transformsAttr, 'vec3', count).toReadOnly();
    const visibleIdx = instancedArray(count, 'uint');                  // compacted real indices
    const indirectStore = storage(indirectAttr, 'uint', 5).toAtomic(); // atomic instanceCount slot

    // Frustum planes pushed in as uniforms each frame (THREE plane: n.p + constant).
    const planeUniforms = Array.from({ length: 6 }, () => uniform(new Vector4(0, 1, 0, 1e9)));
    const radius = float(cullRadius);

    const resetPass = Fn(() => {
        atomicStore(indirectStore.element(1), uint(0));
    })().compute(1);

    const cullPass = Fn(() => {
        const i = instanceIndex;
        const off = offsetsBuf.element(i);
        const visible = bool(true).toVar();
        for (let p = 0; p < 6; p++) {
            const pl = planeUniforms[p];
            const signedDist = dot(pl.xyz, off).add(pl.w);
            If(signedDist.lessThan(radius.negate()), () => { visible.assign(bool(false)); });
        }
        If(visible, () => {
            const slot = atomicAdd(indirectStore.element(1), uint(1));
            visibleIdx.element(slot).assign(i);
        });
    })().compute(count);

    const cullNodes = { offsetsBuf, transformsBuf, visibleIdx };
    const material = opts.buildMaterial(cullNodes);

    // One consolidated InstancedMesh with an identity instanceMatrix - the material
    // folds the per-clump T*R*S itself (the indirect buffer drives the draw count).
    const mesh = new InstancedMesh(geometry, material, count);
    const im = mesh.instanceMatrix.array;
    for (let i = 0; i < count; i++) {
        const o = i * 16;
        im[o] = 1; im[o + 5] = 1; im[o + 10] = 1; im[o + 15] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;   // the GPU compute pass culls per-instance
    mesh.count = count;           // capacity; the indirect buffer drives the live draw count
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    const frustum = new Frustum();
    const projView = new Matrix4();
    const diag = { count, visible: -1, indirectAttached: geometry.indirect === indirectAttr, error: null, readbacks: 0 };
    if (typeof window !== 'undefined') window.__sdsGrassComputeCull = diag;

    let readbackBusy = false;

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
        async readbackVisibleAsync(renderer) {
            if (readbackBusy || !renderer || !renderer.getArrayBufferAsync) return diag.visible;
            readbackBusy = true;
            try {
                const buf = await renderer.getArrayBufferAsync(indirectAttr);
                diag.visible = new Uint32Array(buf)[1];
                diag.readbacks++;
            } catch (e) {
                diag.error = String(e?.message || e);
            } finally {
                readbackBusy = false;
            }
            return diag.visible;
        },
        dispose() {
            // Disposes only the cloned geometry it owns. The material is owned by
            // GrassSystem (this.grassMaterial) and disposed there.
            try { geometry.dispose(); } catch { /* ignore */ }
        },
    };
}
