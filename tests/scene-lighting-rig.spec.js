// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 120 - the sun tells the truth about what time it is.
 *
 * The defect these pin: the production WebGPU scene held an AmbientLight and a
 * DirectionalLight that nothing was ever wired to drive, while `Atmosphere`
 * spent every frame driving two objects that were in no scene at all. Binding a
 * light absent from the scene was a silent no-op, so it read 3.456 white at
 * every hour including full night and nothing anywhere failed.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as WEBGPU from 'three/webgpu';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Atmosphere } from '../js/atmosphere/index.js';
import { NIGHT_T } from '../shared/survival/dayClock.js';
import { installProductionWebGpuLightingBridge } from '../js/rendering/productionWebGpuBoot.js';
import {
    AMBIENT_REFERENCE_INTENSITY,
    BOOT_SUN_DIRECTION,
    PRODUCTION_SCENE_LIGHT_PROFILE,
    REFERENCE_AMBIENT_HINT,
    SUN_REFERENCE_INTENSITY,
    SUN_RIG_DISTANCE,
    SceneLightingRig,
    WEBGL_SCENE_LIGHT_PROFILE,
    ambientIntensityForHint,
    lightLuminance,
    sunDaylightGate,
} from '../js/world/sceneLightingRig.js';

const ROOT = resolve(import.meta.dirname, '..');

/** A production-shaped rig over a real scene, the way the boot bridge builds it. */
function productionRig() {
    const scene = new THREE.Scene();
    const ambient = new THREE.AmbientLight(0xffffff, AMBIENT_REFERENCE_INTENSITY);
    const sun = new THREE.DirectionalLight(0xffffff, SUN_REFERENCE_INTENSITY);
    sun.userData.shadowConfigured = true;
    scene.add(ambient);
    scene.add(sun);
    scene.add(sun.target);
    const rig = new SceneLightingRig({
        scene,
        ambient,
        sun,
        profile: PRODUCTION_SCENE_LIGHT_PROFILE,
    });
    return { scene, ambient, sun, rig };
}

describe('SceneLightingRig - a bind that cannot be wrong', () => {
    it('refuses a light that is not in the scene it is meant to light', () => {
        const scene = new THREE.Scene();
        const orphan = new THREE.AmbientLight(0xffffff, AMBIENT_REFERENCE_INTENSITY);
        // Exactly the shipped defect: constructed, never added, then bound.
        expect(() => new SceneLightingRig({ scene, ambient: orphan })).toThrow(/not in the scene/);
    });

    it('refuses an orphan sun as loudly as an orphan ambient', () => {
        const scene = new THREE.Scene();
        const ambient = new THREE.AmbientLight(0xffffff, 1);
        scene.add(ambient);
        const orphanSun = new THREE.DirectionalLight(0xffffff, 1);
        expect(() => new SceneLightingRig({ scene, ambient, sun: orphanSun })).toThrow(/not in the scene/);
    });

    it('accepts lights that are in the scene', () => {
        expect(() => productionRig()).not.toThrow();
    });
});

describe('SceneLightingRig - sun direction and shadow focus are separate meanings', () => {
    it('derives the transform from both, so recentring the frustum leaves the angle alone', () => {
        const { sun, rig } = productionRig();
        rig.setSunDirection({ x: 0, y: 1, z: 0 });
        const before = rig.getSunDirection();

        rig.setShadowFocus(120, -80);

        expect(rig.getSunDirection()).toEqual(before);
        // position = focus + direction * distance, target = focus.
        expect(sun.position.x).toBeCloseTo(120, 6);
        expect(sun.position.y).toBeCloseTo(SUN_RIG_DISTANCE, 6);
        expect(sun.position.z).toBeCloseTo(-80, 6);
        expect(sun.target.position.x).toBeCloseTo(120, 6);
        expect(sun.target.position.z).toBeCloseTo(-80, 6);
    });

    it('moves the sun without moving the frustum focus', () => {
        const { sun, rig } = productionRig();
        rig.setShadowFocus(50, 50);
        rig.setSunDirection({ x: 1, y: 1, z: 0 });

        expect(rig.getShadowFocus()).toEqual({ x: 50, z: 50 });
        expect(sun.target.position.x).toBeCloseTo(50, 6);
        expect(sun.target.position.z).toBeCloseTo(50, 6);
        const dir = rig.getSunDirection();
        expect(sun.position.x - sun.target.position.x).toBeCloseTo(dir.x * SUN_RIG_DISTANCE, 6);
        expect(sun.position.z - sun.target.position.z).toBeCloseTo(dir.z * SUN_RIG_DISTANCE, 6);
    });

    it('parks the light overhead rather than under the terrain once the sun is down', () => {
        const { sun, rig } = productionRig();
        rig.setSunDirection({ x: 0.3, y: -0.9, z: 0.3 });
        expect(sun.position.y).toBeGreaterThan(0);
    });

    it('skips the transform when the snapped focus has not moved', () => {
        const { sun, rig } = productionRig();
        rig.setShadowFocus(12, 34);
        let updates = 0;
        sun.target.updateMatrixWorld = () => { updates += 1; };
        rig.setShadowFocus(12, 34);
        expect(updates).toBe(0);
        rig.setShadowFocus(12.5, 34);
        expect(updates).toBe(1);
    });

    it('boots at the angle the production directional shipped frozen at', () => {
        const { rig } = productionRig();
        const len = Math.hypot(BOOT_SUN_DIRECTION.x, BOOT_SUN_DIRECTION.y, BOOT_SUN_DIRECTION.z);
        expect(rig.getSunDirection().x).toBeCloseTo(BOOT_SUN_DIRECTION.x / len, 9);
        expect(rig.getSunDirection().y).toBeCloseTo(BOOT_SUN_DIRECTION.y / len, 9);
        expect(rig.getSunDirection().z).toBeCloseTo(BOOT_SUN_DIRECTION.z / len, 9);
    });
});

describe('the production lighting bridge publishes what it lit', () => {
    it('adds both lights and hands the same object identities to the rig', () => {
        const scene = new THREE.Scene();
        const sceneManager = { isMobile: false, getScene: () => scene };
        const state = {};
        const installed = installProductionWebGpuLightingBridge(sceneManager, state, WEBGPU);

        expect(installed).not.toBeNull();
        expect(state.webGpuLightingBridge.ok).toBe(true);
        const rig = sceneManager.sceneLightingRig;
        expect(rig).toBeInstanceOf(SceneLightingRig);
        // The identity that was missing: the rig's lights ARE the scene's lights.
        expect(scene.children).toContain(rig.ambient);
        expect(scene.children).toContain(rig.sun);
        expect(sceneManager.webgpuSunLight).toBe(rig.sun);
        expect(sceneManager.ambientLight).toBe(rig.ambient);
        expect(rig.sun.intensity).toBeCloseTo(SUN_REFERENCE_INTENSITY, 9);
        expect(rig.ambient.intensity).toBeCloseTo(AMBIENT_REFERENCE_INTENSITY, 9);

        installed.dispose();
        expect(scene.children).not.toContain(rig.ambient);
    });

    it('drives the object that is in the scene, not a copy of it', () => {
        const scene = new THREE.Scene();
        const sceneManager = { isMobile: false, getScene: () => scene };
        installProductionWebGpuLightingBridge(sceneManager, {}, WEBGPU);
        const sunInScene = scene.children.find((c) => c.isDirectionalLight === true);

        const atmo = new Atmosphere(scene, { initialPreset: 'pastoral-noon', attachSky: false });
        atmo.bindSceneLights(sceneManager.sceneLightingRig);
        atmo.setTimeOfDay(NIGHT_T);

        expect(sunInScene.intensity).toBeLessThan(SUN_REFERENCE_INTENSITY * 0.05);
        atmo.dispose();
    });
});

describe('the sun tracks the sky', () => {
    it('falls to nothing once the sun is down and holds through the day', () => {
        expect(sunDaylightGate(70 * Math.PI / 180)).toBe(1);
        expect(sunDaylightGate(30 * Math.PI / 180)).toBe(1);
        expect(sunDaylightGate(0)).toBeCloseTo(0.5, 6);
        expect(sunDaylightGate(-20 * Math.PI / 180)).toBe(0);
        // Monotonic across the horizon band, so sundown is a fade not a switch.
        const band = [8, 4, 2, 0, -2, -4].map((d) => sunDaylightGate(d * Math.PI / 180));
        for (let i = 1; i < band.length; i++) expect(band[i]).toBeLessThan(band[i - 1]);
    });

    it('drops the scene sun intensity when the sun sets', () => {
        const { scene, sun, rig } = productionRig();
        const atmo = new Atmosphere(scene, { initialPreset: 'pastoral-noon', attachSky: false });
        atmo.bindSceneLights(rig);
        const noon = sun.intensity;
        expect(noon).toBeCloseTo(SUN_REFERENCE_INTENSITY, 6);

        atmo.setTimeOfDay(NIGHT_T);
        expect(sun.intensity).toBeLessThan(noon * 0.05);
        atmo.dispose();
    });

    it('turns the scene sun with time of day', () => {
        const { scene, rig } = productionRig();
        const atmo = new Atmosphere(scene, { initialPreset: 'pastoral-noon', attachSky: false });
        atmo.bindSceneLights(rig);

        atmo.setTimeOfDay(0.5);
        const noon = rig.getSunDirection();
        atmo.setTimeOfDay(0.25);
        const dawn = rig.getSunDirection();

        expect(noon.y).toBeGreaterThan(0.9);
        expect(dawn.y).toBeLessThan(0.2);
        expect(Math.abs(noon.x - dawn.x) + Math.abs(noon.z - dawn.z)).toBeGreaterThan(0.5);
        atmo.dispose();
    });

    it('a day-loop shadow recentre does not disturb the angle the atmosphere set', () => {
        const { scene, rig } = productionRig();
        const atmo = new Atmosphere(scene, { initialPreset: 'pastoral-noon', attachSky: false });
        atmo.bindSceneLights(rig);
        atmo.setTimeOfDay(0.7);
        const driven = rig.getSunDirection();

        // What initWorld's _tickDayLoop does every frame of a survival run.
        rig.setShadowFocus(-410, 260);
        rig.setShadowFocus(-410.14, 260.14);

        expect(rig.getSunDirection()).toEqual(driven);
        atmo.dispose();
    });

    it('makes full night dark instead of mid-afternoon', () => {
        const { scene, ambient, sun, rig } = productionRig();
        const atmo = new Atmosphere(scene, { initialPreset: 'pastoral-noon', attachSky: false });
        atmo.bindSceneLights(rig);
        atmo.setTimeOfDay(0.5);
        const noonLit = ambient.intensity + sun.intensity;

        atmo.setTimeOfDay(0.0);
        const nightLit = ambient.intensity + sun.intensity;
        expect(sun.intensity).toBe(0);
        // Dark, but not black: survival is played through the night and an
        // unlit island is a bug, not a night.
        expect(nightLit).toBeLessThan(noonLit * 0.15);
        expect(ambient.intensity).toBeGreaterThan(0);
        atmo.dispose();
    });
});

describe('the two rigs stay where they are', () => {
    it('reproduces the raw preset hint on the WebGL ambient, unchanged', () => {
        for (const hint of [0.55, 0.42, 0.14, 0.65]) {
            expect(ambientIntensityForHint(hint, WEBGL_SCENE_LIGHT_PROFILE)).toBeCloseTo(hint, 9);
        }
    });

    it('leaves the WebGL ambient colour raw, the way that rig is balanced', () => {
        const scene = new THREE.Scene();
        const ambient = new THREE.AmbientLight(0xffffff, 1);
        scene.add(ambient);
        const rig = new SceneLightingRig({ scene, ambient, profile: WEBGL_SCENE_LIGHT_PROFILE });
        const tint = new THREE.Color(0x101728);
        rig.setAmbientColor(tint);
        expect(ambient.color.r).toBeCloseTo(tint.r, 9);
        expect(ambient.color.b).toBeCloseTo(tint.b, 9);
    });

    it('anchors the production ambient on the intensity that was already in the scene', () => {
        expect(ambientIntensityForHint(REFERENCE_AMBIENT_HINT, PRODUCTION_SCENE_LIGHT_PROFILE))
            .toBeCloseTo(AMBIENT_REFERENCE_INTENSITY, 9);
    });

    it('splits hue from level on the production ambient so a dark tint cannot black the scene out', () => {
        const { ambient, rig } = productionRig();
        rig.setAmbientColor(new THREE.Color(0x101728));
        // Unit luminance: the tint carries colour, the intensity carries level.
        expect(lightLuminance(ambient.color)).toBeCloseTo(1, 6);
        expect(ambient.color.b).toBeGreaterThan(ambient.color.r);

        // And the reference preset still reads as today's white 0.75*PI.
        rig.setAmbientColor(new THREE.Color(0xc8d4e0));
        rig.setAmbientIntensity(ambientIntensityForHint(REFERENCE_AMBIENT_HINT, rig.profile));
        expect(lightLuminance(ambient.color) * ambient.intensity)
            .toBeCloseTo(AMBIENT_REFERENCE_INTENSITY, 6);
    });
});

describe('the far-tree impostor stays on the leaf\'s sun', () => {
    it('reads the reference intensity from the one module that owns it', () => {
        const source = readFileSync(resolve(ROOT, 'js/webgpuKilnImpostorNodeMaterial.js'), 'utf8');
        expect(source).toMatch(/import \{ SUN_REFERENCE_INTENSITY \} from '\.\/world\/sceneLightingRig\.js'/);
        // The value it used to restate by hand. One source or it drifts.
        expect(source).not.toMatch(/=\s*1\.1\s*\*\s*Math\.PI/);
    });

    it('carries the daylight gate on the intensity setImpostorTint reads', () => {
        const { scene, rig } = productionRig();
        const atmo = new Atmosphere(scene, { initialPreset: 'pastoral-noon', attachSky: false });
        atmo.bindSceneLights(rig);

        atmo.setTimeOfDay(0.5);
        // main.js feeds `atmosphere.sun.light.intensity` to setImpostorTint, and the
        // impostor multiplies it by SUN_REFERENCE_INTENSITY * canopy residual. At the
        // reference that product is the value the shipped calibration was tuned at.
        expect(atmo.sun.light.intensity).toBeCloseTo(1, 9);
        expect(rig.sun.intensity).toBeCloseTo(SUN_REFERENCE_INTENSITY * atmo.sun.light.intensity, 9);

        atmo.setTimeOfDay(NIGHT_T);
        expect(atmo.sun.light.intensity).toBeLessThan(0.05);
        expect(rig.sun.intensity).toBeCloseTo(SUN_REFERENCE_INTENSITY * atmo.sun.light.intensity, 9);
        atmo.dispose();
    });

    it('feeds the impostor preset hints, not whichever rig this session renders through', () => {
        const { scene, ambient, rig } = productionRig();
        const atmo = new Atmosphere(scene, { initialPreset: 'dusk', attachSky: false });
        atmo.bindSceneLights(rig);
        // The hint is preset units (0.42 at dusk); the scene light is rig units.
        expect(atmo.ambientHintIntensity).toBeCloseTo(0.42, 9);
        expect(ambient.intensity).not.toBeCloseTo(atmo.ambientHintIntensity, 3);
        atmo.dispose();
    });
});
