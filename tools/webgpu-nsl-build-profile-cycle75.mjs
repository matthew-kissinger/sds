// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 75 P1 diagnostic - WHY is the newsheepdogland WebGPU build ~78s?
//
// The attract-prewarm probe found the pipeline COMPILE is cheap once warm (95ms),
// but a newsheepdogland swap-build takes ~78s on WebGPU (vs ~2.2s on WebGL). The
// swap render loop renders every frame during the build (main.js runFrame line
// ~2618, _sceneRebuilding branch). Hypothesis: on WebGPU, rendering the
// progressively-larger scene each frame during the build pays incremental
// pipeline/bindgroup/upload costs that serialize into the ~78s.
//
// This probe:
//   A) Times each buildSceneBody step (hooks _reportLoadStep) for a normal swap
//      (render active during the build) -> finds which step eats the time.
//   B) Repeats with sceneManager.render() no-op'd during the build (render
//      suppressed) -> if the build collapses to WebGL-class speed, the fix is
//      "don't render partial frames during a heavy WebGPU build" and the pin can
//      lift; if it stays ~78s, the cost is intrinsic build/upload work.
//
// Needs the CYCLE-75-P1-MEASUREMENT pin lift on newsheepdogland.js.
// Run the dev server first: SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000
// Usage: node tools/webgpu-nsl-build-profile-cycle75.mjs

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle75-validation');
const PROFILE = resolve(tmpdir(), 'sds-c75-buildprofile');
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
    // Hook _reportLoadStep to timestamp each build step.
    await page.evaluate(() => {
        const gi = window.gameInstance;
        window.__steps = [];
        const orig = gi._reportLoadStep.bind(gi);
        gi._reportLoadStep = (label) => { window.__steps.push({ label, t: Math.round(performance.now()) }); return orig(label); };
    });
}

function waitPrewarm(page, scene) {
    return page.waitForFunction((s) => {
        const pw = window.__sdsPrewarm;
        return pw && pw.scene === s && (pw.ok === true || pw.ok === false);
    }, scene, { timeout: TIMEOUT });
}

async function profileSwap(page, target, { suppressRender }) {
    await page.evaluate(() => { window.__steps = []; window.__sdsPrewarm = null; });
    if (suppressRender) {
        await page.evaluate(() => {
            const sm = window.gameInstance.sceneManager;
            window.__origRender = sm.render.bind(sm);
            sm.render = () => true; // no-op partial-frame renders during the build
        });
    }
    const t0 = Date.now();
    await page.evaluate((t) => { window.gameInstance.swapScene(t).catch((e) => { window.__err = String(e?.message || e); }); }, target);
    await waitPrewarm(page, target).catch(() => {});
    const wallMs = Date.now() - t0;
    if (suppressRender) {
        await page.evaluate(() => { window.gameInstance.sceneManager.render = window.__origRender; });
    }
    const steps = await page.evaluate(() => window.__steps);
    const prewarm = await page.evaluate(() => window.__sdsPrewarm ?? null);
    const status = await page.evaluate(() => window.gameInstance?.sceneManager?.getRenderStatus?.() ?? null);
    const deltas = [];
    for (let i = 1; i < steps.length; i++) {
        deltas.push({ step: steps[i - 1].label, ms: steps[i].t - steps[i - 1].t });
    }
    deltas.sort((a, b) => b.ms - a.ms);
    return { target, suppressRender, wallMs, compileMs: prewarm?.compileAsyncMs ?? null, lastError: status?.lastError ?? null, topSteps: deltas.slice(0, 8) };
}

async function run() {
    await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
    const result = { startedAt: new Date().toISOString() };
    const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', args: GPU_ARGS });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(`[${Date.now()}] ${m.text()}`));
    page.on('crash', () => logs.push('[crash]'));
    try {
        await bootAttract(page);
        result.effective = await page.evaluate(() => window.__sdsRendererMode?.effective ?? null);
        // A) Normal swap (render active during build) - cold device.
        result.renderActive = await profileSwap(page, 'newsheepdogland', { suppressRender: false });
        // Reset to a light scene so the next build starts from a comparable state.
        await page.evaluate(() => { window.gameInstance.swapScene('rolling-hills').catch(() => {}); });
        await page.waitForFunction(() => window.gameInstance?.currentScene?.id === 'rolling-hills', null, { timeout: TIMEOUT }).catch(() => {});
        await page.waitForTimeout(2000);
        // B) Suppressed-render swap (pipelines now warm, but BUILD is what we measure).
        result.renderSuppressed = await profileSwap(page, 'newsheepdogland', { suppressRender: true });
    } catch (err) {
        result.fatal = String(err?.message || err);
    } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
        result.endedAt = new Date().toISOString();
    }
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, 'nsl-build-profile.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
        effective: result.effective,
        renderActive_wallMs: result.renderActive?.wallMs,
        renderActive_compileMs: result.renderActive?.compileMs,
        renderActive_top: result.renderActive?.topSteps,
        renderSuppressed_wallMs: result.renderSuppressed?.wallMs,
        renderSuppressed_compileMs: result.renderSuppressed?.compileMs,
        renderSuppressed_top: result.renderSuppressed?.topSteps,
        fatal: result.fatal ?? null,
    }, null, 2));
    console.log('Wrote', resolve(OUT_DIR, 'nsl-build-profile.json'));
}

run().catch((e) => { console.error('[BUILD-PROFILE] fatal', e); process.exit(1); });
