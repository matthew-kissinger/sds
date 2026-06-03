// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 12 Phase 4: pin the shader-precision contract.
 *
 * The Mac rainbow horizon-banding artifact (and adjacent grass-jitter on
 * iOS Safari) was hypothesized to come from Apple's WebKit-on-Metal
 * silently downcasting precision in fragment shaders that don't declare
 * it explicitly. Three.js injects a default precision for WebGL2 fragment
 * stages, but vertex precision is implicit (highp on most platforms,
 * mediump on iOS) and the injected default can be lower than `highp`
 * depending on the Three.js version + WebGL flavor.
 *
 * Forcing `precision highp float; precision highp int;` at the source
 * level is a no-op on hardware that already runs at highp and pins the
 * behaviour on hardware that wouldn't. This spec asserts that the
 * declarations remain present in every shader source the hypothesis
 * covers — sky dome, cloud layer, grass — across vertex + fragment.
 *
 * Tests do NOT compile shaders (no GL context) — they assert the source
 * strings carry the declarations. Removing them in a future refactor
 * should fail loudly here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    hosekWilkieFragmentShader,
    hosekWilkieVertexShader,
} from '../js/atmosphere/skyShader.glsl.js';
import {
    cloudFragmentShader,
    cloudVertexShader,
} from '../js/atmosphere/cloudShader.glsl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readGlsl(rel) {
    return readFileSync(resolve(ROOT, rel), 'utf8');
}

const PRECISION_FLOAT = /precision\s+highp\s+float\s*;/;
const PRECISION_INT = /precision\s+highp\s+int\s*;/;

describe('shader precision — atmosphere (Cycle 12 Phase 4)', () => {
    it('sky dome vertex declares precision highp', () => {
        expect(hosekWilkieVertexShader).toMatch(PRECISION_FLOAT);
        expect(hosekWilkieVertexShader).toMatch(PRECISION_INT);
    });

    it('sky dome fragment declares precision highp', () => {
        expect(hosekWilkieFragmentShader).toMatch(PRECISION_FLOAT);
        expect(hosekWilkieFragmentShader).toMatch(PRECISION_INT);
    });

    it('sky dome fragment writes 1/255 hash dither at the final color', () => {
        // The dither breaks 8-bit color quantization on the horizon
        // gradient (the rainbow stripe class in the Mac photo evidence).
        // Stable per-pixel-per-frame so it doesn't shimmer.
        expect(hosekWilkieFragmentShader).toMatch(/hash21\s*\(\s*gl_FragCoord\.xy\s*\)/);
        expect(hosekWilkieFragmentShader).toMatch(/\/\s*255\.0/);
    });

    it('cloud layer vertex declares precision highp', () => {
        expect(cloudVertexShader).toMatch(PRECISION_FLOAT);
        expect(cloudVertexShader).toMatch(PRECISION_INT);
    });

    it('cloud layer fragment declares precision highp', () => {
        expect(cloudFragmentShader).toMatch(PRECISION_FLOAT);
        expect(cloudFragmentShader).toMatch(PRECISION_INT);
    });
});

describe('shader precision — grass (Cycle 12 Phase 4)', () => {
    it('grass desktop vertex declares precision highp', () => {
        const src = readGlsl('js/shaders/grass/desktop-vertex.glsl');
        expect(src).toMatch(PRECISION_FLOAT);
        expect(src).toMatch(PRECISION_INT);
    });

    it('grass mobile vertex declares precision highp', () => {
        const src = readGlsl('js/shaders/grass/mobile-vertex.glsl');
        expect(src).toMatch(PRECISION_FLOAT);
        expect(src).toMatch(PRECISION_INT);
    });

    it('grass fragment declares precision highp', () => {
        const src = readGlsl('js/shaders/grass/fragment.glsl');
        expect(src).toMatch(PRECISION_FLOAT);
    });
});
