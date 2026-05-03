/**
 * SDS perf harness — Cycle 15 Phase 2 + 3.
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
 *   node tools/perf-harness.mjs --warmup=4 --measure=20             # ms tweaks
 *
 * Why a fresh script and not extend `tests/e2e/oc-perf.spec.ts`? The
 * existing spec is a single-config gate; baselines need a structured
 * matrix + commitment workflow. The driver code is shared in spirit
 * (menu nav, perfMode hook polling), but the orchestration differs.
 *
 * The harness ASSUMES the dev server is running (`npm run dev`) at
 * localhost:3000. Doesn't auto-start it — that's the user's call so
 * baselines aren't perturbed by cold-start.
 *
 * Numbers absorb three layers of bias and that's OK as long as they're
 * consistent across runs:
 *   1. Headless Chromium adds ~5-8ms vs visible. Live with it.
 *   2. The driver runs Classic / Extreme menu paths via dispatchEvent;
 *      the menu transition itself doesn't pollute the measurement window.
 *   3. WebGLRenderer.info counters reset each frame; we read them
 *      mid-window so they reflect the rolling state, not the cold paint.
 *
 * Threshold rule (per cycle plan): a config is "regressed" if its
 * avgFrameTime grew > 5% over baseline. Ties to baseline + 5% absolute
 * floor (0.5ms) so noise on the very-fast configs doesn't flap.
 */

import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const WARMUP_MS = Number(args.warmup ?? 3) * 1000;
const MEASURE_MS = Number(args.measure ?? 15) * 1000;
const HEADED = !!args.headed;
const URL_BASE = args.url ?? 'http://localhost:3000';
const REGRESSION_PCT = 5; // % over baseline avgFrameTime
const REGRESSION_FLOOR_MS = 0.5; // absolute slack

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

function pickConfigs() {
    if (!args.configs) return CONFIGS;
    const wanted = String(args.configs).split(',');
    return CONFIGS.filter((c) => wanted.includes(c.id));
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

async function navigateAndWait(page, sceneId) {
    const url = `${URL_BASE}/?scene=${encodeURIComponent(sceneId)}&perfMode=1`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
}

async function startGame(page, mode) {
    const soloPlay = page.getByRole('button', { name: /Solo Play/i });
    await soloPlay.waitFor({ state: 'visible', timeout: 45_000 });
    await soloPlay.dispatchEvent('click', undefined, { timeout: 30_000 });

    const confirm = page.getByRole('button', { name: /Confirm Selection/i });
    await confirm.waitFor({ state: 'visible', timeout: 45_000 });
    await confirm.dispatchEvent('click', undefined, { timeout: 30_000 });

    // Mode picker — pick the mode by accessible name.
    const modeLabel = mode === 'extreme' ? /Extreme Mode/i : /Classic Mode/i;
    const modeBtn = page.getByRole('button', { name: modeLabel });
    await modeBtn.waitFor({ state: 'visible', timeout: 45_000 });
    await modeBtn.dispatchEvent('click', undefined, { timeout: 30_000 });
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
    let warningStr = null;

    try {
        await navigateAndWait(page, cfg.scene);
        await startGame(page, cfg.mode);
        await waitReady(page, cfg.mode);
        await page.waitForTimeout(WARMUP_MS);
        rendererInfo = await captureRendererInfo(page);
        summary = await captureSummary(page, MEASURE_MS);
    } catch (err) {
        warningStr = err.message;
    }

    await context.close();

    return {
        configId: cfg.id,
        scene: cfg.scene,
        mode: cfg.mode,
        ok: !!summary && errors.length === 0,
        summary,
        rendererInfo,
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
    if (MODE_BASELINE && MODE_CHECK) {
        console.error('[PERF] Pass --baseline OR --check, not both.');
        process.exit(1);
    }
    if (!MODE_BASELINE && !MODE_CHECK) {
        console.error('[PERF] Pass --baseline (capture + write) or --check (diff vs committed).');
        process.exit(1);
    }

    const configs = pickConfigs();
    console.log(`[PERF] Mode: ${MODE_BASELINE ? 'BASELINE' : 'CHECK'}`);
    console.log(`[PERF] Configs (${configs.length}): ${configs.map((c) => c.id).join(', ')}`);
    console.log(`[PERF] Warmup ${WARMUP_MS / 1000}s · measure ${MEASURE_MS / 1000}s · target ${URL_BASE}`);

    const browser = await chromium.launch({ headless: !HEADED });
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
        results
    };

    await mkdir(dirname(RESULTS_PATH), { recursive: true });
    await writeFile(RESULTS_PATH, JSON.stringify(out, null, 2), 'utf8');
    console.log(`\n[PERF] Saved last-run → ${RESULTS_PATH.split(ROOT)[1].slice(1)}`);

    if (MODE_BASELINE) {
        await writeFile(BASELINE_PATH, JSON.stringify(out, null, 2), 'utf8');
        console.log(`[PERF] Saved baseline → ${BASELINE_PATH.split(ROOT)[1].slice(1)}`);
        console.log('[PERF] Commit `tests/perf-baseline/baseline.json` to pin.');
    } else {
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
    }
}

main().catch((err) => {
    console.error('[PERF] FATAL:', err);
    process.exit(1);
});
