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

const BASE_URL = args.baseUrl ?? args['base-url'] ?? 'http://127.0.0.1:4173/';
const OUT_PATH = resolve(ROOT, args.out ?? 'cycle38-validation/runtime/desktop-webgpu-grass-interaction-evidence.json');
const SCREENSHOT_DIR = resolve(ROOT, args.screenshotDir ?? 'cycle38-validation/screenshots/desktop-webgpu-grass-interaction-evidence');
const CHANNEL = args.channel ?? 'chrome';
const CROP = Object.freeze({ left: 260, top: 100, width: 760, height: 560 });
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const CONTACT_MODE = String(args.contactMode ?? args['contact-mode'] ?? 'geometry');
const CHECK = String(args.check ?? '1') !== '0';
const PROOF_X = Number(args.proofX ?? args['proof-x'] ?? 0);
const PROOF_Z = Number(args.proofZ ?? args['proof-z'] ?? -30);
const PROOF_MODES = Object.freeze({
    geometry: Object.freeze({
        id: 'geometry',
        suffix: 'shadowless',
        label: 'shadowless',
        shadowStrength: 0,
        groundContact: false,
        systemIsolation: 'grass-only',
        minimumChangedPixels: 1200,
        evidence: 'contact darkening and hybrid ground contact forced off',
    }),
    visible: Object.freeze({
        id: 'visible',
        suffix: 'visible-contact',
        label: 'visible contact',
        shadowStrength: null,
        groundContact: true,
        systemIsolation: 'full',
        minimumChangedPixels: 1200,
        evidence: 'full visible contact read: blade deformation, contact shading, and optional hybrid ground contact',
    }),
});

function relative(path) {
    return path.startsWith(ROOT) ? path.slice(ROOT.length + 1).replace(/\\/g, '/') : path;
}

function pathFor(name) {
    return resolve(SCREENSHOT_DIR, name);
}

function requestedProofModes() {
    if (CONTACT_MODE === 'both') return [PROOF_MODES.geometry, PROOF_MODES.visible];
    const mode = PROOF_MODES[CONTACT_MODE];
    if (!mode) {
        throw new Error(`Unknown --contactMode="${CONTACT_MODE}". Use geometry, visible, or both.`);
    }
    return [mode];
}

async function crop(input, output) {
    await sharp(input).extract(CROP).png().toFile(output);
}

async function analyzeImage(path) {
    const image = sharp(path);
    const [stats, metadata] = await Promise.all([image.stats(), image.metadata()]);
    const channels = stats.channels.slice(0, 3);
    const mean = channels.reduce((sum, channel) => sum + channel.mean, 0) / channels.length;
    const stdev = channels.reduce((sum, channel) => sum + channel.stdev, 0) / channels.length;
    return {
        width: metadata.width,
        height: metadata.height,
        mean: +mean.toFixed(3),
        stdev: +stdev.toFixed(3),
        nonBlank: stdev > 2,
    };
}

async function writeDiff(beforePath, afterPath, diffPath, overlayPath, triptychPath, label) {
    const [before, after] = await Promise.all([
        sharp(beforePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
        sharp(afterPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    const { width, height } = before.info;
    const beforeData = before.data;
    const afterData = after.data;
    const diff = Buffer.alloc(width * height * 4);
    const heat = Buffer.alloc(width * height * 4);
    let changedPixels = 0;
    let sumDelta = 0;
    let maxDelta = 0;

    for (let i = 0; i < width * height; i++) {
        const p = i * 4;
        const dr = Math.abs(afterData[p] - beforeData[p]);
        const dg = Math.abs(afterData[p + 1] - beforeData[p + 1]);
        const db = Math.abs(afterData[p + 2] - beforeData[p + 2]);
        const delta = Math.round((dr + dg + db) / 3);
        if (delta > 14) changedPixels++;
        sumDelta += delta;
        if (delta > maxDelta) maxDelta = delta;
        const amplified = Math.min(255, delta * 5);
        diff[p] = amplified;
        diff[p + 1] = amplified;
        diff[p + 2] = amplified;
        diff[p + 3] = 255;
        heat[p] = 255;
        heat[p + 1] = Math.max(0, 220 - amplified);
        heat[p + 2] = 0;
        heat[p + 3] = delta > 14 ? Math.min(210, 60 + delta * 4) : 0;
    }

    await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(diffPath);
    const heatBuffer = await sharp(heat, { raw: { width, height, channels: 4 } }).png().toBuffer();
    await sharp(afterPath)
        .composite([{ input: heatBuffer, blend: 'over' }])
        .png()
        .toFile(overlayPath);

    const labels = [
        ['off', 0],
        ['on', width],
        ['difference x5', width * 2],
    ].map(([text, x]) => ({
        input: Buffer.from(`<svg width="${width}" height="34" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101820"/><text x="16" y="23" fill="#f4f1e8" font-size="18" font-family="Arial, sans-serif">${label}: ${text}</text></svg>`),
        top: 0,
        left: x,
    }));

    await sharp({
        create: {
            width: width * 3,
            height: height + 34,
            channels: 4,
            background: '#101820',
        },
    })
        .composite([
            ...labels,
            { input: beforePath, top: 34, left: 0 },
            { input: afterPath, top: 34, left: width },
            { input: diffPath, top: 34, left: width * 2 },
        ])
        .png()
        .toFile(triptychPath);

    return {
        changedPixels,
        changedPct: +(changedPixels / (width * height) * 100).toFixed(3),
        meanDelta: +(sumDelta / (width * height)).toFixed(3),
        maxDelta,
    };
}

async function renderStable(page) {
    await page.evaluate(async () => {
        const proof = window.__sdsGrassProof;
        await proof.renderOnce();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
}

async function capturePair(page, kind, interactor, mode) {
    const beforeFull = pathFor(`${kind}-${mode.suffix}-off-full.png`);
    const afterFull = pathFor(`${kind}-${mode.suffix}-on-full.png`);
    const beforeCrop = pathFor(`${kind}-${mode.suffix}-off-crop.png`);
    const afterCrop = pathFor(`${kind}-${mode.suffix}-on-crop.png`);
    const diff = pathFor(`${kind}-${mode.suffix}-diff-crop.png`);
    const overlay = pathFor(`${kind}-${mode.suffix}-bend-overlay-crop.png`);
    const triptych = pathFor(`${kind}-${mode.suffix}-triptych.png`);

    await page.evaluate(async ({ kind, mode }) => {
        const h = window.__perfHarness;
        const proof = window.__sdsGrassProof;
        h.setSystemIsolation(mode.systemIsolation);
        proof.setGroundContactEnabled(mode.groundContact);
        const contract = h.getVisualProbe()?.grass?.interactorContract ?? {};
        const shadowStrength = Number.isFinite(mode.shadowStrength)
            ? mode.shadowStrength
            : (Number.isFinite(contract.shadowStrength) ? contract.shadowStrength : 0.22);
        proof.setInteractionShadowStrength(shadowStrength);
        proof.setActorVisibility({
            dog: kind === 'dog',
            sheep: kind === 'sheep',
            sheepCount: kind === 'sheep' ? 1 : 0,
        });
        proof.setGrassInteractors([]);
        await proof.renderOnce();
    }, { kind, mode });
    await renderStable(page);
    await page.screenshot({ path: beforeFull, fullPage: true });
    await crop(beforeFull, beforeCrop);

    const state = await page.evaluate(async ({ interactor, mode }) => {
        const h = window.__perfHarness;
        const proof = window.__sdsGrassProof;
        const groundContactEnabled = proof.setGroundContactEnabled(mode.groundContact);
        const contract = h.getVisualProbe()?.grass?.interactorContract ?? {};
        const shadowStrength = Number.isFinite(mode.shadowStrength)
            ? mode.shadowStrength
            : (Number.isFinite(contract.shadowStrength) ? contract.shadowStrength : 0.22);
        const shadowSet = proof.setInteractionShadowStrength(shadowStrength);
        const result = proof.setGrassInteractors([interactor]);
        await proof.renderOnce();
        return {
            visualProbe: h.getVisualProbe(),
            interactorResult: result,
            proofMode: mode.id,
            systemIsolation: mode.systemIsolation,
            shadowStrength,
            shadowSet,
            shadowDisabled: shadowStrength === 0 && shadowSet === true,
            groundContactEnabled,
        };
    }, { interactor, mode });
    await renderStable(page);
    await page.screenshot({ path: afterFull, fullPage: true });
    await crop(afterFull, afterCrop);

    const diffStats = await writeDiff(beforeCrop, afterCrop, diff, overlay, triptych, kind);

    return {
        kind,
        proofMode: mode.id,
        state,
        crop: CROP,
        screenshots: {
            beforeFull: relative(beforeFull),
            afterFull: relative(afterFull),
            beforeCrop: relative(beforeCrop),
            afterCrop: relative(afterCrop),
            diffCrop: relative(diff),
            heatOverlayCrop: relative(overlay),
            triptych: relative(triptych),
        },
        beforeStats: await analyzeImage(beforeCrop),
        afterStats: await analyzeImage(afterCrop),
        diffStats,
    };
}

await mkdir(dirname(OUT_PATH), { recursive: true });
await mkdir(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({
    channel: CHANNEL,
    args: process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu'] : [],
});

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

const url = new URL(BASE_URL);
url.searchParams.set('renderer', 'webgpu');
url.searchParams.set('perfMode', '1');
url.searchParams.set('autostart', '1');
url.searchParams.set('scene', 'rolling-hills');
url.searchParams.set('mode', 'classic');
url.searchParams.set('cinematic', '1');
url.searchParams.set('ui', 'off');
url.searchParams.set('grassInteractionProof', '1');
if (args.grassProfile) {
    url.searchParams.set('grassProfile', String(args.grassProfile));
}

await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
await page.waitForFunction(() => Boolean(window.__sdsCinema?.setCameraPose), null, { timeout: 60_000 });
await page.waitForFunction(() => Boolean(window.__sdsGrassProof?.setGrassInteractors), null, { timeout: 60_000 });

const setup = await page.evaluate(async ({ proofX, proofZ }) => {
    const h = window.__perfHarness;
    const proof = window.__sdsGrassProof;
    window.__sdsCinema.pauseSimulation();
    proof.setPauseState(true);
    h.setDogPose({ x: proofX, z: proofZ, rotation: 0, resetVelocity: true });
    proof.setSheepPose({ index: 0, x: proofX, z: proofZ, facingDirection: Math.PI });
    proof.setGrassWind({ strength: 0, direction: { x: 1, y: 0 } });
    proof.setGroundContactEnabled(false);
    const shadowDisabled = proof.setInteractionShadowStrength(0);
    window.__sdsCinema.setCameraPose(
        { x: proofX - 8, y: 34, z: proofZ - 22 },
        { x: proofX, y: 19.4, z: proofZ }
    );
    await proof.renderOnce();
    return {
        visualProbe: h.getVisualProbe(),
        proofMode: 'shadow-disabled-geometry-deformation',
        shadowStrength: 0,
        shadowDisabled,
        proofPosition: { x: proofX, z: proofZ },
    };
}, { proofX: PROOF_X, proofZ: PROOF_Z });

const modes = requestedProofModes();
const evidenceByMode = {};
for (const mode of modes) {
    const dogEvidence = await capturePair(page, 'dog', {
        type: 'dog',
        position: { x: PROOF_X, y: 0, z: PROOF_Z },
        currentRotation: 0,
    }, mode);

    const sheepEvidence = await capturePair(page, 'sheep', {
        type: 'sheep',
        position: { x: PROOF_X, y: 0, z: PROOF_Z },
        facingDirection: Math.PI,
    }, mode);

    evidenceByMode[mode.id] = {
        mode,
        dogEvidence,
        sheepEvidence,
        ok: errors.length === 0
            && String(dogEvidence.state.visualProbe?.renderer ?? '').startsWith('webgpu')
            && dogEvidence.diffStats.changedPixels > mode.minimumChangedPixels
            && sheepEvidence.diffStats.changedPixels > mode.minimumChangedPixels,
    };
}

const primaryMode = modes[0].id;
const dogEvidence = evidenceByMode[primaryMode].dogEvidence;
const sheepEvidence = evidenceByMode[primaryMode].sheepEvidence;

const result = {
    capturedAt: new Date().toISOString(),
    url: url.href,
    renderer: dogEvidence.state.visualProbe?.renderer ?? setup?.visualProbe?.renderer ?? null,
    setup,
    contactMode: CONTACT_MODE,
    acceptance: {
        modes: Object.fromEntries(modes.map((mode) => [mode.id, {
            minimumChangedPixels: mode.minimumChangedPixels,
            evidence: mode.evidence,
        }])),
    },
    dogEvidence,
    sheepEvidence,
    evidenceByMode,
    ok: Object.values(evidenceByMode).every((modeResult) => modeResult.ok),
    errors,
};

await writeFile(OUT_PATH, JSON.stringify(result, null, 2));
await context.close();
await browser.close();

if (CHECK && !result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
}

console.log(JSON.stringify({
    ok: result.ok,
    renderer: result.renderer,
    out: relative(OUT_PATH),
    modes: Object.fromEntries(Object.entries(evidenceByMode).map(([id, evidence]) => [id, {
        ok: evidence.ok,
        dog: {
            changedPixels: evidence.dogEvidence.diffStats.changedPixels,
            changedPct: evidence.dogEvidence.diffStats.changedPct,
            triptych: evidence.dogEvidence.screenshots.triptych,
        },
        sheep: {
            changedPixels: evidence.sheepEvidence.diffStats.changedPixels,
            changedPct: evidence.sheepEvidence.diffStats.changedPct,
            triptych: evidence.sheepEvidence.screenshots.triptych,
        },
    }])),
}, null, 2));
