// SPDX-License-Identifier: AGPL-3.0-or-later
// Newsheepdogland entrance hero, matching the other entrance shots' convention:
// the dog at a 3/4 rear angle (close, large in frame) on the grass a few paces
// back from the shore, gazing north across the bay toward the mountain, dusk sky.
//
// Uses cinema.setDogTrackCamera (a follow-style rig with a lateral offset) so the
// dog reads at 3/4 like rolling-hills.webp, while the camera still looks toward
// the mountain. renderFrame() re-centers the sky dome on the cinematic camera.
//
//   npm run build
//   SDS_SUPPRESS_BROWSER_OPEN=1 npx vite preview --host 127.0.0.1 --port 4173
//   node tools/newsheepdogland-hero-final.mjs                  # contact sheet
//   node tools/newsheepdogland-hero-final.mjs --final=L-t0.78  # encode webp

import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT_DIR = resolve(ROOT, 'hero-recapture', 'final');
const BASE_URL = argValue('--base-url') ?? 'http://127.0.0.1:4173/';
const FINAL = argValue('--final');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--hide-scrollbars']
    : ['--no-sandbox', '--hide-scrollbars'];

// Dog a few paces back from the instep shore (on grass), facing the northern
// mountain (peak ~ -616, 1110). The track camera's side offset gives the 3/4.
const DOG_POS = { x: 624, z: -888 };
const MOUNTAIN = { x: -616, z: 1110 };

// Candidate framings: L/R 3/4 sides x dusk times. back/height/lookAhead tuned for
// a rolling-hills-like close hero (dog ~30% of frame).
const CAM = { back: 8.5, height: 3.2, lookAhead: 16, lookHeight: 1.3 };
const VARIANTS = [
    { name: 'L-t0.76', side: -8, tod: 0.76 },
    { name: 'L-t0.80', side: -8, tod: 0.80 },
    { name: 'R-t0.78', side: 8, tod: 0.78 },
    { name: 'L-t0.84', side: -8, tod: 0.84 },
];

function argValue(name) {
    const prefix = `${name}=`;
    const hit = process.argv.find((a) => a.startsWith(prefix));
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

function dogVelTowardMountain() {
    const dx = MOUNTAIN.x - DOG_POS.x, dz = MOUNTAIN.z - DOG_POS.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len };
}

async function settle(page, variant) {
    const vel = dogVelTowardMountain();
    await page.evaluate(({ dog, vel, v, cam }) => {
        const c = window.__sdsCinema;
        if (!c) return;
        c.hideUI?.();
        c.hideWorldMarkers?.();
        c.pauseSimulation?.();
        c.setSun?.(v.tod);
        c.mountMenuDog?.();
        c.poseDog?.(dog.x, dog.z, vel, 1 / 60);
        c.setDogTrackCamera?.({ side: v.side, back: cam.back, height: cam.height, lookAhead: cam.lookAhead, lookHeight: cam.lookHeight });
        const scene = c.scene;
        if (scene) scene.traverse((o) => { if (o.isSprite) o.visible = false; });
        c.renderFrame?.();
    }, { dog: DOG_POS, vel, v: variant, cam: CAM });
    // Re-assert a few frames so the pose + sky fully settle.
    for (let i = 0; i < 5; i++) {
        await page.evaluate(({ dog, vel, v, cam }) => {
            const c = window.__sdsCinema;
            c.poseDog?.(dog.x, dog.z, vel, 1 / 60);
            c.setDogTrackCamera?.({ side: v.side, back: cam.back, height: cam.height, lookAhead: cam.lookAhead, lookHeight: cam.lookHeight });
            c.renderFrame?.();
        }, { dog: DOG_POS, vel, v: variant, cam: CAM });
        await page.waitForTimeout(70);
    }
}

async function hideNonCanvasUi(page) {
    await page.evaluate(() => {
        const cs = Array.from(document.querySelectorAll('canvas'));
        const main = cs.map((c) => ({ c, a: c.clientWidth * c.clientHeight })).sort((x, y) => y.a - x.a)[0]?.c ?? null;
        const keep = new Set();
        for (let n = main; n; n = n.parentElement) keep.add(n);
        for (const el of Array.from(document.querySelectorAll('body *'))) {
            if (!keep.has(el)) { el.style.visibility = 'hidden'; el.style.pointerEvents = 'none'; }
        }
    });
}

async function shot(page, path) {
    for (let a = 0; a < 3; a++) {
        try { await page.screenshot({ path, type: 'png', fullPage: false }); return; }
        catch { await page.waitForTimeout(120); }
    }
    await page.screenshot({ path, type: 'png', fullPage: false });
}

async function contactSheet(shots) {
    const TW = 700, TH = 394, LABEL = 26, GAP = 6, cols = 2;
    const rows = Math.ceil(shots.length / cols);
    const cellW = TW + GAP, cellH = TH + LABEL + GAP, comps = [];
    for (let i = 0; i < shots.length; i++) {
        const x = GAP + (i % cols) * cellW, y = GAP + ((i / cols) | 0) * cellH;
        const tile = await sharp(shots[i].path).resize(TW, TH, { fit: 'cover' }).png().toBuffer();
        comps.push({ input: tile, left: x, top: y + LABEL });
        const svg = Buffer.from(`<svg width="${TW}" height="${LABEL}"><rect width="100%" height="100%" fill="#11161d"/><text x="8" y="18" font-family="monospace" font-size="14" fill="#cfe">${shots[i].name}</text></svg>`);
        comps.push({ input: svg, left: x, top: y });
    }
    const sheet = sharp({ create: { width: cols * cellW + GAP, height: rows * cellH + GAP, channels: 3, background: '#000' } });
    await sheet.composite(comps).png().toFile(resolve(OUT_DIR, 'final-contact-sheet.png'));
}

async function run() {
    await rm(OUT_DIR, { recursive: true, force: true }).catch(() => {});
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
    const summary = { url: buildUrl(), dog: DOG_POS, startedAt: new Date().toISOString(), consoleErrors: [], shots: [] };
    let page;
    try {
        page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        page.on('console', (m) => { if (m.type() === 'error') summary.consoleErrors.push(m.text()); });
        page.on('pageerror', (e) => summary.consoleErrors.push(e.message));
        await page.goto(summary.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForFunction(() => Boolean(window.__sdsCinema), null, { timeout: 90_000 });
        await page.evaluate(() => window.__sdsCinema.waitReady?.(90_000));
        await page.waitForFunction(() => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true, null, { timeout: 120_000 }).catch(() => {});
        await page.waitForTimeout(4_000);
        summary.preflight = await page.evaluate(() => ({ scene: window.gameInstance?.currentScene?.id ?? null, effective: window.__sdsRendererMode?.effective ?? null }));
        await hideNonCanvasUi(page);

        const toRun = FINAL ? VARIANTS.filter((v) => v.name === FINAL) : VARIANTS;
        for (const v of toRun) {
            await settle(page, v);
            await hideNonCanvasUi(page);
            const path = resolve(OUT_DIR, `${v.name}.png`);
            await shot(page, path);
            summary.shots.push({ name: v.name, path });
        }
        if (summary.shots.length > 1) await contactSheet(summary.shots);

        if (FINAL) {
            const src = resolve(OUT_DIR, `${FINAL}.png`);
            const out = resolve(OUT_DIR, 'newsheepdogland.webp');
            await sharp(src).resize(1920, 1080).webp({ quality: 84, effort: 6 }).toFile(out);
            summary.finalWebp = out;
        }
    } finally {
        if (page) await page.close().catch(() => {});
        await browser.close().catch(() => {});
        summary.endedAt = new Date().toISOString();
        await writeFile(resolve(OUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    }
    console.log(JSON.stringify({ shots: summary.shots.length, errors: summary.consoleErrors.length, preflight: summary.preflight }, null, 2));
}

run().catch((e) => { console.error(e); process.exit(1); });
