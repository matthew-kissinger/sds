// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 90 one-off: verify the shadow-follow wire + shadow rendering on NSL.
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'];
const context = await chromium.launchPersistentContext('', {
    channel: 'chrome', headless: false, args: GPU_ARGS,
    viewport: { width: 1280, height: 720 }, serviceWorkers: 'block',
});
const page = await context.newPage();
try {
    await page.goto('http://localhost:4173/?scene=newsheepdogland&mode=survival&autostart=1&cinematic=1&perfMode=1&ui=off', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
    await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 60_000 });
    const state = await page.evaluate(() => {
        const game = window.gameInstance;
        const cinema = window.__sdsCinema;
        cinema.pauseSimulation();
        game.atmosphere.dayNight.setRunning(false);
        cinema.setSun(0.5);
        const sun = game.atmosphere.sun;
        const dog = cinema.gameState?.getSheepdog?.();
        const renderer = game.sceneManager.getRenderer();
        // Find the renderable dog object for castShadow inspection.
        let dogMesh = null;
        game.sceneManager.getScene().traverse((o) => {
            if (!dogMesh && /dog|sheepdog/i.test(o.name ?? '')) dogMesh = o;
        });
        let treeCast = 0; let treeNoCast = 0;
        game.terrainBuilder.trees?.forEach((t) => { (t.castShadow ? treeCast++ : treeNoCast++); });
        return {
            wired: game._sunShadowFollowWired === true,
            followTargetSet: !!sun.shadowFollowTarget,
            lightCastShadow: sun.light.castShadow,
            lightInScene: !!sun.light.parent,
            shadowMapEnabled: renderer.shadowMap?.enabled ?? null,
            shadowMapType: renderer.shadowMap?.type ?? null,
            lightPos: { x: Math.round(sun.light.position.x), y: Math.round(sun.light.position.y), z: Math.round(sun.light.position.z) },
            targetPos: { x: Math.round(sun.light.target.position.x), z: Math.round(sun.light.target.position.z) },
            dogPos: dog ? { x: Math.round(dog.position.x), z: Math.round(dog.position.z) } : null,
            dogMesh: dogMesh ? { name: dogMesh.name, castShadow: dogMesh.castShadow } : null,
            terrainReceive: game.terrainBuilder.terrainMesh?.receiveShadow ?? null,
            treeCast, treeNoCast,
        };
    });
    console.log(JSON.stringify(state, null, 2));
    // Close camera shot beside a tree near the dog for shadow eyeballing.
    await page.evaluate(() => {
        const cinema = window.__sdsCinema;
        const dog = cinema.gameState?.getSheepdog?.();
        const trees = window.gameInstance.terrainBuilder?.treeInstances ?? [];
        const p = dog?.position ?? { x: 0, z: 0 };
        let best = null; let bestD = Infinity;
        for (const t of trees) {
            const d = (t.x - p.x) ** 2 + (t.z - p.z) ** 2;
            if (d < bestD) { bestD = d; best = t; }
        }
        const cx = best?.x ?? p.x; const cz = best?.z ?? p.z;
        const gy = cinema.getTerrainY?.(cx, cz) ?? 0;
        cinema.setCameraPose({ x: cx + 12, y: gy + 7, z: cz + 12 }, { x: cx, y: gy + 2, z: cz });
        cinema.syncAtmosphereToCamera();
    });
    await page.evaluate(() => new Promise((r) => { let n = 0; const s = () => (++n >= 10 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }));
    const dataUrl = await page.evaluate(() => document.querySelector('#canvas-container canvas').toDataURL('image/png'));
    await mkdir(resolve('cycle90-validation/visual-survey'), { recursive: true });
    await writeFile(resolve('cycle90-validation/visual-survey/shadow-check.png'), Buffer.from(dataUrl.slice(22), 'base64'));
    console.log('wrote cycle90-validation/visual-survey/shadow-check.png');
} finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
}
