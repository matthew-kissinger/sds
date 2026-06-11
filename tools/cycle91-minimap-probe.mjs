// Cycle 91: minimap visual probe. Loads NSL survival on the local preview,
// waits for first-interactive + minimap mount, and captures (a) a full-page
// screenshot, (b) the minimap element alone, (c) a JSON dump of the minimap's
// transform inputs vs live entity positions, so a symptom can be diagnosed
// offline. Probe hygiene: closes everything it opens; preview server is
// expected to already be running on 4173.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(ROOT, 'cycle91-validation/minimap-probe');
mkdirSync(OUT_DIR, { recursive: true });

const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
const URL = 'http://localhost:4173/?scene=newsheepdogland&mode=survival&autostart=1&perfMode=1';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120000 });
    // Let streaming + minimap markers settle.
    await page.waitForTimeout(8000);

    const state = await page.evaluate(() => {
        const el = document.getElementById('sds-minimap');
        const canvas = el?.querySelector?.('canvas') ?? (el?.tagName === 'CANVAS' ? el : null);
        const gi = window.gameInstance ?? window.__sds?.gameInstance ?? null;
        const dog = gi?.gameState?.getSheepdog?.() ?? null;
        const sheep = gi?.gameState?.sheep ?? [];
        const wolves = gi?._wolfPack?.wolves ?? [];
        const scene = gi?.currentScene ?? null;
        const sample = (arr, n) => arr.slice(0, n).map((s) => ({
            x: +(s.position?.x ?? s.x ?? NaN).toFixed?.(1), z: +(s.position?.z ?? s.z ?? NaN).toFixed?.(1),
        }));
        return {
            minimapMounted: !!el,
            minimapRect: el ? el.getBoundingClientRect().toJSON() : null,
            canvasSize: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.style.width, cssH: canvas.style.height } : null,
            dog: dog?.position ? { x: +dog.position.x.toFixed(1), z: +dog.position.z.toFixed(1) } : null,
            sheepCount: sheep.length,
            sheepSample: sample(sheep, 5),
            wolfCount: wolves.length,
            pen: scene?.pen ?? null,
            sceneId: scene?.id ?? null,
            dayT: gi?.atmosphere?.dayNight?.getT?.() ?? null,
        };
    });
    writeFileSync(resolve(OUT_DIR, 'minimap-state.json'), JSON.stringify(state, null, 2));
    await page.screenshot({ path: resolve(OUT_DIR, 'nsl-fullpage.png') });
    const el = await page.$('#sds-minimap');
    if (el) await el.screenshot({ path: resolve(OUT_DIR, 'minimap-element.png') });
    console.log(JSON.stringify(state, null, 2));
    console.log(`[MINIMAP-PROBE] wrote ${OUT_DIR}`);
} finally {
    await page.close();
    await browser.close();
}
