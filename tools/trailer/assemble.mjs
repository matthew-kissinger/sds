// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Trailer assembly: title cards (sharp SVG -> PNG) + ffmpeg filter_complex
// concat of the captured clips with card fades and a music bed from the
// game's own soundtrack.
//
// Inputs (from tools/trailer/drone-ascent.mjs --video):
//   tools/trailer/output/ascent.mp4      24s drone ascent hero
//   tools/trailer/output/herding.mp4     8s dog working the flock
//   tools/trailer/output/flock-mass.mp4  8s 1000-sheep orbit
// Output:
//   tools/trailer/output/trailer.mp4
//
// Usage: node tools/trailer/assemble.mjs

import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT = resolve(ROOT, 'tools/trailer/output');
const MUSIC = resolve(ROOT, 'assets/sounds_compressed/music_start.mp3');

const W = 1920, H = 1080, FPS = 30;

function card(lines, file) {
    // Dark brand background (#0c1c2c, the PWA background color); ALL-CAPS
    // plain text per the prose-and-voice rule. No em-dashes, no exclamations.
    const spans = lines
        .map((l, i) => {
            const size = l.size ?? 64;
            const dy = l.dy ?? (i === 0 ? 0 : 90);
            return `<tspan x="${W / 2}" dy="${dy}" font-size="${size}" fill="${l.color ?? '#e8f0f8'}" font-weight="${l.weight ?? 700}" letter-spacing="${l.spacing ?? 6}">${l.text}</tspan>`;
        })
        .join('');
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#0c1c2c"/>
        <text x="${W / 2}" y="${H / 2 - (lines.length - 1) * 38}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif">${spans}</text>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toFile(join(OUT, file));
}

async function makeCards() {
    await card([{ text: 'ONE PASTURE. THREE ISLANDS.' }], 'card-islands.png');
    await card([{ text: 'SIX MODES. UP TO 5,000 SHEEP.' }], 'card-modes.png');
    await card([
        { text: 'SHEEP DOG SIM', size: 110, spacing: 10 },
        { text: 'sheepdogsim.com', size: 48, weight: 400, color: '#9fd1ff', dy: 130, spacing: 3 },
        { text: 'FREE IN YOUR BROWSER. OPEN SOURCE.', size: 30, weight: 400, color: '#7a8ea0', dy: 80, spacing: 4 },
    ], 'card-end.png');
}

function run() {
    // Segment plan (seconds): trims chosen off the captured clips' best beats.
    //   ascent 0-9 (coast + homestead) | card | herding 2-7.5 | card |
    //   flock-mass 1-7 | ascent 15.5-24 (climb, crest, sun gaze) | end card
    const CARD_A = 2.2, CARD_B = 2.2, CARD_END = 4.0, FADE = 0.35;
    const segs = [
        { v: `[0:v]trim=0:9,setpts=PTS-STARTPTS[v0]`, d: 9 },
        { v: `[3:v]loop=loop=${Math.round(CARD_A * FPS)}:size=1,trim=0:${CARD_A},setpts=PTS-STARTPTS,fps=${FPS},fade=t=in:st=0:d=${FADE},fade=t=out:st=${CARD_A - FADE}:d=${FADE}[v1]`, d: CARD_A },
        { v: `[1:v]trim=2:7.5,setpts=PTS-STARTPTS[v2]`, d: 5.5 },
        { v: `[4:v]loop=loop=${Math.round(CARD_B * FPS)}:size=1,trim=0:${CARD_B},setpts=PTS-STARTPTS,fps=${FPS},fade=t=in:st=0:d=${FADE},fade=t=out:st=${CARD_B - FADE}:d=${FADE}[v3]`, d: CARD_B },
        { v: `[2:v]trim=1:7,setpts=PTS-STARTPTS[v4]`, d: 6 },
        { v: `[0:v]trim=15.5:24,setpts=PTS-STARTPTS,fade=t=out:st=8.1:d=0.4[v5]`, d: 8.5 },
        { v: `[5:v]loop=loop=${Math.round(CARD_END * FPS)}:size=1,trim=0:${CARD_END},setpts=PTS-STARTPTS,fps=${FPS},fade=t=in:st=0:d=${FADE}[v6]`, d: CARD_END },
    ];
    const total = segs.reduce((a, s) => a + s.d, 0);
    const filter = [
        ...segs.map((s) => s.v),
        `${segs.map((_, i) => `[v${i}]`).join('')}concat=n=${segs.length}:v=1:a=0[vcat]`,
        `[vcat]format=yuv420p[vout]`,
        `[6:a]atrim=0:${total},afade=t=in:st=0:d=1,afade=t=out:st=${(total - 2.5).toFixed(2)}:d=2.5,volume=0.9[aout]`,
    ].join(';');

    const args = [
        '-y',
        '-i', join(OUT, 'ascent.mp4'),
        '-i', join(OUT, 'herding.mp4'),
        '-i', join(OUT, 'flock-mass.mp4'),
        '-i', join(OUT, 'card-islands.png'),
        '-i', join(OUT, 'card-modes.png'),
        '-i', join(OUT, 'card-end.png'),
        '-i', MUSIC,
        '-filter_complex', filter,
        '-map', '[vout]', '-map', '[aout]',
        '-c:v', 'libx264', '-crf', '19', '-preset', 'medium',
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        join(OUT, 'trailer.mp4'),
    ];
    console.log(`[ASSEMBLE] total ${total.toFixed(1)}s`);
    const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error('ffmpeg assembly failed');
    console.log(`[ASSEMBLE] -> ${join(OUT, 'trailer.mp4')}`);
}

for (const f of ['ascent.mp4', 'herding.mp4', 'flock-mass.mp4']) {
    if (!existsSync(join(OUT, f))) {
        console.error(`[ASSEMBLE] missing ${f} - run tools/trailer/drone-ascent.mjs --video first`);
        process.exit(1);
    }
}
mkdirSync(OUT, { recursive: true });
await makeCards();
run();
