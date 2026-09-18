// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The boundary the input conditioner must never cross.
 *
 * The conditioner rate-limits the intent in the presentation layer, on purpose:
 * `sim/` never sees it, so every committed trace fixture stays byte-identical
 * for a given input sequence. That argument is only true while nothing wires
 * the two together, and the receipt for it today is a clean `git diff` on
 * `sim/` and `tests/fixtures/`, which is a fact about one change rather than a
 * standing property.
 *
 * This is the standing form: `sim/` imports nothing from the application, and
 * neither trace helper imports from `app/src/input/`. A later refactor that
 * quietly moved the conditioner into the fixture path would have to delete a
 * test to do it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every module specifier a file imports or re-exports, in source order. */
function specifiers(path: string): string[] {
  const source = readFileSync(path, 'utf8');
  const found: string[] = [];
  // Static import/export ... from '...', plus dynamic import('...').
  for (const match of source.matchAll(/(?:^|\s)(?:import|export)[^;\n]*?from\s*['"]([^'"]+)['"]/g)) {
    found.push(match[1]!);
  }
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    found.push(match[1]!);
  }
  for (const match of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    found.push(match[1]!);
  }
  return found;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('simulation isolation', () => {
  it('imports nothing outside itself', () => {
    const files = sourceFiles('sim');
    // A guard that read no files, or no imports, would pass silently.
    expect(files.length).toBeGreaterThan(5);
    let seen = 0;
    for (const file of files) {
      for (const specifier of specifiers(file)) {
        seen += 1;
        // Relative, and inside `sim/`. Anything else is Three.js, React, the
        // app, the score worker or a package, and spec/01 allows none of them.
        expect(specifier.startsWith('.'), `${file} imports ${specifier}`).toBe(true);
        expect(specifier.startsWith('../'), `${file} imports ${specifier}`).toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
});

describe('trace helper isolation', () => {
  it.each(['tests/helpers/traces.ts', 'tests/helpers/herding-driver.ts'])(
    '%s drives the sim without the input layer',
    (helper) => {
      const imports = specifiers(helper);
      // A helper whose imports stopped being recognised - a rename, a format
      // change, a regex that no longer matches - would run this loop zero times
      // and report a pass. Both trace helpers import the sim, so this is a fact
      // about them rather than a number chosen to be safe.
      expect(imports.length, helper).toBeGreaterThan(0);
      for (const specifier of imports) {
        // The alias AND the path it resolves to. A relative climb into
        // `app/src/input` is the same wiring by a different spelling, and
        // checking only the alias would let it through.
        expect(specifier.startsWith('@app/'), `${helper} imports ${specifier}`).toBe(false);
        expect(specifier.includes('app/src'), `${helper} imports ${specifier}`).toBe(false);
      }
    },
  );
});
