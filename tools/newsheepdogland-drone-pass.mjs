// SPDX-License-Identifier: AGPL-3.0-or-later
// Newsheepdogland aerial drone pass on the WebGPU flagship path.
//
// Relies on the Cycle 8X cinematic-rig fix: cinema.renderFrame() now re-centers
// the sky dome on the cinematic camera each frame (atmosphere.syncCamera was
// short-circuited by cinema.paused before), so a moving aerial camera renders a
// correct dusk sky instead of stranding the 500-unit dome at the spawn.
//
// Usage (needs a production preview on the WebGPU path):
//   npm run build
//   SDS_SUPPRESS_BROWSER_OPEN=1 npx vite preview --host 127.0.0.1 --port 4173
//   node tools/newsheepdogland-drone-pass.mjs            # path-preview contact sheet
//   node tools/newsheepdogland-drone-pass.mjs --video    # full mp4 + hero frame
//   node tools/newsheepdogland-drone-pass.mjs --video --tod=0.78 --duration=10000

import { chromium } from 'playwright';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT_DIR = resolve(ROOT, 'hero-recapture', 'drone');
const FRAME_DIR = resolve(OUT_DIR, 'frames');
const BASE_URL = argValue('--base-url') ?? 'http://127.0.0.1:4173/';
const TOD = Number(argValue('--tod') ?? 0.80);
const DURATION_MS = Number(argValue('--duration') ?? 9000);
const FPS = Number(argValue('--fps') ?? 30);
const WANT_VIDEO = process.argv.includes('--video');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--hide-scrollbars']
    : ['--no-sandbox', '--hide-scrollbars'];

// Aerial "reveal" arc over the boot-shaped island: start low over the SE water
// with the homestead + foot lowland ahead, climb north up the leg, finish high
// sweeping toward the 120 m northern mountain (peak ~ -616, 1110). Camera Y stays
// well clear of terrain (foot ~5-12 m, mountain peak 120 m). Sun is low at dusk.
const PATH = [
    { t: 0.00, pos: { x: 960, y: 38, z: -1255 }, target: { x: 470, y: 14, z: -1050 } },
    { t: 0.32, pos: { x: 470, y: 110, z: -860 }, target: { x: -120, y: 42, z: -280 } },
    { t: 0.66, pos: { x: -40, y: 210, z: -150 }, target: { x: -520, y: 90, z: 640 } },
    { t: 1.00, pos: { x: -340, y: 300, z: 250 }, target: { x: -616, y: 70, z: 1100 } },
];

// Dog walking near the homestead so there is some life if the camera passes over.
const DOG = { x: 600, z: -1004, velocity: { x: -1.4, z: 0.3 } };

function argValue(name) {
    const prefix = `${name}=`;
    const hit = process.argv.find((arg) => arg.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : null;
}

function buildUrl() {
    const url = new URL(BASE_URL);
    url.searchParams.set('renderer', 'webgpu');
    url.searchParams.set('scene', 'newsheepdogland');
    url.searchParams.set('cinematic', '1');
    url.searchParams.set('probeRender', '1');
    url.searchParams.set('ui', 'off');
    return url.toString();
}

function samplePath(t) {
    const kfs = PATH;
    let a = kfs[0], b = kfs[kfs.length - 1];
    for (let i = 0; i < kfs.length - 1; i++) {
        if (t >= kfs[i].t && t <= kfs[i + 1].t) { a = kfs[i]; b = kfs[i + 1]; break; }
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

async function applyFrame(page, t) {
    const frame = samplePath(t);
    await page.evaluate(({ f, sun, dog }) => {
        const c = window.__sdsCinema;
        if (!c) return;
        c.hideUI?.();
        c.pauseSimulation?.();
        c.freeFlyActive = true;
        c.setSun?.(sun);
        c.poseDog?.(dog.x, dog.z, dog.velocity, 1 / 60);
        c.setCameraPose?.(f.pos, f.target);
        c.renderFrame?.(); // re-centers the sky dome on the cinematic camera
    }, { f: frame, sun: TOD, dog: DOG });
}

async function shot(page, path) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try { await page.screenshot({ path, type: 'png', fullPage: false }); return; }
        catch (err) { if (attempt === 2) throw err; await page.waitForTimeout(120); }
    }
}

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

async function buildContactSheet(stills) {
    const TW = 620, TH = 349, LABEL = 26, GAP = 6, cols = stills.length;
    const sheetW = cols * (TW + GAP) + GAP, sheetH = TH + LABEL + 2 * GAP;
    const comps = [];
    for (let i = 0; i < stills.length; i++) {
        const x = GAP + i * (TW + GAP);
        const tile = await sharp(stills[i].path).resize(TW, TH, { fit: 'cover' }).png().toBuffer();
        comps.push({ input: tile, left: x, top: GAP + LABEL });
        const svg = Buffer.from(`<svg width="${TW}" height="${LABEL}"><rect width="100%" height="100%" fill="#11161d"/><text x="8" y="18" font-family="monospace" font-size="14" fill="#cfe">t=${stills[i].t.toFixed(2)}  pathPreview</text></svg>`);
        comps.push({ input: svg, left: x, top: GAP });
    }
    const sheet = sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#000' } });
    await sheet.composite(comps).png().toFile(resolve(OUT_DIR, 'path-preview.png'));
}

async function run() {
    await rm(OUT_DIR, { recursive: true, force: true }).catch(() => {});
    await mkdir(FRAME_DIR, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
    const summary = { url: buildUrl(), tod: TOD, mode: WANT_VIDEO ? 'video' : 'preview', startedAt: new Date().toISOString(), consoleErrors: [] };
    let page;
    try {
        page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        page.on('console', (m) => { if (m.type() === 'error') summary.consoleErrors.push(m.text()); });
        page.on('pageerror', (e) => summary.consoleErrors.push(e.message));
        await page.goto(summary.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForFunction(() => Boolean(window.__sdsCinema), null, { timeout: 90_000 });
        await page.evaluate(() => window.__sdsCinema.waitReady?.(90_000));
        await page.waitForFunction(
            () => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true,
            null, { timeout: 120_000 },
        ).catch(() => {});
        await page.waitForTimeout(4_000);
        summary.preflight = await page.evaluate(() => ({
            scene: window.gameInstance?.currentScene?.id ?? null,
            effective: window.__sdsRendererMode?.effective ?? null,
            rendererReady: window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady ?? null,
        }));
        await hideNonCanvasUi(page);

        if (!WANT_VIDEO) {
            const stills = [];
            for (const t of [0, 0.25, 0.5, 0.75, 1]) {
                await applyFrame(page, t);
                await page.waitForTimeout(180);
                await applyFrame(page, t); // second pass: settle pose + sky
                const p = resolve(OUT_DIR, `preview-t${t.toFixed(2)}.png`);
                await shot(page, p);
                stills.push({ t, path: p });
            }
            await buildContactSheet(stills);
            summary.stills = stills.length;
        } else {
            const frames = Math.ceil((DURATION_MS / 1000) * FPS);
            for (let i = 0; i < frames; i++) {
                const t = frames <= 1 ? 0 : i / (frames - 1);
                await applyFrame(page, t);
                await shot(page, join(FRAME_DIR, `${String(i).padStart(4, '0')}.png`));
            }
            summary.frames = frames;
            // Mux to mp4 (1080p H.264) + a 720p variant.
            const mp4 = resolve(OUT_DIR, 'drone-pass.mp4');
            const mux = spawnSync('ffmpeg', [
                '-y', '-framerate', String(FPS), '-i', join(FRAME_DIR, '%04d.png'),
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'medium',
                '-movflags', '+faststart', mp4,
            ], { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' });
            summary.muxStatus = mux.status;
            // Hero frame ~55% through the arc (over the foot, mountain rising).
            const heroIdx = Math.floor(frames * 0.55);
            const heroSrc = join(FRAME_DIR, `${String(heroIdx).padStart(4, '0')}.png`);
            await sharp(heroSrc).resize(1920, 1080).webp({ quality: 84, effort: 6 }).toFile(resolve(OUT_DIR, 'drone-hero.webp'));
            summary.heroFrame = heroIdx;
        }
    } finally {
        if (page) await page.close().catch(() => {});
        await browser.close().catch(() => {});
        summary.endedAt = new Date().toISOString();
        await writeFile(resolve(OUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    }
    console.log(JSON.stringify(summary, null, 2));
}

run().catch((err) => { console.error(err); process.exit(1); });
