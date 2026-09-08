// SPDX-License-Identifier: AGPL-3.0-or-later
// Capture the actual DOM nameplates and customization UI via browser-tab video.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { installCapture } from './capture-browser.mjs';
const out = resolve('captures/trailer');
const onlyNames = process.argv.includes('--names-only');
const report = { release: await (await fetch('https://sheepdogsim.com/release.json')).json(), shots: [], names: [], errors: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--auto-select-tab-capture-source-by-title=SDS Film Capture', '--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, acceptDownloads: true });
  await context.route('**/api/**', route => route.fulfill({ status: 503, body: '{}' }));
  await context.addInitScript(installCapture);
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(String(e)));
  await page.goto('https://sheepdogsim.com/?seed=20260821');
  await page.locator('.herd-app[data-ready="true"]').waitFor({ timeout: 90000 });
  await page.evaluate(() => { document.title = 'SDS Film Capture'; });
  await page.locator('.herd-size').filter({ hasText: '200' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(1800);
  report.scene = await page.evaluate(() => __trailer.find());
  const take = async (name, action, tab = false) => {
    const download = page.waitForEvent('download', { timeout: 90000 });
    await page.evaluate(({ name, tab }) => __trailer.start(name, tab), { name, tab });
    console.log(`Recording ${name}`);
    await action();
    const timing = await page.evaluate(() => __trailer.stop());
    await (await download).saveAs(join(out, `${name}.webm`));
    await page.screenshot({ path: join(out, `${name}.png`) });
    report.shots.push({ name, tab, timing, settings: await page.evaluate(() => __trailer.captureSettings) });
  };
  if (!onlyNames) { await page.evaluate(() => {
    __trailer.cinema({ from: [30, 38, -38], to: [-18, 18, -29], aim: [0, 1.5, 0], centerOn: 'flock', seconds: 15, fov: 50 });
    __trailer.walkTo(-14, -32, .72);
  });
  await take('drone-200', async () => { await page.waitForTimeout(12000); });
  }
  await page.evaluate(() => {
    __trailer.stopWalk?.(); __trailer.cinema(null);
  });
  if (onlyNames) { await page.keyboard.down('KeyW'); await page.waitForTimeout(120); await page.keyboard.up('KeyW'); }
  await page.waitForTimeout(1200);
  const pick = async index => {
    const point = await page.evaluate(index => {
      const a = __trailer, camera = a.store.getState().camera;
      let mesh;
      a.store.getState().scene.traverse(o => { if (!mesh && o.isInstancedMesh && o.count === 200) mesh = o; });
      const points = a.sim.state.sheep.map((s, id) => {
        const y = mesh ? mesh.instanceMatrix.array[id * 16 + 13] + .65 : 1;
        const v = camera.position.clone().set(s.position.x, y, s.position.z).project(camera);
        return { id, x: (v.x + 1) * innerWidth / 2, y: (1 - v.y) * innerHeight / 2, depth: v.z };
      });
      const all = [...points];
      const visible = points.filter(p => p.x > 40 && p.x < 1880 && p.y > 100 && p.y < 980 && p.depth < 1);
      visible.sort((a,b) => Math.abs(a.x - 960) + Math.abs(a.y - 580) - Math.abs(b.x - 960) - Math.abs(b.y - 580));
      return { point: visible[index % visible.length], diagnostics: { aspect: camera.aspect, projection: camera.projectionMatrix.elements, size: a.store.getState().size, viewport: [innerWidth, innerHeight], camera: camera.position.toArray(), direction: camera.getWorldDirection(camera.position.clone()).toArray(), dog: a.sim.state.dogs[0].position, first: all.slice(0,5), sheep: a.sim.state.sheep.slice(0,3).map(s=>s.position) } };
    }, index);


    if (!point.point) throw new Error('No visible sheep to hover');
    await page.mouse.move(point.point.x, point.point.y, { steps: 12 });
    await page.waitForTimeout(120);
    const name = await page.locator('#herd-nameplate-title').innerText();
    if (!name) throw new Error(`No nameplate at ${JSON.stringify(point)}`);
    report.names.push(name); console.log(`Hovered ${name}`);
  };
  await pick(0);
  await take('sheep-names', async () => {
    for (let i = 0; i < 20; i++) { await pick(Math.floor(i / 12) * 4); await page.waitForTimeout(80); if (i === 16) await page.screenshot({ path: join(out, 'deliverables/stills/05-sheep-names.png') }); }
  }, true);
  const stills = join(out, 'deliverables', 'stills'); mkdirSync(stills, { recursive: true });

  if (!onlyNames) {
  await page.evaluate(() => __trailer.cinema(null));
  await page.reload(); await page.locator('.herd-app[data-ready="true"]').waitFor({ timeout: 90000 });
  await page.evaluate(() => { document.title = 'SDS Film Capture'; });
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page.locator('.herd-customize-dock').waitFor(); await page.waitForTimeout(2200);
  await take('customize-dog', async () => {
    await page.waitForTimeout(1800);
    await page.getByRole('radio', { name: /Blue Merle/ }).click(); await page.waitForTimeout(2200);
    await page.getByRole('radio', { name: /Golden Wheaten/ }).click(); await page.waitForTimeout(2200);
    await page.getByRole('radio', { name: /Classic Black/ }).click(); await page.waitForTimeout(1800);
  }, true);
  await page.screenshot({ path: join(stills, '06-customize-your-dog.png') });
  await page.getByRole('tab', { name: 'Flock Breeds', exact: true }).click(); await page.waitForTimeout(1600);
  await take('customize-flock', async () => {
    const choices = page.locator('[aria-label="Flock breed varieties"] button');
    console.log(await choices.allTextContents());
    await page.waitForTimeout(1500); await choices.nth(1).click(); await page.waitForTimeout(2300);
    await choices.nth(2).click(); await page.waitForTimeout(2300);
  }, true);
  await page.screenshot({ path: join(stills, '07-flock-customization.png') });
  }
} finally {
  writeFileSync(join(out, onlyNames ? 'names-report.json' : 'features-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
