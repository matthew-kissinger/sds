/**
 * Content-pack capture runner for the May 2026 Sheep Dog Sim update.
 *
 * Generates shareable videos, screenshots, posters, and a manifest without
 * overwriting canonical OG/PWA assets. The generated media folder is ignored
 * by git; markdown drafts and the repeatable script are the durable artifacts.
 *
 * Usage:
 *   node tools/content-capture.mjs --list
 *   node tools/content-capture.mjs --experimental-run --shot=sdi-hero-overlook
 *   node tools/content-capture.mjs --experimental-run --kind=image
 *   node tools/content-capture.mjs --experimental-run --kind=video --capture=mediabunny
 *   node tools/content-capture.mjs --experimental-run --kind=video --capture=frames
 *   node tools/content-capture.mjs --experimental-run --baseUrl=http://localhost:3000
 *   node tools/content-capture.mjs --experimental-run --headed
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
import { spawn, spawnSync } from 'node:child_process';
import {
    mkdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CAMPAIGN_ID = '2026-05-update';
const OUT_ROOT = resolve(ROOT, 'assets/marketing/content', CAMPAIGN_ID, 'generated');
const VIDEO_OUT = join(OUT_ROOT, 'videos');
const IMAGE_OUT = join(OUT_ROOT, 'images');
const POSTER_OUT = join(OUT_ROOT, 'posters');
const FRAME_OUT = join(OUT_ROOT, 'frames');

const VIDEO_SIZE = { width: 1280, height: 720 };
const IMAGE_SIZE = { width: 1600, height: 900 };
const FPS = 30;

const SEQUENCES = {
    'discord-teaser': [
        'sdi-living-title',
        'sdi-dog-pass-low',
        'sdi-herding-arc',
        'sdi-orbit-flock',
    ],
    'trailer-spike': [
        'sdi-living-title',
        'sdi-dog-pass-low',
        'sdi-herding-arc',
        'sdi-orbit-flock',
        'oc-wide-portal-drive',
    ],
};

const SHOTS = [
    {
        id: 'sdi-living-title',
        kind: 'video',
        title: 'Clean living title world',
        role: 'hook',
        edit: 'open on calm motion, hard cut when dog clears the foreground',
        handlesMs: 300,
        scene: 'rolling-hills',
        startState: 'menu',
        mode: 'classic',
        sun: 0.18,
        durationMs: 6800,
        waitForFlockSize: 200,
        menuHerding: true,
        cameraRig: 'dog-track',
        dogCamera: { side: -8, back: 30, height: 18, lookAhead: 10, lookHeight: 2.4 },
        dogPath: [
            { t: 0, x: -82, z: -38 },
            { t: 1500, x: -62, z: -68 },
            { t: 3100, x: -24, z: -74 },
            { t: 4700, x: 18, z: -52 },
            { t: 6800, x: 40, z: -18 },
        ],
        notes: 'Canvas-only living title shot: start-screen mood, no UI overlay, dog calmly herds through the island world.',
    },
    {
        id: 'sdi-orbit-flock',
        kind: 'video',
        title: 'Sheep Dog Island overhead orbit',
        role: 'scale',
        edit: 'hard cut after dog enters lower third',
        handlesMs: 400,
        scene: 'rolling-hills',
        mode: 'classic',
        sun: 0.10,
        durationMs: 8500,
        waitForFlockSize: 200,
        cameraPath: orbitPath({
            radius: 148,
            height: 72,
            target: { x: 0, y: 6, z: 18 },
            startAngle: -1.15,
            sweep: 1.45,
            segments: 10,
        }),
        dogPath: [
            { t: 0, x: -80, z: -32 },
            { t: 1800, x: -46, z: -64 },
            { t: 3900, x: 12, z: -72 },
            { t: 6100, x: 58, z: -34 },
            { t: 8500, x: 28, z: 42 },
        ],
        notes: 'High angled island orbit with Jep making a natural flank arc behind the flock.',
    },
    {
        id: 'sdi-herding-arc',
        kind: 'video',
        title: 'Wide herding arc around the flock',
        role: 'premise',
        edit: 'cut on dog direction change',
        handlesMs: 300,
        scene: 'rolling-hills',
        mode: 'classic',
        sun: 0.22,
        durationMs: 7600,
        waitForFlockSize: 200,
        cameraPath: [
            { t: 0, pos: { x: -92, y: 34, z: 76 }, target: { x: -6, y: 5, z: -4 } },
            { t: 0.45, pos: { x: -70, y: 31, z: 84 }, target: { x: 6, y: 5, z: -2 } },
            { t: 1, pos: { x: -46, y: 29, z: 92 }, target: { x: 12, y: 5, z: 6 } },
        ],
        dogPath: [
            { t: 0, x: -88, z: -10 },
            { t: 1500, x: -62, z: -58 },
            { t: 3300, x: -12, z: -82 },
            { t: 5300, x: 54, z: -56 },
            { t: 7600, x: 78, z: -6 },
        ],
        notes: 'Readable herding-pattern shot: dog sweeps behind the flock from left flank to right flank.',
    },
    {
        id: 'sdi-dog-pass-low',
        kind: 'video',
        title: 'Dog pass close camera',
        role: 'hook',
        edit: 'open on motion, hard cut before the run settles',
        handlesMs: 250,
        scene: 'rolling-hills',
        mode: 'classic',
        sun: 0.36,
        durationMs: 6800,
        waitForFlockSize: 200,
        cameraRig: 'dog-track',
        dogCamera: { side: -11, back: 10, height: 5.25, lookAhead: 7, lookHeight: 1.6 },
        dogPath: [
            { t: 0, x: -74, z: -48 },
            { t: 1300, x: -64, z: -74 },
            { t: 2800, x: -24, z: -82 },
            { t: 4200, x: 26, z: -58 },
            { t: 5600, x: 58, z: -28 },
            { t: 6800, x: 42, z: 10 },
        ],
        notes: 'Low dog-tracking action shot: Jep sweeps around the flock in a natural herding arc.',
    },
    {
        id: 'oc-wide-portal-drive',
        kind: 'video',
        title: 'Open Country portal drive',
        role: 'variety',
        edit: 'cut from island grass to portal drive line',
        handlesMs: 350,
        scene: 'open-country',
        mode: 'classic',
        sun: 0.52,
        durationMs: 7600,
        waitForFlockSize: 200,
        cameraPath: [
            { t: 0, pos: { x: -120, y: 52, z: 130 }, target: { x: 0, y: 5, z: 40 } },
            { t: 0.45, pos: { x: -65, y: 38, z: 180 }, target: { x: 0, y: 5, z: 120 } },
            { t: 1, pos: { x: 20, y: 26, z: 235 }, target: { x: 0, y: 4, z: 285 } },
        ],
        dogPath: [
            { t: 0, x: -120, z: -70 },
            { t: 2200, x: -70, z: -10 },
            { t: 4800, x: -22, z: 70 },
            { t: 7600, x: 4, z: 145 },
        ],
        notes: 'Bigger Open Country scale and portal-facing drive angle.',
    },
    {
        id: 'sdi-hero-overlook',
        kind: 'image',
        title: 'Sheep Dog Island hero overlook',
        role: 'hero-still',
        scene: 'rolling-hills',
        mode: 'classic',
        sun: 0.12,
        waitForFlockSize: 200,
        camera: { pos: { x: -82, y: 38, z: 94 }, target: { x: 0, y: 5, z: 8 } },
        dogPose: { x: -12, z: -20, velocity: { x: 8, z: 6 } },
        notes: 'Wide devlog hero image: island, water, flock, and dog all visible.',
    },
    {
        id: 'sdi-dog-action',
        kind: 'image',
        title: 'Jep driving the flock',
        role: 'dog-still',
        scene: 'rolling-hills',
        mode: 'classic',
        sun: 0.32,
        waitForFlockSize: 200,
        camera: { pos: { x: -34, y: 10, z: -22 }, target: { x: 12, y: 2.2, z: -4 } },
        dogPose: { x: -6, z: -8, velocity: { x: 12, z: 7 } },
        notes: 'Closer dog action still with terrain and sheep context.',
    },
    {
        id: 'oc-portal-poster',
        kind: 'image',
        title: 'Open Country portal poster',
        role: 'variety-still',
        scene: 'open-country',
        mode: 'classic',
        sun: 0.55,
        waitForFlockSize: 200,
        camera: { pos: { x: -78, y: 32, z: 208 }, target: { x: 0, y: 4, z: 292 } },
        dogPose: { x: -18, z: 104, velocity: { x: 5, z: 12 } },
        notes: 'Portal and scale shot for devlog body copy.',
    },
    {
        id: 'field-grass-scale',
        kind: 'image',
        title: 'Classic field grass scale',
        role: 'fallback-still',
        scene: 'field',
        mode: 'classic',
        sun: 0.50,
        waitForFlockSize: 200,
        camera: { pos: { x: 38, y: 18, z: 45 }, target: { x: 0, y: 1.8, z: -10 } },
        dogPose: { x: 4, z: -22, velocity: { x: -3, z: 12 } },
        notes: 'Fallback context image for the original fenced-field loop.',
    },
];

function parseArgs(argv) {
    const args = {
        baseUrl: 'http://localhost:3000',
        headed: false,
        shot: null,
        kind: null,
        encode: true,
        keepFrames: false,
        capture: 'stream',
        sequence: null,
        fps: FPS,
        list: false,
        experimentalRun: false,
    };
    for (const arg of argv.slice(2)) {
        if (arg === '--headed') args.headed = true;
        else if (arg === '--list') args.list = true;
        else if (arg === '--experimental-run') args.experimentalRun = true;
        else if (arg === '--no-encode') args.encode = false;
        else if (arg === '--keep-frames') args.keepFrames = true;
        else if (arg === '--master') args.capture = 'mediabunny';
        else if (arg === '--proof') args.capture = 'stream';
        else if (arg.startsWith('--shot=')) args.shot = arg.slice('--shot='.length);
        else if (arg.startsWith('--kind=')) args.kind = arg.slice('--kind='.length);
        else if (arg.startsWith('--sequence=')) args.sequence = arg.slice('--sequence='.length);
        else if (arg.startsWith('--baseUrl=')) args.baseUrl = arg.slice('--baseUrl='.length);
        else if (arg.startsWith('--capture=')) args.capture = arg.slice('--capture='.length);
        else if (arg.startsWith('--fps=')) args.fps = Number(arg.slice('--fps='.length));
    }
    if (!['stream', 'frames', 'mediabunny'].includes(args.capture)) {
        throw new Error('--capture must be stream, frames, or mediabunny');
    }
    if (!Number.isFinite(args.fps) || args.fps <= 0) {
        throw new Error('--fps must be a positive number');
    }
    if (args.sequence && !SEQUENCES[args.sequence]) {
        throw new Error(`Unknown sequence "${args.sequence}". Known: ${Object.keys(SEQUENCES).join(', ')}`);
    }
    return args;
}

function ensureFfmpeg() {
    const result = spawnSync('ffmpeg', ['-version'], {
        encoding: 'utf8',
        shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
        throw new Error('ffmpeg is not on PATH');
    }
    console.log(`[CONTENT] ${(result.stdout || '').split('\n')[0].trim()}`);
}

async function ensureVite(baseUrl) {
    try {
        const probe = await fetch(baseUrl, { method: 'HEAD' });
        if (probe.ok || probe.status === 404) {
            console.log('[CONTENT] Vite already running');
            return null;
        }
    } catch {}

    console.log('[CONTENT] Starting Vite on 127.0.0.1:3000');
    const proc = spawn('npx', ['vite', '--port', '3000', '--host', '127.0.0.1'], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        env: { ...process.env, FORCE_COLOR: '0' },
    });
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', () => {});

    const start = Date.now();
    while (Date.now() - start < 60000) {
        try {
            const probe = await fetch(baseUrl, { method: 'HEAD' });
            if (probe.ok || probe.status === 404) {
                console.log('[CONTENT] Vite ready');
                return proc;
            }
        } catch {}
        await wait(500);
    }
    try { proc.kill(); } catch {}
    throw new Error('Vite start timeout');
}

function shotUrl(shot, baseUrl) {
    const params = new URLSearchParams();
    params.set('scene', shot.scene);
    params.set('cinematic', '1');
    params.set('ui', 'off');
    params.set('sun', String(shot.sun ?? 0.5));
    return `${baseUrl}/?${params.toString()}`;
}

async function canvasShot(page, type = 'image/png', quality = undefined) {
    const dataUrl = await page.evaluate(({ t, q }) => {
        const canvas = document.querySelector('#canvas-container canvas');
        if (!canvas) throw new Error('canvas not found');
        return canvas.toDataURL(t, q);
    }, { t: type, q: quality });
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

async function openPage(browser, viewport, options = {}) {
    const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        ...options,
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.error('[PAGE ERROR]', err.message));
    page.on('console', (msg) => {
        if (['error', 'warning'].includes(msg.type())) {
            console.log(`[PAGE ${msg.type()}] ${msg.text()}`);
        }
    });
    return { context, page };
}

async function prepareShot(page, shot, baseUrl, size) {
    await page.setViewportSize(size);
    await page.goto(shotUrl(shot, baseUrl), { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 60000 });
    await page.evaluate(() => window.__sdsCinema.waitReady(90000));
    await page.evaluate((s) => {
        const c = window.__sdsCinema;
        c.hideUI();
        c.setSun(s.sun ?? 0.5);
        if (s.startState === 'menu') {
            c.mountMenuDog?.();
        } else {
            c.startSolo('jep', s.mode || 'classic');
        }
        c.freeFlyActive = s.cameraRig !== 'follow';
        if (s.cameraRig === 'follow') {
            c.setCameraMode?.('follow');
            c.setCameraZoom?.(s.followZoom || 16);
            c.resetFollowCamera?.();
        }
    }, shot);
    await page.evaluate(() => window.__sdsCinema.waitReady(90000));

    if (shot.waitForFlockSize) {
        try {
            await page.evaluate(
                (target) => window.__sdsCinema.waitForFlockSize(target, 45000),
                shot.waitForFlockSize,
            );
        } catch (err) {
            console.warn(`[CONTENT] [${shot.id}] flock wait failed: ${err.message}`);
        }
    }
    await wait(1200);
}

async function setFramePose(page, shot, tMs, dt) {
    await page.evaluate(({ s, t, delta }) => {
        const c = window.__sdsCinema;
        c.hideUI();
        c.setSun(s.sun ?? 0.5);
        if (s.dogPath) {
            c.poseDogOnPath(s.dogPath, t, delta);
        } else if (s.dogPose) {
            c.poseDog(s.dogPose.x, s.dogPose.z, s.dogPose.velocity || { x: 0, z: 0 }, delta);
        }
        if (s.menuHerding) {
            c.tickMenuHerding?.(delta);
        }
        if (s.cameraRig === 'follow') {
            c.updateFollowCamera?.(delta, s.followZoom || 16);
        } else if (s.cameraRig === 'dog-track') {
            c.setDogTrackCamera?.(s.dogCamera || {});
        } else {
            c.freeFlyActive = true;
            if (s.cameraPath) {
                const pose = sampleCamera(s.cameraPath, t);
                c.setCameraPose(pose.pos, pose.target);
            } else if (s.camera) {
                c.setCameraPose(s.camera.pos, s.camera.target);
            }
        }

        function sampleCamera(path, tMs) {
            const duration = Math.max(1, s.durationMs || path[path.length - 1].t || 1);
            const normalized = Math.max(0, Math.min(1, tMs / duration));
            let a = path[0];
            let b = path[path.length - 1];
            for (let i = 0; i < path.length - 1; i++) {
                if (normalized >= path[i].t && normalized <= path[i + 1].t) {
                    a = path[i];
                    b = path[i + 1];
                    break;
                }
            }
            const span = Math.max(0.0001, b.t - a.t);
            const k = Math.max(0, Math.min(1, (normalized - a.t) / span));
            const sk = k * k * (3 - 2 * k);
            return {
                pos: lerpVec(a.pos, b.pos, sk),
                target: lerpVec(a.target, b.target, sk),
            };
        }

        function lerpVec(a, b, k) {
            return {
                x: a.x + (b.x - a.x) * k,
                y: a.y + (b.y - a.y) * k,
                z: a.z + (b.z - a.z) * k,
            };
        }
    }, { s: shot, t: tMs, delta: dt });
}

async function captureVideo(browser, shot, baseUrl, manifest, options) {
    if (options.capture === 'mediabunny') {
        return captureVideoMediabunny(browser, shot, baseUrl, manifest, options);
    }
    if (options.capture === 'frames') {
        return captureVideoFrames(browser, shot, baseUrl, manifest, options);
    }
    return captureVideoStream(browser, shot, baseUrl, manifest, options);
}

async function captureVideoMediabunny(browser, shot, baseUrl, manifest, options) {
    mkdirSync(VIDEO_OUT, { recursive: true });
    mkdirSync(POSTER_OUT, { recursive: true });
    const mp4Path = join(VIDEO_OUT, `${shot.id}.mp4`);
    const { context, page } = await openPage(browser, VIDEO_SIZE);
    try {
        await prepareShot(page, shot, baseUrl, VIDEO_SIZE);
        await setFramePose(page, shot, 0, 1 / options.fps);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

        console.log(`[CONTENT] [${shot.id}] recording browser-side MP4 with Mediabunny`);
        const recording = await withTimeout(
            page.evaluate(async ({ s, fps }) => {
                const module = await import('/js/capture/mediabunny-recorder.js');
                return module.recordSdsShotToMp4({
                    cinema: window.__sdsCinema,
                    shot: s,
                    fps,
                });
            }, { s: shot, fps: options.fps }),
            Math.max(60000, shot.durationMs * 20),
            `[${shot.id}] Mediabunny capture timeout`,
        );

        writeFileSync(mp4Path, Buffer.from(recording.base64, 'base64'));
        if (recording.bytes < 10000) {
            throw new Error(`Mediabunny returned only ${recording.bytes} bytes`);
        }

        manifest.assets.push(assetEntry(shot, 'video', mp4Path, {
            capture: 'mediabunny',
            fps: options.fps,
            frameCount: recording.frameCount,
            durationMs: recording.durationMs,
            codec: recording.codec,
            container: recording.container,
            width: recording.width,
            height: recording.height,
        }));

        await setFramePose(page, shot, shot.durationMs * 0.42, 1 / options.fps);
        await wait(250);
        const posterPath = join(POSTER_OUT, `${shot.id}.webp`);
        await sharp(await canvasShot(page))
            .webp({ quality: 84, effort: 6 })
            .toFile(posterPath);
        manifest.assets.push(assetEntry(shot, 'poster', posterPath));
    } finally {
        await context.close();
    }
}

async function captureVideoStream(browser, shot, baseUrl, manifest, options) {
    mkdirSync(VIDEO_OUT, { recursive: true });
    mkdirSync(POSTER_OUT, { recursive: true });
    const webmPath = join(VIDEO_OUT, `${shot.id}.webm`);
    const { context, page } = await openPage(browser, VIDEO_SIZE);
    try {
        await prepareShot(page, shot, baseUrl, VIDEO_SIZE);
        await setFramePose(page, shot, 0, 1 / options.fps);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

        console.log(`[CONTENT] [${shot.id}] recording canvas stream`);
        const recording = await recordCanvasStream(page, shot, options.fps);
        writeFileSync(webmPath, Buffer.from(recording.base64, 'base64'));
        if (recording.bytes < 10000) {
            throw new Error(`MediaRecorder returned only ${recording.bytes} bytes`);
        }
        manifest.assets.push(assetEntry(shot, 'video-webm', webmPath, {
            capture: 'stream',
            mimeType: recording.mimeType,
            fps: options.fps,
        }));

        await setFramePose(page, shot, shot.durationMs * 0.42, 1 / FPS);
        await wait(250);
        const posterPath = join(POSTER_OUT, `${shot.id}.webp`);
        await sharp(await canvasShot(page))
            .webp({ quality: 84, effort: 6 })
            .toFile(posterPath);
        manifest.assets.push(assetEntry(shot, 'poster', posterPath));
        if (options.encode) {
            const mp4Path = join(VIDEO_OUT, `${shot.id}.mp4`);
            transcodeWebm(webmPath, mp4Path);
            manifest.assets.push(assetEntry(shot, 'video', mp4Path, {
                capture: 'stream',
                fps: options.fps,
            }));
        }
    } finally {
        await context.close();
    }
}

async function captureVideoFrames(browser, shot, baseUrl, manifest, options) {
    mkdirSync(VIDEO_OUT, { recursive: true });
    mkdirSync(POSTER_OUT, { recursive: true });
    mkdirSync(FRAME_OUT, { recursive: true });

    const frameDir = join(FRAME_OUT, shot.id);
    rmSync(frameDir, { recursive: true, force: true });
    mkdirSync(frameDir, { recursive: true });

    const { context, page } = await openPage(browser, VIDEO_SIZE);
    try {
        await prepareShot(page, shot, baseUrl, VIDEO_SIZE);
        const frameCount = Math.ceil((shot.durationMs / 1000) * options.fps);
        const interval = 1000 / options.fps;
        console.log(`[CONTENT] [${shot.id}] writing ${frameCount} JPEG frames @ ${options.fps}fps`);

        for (let i = 0; i < frameCount; i++) {
            const tMs = i * interval;
            await setFramePose(page, shot, tMs, 1 / options.fps);
            await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const frame = await canvasShot(page, 'image/jpeg', 0.92);
            writeFileSync(join(frameDir, `frame_${String(i).padStart(4, '0')}.jpg`), frame);
        }

        await setFramePose(page, shot, shot.durationMs * 0.42, 1 / options.fps);
        await wait(250);
        const posterPath = join(POSTER_OUT, `${shot.id}.webp`);
        await sharp(await canvasShot(page))
            .webp({ quality: 84, effort: 6 })
            .toFile(posterPath);
        manifest.assets.push(assetEntry(shot, 'poster', posterPath));
    } finally {
        await context.close();
    }

    if (options.encode) {
        const mp4Path = join(VIDEO_OUT, `${shot.id}.mp4`);
        muxFrames(frameDir, mp4Path, options.fps);
        manifest.assets.push(assetEntry(shot, 'video', mp4Path, {
            capture: 'frames',
            fps: options.fps,
        }));
        if (!options.keepFrames) {
            rmSync(frameDir, { recursive: true, force: true });
        }
    }
}

async function captureImage(browser, shot, baseUrl, manifest) {
    const { context, page } = await openPage(browser, IMAGE_SIZE);
    try {
        await prepareShot(page, shot, baseUrl, IMAGE_SIZE);
        await setFramePose(page, shot, 0, 1 / FPS);
        await wait(250);
        await setFramePose(page, shot, 0, 1 / FPS);
        await wait(250);

        mkdirSync(IMAGE_OUT, { recursive: true });
        const png = await canvasShot(page);
        const pngPath = join(IMAGE_OUT, `${shot.id}.png`);
        const webpPath = join(IMAGE_OUT, `${shot.id}.webp`);
        writeFileSync(pngPath, png);
        await sharp(png).webp({ quality: 86, effort: 6 }).toFile(webpPath);
        manifest.assets.push(assetEntry(shot, 'image-png', pngPath));
        manifest.assets.push(assetEntry(shot, 'image-webp', webpPath));
    } finally {
        await context.close();
    }
}

async function recordCanvasStream(page, shot, fps) {
    return page.evaluate(async ({ s, fps: captureFps }) => {
        const canvas = document.querySelector('#canvas-container canvas');
        if (!canvas) throw new Error('canvas not found');
        if (typeof canvas.captureStream !== 'function') {
            throw new Error('canvas.captureStream unavailable');
        }
        if (typeof MediaRecorder === 'undefined') {
            throw new Error('MediaRecorder unavailable');
        }

        const mimeType = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
        ].find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';

        const stream = canvas.captureStream(captureFps);
        const chunks = [];
        const recorder = new MediaRecorder(stream, {
            ...(mimeType ? { mimeType } : {}),
            videoBitsPerSecond: 9000000,
        });
        const stopped = new Promise((resolve, reject) => {
            recorder.ondataavailable = (event) => {
                if (event.data?.size) chunks.push(event.data);
            };
            recorder.onerror = () => reject(new Error(recorder.error?.message || 'MediaRecorder failed'));
            recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
        });

        recorder.start(250);
        const start = performance.now();
        let rafId = 0;

        await new Promise((resolve) => {
            const tick = () => {
                const t = Math.min(s.durationMs, performance.now() - start);
                applyPose(s, t, 1 / captureFps);
                if (t < s.durationMs) {
                    rafId = requestAnimationFrame(tick);
                } else {
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                }
            };
            rafId = requestAnimationFrame(tick);
        });

        cancelAnimationFrame(rafId);
        recorder.requestData?.();
        recorder.stop();
        const blob = await stopped;
        stream.getTracks().forEach((track) => track.stop());
        const base64 = await blobToBase64(blob);
        return {
            base64,
            bytes: blob.size,
            mimeType: mimeType || 'video/webm',
        };

        function applyPose(shot, tMs, delta) {
            const c = window.__sdsCinema;
            c.hideUI();
            c.setSun(shot.sun ?? 0.5);
            if (shot.dogPath) {
                c.poseDogOnPath(shot.dogPath, tMs, delta);
            } else if (shot.dogPose) {
                c.poseDog(shot.dogPose.x, shot.dogPose.z, shot.dogPose.velocity || { x: 0, z: 0 }, delta);
            }
            if (shot.menuHerding) {
                c.tickMenuHerding?.(delta);
            }
            if (shot.cameraRig === 'follow') {
                c.updateFollowCamera?.(delta, shot.followZoom || 16);
            } else if (shot.cameraRig === 'dog-track') {
                c.setDogTrackCamera?.(shot.dogCamera || {});
            } else {
                c.freeFlyActive = true;
                if (shot.cameraPath) {
                    const pose = sampleCamera(shot.cameraPath, tMs, shot.durationMs);
                    c.setCameraPose(pose.pos, pose.target);
                } else if (shot.camera) {
                    c.setCameraPose(shot.camera.pos, shot.camera.target);
                }
            }
        }

        function sampleCamera(path, tMs, durationMs) {
            const normalized = Math.max(0, Math.min(1, tMs / Math.max(1, durationMs)));
            let a = path[0];
            let b = path[path.length - 1];
            for (let i = 0; i < path.length - 1; i++) {
                if (normalized >= path[i].t && normalized <= path[i + 1].t) {
                    a = path[i];
                    b = path[i + 1];
                    break;
                }
            }
            const span = Math.max(0.0001, b.t - a.t);
            const k = Math.max(0, Math.min(1, (normalized - a.t) / span));
            const sk = k * k * (3 - 2 * k);
            return {
                pos: lerpVec(a.pos, b.pos, sk),
                target: lerpVec(a.target, b.target, sk),
            };
        }

        function lerpVec(a, b, k) {
            return {
                x: a.x + (b.x - a.x) * k,
                y: a.y + (b.y - a.y) * k,
                z: a.z + (b.z - a.z) * k,
            };
        }
        async function blobToBase64(blob) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
            }
            return btoa(binary);
        }
    }, { s: shot, fps });
}

function transcodeWebm(webmPath, outPath) {
    const result = spawnSync('ffmpeg', [
        '-y',
        '-i', webmPath,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-crf', '21',
        '-preset', 'medium',
        '-movflags', '+faststart',
        outPath,
    ], {
        stdio: ['ignore', 'inherit', 'inherit'],
        shell: process.platform === 'win32',
    });
    if (result.status !== 0) throw new Error(`ffmpeg failed for ${outPath}`);
}

function muxFrames(frameDir, outPath, fps) {
    const result = spawnSync('ffmpeg', [
        '-y',
        '-framerate', String(fps),
        '-i', join(frameDir, 'frame_%04d.jpg'),
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-crf', '18',
        '-preset', 'medium',
        '-movflags', '+faststart',
        outPath,
    ], {
        stdio: ['ignore', 'inherit', 'inherit'],
        shell: process.platform === 'win32',
    });
    if (result.status !== 0) throw new Error(`ffmpeg failed for ${outPath}`);
}

function assetEntry(shot, type, absPath, extra = {}) {
    return {
        shot: shot.id,
        title: shot.title,
        type,
        role: shot.role || null,
        edit: shot.edit || null,
        scene: shot.scene,
        path: absPath,
        bytes: statSync(absPath).size,
        notes: shot.notes,
        ...extra,
    };
}

function orbitPath({ radius, height, target, startAngle = 0, sweep = Math.PI * 2, segments = 8 }) {
    const path = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const theta = startAngle + sweep * t;
        path.push({
            t,
            pos: {
                x: target.x + Math.cos(theta) * radius,
                y: target.y + height,
                z: target.z + Math.sin(theta) * radius,
            },
            target,
        });
    }
    return path;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const args = parseArgs(process.argv);
    let plan = SHOTS;
    if (args.sequence) {
        const ids = new Set(SEQUENCES[args.sequence]);
        plan = plan.filter((shot) => ids.has(shot.id));
    }
    if (args.shot) plan = plan.filter((shot) => shot.id === args.shot);
    if (args.kind) plan = plan.filter((shot) => shot.kind === args.kind);
    if (plan.length === 0) throw new Error('No shots matched the requested filters');

    if (args.list || !args.experimentalRun) {
        if (!args.experimentalRun) {
            console.log('[CONTENT] Capture execution is paused pending the capture-lab redesign.');
            console.log('[CONTENT] Pass --experimental-run only when intentionally testing the current prototype.');
        }
        for (const shot of plan) {
            console.log(`${shot.id}\t${shot.kind}\t${shot.scene}\t${shot.role || '-'}\t${shot.title}`);
        }
        return;
    }

    if (args.encode) ensureFfmpeg();
    mkdirSync(OUT_ROOT, { recursive: true });

    const manifest = {
        campaign: CAMPAIGN_ID,
        generatedAt: new Date().toISOString(),
        baseUrl: args.baseUrl,
        assets: [],
    };

    const vite = await ensureVite(args.baseUrl);
    let browser;
    try {
        browser = await chromium.launch({
            headless: !args.headed,
            args: args.headed
                ? ['--enable-webgl', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']
                : ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
        });
        for (const shot of plan) {
            console.log(`[CONTENT] Capturing ${shot.id}`);
            if (shot.kind === 'video') {
                await captureVideo(browser, shot, args.baseUrl, manifest, args);
            } else if (shot.kind === 'image') {
                await captureImage(browser, shot, args.baseUrl, manifest);
            }
        }
    } finally {
        try { await browser?.close(); } catch {}
        stopProcessTree(vite);
    }

    writeFileSync(join(OUT_ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`[CONTENT] Wrote ${join(OUT_ROOT, 'manifest.json')}`);
}

main().catch((err) => {
    console.error('[CONTENT] FATAL:', err);
    process.exit(1);
});

function stopProcessTree(proc) {
    if (!proc) return;
    if (process.platform === 'win32') {
        try {
            spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
                stdio: 'ignore',
            });
            return;
        } catch {}
    }
    try { proc.kill(); } catch {}
}

function withTimeout(promise, timeoutMs, message) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}
