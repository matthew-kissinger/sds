// SPDX-License-Identifier: AGPL-3.0-or-later
// One-off: diagnose why sheep don't appear in the herding clip. Boots
// classic mode on newsheepdogland, teleports the dog to the densest sheep
// cluster, steps the sim, and reports dog/sheep/instancedMesh state.

import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:4173/';
const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--hide-scrollbars'];

const url = new URL(BASE_URL);
url.searchParams.set('renderer', 'webgpu');
url.searchParams.set('scene', 'newsheepdogland');
url.searchParams.set('cinematic', '1');
url.searchParams.set('ui', 'off');

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForFunction(() => Boolean(window.__sdsCinema), null, { timeout: 90_000 });
await page.evaluate(() => window.__sdsCinema.waitReady?.(90_000));
await page.waitForTimeout(3000);

await page.evaluate(() => {
    const c = window.__sdsCinema;
    c.startSolo('jep', 'classic');
    c.hideUI();
});
await page.evaluate(() => window.__sdsCinema.waitForFlockSize(30, 60_000)).catch(() => {});
await page.waitForTimeout(2000);

const report = await page.evaluate(() => {
    const game = window.gameInstance;
    const c = window.__sdsCinema;
    const sys = game.gameState?.optimizedSheepSystem;
    const sheep = sys?.sheep ?? [];
    const dog = game.gameState?.getSheepdog?.();
    const inst = sys?.instancedMesh ?? sys?.mesh ?? null;
    const sample = sheep.slice(0, 5).map((s) => ({
        x: Math.round(s.position.x), z: Math.round(s.position.z),
        y: s.position.y === undefined ? null : Math.round(s.position.y * 10) / 10,
        retired: s.retired ?? null, active: s.active ?? null,
    }));
    let nearest = null;
    if (dog && sheep.length) {
        nearest = Math.min(...sheep.map((s) => Math.hypot(s.position.x - dog.position.x, s.position.z - dog.position.z)));
    }
    return {
        sheepCount: sheep.length,
        dogPos: dog ? { x: Math.round(dog.position.x), z: Math.round(dog.position.z) } : null,
        nearestSheepToDog: nearest === null ? null : Math.round(nearest),
        sample,
        instInfo: inst ? { visible: inst.visible, count: inst.count, type: inst.type, inScene: Boolean(inst.parent) } : 'no instancedMesh found',
        sysKeys: sys ? Object.keys(sys).filter((k) => /mesh|inst|visible/i.test(k)) : null,
        terrainYAtFirstSheep: sheep[0] ? c.getTerrainY(sheep[0].position.x, sheep[0].position.z) : null,
    };
});
console.log(JSON.stringify(report, null, 2));

// Pose the camera straight at the first sheep cluster and screenshot.
await page.evaluate(() => {
    const c = window.__sdsCinema;
    const game = window.gameInstance;
    const sheep = game.gameState?.optimizedSheepSystem?.sheep ?? [];
    if (!sheep.length) return;
    const s = sheep[0].position;
    const y = c.getTerrainY(s.x, s.z);
    c.pauseSimulation();
    c.freeFlyActive = true;
    c.setSun(0.72);
    c.setCameraPose({ x: s.x + 20, y: y + 10, z: s.z + 20 }, { x: s.x, y: y + 1, z: s.z });
    c.renderFrame();
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'tools/trailer/output/probe-sheep.png' });
await page.close();
await browser.close();
