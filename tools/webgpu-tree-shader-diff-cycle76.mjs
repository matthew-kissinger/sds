// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 76 P1 follow-up - WHAT differs between two tree shaders?
//
// The pipeline probe found 968 LOGICALLY DISTINCT tree shaders on a cold nsl build,
// all reused on build 2 (so the per-mesh divergence is deterministic + stable). This
// probe captures the full WGSL of the tree-window shader modules, finds two of the
// same length but different content, and prints the character-level diff so we can see
// exactly what is baked per-mesh (a chunk literal? an instance count? a uniform-name
// index?). That tells us whether the divergence is incidental (collapsible -> share one
// shader, quality-preserving) or essential.
//
// Needs the newsheepdogland WebGL pin temporarily lifted.
// Run the dev server first: SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000
// Usage: node tools/webgpu-tree-shader-diff-cycle76.mjs

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle76-validation');
const PROFILE = resolve(tmpdir(), 'sds-c76-shaderdiff');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']
    : [];
const BASE = 'http://localhost:3000/';
const TIMEOUT = 200_000;

function installCapture() {
    const W = window;
    if (W.__capInstalled) return;
    W.__capInstalled = true;
    W.__cap = { codes: [], creating: false };
    function wrapDevice(dev) {
        if (!dev || dev.__capWrapped) return dev;
        dev.__capWrapped = true;
        const origSM = dev.createShaderModule.bind(dev);
        dev.createShaderModule = (desc) => {
            if (W.__cap.creating) {
                const code = desc?.code ?? '';
                // cap memory: keep code only if a short-ish foliage shader
                W.__cap.codes.push(code);
            }
            return origSM(desc);
        };
        return dev;
    }
    const gpu = navigator.gpu;
    if (gpu && typeof gpu.requestAdapter === 'function') {
        const origRA = gpu.requestAdapter.bind(gpu);
        gpu.requestAdapter = async (opts) => {
            const adapter = await origRA(opts);
            if (adapter && !adapter.__capWrapped) {
                adapter.__capWrapped = true;
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
    // Toggle the capture `creating` flag exactly around the tree window.
    await page.evaluate(() => {
        const gi = window.gameInstance;
        const orig = gi._reportLoadStep.bind(gi);
        gi._reportLoadStep = (label) => {
            if (label === 'Creating trees') window.__cap.creating = true;
            else if (window.__cap.creating) window.__cap.creating = false;
            return orig(label);
        };
    });
}

function charDiff(a, b, maxDiffs = 10) {
    const diffs = [];
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && diffs.length < maxDiffs) {
        if (a[i] !== b[i]) {
            const ctxA = a.slice(Math.max(0, i - 50), i + 50);
            const ctxB = b.slice(Math.max(0, i - 50), i + 50);
            diffs.push({ pos: i, a: ctxA, b: ctxB });
            i += 60;
        } else i++;
    }
    return diffs;
}

async function run() {
    await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
    const result = { startedAt: new Date().toISOString() };
    const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', args: GPU_ARGS });
    const page = await ctx.newPage();
    await page.addInitScript(installCapture);
    try {
        await bootAttract(page);
        result.effective = await page.evaluate(() => window.__sdsRendererMode?.effective ?? null);
        await page.evaluate((t) => { window.gameInstance.swapScene(t).catch(() => {}); }, 'newsheepdogland');
        await page.waitForFunction(() => window.gameInstance?.currentScene?.id === 'newsheepdogland', null, { timeout: TIMEOUT }).catch(() => {});
        await page.waitForFunction(() => window.__cap.creating === false && window.__cap.codes.length > 0, null, { timeout: TIMEOUT }).catch(() => {});
        await page.waitForTimeout(2000);

        const analysis = await page.evaluate(() => {
            const codes = window.__cap.codes;
            const byLen = new Map();
            for (const c of codes) {
                const k = c.length;
                if (!byLen.has(k)) byLen.set(k, []);
                byLen.get(k).push(c);
            }
            // find the length bucket with the most entries that has >=2 distinct strings
            let best = null;
            for (const [len, arr] of byLen) {
                const distinct = [...new Set(arr)];
                if (distinct.length >= 2) {
                    if (!best || arr.length > best.count) best = { len, count: arr.length, distinctCount: distinct.length, a: distinct[0], b: distinct[1] };
                }
            }
            return {
                totalCaptured: codes.length,
                lenHistogram: [...byLen.entries()].map(([len, arr]) => ({ len, count: arr.length, distinct: new Set(arr).size })).sort((x, y) => y.count - x.count).slice(0, 12),
                best,
            };
        });

        result.totalCaptured = analysis.totalCaptured;
        result.lenHistogram = analysis.lenHistogram;
        if (analysis.best) {
            result.bucketLen = analysis.best.len;
            result.bucketCount = analysis.best.count;
            result.bucketDistinct = analysis.best.distinctCount;
            result.diffs = charDiff(analysis.best.a, analysis.best.b);
            await mkdir(resolve(OUT_DIR, 'shaders'), { recursive: true });
            await writeFile(resolve(OUT_DIR, 'shaders', 'tree-shader-A.wgsl'), analysis.best.a);
            await writeFile(resolve(OUT_DIR, 'shaders', 'tree-shader-B.wgsl'), analysis.best.b);
        }
    } catch (err) {
        result.fatal = String(err?.stack || err?.message || err);
    } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
        result.endedAt = new Date().toISOString();
    }
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, 'tree-shader-diff.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
        effective: result.effective,
        totalCaptured: result.totalCaptured,
        lenHistogram: result.lenHistogram,
        bucketLen: result.bucketLen,
        bucketCount: result.bucketCount,
        bucketDistinct: result.bucketDistinct,
        diffs: result.diffs,
        fatal: result.fatal ?? null,
    }, null, 2));
    console.log('Wrote', resolve(OUT_DIR, 'tree-shader-diff.json'));
}

run().catch((e) => { console.error('[SHADER-DIFF] fatal', e); process.exit(1); });
