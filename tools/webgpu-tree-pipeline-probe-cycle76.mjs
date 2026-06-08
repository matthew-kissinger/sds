// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 76 P1 spike - WHERE do the ~76s of newsheepdogland "Creating trees" go?
//
// Cycle 75 proved the cost is GPU pipeline-compile work, per-build, not cacheable
// on Dawn. This probe decides the FIX SHAPE by instrumenting the WebGPU device at
// the Dawn boundary: it wraps GPUDevice.createShaderModule + createRenderPipeline +
// createRenderPipelineAsync (and compute variants), counts every call, times each,
// and fingerprints the WGSL so we can tell:
//
//   (A) MANY near-duplicate pipelines  -> distinct-pipeline count is high (hundreds),
//       but distinct WGSL (vs/fs hash pairs) is small -> Three emits one pipeline per
//       per-chunk InstancedMesh and Dawn re-compiles identical shaders. FIX: share the
//       material/geometry-layout across chunks (or coarsen chunkSize) so the count
//       collapses. QUALITY-PRESERVING (same instances/materials/positions).
//
//   (B) FEW catastrophically-expensive shaders -> distinct-pipeline count is small
//       (handful), each createRenderPipelineAsync takes seconds. FIX: compile cost
//       (precompile/cache or simplify the node material - the latter is a Matt taste
//       call, hard stop 2).
//
// Also builds nsl TWICE to confirm whether the WGSL fingerprints repeat across builds
// (the cache linchpin: identical WGSL + new module objects = Three not sharing modules).
//
// Needs the newsheepdogland WebGL pin temporarily lifted (restore byte-identical after).
// Run the dev server first: SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000
// Usage: node tools/webgpu-tree-pipeline-probe-cycle76.mjs

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle76-validation');
const PROFILE = resolve(tmpdir(), 'sds-c76-treepipe');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']
    : [];
const BASE = 'http://localhost:3000/';
const TIMEOUT = 200_000;

// Installed via addInitScript BEFORE any page script, so it wraps navigator.gpu
// before Three requests the adapter/device.
function installGpuInstrumentation() {
    const W = window;
    if (W.__gpuInstrumented) return;
    W.__gpuInstrumented = true;
    W.__gpu = { modules: [], pipelines: [], stepMarks: [] };
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
            W.__gpu.modules.push({ id, hash, len: code.length, t: now(), label: desc?.label ?? null });
            return mod;
        };

        const refOf = (m) => {
            const meta = m ? moduleMeta.get(m) : null;
            return meta ? { id: meta.id, hash: meta.hash, len: meta.len } : null;
        };
        const recordPipe = (kind, desc, t0, durationMs, async) => {
            const vs = refOf(desc?.vertex?.module);
            const fs = refOf(desc?.fragment?.module);
            const cs = refOf(desc?.compute?.module);
            W.__gpu.pipelines.push({
                kind, async, t: t0, durationMs,
                vsId: vs?.id ?? null, vsHash: vs?.hash ?? null,
                fsId: fs?.id ?? null, fsHash: fs?.hash ?? null,
                csId: cs?.id ?? null, csHash: cs?.hash ?? null,
                label: desc?.label ?? null,
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
                return orig(desc).then((p) => {
                    recordPipe(name, desc, t0, now() - t0, true);
                    return p;
                }, (e) => {
                    recordPipe(name, desc, t0, now() - t0, true);
                    throw e;
                });
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
    // Hook _reportLoadStep to timestamp each build step (same as the C75 probes).
    await page.evaluate(() => {
        const gi = window.gameInstance;
        const orig = gi._reportLoadStep.bind(gi);
        gi._reportLoadStep = (label) => {
            window.__gpu.stepMarks.push({ label, t: performance.now() });
            return orig(label);
        };
    });
}

// Slice the module/pipeline records to the [Creating trees, next step] window of the
// most-recent build, and summarize.
function summarizeWindow(gpu, buildIndex) {
    // stepMarks accumulate across builds; find the buildIndex-th "Creating trees".
    const treeMarks = gpu.stepMarks.filter((m) => m.label === 'Creating trees');
    const start = treeMarks[buildIndex]?.t ?? null;
    if (start == null) return null;
    // end = the first step mark strictly after start.
    const after = gpu.stepMarks.filter((m) => m.t > start).sort((a, b) => a.t - b.t);
    const end = after.length ? after[0].t : Infinity;

    const mods = gpu.modules.filter((m) => m.t >= start && m.t < end);
    const pipes = gpu.pipelines.filter((p) => p.t >= start && p.t < end);
    const renderPipes = pipes.filter((p) => p.kind === 'createRenderPipeline' || p.kind === 'createRenderPipelineAsync');

    const distinctModuleHashes = new Set(mods.map((m) => m.hash));
    const distinctLogicalPipes = new Set(renderPipes.map((p) => `${p.vsHash}|${p.fsHash}`));
    const asyncPipes = renderPipes.filter((p) => p.async);
    const totalAsyncMs = asyncPipes.reduce((s, p) => s + p.durationMs, 0);
    const maxAsyncMs = asyncPipes.reduce((s, p) => Math.max(s, p.durationMs), 0);
    const totalSyncMs = renderPipes.filter((p) => !p.async).reduce((s, p) => s + p.durationMs, 0);

    return {
        windowMs: end === Infinity ? null : Math.round(end - start),
        shaderModules: mods.length,
        distinctShaderModuleHashes: distinctModuleHashes.size,
        totalShaderWgslChars: mods.reduce((s, m) => s + m.len, 0),
        maxShaderWgslChars: mods.reduce((s, m) => Math.max(s, m.len), 0),
        renderPipelines: renderPipes.length,
        distinctLogicalRenderPipelines: distinctLogicalPipes.size,
        asyncRenderPipelines: asyncPipes.length,
        totalAsyncCompileMs: Math.round(totalAsyncMs),
        maxAsyncCompileMs: Math.round(maxAsyncMs),
        totalSyncPipelineMs: Math.round(totalSyncMs),
        // The decisive ratio: calls per distinct logical shader. >> 1 means Three
        // recompiles identical shaders per chunk (COUNT problem, quality-preserving fix).
        pipelineCallsPerDistinctLogical: distinctLogicalPipes.size
            ? +(renderPipes.length / distinctLogicalPipes.size).toFixed(1) : null,
    };
}

async function swapAndSettle(page, target) {
    await page.evaluate((t) => {
        window.gameInstance.swapScene(t).catch((e) => { window.__err = String(e?.message || e); });
    }, target);
    await page.waitForFunction((t) => window.gameInstance?.currentScene?.id === t, target, { timeout: TIMEOUT }).catch(() => {});
    await page.waitForFunction(
        () => window.__gpu.stepMarks.some((s) => s.label === 'Scene body complete'),
        null, { timeout: TIMEOUT },
    ).catch(() => {});
    // let any async pipeline promises resolve + a couple frames settle
    await page.waitForTimeout(3000);
}

async function run() {
    await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
    const result = { startedAt: new Date().toISOString(), tool: 'webgpu-tree-pipeline-probe-cycle76' };
    const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', args: GPU_ARGS });
    const page = await ctx.newPage();
    await page.addInitScript(installGpuInstrumentation);
    const logs = [];
    page.on('console', (m) => logs.push(`[${Date.now()}] ${m.text()}`));
    page.on('crash', () => logs.push('[crash]'));
    try {
        await bootAttract(page);
        result.effective = await page.evaluate(() => window.__sdsRendererMode?.effective ?? null);
        result.adapterInfo = await page.evaluate(() => {
            const a = window.gameInstance?.sceneManager?.getRenderStatus?.();
            return a ? { rendererReady: a.rendererReady, lastError: a.lastError ?? null } : null;
        });

        // Build 1: cold device.
        const t0 = Date.now();
        await swapAndSettle(page, 'newsheepdogland');
        result.build1WallMs = Date.now() - t0;

        // Reset to a light scene, then Build 2: device warm.
        await swapAndSettle(page, 'rolling-hills');
        const t1 = Date.now();
        await swapAndSettle(page, 'newsheepdogland');
        result.build2WallMs = Date.now() - t1;

        const gpu = await page.evaluate(() => window.__gpu);
        result.totals = {
            allShaderModules: gpu.modules.length,
            allRenderPipelines: gpu.pipelines.filter((p) => p.kind.startsWith('createRenderPipeline')).length,
            allComputePipelines: gpu.pipelines.filter((p) => p.kind.startsWith('createComputePipeline')).length,
        };
        result.build1 = summarizeWindow(gpu, 0);
        result.build2 = summarizeWindow(gpu, 1);

        // Cross-build cache question: do build-2's tree shader-module hashes repeat
        // build-1's? (identical WGSL across builds = Three creating new modules for
        // the same shader = sharing/caching would help).
        const treeMarks = gpu.stepMarks.filter((m) => m.label === 'Creating trees');
        if (treeMarks.length >= 2) {
            const win = (i) => {
                const start = treeMarks[i].t;
                const after = gpu.stepMarks.filter((m) => m.t > start).sort((a, b) => a.t - b.t);
                const end = after.length ? after[0].t : Infinity;
                return new Set(gpu.modules.filter((m) => m.t >= start && m.t < end).map((m) => m.hash));
            };
            const h1 = win(0), h2 = win(1);
            const overlap = [...h2].filter((h) => h1.has(h)).length;
            result.crossBuild = {
                build1DistinctHashes: h1.size,
                build2DistinctHashes: h2.size,
                build2HashesAlsoInBuild1: overlap,
                identicalWgslAcrossBuilds: h2.size > 0 && overlap === h2.size,
            };
        }
        result.logTail = logs.slice(-40);
    } catch (err) {
        result.fatal = String(err?.stack || err?.message || err);
        result.logTail = logs.slice(-40);
    } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
        result.endedAt = new Date().toISOString();
    }
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, 'tree-pipeline-probe.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
        effective: result.effective,
        build1WallMs: result.build1WallMs,
        build2WallMs: result.build2WallMs,
        build1: result.build1,
        build2: result.build2,
        crossBuild: result.crossBuild,
        totals: result.totals,
        fatal: result.fatal ?? null,
    }, null, 2));
    console.log('Wrote', resolve(OUT_DIR, 'tree-pipeline-probe.json'));
}

run().catch((e) => { console.error('[TREE-PIPELINE] fatal', e); process.exit(1); });
