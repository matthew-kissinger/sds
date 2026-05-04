/**
 * Cycle 17 Phase 1 — mobile asset visibility probe.
 *
 * Drives Playwright across 3 scenes × 2 mobile viewports through Solo
 * Classic, then captures:
 *   - window.__sds.probe.trees (per-type bake outcome from TerrainBuilder)
 *   - window.__sdsRenderer.info.render.{triangles, calls} after max-zoom
 *   - canvas pixels post-zoom-out
 *
 * Output: tools/playtest/probe-mobile/<scene>-<viewport>.{json,png}
 *
 * Goal: prove or rule out the "cross-billboard impostor texture failed
 * to bake on mobile" hypothesis from cycle-17-research.md Q2 without
 * needing a real device in front of us.
 *
 * Usage:
 *   1. npm run dev  (in another terminal)
 *   2. node tools/mobile-probe.mjs
 *
 * Override base URL: node tools/mobile-probe.mjs http://localhost:3000
 */
import { chromium, devices } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const baseUrl = process.argv[2] || 'http://localhost:3000';

const outDir = resolve(ROOT, 'tools/playtest/probe-mobile');
mkdirSync(outDir, { recursive: true });

const SCENES = ['field', 'rolling-hills', 'open-country'];
const VIEWPORTS = [
    { name: 'iphone-se', width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { name: 'iphone-14', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];

const browser = await chromium.launch({ headless: true });

async function seedIdentity(ctx) {
    await ctx.addInitScript(() => {
        const identity = {
            persistentId: 'player_probe_' + Date.now(),
            displayName: 'MobileProbe',
            fullName: 'MobileProbe#0001',
            discriminator: '0001',
            nameType: 'custom',
            createdAt: Date.now(),
            isRegistered: false,
        };
        localStorage.setItem('playerIdentity', JSON.stringify(identity));
    });
}

async function startSoloClassic(page) {
    const soloPlay = page.getByRole('button', { name: /Solo Play/i });
    await soloPlay.waitFor({ state: 'visible', timeout: 30_000 });
    await soloPlay.dispatchEvent('click');

    const confirm = page.getByRole('button', { name: /Confirm Selection/i });
    await confirm.waitFor({ state: 'visible', timeout: 15_000 });
    await confirm.dispatchEvent('click');

    const classic = page.getByRole('button', { name: /Classic Mode/i });
    await classic.waitFor({ state: 'visible', timeout: 15_000 });
    await classic.dispatchEvent('click');
}

async function probeScene(scene, viewport) {
    const ctx = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await seedIdentity(ctx);
    const page = await ctx.newPage();
    const consoleLogs = [];
    page.on('console', m => {
        const text = m.text();
        if (text.includes('[PROBE]') || text.includes('[TERRAIN]') || text.includes('[PERF]')) {
            consoleLogs.push(`[${m.type()}] ${text}`);
        }
    });
    const errors = [];
    page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));

    // cinematic=1 flips preserveDrawingBuffer=true so canvas.toDataURL
    // returns the most recent draw instead of a blank framebuffer.
    const url = `${baseUrl}/?scene=${scene}&perfMode=1&probeRender=1&cinematic=1`;
    console.log(`[${viewport.name}] ${scene} → loading ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await startSoloClassic(page);

    // Wait for game ready (perfHarness signals when sheep + frames are up).
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 60_000 });

    // Max zoom out so trees > 80m from camera populate the LOD2 (impostor) tier.
    await page.evaluate(() => window.__sds?.maxZoom?.());
    await page.waitForTimeout(2500);

    const data = await page.evaluate(() => {
        const renderer = window.__sdsRenderer;
        const cc = window.__sds?.cameraController;
        return {
            probe: window.__sds?.probe ?? null,
            renderer: renderer ? {
                triangles: renderer.info.render.triangles,
                calls: renderer.info.render.calls,
                lines: renderer.info.render.lines,
                points: renderer.info.render.points,
                geometries: renderer.info.memory.geometries,
                textures: renderer.info.memory.textures,
            } : null,
            camera: cc ? {
                distance: cc.distance,
                minDistance: cc.minDistance,
                maxDistance: cc.maxDistance,
                isMobile: cc.isMobile,
            } : null,
            sceneInfo: (() => {
                const s = window.__sds?.sceneManager?.getScene?.();
                if (!s) return null;
                let meshCount = 0;
                let instancedMeshCount = 0;
                s.traverse(o => {
                    if (o.isInstancedMesh || o.constructor?.name === 'InstancedMesh2') instancedMeshCount++;
                    else if (o.isMesh) meshCount++;
                });
                return { meshCount, instancedMeshCount };
            })(),
        };
    });

    // Canvas dump
    const dataUrl = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        if (!c) return null;
        return c.toDataURL('image/png');
    });
    if (dataUrl?.startsWith('data:image/png;base64,')) {
        const buf = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
        writeFileSync(resolve(outDir, `${scene}-${viewport.name}.png`), buf);
    }

    writeFileSync(
        resolve(outDir, `${scene}-${viewport.name}.json`),
        JSON.stringify({ scene, viewport: viewport.name, data, errors, consoleLogs: consoleLogs.slice(0, 60) }, null, 2)
    );

    const tris = data.renderer?.triangles ?? 0;
    const treeBakes = data.probe?.trees?.byType ? Object.entries(data.probe.trees.byType)
        .map(([t, v]) => `${t}:${v.impostorBaked ? '✓' : '✗'}`).join(' ') : 'no-probe';
    console.log(`[${viewport.name}] ${scene} → ${tris.toLocaleString()} tris @ zoom=${data.camera?.distance}m, impostors:[${treeBakes}]`);

    await ctx.close();
    return { scene, viewport: viewport.name, tris, data };
}

const results = [];
for (const scene of SCENES) {
    for (const viewport of VIEWPORTS) {
        try {
            const r = await probeScene(scene, viewport);
            results.push(r);
        } catch (err) {
            console.error(`[${viewport.name}] ${scene} → FAILED: ${err.message}`);
            results.push({ scene, viewport: viewport.name, error: err.message });
        }
    }
}

writeFileSync(
    resolve(outDir, 'summary.json'),
    JSON.stringify(results.map(r => ({
        scene: r.scene,
        viewport: r.viewport,
        tris: r.tris,
        rendererAvailable: r.data?.probe?.trees?.rendererAtCreate,
        impostorByType: r.data?.probe?.trees?.byType,
        camera: r.data?.camera,
        sceneInfo: r.data?.sceneInfo,
        error: r.error,
    })), null, 2)
);

console.log('\nSummary:');
for (const r of results) {
    console.log(`  ${r.scene.padEnd(15)} ${r.viewport.padEnd(12)} ${(r.tris ?? 0).toString().padStart(10)} tris  ${r.error ?? ''}`);
}

await browser.close();
