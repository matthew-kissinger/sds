import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshStandardNodeMaterial, TSL } from 'three/webgpu';

import { OptimizedSheepSystem } from '../js/OptimizedSheep.js';
import { createKonveyorSheepNodeMaterialFactories } from '../js/konveyorSheepNodeMaterialFactories.js';
import {
    createKonveyorSheepMaterial,
    shouldApplyKonveyorSheep,
} from '../js/konveyorSheepMaterialAdapter.js';

function createMaterial(name) {
    const material = new THREE.MeshBasicMaterial();
    material.name = name;
    return material;
}

describe('konveyor sheep material adapter', () => {
    it('requires the explicit WebGPU sheep flag', () => {
        expect(shouldApplyKonveyorSheep('?renderer=webgpu&konveyorSheep=1')).toBe(true);
        expect(shouldApplyKonveyorSheep('?renderer=webgpu&diagnostic=1')).toBe(false);
        expect(shouldApplyKonveyorSheep('?renderer=webgl&konveyorSheep=1')).toBe(false);
        expect(shouldApplyKonveyorSheep('')).toBe(false);
    });

    it('leaves the default optimized sheep material untouched without flag and factories', () => {
        const scene = new THREE.Scene();
        const sheep = new OptimizedSheepSystem(scene, 0);

        try {
            expect(sheep.material.isShaderMaterial).toBe(true);
            expect(sheep.material.vertexColors).toBe(true);
            expect(sheep.material.fog).toBe(false);
            expect(sheep.material.uniforms.time.value).toBe(0);
            expect(sheep.material.uniforms.globalAnimSpeed.value).toBe(1);
            expect(sheep.instancedMesh.material).toBe(sheep.material);
            expect(sheep.konveyorSheepMaterialSummary).toMatchObject({
                kind: 'sheep-wool',
                applied: false,
                reason: 'flag-disabled',
            });
        } finally {
            sheep.dispose();
        }
    });

    it('routes optimized sheep material creation through an explicit WebGPU factory', () => {
        const contexts = [];
        const scene = new THREE.Scene();
        const sheep = new OptimizedSheepSystem(scene, 2, null, false, {
            search: '?renderer=webgpu&konveyorSheep=1',
            konveyorSheepFactories: {
                createSheepMaterial: (context) => {
                    contexts.push(context);
                    return createMaterial('konveyor-sheep-wool');
                },
            },
        });

        try {
            expect(sheep.material.name).toBe('konveyor-sheep-wool');
            expect(sheep.instancedMesh.material).toBe(sheep.material);
            expect(sheep.konveyorSheepMaterialSummary).toMatchObject({
                kind: 'sheep-wool',
                applied: true,
            });
            expect(contexts).toHaveLength(1);
            expect(contexts[0].sheepCount).toBe(2);
            expect(contexts[0].vertexShader).toContain('attribute float vertexId');
            expect(contexts[0].fragmentShader).toContain('vColor');
            expect(contexts[0].uniforms.time.value).toBe(0);
            expect(contexts[0].uniforms.globalAnimSpeed.value).toBe(1);
            expect(contexts[0].colors.body.getHex()).toBe(0xffffff);
            expect(contexts[0].colors.face.toArray()).toEqual([0.22, 0.20, 0.18]);
            expect(contexts[0].colors.hoof.toArray()).toEqual([0.16, 0.16, 0.16]);
            expect(contexts[0].lighting.direction.toArray()).toEqual([0.3, 1.0, 0.5]);
            expect(contexts[0].lighting.rimColor.toArray()).toEqual([1.0, 1.0, 1.0]);
            expect(contexts[0].lighting.sssColor.toArray()).toEqual([1.0, 1.0, 0.98]);
            expect(contexts[0].wool).toEqual({
                noiseScale: 0.78,
                displacementStrength: 0.065,
                breathingStrength: 0.012,
            });
            expect(contexts[0].fog.color.getHex()).toBe(0xcccccc);
            expect(contexts[0].fog.near).toBe(18);
            expect(contexts[0].fog.far).toBe(92);
            expect(contexts[0].material).toEqual({ vertexColors: true, fog: false });
            expect(contexts[0].geometry.vertexCount).toBeGreaterThan(0);
            expect(contexts[0].geometry.triangleCount).toBeGreaterThan(0);
            expect(contexts[0].geometry.vertexAttributes).toEqual(
                expect.arrayContaining(['position', 'normal', 'uv', 'color', 'vertexId'])
            );
            expect(contexts[0].geometry.instanceAttributes).toEqual(['instanceData', 'instanceAnimation']);
        } finally {
            sheep.dispose();
        }
    });

    it('can route optimized sheep through the reusable WebGPU wool node material candidate', () => {
        const contexts = [];
        const nodeFactories = createKonveyorSheepNodeMaterialFactories({ MeshStandardNodeMaterial, TSL });
        const scene = new THREE.Scene();
        const sheep = new OptimizedSheepSystem(scene, 1, null, false, {
            search: '?renderer=webgpu&konveyorSheep=1',
            konveyorSheepFactories: {
                createSheepMaterial: (context) => {
                    contexts.push(context);
                    return nodeFactories.createSheepMaterial(context);
                },
            },
        });

        try {
            expect(sheep.material.name).toBe('konveyor-node-sheep-wool');
            expect(sheep.material.isMeshStandardNodeMaterial).toBe(true);
            expect(sheep.material.isNodeMaterial).toBe(true);
            expect(sheep.material.vertexColors).toBe(true);
            expect(sheep.material.fog).toBe(false);
            expect(sheep.material.colorNode).toBeTruthy();
            expect(sheep.material.positionNode).toBeTruthy();
            expect(sheep.material.userData.konveyorSheepWool).toMatchObject({
                vertexColorSource: 'geometry-color-attribute',
                bodyOnlyWoolShading: true,
                bodyOnlyWoolDisplacement: true,
                silhouetteBreakup: 'normal-offset-plus-rim-color-breakup',
                fog: 'scene-synced-controls',
            });
            expect(sheep.material.userData.konveyorSheepAnimation).toMatchObject({
                source: 'vertexId-instanceData-instanceAnimation',
                body: true,
                head: true,
                legs: true,
                wool: true,
                animationSpeed: 1,
                legMotion: 'lower-leg-weighted-fore-aft-constrained-lift',
            });
            expect(sheep.instancedMesh.material).toBe(sheep.material);
            expect(sheep.konveyorSheepMaterialSummary).toMatchObject({
                kind: 'sheep-wool',
                applied: true,
                hasControls: true,
            });
            expect(contexts).toHaveLength(1);
        } finally {
            sheep.dispose();
        }
    });

    it('uses factory controls for sheep material updates', () => {
        const calls = [];
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x88aacc, 0.002);
        const sheep = new OptimizedSheepSystem(scene, 0, null, false, {
            search: '?renderer=webgpu&konveyorSheep=1',
            konveyorSheepFactories: {
                createSheepMaterial: () => ({
                    material: createMaterial('konveyor-sheep-controls'),
                    controls: {
                        update: (state) => calls.push(['update', state]),
                        dispose: () => calls.push(['dispose']),
                    },
                }),
            },
        });

        sheep.update(0.25, null, null, null, null, null);
        sheep.dispose();

        expect(calls.map(([kind]) => kind)).toEqual(['update', 'dispose']);
        expect(calls[0][1]).toMatchObject({
            deltaTime: 0.25,
            sceneFog: scene.fog,
            material: expect.objectContaining({ name: 'konveyor-sheep-controls' }),
        });
    });

    it('uses built-in WebGPU sheep controls for scene fog updates', () => {
        const nodeFactories = createKonveyorSheepNodeMaterialFactories({ MeshStandardNodeMaterial, TSL });
        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x6688aa, 12, 72);
        const sheep = new OptimizedSheepSystem(scene, 0, null, false, {
            search: '?renderer=webgpu&konveyorSheep=1',
            konveyorSheepFactories: nodeFactories,
        });

        try {
            const controls = sheep.konveyorSheepMaterialControls;
            expect(controls).toBeTruthy();
            sheep.update(0.1, null, null, null, null, null);
            expect(controls.nodes.fogColor.value.toArray()).toEqual([
                scene.fog.color.r,
                scene.fog.color.g,
                scene.fog.color.b,
            ]);
            expect(controls.nodes.fogNear.value).toBe(12);
            expect(controls.nodes.fogFar.value).toBe(72);
        } finally {
            sheep.dispose();
        }
    });

    it('falls back to the default sheep material when a factory is missing or invalid', () => {
        const missing = createKonveyorSheepMaterial('sheep-wool', 'createSheepMaterial', {
            createDefaultMaterial: () => createMaterial('default-sheep'),
            search: '?renderer=webgpu&konveyorSheep=1',
            factories: {},
        });
        expect(missing.material.name).toBe('default-sheep');
        expect(missing.summary.reason).toBe('missing-factories');
        missing.material.dispose();

        const invalid = createKonveyorSheepMaterial('sheep-wool', 'createSheepMaterial', {
            createDefaultMaterial: () => createMaterial('default-invalid-sheep'),
            search: '?renderer=webgpu&konveyorSheep=1',
            factories: {
                createSheepMaterial: () => null,
            },
        });
        expect(invalid.material.name).toBe('default-invalid-sheep');
        expect(invalid.summary.reason).toBe('invalid-factory-result');
        invalid.material.dispose();
    });
});
