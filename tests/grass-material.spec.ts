// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../app/src/scene/grass/grassMaterial.ts', import.meta.url)),
  'utf8',
);

describe('grass material graph', () => {
  it('uses the compact deterministic field for all three moving wind octaves', () => {
    expect(source).not.toContain('mx_noise_float');
    expect(source).toContain('function sineHashField(');
    expect(source).toMatch(/const coarse = octave\(root, travel, 0\)/);
    expect(source).toMatch(/const middle = octave\(root, travel, 1\)/);
    expect(source).toMatch(/const fine = octave\(root, travel, 2\)/);
    expect(source).toMatch(/return sineHashField\(flow, frequency, angle, time\.mul\(float\(evolve\)\)\)/);
  });

  it('shares that field with both authored colour scales', () => {
    expect(source).toMatch(/sineHashField\(root, PATCH_SCALE, 0\.38, float\(0\.7\)\)/);
    expect(source).toMatch(/sineHashField\(root, MOTTLE_SCALE, -1\.13, float\(2\.4\)\)/);
  });

  it('does not turn a broad wind front into a dark colour stripe', () => {
    expect(source).not.toContain('SHEEN_MIN');
    expect(source).not.toContain('SHEEN_MAX');
    expect(source).not.toMatch(/\.mul\(sheen\)/);
  });

  it('eases in wake records and suppresses fine wind under pressure', () => {
    expect(source).toContain('float(GHOST_BIRTH_DURATION)');
    expect(source).toContain('PRESSED_COARSE_RETENTION');
    expect(source).toContain('PRESSED_DETAIL_RETENTION');
    expect(source).toContain('PRESSED_FLUTTER_RETENTION');
    expect(source).toContain('const localPress = tslMax(horizontalPress, verticalPress)');
  });

  it('retains the one-path toon, body wake, and bark interaction graph', () => {
    expect(source).toContain(
      '([at, slot, record]: TSLNode[]) => bodyPush(at, slot, record)',
    );
    expect(source).not.toMatch(
      /Fn\([\s\S]*?bodyPush\(at, slot, interactors\)[\s\S]*?\);/,
    );
    expect(source.match(/const record[XYZW]: TSLNode = texture\(interactors,/g)).toHaveLength(4);
    expect(source.match(/evaluateBodyPush\(root, slots\.[xyzw], record[XYZW]\)/g)).toHaveLength(4);
    expect(source).toContain('const bark = barkPush(root, inputs.interaction.barkPulse)');
    expect(source.match(/const material = makeToonMaterial\(/g)).toHaveLength(1);
    expect(source.match(/from 'three\/webgpu'/g)).toHaveLength(1);
    expect(source).not.toMatch(/from 'three'|from 'three\/tsl'/);
  });
});
