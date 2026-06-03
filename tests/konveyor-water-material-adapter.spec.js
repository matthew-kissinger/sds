// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DoubleSide, MeshBasicNodeMaterial, TSL } from 'three/webgpu';

import {
    createAnimeWater,
    createAnimeWaterMaterial,
} from '../js/water/AnimeWater.js';
import { createKonveyorWaterNodeMaterialFactories } from '../js/water/konveyorWaterNodeMaterialFactories.js';
import {
    createKonveyorWaterMaterial,
    shouldApplyKonveyorWater,
} from '../js/water/konveyorWaterMaterialAdapter.js';

const boundary = Object.freeze({
    center: { x: 3, z: -2 },
    radius: 180,
    falloff: 40,
});

function createMaterial(name) {
    const material = new THREE.MeshBasicMaterial();
    material.name = name;
    return material;
}

function createHeightfield() {
    const data = new Float32Array([0, 0.1, 0.2, 0.3]);
    return {
        width: 2,
        height: 2,
        worldSize: 16,
        peakHeight: 1.5,
        getRawArray: () => data,
    };
}

describe('konveyor water material adapter', () => {
    it('requires the explicit WebGPU water flag', () => {
        expect(shouldApplyKonveyorWater('?renderer=webgpu&konveyorWater=1')).toBe(true);
        expect(shouldApplyKonveyorWater('?renderer=webgpu&diagnostic=1')).toBe(false);
        expect(shouldApplyKonveyorWater('?renderer=webgl&konveyorWater=1')).toBe(false);
        expect(shouldApplyKonveyorWater('')).toBe(false);
    });

    it('keeps anime water on the default ShaderMaterial path without the flag', () => {
        const material = createAnimeWaterMaterial({ boundary });

        try {
            expect(material.isShaderMaterial).toBe(true);
            expect(material.uniforms.uShoreCenter.value.x).toBe(3);
            expect(material.uniforms.uShoreCenter.value.y).toBe(-2);
            expect(material.uniforms.uShoreRadius.value).toBe(180);
            expect(material.uniforms.uSunColor.value.toArray()).toEqual([1, 1, 1]);
            expect(material.userData.konveyorWaterMaterialSummary).toMatchObject({
                kind: 'anime-water',
                applied: false,
                reason: 'flag-disabled',
            });
        } finally {
            material.dispose();
        }
    });

    it('routes anime water material creation through an explicit WebGPU factory', () => {
        const contexts = [];
        const material = createAnimeWaterMaterial({
            boundary,
            waterY: -0.25,
            search: '?renderer=webgpu&konveyorWater=1',
            konveyorWaterFactories: {
                createAnimeWaterMaterial: (context) => {
                    contexts.push(context);
                    return createMaterial('konveyor-anime-water');
                },
            },
        });

        try {
            expect(material.name).toBe('konveyor-anime-water');
            expect(material.userData.konveyorWaterMaterialSummary).toMatchObject({
                kind: 'anime-water',
                applied: true,
            });
            expect(contexts).toHaveLength(1);
            expect(contexts[0].shoreline.center).toBeInstanceOf(THREE.Vector2);
            expect(contexts[0].shoreline.radius).toBe(180);
            expect(contexts[0].shoreline.falloff).toBe(40);
            expect(contexts[0].waterY).toBe(-0.25);
            expect(contexts[0].hasHeightfield).toBe(false);
            expect(contexts[0].shallowColor.getHex()).toBe(0x6fd7d2);
            expect(contexts[0].deepColor.getHex()).toBe(0x103662);
            expect(contexts[0].foamColor.getHex()).toBe(0xeaf6ff);
            expect(contexts[0].rippleStrength).toBe(1);
            expect(contexts[0].sparkleStrength).toBe(0.7);
            expect(contexts[0].sunSpecularIntensity).toBe(0.6);
            expect(contexts[0].sunColor.toArray()).toEqual([1, 1, 1]);
            expect(contexts[0].sunColorSource).toBe('skyFog.sunColor');
        } finally {
            material.dispose();
        }
    });

    it('can route anime water through the reusable WebGPU node material candidate', () => {
        const contexts = [];
        const nodeFactories = createKonveyorWaterNodeMaterialFactories(
            { MeshBasicNodeMaterial, DoubleSide, TSL },
            {
                fogColor: [0.2933, 0.1629, 0.1348],
                sunColor: [1, 0.3055, 0.0242],
            }
        );
        const material = createAnimeWaterMaterial({
            boundary,
            heightfield: createHeightfield(),
            waterY: -0.25,
            search: '?renderer=webgpu&konveyorWater=1',
            konveyorWaterFactories: {
                createAnimeWaterMaterial: (context) => {
                    contexts.push(context);
                    return nodeFactories.createAnimeWaterMaterial(context);
                },
            },
        });

        try {
            expect(material.name).toBe('konveyor-node-anime-water');
            expect(material.isMeshBasicNodeMaterial).toBe(true);
            expect(material.isNodeMaterial).toBe(true);
            expect(material.side).toBe(DoubleSide);
            expect(material.colorNode).toBeTruthy();
            expect(material.depthWrite).toBe(true);
            expect(material.userData.konveyorWaterWorldSpaceHeightfield).toBe(true);
            expect(material.userData.konveyorWaterSunCameraGlint).toBe(true);
            expect(material.userData.konveyorWaterGlintMode).toBe('masked-flat-normal-broad-sun-path-plus-ripple-v4');
            expect(material.userData.konveyorWaterGlintGain).toBe(0.70);
            expect(material.userData.konveyorWaterRippleGlintGain).toBe(0.22);
            expect(material.userData.konveyorWaterSunSpecularIntensity).toBe(0.6);
            expect(material.userData.konveyorWaterSunColorSource).toBe('skyFog.sunColor');
            expect(material.userData.konveyorWaterNodeUniforms.sunColor.value.toArray()).toEqual([1, 1, 1]);
            expect(material.userData.konveyorWaterNodeUniforms.sunSpecularIntensity.value).toBe(0.6);
            expect(material.userData.konveyorWaterMaterialControls?.update).toBeInstanceOf(Function);
            material.userData.konveyorWaterMaterialControls.update({
                sunColor: new THREE.Color(1, 0.5, 0.25),
                sunSpecularIntensity: 0.8,
            });
            expect(material.userData.konveyorWaterNodeUniforms.sunColor.value.toArray()[0]).toBeCloseTo(1);
            expect(material.userData.konveyorWaterNodeUniforms.sunColor.value.toArray()[1]).toBeCloseTo(0.5);
            expect(material.userData.konveyorWaterNodeUniforms.sunColor.value.toArray()[2]).toBeCloseTo(0.25);
            expect(material.userData.konveyorWaterNodeUniforms.sunSpecularIntensity.value).toBe(0.8);
            expect(material.userData.konveyorWaterMaterialSummary).toMatchObject({
                kind: 'anime-water',
                applied: true,
                hasControls: true,
            });
            expect(contexts).toHaveLength(1);
            expect(contexts[0].hasHeightfield).toBe(true);
            expect(contexts[0].heightTexture.isDataTexture).toBe(true);
            expect(contexts[0].heightfield).toMatchObject({
                width: 2,
                height: 2,
                worldSize: 16,
                peakHeight: 1.5,
            });
        } finally {
            material.dispose();
            material.userData.heightTexture?.dispose?.();
        }
    });

    it('uses factory controls for anime water updates', () => {
        const updates = [];
        const disposals = [];
        const water = createAnimeWater({
            boundary,
            size: 16,
            segments: 1,
            search: '?renderer=webgpu&konveyorWater=1',
            konveyorWaterFactories: {
                createAnimeWaterMaterial: () => ({
                    material: createMaterial('konveyor-water-with-controls'),
                    controls: {
                        update: (state) => updates.push(state),
                        dispose: () => disposals.push('disposed'),
                    },
                }),
            },
        });

        try {
            expect(water.material.name).toBe('konveyor-water-with-controls');
            expect(water.konveyorWaterMaterialSummary).toMatchObject({
                kind: 'anime-water',
                applied: true,
                hasControls: true,
            });

            const sunDirection = new THREE.Vector3(0, 1, 0);
            const sunColor = new THREE.Color(1, 0.5, 0.25);
            water.update(1.25, sunDirection, sunColor);
            expect(updates).toHaveLength(1);
            expect(updates[0]).toMatchObject({ timeSec: 1.25 });
            expect(updates[0].sunDirection).toBe(sunDirection);
            expect(updates[0].sunColor).toBe(sunColor);
            expect(updates[0].material).toBe(water.material);
        } finally {
            water.dispose();
        }

        expect(disposals).toEqual(['disposed']);
    });

    it('applies quality state to WebGPU water sparkle cost', () => {
        const updates = [];
        const water = createAnimeWater({
            boundary,
            size: 16,
            segments: 1,
            search: '?renderer=webgpu&konveyorWater=1',
            konveyorWaterFactories: {
                createAnimeWaterMaterial: () => ({
                    material: createMaterial('konveyor-water-quality-controls'),
                    controls: {
                        update: (state) => updates.push(state),
                    },
                }),
            },
        });

        try {
            water.setQualityState({ waterSparkleScale: 0.25 });
            water.update(2.0, new THREE.Vector3(0, 1, 0));
            expect(water.qualitySparkleScale).toBe(0.25);
            expect(updates.at(-1)).toMatchObject({
                timeSec: 2.0,
                sparkleStrength: 0.175,
            });
        } finally {
            water.dispose();
        }
    });

    it('falls back to default water material when a factory is missing or invalid', () => {
        const missing = createKonveyorWaterMaterial('anime-water', 'createAnimeWaterMaterial', {
            createDefaultMaterial: () => createMaterial('default-water'),
            search: '?renderer=webgpu&konveyorWater=1',
            factories: {},
        });
        expect(missing.material.name).toBe('default-water');
        expect(missing.summary.reason).toBe('missing-factories');
        missing.material.dispose();

        const invalid = createKonveyorWaterMaterial('anime-water', 'createAnimeWaterMaterial', {
            createDefaultMaterial: () => createMaterial('default-invalid-water'),
            search: '?renderer=webgpu&konveyorWater=1',
            factories: {
                createAnimeWaterMaterial: () => null,
            },
        });
        expect(invalid.material.name).toBe('default-invalid-water');
        expect(invalid.summary.reason).toBe('invalid-factory-result');
        invalid.material.dispose();
    });
});
