// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * ESLint flat config — only enforces the deterministic-sim boundary
 * (Cycle 28 Stream B5). The full codebase has not opted into linting;
 * this config scopes a single rule (`no-restricted-imports`) to
 * `shared/**` so the deterministic-sim kernel can't accidentally take
 * a dependency on Three.js, the DOM, or the renderer-side `js/`.
 *
 * Why scoped: `shared/` runs identically on the Cloudflare Worker (V8
 * isolate, no DOM) and the client (V8 with DOM, Three.js loaded). Any
 * import that pulls in DOM-only code desyncs the two builds — an
 * MP-breaking class of bug that historically only surfaced under load.
 *
 * Run: `npx eslint shared/` (CI gate; the npm `lint` script wraps it).
 *
 * The rule is intentionally narrow — it does NOT enforce style, format,
 * or semantic JS rules across the full codebase. If a future cycle
 * wants project-wide linting, that's a deliberate scope expansion.
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
                ],
            }],
            // `window` / `document` / etc. are excluded from the globals
            // map above, so `no-undef` flags any DOM-only access.
            'no-undef': 'error',
        },
    },
];
