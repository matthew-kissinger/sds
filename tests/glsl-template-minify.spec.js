// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 119 Phase 3 - the GLSL template strip.
 *
 * This spec exists because `scripts/glsl-template-minify.mjs` is a build
 * transform that rewrites every shader the game ships, and a transform against
 * text you do not control fails silently unless something forces it to fail
 * loudly. The lesson is `externalizeThreeDecoderUrlsPlugin`'s (commit
 * d75a7546): the first version of that plugin deleted an asset and left a live
 * URL pointing at it, and nothing caught it because nothing asserted the
 * invariant.
 *
 * So the assertions here are deliberately about INVARIANTS rather than about
 * byte counts. "It got smaller" is true of a transform that deletes the shader.
 * The load-bearing test is `preserves the token stream exactly`: whatever else
 * the strip does, the sequence of GLSL tokens handed to the driver must be
 * unchanged, and that is the property that makes `byte-identical renders` a
 * claim rather than a hope.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    looksLikeGlsl,
    minifyGlslText,
    minifyGlslQuasis,
    minifyGlslTemplatesInModule,
    GlslMinifyError,
} from '../scripts/glsl-template-minify.mjs';

const ROOT = resolve(__dirname, '..');

/**
 * The token stream a driver actually sees: comments gone, whitespace collapsed.
 *
 * Strips surrounding backticks first. Without that, comparing two raw template
 * literals leaves the delimiters in place so the trailing `.trim()` cannot
 * reach the leading newline and indent INSIDE them, and the comparison fails on
 * exactly the whitespace the transform is supposed to remove. That was a bug in
 * this spec on its first run, and it is the same shape as the two spec bugs
 * Cycle 118's mutation pass caught: an assertion that measures the wrong thing
 * reads as a code failure.
 */
const tokens = (glsl) =>
    glsl
        .replace(/^`/, '')
        .replace(/`$/, '')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

describe('glsl-template-minify - what it removes', () => {
    it('removes line comments, block comments and indentation', () => {
        const src = [
            '    // the blade sways because wind is three rotated octaves',
            '    float sway = 0.0;',
            '    /* block',
            '       comment */',
            '',
            '        sway += 1.0;',
        ].join('\n');
        const out = minifyGlslText(src);

        expect(out).not.toContain('rotated octaves');
        expect(out).not.toContain('block');
        expect(out).not.toMatch(/^[ \t]+/m);
        expect(out).not.toMatch(/\n\s*\n/);
        // and the code survives
        expect(tokens(out)).toBe('float sway = 0.0; sway += 1.0;');
    });

    it('actually shrinks a real shipped shader', () => {
        const grass = readFileSync(resolve(ROOT, 'js', 'GrassSystem.js'), 'utf8');
        const { changed, saved, templates } = minifyGlslTemplatesInModule(grass, 'js/GrassSystem.js');
        expect(changed).toBe(true);
        expect(templates).toBeGreaterThan(0);
        // Guards against a transform that silently becomes a no-op after a
        // refactor renames the shader constants out of GLSL-signal range.
        expect(saved).toBeGreaterThan(1000);
    });
});

describe('glsl-template-minify - the invariant that makes it safe', () => {
    /**
     * THE load-bearing assertion. A strip that changed the token stream would
     * change what the GPU compiles, and Phase 3's whole claim is a
     * byte-identical render. Run over every real shader in the repo rather
     * than a fixture, so a shader added later is covered without editing this
     * spec.
     */
    const SHADER_FILES = [
        'js/GrassSystem.js',
        'js/OptimizedSheep.js',
        'js/water/AnimeWater.js',
        'js/world/groundShading.js',
        'js/water/waterSurfaceModel.js',
    ];

    for (const rel of SHADER_FILES) {
        it(`preserves the token stream exactly in ${rel}`, () => {
            const code = readFileSync(resolve(ROOT, rel), 'utf8');
            const { code: out } = minifyGlslTemplatesInModule(code, rel);

            // Compare template-by-template rather than whole-file, so a
            // difference cannot hide behind unrelated JS.
            const rawTemplates = (s) => [...s.matchAll(/`([^`\\]|\\[\s\S])*`/g)].map((m) => m[0]);
            const before = rawTemplates(code);
            const after = rawTemplates(out);
            expect(after.length).toBe(before.length);
            for (let i = 0; i < before.length; i += 1) {
                expect(tokens(after[i])).toBe(tokens(before[i]));
            }
        });
    }

    it('copies preprocessor lines byte-for-byte, indentation included', () => {
        const src = [
            '#version 300 es',
            '  #define FOO 1',
            '    #include <fog_pars_fragment>',
            '#ifdef USE_FOG',
            '      float x = 1.0;   // trailing prose',
            '#endif',
        ].join('\n');
        const out = minifyGlslText(src).split('\n');

        // Three.js resolves #include with a line-anchored regex, so its
        // leading whitespace is not cosmetic.
        expect(out).toContain('#version 300 es');
        expect(out).toContain('  #define FOO 1');
        expect(out).toContain('    #include <fog_pars_fragment>');
        expect(out).toContain('#ifdef USE_FOG');
        expect(out).toContain('#endif');
        // ... while ordinary lines still lose their indent and their comment
        expect(out).toContain('float x = 1.0;');
    });

    it('never joins two lines, so a comment cannot swallow the next statement', () => {
        const src = 'float a = 1.0; // keep me\nfloat b = 2.0;';
        const out = minifyGlslText(src);
        expect(out.split('\n').length).toBe(2);
        expect(tokens(out)).toBe('float a = 1.0; float b = 2.0;');
    });

    it('splices interpolations back byte-identically', () => {
        // The shape js/water/waterSurfaceModel.js and js/world/groundShading.js
        // both use: GLSL generated from JS constants.
        const quasis = [
            '\n  // amplitude comes from the model\n  float amp = ',
            ';\n  float freq = ',
            ';\n  gl_FragColor = vec4(amp, freq, 0.0, 1.0);\n',
        ];
        const out = minifyGlslQuasis(quasis, 'a generated chunk');
        expect(out.length).toBe(quasis.length);
        expect(out.join('${X}')).not.toContain('amplitude comes from');
        expect(tokens(out.join(' 1.0 '))).toBe(
            'float amp = 1.0 ; float freq = 1.0 ; gl_FragColor = vec4(amp, freq, 0.0, 1.0);'
        );
    });
});

describe('glsl-template-minify - fails loudly rather than silently', () => {
    it('throws when a line comment would swallow an interpolation', () => {
        // Under a naive per-quasi strip the `//` disappears and the
        // interpolated value is promoted to live GLSL. This is the one way the
        // transform could corrupt a shader without anyone noticing.
        const quasis = ['float a = 1.0; // disabled: ', ' was here\nfloat b = 2.0;'];
        expect(() => minifyGlslQuasis(quasis, 'a hostile template')).toThrow(GlslMinifyError);
    });

    it('throws on an unterminated block comment', () => {
        expect(() => minifyGlslText('float a = 1.0;\n/* never closed\n')).toThrow(GlslMinifyError);
    });
});

describe('glsl-template-minify - what it refuses to reach', () => {
    it('does not treat a plain JS module as GLSL', () => {
        const js = 'export const greeting = `hello ${name}, welcome`;\n';
        expect(looksLikeGlsl(js)).toBe(false);
        const { changed, saved } = minifyGlslTemplatesInModule(js, 'plain.js');
        expect(changed).toBe(false);
        expect(saved).toBe(0);
    });

    it('leaves a non-GLSL template alone inside a module that does contain GLSL', () => {
        const code = [
            'export const label = `  keep   my    spaces  `;',
            'export const frag = `',
            '  // strip me',
            '  void main() { gl_FragColor = vec4(1.0); }',
            '`;',
        ].join('\n');
        const { code: out } = minifyGlslTemplatesInModule(code, 'mixed.js');
        expect(out).toContain('`  keep   my    spaces  `');
        expect(out).not.toContain('strip me');
    });

    it('finds no WGSL template literal in js/, so TSL stays out of reach', () => {
        // Recorded at cycle time and asserted so it stays true: GLSL is the
        // only shading language in this repo that lives inside a template
        // literal. A WGSL string would need its own handling.
        const suspects = ['wgslFn', '@location', 'fn main'];
        for (const rel of ['js/water/waterSurfaceModel.js', 'js/world/groundShading.js']) {
            const code = readFileSync(resolve(ROOT, rel), 'utf8');
            for (const s of suspects) expect(code).not.toContain(s);
        }
    });
});
