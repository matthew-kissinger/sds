// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// YouTube thumbnail composer for the trailer pipeline. Extracts a frame from
// a conformed clip, crops a HUD-free 16:9 window (the played takes carry the
// game HUD; the crop dodges the flock pill, camera chip, timer, and footer),
// resizes to 1280x720, and optionally composes title text over a soft scrim.
//
// Output: tools/trailer/output/thumb-*.jpg (JPEG, safely under YouTube's
// 2 MB thumbnail cap).
//
// Usage: node tools/trailer/thumbnail.mjs
//
// Text follows .claude/rules/prose-and-voice.md: ALL-CAPS, concrete numbers,
// no em-dashes, no exclamation marks, no hype words.

import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../..', 'tools/trailer/output');

// HUD-free window inside a 1920x1080 take frame: below the top pills
// (y >= 140), above the ready pill and footer (y < 1010), centred 16:9.
const HUD_SAFE = { left: 187, top: 140, width: 1546, height: 870 };

const THUMBS = [
    {
        id: 'thumb-yt-carve',
        clip: 'clips/chaos-dusk-carve.mp4',
        at: 5.5,
        title: 'SHEEP DOG SIM',
        sub: '5,000 SHEEP, FREE IN YOUR BROWSER',
    },
    {
        id: 'thumb-yt-island',
        clip: 'clips/rh-island-spawn.mp4',
        at: 6.0,
        title: 'SHEEP DOG SIM',
        sub: 'V2.6 WEB BETA',
    },
    {
        id: 'thumb-yt-clean',
        clip: 'clips/chaos-dusk-carve.mp4',
        at: 5.5,
    },
];

function textSvg(title, sub) {
    return `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="scrim" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stop-color="#0c1c2c" stop-opacity="0.78"/>
                <stop offset="1" stop-color="#0c1c2c" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <rect x="0" y="440" width="1280" height="280" fill="url(#scrim)"/>
        <text x="64" y="618" font-family="Segoe UI, Arial, sans-serif" font-size="88"
              font-weight="800" letter-spacing="4" fill="#f4f8fc"
              stroke="#0c1c2c" stroke-opacity="0.4" stroke-width="2">${title}</text>
        <text x="66" y="672" font-family="Segoe UI, Arial, sans-serif" font-size="34"
              font-weight="600" letter-spacing="3" fill="#cfe2f2">${sub}</text>
    </svg>`;
}

for (const t of THUMBS) {
    const src = join(OUT, t.clip);
    if (!existsSync(src)) throw new Error(`missing clip ${src} - run assemble.mjs first`);
    const frame = join(OUT, `${t.id}.frame.png`);
    const r = spawnSync('ffmpeg', ['-y', '-ss', String(t.at), '-i', src, '-frames:v', '1', frame], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
    if (r.status !== 0) {
        console.error(r.stderr?.slice(-800));
        throw new Error(`frame extract failed for ${t.id}`);
    }
    let img = sharp(frame).extract(HUD_SAFE).resize(1280, 720);
    if (t.title) {
        img = img.composite([{ input: Buffer.from(textSvg(t.title, t.sub ?? '')) }]);
    }
    const out = join(OUT, `${t.id}.jpg`);
    await img.jpeg({ quality: 90 }).toFile(out);
    unlinkSync(frame);
    console.log(`[THUMB] -> ${out}`);
}
