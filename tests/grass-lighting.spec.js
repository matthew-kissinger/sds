// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 123 Phase 1: grass reads the scene lights, and noon does not move.
 *
 * The first suite is the cycle's first hard stop, met arithmetically. If the
 * factor is exactly white at full daylight then the multiply is an identity
 * there, and the shipped noon look cannot shift no matter what the rest of the
 * curve does. That is a stronger guarantee than a golden, because it fails at
 * the cause rather than at the pixel - and because it holds on every scene and
 * every preset rather than only on the six cells the golden matrix covers.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    grassLightFactor,
    lightsFromRig,
    GRASS_LIGHT_REFERENCE,
    GRASS_LIGHT_TUNING
} from '../js/world/grassLighting.js';
import {
    SUN_REFERENCE_INTENSITY,
    sunDaylightGate,
    WEBGL_SCENE_LIGHT_PROFILE,
    PRODUCTION_SCENE_LIGHT_PROFILE
} from '../js/world/sceneLightingRig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** A production rig whose sun sits at the given daylight gate. */
const prodRig = (gate) => ({
    profile: PRODUCTION_SCENE_LIGHT_PROFILE,
    sun: { intensity: SUN_REFERENCE_INTENSITY * gate, color: { r: 1, g: 1, b: 1 } },
    ambient: { intensity: 2.356, color: { r: 0.891, g: 0.825, b: 0.628 } }
});

describe('Cycle 123 - noon does not move, by construction', () => {
    it('is EXACTLY white at full daylight, on every channel', () => {
        const f = grassLightFactor(GRASS_LIGHT_REFERENCE);
        // Object.is, not toBeCloseTo. "Close to 1" is what a tuned constant
        // gives you; the point of deriving this from the daylight gate is that
        // it IS 1, and a regression to a tuned constant should fail here.
        expect(Object.is(f.r, 1)).toBe(true);
        expect(Object.is(f.g, 1)).toBe(true);
        expect(Object.is(f.b, 1)).toBe(true);
    });

    it('is exactly white for a real production rig at full sun', () => {
        const f = grassLightFactor(lightsFromRig(prodRig(1)));
        expect(Object.is(f.r, 1)).toBe(true);
        expect(Object.is(f.g, 1)).toBe(true);
        expect(Object.is(f.b, 1)).toBe(true);
    });

    it('holds the identity regardless of the ambient TINT, which is what broke the first draft', () => {
        // Measured on the live build: at day-cycle midday the production rig
        // sits at its sun and ambient references EXACTLY, and yet a
        // per-channel sum scored (0.956, 0.929, 0.849) because the ambient
        // colour is a tint rather than white. An identity that depends on a
        // colour being white is not an identity.
        for (const ambient of [
            { intensity: 2.356, color: { r: 0.891, g: 0.825, b: 0.628 } },
            { intensity: 2.356, color: { r: 1, g: 1, b: 1 } },
            { intensity: 0.6, color: { r: 0.005, g: 0.009, b: 0.021 } },
            { intensity: 0, color: { r: 0, g: 0, b: 0 } }
        ]) {
            const f = grassLightFactor(lightsFromRig({ ...prodRig(1), ambient }));
            expect(Object.is(f.g, 1), `ambient ${JSON.stringify(ambient)} moved noon`).toBe(true);
        }
    });

    it('is exactly white when handed nothing, so a missing rig cannot darken a field', () => {
        expect(Object.is(grassLightFactor().g, 1)).toBe(true);
        expect(Object.is(grassLightFactor(lightsFromRig(null) ?? undefined).g, 1)).toBe(true);
    });

    it('holds through the whole daylight band, not just at the zenith', () => {
        // sunDaylightGate is 1 for every elevation above its band, so every
        // playable daytime hour is an identity - not only the reference noon.
        for (const elevationDeg of [90, 70, 45, 20, 10]) {
            const gate = sunDaylightGate((elevationDeg * Math.PI) / 180);
            expect(gate).toBe(1);
            expect(Object.is(grassLightFactor({ daylight: gate }).g, 1)).toBe(true);
        }
    });
});

describe('Cycle 123 - the grass darkens when the sun goes down', () => {
    it('falls monotonically as the sun sets', () => {
        const levels = [1, 0.75, 0.5, 0.25, 0].map((g) => grassLightFactor({ daylight: g }).g);
        for (let i = 1; i < levels.length; i++) {
            expect(levels[i]).toBeLessThan(levels[i - 1]);
        }
    });

    it('falls FAR more than the 12% the defect measured', () => {
        // The whole reason this cycle exists: at night the canopy fell 12%
        // while the terrain floor went to roughly zero, so the ratio ran to
        // 204:1. A night factor near 1 would mean nothing had changed.
        expect(grassLightFactor({ daylight: 0 }).g).toBe(GRASS_LIGHT_TUNING.NIGHT_LEVEL);
        expect(grassLightFactor({ daylight: 0 }).g).toBeLessThan(0.2);
    });

    it('brings the night ratio into the same order as the terrain', () => {
        // Cycle 120's numbers on Rolling Hills: grass p95 102.10 over terrain
        // p05 ~0.5 is 204:1. Scaling the canopy by the night level puts it back
        // near the 8:1 the scene reads at noon rather than two orders past it.
        const noonRatio = 115.81 / 14.30;
        const nightGrass = 102.10 * grassLightFactor({ daylight: 0 }).g;
        expect(nightGrass / 0.5).toBeLessThan(noonRatio * 4);
    });

    it('never reaches pure black, so the canopy keeps a silhouette', () => {
        expect(grassLightFactor({ daylight: 0 }).g).toBeGreaterThan(0);
    });

    it('never returns a negative, out-of-range or non-finite channel', () => {
        for (const daylight of [-5, 5, NaN, Infinity, null, undefined]) {
            const f = grassLightFactor({ daylight });
            for (const ch of ['r', 'g', 'b']) {
                expect(f[ch]).toBeGreaterThan(0);
                expect(f[ch]).toBeLessThanOrEqual(1);
                expect(Number.isNaN(f[ch])).toBe(false);
            }
        }
    });

    it('is grey, not tinted - the three channels are always equal', () => {
        for (const daylight of [1, 0.6, 0.2, 0]) {
            const f = grassLightFactor({ daylight });
            expect(f.r).toBe(f.g);
            expect(f.g).toBe(f.b);
        }
    });
});

describe('Cycle 123 - the WebGL twin is left exactly alone', () => {
    // sceneLightingRig.js ships two profiles balanced in different units and
    // deliberately not converging. The twin's key light is a static 0.8 * PI
    // that never dims - measured live at 2.513 at every hour, including 19.7
    // degrees below the horizon - so there is no sundown to track and no
    // grass-versus-terrain mismatch to fix. An earlier draft normalised it
    // against the production reference and scored a WebGL midday at 0.53,
    // which would have taken a shipped look half dark at noon on that path.
    const twinRig = (ambI) => ({
        profile: WEBGL_SCENE_LIGHT_PROFILE,
        sun: { intensity: 0.8 * Math.PI, color: { r: 1, g: 1, b: 1 } },
        ambient: { intensity: ambI, color: { r: 0.578, g: 0.658, b: 0.745 } }
    });

    it('yields no lights at all, at every hour', () => {
        for (const ambI of [0.55, 0.3, 0.14, 0]) {
            expect(lightsFromRig(twinRig(ambI)), `ambient ${ambI} must not move the twin`).toBeNull();
        }
    });

    it('and a null reaches the shader as white, not as darkness', () => {
        expect(Object.is(grassLightFactor(lightsFromRig(twinRig(0.14)) ?? undefined).g, 1)).toBe(true);
    });
});

describe('Cycle 123 - lightsFromRig reads the rig rather than re-deriving', () => {
    it('recovers the daylight gate exactly from the sun intensity', () => {
        // Atmosphere sets intensity = SUN_REFERENCE_INTENSITY * gate, so this
        // round-trips rather than approximating.
        for (const gate of [0, 0.25, 0.5, 0.75, 1]) {
            expect(lightsFromRig(prodRig(gate)).daylight).toBeCloseTo(gate, 12);
        }
    });

    it('clamps a sun brighter than the reference back to full day', () => {
        expect(lightsFromRig(prodRig(3)).daylight).toBe(1);
    });

    it('returns null for a rig with no sun, or a non-finite intensity', () => {
        expect(lightsFromRig({})).toBeNull();
        expect(lightsFromRig({ sun: { intensity: NaN } })).toBeNull();
        expect(lightsFromRig(undefined)).toBeNull();
    });
});

describe('Cycle 123 - both render paths, one shape (hard stop 3)', () => {
    // "A lighting term in the node material and not in the GLSL twin is a
    // defect regardless of how it looks." Source-level, because diffing a WGSL
    // node graph against a GLSL string needs a GPU, and a spec that needs a GPU
    // is a spec that does not run in CI.
    const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');
    const webgl = read('js/GrassSystem.js');
    const webgpu = read('js/world/webgpuGrassBladeNodeMaterial.js');

    it('the WebGL twin declares and applies the light uniform', () => {
        expect(webgl).toContain('uniform vec3 uGrassLight;');
        expect(webgl).toContain('color *= uGrassLight;');
    });

    it('the WebGPU node material declares and applies the same term', () => {
        expect(webgpu).toContain('const grassLight = uniform(');
        expect(webgpu).toContain('grassColor.mul(grassLight)');
    });

    it('BOTH apply it before the fog mix, not after', () => {
        // Fog colour is the sky, which Atmosphere already darkens at night.
        // Scaling it here would darken the night sky twice on whichever path
        // got it wrong - and it would look plausible, which is worse.
        const glLight = webgl.indexOf('color *= uGrassLight;');
        const glFog = webgl.indexOf('color = mix(color, fogColor, fogFactor);');
        expect(glLight).toBeGreaterThan(-1);
        expect(glFog).toBeGreaterThan(glLight);
        expect(webgpu).toMatch(/material\.colorNode = mix\(\r?\n\s*grassColor\.mul\(grassLight\)/);
    });

    it('both paths expose a setter, and GrassSystem drives both plus the streamed material', () => {
        expect(webgpu).toContain('setGrassLight(state = {})');
        expect(webgl).toContain('setGrassLight(factor)');
        // Without the streamed material a streamed scene keeps a bright field
        // while the cold one darkens.
        expect(webgl).toContain('this._streamedBladeControls?.setGrassLight?.');
    });

    it('the WebGPU material no longer advertises itself as unlit', () => {
        expect(webgpu).not.toContain("'shader-owned-unlit'");
        expect(webgpu).toContain("'shader-owned-scene-lit'");
    });

    it('neither shader restates the reference intensity by hand', () => {
        // Cycle 120 spent a phase removing a duplicated `1.1 * Math.PI`; the
        // grass must not reintroduce one.
        expect(webgl).not.toContain('1.1 * Math.PI');
        expect(webgpu).not.toContain('1.1 * Math.PI');
    });
});
