// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 90 one-off: why doesn't setTimeOfDay(0.5) hold on NSL?
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
    const read = (label) => page.evaluate((l) => {
        const atm = window.gameInstance?.atmosphere;
        const dn = atm?.dayNight;
        return {
            label: l,
            t: dn?.getT?.() ?? null,
            running: dn?.isRunning?.() ?? null,
            elevationDeg: atm?.sun ? Math.round(atm.sun.getElevation() * 180 / Math.PI) : null,
            dayNightEnabled: atm?.dayNightEnabled ?? null,
        };
    }, label);
    console.log(JSON.stringify(await read('before')));
    await page.evaluate(() => {
        const cinema = window.__sdsCinema;
        cinema.pauseSimulation();
        window.gameInstance.atmosphere.dayNight.setRunning(false);
        cinema.setSun(0.5);
    });
    console.log(JSON.stringify(await read('after-set')));
    await page.waitForTimeout(1500);
    console.log(JSON.stringify(await read('after-1500ms')));
    const pose = await page.evaluate(() => {
        const cinema = window.__sdsCinema;
        const dog = cinema?.gameState?.getSheepdog?.();
        const p = dog?.position ?? { x: 0, y: 0, z: 0 };
        cinema.setCameraPose({ x: p.x + 6, y: p.y + 4, z: p.z + 6 }, { x: p.x, y: p.y, z: p.z });
        const cam = cinema.camera;
        return { set: { x: p.x + 6, y: p.y + 4, z: p.z + 6 }, immediate: { x: cam.position.x, y: cam.position.y, z: cam.position.z } };
    });
    await page.waitForTimeout(500);
    const poseAfter = await page.evaluate(() => {
        const cam = window.__sdsCinema.camera;
        return { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    });
    console.log(JSON.stringify({ pose, poseAfter }));
} finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
}
