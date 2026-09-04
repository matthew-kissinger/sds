// SPDX-License-Identifier: AGPL-3.0-or-later
// The sim/ fence (spec/01): sim imports nothing from three/react/DOM/app/worker,
// and Math.random is banned inside sim/. These rules are load-bearing for
// multiplayer determinism; do not relax them.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'assets/**',
      '.wrangler/**',
      '**/.wrangler/**',
      '**/*.js.map',
      'worker/**',
      'shared/**',
      'tests/worker/**',
      'examples/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['sim/**/*.ts'],
    languageOptions: {
      // DOM-free: browser globals are not defined inside sim/.
      globals: {},
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'sim/ is renderer-free (spec/01 fence).' },
            { group: ['react', 'react-dom', 'react/*'], message: 'sim/ is react-free (spec/01 fence).' },
            { group: ['*app/*', '@app/*'], message: 'sim/ never imports from app/ (spec/01 fence).' },
            { group: ['*worker/*'], message: 'sim/ never imports from worker/ (spec/01 fence).' },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'No Math.random in sim/. Use the required seeded rng (spec/02).' },
        { object: 'Math', property: 'sin', message: 'No trig in sim/ tick paths (spec/02). Sanctioned sites carry per-file overrides below.' },
        { object: 'Math', property: 'cos', message: 'No trig in sim/ tick paths (spec/02).' },
        { object: 'Math', property: 'tan', message: 'No trig in sim/ tick paths (spec/02).' },
        { object: 'Math', property: 'atan', message: 'No trig in sim/ tick paths (spec/02).' },
        { object: 'Math', property: 'atan2', message: 'No trig in sim/ tick paths (spec/02).' },
        { object: 'Math', property: 'asin', message: 'No trig in sim/ tick paths (spec/02).' },
        { object: 'Math', property: 'acos', message: 'No trig in sim/ tick paths (spec/02).' },
        // Implementation-approximated per the ES spec: V8-in-Node and
        // V8-in-Chromium round these differently (measured: Math.pow flipped a
        // threshold and forked a fixed-seed run at tick ~1765). Only +-*/ and
        // Math.sqrt are correctly rounded everywhere.
        { object: 'Math', property: 'pow', message: 'Math.pow is implementation-approximated; engines disagree in the last bit. Multiply, or Newton-iterate with sqrt.' },
        { object: 'Math', property: 'hypot', message: 'Math.hypot is implementation-approximated. Use Math.sqrt(dx * dx + dz * dz).' },
        { object: 'Math', property: 'cbrt', message: 'Math.cbrt is implementation-approximated. Newton-iterate instead.' },
        { object: 'Math', property: 'exp', message: 'Math.exp is implementation-approximated; no cross-engine determinism.' },
        { object: 'Math', property: 'expm1', message: 'Math.expm1 is implementation-approximated; no cross-engine determinism.' },
        { object: 'Math', property: 'log', message: 'Math.log is implementation-approximated; no cross-engine determinism.' },
        { object: 'Math', property: 'log1p', message: 'Math.log1p is implementation-approximated; no cross-engine determinism.' },
        { object: 'Math', property: 'log2', message: 'Math.log2 is implementation-approximated; no cross-engine determinism.' },
        { object: 'Math', property: 'log10', message: 'Math.log10 is implementation-approximated; no cross-engine determinism.' },
        { object: 'Math', property: 'sinh', message: 'Hyperbolics are implementation-approximated; no cross-engine determinism.' },
        { object: 'Math', property: 'cosh', message: 'Hyperbolics are implementation-approximated; no cross-engine determinism.' },
        { object: 'Math', property: 'tanh', message: 'Hyperbolics are implementation-approximated; no cross-engine determinism.' },
        { object: 'Math', property: 'asinh', message: 'Hyperbolics are implementation-approximated; no cross-engine determinism.' },
        { object: 'Math', property: 'acosh', message: 'Hyperbolics are implementation-approximated; no cross-engine determinism.' },
        { object: 'Math', property: 'atanh', message: 'Hyperbolics are implementation-approximated; no cross-engine determinism.' },
        { object: 'Date', property: 'now', message: 'No clocks in sim/ (spec/02 determinism contract).' },
      ],
      // x ** y compiles to the same approximated pow.
      'no-restricted-syntax': [
        'error',
        { selector: "BinaryExpression[operator='**']", message: 'The ** operator is Math.pow; implementation-approximated. Multiply it out.' },
      ],
      'no-restricted-globals': [
        'error',
        'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
        'fetch', 'XMLHttpRequest', 'WebSocket', 'requestAnimationFrame', 'performance',
      ],
    },
  },
  {
    // Sanctioned trig sites, each off the tick path (spec/02):
    // - Vector2D.ts defines angle()/fromAngle() with in-source fence comments
    // - FlockSim.ts derives presentation headings (write-only buffer)
    // spawn.ts is no longer sanctioned: spawn trig turned out to fork fixed-seed
    // runs across engines (initial positions seed everything), so spawn draws
    // directions by disk rejection instead.
    files: ['sim/Vector2D.ts', 'sim/FlockSim.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'No Math.random in sim/. Use the required seeded rng (spec/02).' },
        // The trig sanction does not extend to the approximated-math family.
        { object: 'Math', property: 'pow', message: 'Math.pow is implementation-approximated; engines disagree in the last bit.' },
        { object: 'Math', property: 'hypot', message: 'Math.hypot is implementation-approximated. Use Math.sqrt(dx * dx + dz * dz).' },
        { object: 'Math', property: 'cbrt', message: 'Math.cbrt is implementation-approximated. Newton-iterate instead.' },
        { object: 'Math', property: 'exp', message: 'Math.exp is implementation-approximated; no cross-engine determinism.' },
        { object: 'Math', property: 'log', message: 'Math.log is implementation-approximated; no cross-engine determinism.' },
        { object: 'Date', property: 'now', message: 'No clocks in sim/ (spec/02 determinism contract).' },
      ],
    },
  },
];
