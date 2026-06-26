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
const OUT_DIR = resolve(ROOT, args.out ?? 'cycle105-validation/homestead-playfield-pack-v1/scene-review');
const CHANNEL = args.channel ?? 'chrome';
const RENDERER = args.renderer ?? 'webgpu';
const KEEP_OPEN = String(args.keepOpen ?? args['keep-open'] ?? '0') === '1';
const VIEWPORT = Object.freeze({ width: 1400, height: 850 });
const LAUNCH_ARGS = Object.freeze(['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist']);
const PACK_ROOT = '/cycle105-validation/homestead-playfield-pack-v1';
const ASSET_ROOT = `${PACK_ROOT}/refined-glb`;

const PLAYFIELD_ASSETS = Object.freeze([
    Object.freeze({
        key: 'farmhouse-a-review',
        path: `${PACK_ROOT}/glb/01-farmhouse-a.glb`,
        targetHeight: 7,
    }),
    Object.freeze({
        key: 'stone-marker-no-ground',
        path: `${ASSET_ROOT}/10-stone-marker-no-ground.glb`,
        targetHeight: 1.1,
    }),
    Object.freeze({
        key: 'wildflower-a-no-ground',
        path: `${ASSET_ROOT}/11-wildflower-a-no-ground.glb`,
        targetHeight: 0.62,
    }),
    Object.freeze({
        key: 'wildflower-b-no-ground',
        path: `${ASSET_ROOT}/12-wildflower-b-no-ground.glb`,
        targetHeight: 0.62,
    }),
]);

const NO_GROUND_ASSETS = Object.freeze(PLAYFIELD_ASSETS.slice(1));

const FARMHOUSE_B_ASSET = Object.freeze({
    key: 'farmhouse-b-review',
    path: `${PACK_ROOT}/glb/02-farmhouse-b.glb`,
    targetHeight: 7.2,
});

const HOMESTEAD_PROP_ASSETS = Object.freeze([
    Object.freeze({
        key: 'utility-shed-review',
        path: `${PACK_ROOT}/glb/03-utility-shed.glb`,
        targetHeight: 3.4,
    }),
    Object.freeze({
        key: 'hay-bales-a-review',
        path: `${PACK_ROOT}/glb/04-hay-bales-a.glb`,
        targetHeight: 1.05,
    }),
    Object.freeze({
        key: 'hay-bales-b-review',
        path: `${PACK_ROOT}/glb/05-hay-bales-b.glb`,
        targetHeight: 0.9,
    }),
    Object.freeze({
        key: 'trough-bucket-review',
        path: `${PACK_ROOT}/glb/06-trough-bucket.glb`,
        targetHeight: 0.85,
    }),
    Object.freeze({
        key: 'crate-stack-review',
        path: `${PACK_ROOT}/glb/07-crate-stack.glb`,
        targetHeight: 1.55,
    }),
    Object.freeze({
        key: 'barrel-rope-review',
        path: `${PACK_ROOT}/glb/08-barrel-rope.glb`,
        targetHeight: 0.75,
    }),
    Object.freeze({
        key: 'log-pile-stump-review',
        path: `${PACK_ROOT}/glb/09-log-pile-stump.glb`,
        targetHeight: 0.8,
    }),
    Object.freeze({
        key: 'signpost-review',
        path: `${PACK_ROOT}/glb/13-signpost.glb`,
        targetHeight: 2,
    }),
]);

const NATURAL_ACCENT_ASSETS = Object.freeze([
    Object.freeze({
        key: 'stone-marker-no-ground',
        path: `${ASSET_ROOT}/10-stone-marker-no-ground.glb`,
        targetHeight: 1.3,
    }),
    Object.freeze({
        key: 'wildflower-a-no-ground',
        path: `${ASSET_ROOT}/11-wildflower-a-no-ground.glb`,
        targetHeight: 0.95,
    }),
    Object.freeze({
        key: 'wildflower-b-no-ground',
        path: `${ASSET_ROOT}/12-wildflower-b-no-ground.glb`,
        targetHeight: 0.95,
    }),
    Object.freeze({
        key: 'log-pile-stump-review',
        path: `${PACK_ROOT}/glb/09-log-pile-stump.glb`,
        targetHeight: 1.05,
    }),
]);

const PACK_YARD_ASSETS = Object.freeze([
    ...HOMESTEAD_PROP_ASSETS,
    ...NO_GROUND_ASSETS,
]);

const SCENES = Object.freeze({
    field: Object.freeze({
        label: 'Home Field gate approach',
        mode: 'classic',
        assets: NO_GROUND_ASSETS,
        placements: Object.freeze([
            Object.freeze({ key: 'stone-marker-no-ground', x: -8.5, z: 102.5, rotationY: 0.25 }),
            Object.freeze({ key: 'wildflower-a-no-ground', x: -12, z: 101.8, rotationY: -0.45 }),
            Object.freeze({ key: 'wildflower-b-no-ground', x: -5, z: 101.6, rotationY: 0.55 }),
        ]),
        camera: Object.freeze({
            pos: { x: -24, z: 83, dy: 5.5 },
            target: { x: -8.5, z: 102, dy: 0.8 },
            fov: 32,
            sun: 0.78,
        }),
    }),
    'field-packyard': Object.freeze({
        routeScene: 'field',
        label: 'Home Field homestead pack yard review',
        mode: 'classic',
        assets: PACK_YARD_ASSETS,
        placements: Object.freeze([
            Object.freeze({ key: 'utility-shed-review', x: 164, z: 143, rotationY: -0.6 }),
            Object.freeze({ key: 'hay-bales-a-review', x: 173, z: 138, rotationY: 0.25 }),
            Object.freeze({ key: 'hay-bales-b-review', x: 178, z: 141, rotationY: -0.45 }),
            Object.freeze({ key: 'trough-bucket-review', x: 188, z: 147, rotationY: 0.15 }),
            Object.freeze({ key: 'crate-stack-review', x: 170, z: 151, rotationY: 0.45 }),
            Object.freeze({ key: 'barrel-rope-review', x: 177, z: 153, rotationY: -0.35 }),
            Object.freeze({ key: 'log-pile-stump-review', x: 188, z: 137, rotationY: 0.65 }),
            Object.freeze({ key: 'signpost-review', x: 156, z: 150, rotationY: Math.PI * 0.72 }),
            Object.freeze({ key: 'stone-marker-no-ground', x: 160, z: 135, rotationY: 0.25 }),
            Object.freeze({ key: 'wildflower-a-no-ground', x: 158, z: 132, rotationY: -0.45 }),
            Object.freeze({ key: 'wildflower-b-no-ground', x: 163, z: 132, rotationY: 0.5 }),
        ]),
        camera: Object.freeze({
            pos: { x: 142, z: 118, dy: 7 },
            target: { x: 174, z: 145, dy: 1.5 },
            fov: 39,
            sun: 0.78,
        }),
    }),
    newsheepdogland: Object.freeze({
        label: 'NSL homestead Kiln farmhouse review',
        mode: 'survival',
        assets: PLAYFIELD_ASSETS,
        hideExistingFarmhouse: true,
        placements: Object.freeze([
            Object.freeze({ key: 'farmhouse-a-review', x: 640, z: -956, rotationY: Math.PI }),
            Object.freeze({ key: 'stone-marker-no-ground', x: 601, z: -1002, rotationY: -0.2 }),
            Object.freeze({ key: 'wildflower-a-no-ground', x: 597, z: -1009, rotationY: 0.35 }),
            Object.freeze({ key: 'wildflower-b-no-ground', x: 597, z: -995, rotationY: -0.5 }),
        ]),
        camera: Object.freeze({
            pos: { x: 574, z: -1030, dy: 6 },
            target: { x: 626, z: -972, dy: 2.2 },
            fov: 36,
            sun: 0.35,
        }),
    }),
    'newsheepdogland-farmhouse-b': Object.freeze({
        routeScene: 'newsheepdogland',
        label: 'NSL farmhouse B reserve comparison',
        mode: 'survival',
        assets: Object.freeze([FARMHOUSE_B_ASSET]),
        hideExistingFarmhouse: true,
        placements: Object.freeze([
            Object.freeze({ key: 'farmhouse-b-review', x: 640, z: -956, rotationY: Math.PI }),
        ]),
        camera: Object.freeze({
            pos: { x: 574, z: -1030, dy: 6 },
            target: { x: 626, z: -972, dy: 2.2 },
            fov: 36,
            sun: 0.35,
        }),
    }),
    'newsheepdogland-packyard': Object.freeze({
        routeScene: 'newsheepdogland',
        label: 'NSL homestead pack yard review',
        mode: 'survival',
        assets: PACK_YARD_ASSETS,
        placements: Object.freeze([
            Object.freeze({ key: 'utility-shed-review', x: 618, z: -1005, rotationY: -0.7 }),
            Object.freeze({ key: 'hay-bales-a-review', x: 608, z: -1008, rotationY: 0.35 }),
            Object.freeze({ key: 'hay-bales-b-review', x: 612, z: -1012, rotationY: -0.3 }),
            Object.freeze({ key: 'trough-bucket-review', x: 623, z: -998, rotationY: 0.25 }),
            Object.freeze({ key: 'crate-stack-review', x: 608, z: -994, rotationY: 0.55 }),
            Object.freeze({ key: 'barrel-rope-review', x: 614, z: -992, rotationY: -0.4 }),
            Object.freeze({ key: 'log-pile-stump-review', x: 621, z: -991, rotationY: 0.65 }),
            Object.freeze({ key: 'signpost-review', x: 630, z: -1006, rotationY: Math.PI * 0.9 }),
            Object.freeze({ key: 'stone-marker-no-ground', x: 601, z: -1002, rotationY: -0.2 }),
            Object.freeze({ key: 'wildflower-a-no-ground', x: 597, z: -1009, rotationY: 0.35 }),
            Object.freeze({ key: 'wildflower-b-no-ground', x: 597, z: -995, rotationY: -0.5 }),
        ]),
        camera: Object.freeze({
            pos: { x: 584, z: -1032, dy: 6.6 },
            target: { x: 622, z: -991, dy: 1.8 },
            fov: 39,
            sun: 0.35,
        }),
    }),
    'rolling-hills-accents': Object.freeze({
        routeScene: 'rolling-hills',
        label: 'Rolling Hills natural accents review',
        mode: 'classic',
        assets: NATURAL_ACCENT_ASSETS,
        placements: Object.freeze([
            Object.freeze({ key: 'stone-marker-no-ground', x: 90, z: 47, rotationY: -0.15 }),
            Object.freeze({ key: 'wildflower-a-no-ground', x: 94, z: 44, rotationY: 0.45 }),
            Object.freeze({ key: 'wildflower-b-no-ground', x: 98, z: 48, rotationY: -0.35 }),
            Object.freeze({ key: 'log-pile-stump-review', x: 103, z: 45, rotationY: 0.7 }),
        ]),
        camera: Object.freeze({
            pos: { x: 75, z: 30, dy: 5.5 },
            target: { x: 96, z: 46, dy: 0.8 },
            fov: 30,
            sun: 0.72,
        }),
    }),
    'open-country-accents': Object.freeze({
        routeScene: 'open-country',
        label: 'Open Country natural accents review',
        mode: 'classic',
        assets: NATURAL_ACCENT_ASSETS,
        placements: Object.freeze([
            Object.freeze({ key: 'stone-marker-no-ground', x: -38, z: 48, rotationY: 0.35 }),
            Object.freeze({ key: 'wildflower-a-no-ground', x: -35, z: 45, rotationY: -0.4 }),
            Object.freeze({ key: 'wildflower-b-no-ground', x: -32, z: 51, rotationY: 0.2 }),
            Object.freeze({ key: 'log-pile-stump-review', x: -27, z: 47, rotationY: -0.8 }),
        ]),
        camera: Object.freeze({
            pos: { x: -54, z: 34, dy: 5.5 },
            target: { x: -34, z: 48, dy: 0.8 },
            fov: 30,
            sun: 0.76,
        }),
    }),
});

function selectedScenes() {
    const raw = String(args.scene ?? 'field,newsheepdogland,field-packyard,newsheepdogland-packyard,rolling-hills-accents,open-country-accents');
    return raw.split(',').map((id) => id.trim()).filter(Boolean).filter((id) => SCENES[id]);
}

function relativeArtifactPath(path) {
    return path.startsWith(ROOT) ? path.slice(ROOT.length + 1).replace(/\\/g, '/') : path;
}

function makeManifest(sceneId, scene) {
    return {
        name: `homestead-playfield-scene-review-${sceneId}`,
        scene: scene.routeScene ?? sceneId,
        reviewId: sceneId,
        label: scene.label,
        assets: scene.assets ?? NO_GROUND_ASSETS,
        placements: scene.placements,
        camera: scene.camera,
        hideExistingFarmhouse: scene.hideExistingFarmhouse === true,
    };
}

async function writeManifest(sceneId, scene) {
    const path = resolve(OUT_DIR, `${sceneId}-manifest.json`);
    await writeFile(path, JSON.stringify(makeManifest(sceneId, scene), null, 2));
    return path;
}

function makeUrl(sceneId, scene, manifestPath) {
    const url = new URL(BASE_URL);
    const routeScene = scene.routeScene ?? sceneId;
    url.searchParams.set('renderer', RENDERER);
    url.searchParams.set('scene', routeScene);
    url.searchParams.set('mode', scene.mode);
    url.searchParams.set('autostart', '1');
    url.searchParams.set('perfMode', '1');
    url.searchParams.set('probeRender', '1');
    url.searchParams.set('cinematic', '1');
    url.searchParams.set('assetReview', '1');
    url.searchParams.set('assetReviewManifest', `/${relativeArtifactPath(manifestPath)}`);
    url.searchParams.set('ui', 'off');
    return url.href;
}

async function waitForReview(page, scene) {
    await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 60000 });
    await page.evaluate(() => window.__sdsCinema.waitReady(90000));
    await page.evaluate(({ mode }) => {
        window.__sdsCinema.startSolo?.('jep', mode);
        window.__sdsCinema.pauseSimulation?.();
        window.__sdsCinema.hideUI?.();
    }, { mode: scene.mode });
    await page.waitForFunction(() => window.__sdsAssetReviewState?.ok === true || window.__sdsAssetReviewState?.ok === false, null, { timeout: 90000 });
}

async function poseCamera(page, scene) {
    await page.evaluate(({ camera }) => {
        const c = window.__sdsCinema;
        const point = (p) => ({
            x: p.x,
            y: Number.isFinite(p.dy) ? c.getTerrainY(p.x, p.z) + p.dy : p.y,
            z: p.z,
        });
        c.setSun?.(camera.sun);
        c.freeFlyActive = true;
        const cam = c.camera;
        if (cam && camera.fov) {
            cam.fov = camera.fov;
            cam.updateProjectionMatrix();
        }
        c.setCameraPose(point(camera.pos), point(camera.target));
        c.syncAtmosphereToCamera?.();
        c.renderFrame?.();
    }, { camera: scene.camera });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function captureScene(page, sceneId, scene) {
    await poseCamera(page, scene);
    const screenshotPath = resolve(OUT_DIR, `${sceneId}.png`);
    const buffer = await page.screenshot({ path: screenshotPath, fullPage: false });
    const state = await page.evaluate(() => ({
        rendererMode: window.__sdsRendererMode ?? null,
        review: window.__sdsAssetReviewState ?? null,
        rendererInfo: window.__sdsRenderer?.info
            ? {
                render: { ...window.__sdsRenderer.info.render },
                memory: { ...window.__sdsRenderer.info.memory },
            }
            : null,
    }));
    return {
        scene: sceneId,
        label: scene.label,
        screenshot: relativeArtifactPath(screenshotPath),
        bytes: buffer.length,
        state,
    };
}

async function writeContactSheet(results) {
    const thumbWidth = 520;
    const thumbHeight = 316;
    const labelHeight = 36;
    const gutter = 14;
    const width = gutter + results.length * thumbWidth + Math.max(0, results.length - 1) * gutter + gutter;
    const height = gutter + labelHeight + thumbHeight + gutter;
    const composites = [];
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const left = gutter + i * (thumbWidth + gutter);
        const labelSvg = `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#18212a"/>
            <text x="14" y="23" font-family="Arial, sans-serif" font-size="16" fill="#f1ead4">${result.label}</text>
        </svg>`;
        composites.push({
            input: Buffer.from(labelSvg),
            left,
            top: gutter,
        });
        composites.push({
            input: await sharp(resolve(ROOT, result.screenshot)).resize(thumbWidth, thumbHeight, { fit: 'cover' }).png().toBuffer(),
            left,
            top: gutter + labelHeight,
        });
    }
    const out = resolve(OUT_DIR, 'contact-sheet.png');
    await sharp({
        create: {
            width,
            height,
            channels: 4,
            background: '#0f1419',
        },
    }).composite(composites).png().toFile(out);
    return out;
}

async function run() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ channel: CHANNEL, headless: false, args: LAUNCH_ARGS });
    const results = [];
    try {
        for (const sceneId of selectedScenes()) {
            const scene = SCENES[sceneId];
            const manifestPath = await writeManifest(sceneId, scene);
            const context = await browser.newContext({ viewport: VIEWPORT });
            await context.addInitScript(() => {
                localStorage.setItem('sds:tutorialDone', '1');
            });
            const page = await context.newPage();
            try {
                const url = makeUrl(sceneId, scene, manifestPath);
                await page.goto(url, { waitUntil: 'load', timeout: 90000 });
                await waitForReview(page, scene);
                results.push({
                    ...await captureScene(page, sceneId, scene),
                    manifest: relativeArtifactPath(manifestPath),
                    url,
                });
            } finally {
                if (!KEEP_OPEN || sceneId !== selectedScenes().at(-1)) {
                    await context.close();
                }
            }
        }
    } finally {
        if (!KEEP_OPEN) await browser.close();
    }

    const contactSheet = await writeContactSheet(results);
    const summaryPath = resolve(OUT_DIR, 'summary.json');
    await writeFile(summaryPath, JSON.stringify({
        capturedAt: new Date().toISOString(),
        renderer: RENDERER,
        results,
        contactSheet: relativeArtifactPath(contactSheet),
    }, null, 2));
    console.log(JSON.stringify({
        ok: results.every((result) => result.state.review?.ok === true),
        scenes: results.map((result) => result.scene),
        contactSheet: relativeArtifactPath(contactSheet),
        summary: relativeArtifactPath(summaryPath),
        lastUrl: results.at(-1)?.url ?? null,
    }, null, 2));
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
