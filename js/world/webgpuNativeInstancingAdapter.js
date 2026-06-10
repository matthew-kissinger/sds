// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
function collectInstancedMeshSources(root, { Matrix4 }) {
    root.updateMatrixWorld(true);
    const rootInverse = new Matrix4().copy(root.matrixWorld).invert();
    const sources = [];

    root.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;

        child.updateMatrixWorld(true);
        const localToRoot = new Matrix4().multiplyMatrices(rootInverse, child.matrixWorld);
        const geometry = child.geometry.clone();
        geometry.applyMatrix4(localToRoot);
        geometry.computeBoundingBox();

        sources.push({
            meshName: child.name || '(unnamed)',
            geometry,
            material: child.material,
            materialName: Array.isArray(child.material)
                ? child.material.map((material) => material?.name || '(unnamed)').join(',')
                : child.material?.name || '(unnamed)',
            vertexCount: geometry.attributes?.position?.count ?? 0,
        });
    });

    return sources;
}

function getRootBaseYOffset(root, { Box3 }) {
    const box = new Box3().setFromObject(root);
    return Number.isFinite(box.min.y) ? -box.min.y : 0;
}

export function createWebGpuNativeTreeInstancingPreview({
    scene,
    rootsByAsset,
    plan,
    createDisplayTransform,
    three,
}) {
    const { Box3, InstancedMesh, Matrix4, Object3D } = three;
    if (typeof InstancedMesh !== 'function') {
        return {
            roots: [],
            summary: {
                ok: false,
                reason: 'native-instanced-mesh-unavailable',
            },
        };
    }

    const roots = [];
    const groups = [];
    const missingTypes = [];
    const dummy = new Object3D();

    for (const type of plan.types) {
        const samples = plan.samples.filter((sample) => sample.type === type);
        const sourceRoot = rootsByAsset.get(`tree-lod0:${type}-lod0`);
        if (!sourceRoot) {
            missingTypes.push(type);
            continue;
        }

        const baseYOffset = getRootBaseYOffset(sourceRoot, { Box3 });
        const sources = collectInstancedMeshSources(sourceRoot, { Matrix4 });
        for (const source of sources) {
            const instancedMesh = new InstancedMesh(source.geometry, source.material, samples.length);
            samples.forEach((sample, index) => {
                const display = createDisplayTransform(sample);
                dummy.position.set(
                    display.x,
                    display.y + baseYOffset * display.scaleMultiplier,
                    display.z
                );
                dummy.rotation.set(0, display.rotationY, 0);
                dummy.scale.setScalar(display.scaleMultiplier);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(index, dummy.matrix);
            });
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.frustumCulled = false;
            scene.add(instancedMesh);
            roots.push(instancedMesh);
            groups.push({
                type,
                meshName: source.meshName,
                materialName: source.materialName,
                instances: samples.length,
                isInstancedMesh: instancedMesh.isInstancedMesh === true,
                vertexCount: source.vertexCount,
            });
        }
    }

    const instanceMatrices = groups.reduce((sum, group) => sum + group.instances, 0);
    return {
        roots,
        summary: {
            ok: missingTypes.length === 0
                && groups.length > 0
                && groups.every((group) => group.isInstancedMesh && group.instances > 0 && group.vertexCount > 0),
            source: 'THREE.InstancedMesh',
            productionReference: 'TerrainBuilder InstancedMesh2.addInstances',
            instanceSource: 'shared/TreePlacement.generateTrees samples',
            lod: 'lod0-only',
            instancedMesh2Status: 'not imported in WebGPU diagnostic',
            treeInstances: plan.samples.length,
            instanceMatrices,
            renderedInstanceMeshes: groups.length,
            missingTypes,
            groups,
        },
    };
}

export function createWebGpuNativeRockInstancingPreview({
    scene,
    rootsByAsset,
    plan,
    createDisplayTransform,
    three,
}) {
    const { Box3, InstancedMesh, Matrix4, Object3D } = three;
    if (typeof InstancedMesh !== 'function') {
        return {
            roots: [],
            summary: {
                ok: false,
                reason: 'native-instanced-mesh-unavailable',
            },
        };
    }

    const roots = [];
    const groups = [];
    const missingTypes = [];
    const dummy = new Object3D();

    for (const type of plan.types) {
        const samples = plan.samples.filter((sample) => sample.type === type);
        const sourceRoot = rootsByAsset.get(`rock-lod0:${type}-lod0`);
        if (!sourceRoot) {
            missingTypes.push(type);
            continue;
        }

        const baseYOffset = getRootBaseYOffset(sourceRoot, { Box3 });
        const sources = collectInstancedMeshSources(sourceRoot, { Matrix4 });
        for (const source of sources) {
            const instancedMesh = new InstancedMesh(source.geometry, source.material, samples.length);
            samples.forEach((sample, index) => {
                const display = createDisplayTransform(sample);
                dummy.position.set(
                    display.x,
                    display.y + baseYOffset * display.scaleY,
                    display.z
                );
                dummy.rotation.set(display.rotationX, display.rotationY, display.rotationZ);
                dummy.scale.set(display.scaleX, display.scaleY, display.scaleZ);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(index, dummy.matrix);
            });
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.frustumCulled = false;
            scene.add(instancedMesh);
            roots.push(instancedMesh);
            groups.push({
                type,
                meshName: source.meshName,
                materialName: source.materialName,
                instances: samples.length,
                isInstancedMesh: instancedMesh.isInstancedMesh === true,
                vertexCount: source.vertexCount,
            });
        }
    }

    const instanceMatrices = groups.reduce((sum, group) => sum + group.instances, 0);
    return {
        roots,
        summary: {
            ok: missingTypes.length === 0
                && groups.length > 0
                && groups.every((group) => group.isInstancedMesh && group.instances > 0 && group.vertexCount > 0),
            source: 'THREE.InstancedMesh',
            productionReference: 'RockPlacement InstancedMesh2.addInstances',
            instanceSource: plan.source,
            lod: 'lod0-only',
            instancedMesh2Status: 'not imported in WebGPU diagnostic',
            rockInstances: plan.samples.length,
            instanceMatrices,
            renderedInstanceMeshes: groups.length,
            missingTypes,
            groups,
        },
    };
}
