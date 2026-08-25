// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('initial animal shader compile budget', () => {
  it('keeps sheep paint on the compact TSL brush path', () => {
    const code = source('app/src/scene/flock/sheepColor.ts');

    expect(code).not.toContain('mx_noise_float');
    expect(code).toContain('woolBands(');
    expect(code).toContain('MOTTLE_BROAD');
    expect(code).toContain('MOTTLE_MID');
    expect(code.match(/\bsin\(/g)).toHaveLength(4);
  });

  it('keeps dog paint compact without dropping its authored bands or marks', () => {
    const code = source('app/src/scene/dog/dogMarkings.ts');
    const marks = source('app/src/scene/dog/dogMarks.ts');

    expect(code).not.toContain('mx_noise_float');
    expect(code).toContain('buildDogMarks(wander)');
    expect(code).toContain('band(COAT_SHADOW, CREAM_SHADOW)');
    expect(code).toContain('band(COAT_MID, CREAM_MID)');
    expect(code).toContain('band(COAT_LIT, CREAM_LIT)');
    expect(code.match(/\bsin\(/g)).toHaveLength(3);
    expect(code).toContain('positionGeometry');
    expect(marks).toContain('positionGeometry');
    expect(code).not.toMatch(/\bpositionLocal\s*[,.;)]/);
    expect(marks).not.toMatch(/\bpositionLocal\s*[,.;)]/);
  });
});
