// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AUDIO_ASSETS, TOTAL_AUDIO_BYTES } from '@app/audio/assets';
import { AUDIO_LOOP_IDS } from '@app/audio/types';

interface LedgerAsset {
  readonly id: string;
  readonly file: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly durationSeconds: number;
  readonly sampleRateHz: number;
  readonly channels: number;
  readonly bitDepth: number;
  readonly loop: boolean;
  readonly loopSeamDelta: number | null;
  readonly recipe: {
    readonly version: number;
    readonly seed: string;
    readonly targetPeakDbfs: number;
    readonly synthesis: string;
  };
}

interface Ledger {
  readonly origin: string;
  readonly provider: null;
  readonly license: string;
  readonly recipe: string;
  readonly outputFormat: string;
  readonly totalBytes: number;
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
      expect(data.subarray(0, 4).toString('ascii'), asset.file).toBe('RIFF');
      expect(data.subarray(8, 12).toString('ascii'), asset.file).toBe('WAVE');
      expect(data.readUInt16LE(20), asset.file).toBe(1);
      expect(data.readUInt16LE(22), asset.file).toBe(asset.channels);
      expect(data.readUInt32LE(24), asset.file).toBe(asset.sampleRateHz);
      expect(data.readUInt16LE(34), asset.file).toBe(asset.bitDepth);
      const sampleCount = data.readUInt32LE(40) / 2;
      expect(sampleCount / asset.sampleRateHz, asset.file).toBeCloseTo(asset.durationSeconds, 8);
      expect(asset.recipe.seed).toMatch(/^0x[0-9a-f]{8}$/);
      expect(asset.recipe.synthesis.length).toBeGreaterThan(20);
      if (asset.loop) expect(asset.loopSeamDelta).toBe(0);
    }
  });

  it('ships only original, recipe-backed audio below 3 MB', async () => {
    const manifest = JSON.parse(
      await readFile(`${root}assets/audio/manifest.json`, 'utf8'),
    ) as Ledger;
    expect(manifest.origin).toBe('synthesized-in-repo');
    expect(manifest.provider).toBeNull();
    expect(manifest.license).toBe('AGPL-3.0-or-later');
    expect(manifest.recipe).toBe('tools/bake-audio.mjs');
    expect(manifest.outputFormat).toBe('wav_pcm_s16le_22050_mono');
    await expect(access(`${root}${manifest.recipe}`)).resolves.toBeUndefined();
    expect(TOTAL_AUDIO_BYTES).toBe(2784342);
    expect(manifest.totalBytes).toBe(TOTAL_AUDIO_BYTES);
    expect(TOTAL_AUDIO_BYTES).toBeLessThan(3 * 1024 * 1024);
  });

  it('rebakes byte-identically without any provider or encoder dependency', () => {
    expect(execFileSync(process.execPath, ['tools/bake-audio.mjs', '--check'], {
      cwd: root,
      encoding: 'utf8',
    })).toContain('audio bake reproducible: 17 files');
  });

  it('keeps rejected buzzing loops and opaque MP3 media out while retaining animal voices', async () => {
    const ids = AUDIO_ASSETS.map((asset) => asset.id);
    expect(ids).not.toContain('insects-loop');
    expect(AUDIO_LOOP_IDS).not.toContain('insects-loop');
    expect(ids).not.toContain('wind-loop');
    expect(AUDIO_LOOP_IDS).not.toContain('wind-loop');
    const directories = ['ambience', 'dog', 'flock', 'world'];
    const media = (await Promise.all(directories.map(async (directory) => (
      (await readdir(`${root}assets/audio/${directory}`)).map((file) => `${directory}/${file}`)
    )))).flat();
    expect(media.some((file) => file.endsWith('.mp3'))).toBe(false);
    expect(media.filter((file) => file.endsWith('.wav'))).toHaveLength(17);
    expect(ids).toEqual(expect.arrayContaining([
      'baa-01', 'baa-02', 'baa-03', 'bellwether',
      'bark-01', 'bark-02', 'bark-03', 'pant-loop', 'huff',
    ]));
  });
});
