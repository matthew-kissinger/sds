/**
 * SDS perf harness - Cycle 15 Phase 2 + 3.
 *
 * Drives Playwright Chromium against the dev server, captures frametime
 * baselines for a fixed config matrix, and either:
 *   - `--baseline` writes the result to `tests/perf-baseline/baseline.json`
 *   - `--check`    diffs the current run against the committed baseline
 *
 * Usage:
 *   npm run perf:baseline                        # capture + commit
 *   npm run perf:check                           # compare current vs committed
 *   node tools/perf-harness.mjs --configs=oc-classic,field-extreme   # subset
 *   node tools/perf-harness.mjs --warmup=4 --measure=20             # seconds
 *
 * Why a fresh script and not extend `tests/e2e/oc-perf.spec.ts`? The
 * existing spec is a single-config gate; baselines need a structured
 * matrix + commitment workflow. The driver code is shared in spirit
 * (menu nav, perfMode hook polling), but the orchestration differs.
 *
 * The harness ASSUMES the dev server is running (`npm run dev`) at
 * localhost:3000. It does not auto-start it, so baseline captures are not
 * perturbed by dev-server cold start.
 *
 * Numbers absorb three layers of bias and that's OK as long as they're
 * consistent across runs:
 *   1. Headless Chromium adds ~5-8ms vs visible. Live with it.
 *   2. The app enters the requested solo mode through the perf autostart URL;
 *      the menu transition itself doesn't pollute the measurement window.
 *   3. The committed baseline is a WebGL baseline, so this harness pins
 *      `renderer=webgl` unless --renderer overrides it.
 *   4. WebGLRenderer.info counters reset each frame; we read them
 *      mid-window so they reflect the rolling state, not the cold paint.
 *
 * Threshold rule (per cycle plan): a config is "regressed" if its
 * avgFrameTime grew > 5% over baseline. Ties to baseline + 5% absolute
 * floor (0.5ms) so noise on the very-fast configs doesn't flap.
 */

import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { WEBGPU_MOBILE_BUDGETS } from '../js/perf/RenderCostReport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASELINE_PATH = resolve(ROOT, 'tests/perf-baseline/baseline.json');
const RESULTS_PATH = resolve(ROOT, 'tests/perf-baseline/last-run.json');

const args = Object.fromEntries(
    process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);

const MODE_BASELINE = !!args.baseline;
const MODE_CHECK = !!args.check;
const MODE_CAPTURE = !!args.capture;
const WARMUP_MS = Number(args.warmup ?? 3) * 1000;
const MEASURE_MS = Number(args.measure ?? 15) * 1000;
const HEADED = !!args.headed;
const BROWSER_CHANNEL = args.channel ?? null;
const URL_BASE = args.url ?? 'http://localhost:3000';
const RENDERER_MODE = args.renderer ?? 'webgl';
const OUT_PATH = args.out ? resolve(ROOT, args.out) : RESULTS_PATH;
const SCREENSHOTS = !!args.screenshots;
const SCREENSHOT_DIR = args.screenshotDir
    ? resolve(ROOT, args.screenshotDir)
    : resolve(ROOT, 'cycle38-validation/screenshots/desktop');
const BUDGET_TIER = args.budget === 'none' ? null : args.budget;
const REGRESSION_PCT = 5; // % over baseline avgFrameTime
const REGRESSION_FLOOR_MS = 0.5; // absolute slack
const CHROMIUM_GPU_ARGS = !args.software && process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu']
    : [];

function safeName(value) {
    return String(value).replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '');
}

function relativeArtifactPath(path) {
    return path.startsWith(ROOT) ? path.slice(ROOT.length + 1).replace(/\\/g, '/') : path;
}

async function analyzeScreenshot(buffer) {
    const image = sharp(buffer);
    const [stats, metadata] = await Promise.all([
        image.stats(),
        sharp(buffer).metadata(),
    ]);
    const channels = stats.channels.slice(0, 3);
    const mean = channels.reduce((sum, c) => sum + c.mean, 0) / channels.length;
    const stdev = channels.reduce((sum, c) => sum + c.stdev, 0) / channels.length;
    const min = Math.min(...channels.map((c) => c.min));
    const max = Math.max(...channels.map((c) => c.max));
    return {
        width: metadata.width,
        height: metadata.height,
        mean: +mean.toFixed(3),
        stdev: +stdev.toFixed(3),
        min,
        max,
        nonBlank: stdev > 2 && max - min > 12,
    };
}

function evaluateBudget(result, tier) {
    if (!tier || result.systemIsolation !== 'full' || !result.summary) return null;
    const budget = WEBGPU_MOBILE_BUDGETS[tier];
    if (!budget) return null;
    const report = result.summary.costReport ?? {};
    const estimatedTriangles = Object.values(report.estimatedTrianglesBySystem ?? {})
        .reduce((sum, count) => sum + (Number.isFinite(count) ? count : 0), 0);
    const frameP95 = report.frameP95 || result.summary.p95FrameTime;
    const frameP99 = report.frameP99 || result.summary.p99FrameTime;
    const drawCalls = report.drawCalls || result.summary.avgDrawCalls || 0;
    const checks = {
        frameP95: frameP95 <= budget.frameP95,
        frameP99: frameP99 <= budget.frameP99,
        drawCalls: drawCalls <= budget.drawCalls,
        estimatedTriangles: estimatedTriangles <= budget.estimatedTriangles * 1.05,
    };
    return {
        tier,
        budget,
        values: {
            frameP95,
            frameP99,
            drawCalls,
            estimatedTriangles,
        },
        checks,
        ok: Object.values(checks).every(Boolean),
    };
}

// Six-config default matrix. Per the cycle-15 plan: ≥6 configs, scenes
// and sheep counts vary, sun=default to keep the matrix tight. Add more
// configs if perf differs across sun positions enough to matter.
const CONFIGS = [
    { id: 'field-classic',           scene: 'field',          mode: 'classic' },
    { id: 'field-extreme',           scene: 'field',          mode: 'extreme' },
    { id: 'rolling-hills-classic',   scene: 'rolling-hills',  mode: 'classic' },
    { id: 'rolling-hills-extreme',   scene: 'rolling-hills',  mode: 'extreme' },
    { id: 'open-country-classic',    scene: 'open-country',   mode: 'classic' },
    { id: 'open-country-extreme',    scene: 'open-country',   mode: 'extreme' }
];

const CAMERA_POSES = Object.freeze([
    'follow-close',
    'classic-max',
    'tree-occluded',
    'shoreline-glint',
    'horizon-terrain-seam',
]);

const SYSTEM_ISOLATIONS = Object.freeze([
    'full',
    'terrain-only',
    'grass-only',
    'trees-only',
    'rocks-only',
    'water-only',
    'sheep-only',
    'atmosphere-only',
]);

function pickList(value, defaults, allValues) {
    if (!value) return defaults;
    if (value === 'all') return allValues;
    return String(value).split(',').filter(Boolean);
}

function pickConfigs() {
    const baseConfigs = !args.configs ? CONFIGS : CONFIGS.filter((c) => String(args.configs).split(',').includes(c.id));
    const poses = pickList(args.poses, ['follow-close'], CAMERA_POSES);
    const systems = pickList(args.systems, ['full'], SYSTEM_ISOLATIONS);
    if (poses.length === 1 && poses[0] === 'follow-close' && systems.length === 1 && systems[0] === 'full') {
        return baseConfigs;
    }
    return baseConfigs.flatMap((cfg) => poses.flatMap((pose) => systems.map((system) => ({
        ...cfg,
        id: `${cfg.id}--${pose}--${system}`,
        baseId: cfg.id,
        cameraPose: pose,
        systemIsolation: system,
    }))));
}

function baseConfigId(cfg) {
    return cfg.baseId ?? cfg.id;
}

function legacyConfigFilter() {
    if (!args.configs) return null;
    const wanted = String(args.configs).split(',');
    return wanted;
}

async function seedIdentity(context) {
    await context.addInitScript(() => {
        const identity = {
            persistentId: 'player_perf_' + Date.now(),
            displayName: 'PerfHarness',
            fullName: 'PerfHarness#0001',
            discriminator: '0001',
            nameType: 'custom',
            createdAt: Date.now(),
            isRegistered: false
        };
        localStorage.setItem('playerIdentity', JSON.stringify(identity));
    });
}

async function navigateAndWait(page, cfg) {
    const url = new URL(URL_BASE);
    url.searchParams.set('scene', cfg.scene);
    url.searchParams.set('perfMode', '1');
    url.searchParams.set('autostart', '1');
    url.searchParams.set('mode', cfg.mode);
    if (cfg.cameraPose) url.searchParams.set('perfPose', cfg.cameraPose);
    if (cfg.systemIsolation) url.searchParams.set('perfSystem', cfg.systemIsolation);
    if (args.nativeTreeImpostors === '1' || args.nativeTreeImpostors === true) {
        url.searchParams.set('konveyorNativeTreeImpostors', '1');
    }
    if (RENDERER_MODE !== 'default') {
        url.searchParams.set('renderer', RENDERER_MODE);
    }
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
}

async function startGame(page) {
    await page.waitForFunction(
        () => Boolean(window.__perfHarness),
        null,
        { timeout: 60_000 }
    );
}

async function waitReady(page, mode) {
    const readyTimeout = mode === 'extreme' ? 120_000 : 90_000;
    await page.waitForFunction(
        () => Boolean(window.__perfHarness?.isReady?.()),
        null,
        { timeout: readyTimeout }
    );
}

async function captureSummary(page, durationMs) {
    return page.evaluate(async (ms) => {
        const h = window.__perfHarness;
        h.startSampling(ms);
        await new Promise((r) => setTimeout(r, ms + 250));
        return h.getSummary();
    }, durationMs);
}

async function applyPerfAxes(page, cfg) {
    await page.evaluate(({ cameraPose, systemIsolation }) => {
        const h = window.__perfHarness;
        if (cameraPose) h?.setCameraPose?.(cameraPose);
        if (systemIsolation) h?.setSystemIsolation?.(systemIsolation);
    }, {
        cameraPose: cfg.cameraPose ?? 'follow-close',
        systemIsolation: cfg.systemIsolation ?? 'full',
    });
}

async function captureRendererInfo(page) {
    return page.evaluate(() => {
        // Best-effort: many code paths stash the renderer somewhere reachable.
        const r =
            window.__sdsCinema?.renderer ??
            window.__sdsRenderer ??
            null;
        if (!r?.info) return null;
        const { calls, triangles, points, lines } = r.info.render;
        const { geometries, textures } = r.info.memory;
        return { calls, triangles, points, lines, geometries, textures };
    });
}

async function runConfig(browser, cfg) {
    const start = Date.now();
    const context = await browser.newContext();
    await seedIdentity(context);
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);

    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    let summary = null;
    let rendererInfo = null;
    let visualProbe = null;
    let screenshot = null;
    let warningStr = null;

    try {
        await navigateAndWait(page, cfg);
        await startGame(page);
        await waitReady(page, cfg.mode);
        await applyPerfAxes(page, cfg);
        await page.waitForTimeout(WARMUP_MS);
        rendererInfo = await captureRendererInfo(page);
        summary = await captureSummary(page, MEASURE_MS);
        visualProbe = await page.evaluate(() => window.__perfHarness?.getVisualProbe?.() ?? null).catch(() => null);
        const effectiveRenderer = summary?.costReport?.renderer ?? visualProbe?.renderer ?? 'unknown';
        if (RENDERER_MODE === 'webgpu' && !String(effectiveRenderer).startsWith('webgpu')) {
            warningStr = `requested WebGPU but effective renderer is ${effectiveRenderer}`;
        }
        if (SCREENSHOTS) {
            await mkdir(SCREENSHOT_DIR, { recursive: true });
            const screenshotPath = resolve(SCREENSHOT_DIR, `${safeName(cfg.id)}.png`);
            const buffer = await page.screenshot({ path: screenshotPath, fullPage: true });
            screenshot = {
                path: relativeArtifactPath(screenshotPath),
                stats: await analyzeScreenshot(buffer),
            };
        }
    } catch (err) {
        warningStr = err.message;
    }

    await context.close();

    return {
        configId: cfg.id,
        baseConfigId: baseConfigId(cfg),
        scene: cfg.scene,
        mode: cfg.mode,
        cameraPose: cfg.cameraPose ?? 'follow-close',
        systemIsolation: cfg.systemIsolation ?? 'full',
        ok: !!summary && errors.length === 0 && !warningStr,
        summary,
        rendererInfo,
        visualProbe,
        screenshot,
        errors,
        warning: warningStr,
        elapsedSec: ((Date.now() - start) / 1000).toFixed(1)
    };
}

async function loadBaseline() {
    try {
        return JSON.parse(await readFile(BASELINE_PATH, 'utf8'));
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

function diffAgainstBaseline(current, baseline) {
    const baseMap = new Map(baseline.results.map((r) => [r.configId, r]));
    const lines = [];
    let regressed = 0;
    let missing = 0;
    let improved = 0;

    for (const cur of current.results) {
        const base = baseMap.get(cur.configId);
        if (!base) {
            lines.push(`  [NEW] ${cur.configId} — no baseline; current avg=${(cur.summary?.avgFrameTime ?? NaN).toFixed(2)}ms`);
            continue;
        }
        if (!cur.ok || !base.ok) {
            lines.push(`  [SKIP] ${cur.configId} — current ok=${cur.ok} baseline ok=${base.ok} ${cur.warning ?? base.warning ?? ''}`);
            missing++;
            continue;
        }
        const curAvg = cur.summary.avgFrameTime;
        const baseAvg = base.summary.avgFrameTime;
        const delta = curAvg - baseAvg;
        const pct = (delta / Math.max(baseAvg, 0.01)) * 100;
        const threshold = Math.max(REGRESSION_FLOOR_MS, baseAvg * (REGRESSION_PCT / 100));
        const flag = delta > threshold ? '❌ REGRESSED' : delta < -threshold ? '✓ IMPROVED' : '·';
        if (delta > threshold) regressed++;
        else if (delta < -threshold) improved++;
        lines.push(
            `  ${flag.padEnd(13)} ${cur.configId.padEnd(28)}  ` +
            `avg ${curAvg.toFixed(2)}ms vs ${baseAvg.toFixed(2)}ms  ` +
            `(${delta >= 0 ? '+' : ''}${delta.toFixed(2)}ms / ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)  ` +
            `p99 ${cur.summary.p99FrameTime.toFixed(2)}ms`
        );
    }

    return { lines, regressed, improved, missing };
}

async function main() {
    const modes = [MODE_BASELINE, MODE_CHECK, MODE_CAPTURE].filter(Boolean).length;
    if (modes > 1) {
        console.error('[PERF] Pass only one of --baseline, --check, or --capture.');
        process.exit(1);
    }
    if (modes === 0) {
        console.error('[PERF] Pass --baseline, --check, or --capture.');
        process.exit(1);
    }

    const configs = pickConfigs();
    const filter = legacyConfigFilter();
    if (filter) {
        for (const id of filter) {
            if (!CONFIGS.some((cfg) => cfg.id === id)) {
                console.warn(`[PERF] Unknown config requested: ${id}`);
            }
        }
    }
    console.log(`[PERF] Mode: ${MODE_BASELINE ? 'BASELINE' : MODE_CHECK ? 'CHECK' : 'CAPTURE'}`);
    console.log(`[PERF] Configs (${configs.length}): ${configs.map((c) => c.id).join(', ')}`);
    console.log(`[PERF] Warmup ${WARMUP_MS / 1000}s · measure ${MEASURE_MS / 1000}s · target ${URL_BASE} · renderer ${RENDERER_MODE}`);
    if (BUDGET_TIER) console.log(`[PERF] Budget tier: ${BUDGET_TIER} (full-scene rows only)`);
    if (SCREENSHOTS) console.log(`[PERF] Screenshots: ${relativeArtifactPath(SCREENSHOT_DIR)}`);
    if (CHROMIUM_GPU_ARGS.length > 0) {
        console.log(`[PERF] Chromium args: ${CHROMIUM_GPU_ARGS.join(' ')}`);
    }
    if (BROWSER_CHANNEL) console.log(`[PERF] Browser channel: ${BROWSER_CHANNEL}`);

    const launchOptions = { headless: !HEADED, args: CHROMIUM_GPU_ARGS };
    if (BROWSER_CHANNEL) launchOptions.channel = BROWSER_CHANNEL;
    const browser = await chromium.launch(launchOptions);
    const results = [];

    try {
        for (const cfg of configs) {
            console.log(`\n[PERF] → ${cfg.id}`);
            const r = await runConfig(browser, cfg);
            const tag = r.ok ? '✓' : '✗';
            const fps = r.summary ? `${(1000 / r.summary.avgFrameTime).toFixed(1)} fps` : '—';
            const ms = r.summary ? `${r.summary.avgFrameTime.toFixed(2)}ms avg, ${r.summary.p99FrameTime.toFixed(2)}ms p99` : (r.warning ?? 'no summary');
            console.log(`[PERF]   ${tag} ${ms}  (${fps})  in ${r.elapsedSec}s`);
            if (r.rendererInfo) {
                console.log(`[PERF]     renderer.info: ${r.rendererInfo.calls} calls, ${r.rendererInfo.triangles.toLocaleString()} tris, ${r.rendererInfo.geometries} geos, ${r.rendererInfo.textures} tex`);
            }
            if (r.screenshot?.stats && !r.screenshot.stats.nonBlank) {
                console.warn(`[PERF]     screenshot looks blank: ${r.screenshot.path}`);
            }
            results.push(r);
        }
    } finally {
        await browser.close();
    }

    const out = {
        capturedAt: new Date().toISOString(),
        warmupMs: WARMUP_MS,
        measureMs: MEASURE_MS,
        target: URL_BASE,
        renderer: RENDERER_MODE,
        results
    };

    await mkdir(dirname(OUT_PATH), { recursive: true });
    await writeFile(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
    console.log(`\n[PERF] Saved results → ${relativeArtifactPath(OUT_PATH)}`);

    if (MODE_BASELINE) {
        await writeFile(BASELINE_PATH, JSON.stringify(out, null, 2), 'utf8');
        console.log(`[PERF] Saved baseline → ${BASELINE_PATH.split(ROOT)[1].slice(1)}`);
        console.log('[PERF] Commit `tests/perf-baseline/baseline.json` to pin.');
    } else if (MODE_CHECK) {
        const baseline = await loadBaseline();
        if (!baseline) {
            console.error('[PERF] No baseline at tests/perf-baseline/baseline.json. Run with --baseline first.');
            process.exit(2);
        }
        console.log(`\n[PERF] Diff vs baseline (captured ${baseline.capturedAt}, threshold +${REGRESSION_PCT}%):`);
        const diff = diffAgainstBaseline(out, baseline);
        for (const line of diff.lines) console.log(line);
        console.log(`\n[PERF] Summary: ${diff.regressed} regressed, ${diff.improved} improved, ${diff.missing} missing.`);
        if (diff.regressed > 0) {
            console.error('[PERF] FAIL — regressions detected.');
            process.exit(3);
        }
        console.log('[PERF] PASS.');
    } else if (MODE_CAPTURE) {
        const budgetResults = results.map((result) => ({ configId: result.configId, budget: evaluateBudget(result, BUDGET_TIER) }))
            .filter((entry) => entry.budget);
        const budgetFailures = budgetResults.filter((entry) => !entry.budget.ok);
        const blankScreenshots = results.filter((result) => result.screenshot && !result.screenshot.stats.nonBlank);
        if (budgetResults.length > 0) {
            console.log(`\n[PERF] Budget checks: ${budgetResults.length - budgetFailures.length}/${budgetResults.length} passed.`);
            for (const failure of budgetFailures) {
                console.error(`[PERF]   BUDGET FAIL ${failure.configId}: ${JSON.stringify(failure.budget.values)}`);
            }
        }
        if (blankScreenshots.length > 0) {
            for (const failure of blankScreenshots) {
                console.error(`[PERF]   SCREENSHOT BLANK ${failure.configId}: ${failure.screenshot.path}`);
            }
        }
        if (budgetFailures.length > 0 || blankScreenshots.length > 0 || results.some((r) => !r.ok)) {
            console.error('[PERF] FAIL — capture gates failed.');
            process.exit(4);
        }
        console.log('[PERF] CAPTURE PASS.');
    }
}

main().catch((err) => {
    console.error('[PERF] FATAL:', err);
    process.exit(1);
});
