// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 78 P1 spike - does a UNIFORM per-chunk instance capacity collapse the
// newsheepdogland WebGPU pipeline COUNT?
//
// Cycle 76 measured the cold nsl build at 967 render pipelines / 967 DISTINCT WGSL
// modules (ratio 1.0) - every per-chunk InstancedMesh emits its own shader because
// the node path bakes the instance count into the vertex shader as the uniform-array
// size `array<mat4x4, N>`. Grass + tree chunks oversample-then-filter to a different
// count each, so N differs per chunk -> ~950 distinct pipelines -> ~80s of Dawn
// compile (the real wall; Cycle 77's "16s" was time-to-renderable).
//
// The fix under test (js/GrassSystem.js + js/world/TreePlacement.js, flag-gated on
// globalThis.__SDS_COUNT_COLLAPSE): allocate every chunk's instanceMatrix at a
// UNIFORM capacity and draw only the real count. Identical N -> identical WGSL ->
// ONE pipeline per material. This probe instruments the Dawn boundary
// (createRenderPipeline[Async] + createShaderModule), isolates the nsl build via a
// delta snapshot, and reports the pipeline count + distinct-WGSL count + WGSL bytes,
// plus secondary time signals (wall, compileAsyncMs), errors, a scene-graph walk
// (capacity vs draw-count sanity), and a screenshot for the visual check.
//
// Needs the newsheepdogland WebGL pin temporarily lifted (restore byte-identical after).
// Run the dev server first: SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000
// Usage: COLLAPSE=off|grass|trees|both node tools/webgpu-count-collapse-probe-cycle78.mjs

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle78-validation');
const PROFILE = resolve(tmpdir(), 'sds-c78-collapse');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']
    : [];
const BASE = 'http://localhost:3000/';
const TIMEOUT = 200_000;
const MODE = (process.env.COLLAPSE || 'off').toLowerCase();

function installGpuInstrumentation(mode) {
    const W = window;
    W.__SDS_COUNT_COLLAPSE = mode === 'off' ? undefined : mode;
    W.__visHidden = 0;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') W.__visHidden++;
    });
    if (W.__gpuInstrumented) return;
    W.__gpuInstrumented = true;
    W.__gpu = { modules: [], pipelines: [] };
    const moduleMeta = new WeakMap();
    let moduleSeq = 0;
    const hashStr = (s) => {
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return h >>> 0;
    };
    const now = () => performance.now();

    function wrapDevice(dev) {
        if (!dev || dev.__sdsWrapped) return dev;
        dev.__sdsWrapped = true;
        const origSM = dev.createShaderModule.bind(dev);
        dev.createShaderModule = (desc) => {
            const code = desc?.code ?? '';
            const id = ++moduleSeq;
            const hash = hashStr(code);
            const mod = origSM(desc);
            moduleMeta.set(mod, { id, hash, len: code.length });
            W.__gpu.modules.push({ id, hash, len: code.length, t: now() });
            return mod;
        };
        const refOf = (m) => {
            const meta = m ? moduleMeta.get(m) : null;
            return meta ? { id: meta.id, hash: meta.hash, len: meta.len } : null;
        };
        const recordPipe = (kind, desc, t0, durationMs, async) => {
            const vs = refOf(desc?.vertex?.module);
            const fs = refOf(desc?.fragment?.module);
            W.__gpu.pipelines.push({
                kind, async, t: t0, durationMs,
                vsHash: vs?.hash ?? null, fsHash: fs?.hash ?? null,
                wgsl: (vs?.len ?? 0) + (fs?.len ?? 0),
            });
        };
        for (const name of ['createRenderPipeline', 'createComputePipeline']) {
            const orig = dev[name].bind(dev);
            dev[name] = (desc) => {
                const t0 = now();
                const p = orig(desc);
                recordPipe(name, desc, t0, now() - t0, false);
                return p;
            };
        }
        for (const name of ['createRenderPipelineAsync', 'createComputePipelineAsync']) {
            const orig = dev[name].bind(dev);
            dev[name] = (desc) => {
                const t0 = now();
                return orig(desc).then((p) => { recordPipe(name, desc, t0, now() - t0, true); return p; },
                    (e) => { recordPipe(name, desc, t0, now() - t0, true); throw e; });
            };
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

async function bootAttract(page) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => !!window.gameInstance, null, { timeout: 60_000 });
    await page.waitForFunction(() => {
        const rs = window.gameInstance?.sceneManager?.getRenderStatus?.();
        return window.__sdsAttractActive === true && rs && rs.rendererReady === true;
    }, null, { timeout: 60_000 });
}

function categorize(text) {
    if (/used in submit while destroyed|used while destroyed/i.test(text)) return 'bufferDestroyed';
    if (/NodeBuilder[\s\S]*not compatible|Material "ShaderMaterial"/i.test(text)) return 'nodeBuilder';
    if (/validation|GPUValidation|invalid/i.test(text)) return 'otherValidation';
    return null;
}

async function sampleFps(page, ms = 3000) {
    return page.evaluate((dur) => new Promise((res) => {
        let frames = 0; const t0 = performance.now(); let last = t0; let worst = 0;
        function tick(now) {
            frames++; const dt = now - last; last = now; if (dt > worst) worst = dt;
            if (now - t0 >= dur) res({ fps: Math.round((frames / (now - t0)) * 1000), worstFrameMs: Math.round(worst) });
            else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }), ms);
}

async function walkScene(page) {
    return page.evaluate(() => {
        const g = window.gameInstance;
        const scene = g?.scene ?? g?.sceneManager?.getScene?.() ?? null;
        if (!scene) return { error: 'no scene handle' };
        const byMaterial = {};
        let instMeshes = 0, capGtDraw = 0, totalCap = 0, totalDraw = 0;
        const samples = [];
        scene.traverse((o) => {
            if (o?.isInstancedMesh !== true) return;
            instMeshes++;
            const mat = Array.isArray(o.material) ? o.material[0] : o.material;
            const name = mat?.constructor?.name ?? 'null';
            byMaterial[name] = (byMaterial[name] || 0) + 1;
            const cap = o.instanceMatrix?.count ?? 0;
            const draw = o.count ?? 0;
            totalCap += cap; totalDraw += draw;
            if (cap > draw) capGtDraw++;
            if (samples.length < 6) samples.push({ kind: o.userData?.konveyorNativeInstancing || name, cap, draw });
        });
        return { instMeshes, capGtDraw, totalCap, totalDraw, byMaterial, samples };
    });
}

async function run() {
    await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
    const result = { startedAt: new Date().toISOString(), mode: MODE };
    const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', args: GPU_ARGS });
    const page = await ctx.newPage();
    await page.addInitScript(installGpuInstrumentation, MODE);
    await page.bringToFront().catch(() => {});
    const counts = { bufferDestroyed: 0, nodeBuilder: 0, otherValidation: 0 };
    const samples = { bufferDestroyed: [], nodeBuilder: [], otherValidation: [] };
    const collect = (tag, text) => {
        const cat = categorize(text); if (!cat) return;
        counts[cat]++; if (samples[cat].length < 5) samples[cat].push(`[${tag}] ${text.slice(0, 180)}`);
    };
    page.on('console', (m) => collect(m.type(), m.text()));
    page.on('pageerror', (e) => collect('pageerror', String(e?.message || e)));
    page.on('crash', () => { result.crashed = true; });

    try {
        await bootAttract(page);
        result.effective = await page.evaluate(() => window.__sdsRendererMode?.effective ?? null);
        result.collapseFlag = await page.evaluate(() => window.__SDS_COUNT_COLLAPSE ?? null);
        result.uniformLimit = await page.evaluate(() => {
            try { return window.gameInstance?.sceneManager?.renderer?.backend?.device?.limits?.maxUniformBufferBindingSize ?? null; }
            catch { return null; }
        });

        // Delta snapshot: mark the GPU-counter length BEFORE the nsl swap so we
        // isolate nsl's pipelines from attract's.
        const baseIdx = await page.evaluate(() => ({ p: window.__gpu.pipelines.length, m: window.__gpu.modules.length }));

        const t0 = Date.now();
        await page.evaluate(() => { window.gameInstance.swapScene('newsheepdogland').catch((e) => { window.__err = String(e?.message || e); }); });
        await page.waitForFunction(() => window.gameInstance?.currentScene?.id === 'newsheepdogland', null, { timeout: TIMEOUT }).catch(() => {});
        await page.waitForFunction(() => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true, null, { timeout: TIMEOUT }).catch(() => {});
        result.coldWallToReadyMs = Date.now() - t0;
        await page.waitForFunction(() => window.__sdsPrewarm?.scene === 'newsheepdogland', null, { timeout: TIMEOUT }).catch(() => {});
        await page.waitForTimeout(4000); // let async pipeline promises + Dawn settle
        result.coldWallSettledMs = Date.now() - t0;

        result.prewarm = await page.evaluate(() => window.__sdsPrewarm ?? null);
        result.visibility = await page.evaluate(() => ({ hidden: window.__visHidden, now: document.visibilityState }));
        result.fps = await sampleFps(page, 3000);
        result.sceneWalk = await walkScene(page);

        // Slice the nsl window from the delta.
        result.nsl = await page.evaluate((base) => {
            const pipes = window.__gpu.pipelines.slice(base.p);
            const mods = window.__gpu.modules.slice(base.m);
            const render = pipes.filter((p) => p.kind && p.kind.indexOf('Render') !== -1);
            const distinctLogical = new Set(render.map((p) => `${p.vsHash}|${p.fsHash}`));
            const distinctMod = new Set(mods.map((m) => m.hash));
            return {
                renderPipelines: render.length,
                distinctLogicalRenderPipelines: distinctLogical.size,
                shaderModules: mods.length,
                distinctShaderModuleHashes: distinctMod.size,
                totalShaderWgslChars: mods.reduce((s, m) => s + m.len, 0),
                totalSyncPipelineMs: Math.round(render.filter((p) => !p.async).reduce((s, p) => s + p.durationMs, 0)),
                totalAsyncPipelineMs: Math.round(render.filter((p) => p.async).reduce((s, p) => s + p.durationMs, 0)),
                callsPerDistinctLogical: distinctLogical.size ? +(render.length / distinctLogical.size).toFixed(2) : null,
            };
        }, baseIdx);

        try {
            const client = await page.context().newCDPSession(page);
            const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
            await mkdir(OUT_DIR, { recursive: true });
            await writeFile(resolve(OUT_DIR, `collapse-${MODE}.png`), Buffer.from(data, 'base64'));
            result.screenshot = 'ok';
        } catch (e) { result.screenshot = `failed: ${String(e?.message || e).slice(0, 80)}`; }
    } catch (err) {
        result.fatal = String(err?.stack || err?.message || err);
    } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
        result.endedAt = new Date().toISOString();
    }
    result.errorCounts = counts;
    result.errorSamples = samples;
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, `collapse-${MODE}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
        mode: MODE, effective: result.effective, collapseFlag: result.collapseFlag,
        uniformLimit: result.uniformLimit, coldWallToReadyMs: result.coldWallToReadyMs,
        coldWallSettledMs: result.coldWallSettledMs, compileAsyncMs: result.prewarm?.compileAsyncMs ?? null,
        fps: result.fps, visibility: result.visibility, nsl: result.nsl, sceneWalk: result.sceneWalk,
        errorCounts: counts, fatal: result.fatal ?? null,
        bufferDestroyedSample: samples.bufferDestroyed.slice(0, 2),
    }, null, 2));
    console.log('Wrote', resolve(OUT_DIR, `collapse-${MODE}.json`));
}

run().catch((e) => { console.error('[COUNT-COLLAPSE] fatal', e); process.exit(1); });
