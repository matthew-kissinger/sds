// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 82 Phase 4 - production-build steady-state profile for newsheepdogland.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { WEBGPU_DESKTOP_BUDGET } from '../js/perf/RenderCostReport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']
    : ['--enable-gpu', '--ignore-gpu-blocklist'];

function parseArgs(argv) {
    const defaults = {
        baseUrl: 'http://127.0.0.1:4173/',
        runs: '5',
        warmupMs: '12000',
        measureMs: '15000',
        out: 'cycle82-validation/steady-state-profile-3070.json',
        screenshotDir: 'cycle82-validation/steady-state-profile-screens',
        channel: 'chrome',
        headless: '0',
    };
    const parsed = { ...defaults };
    for (const arg of argv.slice(2)) {
        const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
        if (!match) continue;
        const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        parsed[key] = match[2];
    }
    return {
        ...parsed,
        runs: Number(parsed.runs),
        warmupMs: Number(parsed.warmupMs),
        measureMs: Number(parsed.measureMs),
        headless: parsed.headless === '1' || parsed.headless === 'true',
    };
}

function round(value, digits = 3) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Number(value.toFixed(digits))
        : value;
}

function buildUrl(baseUrl) {
    const url = new URL(baseUrl);
    url.searchParams.set('renderer', 'webgpu');
    url.searchParams.set('scene', 'newsheepdogland');
    url.searchParams.set('perfMode', '1');
    url.searchParams.set('probeRender', '1');
    url.searchParams.set('autostart', '1');
    url.searchParams.set('mode', 'classic');
    return url.href;
}

async function sceneWalk(page) {
    return page.evaluate(() => {
        const scene = window.gameInstance?.scene ?? window.gameInstance?.sceneManager?.getScene?.() ?? null;
        const byMaterial = {};
        let instMeshes = 0;
        let totalDraw = 0;
        let indirectMeshes = 0;
        scene?.traverse?.((obj) => {
            if (obj?.isInstancedMesh !== true) return;
            instMeshes++;
            const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
            const name = mat?.name || mat?.constructor?.name || 'unknown';
            byMaterial[name] = (byMaterial[name] || 0) + 1;
            totalDraw += obj.count ?? 0;
            if (obj.geometry?.indirect) indirectMeshes++;
        });
        return { instMeshes, totalDraw, indirectMeshes, byMaterial };
    });
}

async function captureRun(args, runIndex) {
    const profile = resolve(tmpdir(), `sds-c82-steady-${Date.now()}-${runIndex}`);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    const context = await chromium.launchPersistentContext(profile, {
        channel: args.channel || undefined,
        headless: args.headless,
        args: GPU_ARGS,
        viewport: { width: 1600, height: 900 },
        hasTouch: false,
        isMobile: false,
        serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
    });
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error).slice(0, 500)));
    page.on('crash', () => pageErrors.push('page crashed'));

    try {
        await page.addInitScript(() => {
            try { localStorage.removeItem('sds-renderer-fallback'); } catch {}
        });
        await page.goto(buildUrl(args.baseUrl), { waitUntil: 'domcontentloaded', timeout: 60_000 });
        const navigationStartedAt = Date.now();
        await page.waitForFunction(() => window.__sdsG?.productionWebGpu?.ok === true || !!window.__sdsG?.productionWebGpu?.error, null, { timeout: 120_000 });
        await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
        const readyMs = Date.now() - navigationStartedAt;
        await page.bringToFront().catch(() => {});
        await page.waitForTimeout(args.warmupMs);
        await page.evaluate(() => {
            window.__perfHarness.reset?.();
            window.__perfHarness.setCameraPose?.('follow-close');
            window.__perfHarness.setSystemIsolation?.('full');
        });
        const duration = await page.evaluate((measureMs) => window.__perfHarness.startSampling(measureMs), args.measureMs);
        await page.waitForTimeout(Number(duration) + 1000);
        await page.waitForTimeout(500);

        if (runIndex === 1) {
            await mkdir(resolve(ROOT, args.screenshotDir), { recursive: true });
            await page.screenshot({
                path: resolve(ROOT, args.screenshotDir, 'run-1.png'),
                fullPage: false,
            });
        }

        const state = await page.evaluate(() => {
            const renderer = window.__sdsRenderer ?? window.gameInstance?.sceneManager?.getRenderer?.() ?? null;
            const summary = window.__perfHarness?.getSummary?.() ?? null;
            const qualityState = window.gameInstance?.qualityGovernor?.getState?.() ?? {};
            return {
                url: window.location.href,
                currentSceneId: window.__currentSceneId ?? window.gameInstance?.currentScene?.id ?? null,
                rendererMode: window.__sdsRendererMode ?? null,
                productionWebGpu: window.__sdsG?.productionWebGpu ?? null,
                renderer: {
                    className: renderer?.constructor?.name ?? null,
                    isWebGPURenderer: renderer?.isWebGPURenderer === true,
                    calls: renderer?.info?.render?.calls ?? null,
                    triangles: renderer?.info?.render?.triangles ?? null,
                },
                perfSummary: summary,
                qualityState,
                visualProbe: window.__perfHarness?.getVisualProbe?.() ?? null,
                fallbackFlag: (() => {
                    try { return localStorage.getItem('sds-renderer-fallback'); } catch { return null; }
                })(),
                grassCull: window.__sdsGrassComputeCull
                    ? {
                        present: true,
                        count: window.__sdsGrassComputeCull.count ?? null,
                        visible: window.__sdsGrassComputeCull.visible ?? null,
                        indirectAttached: window.__sdsGrassComputeCull.indirectAttached ?? null,
                        error: window.__sdsGrassComputeCull.error ?? null,
                    }
                    : { present: false },
            };
        });
        state.readyMs = readyMs;
        state.sceneWalk = await sceneWalk(page);
        const summary = state.perfSummary;
        const quality = state.qualityState;
        const budget = quality?.lastWindow?.budget ?? WEBGPU_DESKTOP_BUDGET;
        const checks = {
            sceneMatches: state.currentSceneId === 'newsheepdogland',
            effectiveProductionWebGpu: state.rendererMode?.effective === 'webgpu-production',
            noFallbackReason: state.rendererMode?.fallbackReason == null,
            noStickyFallbackFlag: state.fallbackFlag == null,
            productionStateOk: state.productionWebGpu?.ok === true,
            devicePreflightOk: state.productionWebGpu?.devicePreflight?.ok === true,
            rendererWebGpu: state.renderer?.isWebGPURenderer === true || state.renderer?.className === 'WebGPURenderer',
            perfSampled: (summary?.sampleCount ?? 0) >= Math.floor(args.measureMs / 1000 * 50),
            p95WithinBudget: (summary?.p95FrameTime ?? Infinity) <= budget.frameP95,
            p99WithinBudget: (summary?.p99FrameTime ?? Infinity) <= budget.frameP99,
            qualityIndexZero: quality?.qualityIndex === 0,
            grassComputeCullPresent: state.grassCull?.present === true,
            grassComputeCullNoError: state.grassCull?.error == null,
            instancedMeshCountHeld: (state.sceneWalk?.instMeshes ?? Infinity) <= 12,
            noConsoleErrors: consoleErrors.length === 0,
            noPageErrors: pageErrors.length === 0,
        };
        return {
            run: runIndex,
            capturedAt: new Date().toISOString(),
            warmupMs: args.warmupMs,
            measureMs: args.measureMs,
            budget,
            ...state,
            perfSummary: summary == null ? null : {
                ...summary,
                avgFrameTime: round(summary.avgFrameTime),
                p50FrameTime: round(summary.p50FrameTime),
                p95FrameTime: round(summary.p95FrameTime),
                p99FrameTime: round(summary.p99FrameTime),
                maxFrameTime: round(summary.maxFrameTime),
                avgDrawCalls: round(summary.avgDrawCalls),
                avgTriangles: round(summary.avgTriangles),
                avgEstimatedTriangles: round(summary.avgEstimatedTriangles),
                avgActiveSheep: round(summary.avgActiveSheep),
            },
            qualityState: quality == null ? null : {
                ...quality,
                lastWindow: quality.lastWindow == null ? null : {
                    ...quality.lastWindow,
                    frameP95: round(quality.lastWindow.frameP95),
                    frameP99: round(quality.lastWindow.frameP99),
                },
            },
            visualProbe: state.visualProbe == null ? null : {
                sceneId: state.visualProbe.sceneId,
                renderer: state.visualProbe.renderer,
                qualityState: state.visualProbe.qualityState,
                grass: state.visualProbe.grass,
                dog: state.visualProbe.dog,
                sheep: state.visualProbe.sheep,
            },
            consoleErrors,
            pageErrors,
            checks,
            diagnostics: {
                qualityWindowPresent: quality?.lastWindow != null,
            },
            ok: Object.values(checks).every(Boolean),
        };
    } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
        await rm(profile, { recursive: true, force: true }).catch(() => {});
    }
}

function aggregate(runs) {
    const summaries = runs.map((run) => run.perfSummary).filter(Boolean);
    const p95s = summaries.map((summary) => summary.p95FrameTime).filter(Number.isFinite);
    const p99s = summaries.map((summary) => summary.p99FrameTime).filter(Number.isFinite);
    const avgs = summaries.map((summary) => summary.avgFrameTime).filter(Number.isFinite);
    return {
        runCount: runs.length,
        passCount: runs.filter((run) => run.ok).length,
        worstP95FrameTime: round(Math.max(...p95s)),
        worstP99FrameTime: round(Math.max(...p99s)),
        meanAvgFrameTime: round(avgs.reduce((sum, value) => sum + value, 0) / Math.max(1, avgs.length)),
        allQualityIndexZero: runs.every((run) => run.qualityState?.qualityIndex === 0),
        allProductionWebGpu: runs.every((run) => run.rendererMode?.effective === 'webgpu-production'),
        allNoFallback: runs.every((run) => run.rendererMode?.fallbackReason == null && run.fallbackFlag == null),
        allGrassComputeCull: runs.every((run) => run.grassCull?.present === true && run.grassCull?.error == null),
        allNoErrors: runs.every((run) => run.consoleErrors.length === 0 && run.pageErrors.length === 0),
    };
}

async function run() {
    const args = parseArgs(process.argv);
    const runs = [];
    for (let i = 1; i <= args.runs; i++) {
        console.log(`[C82-PROFILE] run ${i}/${args.runs}`);
        const result = await captureRun(args, i);
        runs.push(result);
        const summary = result.perfSummary;
        console.log(JSON.stringify({
            run: i,
            ok: result.ok,
            renderer: result.rendererMode?.effective,
            qualityIndex: result.qualityState?.qualityIndex,
            p95: summary?.p95FrameTime,
            p99: summary?.p99FrameTime,
            checks: result.checks,
        }, null, 2));
    }

    const manifest = {
        capturedAt: new Date().toISOString(),
        contract: 'cycle82-newsheepdogland-steady-state-profile',
        baseUrl: args.baseUrl,
        browser: { channel: args.channel, headless: args.headless, gpuArgs: GPU_ARGS },
        sceneId: 'newsheepdogland',
        runsRequested: args.runs,
        warmupMs: args.warmupMs,
        measureMs: args.measureMs,
        budget: WEBGPU_DESKTOP_BUDGET,
        summary: aggregate(runs),
        ok: runs.every((run) => run.ok),
        runs,
    };

    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest.summary, null, 2));
    console.log('Wrote', outPath);
    if (!manifest.ok) process.exit(2);
}

run().catch((error) => {
    console.error('[C82-PROFILE] fatal:', error);
    process.exit(1);
});
