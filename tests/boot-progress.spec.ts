// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  EMPTY_BOOT_PROGRESS,
  bootPercent,
  bootStatus,
  clampBootProgress,
  type BootProgress,
} from '@app/boot/progress';

describe('truthful boot progress', () => {
  it('clamps observed fractions instead of inventing progress', () => {
    expect(clampBootProgress(-1)).toBe(0);
    expect(clampBootProgress(0.42)).toBe(0.42);
    expect(clampBootProgress(2)).toBe(1);
    expect(clampBootProgress(Number.NaN)).toBe(0);
  });

  it('only reaches 100 when every shipping boot dependency is complete', () => {
    expect(bootPercent(EMPTY_BOOT_PROGRESS)).toBe(0);
    const almost = {
      ...EMPTY_BOOT_PROGRESS,
      renderer: 1,
      terrain: 1,
      grass: 1,
      treeline: 1,
      scatter: 1,
      capability: 1,
      scene: 1,
      shaders: 1,
      presented: 0.5,
    } satisfies BootProgress;
    expect(bootPercent(almost)).toBe(98);
    expect(bootPercent({ ...almost, presented: 1 })).toBe(100);
  });

  it('names the largest unfinished asset before renderer-only work', () => {
    expect(bootStatus(EMPTY_BOOT_PROGRESS)).toBe('Starting graphics');
    expect(bootStatus({ ...EMPTY_BOOT_PROGRESS, renderer: 1 })).toBe('Loading grass');
    expect(bootStatus({
      ...EMPTY_BOOT_PROGRESS,
      renderer: 1,
      grass: 1,
      treeline: 1,
      terrain: 1,
      scatter: 1,
    })).toBe('Checking graphics');
  });
});
