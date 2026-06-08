// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 78 P1 spike - apples-to-apples nsl cold-load budget: WebGL vs WebGPU
// (grass count-collapse). Path-agnostic timings so the "within-budget" gate
// (hard stop 1) has a real reference instead of the stale "~2.2s" pin comment.
//
// Measures, from swapScene(newsheepdogland) on a cold device:
//   - tBuildMs    : swap -> '_reportLoadStep("Scene body complete")' (CPU build)
//   - tReadyMs    : swap -> getRenderStatus().rendererReady === true
//   - tStableMs   : swap -> FPS has held >= 55 for 2 consecutive seconds (all
//                   pipelines compiled + rendering smoothly = player "loaded")
//   - longTasksMs : worst main-thread long-task during the load (TDR proxy)
//
// RENDERER=webgl|webgpu  COLLAPSE=off|grassattr  node tools/webgpu-budget-compare-cycle78.mjs
// Needs the dev server (SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000) and, for
// webgpu, the nsl pin temporarily lifted.

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle78-validation');
const PROFILE = resolve(tmpdir(), 'sds-c78-budget');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'] : [];
const RENDERER = (process.env.RENDERER || 'webgpu').toLowerCase();
const COLLAPSE = (process.env.COLLAPSE || 'off').toLowerCase();
const BASE = `http://localhost:3000/?renderer=${RENDERER}`;
const TIMEOUT = 200_000;

async function boot(page) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => !!window.gameInstance, null, { timeout: 60_000 });
    await page.waitForFunction(() => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true,
        null, { timeout: 60_000 }).catch(() => {});
    // Hook build-step marks + long-task observer.
    await page.evaluate(() => {
        window.__marks = [];
        const gi = window.gameInstance;
        if (gi?._reportLoadStep) {
            const orig = gi._reportLoadStep.bind(gi);
            gi._reportLoadStep = (label) => { window.__marks.push({ label, t: performance.now() }); return orig(label); };
        }
        window.__longTasks = [];
        window.__ltZero = performance.now();
        try {
            new PerformanceObserver((list) => {
                for (const e of list.getEntries()) window.__longTasks.push({ start: Math.round(e.startTime - window.__ltZero), dur: Math.round(e.duration) });
            }).observe({ entryTypes: ['longtask'] });
        } catch {}
    });
}

async function measure(page) {
    const t0 = await page.evaluate(() => {
        window.__marks.length = 0; window.__longTasks.length = 0; window.__ltZero = performance.now();
        const t = performance.now();
        window.gameInstance.swapScene('newsheepdogland').catch((e) => { window.__err = String(e?.message || e); });
        return t;
    });
    await page.waitForFunction(() => window.gameInstance?.currentScene?.id === 'newsheepdogland', null, { timeout: TIMEOUT }).catch(() => {});
    const tBuild = await page.evaluate(() => {
        const m = window.__marks.find((x) => x.label === 'Scene body complete');
        return m ? m.t : null;
    });
    const tReadyStart = Date.now();
    await page.waitForFunction(() => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true, null, { timeout: TIMEOUT }).catch(() => {});
    const tReadyMs = Date.now() - tReadyStart;
    // Poll FPS until >=55 sustained 2s, cap 60s.
    const stable = await page.evaluate(() => new Promise((res) => {
        const t0 = performance.now(); let okSince = null; let frames = 0; let winStart = t0; let lastFps = 0;
        function tick(now) {
            frames++;
            if (now - winStart >= 500) { lastFps = Math.round(frames / ((now - winStart) / 1000)); frames = 0; winStart = now;
                if (lastFps >= 55) { if (okSince == null) okSince = now; else if (now - okSince >= 2000) return res({ stableMs: Math.round(now - t0), lastFps }); }
                else okSince = null;
            }
            if (now - t0 >= 60000) return res({ stableMs: -1, lastFps });
            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }));
    // Keep observing a few more seconds in case the heavy block lands after "stable".
    await page.waitForTimeout(8000);
    const longTasks = await page.evaluate(() => window.__longTasks.slice().sort((a, b) => b.dur - a.dur));
    const buildMs = tBuild != null ? Math.round(tBuild - t0) : null;
    const worstLongTaskMs = longTasks[0]?.dur ?? 0;
    const sumLongTaskMs = longTasks.reduce((s, t) => s + t.dur, 0);
    return { buildMs, tReadyMs, stableMs: stable.stableMs, lastFps: stable.lastFps, worstLongTaskMs, sumLongTaskMs, top5LongTasks: longTasks.slice(0, 5) };
}

async function run() {
    await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
    const result = { renderer: RENDERER, collapse: COLLAPSE, startedAt: new Date().toISOString() };
    const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', args: GPU_ARGS });
    const page = await ctx.newPage();
    await page.addInitScript((c) => { window.__SDS_COUNT_COLLAPSE = c === 'off' ? undefined : c; }, COLLAPSE);
    await page.bringToFront().catch(() => {});
    let crashed = false;
    page.on('crash', () => { crashed = true; });
    try {
        await boot(page);
        result.effective = await page.evaluate(() => window.__sdsRendererMode?.effective ?? null);
        result.cold = await measure(page);
    } catch (err) {
        result.fatal = String(err?.stack || err?.message || err);
    } finally {
        result.crashed = crashed;
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
        result.endedAt = new Date().toISOString();
    }
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, `budget-${RENDERER}-${COLLAPSE}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
}
run().catch((e) => { console.error('[BUDGET] fatal', e); process.exit(1); });
