import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { WEBGPU_MOBILE_BUDGETS } from '../js/perf/RenderCostReport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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

const SCENES = Object.freeze(['field', 'rolling-hills', 'open-country']);

function parseArgs(argv) {
    const args = {
        scene: 'rolling-hills',
        scenes: null,
        mode: 'classic',
        pose: 'follow-close',
        poses: null,
        system: 'full',
        systems: null,
        measure: '8000',
        warmup: '3000',
        port: '3000',
        cdpPort: '9222',
        freshChrome: '1',
        matrix: '0',
        budget: null,
        screenshots: '0',
        screenshotDir: 'cycle38-validation/screenshots/android-webgpu',
        out: null,
        printJson: '1',
    };
    for (const a of argv.slice(2)) {
        const match = a.match(/^--([^=]+)(?:=(.*))?$/);
        if (match) args[match[1]] = match[2] ?? '1';
    }
    return args;
}

function splitList(value, fallback, allValues) {
    if (!value) return fallback;
    if (value === 'all') return allValues;
    return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function buildMatrix(args) {
    const matrix = args.matrix === '1' || args.matrix === true;
    const scenes = splitList(args.scenes, [args.scene], SCENES);
    const poses = splitList(args.poses, [args.pose], CAMERA_POSES);
    const systems = splitList(args.systems, [args.system], SYSTEM_ISOLATIONS);
    if (!matrix && scenes.length === 1 && poses.length === 1 && systems.length === 1) {
        return [{ scene: scenes[0], mode: args.mode, pose: poses[0], system: systems[0] }];
    }
    return scenes.flatMap((scene) => poses.flatMap((pose) => systems.map((system) => ({
        scene,
        mode: args.mode,
        pose,
        system,
    }))));
}

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
    const report = result.summary.costReport ?? result.probe?.costReport ?? {};
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
        values: { frameP95, frameP99, drawCalls, estimatedTriangles },
        checks,
        ok: Object.values(checks).every(Boolean),
    };
}

function adb(args, options = {}) {
    return new Promise((resolvePromise, reject) => {
        execFile('adb', args, { encoding: 'utf8', ...options }, (error, stdout, stderr) => {
            if (error) {
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
                return;
            }
            resolvePromise({ stdout, stderr });
        });
    });
}

async function adbText(args) {
    const { stdout } = await adb(args);
    return stdout.trim();
}

async function ensureDevice() {
    const devices = await adbText(['devices']);
    const lines = devices.split(/\r?\n/).slice(1).filter(Boolean);
    const authorized = lines.find((line) => /\tdevice$/.test(line));
    if (!authorized) {
        throw new Error(`No authorized Android device found. adb devices:\n${devices}`);
    }
    return authorized.split(/\s+/)[0];
}

async function connectChromeOverCdp(cdpPort) {
    await adb(['forward', `tcp:${cdpPort}`, 'localabstract:chrome_devtools_remote']);
    const versionUrl = `http://127.0.0.1:${cdpPort}/json/version`;
    let lastError = null;
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            const response = await fetch(versionUrl);
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            await response.json();
            return chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
        } catch (err) {
            lastError = err;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
    throw new Error(`Chrome CDP is not reachable at ${versionUrl}. Open Chrome on the phone and make sure USB debugging is authorized. ${lastError?.message ?? lastError}`);
}

async function prepareSinglePage(context) {
    const pages = context.pages();
    const page = pages[0] ?? await context.newPage();
    for (const extra of pages.slice(1)) {
        await extra.close().catch(() => {});
    }
    return page;
}

async function closeExtraCdpPages(cdpPort, keepUrl = null) {
    const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    if (!response.ok) return;
    const targets = await response.json();
    const pages = targets.filter((target) => target.type === 'page');
    if (pages.length <= 1) return;

    let keep = null;
    if (keepUrl) {
        const normalizedKeepUrl = new URL(keepUrl).href;
        keep = pages.find((target) => {
            try {
                return new URL(target.url).href === normalizedKeepUrl;
            } catch {
                return target.url === keepUrl;
            }
        });
    }
    keep = keep ?? pages[0];

    for (const target of pages) {
        if (target.id === keep.id) continue;
        await fetch(`http://127.0.0.1:${cdpPort}/json/close/${target.id}`).catch(() => {});
    }
}

function makeTargetUrl(args, config) {
    const url = new URL(`http://127.0.0.1:${args.port}`);
    url.searchParams.set('renderer', 'webgpu');
    url.searchParams.set('scene', config.scene);
    url.searchParams.set('mode', config.mode);
    url.searchParams.set('autostart', '1');
    url.searchParams.set('perfMode', '1');
    url.searchParams.set('probeRender', '1');
    url.searchParams.set('perfPose', config.pose);
    url.searchParams.set('perfSystem', config.system);
    if (args.nativeTreeImpostors === '1' || args.nativeTreeImpostors === true) {
        url.searchParams.set('konveyorNativeTreeImpostors', '1');
    }
    return url.href;
}

async function captureOne(context, args, config) {
    const page = await prepareSinglePage(context);
    const errors = [];
    const onPageError = (err) => errors.push(err.message);
    const onConsole = (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);

    const targetUrl = makeTargetUrl(args, config);
    let summary = null;
    let probe = null;
    let visualProbe = null;
    let screenshot = null;
    let warning = null;

    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
        await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
        await page.evaluate(({ pose, system }) => {
            window.__perfHarness?.setCameraPose?.(pose);
            window.__perfHarness?.setSystemIsolation?.(system);
        }, { pose: config.pose, system: config.system });
        await page.waitForTimeout(Number(args.warmup));
        summary = await page.evaluate(async (measureMs) => {
            window.__perfHarness.reset?.();
            window.__perfHarness.startSampling(measureMs);
            await new Promise((resolve) => setTimeout(resolve, measureMs + 250));
            return window.__perfHarness.getSummary();
        }, Number(args.measure));
        visualProbe = await page.evaluate(() => window.__perfHarness?.getVisualProbe?.() ?? null).catch(() => null);
        probe = await page.evaluate(async () => {
            const costReport = window.__perfHarness?.getCostReport?.() ?? null;
            let adapter = null;
            let device = null;
            try {
                adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
                device = adapter ? await adapter.requestDevice() : null;
            } catch {}
            device?.destroy?.();
            return {
                userAgent: navigator.userAgent,
                secureContext: window.isSecureContext,
                rendererMode: window.__sdsRendererMode ?? null,
                webgpu: {
                    navigatorGpu: !!navigator.gpu,
                    adapter: !!adapter,
                    features: adapter ? Array.from(adapter.features).sort() : [],
                    limits: adapter ? {
                        maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
                        maxBindGroups: adapter.limits.maxBindGroups,
                        maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
                    } : null,
                    info: adapter?.info ? { ...adapter.info } : null,
                },
                costReport,
            };
        });
        const effectiveRenderer = summary?.costReport?.renderer
            ?? probe?.rendererMode?.effective
            ?? visualProbe?.renderer
            ?? 'unknown';
        if (!String(effectiveRenderer).startsWith('webgpu')) {
            warning = `requested WebGPU but effective renderer is ${effectiveRenderer}`;
        }
        if (args.screenshots === '1') {
            const screenshotDir = resolve(ROOT, args.screenshotDir);
            await mkdir(screenshotDir, { recursive: true });
            const screenshotPath = resolve(
                screenshotDir,
                `${safeName(`${config.scene}-${config.mode}-${config.pose}-${config.system}`)}.png`
            );
            const buffer = await page.screenshot({ path: screenshotPath, fullPage: true });
            screenshot = {
                path: relativeArtifactPath(screenshotPath),
                stats: await analyzeScreenshot(buffer),
            };
        }
        await closeExtraCdpPages(args.cdpPort, targetUrl).catch(() => {});
    } catch (err) {
        warning = err.message || String(err);
    } finally {
        page.off('pageerror', onPageError);
        page.off('console', onConsole);
    }

    const result = {
        configId: `${config.scene}-${config.mode}--${config.pose}--${config.system}`,
        targetUrl,
        scene: config.scene,
        mode: config.mode,
        cameraPose: config.pose,
        systemIsolation: config.system,
        warmupMs: Number(args.warmup),
        measureMs: Number(args.measure),
        ok: !!summary && errors.length === 0 && !warning,
        summary,
        probe,
        visualProbe,
        screenshot,
        errors,
        warning,
    };
    result.budget = evaluateBudget(result, args.budget);
    return result;
}

async function run() {
    const args = parseArgs(process.argv);
    const configs = buildMatrix(args);
    const deviceId = await ensureDevice();
    await adb(['reverse', `tcp:${args.port}`, `tcp:${args.port}`]);
    if (args.freshChrome !== '0') {
        await adb(['shell', 'am', 'force-stop', 'com.android.chrome']).catch(() => {});
    }
    await adb(['shell', 'am', 'start', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main', '-d', 'about:blank'])
        .catch(() => {});

    console.log(`[ANDROID-WEBGPU-PERF] Device ${deviceId}, ${configs.length} run(s), localhost reverse tcp:${args.port}.`);
    if (args.budget) console.log(`[ANDROID-WEBGPU-PERF] Budget tier: ${args.budget} (full-scene rows only).`);
    if (args.screenshots === '1') console.log(`[ANDROID-WEBGPU-PERF] Screenshots: ${args.screenshotDir}.`);

    const browser = await connectChromeOverCdp(args.cdpPort);
    const context = browser.contexts()[0] ?? await browser.newContext();
    const results = [];

    try {
        for (const config of configs) {
            console.log(`[ANDROID-WEBGPU-PERF] -> ${config.scene}/${config.mode}/${config.pose}/${config.system}`);
            const result = await captureOne(context, args, config);
            const ms = result.summary
                ? `${result.summary.avgFrameTime.toFixed(2)}ms avg, ${result.summary.p95FrameTime.toFixed(2)}ms p95, ${result.summary.p99FrameTime.toFixed(2)}ms p99`
                : (result.warning ?? 'no summary');
            console.log(`[ANDROID-WEBGPU-PERF]    ${result.ok ? 'PASS' : 'FAIL'} ${ms}`);
            if (result.budget && !result.budget.ok) {
                console.log(`[ANDROID-WEBGPU-PERF]    budget fail ${JSON.stringify(result.budget.values)}`);
            }
            if (result.screenshot && !result.screenshot.stats.nonBlank) {
                console.log(`[ANDROID-WEBGPU-PERF]    screenshot blank ${result.screenshot.path}`);
            }
            results.push(result);
        }
    } finally {
        await closeExtraCdpPages(args.cdpPort, results.at(-1)?.targetUrl).catch(() => {});
        await browser.close();
    }

    const budgetFailures = results.filter((result) => result.budget && !result.budget.ok);
    const blankScreenshots = results.filter((result) => result.screenshot && !result.screenshot.stats.nonBlank);
    const output = {
        capturedAt: new Date().toISOString(),
        deviceId,
        targetOrigin: `http://127.0.0.1:${args.port}`,
        warmupMs: Number(args.warmup),
        measureMs: Number(args.measure),
        budgetTier: args.budget,
        ok: results.every((result) => result.ok)
            && budgetFailures.length === 0
            && blankScreenshots.length === 0,
        resultCount: results.length,
        budgetFailures: budgetFailures.map((result) => result.configId),
        blankScreenshots: blankScreenshots.map((result) => result.configId),
        results,
    };

    if (results.length === 1) {
        const aggregateOk = output.ok;
        Object.assign(output, results[0]);
        output.ok = aggregateOk;
        output.rowOk = results[0].ok;
        output.results = results;
    }

    const outPath = args.out
        ? resolve(ROOT, args.out)
        : resolve(ROOT, 'cycle38-validation/runtime', `android-webgpu-perf-${Date.now()}.json`);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');
    if (args.printJson === '1') {
        console.log(JSON.stringify(output, null, 2));
    } else {
        console.log(JSON.stringify({
            capturedAt: output.capturedAt,
            deviceId: output.deviceId,
            out: outPath.replace(`${ROOT}\\`, '').replace(`${ROOT}/`, '').replaceAll('\\', '/'),
            ok: output.ok,
            resultCount: output.resultCount,
            budgetFailureCount: output.budgetFailures.length,
            blankScreenshotCount: output.blankScreenshots.length,
        }, null, 2));
    }
    if (!output.ok) process.exitCode = 4;
}

run().catch((err) => {
    console.error('[ANDROID-WEBGPU-PERF] fatal:', err.message || err);
    if (err.stdout) console.error(err.stdout);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
});
