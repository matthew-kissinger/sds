import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DoubleSide, MeshLambertNodeMaterial, TSL } from 'three/webgpu';

import { TerrainBuilder } from '../js/TerrainBuilder.js';
import {
    createKonveyorTerrainMaterial,
    shouldApplyKonveyorTerrain,
} from '../js/world/konveyorTerrainMaterialAdapter.js';
import { createKonveyorTerrainNodeMaterialFactories } from '../js/world/konveyorTerrainNodeMaterialFactories.js';

function createMaterial(name) {
    const material = new THREE.MeshBasicMaterial();
    material.name = name;
    return material;
}

function createHeightfield() {
    const width = 17;
    const height = 17;
    const data = new Float32Array(width * height);
    for (let i = 0; i < data.length; i++) {
        data[i] = (i % width) / width;
    }
    return {
        width,
        height,
        worldSize: 400,
        peakHeight: 6,
        getRawArray: () => data,
        bakeMeshGrid: ({ segments }) => new Float32Array((segments + 1) * (segments + 1)),
    };
}

function disposeTerrain(builder) {
    const terrain = builder.terrainMesh;
    if (!terrain) return;
    if (terrain.parent) terrain.parent.remove(terrain);
    terrain.geometry?.dispose?.();
    terrain.material?.userData?.heightTexture?.dispose?.();
    terrain.material?.dispose?.();
    builder.terrainMesh = null;
}

describe('konveyor terrain material adapter', () => {
    it('requires the explicit WebGPU terrain flag', () => {
        expect(shouldApplyKonveyorTerrain('?renderer=webgpu&konveyorTerrain=1')).toBe(true);
        expect(shouldApplyKonveyorTerrain('?renderer=webgpu&diagnostic=1')).toBe(false);
        expect(shouldApplyKonveyorTerrain('?renderer=webgl&konveyorTerrain=1')).toBe(false);
        expect(shouldApplyKonveyorTerrain('')).toBe(false);
    });

    it('keeps terrain on the default ShaderMaterial path without the flag', () => {
        const scene = new THREE.Scene();
        const builder = new TerrainBuilder(scene);
        const terrain = builder.createTerrain();

        try {
            expect(terrain.material.isShaderMaterial).toBe(true);
            expect(terrain.material.uniforms.baseColor1.value.getHex()).toBe(0x3d5c2e);
            expect(terrain.material.uniforms.dirtColor.value.getHex()).toBe(0x6b5d4a);
            expect(terrain.material.fragmentShader).toContain('fbm(vWorldPos.xz * 0.02)');
            expect(terrain.material.fragmentShader).toContain('#include <fog_fragment>');
            expect(terrain.material.polygonOffset).toBe(true);
            expect(builder.konveyorTerrainMaterialSummary).toMatchObject({
                kind: 'terrain-ground',
                applied: false,
                reason: 'flag-disabled',
            });
        } finally {
            disposeTerrain(builder);
        }
    });

    it('routes terrain material creation through an explicit WebGPU factory', () => {
        const contexts = [];
        const scene = new THREE.Scene();
        const builder = new TerrainBuilder(scene, true, null, {
            search: '?renderer=webgpu&konveyorTerrain=1',
            konveyorTerrainFactories: {
                createTerrainMaterial: (context) => {
                    contexts.push(context);
                    return createMaterial('konveyor-terrain-ground');
                },
            },
        });
        builder.setHeightfield({
            width: 17,
            height: 17,
            worldSize: 400,
            peakHeight: 6,
            bakeMeshGrid: ({ segments }) => new Array((segments + 1) * (segments + 1)).fill(0),
        });

        const terrain = builder.createTerrain();
        try {
            expect(terrain.material.name).toBe('konveyor-terrain-ground');
            expect(builder.konveyorTerrainMaterialSummary).toMatchObject({
                kind: 'terrain-ground',
                applied: true,
            });
            expect(contexts).toHaveLength(1);
            expect(contexts[0].size).toBe(3200);
            expect(contexts[0].segments).toBe(256);
            expect(contexts[0].isMobile).toBe(true);
            expect(contexts[0].hasHeightfield).toBe(true);
            expect(typeof contexts[0].createHeightTexture).toBe('function');
            expect(contexts[0].heightfield).toMatchObject({
                width: 17,
                height: 17,
                worldSize: 400,
                peakHeight: 6,
            });
            expect(contexts[0].colors.baseColor1.getHex()).toBe(0x3d5c2e);
            expect(contexts[0].colors.dirtColor.getHex()).toBe(0x6b5d4a);
            expect(contexts[0].noise.baseScales).toEqual([0.02, 0.05, 0.1]);
            expect(contexts[0].noise.hashVector).toEqual([127.1, 311.7]);
            expect(contexts[0].polygonOffset).toMatchObject({
                enabled: true,
                factor: 1,
                units: 1,
            });
        } finally {
            disposeTerrain(builder);
        }
    });

    it('can route terrain ground through the reusable WebGPU node material candidate', () => {
        const contexts = [];
        const nodeFactories = createKonveyorTerrainNodeMaterialFactories(
            { MeshLambertNodeMaterial, DoubleSide, TSL },
            { fogColor: [0.2933, 0.1629, 0.1348] }
        );
        const scene = new THREE.Scene();
        const builder = new TerrainBuilder(scene, false, null, {
            search: '?renderer=webgpu&konveyorTerrain=1',
            konveyorTerrainFactories: {
                createTerrainMaterial: (context) => {
                    contexts.push(context);
                    return nodeFactories.createTerrainMaterial(context);
                },
            },
        });
        builder.setHeightfield(createHeightfield());

        const terrain = builder.createTerrain();
        try {
            expect(terrain.material.name).toBe('konveyor-node-terrain-heightfield');
            expect(terrain.material.isMeshLambertNodeMaterial).toBe(true);
            expect(terrain.material.isNodeMaterial).toBe(true);
            expect(terrain.material.side).toBe(THREE.FrontSide);
            expect(terrain.material.colorNode).toBeTruthy();
            expect(terrain.material.polygonOffset).toBe(true);
            expect(terrain.material.polygonOffsetFactor).toBe(1);
            expect(terrain.material.polygonOffsetUnits).toBe(1);
            expect(builder.konveyorTerrainMaterialSummary).toMatchObject({
                kind: 'terrain-ground',
                applied: true,
            });
            expect(contexts).toHaveLength(1);
            expect(contexts[0].hasHeightfield).toBe(true);
            expect(contexts[0].heightfield).toMatchObject({
                width: 17,
                height: 17,
                worldSize: 400,
                peakHeight: 6,
            });
            expect(terrain.material.userData.heightTexture.isDataTexture).toBe(true);
            expect(terrain.material.userData.heightTexture.format).toBe(THREE.RedFormat);
            expect(terrain.material.userData.heightTexture.type).toBe(THREE.FloatType);
            expect(terrain.material.userData.heightTexture.magFilter).toBe(THREE.LinearFilter);
            expect(terrain.material.userData.heightTexture.minFilter).toBe(THREE.LinearFilter);
        } finally {
            disposeTerrain(builder);
        }
    });

    it('falls back to default terrain material when a factory is missing or invalid', () => {
        const missing = createKonveyorTerrainMaterial('terrain-ground', 'createTerrainMaterial', {
            createDefaultMaterial: () => createMaterial('default-terrain'),
            search: '?renderer=webgpu&konveyorTerrain=1',
            factories: {},
        });
        expect(missing.material.name).toBe('default-terrain');
        expect(missing.summary.reason).toBe('missing-factories');
        missing.material.dispose();

        const invalid = createKonveyorTerrainMaterial('terrain-ground', 'createTerrainMaterial', {
            createDefaultMaterial: () => createMaterial('default-invalid-terrain'),
            search: '?renderer=webgpu&konveyorTerrain=1',
            factories: {
                createTerrainMaterial: () => null,
            },
        });
        expect(invalid.material.name).toBe('default-invalid-terrain');
        expect(invalid.summary.reason).toBe('invalid-factory-result');
        invalid.material.dispose();
    });

    it('disposes factory terrain controls during scene teardown', () => {
        const disposals = [];
        const scene = new THREE.Scene();
        const builder = new TerrainBuilder(scene, true, null, {
            search: '?renderer=webgpu&konveyorTerrain=1',
            konveyorTerrainFactories: {
                createTerrainMaterial: () => ({
                    material: createMaterial('konveyor-terrain-with-controls'),
                    controls: {
                        dispose: () => disposals.push('disposed'),
                    },
                }),
            },
        });

        builder.createTerrain();
        builder.dispose();

        expect(disposals).toEqual(['disposed']);
        expect(builder.terrainMesh).toBe(null);
    });
});
