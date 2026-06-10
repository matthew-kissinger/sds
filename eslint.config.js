// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * ESLint flat config with two scopes:
 *
 * 1. `shared/**` (Cycle 28 Stream B5): enforces the deterministic-sim
 *    boundary. `no-restricted-imports` keeps the kernel free of
 *    Three.js / DOM / renderer-side `js/` dependencies, and `no-undef`
 *    (with a deliberately DOM-free globals map) flags browser-only
 *    access. `shared/` runs identically on the Cloudflare Worker (V8
 *    isolate, no DOM) and the client; any import that pulls in DOM-only
 *    code desyncs the two builds — an MP-breaking class of bug that
 *    historically only surfaced under load. Do not weaken this block.
 *
 * 2. `js/**` (hardening P0-LINT): a permissive correctness pass for the
 *    renderer-side client code. The hard requirement is that unused
 *    imports/vars fail lint (`no-unused-vars`), plus two cheap
 *    correctness rules (`no-dupe-keys`, `no-unreachable`). `no-undef`
 *    is intentionally NOT enabled for `js/` — it would require a giant
 *    browser-globals list for no correctness payoff. Scope is
 *    `js/**\/*.js` only: the repo's `.ts` / `.tsx` files under `js/`
 *    need @typescript-eslint to parse, which is not installed; TS
 *    coverage is deferred to the typecheck task (P0-TYPE).
 *
 * Run: `npx eslint shared/ js/` (the npm `lint` script wraps it).
 */

export default [
    {
        files: ['shared/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                // Worker + Node + Vitest globals that shared/ legitimately
                // uses. `window` / `document` / browser-only DOM are
                // deliberately excluded — `no-undef` flags them.
                console: 'readonly',
                Math: 'readonly',
                Object: 'readonly',
                Number: 'readonly',
                Array: 'readonly',
                String: 'readonly',
                Boolean: 'readonly',
                Symbol: 'readonly',
                Map: 'readonly',
                Set: 'readonly',
                WeakMap: 'readonly',
                WeakSet: 'readonly',
                Promise: 'readonly',
                Error: 'readonly',
                TypeError: 'readonly',
                RangeError: 'readonly',
                JSON: 'readonly',
                Date: 'readonly',
                Float32Array: 'readonly',
                Float64Array: 'readonly',
                Uint8Array: 'readonly',
                Uint16Array: 'readonly',
                Uint32Array: 'readonly',
                Int8Array: 'readonly',
                Int16Array: 'readonly',
                Int32Array: 'readonly',
                BigInt64Array: 'readonly',
                BigUint64Array: 'readonly',
                ArrayBuffer: 'readonly',
                SharedArrayBuffer: 'readonly',
                DataView: 'readonly',
                Reflect: 'readonly',
                Proxy: 'readonly',
                isFinite: 'readonly',
                isNaN: 'readonly',
                parseInt: 'readonly',
                parseFloat: 'readonly',
                globalThis: 'readonly',
                performance: 'readonly',
                // Worker fetch is part of the deterministic boundary's
                // legitimate surface (Heightfield.load). Allow it.
                fetch: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
            },
        },
        rules: {
            'no-restricted-imports': ['error', {
                paths: [
                    {
                        name: 'three',
                        message: 'shared/ runs on the Worker; Three.js is renderer-only. Move the Three.js-touching code to js/ and call into shared/ for the deterministic part.',
                    },
                    {
                        name: 'three/addons/loaders/GLTFLoader.js',
                        message: 'shared/ has no GLTF loader (Worker has no DOM). Move loader-touching code to js/.',
                    },
                ],
                patterns: [
                    {
                        group: ['three/*', 'three/**'],
                        message: 'shared/ runs on the Worker; Three.js sub-paths are renderer-only.',
                    },
                    {
                        group: ['../js/*', '../js/**', '../../js/**'],
                        message: 'shared/ must not depend on js/ — js/ pulls in Three.js + DOM transitively. Move the dependency the other way.',
                    },
                    {
                        // Upkeep D (2026-06): the boundary is two-way. The
                        // Worker imports shared/, never the reverse; a
                        // shared/ -> worker/ import would couple the
                        // deterministic kernel to DO/runtime types.
                        group: ['../worker/*', '../worker/**', '../../worker/**'],
                        message: 'shared/ must not depend on worker/ — the Worker imports shared/, never the reverse.',
                    },
                ],
            }],
            // `window` / `document` / etc. are excluded from the globals
            // map above, so `no-undef` flags any DOM-only access.
            'no-undef': 'error',
        },
    },
    {
        // Renderer-side client code (hardening P0-LINT). Permissive on
        // purpose: unused imports/vars are the hard gate, plus two cheap
        // correctness rules. No `no-undef` (browser globals), no style
        // rules. `.ts` / `.tsx` under js/ are excluded — they need
        // @typescript-eslint, which is not installed (see P0-TYPE).
        files: ['js/**/*.js'],
        // App.js is owned by the P0-CRASH task right now and carries
        // pre-existing unused-var violations; re-include it once that
        // task lands and the violations are cleaned up there.
        ignores: ['js/components/App.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        rules: {
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrors: 'none',
            }],
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
        },
    },
];
