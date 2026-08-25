// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AUDIO_ASSETS, TOTAL_AUDIO_BYTES } from '@app/audio/assets';
import { AUDIO_LOOP_IDS } from '@app/audio/types';

interface LedgerAsset {
  readonly id: string;
  readonly file: string;
  readonly byteSize: number;
  readonly sha256: string;
}

interface Ledger {
  readonly assets: readonly LedgerAsset[];
}

const root = fileURLToPath(new URL('../', import.meta.url));

describe('audio media ledger', () => {
  it('keeps runtime definitions aligned with the provenance manifest', async () => {
    const manifest = JSON.parse(
      await readFile(`${root}assets/audio/manifest.json`, 'utf8'),
    ) as Ledger;
    expect(AUDIO_ASSETS.map(({ id, byteSize, sha256 }) => ({ id, byteSize, sha256 })))
      .toEqual(manifest.assets.map(({ id, byteSize, sha256 }) => ({ id, byteSize, sha256 })));
  });

  it('pins every generated file by byte size and SHA-256', async () => {
    const manifest = JSON.parse(
      await readFile(`${root}assets/audio/manifest.json`, 'utf8'),
    ) as Ledger;
    for (const asset of manifest.assets) {
      const data = await readFile(`${root}assets/audio/${asset.file}`);
      expect(data.byteLength, asset.file).toBe(asset.byteSize);
      expect(createHash('sha256').update(data).digest('hex'), asset.file).toBe(asset.sha256);
    }
  });

  it('holds the complete media set below 3 MB', () => {
    expect(TOTAL_AUDIO_BYTES).toBe(1255526);
    expect(TOTAL_AUDIO_BYTES).toBeLessThan(3 * 1024 * 1024);
  });

  it('keeps rejected buzzing loops out while retaining animal voices', async () => {
    const ids = AUDIO_ASSETS.map((asset) => asset.id);
    expect(ids).not.toContain('insects-loop');
    expect(AUDIO_LOOP_IDS).not.toContain('insects-loop');
    await expect(access(`${root}assets/audio/ambience/insects-loop.mp3`)).rejects.toThrow();
    expect(ids).not.toContain('wind-loop');
    expect(AUDIO_LOOP_IDS).not.toContain('wind-loop');
    await expect(access(`${root}assets/audio/ambience/wind-loop.mp3`)).rejects.toThrow();
    expect(ids).toEqual(expect.arrayContaining([
      'baa-01', 'baa-02', 'baa-03', 'bellwether',
      'bark-01', 'bark-02', 'bark-03', 'pant-loop', 'huff',
    ]));
  });
});
