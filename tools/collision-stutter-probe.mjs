// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Browser collision-stutter probe.
 *
 * Assumes a Vite dev or preview server is already running. Boots a perfMode
 * run, clusters the active sheep, drives the dog through the group, and writes
 * frame + collision sub-timing from window.__perfHarness.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const MODE_FOR_COUNT = {
    25: 'quick',
    50: 'quick',
    75: 'quick',
    150: 'classic',
    200: 'classic',
    600: 'extreme',
    1000: 'extreme',
    3000: 'insane',
    5000: 'chaos',
};

const DEFAULT_OUT = 'cycle63-validation/collision-stutter/latest.json';
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu']
    : [];

function parseArgs(argv) {
    const args = {
        url: 'http://localhost:4173',
        scene: 'field',
        mode: null,
        count: null,
        radius: 5,
        centerX: 0,
        centerZ: 0,
        dogOffset: 7,
        measure: 8000,
        warmup: 2500,
        renderer: 'webgl',
        system: 'full',
        pose: 'follow-close',
        cpu: 1,
        out: DEFAULT_OUT,
        headed: false,
    };
    for (const arg of argv.slice(2)) {
        const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
        if (!match) continue;
        const [, key, value = 'true'] = match;
        if (['count', 'radius', 'centerX', 'centerZ', 'dogOffset', 'measure', 'warmup', 'cpu'].includes(key)) {
            args[key] = Number(value);
        } else if (key === 'headed') {
            args.headed = value !== 'false';
        } else {
            args[key] = value;
        }
    }
    return args;
}

function makeTargetUrl(args) {
    const url = new URL(args.url);
    const mode = args.mode ?? MODE_FOR_COUNT[args.count] ?? 'classic';
    url.searchParams.set('perfMode', '1');
    url.searchParams.set('collisionProbe', '1');
    url.searchParams.set('autostart', '1');
    url.searchParams.set('scene', args.scene);
    url.searchParams.set('mode', mode);
    url.searchParams.set('renderer', args.renderer);
    return url.href;
}

async function seedIdentity(context) {
    await context.addInitScript(() => {
        const identity = {
            persistentId: 'player_collision_probe_' + Date.now(),
            displayName: 'CollisionProbe',
            fullName: 'CollisionProbe#0001',
            discriminator: '0001',
            nameType: 'custom',
            createdAt: Date.now(),
            isRegistered: false,
        };
        localStorage.setItem('playerIdentity', JSON.stringify(identity));
    });
}

async function run() {
    const args = parseArgs(process.argv);
    const targetUrl = makeTargetUrl(args);
    const browser = await chromium.launch({
        headless: !args.headed,
        args: CHROMIUM_GPU_ARGS,
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await seedIdentity(context);
    const page = await context.newPage();
    if (Number.isFinite(args.cpu) && args.cpu > 1) {
        const session = await context.newCDPSession(page);
        await session.send('Emulation.setCPUThrottlingRate', { rate: args.cpu });
    }
    const consoleMessages = [];
    const errors = [];

    page.on('console', (msg) => {
        const text = msg.text();
        consoleMessages.push(`[${msg.type()}] ${text}`);
        if (msg.type() === 'error') errors.push(text);
    });
    page.on('pageerror', (error) => errors.push(error.message));

    console.log(`[COLLISION-PROBE] booting ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
    await page.evaluate(({ pose, system }) => {
        window.__perfHarness.setCameraPose(pose);
        window.__perfHarness.setSystemIsolation(system);
        window.__perfHarness.setCollisionProbeEnabled(true);
    }, { pose: args.pose, system: args.system });

    await page.waitForTimeout(args.warmup);

    const setup = await page.evaluate((probeArgs) => {
        const h = window.__perfHarness;
        const cluster = h.placeCollisionProbeCluster({
            count: probeArgs.count ?? undefined,
            radius: probeArgs.radius,
            centerX: probeArgs.centerX,
            centerZ: probeArgs.centerZ,
        });
        const dogX = probeArgs.centerX - probeArgs.radius - probeArgs.dogOffset;
        h.setDogPose({ x: dogX, z: probeArgs.centerZ, resetVelocity: true, rotation: Math.PI / 2 });
        h.setDogDrive({ active: true, direction: { x: 1, z: 0 }, sprint: true });
        h.reset();
        return {
            cluster,
            dogStart: { x: dogX, z: probeArgs.centerZ },
            initialCollision: h.getCollisionProfile(),
        };
    }, args);

    const duration = await page.evaluate((measure) => window.__perfHarness.startSampling(measure), args.measure);
    await page.waitForTimeout(Number(duration) + 500);
    await page.evaluate(() => window.__perfHarness.clearDogDrive());

    const summary = await page.evaluate(() => window.__perfHarness.getSummary());
    const finalCollision = await page.evaluate(() => window.__perfHarness.getCollisionProfile());
    const metrics = await page.evaluate(() => window.__perfHarness.getMetrics());
    const visualProbe = await page.evaluate(() => window.__perfHarness.getVisualProbe?.() ?? null).catch(() => null);

    const result = {
        contract: 'sds-collision-stutter-probe-v1',
        capturedAt: new Date().toISOString(),
        targetUrl,
        scene: args.scene,
        mode: args.mode ?? MODE_FOR_COUNT[args.count] ?? 'classic',
        requested: {
            count: args.count,
            radius: args.radius,
            centerX: args.centerX,
            centerZ: args.centerZ,
            dogOffset: args.dogOffset,
            warmupMs: args.warmup,
            measureMs: args.measure,
            renderer: args.renderer,
            system: args.system,
            pose: args.pose,
            cpuThrottle: args.cpu,
        },
        setup,
        summary,
        finalCollision,
        metrics,
        visualProbe,
        errors,
        consoleTail: consoleMessages.slice(-40),
    };

    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`[COLLISION-PROBE] wrote ${outPath}`);
    console.log('[COLLISION-PROBE] summary:', JSON.stringify({
        frame: summary ? {
            sampleCount: summary.sampleCount,
            avg: summary.avgFrameTime,
            p95: summary.p95FrameTime,
            p99: summary.p99FrameTime,
            max: summary.maxFrameTime,
        } : null,
        collision: summary?.collision ?? null,
        errors: errors.length,
    }, null, 2));

    await context.close();
    await browser.close();

    if (!summary || errors.length > 0) {
        process.exitCode = 1;
    }
}

run().catch((error) => {
    console.error('[COLLISION-PROBE] fatal:', error);
    process.exit(2);
});
