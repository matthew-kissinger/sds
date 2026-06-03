// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const CAMERA_MODES = Object.freeze(['follow', 'classic']);
const ZOOM_PRESETS = Object.freeze(['near', 'mid', 'far']);
const ROUTES_BY_SCENE = Object.freeze({
    field: Object.freeze([
        Object.freeze({ x: -80, z: -80 }),
        Object.freeze({ x: 0, z: 0 }),
        Object.freeze({ x: 80, z: 80 }),
    ]),
    'rolling-hills': Object.freeze([
        Object.freeze({ x: -120, z: -60 }),
        Object.freeze({ x: 0, z: 10 }),
        Object.freeze({ x: 120, z: 60 }),
    ]),
    'open-country': Object.freeze([
        Object.freeze({ x: -270, z: -90 }),
        Object.freeze({ x: 0, z: 20 }),
        Object.freeze({ x: 270, z: 90 }),
    ]),
});

function parseArgs(argv) {
    const args = {
        target: 'desktop',
        url: 'http://localhost:3000',
        renderer: 'webgpu',
        scene: 'rolling-hills',
        gameMode: 'classic',
        cameraModes: 'follow,classic',
        zooms: 'near,mid,far',
        duration: '18000',
        warmup: '1500',
        settle: '1000',
        switchMs: '2600',
        turnRate: '0',
        route: '',
        port: '3000',
        cdpPort: '9222',
        freshChrome: '1',
        screenshots: '0',
        screenshotDir: 'cycle38-validation/screenshots/dog-sprint-camera',
        out: 'cycle38-validation/runtime/dog-sprint-camera-harness.json',
        headed: '0',
        maxSpikeMs: '50',
        p99Ms: '34',
        repeatedSpikeLimit: '0',
    };
    for (const a of argv.slice(2)) {
        const match = a.match(/^--([^=]+)(?:=(.*))?$/);
        if (match) args[match[1]] = match[2] ?? '1';
    }
    return args;
}

function splitList(value, allValues) {
    if (!value) return allValues;
    if (value === 'all') return allValues;
    return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function safeName(value) {
    return String(value).replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '');
}

function parseRoute(value) {
    if (!value) return null;
    const route = String(value).split(';')
        .map((point) => {
            const [x, z] = point.split(',').map(Number);
            if (!Number.isFinite(x) || !Number.isFinite(z)) {
                throw new Error(`Invalid --route point "${point}". Use x,z;x,z.`);
            }
            return { x, z };
        });
    if (route.length < 2) throw new Error('--route must include at least two points.');
    return route;
}

function getRoute(args) {
    return parseRoute(args.route) ?? ROUTES_BY_SCENE[args.scene] ?? ROUTES_BY_SCENE['rolling-hills'];
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
    const stdev = channels.reduce((sum, c) => sum + c.stdev, 0) / channels.length;
    const min = Math.min(...channels.map((c) => c.min));
    const max = Math.max(...channels.map((c) => c.max));
    return {
        width: metadata.width,
        height: metadata.height,
        stdev: +stdev.toFixed(3),
        min,
        max,
        nonBlank: stdev > 2 && max - min > 12,
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

async function ensureAndroidDevice() {
    const devices = await adbText(['devices']);
    const lines = devices.split(/\r?\n/).slice(1).filter(Boolean);
    const authorized = lines.find((line) => /\tdevice$/.test(line));
    if (!authorized) {
        throw new Error(`No authorized Android device found. adb devices:\n${devices}`);
    }
    return authorized.split(/\s+/)[0];
}

async function connectAndroidChrome(args) {
    await adb(['reverse', `tcp:${args.port}`, `tcp:${args.port}`]);
    if (args.freshChrome !== '0') {
        await adb(['shell', 'am', 'force-stop', 'com.android.chrome']).catch(() => {});
    }
    await adb(['shell', 'am', 'start', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main', '-d', 'about:blank'])
        .catch(() => {});
    await adb(['forward', `tcp:${args.cdpPort}`, 'localabstract:chrome_devtools_remote']);
    const versionUrl = `http://127.0.0.1:${args.cdpPort}/json/version`;
    let lastError = null;
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            const response = await fetch(versionUrl);
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            await response.json();
            return chromium.connectOverCDP(`http://127.0.0.1:${args.cdpPort}`);
        } catch (err) {
            lastError = err;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
    throw new Error(`Chrome CDP is not reachable at ${versionUrl}. ${lastError?.message ?? lastError}`);
}

async function prepareSinglePage(context) {
    const pages = context.pages();
    const page = pages[0] ?? await context.newPage();
    for (const extra of pages.slice(1)) {
        await extra.close().catch(() => {});
    }
    return page;
}

function makeTargetUrl(args) {
    const base = args.target === 'android' ? `http://127.0.0.1:${args.port}` : args.url;
    const url = new URL(base);
    url.searchParams.set('renderer', args.renderer);
    url.searchParams.set('scene', args.scene);
    url.searchParams.set('mode', args.gameMode);
    url.searchParams.set('autostart', '1');
    url.searchParams.set('perfMode', '1');
    url.searchParams.set('probeRender', '1');
    return url.href;
}

async function runScenario(page, args, config) {
    await page.goto(makeTargetUrl(args), { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
    await page.waitForTimeout(Number(args.warmup));

    const report = await page.evaluate(async ({ cameraMode, zoomPreset, durationMs, switchMs, turnRate, settleMs, route }) => {
        const h = window.__perfHarness;
        const cc = window.__sds?.cameraController ?? window.__sds?.sceneManagerRef?.getCameraController?.();
        if (!h || !cc) throw new Error('Perf harness or camera controller unavailable.');

        if (typeof h.setDogDrive !== 'function') {
            throw new Error('Perf harness setDogDrive hook unavailable.');
        }
        const releaseAll = () => h.clearDogDrive?.();
        const pct = (values, p) => {
            const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
            if (sorted.length === 0) return 0;
            return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
        };

        const setCamera = () => {
            cc.setMode?.(cameraMode);
            const range = cc.getZoomState?.() ?? { min: cc.minDistance ?? 10, max: cc.maxDistance ?? 80, distance: cc.distance ?? 20 };
            const zoom = zoomPreset === 'near'
                ? range.min
                : zoomPreset === 'far'
                    ? range.max
                    : (range.min + range.max) * 0.5;
            cc.setZoom?.(zoom);
            return cc.getZoomState?.() ?? { mode: cameraMode, distance: zoom, min: range.min, max: range.max };
        };

        releaseAll();
        const routePoints = route.map((point) => ({
            x: Number(point.x),
            z: Number(point.z),
        }));
        if (routePoints.length < 2 || routePoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.z))) {
            throw new Error('Invalid dog sprint route.');
        }
        h.setDogPose?.({
            x: routePoints[0].x,
            z: routePoints[0].z,
            rotation: Math.atan2(routePoints[1].x - routePoints[0].x, routePoints[1].z - routePoints[0].z),
            resetVelocity: true,
        });
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const zoomState = setCamera();
        await new Promise((resolve) => setTimeout(resolve, settleMs));
        const startProbe = h.getVisualProbe?.() ?? null;
        const frameTimes = [];
        const samples = [];
        const spikes = [];
        let last = performance.now();
        let start = last;
        let waypointIndex = 1;
        let waypointSwitchCount = 0;
        let routeDistance = 0;
        let lastDog = startProbe?.dog?.position ?? null;

        return await new Promise((resolve) => {
            const tick = (now) => {
                const elapsed = now - start;
                const dt = now - last;
                last = now;
                if (dt > 0) frameTimes.push(dt);
                if (dt >= 50) spikes.push({ t: +elapsed.toFixed(1), frameMs: +dt.toFixed(3) });

                const probe = h.getVisualProbe?.() ?? null;
                const dog = probe?.dog?.position ?? null;
                if (dog && lastDog) {
                    routeDistance += Math.hypot((dog.x ?? 0) - (lastDog.x ?? 0), (dog.z ?? 0) - (lastDog.z ?? 0));
                }
                if (dog) lastDog = dog;

                const target = routePoints[Math.min(waypointIndex, routePoints.length - 1)];
                const dx = (target.x ?? 0) - (dog?.x ?? 0);
                const dz = (target.z ?? 0) - (dog?.z ?? 0);
                const distanceToTarget = Math.hypot(dx, dz);
                if (distanceToTarget < 14 && waypointIndex < routePoints.length - 1) {
                    waypointIndex++;
                    waypointSwitchCount++;
                }
                const nextTarget = routePoints[Math.min(waypointIndex, routePoints.length - 1)];
                const ndx = (nextTarget.x ?? 0) - (dog?.x ?? 0);
                const ndz = (nextTarget.z ?? 0) - (dog?.z ?? 0);
                const nextDistance = Math.max(0.001, Math.hypot(ndx, ndz));
                const nx = ndx / nextDistance;
                const nz = ndz / nextDistance;
                h.setDogDrive({
                    active: true,
                    sprint: true,
                    direction: { x: nx, z: nz },
                });

                if (cameraMode === 'free' && turnRate > 0) {
                    cc.applyYawDelta?.(turnRate * 0.08 * (dt / 1000));
                }

                if (samples.length < 160 && (samples.length === 0 || elapsed - samples[samples.length - 1].t >= 100)) {
                    samples.push({
                        t: +elapsed.toFixed(1),
                        frameMs: +dt.toFixed(3),
                        dog: probe?.dog?.position ?? null,
                        zoom: cc.getZoomState?.() ?? null,
                        target: nextTarget,
                        waypointIndex,
                    });
                }

                if (elapsed >= durationMs) {
                    releaseAll();
                    const endProbe = h.getVisualProbe?.() ?? null;
                    const costReport = h.getCostReport?.(frameTimes) ?? null;
                    const maxFrameTime = frameTimes.length > 0 ? Math.max(...frameTimes) : 0;
                    resolve({
                        cameraMode,
                        zoomPreset,
                        routeMode: 'perf-world-drive-cross-island-polyline',
                        route: routePoints,
                        zoomState,
                        durationMs,
                        switchMs,
                        turnRate,
                        waypointSwitchCount,
                        routeDistance: +routeDistance.toFixed(3),
                        frameCount: frameTimes.length,
                        avgFrameTime: frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(1, frameTimes.length),
                        p50FrameTime: pct(frameTimes, 50),
                        p95FrameTime: pct(frameTimes, 95),
                        p99FrameTime: pct(frameTimes, 99),
                        maxFrameTime,
                        spikeCount50ms: spikes.length,
                        spikes,
                        startDog: startProbe?.dog?.position ?? null,
                        endDog: endProbe?.dog?.position ?? null,
                        costReport,
                        samples,
                    });
                    return;
                }

                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }, {
        cameraMode: config.cameraMode,
        zoomPreset: config.zoomPreset,
        durationMs: Number(args.duration),
        switchMs: Number(args.switchMs),
        turnRate: Number(args.turnRate),
        settleMs: Number(args.settle),
        route: config.route,
    });

    const screenshot = await maybeScreenshot(page, args, config);
    const effectiveRenderer = report.costReport?.renderer ?? 'unknown';
    const thresholds = {
        maxSpikeMs: Number(args.maxSpikeMs),
        p99Ms: Number(args.p99Ms),
        repeatedSpikeLimit: Number(args.repeatedSpikeLimit),
    };
    const dogMoved = distance2D(report.startDog, report.endDog) >= 3;
    const netDisplacement = distance2D(report.startDog, report.endDog);
    const straightness = report.routeDistance > 0 ? netDisplacement / report.routeDistance : 0;
    const totalRouteLength = getRouteLength(report.route);
    const routeProgress = getRouteProgress(report.route, report.endDog);
    const finalTargetDistance = distance2D(report.endDog, report.route?.[report.route.length - 1]);
    const checks = {
        dogMoved,
        crossIslandProgress: routeProgress >= 0.82 && report.routeDistance >= totalRouteLength * 0.72,
        reachedFarSide: finalTargetDistance <= Math.max(18, totalRouteLength * 0.12),
        notCircular: straightness >= 0.72,
        p99: report.p99FrameTime <= thresholds.p99Ms,
        maxSpike: report.maxFrameTime <= thresholds.maxSpikeMs,
        repeatedSpikes: report.spikeCount50ms <= thresholds.repeatedSpikeLimit,
        renderer: args.renderer !== 'webgpu' || String(effectiveRenderer).startsWith('webgpu'),
        screenshot: !screenshot || screenshot.stats.nonBlank,
    };
    return {
        configId: `${config.cameraMode}-${config.zoomPreset}`,
        scene: args.scene,
        gameMode: args.gameMode,
        renderer: args.renderer,
        effectiveRenderer,
        ok: Object.values(checks).every(Boolean),
        thresholds,
        checks,
        routeValidation: {
            netDisplacement: +netDisplacement.toFixed(3),
            straightness: +straightness.toFixed(3),
            routeProgress: +routeProgress.toFixed(3),
            totalRouteLength: +totalRouteLength.toFixed(3),
            finalTargetDistance: +finalTargetDistance.toFixed(3),
        },
        report,
        screenshot,
    };
}

function distance2D(a, b) {
    if (!a || !b) return 0;
    const dx = (b.x ?? 0) - (a.x ?? 0);
    const dz = (b.z ?? 0) - (a.z ?? 0);
    return Math.hypot(dx, dz);
}

function getRouteLength(route = []) {
    let total = 0;
    for (let i = 1; i < route.length; i++) total += distance2D(route[i - 1], route[i]);
    return total;
}

function getRouteProgress(route = [], point = null) {
    const total = getRouteLength(route);
    if (!point || total <= 0) return 0;
    let bestProgress = 0;
    let bestDistance = Infinity;
    let traveled = 0;
    for (let i = 1; i < route.length; i++) {
        const a = route[i - 1];
        const b = route[i];
        const vx = b.x - a.x;
        const vz = b.z - a.z;
        const lenSq = vx * vx + vz * vz;
        const t = lenSq > 0
            ? Math.max(0, Math.min(1, (((point.x ?? 0) - a.x) * vx + ((point.z ?? 0) - a.z) * vz) / lenSq))
            : 0;
        const px = a.x + vx * t;
        const pz = a.z + vz * t;
        const d = Math.hypot((point.x ?? 0) - px, (point.z ?? 0) - pz);
        if (d < bestDistance) {
            bestDistance = d;
            bestProgress = traveled + Math.sqrt(lenSq) * t;
        }
        traveled += Math.sqrt(lenSq);
    }
    return Math.max(0, Math.min(1, bestProgress / total));
}

async function maybeScreenshot(page, args, config) {
    if (args.screenshots !== '1') return null;
    const screenshotDir = resolve(ROOT, args.screenshotDir);
    await mkdir(screenshotDir, { recursive: true });
    const screenshotPath = resolve(screenshotDir, `${safeName(`${args.scene}-${config.cameraMode}-${config.zoomPreset}`)}.png`);
    const buffer = await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
        path: relativeArtifactPath(screenshotPath),
        stats: await analyzeScreenshot(buffer),
    };
}

async function main() {
    const args = parseArgs(process.argv);
    const cameraModes = splitList(args.cameraModes, CAMERA_MODES);
    const zooms = splitList(args.zooms, ZOOM_PRESETS);
    const route = getRoute(args);
    const configs = cameraModes.flatMap((cameraMode) => zooms.map((zoomPreset) => ({ cameraMode, zoomPreset, route })));
    let deviceId = null;

    const browser = args.target === 'android'
        ? await (async () => {
            deviceId = await ensureAndroidDevice();
            return connectAndroidChrome(args);
        })()
        : await chromium.launch({ headless: args.headed !== '1', args: process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu'] : [] });
    const context = args.target === 'android'
        ? (browser.contexts()[0] ?? await browser.newContext())
        : await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await prepareSinglePage(context);
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });

    console.log(`[DOG-SPRINT] target=${args.target} scene=${args.scene} renderer=${args.renderer} configs=${configs.length}`);
    console.log(`[DOG-SPRINT] route=${route.map((p) => `${p.x},${p.z}`).join(' -> ')} length=${getRouteLength(route).toFixed(1)}m duration=${args.duration}ms`);
    if (deviceId) console.log(`[DOG-SPRINT] android device=${deviceId} adb reverse tcp:${args.port}`);

    const results = [];
    try {
        for (const config of configs) {
            console.log(`[DOG-SPRINT] -> ${config.cameraMode}/${config.zoomPreset}`);
            const result = await runScenario(page, args, config);
            console.log(
                `[DOG-SPRINT]    ${result.ok ? 'PASS' : 'FAIL'} ` +
                `p99=${result.report.p99FrameTime.toFixed(2)}ms max=${result.report.maxFrameTime.toFixed(2)}ms spikes50=${result.report.spikeCount50ms}`
            );
            results.push(result);
        }
    } finally {
        await page.close().catch(() => {});
        if (args.target !== 'android') await context.close().catch(() => {});
        await browser.close().catch(() => {});
    }

    const output = {
        capturedAt: new Date().toISOString(),
        target: args.target,
        deviceId,
        origin: args.target === 'android' ? `http://127.0.0.1:${args.port}` : args.url,
        renderer: args.renderer,
        scene: args.scene,
        gameMode: args.gameMode,
        route,
        routeLength: +getRouteLength(route).toFixed(3),
        durationMs: Number(args.duration),
        warmupMs: Number(args.warmup),
        switchMs: Number(args.switchMs),
        turnRate: Number(args.turnRate),
        ok: results.every((result) => result.ok) && errors.length === 0,
        errors,
        results,
    };
    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[DOG-SPRINT] Saved ${relativeArtifactPath(outPath)}`);
    if (!output.ok) process.exitCode = 4;
}

main().catch((err) => {
    console.error('[DOG-SPRINT] fatal:', err.message || err);
    if (err.stdout) console.error(err.stdout);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
});
