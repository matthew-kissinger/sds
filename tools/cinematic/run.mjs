/**
 * Cycle 10 Phase 4: cinematic capture runner (scaffolding).
 *
 * SCOPE NOTE: This file is **scaffolding only** for the cycle close. The
 * full filming pipeline (Vite spawn, Playwright drive, frame grab loop,
 * ffmpeg mux, MP4 output) is gated on:
 *   1) ffmpeg installed and on PATH (sub-300 KB OG outputs require encoder)
 *   2) Playwright Chromium installed
 *   3) Worker/dev-server available locally
 *
 * The runner SHAPE below documents the contract; the Playwright drive +
 * ffmpeg invocation are stubbed. A user-driven first pass will fill them
 * in once the prerequisites are confirmed and the shot-list is reviewed.
 *
 * Expected end-state usage:
 *
 *     npm run cinema             # produce all shots
 *     npm run cinema -- --only=oc-portal    # one shot
 *
 * Output:  assets/marketing/<id>.mp4 (videos), <id>.png (statics).
 */

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { SHOTS } from './shot-list.mjs';

const OUT_DIR = resolve(import.meta.dirname, '../../assets/marketing');
const ROOT = resolve(import.meta.dirname, '../..');

function parseArgs(argv) {
    const args = { only: null };
    for (const a of argv.slice(2)) {
        if (a.startsWith('--only=')) args.only = a.slice('--only='.length);
    }
    return args;
}

function ensureOutDir() {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
}

function shotUrl(shot, baseUrl = 'http://localhost:3000') {
    const params = new URLSearchParams();
    params.set('cinematic', '1');
    params.set('ui', 'off');
    params.set('scene', shot.scene);
    if (shot.mode) params.set('mode', shot.mode);
    if (typeof shot.sun === 'number') params.set('sun', String(shot.sun));
    return `${baseUrl}/?${params.toString()}`;
}

async function captureShot(shot) {
    console.log(`[CINEMA] === ${shot.id} (${shot.kind}) ===`);
    console.log(`[CINEMA] URL: ${shotUrl(shot)}`);
    console.log(`[CINEMA] Notes: ${shot.notes}`);

    // ----- SCAFFOLDING -----
    // The following block describes the contract; replace with real
    // playwright + ffmpeg calls once dependencies are confirmed.
    //
    // 1. Launch Playwright Chromium (headless: false on dev for visual debug).
    // 2. Navigate to shotUrl(shot). Wait for window.__sdsCinema to be defined.
    // 3. For static shots:
    //      - Resize viewport to shot.size.
    //      - Set camera pose via __sdsCinema.setCameraPose(shot.camera.pos, shot.camera.target).
    //      - Wait one frame, then page.screenshot({ path: out_dir/<id>.png }).
    // 4. For video shots:
    //      - Resize viewport to 1920x1080.
    //      - Build keyframes via __sdsCinema.playPath(shot.camera, shot.durationMs).
    //      - For each frame at 30fps: page.screenshot({ path: tmp/<id>-NNNN.png }).
    //      - Honour shot.triggerLightningAt[].
    //      - Mux PNG sequence to MP4 via ffmpeg -framerate 30 -i tmp/<id>-%04d.png -c:v libx264 ...
    //      - Clean up tmp PNGs.
    // -----------------------

    return { shot: shot.id, status: 'scaffolded — fill in playwright+ffmpeg drive' };
}

async function main() {
    ensureOutDir();
    const args = parseArgs(process.argv);
    const shots = args.only ? SHOTS.filter(s => s.id === args.only) : SHOTS;
    if (args.only && shots.length === 0) {
        console.error(`[CINEMA] No shot matches --only=${args.only}`);
        process.exit(1);
    }
    console.log(`[CINEMA] Plan: ${shots.length} shot(s) → ${OUT_DIR}`);
    const results = [];
    for (const shot of shots) {
        results.push(await captureShot(shot));
    }
    console.log(`[CINEMA] Done.`);
    console.table(results);
}

main().catch(err => {
    console.error('[CINEMA] FATAL:', err);
    process.exit(1);
});
