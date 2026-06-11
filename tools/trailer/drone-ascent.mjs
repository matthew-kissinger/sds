// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Trailer capture runner: drone ascent hero shot over Newsheepdogland plus
// the live-action clips for the promo trailer. Modeled on
// tools/newsheepdogland-drone-pass.mjs (headed Chrome + GPU, production
// preview on 4173) with one upgrade: live shots are stepped frame-exactly.
// cinema.paused short-circuits gameplay inside runFrame (js/main.js), so the
// runner pauses the loop and calls gameInstance.update(1/30) per captured
// frame. Capture wall-time then has no effect on motion speed in the video.
//
// Usage:
//   npm run build
//   SDS_SUPPRESS_BROWSER_OPEN=1 npx vite preview --host 127.0.0.1 --port 4173
//   node tools/trailer/drone-ascent.mjs                       # ascent contact sheet
//   node tools/trailer/drone-ascent.mjs --shot=ascent --video # full hero mp4
//   node tools/trailer/drone-ascent.mjs --all --video         # every trailer clip
//
// Outputs land in tools/trailer/output/ (gitignored).

import { chromium } from 'playwright';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(ROOT, 'tools/trailer/output');
const BASE_URL = argValue('--base-url') ?? 'http://127.0.0.1:4173/';
const FPS = Number(argValue('--fps') ?? 30);
const WANT_VIDEO = process.argv.includes('--video');
const WANT_ALL = process.argv.includes('--all');
const ONLY_SHOT = argValue('--shot');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--hide-scrollbars']
    : ['--no-sandbox', '--hide-scrollbars'];

// Sun direction at time-of-day 0.77 (sun 1.6deg above horizon, azimuth
// 0.902*PI interpolating the DayNightCycle keyframes at t=0.75 and
// NIGHT_T=0.80). The ascent finale gazes straight at it.
const SUN_DIR = { x: -0.953, y: 0.028, z: 0.302 };

const SHOTS = {
    // Hero: low over the SE water, cross the homestead shoreline, climb the
    // leg, ascend the mountain flank, crest the 120m summit, pivot west and
    // gaze into the golden-hour sun over open water.
    ascent: {
        scene: 'newsheepdogland',
        renderer: 'webgpu',
        // The sun sinks from 0.73 to 0.77 across the shot - a subtle sunset so
        // the finale lands right as the sun touches the horizon.
        todFrom: 0.73,
        todTo: 0.77,
        durationMs: 24000,
        kind: 'path',
        // Grass and tree LOD center on the dog (updateGrassLOD/updateTreeLOD
        // take playerPosition = sheepdog.mesh.position in js/main.js runFrame),
        // so the harness walks the dog under the camera's ground focus each
        // frame and foliage streams in where the shot is looking.
        followFocus: true,
        // First 60% retraces the proven tree-rich foot route from
        // tools/newsheepdogland-drone-pass.mjs (homestead groves catch the low
        // sun), then climbs high enough that the bare leg reads as
        // island-in-the-sea, crests the 120m summit, and pivots into the sun.
        path: [
            { t: 0.00, pos: { x: 960, y: 30, z: -1255 }, target: { x: 470, y: 14, z: -1050 } },
            { t: 0.25, pos: { x: 470, y: 95, z: -860 }, target: { x: -120, y: 42, z: -280 } },
            { t: 0.50, pos: { x: -40, y: 185, z: -150 }, target: { x: -520, y: 90, z: 640 } },
            { t: 0.72, pos: { x: -340, y: 265, z: 250 }, target: { x: -616, y: 100, z: 1110 } },
            { t: 0.88, pos: { x: -560, y: 275, z: 780 }, target: { x: -616, y: 150, z: 1110 } },
            { t: 0.95, pos: { x: -640, y: 245, z: 1010 }, target: { x: -840, y: 210, z: 1300 } },
            {
                t: 1.00,
                pos: { x: -640, y: 228, z: 1090 },
                target: {
                    x: -640 + SUN_DIR.x * 800,
                    y: 228 + SUN_DIR.y * 600,
                    z: 1090 + SUN_DIR.z * 800,
                },
            },
        ],
    },

    // Live tracking shot: the dog works the 200-sheep classic flock at dusk
    // on Rolling Hills; the track camera hangs low off its shoulder.
    // (Newsheepdogland classic is the 10-sheep day loop - no flock to film.)
    herding: {
        scene: 'rolling-hills',
        sun: 0.08,
        durationMs: 8000,
        kind: 'live',
        mode: 'classic',
        waitForFlockSize: 150,
        warmupSteps: 90, // 3s of sim so sheep distribute past spawn poses
        live: 'chase',
    },

    // 1,000-sheep Solo Extreme flock on Rolling Hills at dusk, slow high orbit.
    'flock-mass': {
        scene: 'rolling-hills',
        sun: 0.06,
        durationMs: 8000,
        kind: 'live',
        mode: 'extreme',
        waitForFlockSize: 1000,
        warmupSteps: 120,
        live: 'orbit',
        // 1000 sheep spread over a ~180m patch; orbit wide and high so the
        // mass reads instead of a grass close-up.
        orbit: { radius: 130, height: 85, sweep: 0.35 },
    },

    // Static wide on the Rolling Hills corral, two lightning zaps on the flock.
    lightning: {
        scene: 'rolling-hills',
        sun: 0.4,
        durationMs: 6000,
        kind: 'live',
        mode: 'classic',
        waitForFlockSize: 50,
        warmupSteps: 60,
        live: 'static',
        camera: { pos: { x: 0, y: 55, z: 100 }, target: { x: 0, y: 2, z: -15 } },
        lightning: [
            { ms: 2000, pos: { x: 0, y: 0, z: 10 } },
            { ms: 4000, pos: { x: 15, y: 0, z: -10 } },
        ],
    },
};

function argValue(name) {
    const prefix = `${name}=`;
    const hit = process.argv.find((arg) => arg.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : null;
}

function buildUrl(shot) {
    const url = new URL(BASE_URL);
    if (shot.renderer) url.searchParams.set('renderer', shot.renderer);
    url.searchParams.set('scene', shot.scene);
    url.searchParams.set('cinematic', '1');
    url.searchParams.set('ui', 'off');
    return url.toString();
}

function samplePath(path, t) {
    let a = path[0], b = path[path.length - 1];
    for (let i = 0; i < path.length - 1; i++) {
        if (t >= path[i].t && t <= path[i + 1].t) { a = path[i]; b = path[i + 1]; break; }
    }
    const span = Math.max(1e-6, b.t - a.t);
    const k = Math.max(0, Math.min(1, (t - a.t) / span));
    const sk = k * k * (3 - 2 * k); // smoothstep
    const lerp = (p, q) => p + (q - p) * sk;
    return {
        pos: { x: lerp(a.pos.x, b.pos.x), y: lerp(a.pos.y, b.pos.y), z: lerp(a.pos.z, b.pos.z) },
        target: { x: lerp(a.target.x, b.target.x), y: lerp(a.target.y, b.target.y), z: lerp(a.target.z, b.target.z) },
    };
}

async function shotPng(page, path) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try { await page.screenshot({ path, type: 'png', fullPage: false }); return; }
        catch (err) { if (attempt === 2) throw err; await page.waitForTimeout(120); }
    }
}

// hideUI only hides #react-overlay; the day chip and minimap live outside it.
// Hide every DOM element that is not an ancestor of the main canvas.
async function hideNonCanvasUi(page) {
    await page.evaluate(() => {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        const main = canvases.map((c) => ({ c, a: c.clientWidth * c.clientHeight })).sort((x, y) => y.a - x.a)[0]?.c ?? null;
        const keep = new Set();
        for (let n = main; n; n = n.parentElement) keep.add(n);
        for (const el of Array.from(document.querySelectorAll('body *'))) {
            if (!keep.has(el)) { el.style.visibility = 'hidden'; el.style.pointerEvents = 'none'; }
        }
    });
}

async function bootPage(browser, shot) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(buildUrl(shot), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.__sdsCinema), null, { timeout: 90_000 });
    await page.evaluate(() => window.__sdsCinema.waitReady?.(90_000));
    await page.waitForFunction(
        () => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true,
        null, { timeout: 120_000 },
    ).catch(() => {});
    await page.waitForTimeout(4_000);
    await hideNonCanvasUi(page);
    return { page, errors };
}

function todAt(shot, t) {
    if (typeof shot.todFrom === 'number') {
        return shot.todFrom + ((shot.todTo ?? shot.todFrom) - shot.todFrom) * t;
    }
    return shot.tod ?? shot.sun;
}

// Abort before rendering a single frame if the path ever dips into terrain.
async function checkClearance(page, shot, minClearance = 8) {
    const samples = [];
    for (let i = 0; i <= 200; i++) {
        const { pos } = samplePath(shot.path, i / 200);
        samples.push(pos);
    }
    const violations = await page.evaluate((pts) => {
        const c = window.__sdsCinema;
        return pts
            .map((p, i) => ({ i, terrainY: c.getTerrainY(p.x, p.z), y: p.y }))
            .filter((s) => s.y < s.terrainY + 8);
    }, samples);
    if (violations.length > 0) {
        for (const v of violations.slice(0, 10)) {
            console.error(`[TRAILER] clearance violation at sample ${v.i}: camY ${v.y.toFixed(1)} < terrain ${v.terrainY.toFixed(1)} + ${minClearance}`);
        }
        throw new Error(`ascent path fails clearance at ${violations.length}/201 samples`);
    }
    console.log('[TRAILER] clearance check passed (201 samples, >=8m above terrain)');
}

async function applyPathFrame(page, shot, t) {
    const frame = samplePath(shot.path, t);
    const tod = todAt(shot, t);
    // followFocus: walk the dog along the camera's ground focus so the
    // dog-centered grass/tree LOD streams foliage into the framed area.
    // Velocity (capped at a believable run) drives the walk animation.
    let dog = shot.dog ?? null;
    if (shot.followFocus) {
        const ahead = samplePath(shot.path, Math.min(1, t + 0.01));
        const dx = ahead.target.x - frame.target.x;
        const dz = ahead.target.z - frame.target.z;
        const len = Math.hypot(dx, dz) || 1;
        const speed = Math.min(7, len / ((shot.durationMs / 1000) * 0.01));
        dog = {
            x: frame.target.x,
            z: frame.target.z,
            velocity: { x: (dx / len) * speed, z: (dz / len) * speed },
        };
    }
    await page.evaluate(({ f, tod, dog }) => {
        const c = window.__sdsCinema;
        c.hideUI?.();
        c.pauseSimulation?.();
        c.freeFlyActive = true;
        c.setSun?.(tod);
        if (dog) c.poseDog?.(dog.x, dog.z, dog.velocity, 1 / 60);
        c.setCameraPose?.(f.pos, f.target);
        c.renderFrame?.();
    }, { f: frame, tod, dog });
}

async function capturePathShot(page, shot, id) {
    const frameDir = join(OUT_DIR, 'frames', id);
    await rm(frameDir, { recursive: true, force: true }).catch(() => {});
    await mkdir(frameDir, { recursive: true });
    await checkClearance(page, shot);
    const frames = Math.ceil((shot.durationMs / 1000) * FPS);
    console.log(`[TRAILER] [${id}] capturing ${frames} frames @ ${FPS}fps...`);
    for (let i = 0; i < frames; i++) {
        const t = frames <= 1 ? 0 : i / (frames - 1);
        await applyPathFrame(page, shot, t);
        await shotPng(page, join(frameDir, `${String(i).padStart(4, '0')}.png`));
        if (i > 0 && i % 120 === 0) console.log(`[TRAILER] [${id}] ${i}/${frames}`);
    }
    return frameDir;
}

// Live shots: startSolo, wait for the flock, warm the sim up, then pause the
// rAF gameplay gate and step gameInstance.update(1/FPS) once per captured
// frame so motion speed in the video is exact regardless of capture pace.
async function captureLiveShot(page, shot, id) {
    const frameDir = join(OUT_DIR, 'frames', id);
    await rm(frameDir, { recursive: true, force: true }).catch(() => {});
    await mkdir(frameDir, { recursive: true });

    await page.evaluate(({ mode, sun }) => {
        const c = window.__sdsCinema;
        c.startSolo('jep', mode);
        c.hideUI(); // gameplay start remounts the HUD overlay even with ?ui=off
        c.setSun(sun);
    }, { mode: shot.mode, sun: shot.tod ?? shot.sun });
    await hideNonCanvasUi(page);

    if (shot.waitForFlockSize) {
        console.log(`[TRAILER] [${id}] waiting for ${shot.waitForFlockSize} sheep...`);
        const reached = await page.evaluate(
            (target) => window.__sdsCinema.waitForFlockSize(target, 60_000),
            shot.waitForFlockSize,
        ).catch((err) => { console.warn(`[TRAILER] [${id}] ${err.message} - proceeding`); return 0; });
        console.log(`[TRAILER] [${id}] flock at ${reached}`);
    }

    // Warm up live, then freeze the loop and take over stepping.
    await page.waitForTimeout((shot.warmupSteps ?? 60) * (1000 / 60));
    await hideNonCanvasUi(page);
    await page.evaluate((sun) => {
        const c = window.__sdsCinema;
        c.pauseSimulation();
        c.freeFlyActive = true;
        c.setSun(sun);
        c.hideUI();
    }, shot.tod ?? shot.sun);

    // Orbit shots circle the flock centroid measured after warmup; chase
    // shots also start the dog 30m out from the flock instead of wherever it
    // spawned, so it is visibly working the sheep from the first frame.
    let centroid = null;
    if (shot.live === 'orbit' || shot.live === 'chase') {
        centroid = await page.evaluate((isChase) => {
            const game = window.gameInstance;
            const sheep = game?.gameState?.optimizedSheepSystem?.sheep ?? [];
            if (!sheep.length) return { x: 0, z: 0 };
            let x = 0, z = 0;
            for (const s of sheep) { x += s.position.x; z += s.position.z; }
            x /= sheep.length; z /= sheep.length;
            if (isChase) {
                // A scattered flock's global centroid is empty grass. Find the
                // densest cluster (sheep with most neighbors within 25m) and
                // start the dog 25m out from it instead.
                let best = null, bestCount = -1;
                for (const s of sheep) {
                    let count = 0;
                    for (const o of sheep) {
                        const dx = o.position.x - s.position.x, dz = o.position.z - s.position.z;
                        if (dx * dx + dz * dz < 625) count++;
                    }
                    if (count > bestCount) { bestCount = count; best = s; }
                }
                x = best.position.x; z = best.position.z;
                const dog = game.gameState?.getSheepdog?.();
                if (dog) {
                    const dx = dog.position.x - x, dz = dog.position.z - z;
                    const len = Math.hypot(dx, dz) || 1;
                    window.__sdsCinema.poseDog(
                        x + (dx / len) * 25, z + (dz / len) * 25,
                        { x: (-dx / len) * 6, z: (-dz / len) * 6 }, 1 / 60,
                    );
                }
            }
            return { x, z };
        }, shot.live === 'chase');
        console.log(`[TRAILER] [${id}] flock centroid (${centroid.x.toFixed(0)}, ${centroid.z.toFixed(0)})`);
    }

    const frames = Math.ceil((shot.durationMs / 1000) * FPS);
    const dt = 1 / FPS;
    console.log(`[TRAILER] [${id}] stepping ${frames} frames @ ${FPS}fps...`);
    for (let i = 0; i < frames; i++) {
        const tMs = (i / FPS) * 1000;
        await page.evaluate(({ s, i, dt, tMs, centroid, FPS, sun }) => {
            const c = window.__sdsCinema;
            const game = window.gameInstance;

            // Re-assert per frame: the island day/night cycle advances inside
            // game.update (drifting the sky toward night) and gameplay toasts
            // mount new DOM that the boot-time hide pass never saw.
            c.setSun(sun);
            {
                const canvases = Array.from(document.querySelectorAll('canvas'));
                const main = canvases.map((cv) => ({ cv, a: cv.clientWidth * cv.clientHeight })).sort((a, b) => b.a - a.a)[0]?.cv ?? null;
                const keep = new Set();
                for (let n = main; n; n = n.parentElement) keep.add(n);
                for (const el of Array.from(document.querySelectorAll('body *'))) {
                    if (!keep.has(el)) { el.style.visibility = 'hidden'; el.style.pointerEvents = 'none'; }
                }
            }

            // Per-frame direction before stepping the sim.
            if (s.live === 'chase') {
                const dog = game.gameState?.getSheepdog?.();
                const sheep = game.gameState?.optimizedSheepSystem?.sheep ?? [];
                if (dog && sheep.length) {
                    // Chase the centroid of the 30 nearest sheep, not the
                    // global centroid of a possibly-scattered flock.
                    const nearest = sheep
                        .map((sh) => ({ sh, d: (sh.position.x - dog.position.x) ** 2 + (sh.position.z - dog.position.z) ** 2 }))
                        .sort((a, b) => a.d - b.d)
                        .slice(0, 30);
                    let cx = 0, cz = 0;
                    for (const { sh } of nearest) { cx += sh.position.x; cz += sh.position.z; }
                    cx /= nearest.length; cz /= nearest.length;
                    const dx = cx - dog.position.x, dz = cz - dog.position.z;
                    const dist = Math.hypot(dx, dz) || 1;
                    const speed = Math.min(8, dist); // ease in as it arrives
                    c.poseDog(
                        dog.position.x + (dx / dist) * speed * dt,
                        dog.position.z + (dz / dist) * speed * dt,
                        { x: (dx / dist) * speed, z: (dz / dist) * speed },
                        dt,
                    );
                }
            }

            // Step the paused sim exactly one video frame.
            game.update(dt);

            // Camera for this frame.
            if (s.live === 'chase') {
                c.setDogTrackCamera({ side: -9, back: 11, height: 5.5, lookAhead: 7 });
            } else if (s.live === 'orbit') {
                const theta = (i / (s.durationMs / 1000 * FPS)) * Math.PI * 2 * s.orbit.sweep;
                c.setCameraPose(
                    {
                        x: centroid.x + Math.cos(theta) * s.orbit.radius,
                        y: c.getTerrainY(centroid.x, centroid.z) + s.orbit.height,
                        z: centroid.z + Math.sin(theta) * s.orbit.radius,
                    },
                    { x: centroid.x, y: c.getTerrainY(centroid.x, centroid.z) + 2, z: centroid.z },
                );
            } else if (s.camera) {
                c.setCameraPose(s.camera.pos, s.camera.target);
            }

            // The zap visual animates on wall clock, not stepped sim time, so
            // a single trigger dies between captured frames. Re-fire on every
            // frame inside a 300ms window so the bolt persists in the video.
            for (const l of s.lightning ?? []) {
                if (tMs >= l.ms && tMs < l.ms + 300) c.triggerLightning(l.pos);
            }

            c.renderFrame();
        }, { s: shot, i, dt, tMs, centroid, FPS, sun: todAt(shot, 0) });
        await shotPng(page, join(frameDir, `${String(i).padStart(4, '0')}.png`));
        if (i > 0 && i % 120 === 0) console.log(`[TRAILER] [${id}] ${i}/${frames}`);
    }
    return frameDir;
}

function muxClip(id, frameDir) {
    const mp4 = join(OUT_DIR, `${id}.mp4`);
    console.log(`[TRAILER] [${id}] muxing ${mp4}...`);
    const r = spawnSync('ffmpeg', [
        '-y', '-framerate', String(FPS), '-i', join(frameDir, '%04d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
        '-movflags', '+faststart', mp4,
    ], { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' });
    if (r.status !== 0) throw new Error(`ffmpeg mux failed for ${id}`);
    return mp4;
}

async function contactSheet(page, shot, id) {
    const stills = [];
    for (const t of [0, 0.2, 0.45, 0.68, 0.86, 1]) {
        await applyPathFrame(page, shot, t);
        await page.waitForTimeout(180);
        await applyPathFrame(page, shot, t); // second pass settles pose + sky
        const p = join(OUT_DIR, `preview-${id}-t${t.toFixed(2)}.png`);
        await shotPng(page, p);
        stills.push({ t, path: p });
    }
    const TW = 620, TH = 349, LABEL = 26, GAP = 6;
    const sheetW = stills.length * (TW + GAP) + GAP, sheetH = TH + LABEL + 2 * GAP;
    const comps = [];
    for (let i = 0; i < stills.length; i++) {
        const x = GAP + i * (TW + GAP);
        const tile = await sharp(stills[i].path).resize(TW, TH, { fit: 'cover' }).png().toBuffer();
        comps.push({ input: tile, left: x, top: GAP + LABEL });
        const svg = Buffer.from(`<svg width="${TW}" height="${LABEL}"><rect width="100%" height="100%" fill="#11161d"/><text x="8" y="18" font-family="monospace" font-size="14" fill="#cfe">t=${stills[i].t.toFixed(2)}</text></svg>`);
        comps.push({ input: svg, left: x, top: GAP });
    }
    const sheetPath = join(OUT_DIR, `contact-${id}.png`);
    await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#000' } })
        .composite(comps).png().toFile(sheetPath);
    console.log(`[TRAILER] [${id}] contact sheet -> ${sheetPath}`);
    return sheetPath;
}

async function run() {
    await mkdir(OUT_DIR, { recursive: true });
    let plan = Object.entries(SHOTS);
    if (ONLY_SHOT) plan = plan.filter(([id]) => id === ONLY_SHOT);
    else if (!WANT_ALL) plan = plan.filter(([id]) => id === 'ascent');
    if (plan.length === 0) {
        console.error(`[TRAILER] no shot named "${ONLY_SHOT}" (have: ${Object.keys(SHOTS).join(', ')})`);
        process.exit(1);
    }

    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
    const summary = { mode: WANT_VIDEO ? 'video' : 'preview', shots: {}, startedAt: new Date().toISOString() };
    try {
        for (const [id, shot] of plan) {
            const { page, errors } = await bootPage(browser, shot);
            try {
                if (shot.kind === 'path' && !WANT_VIDEO) {
                    await checkClearance(page, shot);
                    summary.shots[id] = { contactSheet: await contactSheet(page, shot, id) };
                } else if (shot.kind === 'path') {
                    const frameDir = await capturePathShot(page, shot, id);
                    summary.shots[id] = { mp4: muxClip(id, frameDir) };
                } else {
                    const frameDir = await captureLiveShot(page, shot, id);
                    summary.shots[id] = { mp4: muxClip(id, frameDir) };
                }
                summary.shots[id].consoleErrors = errors.slice(0, 5);
            } finally {
                await page.close().catch(() => {});
            }
        }
    } finally {
        await browser.close().catch(() => {});
        summary.endedAt = new Date().toISOString();
        await writeFile(join(OUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    }
    console.log(JSON.stringify(summary, null, 2));
}

run().catch((err) => { console.error(err); process.exit(1); });
