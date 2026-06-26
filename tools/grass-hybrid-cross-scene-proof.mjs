// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = Object.fromEntries(
    process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value ?? true];
    })
);

const BASE_URL = args.baseUrl ?? args['base-url'] ?? 'http://localhost:3000/';
const OUT_PATH = resolve(ROOT, args.out ?? 'cycle105-validation/grass/grass-hybrid-cross-scene-proof.json');
const SCREENSHOT_DIR = resolve(ROOT, args.screenshotDir ?? 'cycle105-validation/grass/hybrid-cross-scene');
const CONTACT_SHEET_PATH = resolve(ROOT, args.contactSheet ?? 'cycle105-validation/grass/hybrid-cross-scene-contact-sheet.png');
const CHANNEL = args.channel ?? 'chrome';
const RENDERER = args.renderer ?? 'webgpu';
const WARMUP_MS = Number(args.warmup ?? 2500);
const WAIT_FOLIAGE = String(args.waitFoliage ?? '1') !== '0';
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const PROFILES = Object.freeze([
    Object.freeze({ id: 'default', label: 'Default', query: null }),
    Object.freeze({ id: 'sds-hybrid-v1', label: 'SDS Hybrid v1', query: 'sds-hybrid-v1' }),
]);
const SCENES = Object.freeze([
    Object.freeze({ id: 'field', mode: 'classic', label: 'Home Field' }),
    Object.freeze({ id: 'rolling-hills', mode: 'classic', label: 'Rolling Hills' }),
    Object.freeze({ id: 'open-country', mode: 'classic', label: 'Open Country' }),
    Object.freeze({ id: 'newsheepdogland', mode: 'survival', label: 'NSL' }),
]);
const POSES = Object.freeze([
    Object.freeze({ id: 'follow-close', label: 'Follow Close' }),
    Object.freeze({ id: 'classic-max', label: 'Classic Max' }),
]);

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
    const mean = channels.reduce((sum, channel) => sum + channel.mean, 0) / channels.length;
    const stdev = channels.reduce((sum, channel) => sum + channel.stdev, 0) / channels.length;
    const min = Math.min(...channels.map((channel) => channel.min));
    const max = Math.max(...channels.map((channel) => channel.max));
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

function makeTargetUrl(scene, profile) {
    const url = new URL(BASE_URL);
    url.searchParams.set('renderer', RENDERER);
    url.searchParams.set('scene', scene.id);
    url.searchParams.set('mode', scene.mode);
    url.searchParams.set('autostart', '1');
    url.searchParams.set('perfMode', '1');
    url.searchParams.set('probeRender', '1');
    url.searchParams.set('cinematic', '1');
    url.searchParams.set('ui', 'off');
    if (profile.query) url.searchParams.set('grassProfile', profile.query);
    return url.href;
}

async function waitForScene(page, scene) {
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
    await page.waitForFunction(() => Boolean(window.__sdsCinema?.setCameraPose), null, { timeout: 90_000 });
    await page.evaluate(() => window.__sdsCinema?.waitReady?.(90_000));
    if (WAIT_FOLIAGE && scene.id === 'newsheepdogland') {
        await page.waitForFunction(
            () => (window.__sdsFoliageStreaming?.completedAt ?? 0) > 0,
            null,
            { timeout: 120_000 },
        ).catch(() => {});
    }
    await page.waitForTimeout(WARMUP_MS);
}

async function capturePose(page, scene, profile, pose) {
    const screenshotPath = resolve(
        SCREENSHOT_DIR,
        `${safeName(scene.id)}--${safeName(pose.id)}--${safeName(profile.id)}.png`
    );
    const state = await page.evaluate(async ({ poseId }) => {
        const game = window.gameInstance ?? window.__sds?.gameInstanceRef ?? null;
        const h = window.__perfHarness;
        h?.setSystemIsolation?.('full');
        h?.setCameraPose?.(poseId);
        window.__sdsCinema?.hideUI?.();
        window.__sdsCinema?.pauseSimulation?.();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        window.__sdsCinema?.renderFrame?.();
        await new Promise((resolve) => requestAnimationFrame(resolve));

        const renderer = window.__sdsRenderer ?? game?.sceneManager?.getRenderer?.() ?? null;
        const grass = game?.terrainBuilder?.grassSystem ?? null;
        const visualProbe = h?.getVisualProbe?.() ?? null;
        const costReport = h?.getCostReport?.([]) ?? null;
        const grassStats = grass?.getStats?.() ?? null;
        return {
            rendererMode: window.__sdsRendererMode ?? null,
            sceneId: window.__currentSceneId ?? null,
            sheepCount: game?.gameState?.optimizedSheepSystem?.count ?? visualProbe?.sheep?.count ?? null,
            dog: visualProbe?.dog ?? null,
            grass: grassStats ? {
                ...grassStats,
                visibleTriangleEstimate: grass?.getVisibleTriangleEstimate?.() ?? null,
                totalTriangleEstimate: grass?.getTotalTriangleEstimate?.() ?? null,
            } : null,
            visualProbe,
            costReport,
            rendererInfo: renderer?.info
                ? {
                    render: { ...renderer.info.render },
                    memory: { ...renderer.info.memory },
                }
                : null,
            foliage: {
                planned: window.__sdsFoliageStreaming?.planned ?? null,
                wavesDone: window.__sdsFoliageStreaming?.wavesDone ?? null,
                completed: (window.__sdsFoliageStreaming?.completedAt ?? 0) > 0,
            },
        };
    }, { poseId: pose.id });
    const buffer = await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
        scene: scene.id,
        sceneLabel: scene.label,
        mode: scene.mode,
        profile: profile.id,
        profileLabel: profile.label,
        pose: pose.id,
        poseLabel: pose.label,
        screenshot: {
            path: relativeArtifactPath(screenshotPath),
            stats: await analyzeScreenshot(buffer),
        },
        state,
    };
}

function summarizeComparisons(results) {
    const byKey = new Map(results.map((result) => [`${result.scene}:${result.pose}:${result.profile}`, result]));
    const comparisons = [];
    for (const scene of SCENES) {
        for (const pose of POSES) {
            const currentDefault = byKey.get(`${scene.id}:${pose.id}:default`);
            const hybrid = byKey.get(`${scene.id}:${pose.id}:sds-hybrid-v1`);
            if (!currentDefault || !hybrid) continue;
            const defaultGrass = currentDefault.state.grass ?? {};
            const hybridGrass = hybrid.state.grass ?? {};
            const defaultTris = Number(defaultGrass.visibleTriangleEstimate ?? 0);
            const hybridTris = Number(hybridGrass.visibleTriangleEstimate ?? 0);
            comparisons.push({
                scene: scene.id,
                pose: pose.id,
                defaultVisibleGrassTriangles: defaultTris,
                hybridVisibleGrassTriangles: hybridTris,
                visibleGrassTriangleDeltaPct: defaultTris > 0
                    ? +(((hybridTris - defaultTris) / defaultTris) * 100).toFixed(1)
                    : null,
                defaultVisibleClumps: defaultGrass.visibleClumps ?? null,
                hybridVisibleClumps: hybridGrass.visibleClumps ?? null,
                defaultRenderCalls: currentDefault.state.rendererInfo?.render?.calls ?? null,
                hybridRenderCalls: hybrid.state.rendererInfo?.render?.calls ?? null,
                hybridGroundContact: hybridGrass.groundContact ?? null,
                sheepCount: hybrid.state.sheepCount ?? currentDefault.state.sheepCount ?? null,
            });
        }
    }
    return comparisons;
}

async function makeContactSheet(results) {
    const thumbWidth = 360;
    const thumbHeight = 203;
    const labelHeight = 42;
    const gutter = 12;
    const rows = [];
    for (const scene of SCENES) {
        for (const pose of POSES) rows.push({ scene, pose });
    }
    const width = gutter + PROFILES.length * thumbWidth + (PROFILES.length - 1) * gutter + gutter;
    const height = gutter + rows.length * (labelHeight + thumbHeight + gutter);
    const composites = [];
    const resultByKey = new Map(results.map((result) => [`${result.scene}:${result.pose}:${result.profile}`, result]));

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const { scene, pose } = rows[rowIndex];
        const top = gutter + rowIndex * (labelHeight + thumbHeight + gutter);
        for (let colIndex = 0; colIndex < PROFILES.length; colIndex++) {
            const profile = PROFILES[colIndex];
            const left = gutter + colIndex * (thumbWidth + gutter);
            const result = resultByKey.get(`${scene.id}:${pose.id}:${profile.id}`);
            if (!result) continue;
            const labelSvg = `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="#101820"/>
                <text x="12" y="18" fill="#f5efe2" font-size="16" font-family="Arial, sans-serif">${scene.label} - ${pose.label}</text>
                <text x="12" y="35" fill="#9fd0b0" font-size="14" font-family="Arial, sans-serif">${profile.label}</text>
            </svg>`;
            const thumb = await sharp(resolve(ROOT, result.screenshot.path))
                .resize(thumbWidth, thumbHeight, { fit: 'cover' })
                .png()
                .toBuffer();
            composites.push({ input: Buffer.from(labelSvg), top, left });
            composites.push({ input: thumb, top: top + labelHeight, left });
        }
    }

    await sharp({
        create: {
            width,
            height,
            channels: 4,
            background: '#0e1612',
        },
    })
        .composite(composites)
        .png()
        .toFile(CONTACT_SHEET_PATH);
    return relativeArtifactPath(CONTACT_SHEET_PATH);
}

await mkdir(dirname(OUT_PATH), { recursive: true });
await mkdir(SCREENSHOT_DIR, { recursive: true });
await mkdir(dirname(CONTACT_SHEET_PATH), { recursive: true });

const launchOptions = {
    headless: String(args.headed ?? '0') !== '1',
    args: process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu'] : [],
};
if (CHANNEL) launchOptions.channel = CHANNEL;

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: VIEWPORT });
await context.addInitScript(() => {
    localStorage.setItem('sds:tutorialDone', '1');
});
const page = await context.newPage();
page.setDefaultTimeout(90_000);
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
});

const results = [];
try {
    for (const scene of SCENES) {
        for (const profile of PROFILES) {
            console.log(`[GRASS-XSCENE] ${scene.id} ${profile.id}`);
            await page.goto(makeTargetUrl(scene, profile), { waitUntil: 'domcontentloaded', timeout: 90_000 });
            await waitForScene(page, scene);
            for (const pose of POSES) {
                const result = await capturePose(page, scene, profile, pose);
                console.log(`[GRASS-XSCENE]   ${pose.id} ${result.screenshot.stats.nonBlank ? 'nonblank' : 'blank'} ${result.screenshot.path}`);
                results.push(result);
            }
        }
    }
} finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
}

const contactSheet = await makeContactSheet(results);
const comparisons = summarizeComparisons(results);
const output = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    renderer: RENDERER,
    waitFoliage: WAIT_FOLIAGE,
    warmupMs: WARMUP_MS,
    profiles: PROFILES,
    scenes: SCENES,
    poses: POSES,
    contactSheet,
    comparisons,
    results,
    ok: errors.length === 0 && results.every((result) => result.screenshot.stats.nonBlank),
    errors,
};

await writeFile(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
console.log(JSON.stringify({
    ok: output.ok,
    out: relativeArtifactPath(OUT_PATH),
    contactSheet,
    comparisons: comparisons.map((comparison) => ({
        scene: comparison.scene,
        pose: comparison.pose,
        visibleGrassTriangleDeltaPct: comparison.visibleGrassTriangleDeltaPct,
        hybridGroundContact: comparison.hybridGroundContact,
        sheepCount: comparison.sheepCount,
    })),
    errors,
}, null, 2));

if (!output.ok) process.exitCode = 1;
