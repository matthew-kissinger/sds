// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 49 P2: pastoral-palette parity guard.
 *
 * The pastoral palette v2 lives in two files that must stay in lockstep: the
 * `=== Cycle 49 pastoral palette v2 ===` block in css/main.css (@theme) and the
 * `pastoral` object in js/components/ui/tokens.ts. This spec extracts the
 * pastoral `--color-*` names from each and asserts the two sets are symmetric,
 * so a token added or removed on one side without the other fails the suite.
 * Node env (reads the files as text, no DOM).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../../css/main.css', import.meta.url)), 'utf8');
const tokens = readFileSync(fileURLToPath(new URL('../../js/components/ui/tokens.ts', import.meta.url)), 'utf8');

const MARKER = 'Cycle 49 pastoral palette v2';

/** Pastoral `--color-*` names declared in the css/main.css @theme block. */
function cssPastoralColors(): Set<string> {
  const start = css.indexOf(MARKER);
  if (start === -1) return new Set();
  // The pastoral block is the last group in @theme, so slice from the marker to
  // the @theme close. Only --color-* names are compared (motion tokens ignored).
  const rest = css.slice(start);
  const end = rest.indexOf('\n}');
  const block = end === -1 ? rest : rest.slice(0, end);
  return new Set(block.match(/--color-[a-z0-9-]+/g) ?? []);
}

/** Pastoral `--color-*` names referenced by the `pastoral` object in tokens.ts. */
function tsPastoralColors(): Set<string> {
  const m = tokens.match(/export const pastoral = \{([\s\S]*?)\} as const;/);
  if (!m) return new Set();
  return new Set(m[1].match(/--color-[a-z0-9-]+/g) ?? []);
}

describe('Cycle 49 pastoral palette parity', () => {
  it('css/main.css declares the pastoral v2 marker', () => {
    expect(css.includes(MARKER)).toBe(true);
  });

  it('tokens.ts mirrors a pastoral object', () => {
    expect(/export const pastoral = \{/.test(tokens)).toBe(true);
  });

  it('the pastoral --color-* sets are symmetric across css and tokens.ts', () => {
    const cssSet = cssPastoralColors();
    const tsSet = tsPastoralColors();
    expect(cssSet.size).toBeGreaterThan(0);
    expect(tsSet.size).toBe(cssSet.size);
    const missingInTokens = [...cssSet].filter((t) => !tsSet.has(t));
    const missingInCss = [...tsSet].filter((t) => !cssSet.has(t));
    expect(missingInTokens).toEqual([]);
    expect(missingInCss).toEqual([]);
  });
});
