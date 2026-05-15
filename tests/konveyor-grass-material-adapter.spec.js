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
