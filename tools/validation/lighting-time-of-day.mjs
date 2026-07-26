// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 120 - what the scene's lights actually do, on a genuine WebGPU session.
 *
 * Three questions, one browser pass:
 *
 *  1. Does the production directional track time of day? Reads the live light
 *     out of the scene graph at noon, golden hour and night, on all four biomes.
 *  2. Does Cycle 115's dusk lamp fire? Reads the farmhouse lantern's
 *     `emissiveIntensity` off the material the renderer is using, and shoots a
 *     close-up so it is observed rather than inferred.
 *  3. Is the island terrain's near-black read a lighting defect or an albedo
 *     one? Samples terrain-only and grass-heavy pixels at each hour and reports
 *     the ratio, so "the light was frozen" can be confirmed or ruled out.
 *
 * Runs against the dev server on :3000, on installed Chrome headed with WebGPU
 * enabled - headless Chromium has no `navigator.gpu` and silently demotes to
 * WebGL (Cycle 103 P1). `assertWebGpuEngaged` fails closed.
 *
 *   node tools/validation/lighting-time-of-day.mjs [--out=<dir>]
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE_URL = 'http://localhost:3000/';
const VIEWPORT = { width: 1280, height: 720 };
const WEBGPU_LAUNCH_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];

const HOURS = [
    { name: 'noon', t: 0.5 },
    { name: 'golden-hour', t: 0.72 },
    { name: 'night', t: 0.85 },
];
const SCENES = ['field', 'rolling-hills', 'open-country', 'newsheepdogland'];

const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT = resolve(ROOT, outArg ? outArg.slice('--out='.length) : 'cycle120-validation/browser');

async function assertWebGpuEngaged(page, id) {
    const r = await page.evaluate(() => ({
        ok: window.__sdsG?.productionWebGpu?.ok === true,
        effective: window.__sdsRendererMode?.effective ?? null,
        isWebGpuRenderer: window.gameInstance?.sceneManager?.renderer?.isWebGPURenderer === true,
        reason: window.__sdsG?.productionWebGpu?.error ?? window.__sdsRendererMode?.fallbackReason ?? null,
    }));
    if (!r.ok || r.effective === 'webgl') {
        throw new Error(`[LIGHT] WebGPU did not engage for ${id} (${JSON.stringify(r)})`);
    }
    return r;
}

/** Everything the scene's own light graph says, read live. */
const readLighting = () => {
    const game = window.gameInstance;
    const scene = game?.sceneManager?.getScene?.();
    const rig = game?.sceneManager?.sceneLightingRig ?? null;
    const lights = [];
    scene?.traverse?.((o) => {
        if (o.isLight) {
            lights.push({
                type: o.type,
                inScene: true,
                intensity: +o.intensity.toFixed(4),
                color: [+o.color.r.toFixed(4), +o.color.g.toFixed(4), +o.color.b.toFixed(4)],
                position: o.position ? [+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)] : null,
            });
        }
    });
    // The materials the atmosphere is actually driving - initWorld hands these
    // over at scene-body time, so this is the live bound set, not a re-lookup.
    const lamps = [];
    for (const m of game?.atmosphere?.duskLamps ?? []) {
        lamps.push({
            name: m.name ?? null,
            emissiveIntensity: +Number(m.emissiveIntensity ?? 0).toFixed(4),
            peak: m.userData?.duskLampPeakIntensity ?? null,
        });
    }
    return {
        lights,
        lightCount: lights.length,
        rigProfile: rig?.profile?.name ?? null,
        rigSunDirection: rig ? rig.getSunDirection() : null,
        sunElevationDeg: game?.atmosphere ? +(game.atmosphere.sun.getElevation() * 180 / Math.PI).toFixed(2) : null,
        sunSystemIntensity: +Number(game?.atmosphere?.sun?.light?.intensity ?? -1).toFixed(4),
        ambientHintIntensity: +Number(game?.atmosphere?.ambientHintIntensity ?? -1).toFixed(4),
        duskLamps: lamps,
    };
};

async function shot(page, file) {
    const dataUrl = await page.evaluate(() => {
        const canvas = document.querySelector('#canvas-container canvas') ?? document.querySelector('canvas');
        return canvas.toDataURL('image/png');
    });
    const png = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
    await writeFile(file, png);
    return png;
}

/**
 * Terrain-vs-grass separation, measured on the frame rather than argued about.
 * Grass blades are bright speckle over a darker ground, so within a
 * ground-heavy strip the low percentile is terrain showing between blades and
 * the high percentile is the blades. Read from the captured PNG rather than in
 * the page - a WebGPU canvas does not survive a 2D `drawImage` readback.
 */
async function groundBands(png, rect) {
    const sharp = (await import('sharp')).default;
    const image = sharp(png);
    const meta = await image.metadata();
    const px = await image.extract({
        left: Math.round(rect.x * meta.width),
        top: Math.round(rect.y * meta.height),
        width: Math.round(rect.w * meta.width),
        height: Math.round(rect.h * meta.height),
    }).ensureAlpha().raw().toBuffer();
    const luma = new Float64Array(px.length / 4);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
        luma[j] = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    }
    const sorted = Array.from(luma).sort((a, b) => a - b);
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))];
    const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    return {
        samples: sorted.length,
        p05_terrainFloor: +at(0.05).toFixed(2),
        p50: +at(0.5).toFixed(2),
        p95_grassTop: +at(0.95).toFixed(2),
        mean: +mean.toFixed(2),
        grassOverTerrain: +(at(0.95) / Math.max(at(0.05), 0.5)).toFixed(2),
    };
}

async function run() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: WEBGPU_LAUNCH_ARGS });
    const report = { capturedAt: new Date().toISOString(), scenes: {} };
    try {
        for (const scene of SCENES) {
            const context = await browser.newContext({ viewport: VIEWPORT });
            const page = await context.newPage();
            try {
                const url = new URL(BASE_URL);
                url.searchParams.set('scene', scene);
                url.searchParams.set('renderer', 'webgpu');
                url.searchParams.set('cinematic', '1');
                url.searchParams.set('probeRender', '1');
                url.searchParams.set('perfMode', '1');
                url.searchParams.set('ui', 'off');
                await page.goto(url.toString(), { waitUntil: 'load', timeout: 120_000 });
                await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 60_000 });
                await page.evaluate(() => window.__sdsCinema.waitReady(120_000));
                await page.evaluate(() => {
                    window.__sdsCinema.startSolo('jep', 'practice');
                });
                await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
                const engaged = await assertWebGpuEngaged(page, scene);
                await page.evaluate(() => window.__sdsCinema.pauseSimulation());

                report.scenes[scene] = { engaged, hours: {} };
                for (const hour of HOURS) {
                    await page.evaluate(({ t }) => {
                        window.__sdsCinema.setSun(t);
                        const dog = window.__sdsCinema.gameState?.getSheepdog?.();
                        window.__sdsCinema.setCameraMode('classic');
                        window.__sdsCinema.setCameraZoom(60);
                        for (let i = 0; i < 90; i++) window.__sds?.sceneManager?.updateCamera?.(dog, 1 / 60);
                    }, hour);
                    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
                    const lighting = await page.evaluate(readLighting);
                    const png = await shot(page, resolve(OUT, `${scene}__${hour.name}.png`));
                    // A ground-heavy strip below the flock, away from the sky band.
                    const ground = await groundBands(png, { x: 0.05, y: 0.62, w: 0.9, h: 0.3 });
                    report.scenes[scene].hours[hour.name] = { t: hour.t, lighting, ground };
                }

                // The dusk lamp, up close, on the one public scene that carries a
                // farmhouse in reach of the play area.
                if (scene === 'field') {
                    const lampShots = {};
                    for (const hour of HOURS) {
                        await page.evaluate(({ t }) => {
                            window.__sdsCinema.setSun(t);
                            window.__sdsCinema.setCameraPose(
                                { x: 172, y: 4.2, z: 148 },
                                { x: 180, y: 3.4, z: 160 },
                            );
                            window.__sdsCinema.renderFrame();
                        }, hour);
                        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
                        lampShots[hour.name] = (await page.evaluate(readLighting)).duskLamps;
                        await shot(page, resolve(OUT, `lamp__${hour.name}.png`));
                    }
                    report.duskLampCloseUp = lampShots;
                }
            } finally {
                await context.close();
            }
        }
    } finally {
        await browser.close();
    }
    await writeFile(resolve(OUT, 'lighting-time-of-day.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
