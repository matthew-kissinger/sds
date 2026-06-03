// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DoubleSide, MeshBasicNodeMaterial, MeshLambertNodeMaterial, MeshStandardNodeMaterial, TSL } from 'three/webgpu';

import { GrassSystem } from '../js/GrassSystem.js';
import { createKonveyorGrassNodeMaterialFactories } from '../js/world/konveyorGrassNodeMaterialFactories.js';
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

    it('can route the meadow quad through the reusable WebGPU node material candidate', () => {
        const contexts = [];
        const nodeFactories = createKonveyorGrassNodeMaterialFactories(
            { MeshLambertNodeMaterial, MeshStandardNodeMaterial, DoubleSide, TSL },
            {
                fogColor: [0.2933, 0.1629, 0.1348],
                fogNear: 18,
                fogFar: 74,
                fogStrength: 0.55,
            }
        );
        const scene = new THREE.Scene();
        const grass = new GrassSystem(scene, false, null, null, null, {
            search: '?renderer=webgpu&konveyorGrass=1',
            konveyorGrassFactories: {
                createMeadowQuadMaterial: (context) => {
                    contexts.push(context);
                    return nodeFactories.createMeadowQuadMaterial(context);
                },
            },
        });

        const material = grass.createMeadowQuadMaterial();
        try {
            expect(material.name).toBe('konveyor-node-meadow-quad');
            expect(material.isMeshLambertNodeMaterial).toBe(true);
            expect(material.isNodeMaterial).toBe(true);
            expect(material.side).toBe(DoubleSide);
            expect(material.colorNode).toBeTruthy();
            expect(grass.konveyorMeadowQuadMaterialSummary).toMatchObject({
                kind: 'meadow-quad',
                applied: true,
            });
            expect(contexts).toHaveLength(1);
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
            expect(contexts[0].geometry).toMatchObject({
                bladeHeight: grass.config.bladeHeight,
                bladeWidth: grass.config.bladeWidth,
                bladeHeightVariation: grass.config.bladeHeightVariation,
            });
            expect(contexts[0].lighting.sunDirection.toArray()).toEqual([0, 1, 0]);
            expect(contexts[0].lighting.sunColor.getHex()).toBe(0xffffff);
            expect(contexts[0].interaction.positions).toBe(grass.interactorPositions);
            expect(contexts[0].interaction.data).toBe(grass.interactorData);
            expect(contexts[0].interaction.facings).toBe(grass.interactorFacings);
            expect(contexts[0].interaction.sheepRadius).toBe(grass.config.sheepInteractionRadius);
            expect(contexts[0].interaction.sheepStrength).toBe(grass.config.sheepInteractionStrength);
            expect(contexts[0].fade).toEqual({ start: 70, end: 260, strength: 1 });
            expect(contexts[0].material).toMatchObject({
                side: THREE.FrontSide,
                transparent: false,
                depthWrite: true,
                depthTest: true,
                alphaHash: true,
                alphaTest: 0.06,
            });
        } finally {
            material.dispose();
        }
    });

    it('can route grass blades through the reusable WebGPU node material candidate', () => {
        const contexts = [];
        const nodeFactories = createKonveyorGrassNodeMaterialFactories(
            { MeshBasicNodeMaterial, MeshLambertNodeMaterial, MeshStandardNodeMaterial, DoubleSide, TSL },
            {
                fogNear: 18,
                fogFar: 74,
            }
        );
        const scene = new THREE.Scene();
        const grass = new GrassSystem(scene, false, null, null, null, {
            search: '?renderer=webgpu&konveyorGrass=1',
            konveyorGrassFactories: {
                createGrassBladeMaterial: (context) => {
                    contexts.push(context);
                    return nodeFactories.createGrassBladeMaterial(context);
                },
            },
        });

        const material = grass.createGrassMaterial();
        try {
            expect(material.name).toBe('konveyor-node-grass-blade');
            expect(material.isMeshBasicNodeMaterial).toBe(true);
            expect(material.isNodeMaterial).toBe(true);
            expect(material.userData.konveyorGrassLighting).toBe('shader-owned-unlit');
            expect(material.side).toBe(THREE.FrontSide);
            expect(material.transparent).toBe(false);
            expect(material.depthWrite).toBe(true);
            expect(material.depthTest).toBe(true);
            expect(material.alphaHash).toBe(true);
            expect(material.alphaTest).toBe(0.06);
            expect(material.colorNode).toBeTruthy();
            expect(material.opacityNode).toBeTruthy();
            expect(material.positionNode).toBeTruthy();
            expect(material.userData.konveyorGrassBladeInteractors).toMatchObject({
                maxNodeInteractors: 4,
                source: 'dog-plus-nearest-sheep-unrolled',
                displacement: 'anchored-fullblade-bend-along-oval-normal-plus-laydown',
                coordinateSource: 'instanceWorldOffset-instanced-attribute',
                overlapMode: 'dominant-contact-capped-vector',
                visualScale: 6.4,
                maxDisplacement: 0.95,
                laydownStrength: 0.85,
                shadowStrength: 0.22,
                shadowUniform: true,
            });
            expect(material.userData.konveyorGrassMaterialControls).toMatchObject({
                tipDampen: 0.36,
                backlightStrength: 0.7,
                rimStrength: 0.2,
                fogStrength: 0.55,
            });
            expect(grass.konveyorGrassBladeMaterialSummary).toMatchObject({
                kind: 'grass-blade',
                applied: true,
            });
            expect(contexts).toHaveLength(1);
        } finally {
            material.dispose();
        }
    });

    it('adds per-clump world offsets to WebGPU grass chunks for contact bending', () => {
        const scene = new THREE.Scene();
        const grass = new GrassSystem(scene, false, null, {
            meshSampleY: () => 7,
        });
        grass.random = () => 0.5;
        grass.clumpGeometry = grass.createClumpGeometry();
        grass.grassMaterial = createMaterial('konveyor-grass-blade');
        grass.konveyorGrassBladeMaterialSummary = { applied: true };

        const chunk = grass.createChunk(0, 0, -5, -5, 5, 5, 3);

        try {
            expect(chunk).toBeTruthy();
            expect(chunk.ownsGeometry).toBe(true);
            expect(chunk.mesh.geometry).not.toBe(grass.clumpGeometry);
            const attr = chunk.mesh.geometry.getAttribute('instanceWorldOffset');
            expect(attr).toBeTruthy();
            expect(attr.itemSize).toBe(3);
            expect(attr.count).toBe(chunk.clumpCount);
            expect(attr.array[0]).toBeCloseTo(0);
            expect(attr.array[1]).toBeCloseTo(7);
            expect(attr.array[2]).toBeCloseTo(0);
        } finally {
            grass.dispose();
        }
    });

    it('copies dog plus sheep interactors into the WebGPU node control packet', () => {
        const nodeFactories = createKonveyorGrassNodeMaterialFactories(
            { MeshBasicNodeMaterial, MeshLambertNodeMaterial, MeshStandardNodeMaterial, DoubleSide, TSL },
            {
                fogNear: 18,
                fogFar: 74,
            }
        );
        const material = nodeFactories.createGrassBladeMaterial({
            tier: 'high',
            interaction: { maxInteractors: 10 },
        });

        try {
            const controls = material.userData.konveyorGrassBladeMaterialControls;
            controls.updateInteractors({
                count: 5,
                positions: new Float32Array([
                    1, 0, 2,
                    3, 0, 4,
                    5, 0, 6,
                    7, 0, 8,
                    9, 0, 10,
                ]),
                facings: new Float32Array([
                    0, 1,
                    1, 0,
                    0, -1,
                    -1, 0,
                    0.7, 0.7,
                ]),
                data: new Float32Array([0, 1, 1, 1, 1]),
            });
            const nodes = controls.nodes;
            expect(nodes.interactionRadius.value).toBeCloseTo(3.52);
            expect(nodes.interactionStrength.value).toBeCloseTo(0.75);
            expect(nodes.sheepInteractionRadius.value).toBeCloseTo(4.0);
            expect(nodes.sheepInteractionStrength.value).toBeCloseTo(0.5);
            expect(material.userData.konveyorGrassBladeInteractors.maxNodeInteractors).toBe(8);
            expect(nodes.interactorCount.value).toBe(5);
            expect(nodes.interactorPositions[0].value.toArray()).toEqual([1, 0, 2]);
            expect(nodes.interactorPositions[4].value.toArray()).toEqual([9, 0, 10]);
            expect(nodes.interactorFacings[1].value.toArray()).toEqual([1, 0]);
            expect(nodes.interactorTypes[0].value).toBe(0);
            expect(nodes.interactorTypes[4].value).toBe(1);
        } finally {
            material.dispose();
        }
    });

    it('uses stronger mobile grass interaction controls for visible dog and sheep displacement', () => {
        const nodeFactories = createKonveyorGrassNodeMaterialFactories(
            { MeshBasicNodeMaterial, MeshLambertNodeMaterial, MeshStandardNodeMaterial, DoubleSide, TSL },
            {
                fogNear: 18,
                fogFar: 74,
            }
        );
        const material = nodeFactories.createGrassBladeMaterial({
            isMobile: true,
            tier: 'high',
            interaction: { maxInteractors: 8 },
        });

        try {
            const controls = material.userData.konveyorGrassBladeMaterialControls;
            const nodes = controls.nodes;
            expect(nodes.interactionRadius.value).toBeCloseTo(4.4);
            expect(nodes.interactionStrength.value).toBeCloseTo(0.93);
            expect(nodes.sheepInteractionRadius.value).toBeCloseTo(5.0);
            expect(nodes.sheepInteractionStrength.value).toBeCloseTo(0.62);
            expect(material.userData.konveyorGrassBladeInteractors).toMatchObject({
                visualScale: 6.8,
                laydownStrength: 0.95,
                shadowStrength: 0.26,
            });
        } finally {
            material.dispose();
        }
    });

    it('can disable WebGPU grass contact darkening for geometry-only proof captures', () => {
        const nodeFactories = createKonveyorGrassNodeMaterialFactories(
            { MeshBasicNodeMaterial, MeshLambertNodeMaterial, MeshStandardNodeMaterial, DoubleSide, TSL },
            {
                fogNear: 18,
                fogFar: 74,
            }
        );
        const material = nodeFactories.createGrassBladeMaterial();

        try {
            const controls = material.userData.konveyorGrassBladeMaterialControls;
            const nodes = controls.nodes;
            expect(nodes.interactionShadowStrength.value).toBeCloseTo(0.22);
            controls.setInteractionShadowStrength({ strength: 0 });
            expect(nodes.interactionShadowStrength.value).toBe(0);
            controls.setInteractionShadowStrength({ strength: 4 });
            expect(nodes.interactionShadowStrength.value).toBe(1);
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
        expect(grass.getInteractorSample()).toEqual([
            {
                type: 'sheep',
                position: { x: 1, y: 0, z: 2 },
                facing: { x: 0, z: 1 },
            },
        ]);
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

    it('applies quality state to grass distance and density LOD knobs', () => {
        const scene = new THREE.Scene();
        const grass = new GrassSystem(scene);
        const chunk = {
            isMeadowQuad: false,
            lodLevel: 0,
            fullCount: 100,
            mesh: { count: 100 },
        };
        grass.chunks.set('0,0', chunk);

        grass.applyQualityState({ grassDistanceScale: 0.55 });

        expect(grass.qualityDistanceScale).toBe(0.55);
        expect(grass.qualityDensityScale).toBe(0.55);
        expect(grass.config.lodDecimateMid).toBeCloseTo(110);
        expect(grass.config.lodDecimateFar).toBeCloseTo(154);
        expect(chunk.mesh.count).toBe(55);
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
