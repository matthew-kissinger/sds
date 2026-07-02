// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Trailer assembly for the v2.6.1 beta.
//
// Sources, in priority order:
//   1. Hand-played OBS takes (Matt on the keyboard, real gameplay, HUD on).
//      Raw MKVs are searched in tools/trailer/output/raw/ then ~/Videos.
//      TAKE_CLIPS below is the scrub log: the in/out points that survived
//      review. Conformed to 1080p30 masters in tools/trailer/output/clips/.
//      OBS audio is dropped everywhere (desktop audio bleed risk); the only
//      audio is the game's own soundtrack as a music bed.
//   2. Scripted scenic orbitals from capture.mjs --video (clean canvas, no
//      HUD, LOD driven by the cinematic camera) in tools/trailer/output/.
//
// Two cuts:
//   discord  (~22s)  - punchy beats, hard cuts, title overlay, end slate.
//   youtube  (~95s)  - devlog cut: acts per scene with lower-third captions,
//                      one honest beta status card, real Victory ending.
//
// Output: tools/trailer/output/sds-v2.6.1-<cut>.mp4
//
// Usage: node tools/trailer/assemble.mjs [--cut=discord|youtube|both] [--reconform]
//
// All on-screen text follows .claude/rules/prose-and-voice.md: no em-dashes,
// no exclamation marks, ALL-CAPS headers, concrete numbers, three public
// scenes framing.

import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT = resolve(ROOT, 'tools/trailer/output');
const CLIPS = join(OUT, 'clips');
const MUSIC = resolve(ROOT, 'assets/sounds_compressed/music_start.mp3');
const W = 1920, H = 1080;
// Cuts declare their own frame rate; conforms run at the take rate (60) so
// the 60fps YouTube master never upsamples gameplay.
const CONFORM_FPS = 60;
const CUT = (process.argv.find((a) => a.startsWith('--cut=')) ?? '--cut=both').slice(6);
const RECONFORM = process.argv.includes('--reconform');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// Hand-played takes: scrub log
// ---------------------------------------------------------------------------
// The 2026-07-01 17:44-17:54 OBS session (1080p60 NVENC MKV). Two other
// recordings from that day (07:06, 15:03-15:26) are different games entirely;
// 17-52-38 and 17-53-38 are loading screens. Verified via contact sheets in
// tools/trailer/output/review/raw-sheets/.

const RAW_DIRS = [
    join(OUT, 'raw'),
    resolve(process.env.USERPROFILE ?? process.env.HOME ?? '', 'Videos'),
];

// 17-51-21 was recorded windowed: Chrome tab strip + address + bookmarks
// (~118px) on top, Windows taskbar (~52px) below. Crop to the clean 1920x910
// band, scale to 1080 high, centre-crop back to 1920 (costs ~9% off each side).
const CROP_BROWSER = 'crop=1920:910:0:118,scale=-2:1080,crop=1920:1080:(iw-1920)/2:0';

const TAKE_CLIPS = [
    // 17-44-01: Home Field Solo Classic (200), Jep, dusk into night, ends on a
    // real Victory card (2:39, achievement toast confirms the mode).
    { id: 'field-dusk-drive', take: '2026-07-01 17-44-01.mkv', in: 8.0, dur: 8.0, note: 'Follow cam behind the flock at dusk, bark diamond up.' },
    { id: 'field-cluster-drive', take: '2026-07-01 17-44-01.mkv', in: 39.5, dur: 4.5, note: 'Tight cluster mid-drive.' },
    { id: 'field-pen-night', take: '2026-07-01 17-44-01.mkv', in: 115.5, dur: 6.0, note: 'Top-down cam, night pen at 84 percent complete.' },
    { id: 'field-victory', take: '2026-07-01 17-44-01.mkv', in: 150.0, dur: 6.5, note: 'Last retirements into the Victory card, 2:39.' },
    // 17-49-53: Home Field Solo Chaos (5,000), dusk. The noon chaos take
    // (17-47-34) is retired: freezedetect found 0.2-0.9s spawn hitches across
    // both of its windows; this dusk take scans clean.
    { id: 'chaos-dusk-sweep', take: '2026-07-01 17-49-53.mkv', in: 0.8, dur: 7.2, note: 'Close sweep along the carpet edge at dusk.' },
    { id: 'chaos-dusk-carve', take: '2026-07-01 17-49-53.mkv', in: 9.7, dur: 8.0, note: 'Dusk carpet carve, pink sky, stamina nearly spent.' },
    // 17-51-21: Rolling Hills Solo Chaos (5,000) round start, camera way out.
    { id: 'rh-island-spawn', take: '2026-07-01 17-51-21.mkv', in: 1.2, dur: 9.0, vf: CROP_BROWSER, note: 'Full-island wide, 5,000 spawning in a ring. Windowed take, crop-zoomed.' },
    { id: 'rh-island-streams', take: '2026-07-01 17-51-21.mkv', in: 35.5, dur: 9.5, vf: CROP_BROWSER, note: 'Island wide with sheep streams. Spare.' },
    // 17-54-01: Open Country Solo Extreme (600), dusk, roundup stage.
    { id: 'oc-woods-drive', take: '2026-07-01 17-54-01.mkv', in: 8.2, dur: 8.0, note: 'Clusters through the woods at dusk, bark diamonds.' },
    { id: 'oc-aerial-ring', take: '2026-07-01 17-54-01.mkv', in: 41.5, dur: 5.2, note: 'Free-cam aerial, roundup ring and gather banner.' },
];

function findTake(name) {
    for (const d of RAW_DIRS) {
        const p = join(d, name);
        if (existsSync(p)) return p;
    }
    throw new Error(`raw take not found in ${RAW_DIRS.join(' or ')}: ${name}`);
}

function conformTakes() {
    mkdirSync(CLIPS, { recursive: true });
    for (const c of TAKE_CLIPS) {
        const out = join(CLIPS, `${c.id}.mp4`);
        if (existsSync(out) && !RECONFORM) continue;
        const src = findTake(c.take);
        const vf = `${c.vf ? `${c.vf},` : ''}fps=${CONFORM_FPS},setsar=1`;
        const args = [
            '-y', '-ss', String(c.in), '-t', String(c.dur), '-i', src,
            '-vf', vf, '-an',
            '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            out,
        ];
        console.log(`[CONFORM] ${c.id} <- ${c.take} @ ${c.in}s +${c.dur}s`);
        const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
        if (r.status !== 0) {
            console.error(r.stderr?.slice(-1500));
            throw new Error(`conform failed for ${c.id}`);
        }
    }
}

// A clip id resolves to a conformed take clip first, then a scenic master.
function clipPath(id) {
    for (const p of [join(CLIPS, `${id}.mp4`), join(OUT, `${id}.mp4`)]) {
        if (existsSync(p)) return p;
    }
    throw new Error(`missing clip ${id} - run capture.mjs --video (scenic) or check TAKE_CLIPS`);
}

// ---------------------------------------------------------------------------
// Overlay art: full cards + lower-third captions
// ---------------------------------------------------------------------------

function cardSvg(lines) {
    const spans = lines
        .map((l, i) => {
            const size = l.size ?? 60;
            const dy = l.dy ?? (i === 0 ? 0 : 92);
            return `<tspan x="${W / 2}" dy="${dy}" font-size="${size}" fill="${l.color ?? '#e8f0f8'}" font-weight="${l.weight ?? 700}" letter-spacing="${l.spacing ?? 5}">${esc(l.text)}</tspan>`;
        })
        .join('');
    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#0c1c2c"/>
        <text x="${W / 2}" y="${H / 2 - (lines.length - 1) * 40}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif">${spans}</text>
    </svg>`;
}

async function card(lines, file) {
    await sharp(Buffer.from(cardSvg(lines))).png().toFile(join(OUT, file));
    return file;
}

// Lower-third caption on a translucent backing bar; transparent elsewhere.
async function lowerThird(header, body, file) {
    const bodyLines = Array.isArray(body) ? body : (body ? [body] : []);
    const padX = 36, x = 84;
    const headerSize = 46, bodySize = 30, lineGap = 44;
    const barH = 56 + (header ? 58 : 0) + bodyLines.length * lineGap;
    const barY = H - 150 - barH;
    const textWidthGuess = Math.max(
        header ? header.length * headerSize * 0.62 : 0,
        ...bodyLines.map((b) => b.length * bodySize * 0.52),
        320,
    );
    const spans = [];
    let ty = barY + 66;
    if (header) {
        spans.push(`<text x="${x + padX}" y="${ty}" font-family="Segoe UI, Arial, sans-serif" font-size="${headerSize}" font-weight="700" letter-spacing="4" fill="#f2f7fc">${esc(header)}</text>`);
        ty += 58;
    }
    for (const b of bodyLines) {
        spans.push(`<text x="${x + padX}" y="${ty}" font-family="Segoe UI, Arial, sans-serif" font-size="${bodySize}" font-weight="400" fill="#d8e4ee">${esc(b)}</text>`);
        ty += lineGap;
    }
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${x}" y="${barY}" width="${Math.min(textWidthGuess + padX * 2, W - 2 * x)}" height="${barH}" rx="10" fill="#0c1c2c" fill-opacity="0.62"/>
        ${spans.join('\n')}
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(join(OUT, file));
    return file;
}

// Centered title overlay (for the opening establish shot), transparent bg.
async function titleOverlay(file) {
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <text x="${W / 2}" y="${H * 0.42}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
              font-size="118" font-weight="700" letter-spacing="12" fill="#f4f8fc"
              stroke="#0c1c2c" stroke-opacity="0.35" stroke-width="2">SHEEP DOG SIM</text>
        <text x="${W / 2}" y="${H * 0.42 + 74}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
              font-size="40" font-weight="400" letter-spacing="5" fill="#e2ecf4"
              stroke="#0c1c2c" stroke-opacity="0.35" stroke-width="1">v2.6.1 web beta, free in your browser</text>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(join(OUT, file));
    return file;
}

// ---------------------------------------------------------------------------
// Cut definitions
// ---------------------------------------------------------------------------
// Segment: { clip, from, to, fadeIn?, fadeOut? } trims a conformed clip;
//          { cardFile, dur } holds a full-frame card.
// Caption: { file, from, to } in CUT-GLOBAL seconds, overlaid post-concat.

async function buildDiscordPlan() {
    const title = await titleOverlay('overlay-title.png');
    const end = await card([
        { text: 'SHEEP DOG SIM', size: 104, spacing: 10 },
        { text: 'sheepdogsim.com', size: 46, weight: 400, color: '#9fd1ff', dy: 122, spacing: 3 },
        { text: 'FREE IN YOUR BROWSER. OPEN SOURCE.', size: 28, weight: 400, color: '#7a8ea0', dy: 76, spacing: 4 },
    ], 'card-end.png');
    return {
        name: 'discord',
        out: 'sds-v2.6.1-discord.mp4',
        // 1080p30, bitrate-capped so the file stays under Discord's 25MB
        // attachment limit and plays inline for everyone.
        fps: 30,
        encode: ['-crf', '23', '-maxrate', '7500k', '-bufsize', '15M', '-preset', 'medium'],
        music: { file: MUSIC },
        segments: [
            { clip: 'rh-island-establish', from: 0.0, to: 2.8, fadeIn: true },
            { clip: 'chaos-dusk-sweep', from: 1.8, to: 4.6 },
            { clip: 'field-dusk-drive', from: 1.5, to: 3.7 },
            { clip: 'oc-woods-drive', from: 2.4, to: 4.6 },
            { clip: 'rh-island-spawn', from: 0.8, to: 3.4 },
            { clip: 'chaos-dusk-carve', from: 2.3, to: 4.5 },
            { clip: 'oc-orbital', from: 4.0, to: 6.2 },
            { clip: 'field-victory', from: 2.6, to: 5.8, fadeOut: true },
            { cardFile: end, dur: 2.8, fadeIn: true },
        ],
        captions: [
            { file: title, from: 0.4, to: 2.6 },
        ],
    };
}

async function buildYoutubePlan() {
    const title = await titleOverlay('overlay-title.png');
    const capRh = await lowerThird('ROLLING HILLS', ['An island at dusk. Get too close and the whole flock scatters.'], 'cap-rh.png');
    const capField = await lowerThird('HOME FIELD', ['A flat fenced pasture. The starter scene.'], 'cap-field.png');
    const capGather = await lowerThird(null, ['Gather the flock and drive it to the pen.'], 'cap-gather.png');
    const capNight = await lowerThird(null, ['Night falls on the last stragglers.'], 'cap-night.png');
    const capChaos = await lowerThird('SOLO CHAOS', ['5,000 sheep. The flock becomes the antagonist.'], 'cap-chaos.png');
    const capSpawn = await lowerThird('ROLLING HILLS, SOLO CHAOS', ['5,000 sheep spawn in around the island.'], 'cap-spawn.png');
    const capOc = await lowerThird('OPEN COUNTRY', ['A 380-metre island with a multi-stage objective.'], 'cap-oc.png');
    const capExtreme = await lowerThird('SOLO EXTREME', ['600 sheep through the woods at dusk.'], 'cap-extreme.png');
    const capRing = await lowerThird(null, ['Gather 240 into the ring to wake the portal.'], 'cap-ring.png');
    const beta1 = await card([
        { text: 'V2.6.1 WEB BETA', size: 76, spacing: 8 },
        { text: 'Three public scenes. Solo modes, 2-4 player multiplayer, leaderboards.', size: 34, weight: 400, color: '#c9d8e6', dy: 110 },
        { text: 'No signup, no ads. Runs in your browser.', size: 34, weight: 400, color: '#c9d8e6', dy: 56 },
    ], 'card-beta1.png');
    const end = await card([
        { text: 'SHEEP DOG SIM', size: 104, spacing: 10 },
        { text: 'sheepdogsim.com', size: 46, weight: 400, color: '#9fd1ff', dy: 122, spacing: 3 },
        { text: 'FREE IN YOUR BROWSER. OPEN SOURCE. BUILT WITH THREE.JS.', size: 28, weight: 400, color: '#7a8ea0', dy: 76, spacing: 4 },
    ], 'card-end-yt.png');

    const segments = [
        // Act 1: open
        { clip: 'rh-island-establish', from: 0.0, to: 7.0, fadeIn: true },
        { clip: 'rh-orbital', from: 1.0, to: 7.0 },
        // Act 2: Home Field, a real round start to finish
        { clip: 'field-orbital', from: 3.0, to: 8.5 },
        { clip: 'field-dusk-drive', from: 0.0, to: 6.5 },
        { clip: 'field-cluster-drive', from: 0.0, to: 4.5 },
        { clip: 'field-pen-night', from: 0.0, to: 5.0, fadeOut: true },
        // Act 3: chaos (dusk take only; the noon take freeze-hitches)
        { clip: 'chaos-dusk-sweep', from: 1.8, to: 6.5, fadeIn: true },
        { clip: 'chaos-dusk-carve', from: 0.0, to: 8.0, fadeOut: true },
        // Act 4: scale on the islands
        { clip: 'rh-island-spawn', from: 0.0, to: 8.0, fadeIn: true },
        { clip: 'oc-orbital', from: 0.0, to: 6.0 },
        { clip: 'oc-woods-drive', from: 0.0, to: 6.5 },
        { clip: 'oc-aerial-ring', from: 0.0, to: 5.2, fadeOut: true },
        // Act 5: status + the win
        { cardFile: beta1, dur: 5.5, fadeIn: true, fadeOut: true },
        { clip: 'field-victory', from: 0.0, to: 6.5, fadeIn: true },
        { cardFile: end, dur: 5.0, fadeIn: true },
    ];
    // Global caption windows derived from segment layout.
    let t = 0;
    const seg = {};
    for (const s of segments) {
        const d = s.clip ? s.to - s.from : s.dur;
        seg[s.clip ?? s.cardFile] = { start: t, end: t + d };
        t += d;
    }
    const captions = [
        { file: title, from: seg['rh-island-establish'].start + 1.2, to: seg['rh-island-establish'].end - 1.0 },
        { file: capRh, from: seg['rh-orbital'].start + 0.6, to: seg['rh-orbital'].end - 0.4 },
        { file: capField, from: seg['field-orbital'].start + 0.6, to: seg['field-orbital'].end - 0.4 },
        { file: capGather, from: seg['field-dusk-drive'].start + 0.6, to: seg['field-dusk-drive'].end - 0.4 },
        { file: capNight, from: seg['field-pen-night'].start + 0.5, to: seg['field-pen-night'].end - 0.6 },
        { file: capChaos, from: seg['chaos-dusk-sweep'].start + 0.6, to: seg['chaos-dusk-carve'].start + 3.5 },
        { file: capSpawn, from: seg['rh-island-spawn'].start + 0.6, to: seg['rh-island-spawn'].end - 0.5 },
        { file: capOc, from: seg['oc-orbital'].start + 0.5, to: seg['oc-orbital'].end - 0.4 },
        { file: capExtreme, from: seg['oc-woods-drive'].start + 0.5, to: seg['oc-woods-drive'].end - 0.4 },
        { file: capRing, from: seg['oc-aerial-ring'].start + 0.4, to: seg['oc-aerial-ring'].end - 0.5 },
    ];
    return {
        name: 'youtube',
        out: 'sds-v2.6.1-youtube.mp4',
        // Upload master: 1440p60. Dense grass boils at YouTube's 1080p AVC
        // bitrate; a 1440p upload lands on the higher-bitrate VP9 ladder.
        // The lanczos upscale happens after compositing on the 1080 canvas.
        fps: 60,
        scaleOut: '2560:1440',
        encode: ['-crf', '16', '-preset', 'slow'],
        music: { file: MUSIC },
        segments,
        captions,
    };
}

// ---------------------------------------------------------------------------
// ffmpeg assembly
// ---------------------------------------------------------------------------

function assemble(plan) {
    const FADE = 0.35;
    const fps = plan.fps ?? 30;
    const inputs = [];
    const inputIndex = new Map();
    const addInput = (args, key) => {
        inputs.push(args);
        inputIndex.set(key, inputIndex.size);
        return inputIndex.size - 1;
    };

    for (const s of plan.segments) {
        if (s.clip && !inputIndex.has(s.clip)) {
            addInput(['-i', clipPath(s.clip)], s.clip);
        } else if (s.cardFile && !inputIndex.has(s.cardFile)) {
            addInput(['-loop', '1', '-t', String(s.dur + 0.5), '-i', join(OUT, s.cardFile)], s.cardFile);
        }
    }
    // Caption stills must run long enough for their global-time alpha fades.
    const capMaxTo = new Map();
    for (const c of plan.captions) capMaxTo.set(c.file, Math.max(capMaxTo.get(c.file) ?? 0, c.to));
    for (const c of plan.captions) {
        if (!inputIndex.has(c.file)) addInput(['-loop', '1', '-t', String((capMaxTo.get(c.file) + 0.6).toFixed(2)), '-i', join(OUT, c.file)], c.file);
    }
    const musicIdx = inputIndex.size;
    inputs.push(['-stream_loop', '-1', '-i', plan.music.file]);

    const filters = [];
    const segLabels = [];
    let total = 0;
    plan.segments.forEach((s, i) => {
        const label = `v${i}`;
        const d = s.clip ? s.to - s.from : s.dur;
        const fades = [
            s.fadeIn ? `fade=t=in:st=0:d=${FADE}` : null,
            s.fadeOut ? `fade=t=out:st=${(d - FADE).toFixed(2)}:d=${FADE}` : null,
        ].filter(Boolean).join(',');
        if (s.clip) {
            // Mild uniform grade on gameplay only; cards stay untouched.
            const idx = inputIndex.get(s.clip);
            filters.push(`[${idx}:v]trim=${s.from}:${s.to},setpts=PTS-STARTPTS,fps=${fps},scale=${W}:${H},setsar=1,eq=contrast=1.03:saturation=1.09${fades ? `,${fades}` : ''},format=yuv420p[${label}]`);
        } else {
            const idx = inputIndex.get(s.cardFile);
            filters.push(`[${idx}:v]trim=0:${s.dur},setpts=PTS-STARTPTS,fps=${fps},scale=${W}:${H},setsar=1${fades ? `,${fades}` : ''},format=yuv420p[${label}]`);
        }
        total += d;
        segLabels.push(`[${label}]`);
    });
    filters.push(`${segLabels.join('')}concat=n=${plan.segments.length}:v=1:a=0[vcat]`);

    // Text in motion: each caption alpha-fades in over 0.45s while sliding up
    // 36px into place, then alpha-fades out.
    let vLast = 'vcat';
    plan.captions.forEach((c, i) => {
        const idx = inputIndex.get(c.file);
        const next = `vo${i}`;
        const from = c.from.toFixed(2), to = c.to.toFixed(2);
        const slide = c.slide ?? 36;
        filters.push(`[${idx}:v]format=rgba,fade=t=in:st=${from}:d=0.45:alpha=1,fade=t=out:st=${(c.to - 0.35).toFixed(2)}:d=0.35:alpha=1[c${i}]`);
        filters.push(`[${vLast}][c${i}]overlay=x=0:y='${slide}*(1-min(1,(t-${from})/0.45))':enable='between(t,${from},${to})'[${next}]`);
        vLast = next;
    });
    filters.push(`[${vLast}]${plan.scaleOut ? `scale=${plan.scaleOut}:flags=lanczos,` : ''}format=yuv420p[vout]`);
    // Music bed: normalize to -14 LUFS for web platforms, then fade. loudnorm
    // upsamples internally, so pin the rate back for the AAC encode.
    filters.push(`[${musicIdx}:a]atrim=0:${total.toFixed(2)},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,afade=t=in:st=0:d=1,afade=t=out:st=${(total - 2.5).toFixed(2)}:d=2.5[aout]`);

    const outFile = join(OUT, plan.out);
    const args = [
        '-y',
        ...inputs.flat(),
        '-filter_complex', filters.join(';'),
        '-map', '[vout]', '-map', '[aout]',
        '-c:v', 'libx264', ...(plan.encode ?? ['-crf', '19', '-preset', 'medium']),
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        '-shortest',
        outFile,
    ];
    console.log(`[ASSEMBLE] ${plan.name}: ${plan.segments.length} segments, ${total.toFixed(1)}s`);
    const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
    if (r.status !== 0) {
        console.error(r.stderr?.slice(-2000));
        throw new Error(`ffmpeg assembly failed for ${plan.name}`);
    }
    console.log(`[ASSEMBLE] -> ${outFile}`);
    return { outFile, total };
}

// ---------------------------------------------------------------------------
// Deliverable manifest
// ---------------------------------------------------------------------------

function probeFile(p) {
    const r = spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', p], { encoding: 'utf8' });
    if (r.status !== 0) return null;
    const j = JSON.parse(r.stdout);
    const v = j.streams.find((s) => s.codec_type === 'video');
    return {
        durationSec: Number(Number(j.format.duration).toFixed(2)),
        bytes: Number(j.format.size),
        width: v?.width, height: v?.height, fps: v?.r_frame_rate,
    };
}

function writeManifest(plans) {
    const manifest = {
        campaign: 'sds v2.6.1 web beta trailer',
        generated: new Date().toISOString(),
        music: {
            file: 'assets/sounds_compressed/music_start.mp3',
            license: 'First-party game soundtrack, CC BY-SA 4.0 (see LICENSE-ASSETS).',
            note: 'OBS take audio is dropped in every cut (desktop audio bleed risk); the music bed is the only audio.',
        },
        sources: {
            handPlayedTakes: TAKE_CLIPS.map((c) => ({
                clip: c.id, take: c.take, inSec: c.in, durSec: c.dur,
                cropped: Boolean(c.vf), note: c.note,
            })),
            scenicMasters: ['rh-island-establish', 'rh-orbital', 'field-orbital', 'oc-orbital'].map((id) => ({
                clip: id,
                method: 'capture.mjs in-page Mediabunny recorder, webgpu-production, LOD/cull centred on the cinematic camera (lodFocus)',
                validation: 'tools/trailer/output/manifest.json',
            })),
        },
        cuts: plans.map((p) => ({
            name: p.name,
            file: `tools/trailer/output/${p.out}`,
            probe: probeFile(join(OUT, p.out)),
            segments: p.segments.map((s) => s.clip
                ? { clip: s.clip, from: s.from, to: s.to }
                : { card: s.cardFile, dur: s.dur }),
            captions: p.captions.map((c) => ({ file: c.file, from: Number(c.from.toFixed(2)), to: Number(c.to.toFixed(2)) })),
        })),
    };
    const p = join(OUT, 'cuts-manifest.json');
    writeFileSync(p, JSON.stringify(manifest, null, 2));
    console.log(`[MANIFEST] -> ${p}`);
}

mkdirSync(OUT, { recursive: true });
const MANIFEST_ONLY = process.argv.includes('--manifest-only');
if (!MANIFEST_ONLY) conformTakes();
const plans = [];
if (CUT === 'discord' || CUT === 'both') plans.push(await buildDiscordPlan());
if (CUT === 'youtube' || CUT === 'both') plans.push(await buildYoutubePlan());
if (!MANIFEST_ONLY) for (const plan of plans) assemble(plan);
writeManifest(plans);
