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
import { readFileSync, existsSync } from 'node:fs';
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

// Cycle 12 Phase 4 wrote these against js/shaders/grass/*.glsl. Cycle 114
// Phase 2 deleted those three files: they were stale mirrors of the inline
// shaders, fetched at every scene load and then discarded, because
// createGrassMaterial has always picked the inline variant. The precision
// requirement did not go away with them, so the assertions move to the
// shaders that actually compile.
describe('shader precision — grass (Cycle 12 Phase 4)', () => {
    const grassShaders = () => {
        const src = readFileSync(resolve(ROOT, 'js/GrassSystem.js'), 'utf8');
        // The three getters each return one template literal. Take everything
        // between the getter's opening backtick and its closing one.
        const grab = (fnName) => {
            // Match the DEFINITION, not a call site. `this.getFragmentShader()`
            // appears above the method that defines it, and indexOf on the bare
            // name lands there and then grabs the wrong template.
            const at = src.indexOf(`\n    ${fnName}() {`);
            if (at === -1) throw new Error(`${fnName} definition not found in js/GrassSystem.js`);
            const open = src.indexOf('`', at);
            const close = src.indexOf('`', open + 1);
            if (open === -1 || close === -1) throw new Error(`${fnName} body not a template literal`);
            return src.slice(open + 1, close);
        };
        return {
            desktopVertex: grab('getDesktopVertexShader'),
            mobileVertex: grab('getMobileVertexShader'),
            fragment: grab('getFragmentShader'),
        };
    };

    it('grass desktop vertex declares precision highp', () => {
        expect(grassShaders().desktopVertex).toMatch(PRECISION_FLOAT);
    });

    it('grass mobile vertex declares precision highp', () => {
        expect(grassShaders().mobileVertex).toMatch(PRECISION_FLOAT);
    });

    it('grass fragment declares precision highp', () => {
        expect(grassShaders().fragment).toMatch(PRECISION_FLOAT);
    });

    it('the deleted glsl mirrors stay deleted', () => {
        // They were fetched every scene load and discarded. Restoring one would
        // reintroduce a copy nobody renders and nobody keeps correct.
        for (const rel of [
            'js/shaders/grass/desktop-vertex.glsl',
            'js/shaders/grass/mobile-vertex.glsl',
            'js/shaders/grass/fragment.glsl',
        ]) {
            expect(existsSync(resolve(ROOT, rel)), `${rel} is back`).toBe(false);
        }
    });
});
