// One-off: what does the OC portal look like with the objective forced to
// 'drive'? Screenshots a few candidate camera poses.
import { chromium } from 'playwright';

const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--hide-scrollbars'];
const OUT = 'C:/Users/Mattm/X/games-3d/sds/tools/trailer/output';

const url = new URL('http://127.0.0.1:4173/');
url.searchParams.set('scene', 'open-country');
url.searchParams.set('cinematic', '1');
url.searchParams.set('ui', 'off');

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForFunction(() => Boolean(window.__sdsCinema), null, { timeout: 90_000 });
await page.evaluate(() => window.__sdsCinema.waitReady?.(90_000));
await page.waitForTimeout(3000);

await page.evaluate(() => {
    const c = window.__sdsCinema;
    c.startSolo('george_washington', 'hard');
    c.hideUI();
});
await page.evaluate(() => window.__sdsCinema.waitForFlockSize(100, 60_000)).catch(() => {});
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
    const game = window.gameInstance;
    const c = window.__sdsCinema;
    const obj = game.gameState?.objective;
    if (obj) { obj.stage = 'drive'; obj.holdTimer = obj.holdRequired ?? 0; }
    game._portalEffect?.setIntensity?.(1);
    window.dispatchEvent(new CustomEvent('objective-stage-changed', { detail: { stage: 'drive' } }));
    c.pauseSimulation();
    c.freeFlyActive = true;
    c.setSun(0.66);
    const groundAtPortal = c.getTerrainY(0, 295);
    return {
        objective: obj ? { stage: obj.stage, required: obj.requiredSheep } : null,
        portal: game._portalEffect ? Object.keys(game._portalEffect).slice(0, 20) : null,
        portalIntensity: game._portalEffect?.intensity ?? null,
        groundAtPortal,
        groundAt250: c.getTerrainY(0, 250),
        groundAt220: c.getTerrainY(18, 250),
    };
});
console.log(JSON.stringify(report, null, 2));

const poses = [
    { name: 'a-south-high', pos: { x: 18, y: 16, z: 248 }, target: { x: 0, y: 5, z: 296 } },
    { name: 'b-east-low', pos: { x: 34, y: 10, z: 278 }, target: { x: -4, y: 6, z: 296 } },
    { name: 'c-overhead', pos: { x: 0, y: 42, z: 250 }, target: { x: 0, y: 2, z: 295 } },
    { name: 'd-inland-wide', pos: { x: -26, y: 13, z: 240 }, target: { x: 4, y: 6, z: 296 } },
];
// Advance wall-clock a touch so the portal shader animates into a visible state.
for (const p of poses) {
    await page.evaluate(({ p }) => {
        const c = window.__sdsCinema;
        window.gameInstance.update(1 / 30);
        c.setCameraPose(p.pos, p.target);
        c.renderFrame();
    }, { p });
    await page.waitForTimeout(300);
    await page.evaluate(({ p }) => {
        const c = window.__sdsCinema;
        window.gameInstance.update(1 / 30);
        c.setCameraPose(p.pos, p.target);
        c.renderFrame();
    }, { p });
    await page.screenshot({ path: `${OUT}/probe-portal-${p.name}.png` });
}
await page.close();
await browser.close();
console.log('done');
