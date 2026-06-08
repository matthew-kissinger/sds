// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 77 - verify the newsheepdogland WebGPU pin-lift gate (hard stop 1).
//
// Drives N cold/warm newsheepdogland WebGPU loads on the RTX 3070 and checks the
// three gate conditions:
//   1. within budget   - first (cold) load completes in ~16s (storage-fix floor)
//   2. crash-clean     - no page crash, renderer ready, FPS holds
//   3. error-free      - zero "Buffer used in submit while destroyed" (the
//                        pre-existing swap-disposal race) AND zero
//                        "NodeBuilder ... ShaderMaterial not compatible" across
//                        ALL runs (the errors are racy, so one clean run is not
//                        enough - the gate is RUNS clean loads).
//
// Also walks the scene graph after the cold load and reports the InstancedMesh
// material breakdown + how many got the storage-instancing flag, so we can see
// exactly which meshes are on the storage path and catch any ShaderMaterial.
//
// Needs the newsheepdogland WebGL pin temporarily lifted.
// Run the dev server first: SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000
// Usage: RUNS=5 node tools/webgpu-pinlift-verify-cycle77.mjs   (default RUNS=3)

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle77-validation');
const PROFILE = resolve(tmpdir(), 'sds-c77-pinlift');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']
    : [];
const BASE = 'http://localhost:3000/';
const TIMEOUT = 200_000;
const RUNS = Math.max(1, Number(process.env.RUNS || 3));

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

async function sampleFps(page, ms = 2500) {
    return page.evaluate((dur) => new Promise((res) => {
        let frames = 0; const t0 = performance.now(); let last = t0; let worst = 0;
        function tick(now) {
            frames++;
            const dt = now - last; last = now;
            if (dt > worst) worst = dt;
            if (now - t0 >= dur) {
                res({ fps: Math.round((frames / (now - t0)) * 1000), worstFrameMs: Math.round(worst) });
            } else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }), ms);
}

// Walk the live scene graph: InstancedMesh material breakdown + storage-flag count.
async function walkScene(page) {
    return page.evaluate(() => {
        const g = window.gameInstance;
        const scene = g?.scene ?? g?.sceneManager?.getScene?.() ?? null;
        if (!scene) return { error: 'no scene handle' };
        const byMaterial = {};
        let instMeshes = 0, storageFlagged = 0, shaderMaterialMeshes = 0;
        const shaderMaterialSamples = [];
        scene.traverse((o) => {
            if (o?.isInstancedMesh !== true) return;
            instMeshes++;
            const mat = Array.isArray(o.material) ? o.material[0] : o.material;
            const name = mat?.constructor?.name ?? 'null';
            byMaterial[name] = (byMaterial[name] || 0) + 1;
            if (o.instanceMatrix?.isStorageInstancedBufferAttribute === true) storageFlagged++;
            if (mat?.isShaderMaterial === true && mat?.isNodeMaterial !== true) {
                shaderMaterialMeshes++;
                if (shaderMaterialSamples.length < 8) {
                    shaderMaterialSamples.push({ meshName: o.name || o.userData?.konveyorNativeInstancing || '?', mat: name });
                }
            }
        });
        return { instMeshes, storageFlagged, shaderMaterialMeshes, byMaterial, shaderMaterialSamples };
    });
}

function categorize(text) {
    if (/used in submit while destroyed|used while destroyed/i.test(text)) return 'bufferDestroyed';
    if (/NodeBuilder[\s\S]*not compatible|not compatible[\s\S]*ShaderMaterial|Material "ShaderMaterial"/i.test(text)) return 'nodeBuilder';
    if (/validation|GPUValidation|invalid/i.test(text)) return 'otherValidation';
    return null;
}

async function run() {
    await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
    const result = { startedAt: new Date().toISOString(), runs: RUNS, perRun: [] };
    const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', args: GPU_ARGS });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
        window.__visHidden = 0;
        window.__visStates = [];
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') window.__visHidden++;
            window.__visStates.push(document.visibilityState);
        });
    });
    await page.bringToFront().catch(() => {});
    const counts = { bufferDestroyed: 0, nodeBuilder: 0, otherValidation: 0 };
    const samples = { bufferDestroyed: [], nodeBuilder: [], otherValidation: [] };
    const collect = (tag, text) => {
        const cat = categorize(text);
        if (!cat) return;
        counts[cat]++;
        if (samples[cat].length < 6) samples[cat].push(`[${tag}] ${text.slice(0, 200)}`);
    };
    page.on('console', (m) => collect(m.type(), m.text()));
    page.on('pageerror', (e) => collect('pageerror', String(e?.message || e)));
    page.on('crash', () => { result.crashed = true; });

    try {
        await bootAttract(page);
        result.effective = await page.evaluate(() => window.__sdsRendererMode?.effective ?? null);

        for (let i = 0; i < RUNS; i++) {
            const before = { ...counts };
            // Cold = first; warm = bounce off rolling-hills then back.
            if (i > 0) {
                await page.evaluate(() => { window.gameInstance.swapScene('rolling-hills').catch(() => {}); });
                await page.waitForFunction(() => window.gameInstance?.currentScene?.id === 'rolling-hills', null, { timeout: TIMEOUT }).catch(() => {});
                await page.waitForTimeout(1200);
            }
            const ms = await swapAndTime(page, 'newsheepdogland');
            // On the cold run, wait for the compileAsync prewarm to finish (it may
            // resolve after rendererReady) so we capture the TRUE compile cost, and
            // sample FPS longer to catch any settle hitch.
            if (i === 0) {
                await page.waitForFunction(() => window.__sdsPrewarm?.scene === 'newsheepdogland', null, { timeout: TIMEOUT }).catch(() => {});
                result.prewarm = await page.evaluate(() => window.__sdsPrewarm ?? null);
                result.visibility = await page.evaluate(() => ({ hidden: window.__visHidden, states: window.__visStates, now: document.visibilityState }));
            }
            const fps = await sampleFps(page, i === 0 ? 4000 : 2500);
            const status = await page.evaluate(() => window.gameInstance?.sceneManager?.getRenderStatus?.() ?? null);
            const perRun = {
                run: i, kind: i === 0 ? 'cold' : 'warm', ms, fps,
                rendererReady: status?.rendererReady ?? null,
                lastError: status?.lastError ?? null,
                deltaBufferDestroyed: counts.bufferDestroyed - before.bufferDestroyed,
                deltaNodeBuilder: counts.nodeBuilder - before.nodeBuilder,
            };
            if (i === 0) result.sceneWalk = await walkScene(page);
            result.perRun.push(perRun);
        }

        // Screenshot via CDP (Playwright page.screenshot hangs on the WebGPU canvas font-wait).
        try {
            const client = await page.context().newCDPSession(page);
            const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
            await mkdir(OUT_DIR, { recursive: true });
            await writeFile(resolve(OUT_DIR, 'pinlift-nsl.png'), Buffer.from(data, 'base64'));
            result.screenshot = 'ok';
        } catch (e) {
            result.screenshot = `failed: ${String(e?.message || e).slice(0, 80)}`;
        }
    } catch (err) {
        result.fatal = String(err?.stack || err?.message || err);
    } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
        result.endedAt = new Date().toISOString();
    }

    result.errorCounts = counts;
    result.errorSamples = samples;
    const coldMs = result.perRun[0]?.ms ?? null;
    result.gate = {
        withinBudget: coldMs != null && coldMs <= 22000, // ~16s storage floor + swap overhead headroom
        crashClean: result.crashed !== true && result.perRun.every(r => r.rendererReady === true),
        errorFree: counts.bufferDestroyed === 0 && counts.nodeBuilder === 0,
    };
    result.gate.pass = result.gate.withinBudget && result.gate.crashClean && result.gate.errorFree;

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, 'pinlift-verify.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
        effective: result.effective,
        runs: RUNS,
        prewarm: result.prewarm ?? null,
        visibility: result.visibility ?? null,
        coldMs,
        warmMs: result.perRun.slice(1).map(r => r.ms),
        fps: result.perRun.map(r => r.fps?.fps),
        sceneWalk: result.sceneWalk,
        errorCounts: counts,
        gate: result.gate,
        fatal: result.fatal ?? null,
        bufferDestroyedSample: samples.bufferDestroyed.slice(0, 3),
        nodeBuilderSample: samples.nodeBuilder.slice(0, 3),
    }, null, 2));
    console.log('Wrote', resolve(OUT_DIR, 'pinlift-verify.json'));
}

run().catch((e) => { console.error('[PINLIFT-VERIFY] fatal', e); process.exit(1); });
