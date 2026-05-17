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

function relative(path) {
    return path.startsWith(ROOT) ? path.slice(ROOT.length + 1).replace(/\\/g, '/') : path;
}

function pathFor(name) {
    return resolve(SCREENSHOT_DIR, name);
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

async function capturePair(page, kind, interactor) {
    const beforeFull = pathFor(`${kind}-shadowless-off-full.png`);
    const afterFull = pathFor(`${kind}-shadowless-on-full.png`);
    const beforeCrop = pathFor(`${kind}-shadowless-off-crop.png`);
    const afterCrop = pathFor(`${kind}-shadowless-on-crop.png`);
    const diff = pathFor(`${kind}-shadowless-diff-crop.png`);
    const overlay = pathFor(`${kind}-shadowless-bend-overlay-crop.png`);
    const triptych = pathFor(`${kind}-shadowless-triptych.png`);

    await page.evaluate(async ({ kind }) => {
        const h = window.__perfHarness;
        const proof = window.__sdsGrassProof;
        h.setSystemIsolation('grass-only');
        proof.setInteractionShadowStrength(0);
        proof.setActorVisibility({
            dog: kind === 'dog',
            sheep: kind === 'sheep',
            sheepCount: kind === 'sheep' ? 1 : 0,
        });
        proof.setGrassInteractors([]);
        await proof.renderOnce();
    }, { kind });
    await renderStable(page);
    await page.screenshot({ path: beforeFull, fullPage: true });
    await crop(beforeFull, beforeCrop);

    const state = await page.evaluate(async ({ interactor }) => {
        const h = window.__perfHarness;
        const proof = window.__sdsGrassProof;
        const shadowDisabled = proof.setInteractionShadowStrength(0);
        const result = proof.setGrassInteractors([interactor]);
        await proof.renderOnce();
        return {
            visualProbe: h.getVisualProbe(),
            interactorResult: result,
            proofMode: 'shadow-disabled-geometry-deformation',
            shadowStrength: 0,
            shadowDisabled,
        };
    }, { interactor });
    await renderStable(page);
    await page.screenshot({ path: afterFull, fullPage: true });
    await crop(afterFull, afterCrop);

    const diffStats = await writeDiff(beforeCrop, afterCrop, diff, overlay, triptych, kind);

    return {
        kind,
        proofMode: 'shadow-disabled-geometry-deformation',
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

await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
await page.waitForFunction(() => Boolean(window.__sdsCinema?.setCameraPose), null, { timeout: 60_000 });
await page.waitForFunction(() => Boolean(window.__sdsGrassProof?.setGrassInteractors), null, { timeout: 60_000 });

const setup = await page.evaluate(async () => {
    const h = window.__perfHarness;
    const proof = window.__sdsGrassProof;
    window.__sdsCinema.pauseSimulation();
    proof.setPauseState(true);
    h.setDogPose({ x: 0, z: -30, rotation: 0, resetVelocity: true });
    proof.setSheepPose({ index: 0, x: 0, z: -30, facingDirection: Math.PI });
    proof.setGrassWind({ strength: 0, direction: { x: 1, y: 0 } });
    const shadowDisabled = proof.setInteractionShadowStrength(0);
    window.__sdsCinema.setCameraPose(
        { x: -8, y: 34, z: -52 },
        { x: 0, y: 19.4, z: -30 }
    );
    await proof.renderOnce();
    return {
        visualProbe: h.getVisualProbe(),
        proofMode: 'shadow-disabled-geometry-deformation',
        shadowStrength: 0,
        shadowDisabled,
    };
});

const dogEvidence = await capturePair(page, 'dog', {
    type: 'dog',
    position: { x: 0, y: 0, z: -30 },
    currentRotation: 0,
});

const sheepEvidence = await capturePair(page, 'sheep', {
    type: 'sheep',
    position: { x: 0, y: 0, z: -30 },
    facingDirection: Math.PI,
});

const result = {
    capturedAt: new Date().toISOString(),
    url: url.href,
    renderer: dogEvidence.state.visualProbe?.renderer ?? setup?.visualProbe?.renderer ?? null,
    setup,
    acceptance: {
        shadowDisabled: setup.shadowDisabled === true
            && dogEvidence.state.shadowDisabled === true
            && sheepEvidence.state.shadowDisabled === true,
        minimumChangedPixels: 1200,
        evidenceIsGeometry: 'contact darkening forced to zero in grass material controls',
    },
    dogEvidence,
    sheepEvidence,
    ok: errors.length === 0
        && String(dogEvidence.state.visualProbe?.renderer ?? '').startsWith('webgpu')
        && setup.shadowDisabled === true
        && dogEvidence.state.shadowDisabled === true
        && sheepEvidence.state.shadowDisabled === true
        && dogEvidence.diffStats.changedPixels > 1200
        && sheepEvidence.diffStats.changedPixels > 1200,
    errors,
};

await writeFile(OUT_PATH, JSON.stringify(result, null, 2));
await context.close();
await browser.close();

if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
}

console.log(JSON.stringify({
    ok: result.ok,
    renderer: result.renderer,
    out: relative(OUT_PATH),
    dog: {
        changedPct: result.dogEvidence.diffStats.changedPct,
        triptych: result.dogEvidence.screenshots.triptych,
    },
    sheep: {
        changedPct: result.sheepEvidence.diffStats.changedPct,
        triptych: result.sheepEvidence.screenshots.triptych,
    },
}, null, 2));
