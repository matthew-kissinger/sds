// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 82 - Newsheepdogland entrance hero candidates.
// Needs a production preview by default:
//   SDS_SUPPRESS_BROWSER_OPEN=1 npx vite preview --host 127.0.0.1 --port 4173

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT_DIR = resolve(ROOT, 'cycle82-validation', 'entrance-hero');
const BASE_URL = argValue('--base-url') ?? 'http://127.0.0.1:4173/';
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--hide-scrollbars']
    : ['--no-sandbox', '--hide-scrollbars'];

const POSES = [
    {
        name: 'hero-homestead',
        sun: 0.12,
        dog: { x: 604, z: -1008, velocity: { x: 1.4, z: 1.6 } },
        camera: { pos: { x: 560, y: 14, z: -1075 }, target: { x: 636, y: 7, z: -970 } },
    },
    {
        name: 'hero-gate-close',
        sun: 0.14,
        dog: { x: 606, z: -1010, velocity: { x: 1, z: 0.5 } },
        camera: { pos: { x: 585, y: 7, z: -1038 }, target: { x: 616, y: 4, z: -988 } },
    },
    {
        name: 'hero-flock-field',
        sun: 0.10,
        dog: { x: 585, z: -1000, velocity: { x: -1, z: -0.2 } },
        camera: { pos: { x: 640, y: 22, z: -1068 }, target: { x: 260, y: 8, z: -1088 } },
    },
    {
        name: 'hero-boot-island',
        sun: 0.13,
        dog: { x: 600, z: -1004, velocity: { x: -2, z: 0 } },
        camera: { pos: { x: 430, y: 28, z: -1165 }, target: { x: 640, y: 14, z: -985 } },
    },
];

function argValue(name) {
    const prefix = `${name}=`;
    const hit = process.argv.find((arg) => arg.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : null;
}

function buildUrl() {
    const url = new URL(BASE_URL);
    url.searchParams.set('renderer', 'webgpu');
    url.searchParams.set('scene', 'newsheepdogland');
    url.searchParams.set('cinematic', '1');
    url.searchParams.set('probeRender', '1');
    url.searchParams.set('ui', 'off');
    return url.toString();
}

async function settlePose(page, pose) {
    for (let i = 0; i < 8; i++) {
        await page.evaluate((p) => {
            const cinema = window.__sdsCinema;
            if (!cinema) return;
            cinema.hideUI?.();
            cinema.pauseSimulation?.();
            cinema.freeFlyActive = true;
            cinema.setSun?.(p.sun);
            cinema.poseDog?.(p.dog.x, p.dog.z, p.dog.velocity, 1 / 60);
            cinema.setCameraPose?.(p.camera.pos, p.camera.target);
            cinema.renderFrame?.();
        }, pose);
        await page.waitForTimeout(120);
    }
}

async function hideNonCanvasUi(page) {
    await page.evaluate(() => {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        const mainCanvas = canvases
            .map((canvas) => ({ canvas, area: canvas.clientWidth * canvas.clientHeight }))
            .sort((a, b) => b.area - a.area)[0]?.canvas ?? null;
        const keep = new Set();
        if (mainCanvas) {
            let node = mainCanvas;
            while (node) {
                keep.add(node);
                node = node.parentElement;
            }
        }
        for (const el of Array.from(document.querySelectorAll('body *'))) {
            if (!keep.has(el)) {
                el.style.visibility = 'hidden';
                el.style.pointerEvents = 'none';
            }
        }
    });
}

async function run() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({
        channel: 'chrome',
        headless: false,
        args: GPU_ARGS,
    });
    const summary = {
        url: buildUrl(),
        startedAt: new Date().toISOString(),
        poses: [],
    };
    let page;
    try {
        page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        const consoleErrors = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', (err) => consoleErrors.push(err.message));
        await page.goto(summary.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForFunction(() => Boolean(window.__sdsCinema), null, { timeout: 90_000 });
        await page.evaluate(() => window.__sdsCinema.waitReady?.(90_000));
        await page.waitForFunction(
            () => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true,
            null,
            { timeout: 120_000 },
        ).catch(() => {});
        await page.waitForTimeout(4_000);
        summary.preflight = await page.evaluate(() => ({
            scene: window.gameInstance?.currentScene?.id ?? null,
            effective: window.__sdsRendererMode?.effective ?? null,
            status: window.gameInstance?.sceneManager?.getRenderStatus?.() ?? null,
            hasDog: Boolean(window.__sdsCinema?.gameState?.getSheepdog?.()),
            sheepCount: window.__sdsCinema?.gameState?.optimizedSheepSystem?.count ?? null,
        }));
        await hideNonCanvasUi(page);

        for (const pose of POSES) {
            await settlePose(page, pose);
            const path = resolve(OUT_DIR, `${pose.name}.png`);
            await page.screenshot({ path, type: 'png', fullPage: false });
            summary.poses.push({ name: pose.name, path });
        }
        summary.consoleErrors = consoleErrors;
    } finally {
        if (page) await page.close().catch(() => {});
        await browser.close().catch(() => {});
        summary.endedAt = new Date().toISOString();
        await writeFile(resolve(OUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    }
    console.log(JSON.stringify(summary, null, 2));
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
