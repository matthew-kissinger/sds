// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../assets/audio/', import.meta.url);
for (const id of ['footfall-01', 'footfall-02']) {
  // Remove the bright brush/click, retain the low paw impact, and round the
  // boundaries. Bake once so every footstep needs no additional runtime DSP.
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', fileURLToPath(new URL(`sources/${id}.mp3`, root)),
    '-af', `highpass=f=65,lowpass=f=1800:p=2,volume=${id === 'footfall-01' ? 12 : 8}dB,afade=t=in:d=0.012,afade=t=out:st=0.44:d=0.08`,
    '-ac', '1', '-sample_fmt', 's16', '-c:a', 'flac', '-compression_level', '8',
    '-fflags', '+bitexact', '-flags:a', '+bitexact',
    fileURLToPath(new URL(`dog/${id}.flac`, root)),
  ], { stdio: 'inherit' });
}
