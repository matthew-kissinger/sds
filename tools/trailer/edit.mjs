// SPDX-License-Identifier: AGPL-3.0-or-later
// Exact cut list, original-speed takes, identical visuals for fair music auditions.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const dir = resolve('captures/trailer');
const work = join(dir, 'edit'); const deliver = join(dir, 'deliverables');
mkdirSync(work, { recursive: true }); mkdirSync(deliver, { recursive: true });
const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const report = JSON.parse(readFileSync(join(dir, 'offline-herding-report.json'), 'utf8'));
if (!report.completed || report.replayMatchedFrames !== report.completionFrame) throw new Error('A matching completed replay is required');
const cuts = [
  { take: 'offline-split', start: 0, duration: 5, title: 'hook' },
  { take: 'offline-wide', start: 0, duration: 5 },
  { take: 'offline-details', start: 0, duration: 3.75, title:'gate' },
  { take: 'offline-dog', start: 0, duration: 5 },
  { take: 'offline-flock', start: 0, duration: 3.75 },
  { take: 'offline-approach', start: 0, duration: 5, title: 'goal', crop: '1280:720:320:130' },
  { take: 'offline-gate', start: 0, duration: 5, crop: '1440:810:240:20' },
  { take: 'offline-finish', start: 0, duration: 5, crop: '1440:810:240:20' },
  { take: 'offline-drone', start: 0, duration: 5, title: 'end', titleStart: 1.5 },
];
writeFileSync(join(dir, 'edit-decision-list.json'), JSON.stringify({ release: report.release.commit, cuts }, null, 2));
for (const [i, cut] of cuts.entries()) {
  const selected = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',').map(Number);
  if (process.argv.includes('--mix-only') || (selected && !selected.includes(i))) continue;
  const args = ['-ss', String(cut.start), '-i', join(dir, `${cut.take}.mp4`)];
  if (cut.title) args.push('-loop', '1', '-i', join(dir, 'titles', `${cut.title}.png`));
  const video = `[0:v]fps=60,setpts=PTS-STARTPTS,${cut.crop ? `crop=${cut.crop},` : ''}scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1[v]${cut.title ? `;[v][1:v]overlay=0:0:shortest=1:enable='gte(t,${cut.titleStart ?? 0})'[out]` : ';[v]null[out]'}`;
  args.push('-filter_complex_threads', '2', '-filter_complex', video, '-map', '[out]', '-map', '0:a:0',
    '-t', String(cut.duration), '-af', `afade=t=in:d=0.035,afade=t=out:st=${cut.duration - 0.06}:d=0.06`,
    '-c:v', 'libx264', '-threads', '4', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', join(work, `${i}.mp4`));
  ffmpeg(args); console.log(`Edited shot ${i + 1}/${cuts.length}`);
}
writeFileSync(join(work, 'concat.txt'), cuts.map((_, i) => `file '${i}.mp4'`).join('\n'));
const base = join(work, 'picture-edit.mp4');
ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(work, 'concat.txt'), '-c', 'copy', '-movflags', '+faststart', base]);
const tracks = [
  { id: 'A-bossa', name: 'bossa-antigua', start: 0, author: 'Kevin MacLeod', title: 'Bossa Antigua' },
  { id: 'B-playful', name: 'carefree', start: 0, author: 'Kevin MacLeod', title: 'Carefree' },
  { id: 'C-bossa-piano', name: 'bossabossa', start: 0, author: 'Kevin MacLeod', title: 'BossaBossa' },
];
for (const track of tracks) {
  const music = join(dir, 'music', `${track.name}.mp3`);
  const filter = '[1:a]loudnorm=I=-21:TP=-3:LRA=11,afade=t=in:d=0.35,afade=t=out:st=39:d=3,alimiter=limit=0.84:level=false[a]';
  ffmpeg(['-i', base, '-ss', String(track.start), '-i', music, '-filter_complex', filter, '-map', '0:v:0', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', '42.5', '-movflags', '+faststart',
    '-metadata', `comment=Music: ${track.title} by ${track.author}, CC BY 4.0. Excerpt edited and faded. Frame-by-frame gameplay capture.`,
    join(deliver, `sheepdog-sim-v3-${track.id}.mp4`)]);
  track.sha256 = createHash('sha256').update(readFileSync(music)).digest('hex');
  console.log(`Mixed ${track.id}`);
}
writeFileSync(join(dir, 'music-receipts.json'), JSON.stringify(tracks, null, 2));
ffmpeg(['-i', base, '-an', '-c:v', 'copy', '-movflags', '+faststart', join(deliver, 'sheepdog-sim-v3-silent.mp4')]);
writeFileSync(join(work, 'teaser.txt'), [0, 7, 8].map(i => `file '${i}.mp4'`).join('\n'));
const teaser = join(work, 'teaser.mp4');
ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(work, 'teaser.txt'), '-c', 'copy', teaser]);
ffmpeg(['-i', teaser, '-ss', '0', '-i', join(dir, 'music', 'bossabossa.mp3'), '-filter_complex',
  '[1:a]loudnorm=I=-21:TP=-3:LRA=11,afade=t=in:d=0.25,afade=t=out:st=11.5:d=3,alimiter=limit=0.84:level=false[a]',
  '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', '15', '-movflags', '+faststart', join(deliver, 'sheepdog-sim-v3-teaser-15s.mp4')]);
