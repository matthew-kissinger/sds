// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 81 Phase 4 - clean flagship hero capture. Loads newsheepdogland on WebGPU
// desktop (the lifted pin) with the UI hidden (cinematic mode), lets the scene settle,
// and captures the Hosek-Wilkie sky + water that were dark on the WebGL fallback.
// Needs the dev server: SDS_SUPPRESS_BROWSER_OPEN=1 npx vite --port 3000
// Usage: node tools/webgpu-flagship-hero-cycle81.mjs

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'cycle81-validation');
const PROFILE = resolve(tmpdir(), 'sds-c81-hero');
const GPU_ARGS = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']
    : [];
const BASE = 'http://localhost:3000/?renderer=webgpu&cinematic=1&scene=newsheepdogland';

async function run() {
    await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
    const ctx = await chromium.launchPersistentContext(PROFILE, {
        channel: 'chrome',
        args: GPU_ARGS,
        viewport: { width: 1920, height: 1080 },
        hasTouch: false,
        isMobile: false,
    });
    const page = await ctx.newPage();
    await page.bringToFront().catch(() => {});
    const result = { startedAt: new Date().toISOString() };
    try {
        await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForFunction(() => !!window.gameInstance, null, { timeout: 60_000 });
        await page.waitForFunction(() => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true, null, { timeout: 60_000 }).catch(() => {});
        // Ensure we are on the flagship (cinematic may boot a default scene).
        const onScene = await page.evaluate(() => window.gameInstance?.currentScene?.id ?? null);
        if (onScene !== 'newsheepdogland') {
            await page.evaluate(() => window.gameInstance.swapScene('newsheepdogland').catch(() => {}));
            await page.waitForFunction(() => window.gameInstance?.currentScene?.id === 'newsheepdogland', null, { timeout: 200_000 }).catch(() => {});
            await page.waitForFunction(() => window.gameInstance?.sceneManager?.getRenderStatus?.()?.rendererReady === true, null, { timeout: 60_000 }).catch(() => {});
        }
        await page.waitForTimeout(6000); // let the scene settle + camera frame
        result.effective = await page.evaluate(() => window.__sdsRendererMode?.effective ?? null);
        result.scene = await page.evaluate(() => window.gameInstance?.currentScene?.id ?? null);
        result.atmosphere = await page.evaluate(() => {
            const f = window.gameInstance?.atmosphere?.getFrame?.({ sunBillboard: window.gameInstance?._sunBillboard }) ?? null;
            return f ? { preset: f.presetName ?? null, skyMode: f.sky?.materialMode ?? null, sun: f.sunBillboard ?? null } : null;
        });
        result.meshes = await page.evaluate(() => {
            const scene = window.gameInstance?.sceneManager?.getScene?.();
            let inst = 0, indirect = 0;
            scene?.traverse((o) => { if (o?.isInstancedMesh) { inst++; if (o.geometry?.indirect) indirect++; } });
            return { inst, indirect };
        });
        const client = await page.context().newCDPSession(page);
        // Capture WITH the menu overlay (proof the lift loaded), then hide the React
        // UI (keeping the canvas + its ancestors visible) for the clean hero.
        const withUi = await client.send('Page.captureScreenshot', { format: 'png' });
        await mkdir(OUT_DIR, { recursive: true });
        await writeFile(resolve(OUT_DIR, 'flagship-hero-withui.png'), Buffer.from(withUi.data, 'base64'));
        await page.evaluate(() => {
            const keep = new Set();
            for (const c of Array.from(document.querySelectorAll('canvas'))) { let n = c; while (n) { keep.add(n); n = n.parentElement; } }
            for (const el of Array.from(document.body.children)) { if (!keep.has(el)) el.style.visibility = 'hidden'; }
        });
        await page.waitForTimeout(400);
        const clean = await client.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(resolve(OUT_DIR, 'flagship-hero.png'), Buffer.from(clean.data, 'base64'));
        result.screenshot = 'flagship-hero.png';
    } catch (err) {
        result.fatal = String(err?.stack || err?.message || err);
    } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
        result.endedAt = new Date().toISOString();
    }
    console.log(JSON.stringify(result, null, 2));
}
run().catch((e) => { console.error('[C81-HERO] fatal', e); process.exit(1); });
