// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 74 P2 - WebGPU compileAsync-prewarm measurement (headed-GPU).
//
// Measures the SHIPPING path of the Cycle 74 P1 prewarm: with newsheepdogland's
// WebGL pin temporarily removed (CYCLE-74-P2-MEASUREMENT marker in the scene
// file), boot the scene on the real WebGPU renderer and time the build-tail
// renderer.compileAsync() that P1 added. Three questions:
//
//   1. SURVIVAL: does the cold compile reach a live render loop without the
//      Windows GPU TDR watchdog freezing the tab (the Cycle 71 crash)?
//   2. DISK CACHE: does a RETURNING visitor (same on-disk profile, fresh launch)
//      get a fast warm load, or pay the full compile again? This is the decisive
//      pin question - a one-time cold cost is defensible, a per-load cost is not.
//      Measured with launchPersistentContext against a fixed userDataDir: cold
//      run writes Dawn's pipeline cache to disk, the reopened run reads it.
//   3. REGRESSION: rolling-hills (a live WebGPU scene with no prewarmShaders flag)
//      still loads clean.
//
// Real-GPU recipe: system Chrome (channel:'chrome') with --use-angle=d3d11
// --enable-gpu gets the real RTX 3070 adapter; bundled playwright-chromium fails
// device creation and falls back to WebGL. Headed persistent context so the GPU
// disk cache behaves like a real browser.
//
// Run the dev server first: SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000
// Usage: node tools/webgpu-prewarm-probe-cycle74.mjs

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle74-validation');
const PROFILE = resolve(tmpdir(), 'sds-c74-prewarm-profile');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']
    : [];
const BASE = 'http://localhost:3000/';
const COMPILE_TIMEOUT_MS = 160_000; // cold compile ~38s; generous headroom

const CENSUS_FN = () => {
    const sm = window.gameInstance?.sceneManager;
    const scene = sm?.getScene?.();
    const renderer = sm?.getRenderer?.();
    const mats = new Set();
    const matTypes = {};
    let meshes = 0, instanced = 0;
    scene?.traverse((o) => {
        if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) {
            meshes++;
            if (o.isInstancedMesh) instanced++;
            const m = o.material;
            const arr = Array.isArray(m) ? m : (m ? [m] : []);
            for (const mm of arr) { mats.add(mm.uuid); matTypes[mm.type] = (matTypes[mm.type] || 0) + 1; }
        }
    });
    return {
        meshes, instanced, uniqueMaterials: mats.size, matTypes,
        rendererClass: renderer?.constructor?.name ?? null,
        isWebGPU: renderer?.isWebGPURenderer === true,
    };
};

async function loadScene(ctx, sceneId, phase, expectPrewarm) {
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e)}`));
    page.on('crash', () => logs.push('[crash] page crashed'));
    const r = { phase, sceneId, at: new Date().toISOString() };
    const t0 = Date.now();
    try {
        await page.goto(`${BASE}?scene=${sceneId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForFunction(() => !!window.gameInstance, null, { timeout: 60_000 });
        r.rendererMode = await page.evaluate(() => window.__sdsRendererMode ?? null).catch(() => null);
        // Completion signal: renderer live (ready, no error) AND the build+prewarm
        // is actually finished - for an opted-in scene that is the __sdsPrewarm
        // stash (set AFTER compileAsync); for a non-opted scene it is a fully
        // populated scene graph (currentScene.id matches + a substantial mesh
        // count, since currentScene.id is set at build START not END). The in-page
        // poll cannot run on a TDR-frozen main thread, so a timeout here IS the crash.
        try {
            await page.waitForFunction(({ sid, wantPrewarm }) => {
                const gi = window.gameInstance;
                const rs = gi?.sceneManager?.getRenderStatus?.();
                const ready = rs && rs.rendererReady === true && rs.lastError === null;
                if (!ready) return false;
                const pw = window.__sdsPrewarm;
                const pwDone = pw && (pw.ok === true || pw.ok === false) && pw.scene === sid;
                if (wantPrewarm) return pwDone;
                if (gi?.currentScene?.id !== sid) return false;
                let meshes = 0;
                gi?.sceneManager?.getScene?.()?.traverse((o) => { if (o.isMesh || o.isInstancedMesh) meshes++; });
                return meshes > 150;
            }, { sid: sceneId, wantPrewarm: expectPrewarm === true }, { timeout: COMPILE_TIMEOUT_MS });
            r.survived = true;
        } catch (e) {
            r.survived = false;
            r.waitError = String(e?.message || e);
        }
        r.navWallMs = Date.now() - t0;
        r.prewarm = await page.evaluate(() => window.__sdsPrewarm ?? null).catch(() => null);
        await page.waitForTimeout(2000); // confirm loop alive, not a one-shot frame
        r.renderStatus = await page.evaluate(() => window.gameInstance?.sceneManager?.getRenderStatus?.() ?? null).catch(() => null);
        r.currentSceneId = await page.evaluate(() => window.gameInstance?.currentScene?.id ?? null).catch(() => null);
        r.census = await page.evaluate(CENSUS_FN).catch((e) => ({ error: String(e?.message || e) }));
    } catch (err) {
        r.fatal = String(err?.message || err);
    } finally {
        r.logTail = logs.filter((l) => /PREWARM|COLDCOMPILE|crash|pageerror|RENDER|error|TDR/i.test(l)).slice(-30);
        await page.close().catch(() => {});
    }
    return r;
}

async function openCtx() {
    return chromium.launchPersistentContext(PROFILE, { channel: 'chrome', args: GPU_ARGS });
}

// In-session swap: same page, same GPUDevice. Boots a light scene on WebGPU, then
// swaps to newsheepdogland (cold compile), away to rolling-hills, then BACK to
// newsheepdogland. If the device-level (in-memory) pipeline cache warms, the
// swap-back compile is fast - which is what a background prewarm during attract
// would exploit. If the swap-back is still ~full cost, no cache layer helps and
// only shader reduction can cut the cost.
async function inSessionSwap(ctx) {
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('crash', () => logs.push('[crash] page crashed'));
    const out = { at: new Date().toISOString() };
    const swap = (target) => page.evaluate((t) => {
        window.__sdsPrewarm = null; window.__swapDone = null;
        window.gameInstance.swapScene(t, {})
            .then(() => { window.__swapDone = { ok: true }; })
            .catch((e) => { window.__swapDone = { ok: false, error: String(e?.message || e) }; });
    }, target);
    const waitPrewarm = () => page.waitForFunction(() => {
        const pw = window.__sdsPrewarm;
        return pw && (pw.ok === true || pw.ok === false) && pw.scene === 'newsheepdogland';
    }, null, { timeout: COMPILE_TIMEOUT_MS });
    try {
        await page.goto(`${BASE}?scene=rolling-hills`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForFunction(
            () => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true,
            null, { timeout: 60_000 },
        );
        let t0 = Date.now();
        await swap('newsheepdogland');
        await waitPrewarm();
        out.coldSwapWallMs = Date.now() - t0;
        out.coldSwapCompileMs = (await page.evaluate(() => window.__sdsPrewarm))?.compileAsyncMs ?? null;
        await swap('rolling-hills');
        await page.waitForFunction(() => window.gameInstance?.currentScene?.id === 'rolling-hills' && window.__swapDone, null, { timeout: 90_000 });
        t0 = Date.now();
        await swap('newsheepdogland');
        await waitPrewarm();
        out.warmSwapWallMs = Date.now() - t0;
        out.warmSwapCompileMs = (await page.evaluate(() => window.__sdsPrewarm))?.compileAsyncMs ?? null;
        out.survived = true;
    } catch (err) {
        out.fatal = String(err?.message || err);
        out.survived = false;
    } finally {
        out.logTail = logs.filter((l) => /PREWARM|SWAP|crash|error/i.test(l)).slice(-25);
        await page.close().catch(() => {});
    }
    return out;
}

async function run() {
    await rm(PROFILE, { recursive: true, force: true }).catch(() => {}); // truly cold
    const result = { startedAt: new Date().toISOString(), platform: process.platform, profile: PROFILE };
    try {
        // COLD: fresh on-disk profile -> first-ever compile, writes Dawn disk cache.
        let ctx = await openCtx();
        result.cold = await loadScene(ctx, 'newsheepdogland', 'cold', true);
        await ctx.close();
        // WARM: reopen the SAME on-disk profile -> returning-visitor scenario.
        ctx = await openCtx();
        result.warm = await loadScene(ctx, 'newsheepdogland', 'warm', true);
        // REGRESSION: a live WebGPU scene (no prewarmShaders) in the same session.
        result.rollingHills = await loadScene(ctx, 'rolling-hills', 'regression', false);
        await ctx.close();
        // IN-SESSION SWAP: same page/device cache test (informs the follow-up).
        ctx = await openCtx();
        result.inSessionSwap = await inSessionSwap(ctx);
        await ctx.close();
    } catch (err) {
        result.fatal = String(err?.message || err);
    } finally {
        result.endedAt = new Date().toISOString();
    }
    await mkdir(OUT_DIR, { recursive: true });
    const outPath = resolve(OUT_DIR, 'prewarm-measure.json');
    await writeFile(outPath, JSON.stringify(result, null, 2));

    const summary = {
        coldSurvived: result.cold?.survived ?? null,
        coldCompileMs: result.cold?.prewarm?.compileAsyncMs ?? null,
        coldNavWallMs: result.cold?.navWallMs ?? null,
        warmSurvived: result.warm?.survived ?? null,
        warmCompileMs: result.warm?.prewarm?.compileAsyncMs ?? null,
        warmNavWallMs: result.warm?.navWallMs ?? null,
        diskCacheHelps: (result.cold?.prewarm?.compileAsyncMs ?? 0) > 0 && (result.warm?.prewarm?.compileAsyncMs ?? 1e9) < (result.cold?.prewarm?.compileAsyncMs ?? 0) * 0.5,
        rollingHillsLastError: result.rollingHills?.renderStatus?.lastError ?? null,
        rollingHillsWebGPU: result.rollingHills?.census?.isWebGPU ?? null,
        rollingHillsMeshes: result.rollingHills?.census?.meshes ?? null,
        inSessionColdSwapMs: result.inSessionSwap?.coldSwapCompileMs ?? null,
        inSessionWarmSwapMs: result.inSessionSwap?.warmSwapCompileMs ?? null,
        inSessionCacheHelps: (result.inSessionSwap?.coldSwapCompileMs ?? 0) > 0 && (result.inSessionSwap?.warmSwapCompileMs ?? 1e9) < (result.inSessionSwap?.coldSwapCompileMs ?? 0) * 0.5,
        nslMaterials: result.cold?.census?.uniqueMaterials ?? null,
        effective: result.cold?.rendererMode?.effective ?? null,
        fatal: result.fatal ?? null,
    };
    console.log(JSON.stringify(summary, null, 2));
    console.log('Wrote', outPath);
}

run().catch((e) => { console.error('[PREWARM-PROBE] fatal', e); process.exit(1); });
