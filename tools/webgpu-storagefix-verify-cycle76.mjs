// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 76 P2/P3 - verify the storage-buffer instancing fix renders correctly, is
// crash-free, loads within budget, and holds FPS. The fix routes per-chunk grass+tree
// instance matrices through Three's storage path (runtime-sized array, no baked count),
// cutting the cold WebGPU load from ~76s to ~16s device-independently.
//
// Captures: effective renderer, two cold-load wall times, a screenshot (visual parity
// of grass + trees), any WebGPU validation errors, and a 3s FPS sample after load.
//
// Needs the newsheepdogland WebGL pin temporarily lifted.
// Run the dev server first: SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000
// Usage: node tools/webgpu-storagefix-verify-cycle76.mjs

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle76-validation');
const PROFILE = resolve(tmpdir(), 'sds-c76-storageverify');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']
    : [];
const BASE = 'http://localhost:3000/';
const TIMEOUT = 200_000;

async function bootAttract(page) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => !!window.gameInstance, null, { timeout: 60_000 });
    await page.waitForFunction(() => {
        const rs = window.gameInstance?.sceneManager?.getRenderStatus?.();
        return window.__sdsAttractActive === true && rs && rs.rendererReady === true;
    }, null, { timeout: 60_000 });
}

async function swapAndTime(page, target) {
    const t0 = Date.now();
    await page.evaluate((t) => { window.gameInstance.swapScene(t).catch((e) => { window.__err = String(e?.message || e); }); }, target);
    await page.waitForFunction((t) => window.gameInstance?.currentScene?.id === t, target, { timeout: TIMEOUT }).catch(() => {});
    await page.waitForFunction(() => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true, null, { timeout: TIMEOUT }).catch(() => {});
    await page.waitForTimeout(3500);
    return Date.now() - t0;
}

async function sampleFps(page, ms = 3000) {
    return page.evaluate((dur) => new Promise((res) => {
        let frames = 0; const t0 = performance.now(); let last = t0; let worst = 0;
        function tick(now) {
            frames++;
            const dt = now - last; last = now;
            if (dt > worst) worst = dt;
            if (now - t0 >= dur) {
                res({ fps: Math.round((frames / (now - t0)) * 1000), worstFrameMs: Math.round(worst), elapsedMs: Math.round(now - t0) });
            } else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }), ms);
}

// True time-to-interactive: the swap "rendererReady" wall misses post-load pipeline
// compiles (e.g. the shadow pass on the first real frame). This drives rAF until frames
// stabilize (N consecutive frames under thresholdMs) and reports the settle time +
// blocked time + worst single frame, all measured from the call start.
async function measureTimeToSmooth(page, { thresholdMs = 40, needConsecutive = 30, maxMs = 110000 } = {}) {
    return page.evaluate(({ thresholdMs, needConsecutive, maxMs }) => new Promise((res) => {
        const t0 = performance.now(); let last = t0; let good = 0; let worst = 0;
        let blocked = 0; let frames = 0; let settleMs = null;
        function tick(now) {
            frames++;
            const dt = now - last; last = now;
            if (frames > 1) { // ignore the first dt (includes pre-loop gap)
                if (dt > worst) worst = dt;
                if (dt > 100) blocked += dt;
                if (dt <= thresholdMs) { good++; if (good >= needConsecutive && settleMs === null) settleMs = now - t0; }
                else good = 0;
            }
            if (settleMs !== null || now - t0 >= maxMs) {
                res({ settleMs: settleMs === null ? null : Math.round(settleMs), worstFrameMs: Math.round(worst), blockedMs: Math.round(blocked), frames, timedOut: settleMs === null });
            } else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }), { thresholdMs, needConsecutive, maxMs });
}

async function run() {
    await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
    const result = { startedAt: new Date().toISOString() };
    const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', args: GPU_ARGS });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => {
        const t = m.type();
        const text = m.text();
        if (t === 'error' || t === 'warning' || /validation|invalid|GPUValidation|destroyed|storage/i.test(text)) {
            consoleErrors.push(`[${t}] ${text}`);
        }
    });
    page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${String(e?.message || e)}`));
    page.on('crash', () => consoleErrors.push('[crash]'));
    try {
        await bootAttract(page);
        result.effective = await page.evaluate(() => window.__sdsRendererMode?.effective ?? null);

        // Cold load #1.
        result.coldLoad1Ms = await swapAndTime(page, 'newsheepdogland');
        result.status1 = await page.evaluate(() => window.gameInstance?.sceneManager?.getRenderStatus?.() ?? null);
        result.treeSummary = await page.evaluate(() => window.gameInstance?.terrainBuilder?.konveyorNativeTreeInstancingSummary
            ? { ok: window.gameInstance.terrainBuilder.konveyorNativeTreeInstancingSummary.ok,
                treeInstances: window.gameInstance.terrainBuilder.konveyorNativeTreeInstancingSummary.treeInstances,
                renderedInstanceMeshes: window.gameInstance.terrainBuilder.konveyorNativeTreeInstancingSummary.renderedInstanceMeshes }
            : null);
        // Post-load jank sample (catches shadow-pass compile hitches in the first
        // seconds after rendererReady; settleMs is unreliable when the probe window is
        // unfocused, so read blockedMs/worstFrameMs).
        result.timeToSmooth = await measureTimeToSmooth(page, { maxMs: 12000 });
        result.fps = await sampleFps(page, 3000);

        // Reset + cold load #2 (confirm stability).
        await page.evaluate(() => { window.gameInstance.swapScene('rolling-hills').catch(() => {}); });
        await page.waitForFunction(() => window.gameInstance?.currentScene?.id === 'rolling-hills', null, { timeout: TIMEOUT }).catch(() => {});
        await page.waitForTimeout(1500);
        result.warmLoad2Ms = await swapAndTime(page, 'newsheepdogland');

        // Screenshot via CDP (Playwright's page.screenshot hangs on the WebGPU canvas
        // font-wait). CDP Page.captureScreenshot skips that and grabs the composited frame.
        try {
            const client = await page.context().newCDPSession(page);
            const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
            await writeFile(resolve(OUT_DIR, 'storagefix-nsl.png'), Buffer.from(data, 'base64'));
            result.screenshot = 'ok';
        } catch (e) {
            result.screenshot = `failed: ${String(e?.message || e).slice(0, 80)}`;
        }

        result.errCount = consoleErrors.length;
        result.errSample = consoleErrors.slice(0, 25);
    } catch (err) {
        result.fatal = String(err?.stack || err?.message || err);
        result.errSample = consoleErrors.slice(0, 25);
    } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
        result.endedAt = new Date().toISOString();
    }
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, 'storagefix-verify.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
        effective: result.effective,
        coldLoad1Ms: result.coldLoad1Ms,
        warmLoad2Ms: result.warmLoad2Ms,
        treeSummary: result.treeSummary,
        status1_ready: result.status1?.rendererReady ?? null,
        status1_lastError: result.status1?.lastError ?? null,
        fps: result.fps,
        errCount: result.errCount,
        errSample: result.errSample,
        fatal: result.fatal ?? null,
    }, null, 2));
    console.log('Wrote', resolve(OUT_DIR, 'storagefix-verify.json'));
}

run().catch((e) => { console.error('[STORAGE-VERIFY] fatal', e); process.exit(1); });
