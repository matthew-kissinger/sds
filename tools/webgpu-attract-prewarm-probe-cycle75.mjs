// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 75 P1 - attract-prewarm measurement (headed-GPU).
//
// Cycle 74 proved the lever: warming the shared konveyor pipelines (via any heavy
// WebGPU scene build + compileAsync) drops a subsequent newsheepdogland compile to
// ~0.4s on the device pipeline cache. This probe measures the ATTRACT-context
// version of that warm and the new unknowns it raises:
//
//   1. WARM COST: how long does building the default scene (rolling-hills) +
//      compileAsync take during attract? That is the menu idle time a background
//      prewarm needs to fully warm the device.
//   2. PICK WITHIN BUDGET: after that warm, is a first newsheepdogland pick within
//      budget (expect ~0.4s compile per Cycle 74, confirmed in the attract-boot
//      context)?
//   3. JANK: does the warm (a synchronous build feeding an async compile) stall the
//      menu? Measured with an independent rAF sampler (real frame cadence).
//   4. RACE: a pick fired mid-warm (before the device is fully warm) - does it stay
//      crash-free under P1's compileAsync bar (the Cycle 71 TDR class)?
//
// Temporary measurement edits (CYCLE-75-P1-MEASUREMENT markers, restored after):
//   - shared/scenes/newsheepdogland.js: pin (renderer:'webgl') lifted so the pick
//     runs on WebGPU.
//   - shared/scenes/rolling-hills.js: prewarmShaders:true added so the default-scene
//     warm compile is timed cleanly via the __sdsPrewarm stash.
//
// Real-GPU recipe (Cycle 74): system Chrome (channel:'chrome') + --use-angle=d3d11
// --enable-gpu gets the real RTX 3070 adapter; bundled playwright-chromium fails
// device creation and falls back to WebGL. Headed persistent context.
//
// Run the dev server first: SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000
// Usage: node tools/webgpu-attract-prewarm-probe-cycle75.mjs

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle75-validation');
const PROFILE = resolve(tmpdir(), 'sds-c75-attract-profile');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']
    : [];
const BASE = 'http://localhost:3000/';
const COMPILE_TIMEOUT_MS = 160_000; // cold compile ~38s; generous headroom

// Independent rAF sampler installed pre-navigation. Runs its own loop so it
// captures real frame cadence (main-thread stalls) regardless of the game loop's
// _sceneRebuilding early-outs.
const INSTALL_SAMPLER = () => {
    window.__raf = { on: false, deltas: [], last: 0 };
    const loop = (now) => {
        if (window.__raf.on) window.__raf.deltas.push(now - window.__raf.last);
        window.__raf.last = now;
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.__rafStart = () => { window.__raf.deltas = []; window.__raf.last = performance.now(); window.__raf.on = true; };
    window.__rafStop = () => {
        window.__raf.on = false;
        const d = window.__raf.deltas.slice().sort((a, b) => a - b);
        const n = d.length;
        return {
            count: n,
            medianMs: Math.round(d[Math.floor(n / 2)] || 0),
            p95Ms: Math.round(d[Math.floor(n * 0.95)] || 0),
            maxMs: Math.round(d[n - 1] || 0),
            over100: d.filter((x) => x > 100).length, // frames that stalled > 100ms
        };
    };
};

const CENSUS_FN = () => {
    const sm = window.gameInstance?.sceneManager;
    const scene = sm?.getScene?.();
    const renderer = sm?.getRenderer?.();
    const mats = new Set();
    let meshes = 0;
    scene?.traverse((o) => {
        if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) {
            meshes++;
            const m = o.material;
            const arr = Array.isArray(m) ? m : (m ? [m] : []);
            for (const mm of arr) mats.add(mm.uuid);
        }
    });
    return {
        meshes, uniqueMaterials: mats.size,
        rendererClass: renderer?.constructor?.name ?? null,
        isWebGPU: renderer?.isWebGPURenderer === true,
        attractActive: window.__sdsAttractActive === true,
    };
};

async function openCtx() {
    return chromium.launchPersistentContext(PROFILE, { channel: 'chrome', args: GPU_ARGS });
}

async function newProbePage(ctx) {
    const page = await ctx.newPage();
    await page.addInitScript(INSTALL_SAMPLER);
    return page;
}

async function bootAttract(page) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => !!window.gameInstance, null, { timeout: 60_000 });
    await page.waitForFunction(() => {
        const rs = window.gameInstance?.sceneManager?.getRenderStatus?.();
        return window.__sdsAttractActive === true && rs && rs.rendererReady === true;
    }, null, { timeout: 60_000 });
}

// Wait until __sdsPrewarm stashes a result for `scene`. The in-page poll cannot
// run on a TDR-frozen main thread, so a timeout here IS the crash.
function waitPrewarm(page, scene) {
    return page.waitForFunction((s) => {
        const pw = window.__sdsPrewarm;
        return pw && pw.scene === s && (pw.ok === true || pw.ok === false);
    }, scene, { timeout: COMPILE_TIMEOUT_MS });
}

// MAIN sequence: boot attract -> baseline rAF -> warm (default scene) -> pick nsl.
async function measureWarmAndPick(ctx) {
    const page = await newProbePage(ctx);
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e)}`));
    page.on('crash', () => logs.push('[crash] page crashed'));
    const out = { at: new Date().toISOString() };
    try {
        await bootAttract(page);
        out.rendererMode = await page.evaluate(() => window.__sdsRendererMode ?? null);
        out.attractCensus = await page.evaluate(CENSUS_FN);

        // Baseline attract smoothness (no warm running).
        await page.evaluate(() => window.__rafStart());
        await page.waitForTimeout(1500);
        out.attractIdleRaf = await page.evaluate(() => window.__rafStop());

        // WARM: build the default scene (rolling-hills, prewarmShaders temp-on) +
        // compileAsync; sample frame cadence across the whole warm.
        await page.evaluate(() => { window.__sdsPrewarm = null; window.__rafStart(); });
        const warmT0 = Date.now();
        await page.evaluate(() => {
            window.gameInstance.swapScene('rolling-hills').catch((e) => { window.__warmErr = String(e?.message || e); });
        });
        await waitPrewarm(page, 'rolling-hills');
        out.warmWallMs = Date.now() - warmT0;
        out.warmRaf = await page.evaluate(() => window.__rafStop());
        out.warmPrewarm = await page.evaluate(() => window.__sdsPrewarm ?? null);

        // Let the warm scene settle to a live render loop.
        await page.waitForTimeout(1500);
        out.afterWarmStatus = await page.evaluate(() => window.gameInstance?.sceneManager?.getRenderStatus?.() ?? null);

        // PICK newsheepdogland (pin temp-lifted). Device pipelines warm -> expect ~0.4s.
        await page.evaluate(() => { window.__sdsPrewarm = null; });
        const pickT0 = Date.now();
        await page.evaluate(() => {
            window.gameInstance.swapScene('newsheepdogland').catch((e) => { window.__pickErr = String(e?.message || e); });
        });
        await waitPrewarm(page, 'newsheepdogland');
        out.pickWallMs = Date.now() - pickT0;
        out.pickPrewarm = await page.evaluate(() => window.__sdsPrewarm ?? null);
        await page.waitForTimeout(2000);
        out.pickStatus = await page.evaluate(() => window.gameInstance?.sceneManager?.getRenderStatus?.() ?? null);
        out.pickCensus = await page.evaluate(CENSUS_FN);
        out.survived = true;
    } catch (err) {
        out.survived = false;
        out.fatal = String(err?.message || err);
    } finally {
        out.logTail = logs.filter((l) => /PREWARM|SWAP|BUILD|crash|pageerror|RENDER|error|TDR/i.test(l)).slice(-30);
        await page.close().catch(() => {});
    }
    return out;
}

// RACE: kick the warm, then pick newsheepdogland mid-warm (before the device is
// fully warm). Must stay crash-free (reach a clean render loop).
async function measureRace(ctx, midWarmDelayMs = 2500) {
    const page = await newProbePage(ctx);
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('crash', () => logs.push('[crash] page crashed'));
    const out = { at: new Date().toISOString(), midWarmDelayMs };
    try {
        await bootAttract(page);
        await page.evaluate(() => { window.__sdsPrewarm = null; });
        // Kick the warm (do not await).
        await page.evaluate(() => {
            window.gameInstance.swapScene('rolling-hills').catch((e) => { window.__warmErr = String(e?.message || e); });
        });
        await page.waitForTimeout(midWarmDelayMs);
        // Pick newsheepdogland mid-warm.
        const t0 = Date.now();
        await page.evaluate(() => {
            window.__sdsPrewarm = null;
            window.gameInstance.swapScene('newsheepdogland').catch((e) => { window.__pickErr = String(e?.message || e); });
        });
        await waitPrewarm(page, 'newsheepdogland');
        out.pickWallMs = Date.now() - t0;
        out.pickPrewarm = await page.evaluate(() => window.__sdsPrewarm ?? null);
        await page.waitForTimeout(2000);
        out.pickStatus = await page.evaluate(() => window.gameInstance?.sceneManager?.getRenderStatus?.() ?? null);
        out.survived = true;
    } catch (err) {
        out.survived = false;
        out.fatal = String(err?.message || err);
    } finally {
        out.logTail = logs.filter((l) => /PREWARM|SWAP|crash|error|TDR/i.test(l)).slice(-25);
        await page.close().catch(() => {});
    }
    return out;
}

async function run() {
    await rm(PROFILE, { recursive: true, force: true }).catch(() => {}); // truly cold
    const result = { startedAt: new Date().toISOString(), platform: process.platform, profile: PROFILE };
    try {
        let ctx = await openCtx();
        result.warmAndPick = await measureWarmAndPick(ctx);
        await ctx.close();
        // Fresh device for the race (truly cold pipelines again).
        await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
        ctx = await openCtx();
        result.race = await measureRace(ctx);
        await ctx.close();
    } catch (err) {
        result.fatal = String(err?.message || err);
    } finally {
        result.endedAt = new Date().toISOString();
    }
    await mkdir(OUT_DIR, { recursive: true });
    const outPath = resolve(OUT_DIR, 'attract-prewarm-measure.json');
    await writeFile(outPath, JSON.stringify(result, null, 2));

    const wp = result.warmAndPick ?? {};
    const summary = {
        effective: wp.rendererMode?.effective ?? null,
        attractIsWebGPU: wp.attractCensus?.isWebGPU ?? null,
        attractMeshes: wp.attractCensus?.meshes ?? null,
        attractIdle_p95Ms: wp.attractIdleRaf?.p95Ms ?? null,
        attractIdle_maxMs: wp.attractIdleRaf?.maxMs ?? null,
        warmWallMs: wp.warmWallMs ?? null,
        warmCompileMs: wp.warmPrewarm?.compileAsyncMs ?? null,
        warmRaf_p95Ms: wp.warmRaf?.p95Ms ?? null,
        warmRaf_maxMs: wp.warmRaf?.maxMs ?? null,
        warmRaf_over100: wp.warmRaf?.over100 ?? null,
        pickWallMs: wp.pickWallMs ?? null,
        pickCompileMs: wp.pickPrewarm?.compileAsyncMs ?? null,
        pickSurvived: wp.survived ?? null,
        pickLastError: wp.pickStatus?.lastError ?? null,
        nslMeshes: wp.pickCensus?.meshes ?? null,
        nslMaterials: wp.pickCensus?.uniqueMaterials ?? null,
        race_survived: result.race?.survived ?? null,
        race_pickCompileMs: result.race?.pickPrewarm?.compileAsyncMs ?? null,
        race_lastError: result.race?.pickStatus?.lastError ?? null,
        fatal: result.fatal ?? null,
    };
    console.log(JSON.stringify(summary, null, 2));
    console.log('Wrote', outPath);
}

run().catch((e) => { console.error('[ATTRACT-PROBE] fatal', e); process.exit(1); });
