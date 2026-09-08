// SPDX-License-Identifier: AGPL-3.0-or-later
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { installCapture } from './capture-browser.mjs';
const dir = resolve('captures/trailer/deliverables/stills'); mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const report = { release: await (await fetch('https://sheepdogsim.com/release.json')).json(), images: [] };
try {
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
  await context.route('**/api/**', route => route.fulfill({ status: 503, body: '{}' }));
  await context.addInitScript(installCapture);
  const page = await context.newPage();
  await page.goto('https://sheepdogsim.com/?seed=20260821');
  await page.locator('.herd-app[data-ready="true"]').waitFor({ timeout: 90000 });
  await page.locator('.herd-size').filter({ hasText: '200' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(2500);
  report.scene = await page.evaluate(() => __trailer.find());
  report.diagnostics = await page.evaluate(() => {
    const a = __trailer;
    const centroid = a.sim.state.sheep.reduce((v, s) => [v[0] + s.position.x / a.sim.state.sheep.length, v[1] + s.position.z / a.sim.state.sheep.length], [0, 0]);
    const meshes = [];
    a.store.getState().scene.traverse(o => { if (o.isInstancedMesh && o.count === 200) meshes.push({name:o.name, xyz:[...o.instanceMatrix.array.slice(12,15)]}); });
    return { centroid, firstSheep: a.sim.state.sheep[0].position, firstBuffer: [...a.sim.positions.slice(0,2)], meshes };
  });
  console.log(JSON.stringify(report.diagnostics));
  const shoot = async (name, config) => {
    await page.evaluate(config => __trailer.cinema(config), config);
    await page.waitForTimeout(1200);
    const style = await page.addStyleTag({ content: '.herd-app > *{visibility:hidden}canvas{visibility:visible!important}' });
    await page.screenshot({ path: join(dir, `${name}.png`) });
    await style.evaluate(node => node.remove());
    report.images.push({ name, config });
  };
  await shoot('01-the-flock', { from: [0, 22, -45], to: [0, 22, -45], aim: [0, 2, 0], centerOn: 'flock', seconds: 1, fov: 48 });
  const dog = report.scene.dog;
  await shoot('02-your-sheepdog', { from: [dog.x+6, 3.6, dog.z+8], to: [dog.x+6, 3.6, dog.z+8], aim: [dog.x+1, 2.2, dog.z], seconds: 1, fov: 40 });
  await shoot('03-a-quiet-field', { from: [0, 12, -34], to: [0, 12, -34], aim: [0, 2, 0], centerOn: 'flock', seconds: 1, fov: 55 });
  await page.evaluate(() => __trailer.cinema(null));
  await page.keyboard.press('KeyC'); await page.waitForTimeout(1800);
  await page.locator('canvas').click({ position: { x: 1900, y: 900 } });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(2200); await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(dir, '04-follow-gameplay.png') });
} finally {
  writeFileSync(join(dir, 'capture-receipt.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
