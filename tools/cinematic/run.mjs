/**
 * Cycle 11 Phase 3: cinematic capture runner.
 *
 * Drives Playwright Chromium against the dev server to render:
 *   - Video shots (4): 1080p @ 30fps MP4 (H.264) + 720p downscale.
 *   - OG static cards (3): 1200x630 WebP, target sub-300KB.
 *   - Dog portraits (5): 512x512 WebP + PNG fallback.
 *   - PWA icon hero: 192/512/maskable PNG.
 *
 *     npm run cinema                       # all shots
 *     npm run cinema -- --shot=og-field    # single shot
 *     npm run cinema -- --kind=static      # all OG cards only
 *     npm run cinema -- --no-encode        # leave PNG sequences (skip ffmpeg mux)
 *     npm run cinema -- --headed           # visual debug (Chromium UI)
 *
 * Outputs:
 *   - tools/cinematic/output/  (intermediate frames; gitignored)
 *   - assets/marketing/og/<id>.webp        (OG cards)
 *   - assets/marketing/videos/<id>.mp4     (videos; gitignored)
 *   - assets/dogs/<id>.{webp,png}          (dog thumbnails)
 *   - assets/images/icons/icon-{192,512,maskable-512}.png
 *
 * Prerequisites:
 *   - ffmpeg on PATH (choco install ffmpeg / scoop install ffmpeg).
 *   - Playwright Chromium installed (`npx playwright install chromium`).
 *   - sharp installed (devDep).
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readdirSync, unlinkSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHOTS, DOG_SHOTS, PWA_ICON_SHOT } from './shot-list.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const TMP_DIR = resolve(ROOT, 'tools/cinematic/output');
const OG_OUT = resolve(ROOT, 'assets/marketing/og');
const VIDEO_OUT = resolve(ROOT, 'assets/marketing/videos');
const DOG_OUT = resolve(ROOT, 'assets/dogs');
const ICON_OUT = resolve(ROOT, 'assets/images/icons');

// ------------------------- args -------------------------

function parseArgs(argv) {
    const args = { shot: null, kind: null, headed: false, encode: true, baseUrl: 'http://localhost:3000', skipVideo: false };
    for (const a of argv.slice(2)) {
        if (a.startsWith('--shot=')) args.shot = a.slice('--shot='.length);
        else if (a.startsWith('--only=')) args.shot = a.slice('--only='.length); // legacy alias
        else if (a.startsWith('--kind=')) args.kind = a.slice('--kind='.length);
        else if (a === '--headed') args.headed = true;
        else if (a === '--no-encode') args.encode = false;
        else if (a === '--skip-video') args.skipVideo = true;
        else if (a.startsWith('--baseUrl=')) args.baseUrl = a.slice('--baseUrl='.length);
    }
    return args;
}

// ------------------------- prereqs -------------------------

function ensureFfmpeg() {
    try {
        const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', shell: process.platform === 'win32' });
        if (r.status !== 0) throw new Error('ffmpeg returned non-zero');
        const first = (r.stdout || '').split('\n')[0];
        console.log(`[CINEMA] ${first.trim()}`);
    } catch (err) {
        console.error('[CINEMA] ffmpeg not on PATH. Install:');
        console.error('  Windows: choco install ffmpeg  (or)  scoop install ffmpeg');
        console.error('  macOS:   brew install ffmpeg');
        console.error('  Linux:   apt install ffmpeg');
        process.exit(2);
    }
}

// ------------------------- vite spawn -------------------------

async function ensureVite(baseUrl) {
    // Probe first — if Vite is already running, skip spawn (developer ran
    // `npm run dev:client` in another terminal). Otherwise spawn it ourselves.
    try {
        const r = await fetch(baseUrl, { method: 'HEAD' });
        if (r.ok || r.status === 404) {
            console.log('[CINEMA] Vite already running');
            return null;
        }
    } catch {}

    console.log('[CINEMA] Starting Vite dev server (port 3000)…');
    const proc = spawn('npx', ['vite', '--port', '3000', '--host', '127.0.0.1'], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        env: { ...process.env, FORCE_COLOR: '0' },
    });
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', () => {});

    // Poll the port instead of stdout — more robust on Windows.
    const start = Date.now();
    while (Date.now() - start < 60000) {
        try {
            const r = await fetch(baseUrl, { method: 'HEAD' });
            if (r.ok || r.status === 404) {
                console.log('[CINEMA] Vite ready');
                return proc;
            }
        } catch {}
        await new Promise(r => setTimeout(r, 1000));
    }
    try { proc.kill(); } catch {}
    throw new Error('Vite start timeout (60s)');
}

// ------------------------- canvas capture -------------------------

// Cycle 27 Phase B: page.screenshot() hangs indefinitely on Windows
// headless Chromium with swiftshader after "fonts loaded" — Playwright's
// post-fonts CDP screenshot path deadlocks against rAF on the WebGL
// canvas. canvas.toDataURL() bypasses Playwright's screenshot machinery
// entirely and works reliably (preserveDrawingBuffer is already on in
// cinematic mode per js/cinematic.js).
async function canvasShot(page) {
    const dataUrl = await page.evaluate(() => {
        const canvas = document.querySelector('#canvas-container canvas');
        if (!canvas) throw new Error('canvas not found in #canvas-container');
        return canvas.toDataURL('image/png');
    });
    return Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
}

// ------------------------- url helper -------------------------

function shotUrl(shot, baseUrl) {
    const params = new URLSearchParams();
    params.set('cinematic', '1');
    params.set('ui', 'off');
    if (shot.scene) params.set('scene', shot.scene);
    if (typeof shot.sun === 'number') params.set('sun', String(shot.sun));
    return `${baseUrl}/?${params.toString()}`;
}

// ------------------------- captures -------------------------

async function captureVideo(page, shot) {
    const frameDir = join(TMP_DIR, shot.id);
    mkdirSync(frameDir, { recursive: true });
    // Clean prior frames.
    for (const f of readdirSync(frameDir)) {
        if (f.endsWith('.png')) unlinkSync(join(frameDir, f));
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    console.log(`[CINEMA] [${shot.id}] navigating…`);
    await page.goto(shotUrl(shot, BASE_URL), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.__sdsCinema, { timeout: 30000 });
    await page.evaluate(() => window.__sdsCinema.waitReady());
    await page.waitForTimeout(1500);

    // Drive shot setup.
    await page.evaluate((s) => {
        const c = window.__sdsCinema;
        if (s.mode) c.startSolo('jep', s.mode);
        if (typeof s.sun === 'number') c.setSun(s.sun);
        if (Array.isArray(s.camera)) {
            c.__path = c.playPath(s.camera, s.durationMs);
        } else if (s.camera) {
            c.setCameraPose(s.camera.pos, s.camera.target);
        }
        c.__lightningSchedule = (s.triggerLightningAt || []).map(l => ({ ...l, fired: false }));
        c.__shotStart = performance.now();
    }, shot);

    // Capture frames at 30fps for durationMs.
    const fps = 30;
    const frameCount = Math.ceil((shot.durationMs / 1000) * fps);
    const interval = 1000 / fps;
    console.log(`[CINEMA] [${shot.id}] capturing ${frameCount} frames @ ${fps}fps…`);
    for (let i = 0; i < frameCount; i++) {
        const targetMs = i * interval;
        await page.evaluate((tMs) => {
            const c = window.__sdsCinema;
            if (c.__path && !c.__path.done) c.__path.update();
            const due = (c.__lightningSchedule || []).filter(l => l.ms <= tMs && !l.fired);
            for (const l of due) { c.triggerLightning(l.pos); l.fired = true; }
        }, targetMs);
        const framePng = await canvasShot(page);
        writeFileSync(join(frameDir, `${String(i).padStart(4, '0')}.png`), framePng);
        const remain = interval - 5;
        if (remain > 0) await page.waitForTimeout(remain);
    }
    return frameDir;
}

function muxVideo(shot, frameDir) {
    mkdirSync(VIDEO_OUT, { recursive: true });
    const masterPath = join(VIDEO_OUT, `${shot.id}.mp4`);
    console.log(`[CINEMA] [${shot.id}] muxing master MP4…`);
    const r1 = spawnSync('ffmpeg', [
        '-y', '-framerate', '30',
        '-i', join(frameDir, '%04d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-crf', '20', '-preset', 'medium',
        '-movflags', '+faststart',
        masterPath,
    ], { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' });
    if (r1.status !== 0) throw new Error(`ffmpeg mux failed for ${shot.id}`);

    const lightPath = join(VIDEO_OUT, `${shot.id}-720p.mp4`);
    console.log(`[CINEMA] [${shot.id}] producing 720p variant…`);
    spawnSync('ffmpeg', [
        '-y', '-i', masterPath,
        '-vf', 'scale=1280:720',
        '-c:v', 'libx264', '-crf', '23', '-preset', 'medium',
        '-movflags', '+faststart',
        lightPath,
    ], { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' });

    return masterPath;
}

async function captureStatic(page, shot) {
    await page.setViewportSize({ width: shot.size.width, height: shot.size.height });
    console.log(`[CINEMA] [${shot.id}] navigating…`);
    await page.goto(shotUrl(shot, BASE_URL), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.__sdsCinema, { timeout: 30000 });
    await page.evaluate(() => window.__sdsCinema.waitReady());
    await page.waitForTimeout(1500);

    // Cycle 12 (post-close): live-action static path. When `mode` is set
    // we kick off the gameplay (so e.g. Solo Extreme spawns 1000 sheep);
    // when `liveAction` is set we leave the simulation running so sheep
    // are mid-flock when we capture, instead of frozen on the start
    // screen. Cycle 13 Phase 1 fix: prefer `waitForFlockSize` over
    // `settleMs` for sheep-count-bound shots (1000 sheep needs 6-10s
    // on desktop; a fixed settleMs guesses wrong), and re-assert
    // `hideUI()` after `startSolo()` because the React HUD remounts
    // when gameplay starts even with `?ui=off` set at boot.
    await page.evaluate((s) => {
        const c = window.__sdsCinema;
        if (s.mode) c.startSolo('jep', s.mode);
        if (s.mode) c.hideUI(); // re-assert — gameplay start remounts the HUD overlay
        if (typeof s.sun === 'number') c.setSun(s.sun);
        if (s.camera) c.setCameraPose(s.camera.pos, s.camera.target);
        if (!s.liveAction) c.pauseSimulation();
    }, shot);
    if (shot.liveAction && shot.waitForFlockSize) {
        console.log(`[CINEMA] [${shot.id}] waiting for ${shot.waitForFlockSize} sheep…`);
        try {
            const reached = await page.evaluate(
                (target) => window.__sdsCinema.waitForFlockSize(target, 30000),
                shot.waitForFlockSize
            );
            console.log(`[CINEMA] [${shot.id}] flock reached ${reached} sheep`);
        } catch (err) {
            console.warn(`[CINEMA] [${shot.id}] waitForFlockSize failed: ${err.message} — proceeding anyway`);
        }
        // Brief settle after target reached so sheep distribute past
        // initial cluster spawn poses (boids smooth out in <1s).
        await page.waitForTimeout(shot.settleMs ?? 800);
    } else {
        await page.waitForTimeout(shot.liveAction ? (shot.settleMs ?? 3000) : 300);
    }
    if (shot.liveAction && shot.camera) {
        // setCameraPose runs once; if the game's CameraController grabbed
        // back during settle (it does — Classic camera is rebuilt per
        // frame), re-pin the pose AND re-assert hideUI just before capture.
        await page.evaluate((s) => {
            const c = window.__sdsCinema;
            c.setCameraPose(s.camera.pos, s.camera.target);
            c.hideUI();
        }, shot);
        await page.waitForTimeout(50);
    }

    const pngBuf = await canvasShot(page);
    mkdirSync(OG_OUT, { recursive: true });
    const outPath = join(OG_OUT, `${shot.id}.webp`);
    await sharp(pngBuf)
        .resize(shot.size.width, shot.size.height)
        .webp({ quality: 82, effort: 6 })
        .toFile(outPath);
    const sz = statSync(outPath).size;
    console.log(`[CINEMA] [${shot.id}] → ${outPath} (${(sz / 1024).toFixed(1)} KB)`);
    if (sz > 300 * 1024) {
        console.warn(`[CINEMA] [${shot.id}] WARNING: ${(sz / 1024).toFixed(0)} KB > 300 KB target`);
    }
}

async function captureDog(page, shot) {
    await page.setViewportSize({ width: shot.size.width, height: shot.size.height });
    console.log(`[CINEMA] [${shot.id}] navigating…`);
    await page.goto(shotUrl(shot, BASE_URL), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.__sdsCinema, { timeout: 30000 });
    await page.evaluate(() => window.__sdsCinema.waitReady());
    await page.waitForTimeout(1500);

    await page.evaluate(async (id) => {
        await window.__sdsCinema.mountDogShowcase(id);
    }, shot.dogId);
    await page.waitForTimeout(800);

    const pngBuf = await canvasShot(page);
    mkdirSync(DOG_OUT, { recursive: true });
    const sz = shot.output ?? { width: 512, height: 512 };
    const webpPath = join(DOG_OUT, `${shot.dogId}.webp`);
    const pngPath = join(DOG_OUT, `${shot.dogId}.png`);
    await sharp(pngBuf).resize(sz.width, sz.height, { fit: 'cover' }).webp({ quality: 82, effort: 6 }).toFile(webpPath);
    await sharp(pngBuf).resize(sz.width, sz.height, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(pngPath);
    console.log(`[CINEMA] [${shot.id}] → ${webpPath} (${(statSync(webpPath).size / 1024).toFixed(1)} KB) + PNG fallback`);
}

async function capturePwaIcon(page, shot) {
    await page.setViewportSize({ width: shot.size.width, height: shot.size.height });
    console.log(`[CINEMA] [${shot.id}] navigating…`);
    await page.goto(shotUrl(shot, BASE_URL), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.__sdsCinema, { timeout: 30000 });
    await page.evaluate(() => window.__sdsCinema.waitReady());
    await page.waitForTimeout(1500);

    await page.evaluate(async (id) => {
        await window.__sdsCinema.mountDogShowcase(id);
    }, shot.dogId);
    await page.waitForTimeout(800);

    const pngBuf = await canvasShot(page);
    mkdirSync(ICON_OUT, { recursive: true });
    // Generate three sizes. Maskable variant adds 20% safe-area padding inside the
    // theme color (manifest theme_color = #00BFFF; background_color = #0c1c2c).
    await sharp(pngBuf).resize(192, 192, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(join(ICON_OUT, 'icon-192.png'));
    await sharp(pngBuf).resize(512, 512, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(join(ICON_OUT, 'icon-512.png'));

    // Maskable: pad inside a 512 frame with 20% safe area, fill with brand bg.
    const inner = await sharp(pngBuf).resize(384, 384, { fit: 'cover' }).png().toBuffer();
    await sharp({
        create: { width: 512, height: 512, channels: 4, background: { r: 12, g: 28, b: 44, alpha: 1 } },
    })
        .composite([{ input: inner, top: 64, left: 64 }])
        .png({ compressionLevel: 9 })
        .toFile(join(ICON_OUT, 'icon-maskable-512.png'));

    console.log(`[CINEMA] [${shot.id}] → 192/512/maskable PNGs in ${ICON_OUT}`);
}

// ------------------------- main -------------------------

let BASE_URL = 'http://localhost:3000';

async function main() {
    const args = parseArgs(process.argv);
    BASE_URL = args.baseUrl;

    ensureFfmpeg();
    mkdirSync(TMP_DIR, { recursive: true });

    // Aggregate all shots into a single processing list.
    let plan = [...SHOTS, ...DOG_SHOTS, PWA_ICON_SHOT];
    if (args.shot) plan = plan.filter(s => s.id === args.shot);
    if (args.kind) plan = plan.filter(s => s.kind === args.kind);
    if (args.skipVideo) plan = plan.filter(s => s.kind !== 'video');
    if (plan.length === 0) {
        console.error(`[CINEMA] No shots match filters (shot=${args.shot}, kind=${args.kind})`);
        process.exit(1);
    }

    const vite = await ensureVite(BASE_URL);
    let browser, ctx, page;
    try {
        console.log('[CINEMA] Launching Chromium…');
        browser = await chromium.launch({
            headless: !args.headed,
            // Windows headless Chromium needs angle/swiftshader fallback for
            // reliable WebGL2; --use-gl=egl was timing out on first frame.
            // Run with --headed during debugging if these flags don't behave.
            args: args.headed
                ? ['--enable-webgl', '--ignore-gpu-blocklist']
                : [
                    '--enable-webgl',
                    '--ignore-gpu-blocklist',
                    '--use-angle=swiftshader',
                    '--enable-unsafe-swiftshader',
                    '--no-sandbox',
                ],
        });
        ctx = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            deviceScaleFactor: 1,
        });
        page = await ctx.newPage();
        page.on('pageerror', err => console.error('[BROWSER ERR]', err.message));

        for (const shot of plan) {
            try {
                if (shot.kind === 'video') {
                    const frameDir = await captureVideo(page, shot);
                    if (args.encode) {
                        muxVideo(shot, frameDir);
                        try { rmSync(frameDir, { recursive: true, force: true }); } catch {}
                    } else {
                        console.log(`[CINEMA] [${shot.id}] frames left at ${frameDir}`);
                    }
                } else if (shot.kind === 'static') {
                    await captureStatic(page, shot);
                } else if (shot.kind === 'dog') {
                    await captureDog(page, shot);
                } else if (shot.kind === 'pwa-icon') {
                    await capturePwaIcon(page, shot);
                } else {
                    console.warn(`[CINEMA] [${shot.id}] unknown kind: ${shot.kind}`);
                }
            } catch (err) {
                console.error(`[CINEMA] [${shot.id}] FAILED:`, err.message);
            }
        }
    } finally {
        try { await browser?.close(); } catch {}
        if (vite) { try { vite.kill(); } catch {} }
    }
    console.log('[CINEMA] Done.');
}

main().catch(err => {
    console.error('[CINEMA] FATAL:', err);
    process.exit(1);
});
