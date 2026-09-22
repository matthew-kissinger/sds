// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSheepName, getTotalSheepNames } from '@app/game/sheepNames';
import sheepNames from '../assets/sheep-names.json';

describe('sheep naming system', () => {
  it('supplies at least 200 distinct authored names', () => {
    expect(getTotalSheepNames()).toBeGreaterThanOrEqual(200);
    const unique = new Set(sheepNames);
    expect(unique.size).toBe(sheepNames.length);
    for (const name of sheepNames) {
      expect(typeof name).toBe('string');
      expect(name.trim().length).toBeGreaterThan(1);
    }
  });

  it('maps instance index deterministically', () => {
    expect(getSheepName(0)).toBe(sheepNames[0]);
    expect(getSheepName(24)).toBe(sheepNames[24]);
    expect(getSheepName(74)).toBe(sheepNames[74]);
    expect(getSheepName(199)).toBe(sheepNames[199]);
  });

  it('falls back safely for out of range indices', () => {
    expect(getSheepName(9999)).toBe('Sheep #10000');
    expect(getSheepName(-1)).toBe('Sheep #0');
  });

  // Names are drawn as DOM text in the interface face, not as a baked glyph
  // mesh; this used to assert a 1.4 MB .glb that nothing loaded. The contract
  // worth holding now is that the face ships and stays small, because it sits
  // on the critical path in front of the field.
  it('ships the interface face the nameplate draws with', () => {
    const fontPath = resolve(process.cwd(), 'app/public/fonts/piazzolla-ui.woff2');
    expect(existsSync(fontPath)).toBe(true);
    expect(statSync(fontPath).size).toBeLessThan(48_000);
    // 'wOF2'. A TTF renamed to .woff2 would still be served, and served wrong.
    expect(readFileSync(fontPath).subarray(0, 4).toString('latin1')).toBe('wOF2');
  });
});
