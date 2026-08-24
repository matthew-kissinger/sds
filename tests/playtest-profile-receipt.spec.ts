// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectBuiltFiles,
  sameBuildReceipt,
} from '../tools/playtest-profile-receipt.mjs';

let scratch = '';

afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = '';
});

describe('playtest build receipt', () => {
  it('sorts and hashes every file served by the production preview', () => {
    scratch = mkdtempSync(join(tmpdir(), 'herd-build-receipt-'));
    mkdirSync(join(scratch, 'assets'), { recursive: true });
    writeFileSync(join(scratch, 'z.js'), 'zeta');
    writeFileSync(join(scratch, 'assets', 'a.js'), 'alpha');
    writeFileSync(join(scratch, 'assets', 'style.css'), 'paint');
    writeFileSync(join(scratch, 'index.html'), '<main></main>');

    expect(collectBuiltFiles(scratch)).toEqual([
      {
        name: 'assets/a.js',
        byteSize: 5,
        sha256: createHash('sha256').update('alpha').digest('hex'),
      },
      {
        name: 'assets/style.css',
        byteSize: 5,
        sha256: createHash('sha256').update('paint').digest('hex'),
      },
      {
        name: 'index.html',
        byteSize: 13,
        sha256: createHash('sha256').update('<main></main>').digest('hex'),
      },
      {
        name: 'z.js',
        byteSize: 4,
        sha256: createHash('sha256').update('zeta').digest('hex'),
      },
    ]);
  });

  it('detects a build or source change across a probe run', () => {
    const receipt = {
      gitHead: 'abc',
      files: [{ name: 'index.html', byteSize: 3, sha256: 'one' }],
    };
    expect(sameBuildReceipt(receipt, structuredClone(receipt))).toBe(true);
    expect(sameBuildReceipt(receipt, {
      ...receipt,
      files: [{ name: 'index.html', byteSize: 3, sha256: 'two' }],
    })).toBe(false);
  });
});
