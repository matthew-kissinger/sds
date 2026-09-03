// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { existsSync, statSync } from 'node:fs';
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

  it('verifies the baked font asset exists and has valid size', () => {
    const fontPath = resolve(process.cwd(), 'app/public/fonts/sheep-font.font.glb');
    expect(existsSync(fontPath)).toBe(true);
    const size = statSync(fontPath).size;
    expect(size).toBeGreaterThan(100_000);
  });
});
