// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 119 Phase 3 - strip GLSL comments and indentation at build time, keep
 * them in source.
 *
 * esbuild minifies JavaScript and does not look inside template literals, so
 * every GLSL shader authored as a template string in `js/**` shipped its
 * comments and its indentation verbatim. Measured at cycle start: 85,120 bytes
 * of raw template source across 24 templates in 11 files, most of it comment
 * prose and leading whitespace.
 *
 * The rule this module exists to enforce is `strip at build time, keep in
 * source`. The shaders are heavily commented and those comments are the only
 * explanation of why the maths is what it is, so hand-stripping them out of
 * `js/GrassSystem.js` would trade 15 KB against the next person's ability to
 * read the grass. A transform leaves every comment exactly where it is in the
 * repo and removes it only from what the browser is handed.
 *
 * WHAT IT WILL NOT TOUCH
 *
 *   1. Preprocessor lines. Any line whose first non-whitespace character is
 *      `#` is copied byte-for-byte: `#version`, `#define`, `#include <fog_vertex>`,
 *      `#ifdef`, `#else`, `#endif`. Their indentation survives too. Three.js
 *      resolves `#include` with a line-anchored regex and a stray edit there is
 *      invisible until a shader fails to link on someone else's GPU.
 *
 *   2. Line structure. Lines are never joined. Comments are removed to the end
 *      of their own line and the newline stays, which is what makes `//`
 *      structurally unable to swallow the code that followed it. The cost is
 *      one byte per surviving line and it buys the entire class of
 *      line-joining bugs being impossible rather than merely tested for.
 *
 *   3. Interpolations. `${...}` expressions are spliced back byte-identically,
 *      because the transform rewrites each template QUASI at its own source
 *      range and never reconstructs the template. Cycle 118 added
 *      `WATER_SURFACE_GLSL` in js/water/waterSurfaceModel.js, which is GLSL
 *      generated from constants through 15 interpolations, and
 *      js/world/groundShading.js generates four more chunks the same way.
 *
 *   4. TSL. WebGPU node materials are JavaScript method chains, not strings, so
 *      a string transform structurally cannot reach them. Verified at cycle
 *      time: `js/` contains no WGSL template literal either (no `wgslFn`, no
 *      `@location`, no `fn main`). GLSL is the only shading language in this
 *      repo that lives inside a template literal.
 *
 * THE GUARD THAT MATTERS
 *
 * A `//` comment that begins in one quasi and runs past an interpolation would,
 * under a naive per-quasi strip, delete the `//` and leave the interpolated
 * value behind as live GLSL. That is the one way this transform could corrupt a
 * shader silently. So the quasis are joined with sentinels before the strip and
 * the sentinels are counted afterwards: if one was swallowed by a comment the
 * transform throws by name rather than shipping a broken shader. Same for an
 * unterminated block comment. This follows `externalizeThreeDecoderUrlsPlugin`
 * in vite.config.js, whose lesson (commit d75a7546) is that a build transform
 * against text you do not control must fail loudly or it will fail silently.
 */

import { parseAst } from 'vite';

/**
 * A sentinel that cannot occur in GLSL and is not whitespace, so `trim()`
 * leaves it alone and a swallowed one is detectable.
 */
const SENTINEL_OPEN = '\u0000';
const SENTINEL_CLOSE = '\u0001';
const sentinel = (i) => `${SENTINEL_OPEN}${i}${SENTINEL_CLOSE}`;

const PREPROCESSOR_LINE = /^[ \t]*#/;

/**
 * Does this template literal carry GLSL?
 *
 * Deliberately signature-based rather than marker-based. The repo's
 * `/* glsl *\/` marker convention covers only 13 of the 24 GLSL templates, and
 * the two biggest carriers (js/GrassSystem.js, js/OptimizedSheep.js) do not use
 * it at all. Requiring the marker would have silently skipped 60% of the
 * payload; requiring nothing would have matched CSS and HTML template strings,
 * of which this repo has plenty.
 *
 * Each signal is anchored to a construct that only appears in a shader. The
 * last one catches GLSL *fragments* (a bare function with no `void main`),
 * which is how js/world/groundShading.js and js/water/waterSurfaceModel.js
 * author their generated chunks. It cannot match CSS `float: left` because it
 * requires whitespace and an identifier and an open paren after the type.
 */
export const GLSL_SIGNALS = [
    /\bgl_Position\b/,
    /\bgl_FragColor\b/,
    /\bgl_FragCoord\b/,
    /\bgl_PointCoord\b/,
    /^[ \t]*#include\s*</m,
    /^[ \t]*precision\s+(?:lowp|mediump|highp)\s/m,
    /^[ \t]*varying\s+/m,
    /^[ \t]*attribute\s+/m,
    /^[ \t]*uniform\s+(?:float|vec[234]|mat[234]|int|bool|sampler)/m,
    /^[ \t]*(?:float|vec[234]|mat[234]|int|bool|void)\s+\w+\s*\(/m
];

export function looksLikeGlsl(text) {
    return GLSL_SIGNALS.some((signal) => signal.test(text));
}

export class GlslMinifyError extends Error {
    constructor(message) {
        super(`[minify-glsl-templates] ${message}`);
        this.name = 'GlslMinifyError';
    }
}

/**
 * Remove `//` and block comments without ever joining two lines.
 *
 * A backslash escape is copied as an atomic pair so a template-literal `\/`
 * cannot be mistaken for the start of a comment.
 */
function stripComments(text, where) {
    let out = '';
    let i = 0;
    const n = text.length;
    while (i < n) {
        let lineEnd = text.indexOf('\n', i);
        if (lineEnd === -1) lineEnd = n;

        // Preprocessor lines are copied byte-for-byte, comments and all.
        if (PREPROCESSOR_LINE.test(text.slice(i, lineEnd))) {
            out += text.slice(i, lineEnd);
            if (lineEnd < n) out += '\n';
            i = lineEnd + 1;
            continue;
        }

        let j = i;
        while (j < lineEnd) {
            const c = text[j];
            if (c === '\\' && j + 1 < n) {
                out += text.slice(j, j + 2);
                j += 2;
                continue;
            }
            if (c === '/' && text[j + 1] === '/') {
                j = lineEnd;
                break;
            }
            if (c === '/' && text[j + 1] === '*') {
                const close = text.indexOf('*/', j + 2);
                if (close === -1) {
                    throw new GlslMinifyError(
                        `unterminated block comment in ${where}. Refusing to strip; ` +
                        'fix the shader source or the transform will guess wrong.'
                    );
                }
                const body = text.slice(j, close + 2);
                // A block comment that spanned lines leaves a newline behind so
                // the code before it and the code after it stay on separate lines.
                out += body.includes('\n') ? '\n' : ' ';
                j = close + 2;
                if (j > lineEnd) {
                    lineEnd = text.indexOf('\n', j);
                    if (lineEnd === -1) lineEnd = n;
                }
                continue;
            }
            out += c;
            j += 1;
        }
        if (lineEnd < n) out += '\n';
        i = lineEnd + 1;
    }
    return out;
}

/**
 * Drop indentation, trailing whitespace and blank lines. Preprocessor lines
 * keep their exact bytes.
 */
function stripIndentAndBlanks(text) {
    const kept = [];
    for (const rawLine of text.split(/\r?\n/)) {
        if (PREPROCESSOR_LINE.test(rawLine)) {
            kept.push(rawLine.replace(/\r$/, ''));
            continue;
        }
        const trimmed = rawLine.trim();
        if (trimmed) kept.push(trimmed);
    }
    return kept.join('\n');
}

/**
 * Minify a standalone GLSL string. Exported for tests and for any caller that
 * has the shader text rather than a module.
 */
export function minifyGlslText(text, where = 'a GLSL string') {
    return stripIndentAndBlanks(stripComments(text, where));
}

/**
 * Minify the quasis of one template literal together, so a comment that spans
 * an interpolation is caught rather than silently promoting the interpolated
 * value to live code.
 *
 * @param {string[]} quasis raw source text of each template chunk
 * @returns {string[]} the same number of chunks, minified
 */
export function minifyGlslQuasis(quasis, where = 'a GLSL template') {
    const withSentinels = (parts) =>
        parts.map((q, i) => (i === parts.length - 1 ? q : q + sentinel(i))).join('');

    const joined = withSentinels(quasis);
    const minified = minifyGlslText(joined, where);

    const out = [];
    let rest = minified;
    for (let i = 0; i < quasis.length - 1; i += 1) {
        const token = sentinel(i);
        const at = rest.indexOf(token);
        if (at === -1) {
            throw new GlslMinifyError(
                `interpolation #${i} in ${where} was swallowed by a comment. A ` +
                '`//` or `/* */` that begins before a ${...} and ends after it ' +
                'would leave the interpolated value behind as live GLSL. Refusing ' +
                'to strip this template. Move the comment off the interpolated line.'
            );
        }
        out.push(rest.slice(0, at));
        rest = rest.slice(at + token.length);
    }
    out.push(rest);

    if (rest.includes(SENTINEL_OPEN)) {
        throw new GlslMinifyError(
            `interpolations in ${where} came back out of order. Refusing to strip.`
        );
    }

    // Post-condition: the token stream must be unchanged.
    //
    // This is the guard that makes the phase's claim checkable rather than
    // asserted. Comments and whitespace are the ONLY things allowed to move, so
    // a signature that ignores both must be equal on either side. It catches a
    // line-join (two tokens fused into one), a swallowed statement, and a
    // dropped preprocessor directive, all of which are invisible until a shader
    // fails to compile on someone else's machine.
    if (glslTokenSignature(joined, where) !== glslTokenSignature(withSentinels(out), where)) {
        throw new GlslMinifyError(
            `the strip changed the token stream of ${where}, not just its ` +
            'comments and whitespace. Refusing to ship a shader that is not the ' +
            'shader in the repo.'
        );
    }
    return out;
}

/**
 * A whitespace-and-comment-insensitive signature of GLSL source. Not a
 * compilable form: it deliberately collapses every run of whitespace, including
 * the newlines that separate preprocessor directives, so that only the sequence
 * of non-whitespace characters survives. Two sources with the same signature
 * differ in nothing a GLSL compiler can observe.
 */
function glslTokenSignature(text, where) {
    return stripComments(text, where).replace(/\s+/g, ' ').trim();
}

/**
 * Rewrite every GLSL template literal in one JS module.
 *
 * Each quasi is replaced at its own source range, so `${`, `}` and the
 * expression source between them are never re-emitted and cannot drift.
 *
 * @returns {{ code: string, changed: boolean, saved: number, templates: number }}
 */
export function minifyGlslTemplatesInModule(code, id = '<module>') {
    if (!looksLikeGlsl(code)) return { code, changed: false, saved: 0, templates: 0 };

    let ast;
    try {
        ast = parseAst(code);
    } catch (error) {
        throw new GlslMinifyError(
            `could not parse ${id} (${error.message}). The GLSL signal matched, so ` +
            'this module is expected to be plain JS. Narrow the plugin include filter.'
        );
    }

    /** @type {{ start: number, end: number, text: string }[]} */
    const edits = [];
    let templates = 0;
    const stack = [ast];
    while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;
        if (Array.isArray(node)) {
            for (const child of node) stack.push(child);
            continue;
        }
        if (node.type === 'TemplateLiteral') {
            const raw = node.quasis.map((q) => q.value.raw);
            if (looksLikeGlsl(raw.join('\n'))) {
                const where = `${id} (template at offset ${node.start})`;
                const minified = minifyGlslQuasis(
                    node.quasis.map((q) => code.slice(q.start, q.end)),
                    where
                );
                templates += 1;
                node.quasis.forEach((q, i) => {
                    if (minified[i] !== code.slice(q.start, q.end)) {
                        edits.push({ start: q.start, end: q.end, text: minified[i] });
                    }
                });
            }
        }
        for (const key of Object.keys(node)) {
            if (key === 'type' || key === 'start' || key === 'end') continue;
            const value = node[key];
            if (value && typeof value === 'object') stack.push(value);
        }
    }

    if (!edits.length) return { code, changed: false, saved: 0, templates };

    edits.sort((a, b) => a.start - b.start);
    let out = '';
    let cursor = 0;
    for (const edit of edits) {
        if (edit.start < cursor) {
            throw new GlslMinifyError(
                `overlapping template edits in ${id}. Refusing to splice.`
            );
        }
        out += code.slice(cursor, edit.start) + edit.text;
        cursor = edit.end;
    }
    out += code.slice(cursor);

    return { code: out, changed: true, saved: code.length - out.length, templates };
}

/**
 * The Vite plugin. Applies in dev as well as build, deliberately: the golden
 * harness drives the dev server on :3000, so a build-only transform would make
 * the "byte-identical render" proof vacuous. It also means the shader text a
 * developer debugs is the shader text that ships.
 *
 * `SDS_KEEP_GLSL_COMMENTS=1` turns it off for shader debugging.
 */
export function minifyGlslTemplatesPlugin({ onSummary } = {}) {
    const stats = { files: 0, templates: 0, saved: 0 };
    const disabled = process.env.SDS_KEEP_GLSL_COMMENTS === '1';
    return {
        name: 'minify-glsl-templates',
        enforce: 'pre',
        transform(code, id) {
            if (disabled) return null;
            const normalized = id.replace(/\\/g, '/').split('?')[0];
            if (!normalized.endsWith('.js')) return null;
            if (!/\/js\//.test(normalized) || /\/node_modules\//.test(normalized)) return null;
            const result = minifyGlslTemplatesInModule(code, normalized);
            if (!result.changed) return null;
            stats.files += 1;
            stats.templates += result.templates;
            stats.saved += result.saved;
            // Sourcemaps: this plugin only deletes characters inside a template
            // literal, and the app build does not emit sourcemaps
            // (build.sourcemap is unset). Returning a null map is honest about
            // not tracking the deletions rather than shipping a wrong one.
            return { code: result.code, map: null };
        },
        buildEnd() {
            onSummary?.(stats);
        }
    };
}
