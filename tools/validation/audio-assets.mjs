#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIO_DIR = resolve(ROOT, 'assets', 'sounds_compressed');

function parseArgs(argv) {
  const out = { out: null };
  for (const raw of argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function probe(name) {
  const path = resolve(AUDIO_DIR, name);
  const [{ stdout }, file] = await Promise.all([
    execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration,bit_rate:stream=codec_name,sample_rate,channels',
      '-of', 'json',
      path,
    ]),
    stat(path),
  ]);
  const data = JSON.parse(stdout);
  const stream = data.streams?.[0] ?? {};
  return {
    path: `assets/sounds_compressed/${name}`,
    role: name.startsWith('music_') ? 'music' : 'sfx',
    bytes: file.size,
    durationSeconds: Number(data.format?.duration ?? 0),
    bitrate: Number(data.format?.bit_rate ?? 0),
    codec: stream.codec_name ?? null,
    sampleRate: Number(stream.sample_rate ?? 0),
    channels: stream.channels ?? null,
  };
}

async function run() {
  const args = parseArgs(process.argv);
  const names = (await readdir(AUDIO_DIR)).filter((name) => /\.(?:mp3|ogg|wav|m4a|webm)$/i.test(name)).sort();
  const assets = await Promise.all(names.map(probe));
  const totals = Object.fromEntries(['music', 'sfx'].map((role) => {
    const selected = assets.filter((asset) => asset.role === role);
    return [role, {
      files: selected.length,
      bytes: selected.reduce((sum, asset) => sum + asset.bytes, 0),
      durationSeconds: selected.reduce((sum, asset) => sum + asset.durationSeconds, 0),
    }];
  }));
  const report = {
    capturedAt: new Date().toISOString(),
    sourceDirectory: 'assets/sounds_compressed',
    sourceMastersPresent: false,
    totals,
    assets,
  };
  if (args.out) {
    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error('[AUDIO-AUDIT] fatal:', error);
  process.exitCode = 1;
});
