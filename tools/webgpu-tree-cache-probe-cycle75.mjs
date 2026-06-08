// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 75 P1 linchpin - do newsheepdogland's tree node-material pipelines cache
// across builds on the device? This decides whether an attract prewarm can EVER
// make a first nsl pick fast.
//
//   - If the SECOND nsl build's "Creating trees" is cheap -> pipelines cache ->
//     a prewarm that compiles them during attract would make the real pick fast ->
//     the pin could lift.
//   - If the second build is still ~76s -> the cost is per-build, not cacheable ->
//     no attract prewarm can help -> the pin stays and the real fix is elsewhere
//     (cut the tree node-material compile itself).
//
// All passes render-active (no monkeypatch) for a clean measurement.
// Needs the CYCLE-75-P1-MEASUREMENT pin lift on newsheepdogland.js.
// Run the dev server first: SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000
// Usage: node tools/webgpu-tree-cache-probe-cycle75.mjs

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle75-validation');
const PROFILE = resolve(tmpdir(), 'sds-c75-treecache');
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
    await page.evaluate(() => {
        const gi = window.gameInstance;
        window.__steps = [];
        const orig = gi._reportLoadStep.bind(gi);
        gi._reportLoadStep = (label) => { window.__steps.push({ label, t: Math.round(performance.now()) }); return orig(label); };
    });
}

async function buildAndTimeTrees(page, target) {
    await page.evaluate(() => { window.__steps = []; window.__sdsPrewarm = null; });
    const t0 = Date.now();
    await page.evaluate((t) => { window.gameInstance.swapScene(t).catch((e) => { window.__err = String(e?.message || e); }); }, target);
    await page.waitForFunction((t) => window.gameInstance?.currentScene?.id === t, target, { timeout: TIMEOUT }).catch(() => {});
    // ensure build steps flushed
    await page.waitForFunction(() => window.__steps.some((s) => s.label === 'Scene body complete'), null, { timeout: TIMEOUT }).catch(() => {});
    const wallMs = Date.now() - t0;
    const steps = await page.evaluate(() => window.__steps);
    let treesMs = null;
    for (let i = 1; i < steps.length; i++) {
        if (steps[i - 1].label === 'Creating trees') treesMs = steps[i].t - steps[i - 1].t;
    }
    return { target, wallMs, treesMs };
}

async function run() {
    await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
    const result = { startedAt: new Date().toISOString() };
    const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', args: GPU_ARGS });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    page.on('crash', () => logs.push('[crash]'));
    try {
        await bootAttract(page);
        result.effective = await page.evaluate(() => window.__sdsRendererMode?.effective ?? null);
        // First nsl build (cold device).
        result.nsl1 = await buildAndTimeTrees(page, 'newsheepdogland');
        // Swap to a light scene, then build nsl AGAIN (device warm from nsl1).
        await buildAndTimeTrees(page, 'rolling-hills');
        result.nsl2 = await buildAndTimeTrees(page, 'newsheepdogland');
    } catch (err) {
        result.fatal = String(err?.message || err);
    } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
        result.endedAt = new Date().toISOString();
    }
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, 'tree-cache-probe.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
        effective: result.effective,
        nsl1_treesMs: result.nsl1?.treesMs,
        nsl1_wallMs: result.nsl1?.wallMs,
        nsl2_treesMs: result.nsl2?.treesMs,
        nsl2_wallMs: result.nsl2?.wallMs,
        treePipelinesCache: (result.nsl1?.treesMs ?? 0) > 10000 && (result.nsl2?.treesMs ?? 1e9) < (result.nsl1?.treesMs ?? 0) * 0.5,
        fatal: result.fatal ?? null,
    }, null, 2));
    console.log('Wrote', resolve(OUT_DIR, 'tree-cache-probe.json'));
}

run().catch((e) => { console.error('[TREE-CACHE] fatal', e); process.exit(1); });
