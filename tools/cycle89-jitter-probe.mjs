// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 89 Phase 1/2 - frame-stability (jitter) probe.
//
// Measures frame-to-frame delta distribution, hitch counts, 1%-low FPS,
// longtasks, and GC heap sawtooth on a live page, then attributes hitches via
// an isolation/toggle matrix. Unlike tools/perf-harness.mjs (avg/p95 budgets),
// this probe records RAW rAF deltas with timestamps so periodic hitches can be
// phase-locked to their source (e.g. the every-20-frames grass readback).
//
// Usage:
//   npm run build && npm run preview   (probe targets the production build)
//   node tools/cycle89-jitter-probe.mjs                       # 5-run baseline, field/practice (3 sheep)
//   node tools/cycle89-jitter-probe.mjs --matrix=1            # attribution matrix (Phase 2 gate data)
//   node tools/cycle89-jitter-probe.mjs --check=1             # regression rail vs cycle89-validation/jitter-budgets.json
//   node tools/cycle89-jitter-probe.mjs --scene=field --mode=classic --runs=1 --out=...
//   node tools/cycle89-jitter-probe.mjs --drive=0                # idle camera (legacy capture shape)
//   node tools/cycle89-jitter-probe.mjs --boxState=1             # per-run nvidia-smi + CPU load telemetry (Cycle 92)
//   node tools/cycle89-jitter-probe.mjs --heapProfile=1          # CDP sampling heap profile -> top allocation sites
//                                                                  (use a --minify=false build so names survive)
//
// The default mode is `practice` because Home Field's Just Play rung is
// exactly 3 sheep (shared/scenes/field.js soloLadder) - the reported repro.
// Driving is ON by default: the repro is "lags while moving/turning/zooming,
// then stabilizes", so the probe holds W, weaves A/D, sprints, and wheel-zooms
// during the whole measure window and reports a per-5s hitch timeline.

import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const GPU_ARGS = [
    ...(process.platform === 'win32'
        ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']
        : ['--enable-gpu', '--ignore-gpu-blocklist']),
    // Keep rAF cadence honest while the probe window is up.
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    // performance.memory with real values for the GC sawtooth signal.
    '--enable-precise-memory-info',
];

// Matrix configs. `isolation` rides __perfHarness.setSystemIsolation;
// `toggle` is a page-side monkeypatch applied post-warmup (no game-code edit);
// `collisionProbe` additionally samples the sheep-collision profile.
const MATRIX_CONFIGS = [
    { id: 'full' },
    { id: 'sheep-only', isolation: 'sheep-only' },
    { id: 'terrain-only', isolation: 'terrain-only' },
    { id: 'grass-only', isolation: 'grass-only' },
    { id: 'atmosphere-only', isolation: 'atmosphere-only' },
    { id: 'trees-only', isolation: 'trees-only' },
    { id: 'trees-off', toggle: 'trees-off' },
    { id: 'tree-shadows-off', toggle: 'tree-shadows-off' },
    { id: 'impostor-sync-off', toggle: 'impostor-sync-off' },
    { id: 'hybrid-freeze', toggle: 'hybrid-freeze' },
    { id: 'tree-alphahash-off', toggle: 'tree-alphahash-off' },
    { id: 'tree-cull-off', toggle: 'tree-cull-off' },
    { id: 'cull-off-all', toggle: 'cull-off-all' },
    { id: 'readback-off', toggle: 'readback-off' },
    { id: 'computecull-off', toggle: 'computecull-off' },
    { id: 'grasscull-off', toggle: 'grasscull-off' },
    { id: 'treecull-compute-off', toggle: 'treecull-compute-off' },
    { id: 'perfmon-off', toggle: 'perfmon-off' },
    { id: 'governor-off', toggle: 'governor-off' },
    { id: 'collision-profile', collisionProbe: true },
    // Cycle 91 shadow spike: attribute the NSL shadow depth-pass cost.
    { id: 'shadow-off', toggle: 'shadow-off' },
    { id: 'shadow-trees-cast-off', toggle: 'shadow-trees-cast-off' },
    { id: 'shadow-leaves-cast-off', toggle: 'shadow-leaves-cast-off' },
    { id: 'shadow-mapsize-512', toggle: 'shadow-mapsize-512' },
    { id: 'shadow-frustum-40', toggle: 'shadow-frustum-40' },
];

function parseArgs(argv) {
    const defaults = {
        baseUrl: 'http://localhost:4173/',
        scene: 'field',
        mode: 'practice',
        runs: '5',
        matrixRuns: '2',
        warmupMs: '12000',
        measureMs: '30000',
        out: '',
        matrix: '0',
        check: '0',
        contrast: '1',
        drive: '1',
        waitFoliage: '0',
        renderer: '',
        channel: 'chrome',
        headless: '0',
        boxState: '0',
        heapProfile: '0',
        budgets: '',
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
        matrixRuns: Number(parsed.matrixRuns),
        warmupMs: Number(parsed.warmupMs),
        measureMs: Number(parsed.measureMs),
        matrix: parsed.matrix === '1' || parsed.matrix === 'true',
        check: parsed.check === '1' || parsed.check === 'true',
        contrast: parsed.contrast === '1' || parsed.contrast === 'true',
        drive: parsed.drive === '1' || parsed.drive === 'true',
        waitFoliage: parsed.waitFoliage === '1' || parsed.waitFoliage === 'true',
        headless: parsed.headless === '1' || parsed.headless === 'true',
        boxState: parsed.boxState === '1' || parsed.boxState === 'true',
        heapProfile: parsed.heapProfile === '1' || parsed.heapProfile === 'true',
    };
}

const round = (v, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(d)) : v);

// ---------------------------------------------------------------------------
// Cycle 92: box-state telemetry. The Cycle 91 pill gate flipped between two
// measurement windows on identical code; per-run GPU clock/power-state + CPU
// load samples let a battery's numbers be read against the box, not just the
// page. Failures degrade to recorded nulls - the probe never dies on telemetry.

async function sampleBoxState() {
    const state = { at: new Date().toISOString() };
    try {
        const { stdout } = await execFileAsync('nvidia-smi', [
            '--query-gpu=clocks.sm,clocks.mem,power.draw,pstate,temperature.gpu,utilization.gpu,memory.used',
            '--format=csv,noheader,nounits',
        ], { timeout: 10_000 });
        const [sm, mem, power, pstate, temp, util, vram] = stdout.trim().split(',').map((s) => s.trim());
        state.gpu = {
            clockSmMHz: Number(sm), clockMemMHz: Number(mem), powerW: Number(power),
            pstate, tempC: Number(temp), utilPct: Number(util), vramUsedMB: Number(vram),
        };
    } catch (e) {
        state.gpu = { error: String(e?.message || e).slice(0, 120) };
    }
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile', '-Command', '(Get-CimInstance Win32_Processor).LoadPercentage',
        ], { timeout: 15_000 });
        state.cpuLoadPct = Number(stdout.trim());
        if (!Number.isFinite(state.cpuLoadPct)) state.cpuLoadPct = null;
    } catch {
        state.cpuLoadPct = null;
    }
    return state;
}

async function sampleQuiescence() {
    if (process.platform !== 'win32') {
        return { cpuPercent: null, externalHeadlessBrowsers: 0 };
    }
    const script = [
        "$cpu=(Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average",
        "$headless=@(Get-Process chrome-headless-shell -ErrorAction SilentlyContinue).Count",
        "[pscustomobject]@{cpuPercent=$cpu;externalHeadlessBrowsers=$headless}|ConvertTo-Json -Compress",
    ].join(';');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 15_000 });
    return JSON.parse(stdout.trim());
}

async function waitForQuiescence() {
    const samples = [];
    let consecutive = 0;
    const deadline = Date.now() + 120_000;
    let attempt = 0;
    while (Date.now() < deadline) {
        const sample = await sampleQuiescence();
        samples.push({ ...sample, at: new Date().toISOString() });
        const quiet = sample.externalHeadlessBrowsers === 0
            && (sample.cpuPercent == null || sample.cpuPercent <= 50);
        consecutive = quiet ? consecutive + 1 : 0;
        if (consecutive >= 2) return samples;
        if (attempt > 0 && attempt % 15 === 0) {
            console.log(`[C89-JITTER] waiting for quiescence cpu=${sample.cpuPercent ?? 'n/a'} headless=${sample.externalHeadlessBrowsers}`);
        }
        attempt += 1;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
    }
    throw new Error(`machine did not become quiescent: ${JSON.stringify(samples.slice(-5))}`);
}

async function captureAuditedRun(args, params) {
    let monitoring = true;
    const environmentSamples = [];
    const monitor = (async () => {
        while (monitoring) {
            try {
                environmentSamples.push({ ...await sampleQuiescence(), at: new Date().toISOString() });
            } catch (error) {
                environmentSamples.push({ error: String(error?.message || error), at: new Date().toISOString() });
            }
            if (monitoring) await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
        }
    })();
    let result;
    try {
        result = await captureRun(args, params);
    } finally {
        monitoring = false;
        await monitor;
    }
    let highCpuStreak = 0;
    let maxHighCpuStreak = 0;
    for (const sample of environmentSamples) {
        highCpuStreak = sample.cpuPercent >= 90 ? highCpuStreak + 1 : 0;
        maxHighCpuStreak = Math.max(maxHighCpuStreak, highCpuStreak);
    }
    const reasons = [];
    if (environmentSamples.some((sample) => sample.error)) reasons.push('machine-state sampling failed');
    if (environmentSamples.some((sample) => sample.externalHeadlessBrowsers > 0)) reasons.push('external headless browser active');
    if (maxHighCpuStreak >= 2) reasons.push('host CPU at or above 90% in consecutive samples');
    return {
        result,
        environmentAudit: {
            clean: reasons.length === 0,
            reasons,
            samples: environmentSamples,
        },
    };
}

// Cycle 92: fold a CDP sampling heap profile (HeapProfiler.stopSampling tree)
// into top allocation sites by self-sampled bytes. Run this against a
// --minify=false production build so callframe names survive.

function foldHeapProfile(profile) {
    if (!profile?.head) return null;
    const sites = new Map();
    let total = 0;
    const visit = (node) => {
        const cf = node.callFrame ?? {};
        const self = node.selfSize ?? 0;
        if (self > 0) {
            total += self;
            const source = (cf.url || '').split('/').pop() || '(unknown)';
            const key = `${cf.functionName || '(anonymous)'}@${source}:${(cf.lineNumber ?? -2) + 1}`;
            const cur = sites.get(key)
                ?? { bytes: 0, fn: cf.functionName || '(anonymous)', source, line: (cf.lineNumber ?? -2) + 1 };
            cur.bytes += self;
            sites.set(key, cur);
        }
        for (const c of node.children ?? []) visit(c);
    };
    visit(profile.head);
    const topSites = [...sites.values()]
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 25)
        .map((s) => ({ fn: s.fn, source: s.source, line: s.line, mb: round(s.bytes / 1048576) }));
    return { totalSampledMB: round(total / 1048576), topSites };
}

function buildUrl(args, scene, mode) {
    const url = new URL(args.baseUrl);
    url.searchParams.set('scene', scene);
    url.searchParams.set('mode', mode);
    url.searchParams.set('autostart', '1');
    url.searchParams.set('perfMode', '1');
    // Renderer differential: ?renderer=webgl forces the WebGL path so the
    // WebGPU-production stall hypothesis can be tested as a single variable.
    if (args.renderer) url.searchParams.set('renderer', args.renderer);
    return url.href;
}

// ---------------------------------------------------------------------------
// In-page instrumentation (everything below runs in the browser context).

function installRecorder() {
    const W = window;
    W.__jitter = { times: [], longtasks: [], heap: [], done: false };
    try {
        W.__jitterLT = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
                W.__jitter.longtasks.push({ start: e.startTime, dur: e.duration });
            }
        });
        W.__jitterLT.observe({ entryTypes: ['longtask'] });
    } catch { /* longtask unsupported - leave empty */ }
    // 250ms sampling (was 1s pre-Cycle-92) for sharper GC-drop timing and a
    // usable allocation-rate slope between drops.
    W.__jitterHeap = setInterval(() => {
        const m = performance.memory;
        if (m) W.__jitter.heap.push({ t: performance.now(), used: m.usedJSHeapSize });
    }, 250);
    const tick = (now) => {
        if (W.__jitter.done) return;
        W.__jitter.times.push(now);
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function collectRecorder() {
    const W = window;
    W.__jitter.done = true;
    try { W.__jitterLT?.disconnect(); } catch { /* ignore */ }
    clearInterval(W.__jitterHeap);
    return {
        times: W.__jitter.times,
        longtasks: W.__jitter.longtasks,
        heap: W.__jitter.heap,
    };
}

function applyToggle(toggleId) {
    const gi = window.gameInstance;
    if (!gi) return { applied: false, reason: 'no gameInstance' };
    if (toggleId === 'readback-off') {
        const ctrl = gi.terrainBuilder?.grassSystem?._computeCullController;
        if (!ctrl) return { applied: false, reason: 'no grass compute-cull controller' };
        ctrl.readbackVisibleAsync = () => Promise.resolve(-1);
        return { applied: true };
    }
    if (toggleId === 'computecull-off') {
        // Cycle 90: freeze the entire compute-cull drive. The last-written
        // indirect counts keep drawing (frozen visible set), so draw cost
        // stays roughly live while the per-frame compute submits drop to zero.
        const tb = gi.terrainBuilder;
        if (!tb || typeof tb._driveComputeCull !== 'function') return { applied: false, reason: 'no _driveComputeCull' };
        const grassCtrl = tb.grassSystem?._computeCullController ?? null;
        const streamedCtrl = tb.grassSystem?._streamedCullController ?? null;
        const treeCtrls = tb._treeCullControllers ?? [];
        if (!grassCtrl && !streamedCtrl && treeCtrls.length === 0) return { applied: false, reason: 'no cull controllers' };
        tb._driveComputeCull = () => {};
        return { applied: true, controllers: { grass: !!grassCtrl, streamed: !!streamedCtrl, trees: treeCtrls.length } };
    }
    if (toggleId === 'grasscull-off') {
        // cullDisabled is honored by the batched _driveComputeCull driver;
        // runCull is also noop'd for the pre-batching driver shape.
        const tb = gi.terrainBuilder;
        const grassCtrl = tb?.grassSystem?._computeCullController ?? null;
        const streamedCtrl = tb?.grassSystem?._streamedCullController ?? null;
        if (!grassCtrl && !streamedCtrl) return { applied: false, reason: 'no grass cull controllers' };
        if (grassCtrl) { grassCtrl.cullDisabled = true; grassCtrl.runCull = () => {}; }
        if (streamedCtrl) { streamedCtrl.cullDisabled = true; streamedCtrl.runCull = () => {}; }
        return { applied: true, controllers: { grass: !!grassCtrl, streamed: !!streamedCtrl } };
    }
    if (toggleId === 'treecull-compute-off') {
        const treeCtrls = gi.terrainBuilder?._treeCullControllers ?? [];
        if (treeCtrls.length === 0) return { applied: false, reason: 'no tree cull controllers' };
        for (const c of treeCtrls) { c.cullDisabled = true; c.runCull = () => {}; }
        return { applied: true, controllers: { trees: treeCtrls.length } };
    }
    if (toggleId === 'trees-off') {
        const trees = gi.terrainBuilder?.trees;
        if (!Array.isArray(trees) || trees.length === 0) return { applied: false, reason: 'no trees' };
        for (const t of trees) t.visible = false;
        return { applied: true, count: trees.length };
    }
    if (toggleId === 'tree-shadows-off') {
        const trees = gi.terrainBuilder?.trees;
        if (!Array.isArray(trees) || trees.length === 0) return { applied: false, reason: 'no trees' };
        let count = 0;
        for (const t of trees) {
            t.traverse?.((o) => {
                if (o.castShadow) {
                    o.castShadow = false;
                    count++;
                }
            });
        }
        return { applied: true, count };
    }
    if (toggleId === 'tree-cull-off') {
        // Pin tree meshes in the render list (no frustum-cull churn). Tests
        // whether per-reentry renderer setup is the stall source.
        const trees = gi.terrainBuilder?.trees;
        if (!Array.isArray(trees) || trees.length === 0) return { applied: false, reason: 'no trees' };
        let count = 0;
        for (const t of trees) {
            if (t.frustumCulled) { t.frustumCulled = false; count++; }
        }
        return { applied: true, count };
    }
    if (toggleId === 'cull-off-all') {
        // Pin EVERY scene object in the render list.
        const scene = gi.sceneManager?.scene ?? gi.scene;
        if (!scene?.traverse) return { applied: false, reason: 'no scene' };
        let count = 0;
        scene.traverse((o) => {
            if (o.frustumCulled) { o.frustumCulled = false; count++; }
        });
        return { applied: true, count };
    }
    if (toggleId === 'tree-alphahash-off') {
        // Swap stochastic alphaHash for plain alphaTest on tree materials.
        // Slightly harder edges, same silhouette - measurement-only toggle.
        const trees = gi.terrainBuilder?.trees;
        if (!Array.isArray(trees)) return { applied: false, reason: 'no trees' };
        let count = 0;
        const seen = new Set();
        for (const t of trees) {
            const mats = Array.isArray(t?.material) ? t.material : [t?.material];
            for (const m of mats) {
                if (!m || seen.has(m) || m.alphaHash !== true) continue;
                seen.add(m);
                m.alphaHash = false;
                if (!(m.alphaTest > 0)) m.alphaTest = 0.4;
                m.needsUpdate = true;
                count++;
            }
        }
        if (count === 0) return { applied: false, reason: 'no alphaHash tree materials' };
        return { applied: true, count };
    }
    if (toggleId === 'impostor-sync-off') {
        // Freeze the per-frame impostor billboard/tile rewrite (and its full
        // instance-buffer re-upload). Hybrid LOD0<->impostor flips keep running.
        const trees = gi.terrainBuilder?.trees;
        if (!Array.isArray(trees)) return { applied: false, reason: 'no trees' };
        let count = 0;
        for (const t of trees) {
            if (t?.userData?.webgpuTreeImpostorRuntime) {
                t.userData.__jitterSavedImpostorRuntime = t.userData.webgpuTreeImpostorRuntime;
                delete t.userData.webgpuTreeImpostorRuntime;
                count++;
            }
        }
        if (count === 0) return { applied: false, reason: 'no impostor runtimes' };
        return { applied: true, count };
    }
    if (toggleId === 'hybrid-freeze') {
        // Freeze chunk LOD0<->impostor visibility flips at their current state.
        // The impostor billboard sync keeps running.
        const trees = gi.terrainBuilder?.trees;
        if (!Array.isArray(trees)) return { applied: false, reason: 'no trees' };
        let count = 0;
        for (const t of trees) {
            if (t?.userData?.webgpuNativeTreeHybrid) {
                t.userData.__jitterSavedHybrid = t.userData.webgpuNativeTreeHybrid;
                delete t.userData.webgpuNativeTreeHybrid;
                count++;
            }
        }
        if (count === 0) return { applied: false, reason: 'no hybrid runtimes' };
        return { applied: true, count };
    }
    // -----------------------------------------------------------------------
    // Cycle 91 shadow spike toggles. All run post-warmup on a day-loop scene,
    // after _tickDayLoop has already flipped the bridge light's castShadow on
    // (game._sunShadowFollowOffset exists), so a one-shot castShadow write
    // sticks - the day loop only sets castShadow inside its first-tick branch.
    if (toggleId === 'shadow-off') {
        const sun = gi.sceneManager?.webgpuSunLight;
        if (!sun?.castShadow) return { applied: false, reason: 'no shadow-casting sun light' };
        sun.castShadow = false;
        return { applied: true };
    }
    if (toggleId === 'shadow-trees-cast-off') {
        // All consolidated compute-cull tree meshes stop casting; terrain,
        // rocks, structures, sheep, dog keep their shadows.
        const ctrls = gi.terrainBuilder?._treeCullControllers ?? [];
        let count = 0;
        for (const c of ctrls) {
            if (c?.mesh?.castShadow) { c.mesh.castShadow = false; count++; }
        }
        // Chunked (non-consolidated) tree meshes too, if the scene has any.
        const trees = gi.terrainBuilder?.trees ?? [];
        for (const t of trees) {
            t.traverse?.((o) => {
                if (o.castShadow && !o.userData?.webgpuTreeComputeCull) { o.castShadow = false; count++; }
            });
        }
        if (count === 0) return { applied: false, reason: 'no casting tree meshes' };
        return { applied: true, count };
    }
    if (toggleId === 'shadow-leaves-cast-off') {
        // Trunk/branch (opaque) meshes keep casting; alpha-tested/hashed leaf
        // card meshes stop. Tests whether the depth-pass cost is dominated by
        // alpha-evaluated leaf fragments rather than caster count per se.
        const ctrls = gi.terrainBuilder?._treeCullControllers ?? [];
        let count = 0;
        let kept = 0;
        const isAlphaMat = (m) => !!m && (m.alphaHash === true || m.alphaTest > 0 || m.transparent === true);
        for (const c of ctrls) {
            const mesh = c?.mesh;
            if (!mesh?.castShadow) continue;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            if (mats.some(isAlphaMat)) { mesh.castShadow = false; count++; } else { kept++; }
        }
        if (count === 0) return { applied: false, reason: 'no alpha-material casting tree meshes' };
        return { applied: true, count, kept };
    }
    if (toggleId === 'shadow-mapsize-512') {
        const sun = gi.sceneManager?.webgpuSunLight;
        if (!sun?.castShadow) return { applied: false, reason: 'no shadow-casting sun light' };
        try { sun.shadow.map?.dispose?.(); } catch { /* ignore */ }
        sun.shadow.map = null;
        sun.shadow.mapSize.set(512, 512);
        sun.shadow.needsUpdate = true;
        return { applied: true };
    }
    if (toggleId === 'shadow-frustum-40') {
        const sun = gi.sceneManager?.webgpuSunLight;
        if (!sun?.castShadow) return { applied: false, reason: 'no shadow-casting sun light' };
        const cam = sun.shadow.camera;
        cam.left = -40; cam.right = 40; cam.top = 40; cam.bottom = -40;
        cam.updateProjectionMatrix();
        sun.shadow.needsUpdate = true;
        return { applied: true };
    }
    if (toggleId === 'perfmon-off') {
        if (gi.performanceMonitor) gi.performanceMonitor.updateMetrics = () => {};
        gi.updatePerformanceVisibleCounts = () => {};
        return { applied: true };
    }
    if (toggleId === 'governor-off') {
        // Post-warmup, so quality state is already settled; sample()'s return
        // value is unused at the main.js call site.
        if (gi.qualityGovernor) gi.qualityGovernor.sample = () => {};
        return { applied: true };
    }
    return { applied: false, reason: `unknown toggle ${toggleId}` };
}

// ---------------------------------------------------------------------------
// Input driver. The reported repro is "lags while moving/turning/zooming,
// then stabilizes" - an idle camera never reproduces it. Holds W the whole
// window, weaves with A/D, bursts Shift sprint, and zooms in/out with the
// mouse wheel so the camera distance (and everything LOD/zoom-dependent)
// keeps changing. Runs for exactly durationMs alongside the recorder.

async function driveInput(page, durationMs) {
    const deadline = Date.now() + durationMs;
    await page.mouse.move(800, 450).catch(() => {});
    await page.keyboard.down('w');
    let zoomDir = -1;
    let phase = 0;
    try {
        while (Date.now() < deadline) {
            const turnKey = phase % 2 === 0 ? 'a' : 'd';
            await page.keyboard.down(turnKey);
            await page.waitForTimeout(700);
            await page.keyboard.up(turnKey);
            if (phase % 2 === 1) {
                for (let i = 0; i < 3; i++) {
                    await page.mouse.wheel(0, zoomDir * 240);
                    await page.waitForTimeout(120);
                }
                zoomDir = -zoomDir;
            }
            if (phase % 4 === 3) {
                await page.keyboard.down('Shift');
                await page.waitForTimeout(900);
                await page.keyboard.up('Shift');
            } else {
                await page.waitForTimeout(500);
            }
            phase++;
        }
    } finally {
        await page.keyboard.up('w').catch(() => {});
        await page.keyboard.up('Shift').catch(() => {});
    }
}

// ---------------------------------------------------------------------------
// Node-side metrics.

function percentile(sorted, p) {
    if (sorted.length === 0) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function phaseLock(hitchIndices, hitchCount, mod) {
    if (hitchCount === 0) return { mod, lockRatio: 0, peakResidue: null, peakCount: 0 };
    const buckets = new Array(mod).fill(0);
    for (const idx of hitchIndices) buckets[idx % mod]++;
    let peak = 0;
    let peakResidue = 0;
    for (let r = 0; r < mod; r++) {
        if (buckets[r] > peak) { peak = buckets[r]; peakResidue = r; }
    }
    const mean = hitchCount / mod;
    return { mod, lockRatio: round(peak / Math.max(mean, 1e-9)), peakResidue, peakCount: peak };
}

function computeMetrics(raw, measureMs) {
    const { times, longtasks, heap } = raw;
    const deltas = [];
    for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i - 1]);
    if (deltas.length < 10) return { error: 'too few frames sampled', sampleCount: deltas.length };

    const sorted = [...deltas].sort((a, b) => a - b);
    const n = deltas.length;
    const mean = deltas.reduce((a, b) => a + b, 0) / n;
    const median = percentile(sorted, 50);
    const stddev = Math.sqrt(deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / n);

    // 1%-low FPS: mean of the worst 1% of deltas, expressed as FPS.
    const worstCount = Math.max(1, Math.ceil(n * 0.01));
    const worst = sorted.slice(n - worstCount);
    const onePercentLowFps = 1000 / (worst.reduce((a, b) => a + b, 0) / worst.length);

    // Hitches: delta > 1.5x median. Record frame index + page time for
    // phase-lock and correlation analysis.
    const hitchThreshold = median * 1.5;
    const hitchIndices = [];
    const hitchTimes = [];
    for (let i = 0; i < n; i++) {
        if (deltas[i] > hitchThreshold) {
            hitchIndices.push(i);
            hitchTimes.push(times[i + 1]);
        }
    }
    const hitchCount = hitchIndices.length;
    const hitchRatePer30s = hitchCount * (30000 / measureMs);

    // Correlation: a hitch "matches" a longtask if its frame end falls inside
    // the longtask interval (+10ms slack); it matches a GC drop if it lands in
    // the window before the heap sample that dropped. The window is 600ms
    // (sample interval 250ms + slack) since Cycle 92; pre-92 manifests used
    // 1200ms against 1s sampling, so heapDropFraction is not directly
    // comparable across that boundary.
    const HEAP_DROP_WINDOW_MS = 600;
    const heapDrops = [];
    for (let i = 1; i < heap.length; i++) {
        const drop = heap[i - 1].used - heap[i].used;
        if (drop > 1_000_000) heapDrops.push({ t: heap[i].t, dropBytes: drop });
    }
    let nearLongtask = 0;
    let nearHeapDrop = 0;
    for (const t of hitchTimes) {
        if (longtasks.some((lt) => t >= lt.start - 10 && t <= lt.start + lt.dur + 10)) nearLongtask++;
        if (heapDrops.some((d) => t >= d.t - HEAP_DROP_WINDOW_MS && t <= d.t)) nearHeapDrop++;
    }

    // Cycle 92: steady-state allocation rate. Sum of positive heap-growth
    // deltas over the recording span - what the page allocates per second
    // (reclaimed garbage shows up as the drops, so growth-sum ~= allocation).
    let heapGrownBytes = 0;
    for (let i = 1; i < heap.length; i++) {
        const d = heap[i].used - heap[i - 1].used;
        if (d > 0) heapGrownBytes += d;
    }
    const heapSpanMs = heap.length > 1 ? heap[heap.length - 1].t - heap[0].t : 0;
    const allocRateMBs = heapSpanMs > 0 ? (heapGrownBytes / 1048576) / (heapSpanMs / 1000) : null;

    // Cycle 92: per-frame attribution for the worst frames (>= 50ms). Each
    // entry says whether the frame coincided with a longtask and/or a GC drop
    // so the >= 100ms stall class can be attributed run by run.
    const worstFrames = [];
    for (let i = 0; i < n; i++) {
        if (deltas[i] < 50) continue;
        const t = times[i + 1];
        worstFrames.push({
            ms: round(deltas[i]),
            atMs: round(t - times[0]),
            nearLongtask: longtasks.some((lt) => t >= lt.start - 10 && t <= lt.start + lt.dur + 10),
            nearHeapDrop: heapDrops.some((d) => t >= d.t - HEAP_DROP_WINDOW_MS && t <= d.t),
        });
    }
    worstFrames.sort((a, b) => b.ms - a.ms);

    // Timeline: hitches per 5s bucket relative to recording start, plus an
    // early/steady split. The repro is "lags for a bit while moving, then
    // stabilizes" - a front-loaded timeline confirms first-traversal cost
    // (warm-up work) rather than a steady periodic source.
    const t0 = times[0];
    const bucketCount = Math.ceil(measureMs / 5000);
    const hitchTimelinePer5s = new Array(bucketCount).fill(0);
    let first10sHitchCount = 0;
    for (const t of hitchTimes) {
        const rel = t - t0;
        const b = Math.min(bucketCount - 1, Math.max(0, Math.floor(rel / 5000)));
        hitchTimelinePer5s[b]++;
        if (rel < 10_000) first10sHitchCount++;
    }
    const steadyMs = Math.max(1, measureMs - 10_000);
    const steadyHitchRatePer30s = round((hitchCount - first10sHitchCount) * (30_000 / steadyMs), 1);

    return {
        sampleCount: n,
        medianMs: round(median),
        meanMs: round(mean),
        p95Ms: round(percentile(sorted, 95)),
        p99Ms: round(percentile(sorted, 99)),
        maxMs: round(sorted[n - 1]),
        deltaStddevMs: round(stddev),
        onePercentLowFps: round(onePercentLowFps, 1),
        medianFps: round(1000 / median, 1),
        hitchThresholdMs: round(hitchThreshold),
        hitchCount,
        hitchRatePer30s: round(hitchRatePer30s, 1),
        hitchTimelinePer5s,
        first10sHitchCount,
        steadyHitchRatePer30s,
        hitchPhaseLock: {
            mod10: phaseLock(hitchIndices, hitchCount, 10),
            mod20: phaseLock(hitchIndices, hitchCount, 20),
            mod60: phaseLock(hitchIndices, hitchCount, 60),
        },
        hitchCorrelation: {
            nearLongtask,
            nearHeapDrop,
            longtaskFraction: hitchCount ? round(nearLongtask / hitchCount) : 0,
            heapDropFraction: hitchCount ? round(nearHeapDrop / hitchCount) : 0,
        },
        longtasks: {
            count: longtasks.length,
            totalMs: round(longtasks.reduce((a, lt) => a + lt.dur, 0)),
            worstMs: round(longtasks.reduce((a, lt) => Math.max(a, lt.dur), 0)),
        },
        heap: {
            samples: heap.length,
            drops: heapDrops.length,
            largestDropMB: round(heapDrops.reduce((a, d) => Math.max(a, d.dropBytes), 0) / 1048576),
            allocRateMBs: round(allocRateMBs),
            grownMB: round(heapGrownBytes / 1048576),
        },
        worstFrames: worstFrames.slice(0, 20),
        worstDeltasMs: sorted.slice(Math.max(0, n - 10)).map((v) => round(v)),
        hitchDeltasMs: hitchIndices.slice(0, 200).map((i) => round(deltas[i])),
    };
}

// ---------------------------------------------------------------------------
// Run capture.

async function captureRun(args, { scene, mode, config, runIndex }) {
    const profile = resolve(tmpdir(), `sds-c89-jitter-${Date.now()}-${runIndex}`);
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
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => pageErrors.push(String(e?.message || e).slice(0, 300)));
    page.on('crash', () => pageErrors.push('page crashed'));

    try {
        const boxBefore = args.boxState ? await sampleBoxState() : null;
        let cdp = null;
        if (args.heapProfile) {
            cdp = await context.newCDPSession(page);
            await cdp.send('HeapProfiler.enable');
        }
        await page.goto(buildUrl(args, scene, mode), { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
        await page.bringToFront().catch(() => {});
        if (args.waitFoliage) {
            // Streamed scenes (NSL): gate the warmup clock on foliage-streaming
            // completion so the measure window is steady-state, not wave landings.
            // Non-fatal on scenes without streaming or if waves stall: the
            // capture proceeds and the manifest records what actually ran.
            await page.waitForFunction(
                () => (window.__sdsFoliageStreaming?.completedAt ?? 0) > 0,
                null, { timeout: 120_000 },
            ).catch(() => { console.log('[C89-JITTER] waitFoliage timed out or n/a; proceeding'); });
        }
        await page.waitForTimeout(args.warmupMs);

        await page.evaluate((isolation) => {
            window.__perfHarness.setSystemIsolation?.(isolation);
        }, config.isolation ?? 'full');

        let toggleResult = null;
        if (config.toggle) {
            toggleResult = await page.evaluate(applyToggle, config.toggle);
            if (!toggleResult.applied) {
                // Not fatal: e.g. Home Field has no grass compute-cull
                // controller, so readback-off has nothing to disable. Record
                // the skip so the gate treats this config as not-applicable.
                console.log(`[C89-JITTER] toggle ${config.toggle} skipped: ${toggleResult.reason}`);
                return {
                    config: config.id,
                    run: runIndex,
                    scene,
                    mode,
                    skipped: true,
                    toggleResult,
                    ok: true,
                };
            }
        }
        if (config.collisionProbe) {
            await page.evaluate((measureMs) => {
                window.__perfHarness.setCollisionProbeEnabled?.(true);
                window.__perfHarness.reset?.();
                window.__perfHarness.startSampling?.(measureMs);
            }, args.measureMs);
        }

        // Settle for a second after isolation/toggle churn, then record.
        // Warmup is deliberately idle: when driving, the first-movement cost
        // lands INSIDE the recording window so the timeline can show it.
        await page.waitForTimeout(1000);
        // includeObjectsCollectedBy*GC: without these the profile only shows
        // still-live objects - the GC churn we're attributing would be invisible.
        if (cdp) {
            await cdp.send('HeapProfiler.startSampling', {
                samplingInterval: 32768,
                includeObjectsCollectedByMajorGC: true,
                includeObjectsCollectedByMinorGC: true,
            });
        }
        await page.evaluate(installRecorder);
        if (args.drive) {
            await driveInput(page, args.measureMs);
            await page.waitForTimeout(500);
        } else {
            await page.waitForTimeout(args.measureMs + 500);
        }
        const raw = await page.evaluate(collectRecorder);
        let heapProfile = null;
        if (cdp) {
            try {
                const { profile } = await cdp.send('HeapProfiler.stopSampling');
                heapProfile = foldHeapProfile(profile);
                await cdp.send('HeapProfiler.disable');
            } catch (e) {
                heapProfile = { error: String(e?.message || e).slice(0, 200) };
            }
        }
        const boxAfter = args.boxState ? await sampleBoxState() : null;

        const contextState = await page.evaluate(() => ({
            sceneId: window.__currentSceneId ?? null,
            rendererMode: window.__sdsRendererMode?.effective ?? null,
            qualityIndex: window.gameInstance?.qualityGovernor?.qualityIndex ?? null,
            sheepCount: window.gameInstance?.gameState?.getSheep?.()?.length ?? null,
            collision: window.__perfHarness?.getSummary?.()?.collision ?? null,
            foliage: window.__sdsFoliageStreaming
                ? {
                    planned: window.__sdsFoliageStreaming.planned ?? null,
                    wavesDone: window.__sdsFoliageStreaming.wavesDone ?? null,
                    completed: (window.__sdsFoliageStreaming.completedAt ?? 0) > 0,
                }
                : null,
        }));

        const metrics = computeMetrics(raw, args.measureMs);
        return {
            config: config.id,
            run: runIndex,
            scene,
            mode,
            capturedAt: new Date().toISOString(),
            ...contextState,
            toggleResult,
            boxState: args.boxState ? { before: boxBefore, after: boxAfter } : undefined,
            heapProfile: heapProfile ?? undefined,
            metrics,
            consoleErrors,
            pageErrors,
            ok: !metrics.error && pageErrors.length === 0,
        };
    } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
        await rm(profile, { recursive: true, force: true }).catch(() => {});
    }
}

function aggregateRuns(runs) {
    const ms = runs.map((r) => r.metrics).filter((m) => m && !m.error);
    if (ms.length === 0) return { error: 'no valid runs' };
    const mean = (sel) => ms.reduce((a, m) => a + sel(m), 0) / ms.length;
    const sumLock = (mod) => {
        // Pool lock ratios as the mean across runs (each run's distribution is
        // independent; pooling raw buckets would need shared indices).
        return round(mean((m) => m.hitchPhaseLock[mod].lockRatio));
    };
    return {
        runCount: runs.length,
        validRuns: ms.length,
        medianFps: round(mean((m) => m.medianFps), 1),
        meanHitchRatePer30s: round(mean((m) => m.hitchRatePer30s), 1),
        meanFirst10sHitchCount: round(mean((m) => m.first10sHitchCount ?? 0), 1),
        meanSteadyHitchRatePer30s: round(mean((m) => m.steadyHitchRatePer30s ?? 0), 1),
        worstHitchRatePer30s: round(Math.max(...ms.map((m) => m.hitchRatePer30s)), 1),
        minOnePercentLowFps: round(Math.min(...ms.map((m) => m.onePercentLowFps)), 1),
        meanOnePercentLowFps: round(mean((m) => m.onePercentLowFps), 1),
        meanDeltaStddevMs: round(mean((m) => m.deltaStddevMs)),
        worstP99Ms: round(Math.max(...ms.map((m) => m.p99Ms))),
        worstMaxMs: round(Math.max(...ms.map((m) => m.maxMs ?? 0))),
        meanLongtaskCount: round(mean((m) => m.longtasks.count), 1),
        meanHeapDrops: round(mean((m) => m.heap.drops), 1),
        meanAllocRateMBs: round(mean((m) => m.heap.allocRateMBs ?? 0)),
        meanLongtaskHitchFraction: round(mean((m) => m.hitchCorrelation.longtaskFraction)),
        meanHeapDropHitchFraction: round(mean((m) => m.hitchCorrelation.heapDropFraction)),
        phaseLockMean: { mod10: sumLock('mod10'), mod20: sumLock('mod20'), mod60: sumLock('mod60') },
    };
}

// ---------------------------------------------------------------------------
// Modes.

async function runBaseline(args) {
    const runs = [];
    for (let i = 1; i <= args.runs; i++) {
        console.log(`[C89-JITTER] baseline run ${i}/${args.runs} (${args.scene}/${args.mode})`);
        const result = await captureRun(args, { scene: args.scene, mode: args.mode, config: { id: 'full' }, runIndex: i });
        runs.push(result);
        console.log(JSON.stringify({
            run: i, ok: result.ok, sheep: result.sheepCount, renderer: result.rendererMode,
            medianFps: result.metrics.medianFps, hitchRatePer30s: result.metrics.hitchRatePer30s,
            first10s: result.metrics.first10sHitchCount, steadyPer30s: result.metrics.steadyHitchRatePer30s,
            timeline: result.metrics.hitchTimelinePer5s,
            onePercentLowFps: result.metrics.onePercentLowFps, longtasks: result.metrics.longtasks?.count,
            heapDrops: result.metrics.heap?.drops, allocRateMBs: result.metrics.heap?.allocRateMBs,
            maxMs: result.metrics.maxMs,
            gpuClockSm: result.boxState?.after?.gpu?.clockSmMHz, pstate: result.boxState?.after?.gpu?.pstate,
        }));
    }

    let contrast = null;
    if (args.contrast && args.mode !== 'classic') {
        console.log('[C89-JITTER] contrast run (classic, 200 sheep)');
        contrast = await captureRun(args, { scene: args.scene, mode: 'classic', config: { id: 'full' }, runIndex: 1 });
    }

    const manifest = {
        contract: 'cycle89-jitter-baseline',
        capturedAt: new Date().toISOString(),
        baseUrl: args.baseUrl,
        scene: args.scene,
        mode: args.mode,
        warmupMs: args.warmupMs,
        measureMs: args.measureMs,
        drive: args.drive,
        browser: { channel: args.channel, headless: args.headless, gpuArgs: GPU_ARGS },
        summary: aggregateRuns(runs),
        runs,
        contrast,
    };
    const outPath = resolve(ROOT, args.out
        || `cycle89-validation/jitter-baseline-${args.scene}-${args.mode}${args.renderer ? `-${args.renderer}` : ''}${args.drive ? '-driven' : ''}.json`);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest.summary, null, 2));
    console.log('Wrote', outPath);
}

async function runMatrix(args) {
    const wanted = args.configs ? String(args.configs).split(',') : null;
    const configs = MATRIX_CONFIGS.filter((c) => !wanted || wanted.includes(c.id));
    const matrix = {};
    for (const config of configs) {
        const runs = [];
        for (let i = 1; i <= args.matrixRuns; i++) {
            console.log(`[C89-JITTER] matrix ${config.id} run ${i}/${args.matrixRuns}`);
            let result;
            try {
                result = await captureRun(args, { scene: args.scene, mode: args.mode, config, runIndex: i });
            } catch (e) {
                // A page/GPU-process crash on one run must not lose the whole
                // batch - record it and keep going (NSL loads are heavy enough
                // that back-to-back contexts occasionally take the GPU process
                // down with them).
                result = {
                    config: config.id, run: i, scene: args.scene, mode: args.mode,
                    crashed: String(e?.message || e).slice(0, 200), ok: false,
                };
                console.log(`[C89-JITTER] run crashed: ${result.crashed}`);
            }
            runs.push(result);
            if (result.skipped) break;
        }
        matrix[config.id] = runs.some((r) => r.skipped)
            ? { skipped: true, reason: runs.find((r) => r.skipped)?.toggleResult?.reason ?? 'skipped', runs }
            : {
                summary: aggregateRuns(runs),
                collision: runs.map((r) => r.collision).filter(Boolean).pop() ?? null,
                runs,
            };
        console.log(JSON.stringify({ config: config.id, ...(matrix[config.id].summary ?? { skipped: true }) }));
    }

    const full = matrix.full?.summary;
    const reduction = (id) => {
        const s = matrix[id]?.summary;
        if (!full || !s || !full.meanHitchRatePer30s) return null;
        return round(1 - s.meanHitchRatePer30s / full.meanHitchRatePer30s);
    };
    const gates = {
        phase3AllocChurn: {
            perfmonOffReduction: reduction('perfmon-off'),
            governorOffReduction: reduction('governor-off'),
            longtaskHitchFraction: full?.meanLongtaskHitchFraction ?? null,
            heapDropHitchFraction: full?.meanHeapDropHitchFraction ?? null,
            armed: (reduction('perfmon-off') ?? 0) >= 0.3 || (reduction('governor-off') ?? 0) >= 0.3
                || (full?.meanLongtaskHitchFraction ?? 0) >= 0.3 || (full?.meanHeapDropHitchFraction ?? 0) >= 0.3,
        },
        phase4Readback: {
            mod20LockRatio: full?.phaseLockMean?.mod20 ?? null,
            readbackOffReduction: reduction('readback-off'),
            armed: (full?.phaseLockMean?.mod20 ?? 0) >= 3 || (reduction('readback-off') ?? 0) >= 0.3,
        },
        phase5DenseGrid: {
            p95SheepCollisionMs: matrix['collision-profile']?.collision?.p95SheepCollisionMs ?? null,
            armed: (matrix['collision-profile']?.collision?.p95SheepCollisionMs ?? 0) >= 0.3,
        },
        phase6StaticSun: {
            atmosphereOnlyHitchRate: matrix['atmosphere-only']?.summary?.meanHitchRatePer30s ?? null,
            fullHitchRate: full?.meanHitchRatePer30s ?? null,
            armed: full?.meanHitchRatePer30s
                ? (matrix['atmosphere-only']?.summary?.meanHitchRatePer30s ?? 0) / full.meanHitchRatePer30s >= 0.5
                : false,
        },
    };

    const manifest = {
        contract: 'cycle89-jitter-attribution-matrix',
        capturedAt: new Date().toISOString(),
        baseUrl: args.baseUrl,
        scene: args.scene,
        mode: args.mode,
        warmupMs: args.warmupMs,
        measureMs: args.measureMs,
        drive: args.drive,
        gates,
        matrix,
    };
    const outPath = resolve(ROOT, args.out
        || `cycle89-validation/jitter-attribution-matrix${args.drive ? '-driven' : ''}.json`);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(gates, null, 2));
    console.log('Wrote', outPath);
}

async function runCheck(args) {
    // --budgets overrides the default field-rail budgets so the same probe can
    // gate a second scene (Cycle 96: the NSL survival rail passes
    // --budgets=cycle89-validation/jitter-budgets-nsl.json alongside
    // --scene=newsheepdogland --mode=survival --waitFoliage=1).
    const budgetPath = resolve(ROOT, args.budgets || 'cycle89-validation/jitter-budgets.json');
    let budgets;
    try {
        budgets = JSON.parse(await readFile(budgetPath, 'utf8'));
    } catch {
        console.error(`[C89-JITTER] no budgets at ${budgetPath} - derive them from a baseline run first`);
        process.exit(1);
    }
    const requiredRuns = Math.min(args.runs, 3);
    const runs = [];
    const quiescenceSamples = [];
    const environmentAudits = [];
    const maxAttempts = requiredRuns * 3;
    for (let attempt = 1; runs.length < requiredRuns && attempt <= maxAttempts; attempt++) {
        quiescenceSamples.push(await waitForQuiescence());
        const audited = await captureAuditedRun(args, {
            scene: args.scene,
            mode: args.mode,
            config: { id: 'full' },
            runIndex: attempt,
        });
        environmentAudits.push({ attempt, ...audited.environmentAudit });
        if (!audited.environmentAudit.clean) {
            console.warn(`[C89-JITTER] discarded contaminated attempt ${attempt}: ${audited.environmentAudit.reasons.join(', ')}`);
            continue;
        }
        runs.push(audited.result);
    }
    if (runs.length < requiredRuns) {
        throw new Error(`only ${runs.length}/${requiredRuns} clean runs after ${maxAttempts} attempts`);
    }
    const summary = aggregateRuns(runs);
    const pass = summary.meanHitchRatePer30s <= budgets.maxHitchRatePer30s
        && summary.minOnePercentLowFps >= budgets.minOnePercentLowFps
        && (!Number.isFinite(budgets.maxWorstDeltaMs) || summary.worstMaxMs <= budgets.maxWorstDeltaMs);
    const report = {
        contract: 'jitter-regression-check',
        capturedAt: new Date().toISOString(),
        baseUrl: args.baseUrl,
        scene: args.scene,
        mode: args.mode,
        warmupMs: args.warmupMs,
        measureMs: args.measureMs,
        drive: args.drive,
        summary,
        budgets,
        quiescenceSamples,
        environmentAudits,
        runs,
        pass,
    };
    if (args.out) {
        const outPath = resolve(ROOT, args.out);
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, JSON.stringify(report, null, 2));
        console.log('Wrote', outPath);
    }
    console.log(JSON.stringify({
        summary,
        budgets,
        environmentAudits: environmentAudits.map((audit) => ({
            attempt: audit.attempt,
            clean: audit.clean,
            reasons: audit.reasons,
            sampleCount: audit.samples.length,
            peakCpuPercent: Math.max(...audit.samples.map((sample) => sample.cpuPercent ?? 0)),
            peakExternalHeadlessBrowsers: Math.max(...audit.samples.map((sample) => sample.externalHeadlessBrowsers ?? 0)),
        })),
        pass,
    }, null, 2));
    if (!pass) process.exit(2);
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.check) return runCheck(args);
    if (args.matrix) return runMatrix(args);
    return runBaseline(args);
}

main().catch((error) => {
    console.error('[C89-JITTER] fatal:', error);
    process.exit(1);
});
