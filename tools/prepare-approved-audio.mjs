// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Run after individually downloading Mixkit 17 and 58 into the ignored sources directory.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../assets/audio/licensed/', import.meta.url);
const path = (name) => decodeURIComponent(new URL(name, root).pathname).replace(/^\/([A-Z]:)/i, '$1');
const run = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

mkdirSync(path('sources/'), { recursive: true });
if (process.argv.includes('--download')) {
  for (const id of [17, 58]) {
    const destination = path(`sources/mixkit-${id}.wav`);
    if (existsSync(destination)) continue;
    const response = await fetch(`https://assets.mixkit.co/active_storage/sfx/${id}/${id}.wav`);
    if (!response.ok) throw new Error(`Mixkit ${id}: HTTP ${response.status}`);
    writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  }
}

for (const [name, expected] of [
  ['mixkit-17.wav', '46d5fbe7a713077c813816f2e5637c51d062f185da2a45904c0784d39404d624'],
  ['mixkit-58.wav', '0e7cf32d03d63d8be9358e087e19d9052187616451274e256beafb7e26bf10d2'],
]) {
  const actual = createHash('sha256').update(readFileSync(path(`sources/${name}`))).digest('hex');
  if (actual !== expected) throw new Error(`Unapproved source: ${name}; review before preparing audio`);
}

// Preserve the original rate, channels, dynamics and pitch. Silence compresses
// efficiently in FLAC and gives the short bird recording a twelve-second rest.
run(['-i', path('sources/mixkit-17.wav'), '-af',
  'afade=t=in:d=0.15,afade=t=out:st=7.732358:d=0.6,apad=pad_dur=12',
  '-c:a', 'flac', '-compression_level', '8', '-fflags', '+bitexact', '-flags:a', '+bitexact', path('birds-loop.flac')]);
// Join two copies with a short linear crossfade, then cut one complete period
// from their interiors. The resulting wrap is at matching points in the take.
run(['-i', path('sources/mixkit-58.wav'), '-i', path('sources/mixkit-58.wav'),
  '-filter_complex', '[0:a][1:a]acrossfade=d=0.2:c1=tri:c2=tri,atrim=start=4:end=13.796009,asetpts=PTS-STARTPTS[out]',
  '-map', '[out]', '-c:a', 'flac', '-compression_level', '8', '-fflags', '+bitexact', '-flags:a', '+bitexact', path('pant-loop.flac')]);
for (const name of ['sources/mixkit-17.wav', 'sources/mixkit-58.wav', 'birds-loop.flac', 'pant-loop.flac']) {
  const data = readFileSync(path(name));
  console.log(name, data.length, createHash('sha256').update(data).digest('hex'));
}
