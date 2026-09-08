// SPDX-License-Identifier: AGPL-3.0-or-later
// Restore the owner's preferred recorded game layer; exclude its unwanted ending.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const root = resolve('captures/trailer');
const source = resolve(process.argv[2] ?? join(root, 'deliverables/sheepdog-sim-v2-game-audio.mp4'));
const stem = join(root, 'game-audio.wav');
const ffmpeg = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
ffmpeg(['-i', source, '-vn', '-af',
  'atrim=duration=39.5,asetpts=PTS-STARTPTS,afade=t=in:d=0.15,afade=t=out:st=37.5:d=2,apad=whole_dur=42.5',
  '-t', '42.5', '-c:a', 'pcm_s24le', '-ar', '48000', stem]);
ffmpeg(['-i', stem, '-filter_complex',
  '[0:a]asplit=3[a][b][c];[a]atrim=0:5,asetpts=PTS-STARTPTS[x];[b]atrim=32.5:37.5,asetpts=PTS-STARTPTS[y];[c]atrim=37.5:42.5,asetpts=PTS-STARTPTS[z];[x][y][z]concat=n=3:v=0:a=1[out]',
  '-map', '[out]', '-c:a', 'pcm_s24le', '-ar', '48000', join(root, 'teaser-game-audio.wav')]);
writeFileSync(join(root, 'game-audio-receipt.json'), JSON.stringify({
  source, sourceSha256: createHash('sha256').update(readFileSync(source)).digest('hex'),
  description: 'Recorded game ambience and effects from the earlier real-time trailer takes, reused under the corresponding retakes.',
  fadeStartSeconds: 37.5, excludedFromSeconds: 39.5, durationSeconds: 42.5,
  soundSourceIdentification: 'The owner-reported crow-like sound was not independently identified.'
}, null, 2));
