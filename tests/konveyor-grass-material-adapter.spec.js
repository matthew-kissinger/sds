import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { GrassSystem } from '../js/GrassSystem.js';
import {
    createKonveyorGrassMaterial,
    shouldApplyKonveyorGrass,
} from '../js/world/konveyorGrassMaterialAdapter.js';

function createMaterial(name) {
    const material = new THREE.MeshBasicMaterial();
    material.name = name;
    return material;
}

describe('konveyor grass material adapter', () => {
    it('requires the explicit WebGPU grass flag', () => {
        expect(shouldApplyKonveyorGrass('?renderer=webgpu&konveyorGrass=1')).toBe(true);
        expect(shouldApplyKonveyorGrass('?renderer=webgpu&diagnostic=1')).toBe(false);
        expect(shouldApplyKonveyorGrass('?renderer=webgl&konveyorGrass=1')).toBe(false);
        expect(shouldApplyKonveyorGrass('')).toBe(false);
    });

    it('leaves the default meadow quad material untouched without flag and factories', () => {
        const scene = new THREE.Scene();
        const grass = new GrassSystem(scene);
        const material = grass.createMeadowQuadMaterial();

        try {
            expect(material.isMeshLambertMaterial).toBe(true);
            expect(material.defines).toEqual({ USE_UV: '' });
            expect(grass.konveyorMeadowQuadMaterialSummary).toMatchObject({
                kind: 'meadow-quad',
                applied: false,
                reason: 'flag-disabled',
            });

            const shader = {
                uniforms: {},
                fragmentShader: '#include <common>\n#include <map_fragment>',
            };
            material.onBeforeCompile(shader);
            expect(shader.uniforms.uMeadowBase.value.getHex()).toBe(grass.config.baseColor.getHex());
            expect(shader.fragmentShader).toContain('meadowHash');
            expect(shader.fragmentShader).toContain('vUv * 5.0');
        } finally {
            material.dispose();
        }
    });

    it('leaves the default grass blade material untouched without flag and factories', () => {
        const scene = new THREE.Scene();
        const grass = new GrassSystem(scene);
        const material = grass.createGrassMaterial();

        try {
            expect(material.isShaderMaterial).toBe(true);
            expect(material.uniforms.baseColor.value.getHex()).toBe(grass.config.baseColor.getHex());
            expect(material.uniforms.windStrength.value).toBe(grass.config.windStrength);
            expect(material.uniforms.grassFadeStart.value).toBe(70);
            expect(grass.konveyorGrassBladeMaterialSummary).toMatchObject({
                kind: 'grass-blade',
                applied: false,
                reason: 'flag-disabled',
            });
        } finally {
            material.dispose();
        }
    });

    it('routes meadow quad material creation through an explicit WebGPU factory', () => {
        const contexts = [];
        const scene = new THREE.Scene();
        const grass = new GrassSystem(scene, false, null, null, null, {
            search: '?renderer=webgpu&konveyorGrass=1',
            konveyorGrassFactories: {
                createMeadowQuadMaterial: (context) => {
                    contexts.push(context);
                    return createMaterial('konveyor-meadow-quad');
                },
            },
        });

        const material = grass.createMeadowQuadMaterial();
        try {
            expect(material.name).toBe('konveyor-meadow-quad');
            expect(grass.konveyorMeadowQuadMaterialSummary).toMatchObject({
                kind: 'meadow-quad',
                applied: true,
            });
            expect(contexts).toHaveLength(1);
            expect(contexts[0].baseColor.getHex()).toBe(grass.config.baseColor.getHex());
            expect(contexts[0].midColor.getHex()).toBe(grass.config.midColor.getHex());
            expect(contexts[0].tipColor.getHex()).toBe(grass.config.tipColor.getHex());
            expect(contexts[0].uvCellsPerChunk).toBe(5);
            expect(contexts[0].noiseHashVector).toEqual([127.1, 311.7]);
            expect(contexts[0].noiseOctaves).toEqual([1, 2]);
        } finally {
            material.dispose();
        }
    });

    it('routes grass blade material creation through an explicit WebGPU factory', () => {
        const contexts = [];
        const scene = new THREE.Scene();
        const grass = new GrassSystem(scene, false, null, null, null, {
            search: '?renderer=webgpu&konveyorGrass=1',
            konveyorGrassFactories: {
                createGrassBladeMaterial: (context) => {
                    contexts.push(context);
                    return createMaterial('konveyor-grass-blade');
                },
            },
        });

        const material = grass.createGrassMaterial();
        try {
            expect(material.name).toBe('konveyor-grass-blade');
            expect(grass.konveyorGrassBladeMaterialSummary).toMatchObject({
                kind: 'grass-blade',
                applied: true,
            });
            expect(contexts).toHaveLength(1);
            expect(contexts[0].isMobile).toBe(false);
            expect(contexts[0].tier).toBe('med');
            expect(contexts[0].colors.baseColor.getHex()).toBe(grass.config.baseColor.getHex());
            expect(contexts[0].colors.midColor.getHex()).toBe(grass.config.midColor.getHex());
            expect(contexts[0].colors.tipColor.getHex()).toBe(grass.config.tipColor.getHex());
            expect(contexts[0].wind).toMatchObject({
                strength: grass.config.windStrength,
                speed: grass.config.windSpeed,
                gustStrength: grass.config.gustStrength,
            });
            expect(contexts[0].interaction.positions).toBe(grass.interactorPositions);
            expect(contexts[0].interaction.data).toBe(grass.interactorData);
            expect(contexts[0].interaction.facings).toBe(grass.interactorFacings);
            expect(contexts[0].fade).toEqual({ start: 70, end: 260 });
        } finally {
            material.dispose();
        }
    });

    it('uses factory controls for grass blade updates', () => {
        const calls = [];
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x88aacc, 0.002);
        const grass = new GrassSystem(scene, false, null, null, null, {
            search: '?renderer=webgpu&konveyorGrass=1',
            konveyorGrassFactories: {
                createGrassBladeMaterial: () => ({
                    material: createMaterial('konveyor-grass-blade-controls'),
                    controls: {
                        updateInteractors: (state) => calls.push(['interactors', state]),
                        update: (state) => calls.push(['update', state]),
                        setWind: (state) => calls.push(['wind', state]),
                        setSunDirection: (state) => calls.push(['sun', state]),
                        dispose: () => calls.push(['dispose']),
                    },
                }),
            },
        });
        grass.grassMaterial = grass.createGrassMaterial();
        grass.initializationSucceeded = true;

        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
        camera.position.set(1, 2, 3);
        camera.updateMatrixWorld();
        const sunDir = new THREE.Vector3(0, 1, 0);
        grass.updateInteractors([{ position: { x: 1, y: 0, z: 2 }, type: 'sheep', facing: { x: 0, z: 1 } }]);
        grass.update(0.25, camera, null);
        grass.setWind(0.4, { x: 0.2, y: 0.8 });
        grass.setSunDirection(sunDir);
        grass.dispose();

        expect(calls.map(([kind]) => kind)).toEqual(['interactors', 'update', 'wind', 'sun', 'dispose']);
        expect(calls[0][1]).toMatchObject({ count: 1 });
        expect(calls[0][1].positions).toBe(grass.interactorPositions);
        expect(calls[1][1]).toMatchObject({ time: 0.25, deltaTime: 0.25, camera });
        expect(calls[1][1].sceneFog).toBe(scene.fog);
        expect(calls[2][1]).toMatchObject({ strength: 0.4 });
        expect(calls[3][1].sunDir).toBe(sunDir);
    });

    it('falls back to default meadow material when a factory is missing or invalid', () => {
        const missing = createKonveyorGrassMaterial('meadow-quad', 'createMeadowQuadMaterial', {
            createDefaultMaterial: () => createMaterial('default-meadow'),
            search: '?renderer=webgpu&konveyorGrass=1',
            factories: {},
        });
        expect(missing.material.name).toBe('default-meadow');
        expect(missing.summary.reason).toBe('missing-factories');
        missing.material.dispose();

        const invalid = createKonveyorGrassMaterial('meadow-quad', 'createMeadowQuadMaterial', {
            createDefaultMaterial: () => createMaterial('default-invalid-meadow'),
            search: '?renderer=webgpu&konveyorGrass=1',
            factories: {
                createMeadowQuadMaterial: () => null,
            },
        });
        expect(invalid.material.name).toBe('default-invalid-meadow');
        expect(invalid.summary.reason).toBe('invalid-factory-result');
        invalid.material.dispose();
    });
});
