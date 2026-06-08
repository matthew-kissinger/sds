// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 80 P1 spike probe. Does the Path 1 PRIMITIVE work: ONE consolidated grass
// InstancedMesh driven by a TSL renderer.compute() frustum-cull + drawIndexedIndirect,
// on WebGPU, in the real nsl cold-load? Measures:
//   - scene-walk: grass collapses to 1 InstancedMesh (down from ~744 per-chunk)
//   - cold worst main-thread long-task (hard-stop-1 proxy) + time-to-stable + fps
//   - the GPU-driven live instanceCount (window.__sdsGrassCullSpike.visible),
//     sampled over time: > 0 (renders) AND < count (per-instance cull is live)
//   - render-pipeline + WGSL counts (Dawn-boundary instrumentation), errors
//
// Sets window.__SDS_GRASS_COMPUTE_CULL=1 before app code. Needs the dev server
// (SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000) and the nsl `renderer:'webgl'`
// pin temporarily lifted (restore byte-identical after).
//
// Usage: RENDERER=webgpu node tools/webgpu-grass-compute-cull-probe-cycle80.mjs

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle80-validation');
const PROFILE = resolve(tmpdir(), 'sds-c80-grass-cull');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']
    : [];
const RENDERER = (process.env.RENDERER || 'webgpu').toLowerCase();
const COMPUTE_CULL = process.env.COMPUTE_CULL !== '0';
const TREE_CULL = process.env.TREE_CULL !== '0';
const TAG = `${RENDERER}-cull${COMPUTE_CULL ? 1 : 0}-tree${TREE_CULL ? 1 : 0}`;
const BASE = `http://localhost:3000/?renderer=${RENDERER}`;
const TIMEOUT = 200_000;

function installInstrumentation(cfg) {
    const W = window;
    if (cfg.computeCull) W.__SDS_GRASS_COMPUTE_CULL = 1;
    if (cfg.treeCull) W.__SDS_TREE_COMPUTE_CULL = 1;
    W.__longTasks = [];
    W.__ltZero = performance.now();
    try {
        new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
                W.__longTasks.push({ start: Math.round(e.startTime - W.__ltZero), dur: Math.round(e.duration) });
            }
        }).observe({ entryTypes: ['longtask'] });
    } catch {}
    if (W.__gpuInstrumented) return;
    W.__gpuInstrumented = true;
    W.__gpu = { modules: [], pipelines: [] };
    const moduleMeta = new WeakMap();
    let moduleSeq = 0;
    const hashStr = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; };
    const now = () => performance.now();
    function wrapDevice(dev) {
        if (!dev || dev.__sdsWrapped) return dev;
        dev.__sdsWrapped = true;
        const origSM = dev.createShaderModule.bind(dev);
        dev.createShaderModule = (desc) => {
            const code = desc?.code ?? '';
            const id = ++moduleSeq; const hash = hashStr(code);
            const mod = origSM(desc);
            moduleMeta.set(mod, { id, hash, len: code.length });
            W.__gpu.modules.push({ id, hash, len: code.length, t: now() });
            return mod;
        };
        const refOf = (m) => { const meta = m ? moduleMeta.get(m) : null; return meta ? { id: meta.id, hash: meta.hash, len: meta.len } : null; };
        const recordPipe = (kind, desc, t0, durationMs, async) => {
            const vs = refOf(desc?.vertex?.module); const fs = refOf(desc?.fragment?.module);
            W.__gpu.pipelines.push({ kind, async, t: t0, durationMs, vsHash: vs?.hash ?? null, fsHash: fs?.hash ?? null, wgsl: (vs?.len ?? 0) + (fs?.len ?? 0) });
        };
        for (const name of ['createRenderPipeline', 'createComputePipeline']) {
            const orig = dev[name].bind(dev);
            dev[name] = (desc) => { const t0 = now(); const p = orig(desc); recordPipe(name, desc, t0, now() - t0, false); return p; };
        }
        for (const name of ['createRenderPipelineAsync', 'createComputePipelineAsync']) {
            const orig = dev[name].bind(dev);
            dev[name] = (desc) => { const t0 = now(); return orig(desc).then((p) => { recordPipe(name, desc, t0, now() - t0, true); return p; }, (e) => { recordPipe(name, desc, t0, now() - t0, true); throw e; }); };
        }
        return dev;
    }
    const gpu = navigator.gpu;
    if (gpu && typeof gpu.requestAdapter === 'function') {
        const origRA = gpu.requestAdapter.bind(gpu);
        gpu.requestAdapter = async (opts) => {
            const adapter = await origRA(opts);
            if (adapter && !adapter.__sdsWrapped) {
                adapter.__sdsWrapped = true;
                const origRD = adapter.requestDevice.bind(adapter);
                adapter.requestDevice = async (d) => wrapDevice(await origRD(d));
            }
            return adapter;
        };
    }
}

function categorize(text) {
    if (/used in submit while destroyed|used while destroyed/i.test(text)) return 'bufferDestroyed';
    if (/NodeBuilder[\s\S]*not compatible|Material "ShaderMaterial"/i.test(text)) return 'nodeBuilder';
    if (/validation|GPUValidation|invalid/i.test(text)) return 'otherValidation';
    return null;
}

async function boot(page) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => !!window.gameInstance, null, { timeout: 60_000 });
    await page.waitForFunction(() => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true, null, { timeout: 60_000 }).catch(() => {});
    await page.evaluate(() => {
        window.__marks = [];
        const gi = window.gameInstance;
        if (gi?._reportLoadStep) {
            const orig = gi._reportLoadStep.bind(gi);
            gi._reportLoadStep = (label) => { window.__marks.push({ label, t: performance.now() }); return orig(label); };
        }
    });
}

async function walkScene(page) {
    return page.evaluate(() => {
        const g = window.gameInstance;
        const scene = g?.scene ?? g?.sceneManager?.getScene?.() ?? null;
        if (!scene) return { error: 'no scene handle' };
        const byMaterial = {};
        let instMeshes = 0, totalCap = 0, totalDraw = 0, indirectMeshes = 0;
        scene.traverse((o) => {
            if (o?.isInstancedMesh !== true) return;
            instMeshes++;
            const mat = Array.isArray(o.material) ? o.material[0] : o.material;
            const name = mat?.name || mat?.constructor?.name || 'null';
            byMaterial[name] = (byMaterial[name] || 0) + 1;
            totalCap += o.instanceMatrix?.count ?? 0; totalDraw += o.count ?? 0;
            if (o.geometry?.indirect) indirectMeshes++;
        });
        return { instMeshes, totalCap, totalDraw, indirectMeshes, byMaterial };
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
    const tBuild = await page.evaluate(() => { const m = window.__marks.find((x) => x.label === 'Scene body complete'); return m ? m.t : null; });
    const tReadyStart = Date.now();
    await page.waitForFunction(() => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true, null, { timeout: TIMEOUT }).catch(() => {});
    const tReadyMs = Date.now() - tReadyStart;
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
    await page.waitForTimeout(8000); // catch a late heavy block after "stable"
    const longTasks = await page.evaluate(() => window.__longTasks.slice().sort((a, b) => b.dur - a.dur));
    return {
        buildMs: tBuild != null ? Math.round(tBuild - t0) : null,
        tReadyMs, stableMs: stable.stableMs, lastFps: stable.lastFps,
        worstLongTaskMs: longTasks[0]?.dur ?? 0,
        sumLongTaskMs: longTasks.reduce((s, t) => s + t.dur, 0),
        top5LongTasks: longTasks.slice(0, 5),
    };
}

// Sample the GPU-driven live instanceCount over ~3s. count = capacity; visible
// should be > 0 (it renders) and < count (per-instance frustum cull is live).
async function sampleCull(page) {
    return page.evaluate(() => new Promise((res) => {
        const samples = []; let n = 0;
        const id = setInterval(() => {
            const d = window.__sdsGrassCullSpike;
            if (d && d.visible >= 0) samples.push(d.visible);
            if (++n >= 32) {
                clearInterval(id);
                const d2 = window.__sdsGrassCullSpike || {};
                res({
                    present: !!window.__sdsGrassCullSpike,
                    count: d2.count ?? null,
                    indirectAttached: d2.indirectAttached ?? null,
                    material: d2.material ?? null,
                    error: d2.error ?? null,
                    readbacks: d2.readbacks ?? 0,
                    samples,
                    min: samples.length ? Math.min(...samples) : null,
                    max: samples.length ? Math.max(...samples) : null,
                    last: samples.length ? samples[samples.length - 1] : null,
                });
            }
        }, 100);
    }));
}

async function run() {
    await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
    const result = { renderer: RENDERER, computeCull: COMPUTE_CULL, treeCull: TREE_CULL, startedAt: new Date().toISOString() };
    const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', args: GPU_ARGS });
    const page = await ctx.newPage();
    await page.addInitScript(installInstrumentation, { computeCull: COMPUTE_CULL, treeCull: TREE_CULL });
    await page.bringToFront().catch(() => {});
    const counts = { bufferDestroyed: 0, nodeBuilder: 0, otherValidation: 0 };
    const samples = { bufferDestroyed: [], nodeBuilder: [], otherValidation: [] };
    const collect = (tag, text) => { const cat = categorize(text); if (!cat) return; counts[cat]++; if (samples[cat].length < 5) samples[cat].push(`[${tag}] ${text.slice(0, 220)}`); };
    page.on('console', (m) => collect(m.type(), m.text()));
    page.on('pageerror', (e) => collect('pageerror', String(e?.message || e)));
    page.on('crash', () => { result.crashed = true; });
    try {
        await boot(page);
        result.effective = await page.evaluate(() => window.__sdsRendererMode?.effective ?? null);
        result.cullFlag = await page.evaluate(() => window.__SDS_GRASS_COMPUTE_CULL ?? null);
        const baseIdx = await page.evaluate(() => ({ p: window.__gpu.pipelines.length, m: window.__gpu.modules.length }));
        result.cold = await measure(page);
        result.cull = await sampleCull(page);
        result.sceneWalk = await walkScene(page);
        result.nsl = await page.evaluate((base) => {
            const pipes = window.__gpu.pipelines.slice(base.p);
            const mods = window.__gpu.modules.slice(base.m);
            const render = pipes.filter((p) => p.kind && p.kind.indexOf('Render') !== -1);
            const compute = pipes.filter((p) => p.kind && p.kind.indexOf('Compute') !== -1);
            const distinctLogical = new Set(render.map((p) => `${p.vsHash}|${p.fsHash}`));
            return {
                renderPipelines: render.length,
                computePipelines: compute.length,
                distinctLogicalRenderPipelines: distinctLogical.size,
                shaderModules: mods.length,
                totalShaderWgslChars: mods.reduce((s, m) => s + m.len, 0),
            };
        }, baseIdx);
        try {
            const client = await page.context().newCDPSession(page);
            const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
            await mkdir(OUT_DIR, { recursive: true });
            await writeFile(resolve(OUT_DIR, `cull-${TAG}.png`), Buffer.from(data, 'base64'));
            result.screenshot = 'ok';
        } catch (e) { result.screenshot = `failed: ${String(e?.message || e).slice(0, 80)}`; }
    } catch (err) {
        result.fatal = String(err?.stack || err?.message || err);
    } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
        result.endedAt = new Date().toISOString();
    }
    result.errorCounts = counts; result.errorSamples = samples;
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, `cull-${TAG}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
        renderer: RENDERER, computeCull: COMPUTE_CULL, effective: result.effective, cullFlag: result.cullFlag,
        cold: result.cold, cull: result.cull, nsl: result.nsl, sceneWalk: result.sceneWalk,
        errorCounts: counts, crashed: result.crashed ?? false, fatal: result.fatal ?? null,
    }, null, 2));
    console.log('Wrote', resolve(OUT_DIR, `cull-${TAG}.json`));
}
run().catch((e) => { console.error('[GRASS-CULL-C80] fatal', e); process.exit(1); });
