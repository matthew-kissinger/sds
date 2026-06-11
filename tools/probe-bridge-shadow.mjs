// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 90 one-off: bridge-light shadow pipeline check with a synthetic caster.
import { writeFile } from 'node:fs/promises';
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
    await page.waitForTimeout(2000); // let _tickDayLoop recenter the frustum
    const state = await page.evaluate(async () => {
        const game = window.gameInstance;
        const sm = game.sceneManager;
        const light = sm.webgpuSunLight ?? null;
        const renderer = sm.getRenderer();
        const dog = window.__sdsCinema.gameState?.getSheepdog?.();
        let casters = 0;
        const casterNames = [];
        sm.getScene().traverse((o) => {
            if (o.castShadow && (o.isMesh || o.isInstancedMesh)) {
                casters++;
                if (casterNames.length < 12) casterNames.push(o.name || o.userData?.webgpuNativeInstancing || o.type);
            }
        });
        return {
            casterNames,
            hasBridgeLight: !!light,
            castShadow: light?.castShadow ?? null,
            lightPos: light ? { x: Math.round(light.position.x), y: Math.round(light.position.y), z: Math.round(light.position.z) } : null,
            lightTarget: light ? { x: Math.round(light.target.position.x), z: Math.round(light.target.position.z) } : null,
            targetInScene: !!light?.target?.parent,
            dogPos: { x: Math.round(dog.position.x), z: Math.round(dog.position.z) },
            shadowMapEnabled: renderer.shadowMap?.enabled ?? null,
            sceneCasters: casters,
            shadowCam: light ? {
                left: light.shadow.camera.left, right: light.shadow.camera.right,
                near: light.shadow.camera.near, far: light.shadow.camera.far,
                mapSize: light.shadow.mapSize.x,
            } : null,
        };
    });
    console.log(JSON.stringify(state, null, 2));
    await page.evaluate(() => {
        const cinema = window.__sdsCinema;
        cinema.pauseSimulation();
        window.gameInstance.atmosphere.dayNight.setRunning(false);
        cinema.setSun(0.5);
        const dog = cinema.gameState.getSheepdog();
        const p = dog.position;
        const gy = cinema.getTerrainY?.(p.x, p.z) ?? 0;
        cinema.setCameraPose({ x: p.x + 14, y: gy + 9, z: p.z + 14 }, { x: p.x, y: gy + 2, z: p.z });
        cinema.syncAtmosphereToCamera();
    });
    await page.evaluate(() => new Promise((r) => { let n = 0; const s = () => (++n >= 15 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }));
    const dataUrl = await page.evaluate(() => document.querySelector('#canvas-container canvas').toDataURL('image/png'));
    await writeFile(resolve('cycle90-validation/visual-survey/bridge-shadow-check.png'), Buffer.from(dataUrl.slice(22), 'base64'));
    console.log('wrote cycle90-validation/visual-survey/bridge-shadow-check.png');
} finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
}
