// SPDX-License-Identifier: AGPL-3.0-or-later
// Real-time film takes from the live release. Camera-only staging is labelled.
import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { installCapture } from './capture-browser.mjs';
const mode = process.argv[2] ?? 'herding';
const out = resolve('captures/trailer');
mkdirSync(out, { recursive: true });
const release = await (await fetch('https://sheepdogsim.com/release.json')).json();
const report = { release, mode, shots: [], errors: [], samples: [], completion: false };
const driver = buildSync({ entryPoints: ['tests/helpers/herding-driver.ts'], bundle: true, write: false, format: 'iife', globalName: 'herdingDriver' }).outputFiles[0].text;
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, acceptDownloads: true });
  await context.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Capture session: scores disabled"}' }));
  await context.addInitScript(installCapture);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  await page.goto('https://sheepdogsim.com/?seed=20260821');
  await page.locator('.herd-app[data-ready="true"]').waitFor({ timeout: 90000 });
  if (mode !== 'herding' && mode !== 'smooth' && mode !== 'action') await page.locator('.herd-size').filter({ hasText: '200' }).click();
  await page.screenshot({ path: join(out, `${mode}-title.png`) });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(5000);
  report.scene = await page.evaluate(() => __trailer.find());
  console.log(JSON.stringify(report.scene));
  await page.locator('canvas').click({ position: { x: 1700, y: 800 } });
  const take = async (name, seconds, action) => {
    const download = page.waitForEvent('download', { timeout: (seconds + 100) * 1000 });
    await page.evaluate(name => __trailer.start(name), name);
    if (action) await action(); else await page.waitForTimeout(seconds * 1000);
    const timing = await page.evaluate(() => __trailer.stop());
    await (await download).saveAs(join(out, `${name}.webm`));
    report.shots.push({ name, timing });
    await page.screenshot({ path: join(out, `${name}.png`) });
    const cleanStyle = await page.addStyleTag({ content: '.herd-app > :not(.herd-scene){visibility:hidden} canvas{visibility:visible!important}' });
    await page.screenshot({ path: join(out, `${name}-clean.png`) });
    await cleanStyle.evaluate(node => node.remove());
    console.log(`Saved ${name}`);
  };
  if (mode === 'herding' || mode === 'smooth') {
    await page.addScriptTag({ content: driver });
    if (mode === 'smooth') {
      const smooth = buildSync({ entryPoints: ['tools/trailer/player.mjs'], bundle:true,write:false,format:'iife',globalName:'filmPlayer' }).outputFiles[0].text;
      await page.addScriptTag({content:smooth});
      await page.evaluate(() => __trailer.playSmooth());
    } else await page.evaluate(() => __trailer.drive(false));
    const began = Date.now();
    await take(mode === 'smooth' ? 'herding-smooth' : 'herding-real-time', 600, async () => {
      let previous = -1;
      while (Date.now() - began < 600000) {
        const sample = await page.evaluate(() => ({ tick: __trailer.sim.state.tick, penned: __trailer.sim.state.pennedCount,
          completed: __trailer.sim.state.completed, dog: { ...__trailer.sim.state.dogs[0].position } }));
        sample.seconds = (Date.now() - began) / 1000;
        report.samples.push(sample);
        if (sample.penned !== previous) { console.log(JSON.stringify(sample)); previous = sample.penned; }
        writeFileSync(join(out, 'herding-progress.json'), JSON.stringify(report.samples));
        if (sample.completed) { report.completion = true; await page.waitForTimeout(5000); break; }
        await page.waitForTimeout(2000);
      }
    });
    await page.evaluate(() => __trailer.stopDrive());
  } else if (mode === 'herd200') {
    const stills = join(out, 'deliverables', 'stills'); mkdirSync(stills, { recursive: true });
    const still = async name => {
      await page.setViewportSize({ width: 2560, height: 1440 }); await page.waitForTimeout(650);
      const style = await page.addStyleTag({ content: '.herd-app > *{visibility:hidden}canvas{visibility:visible!important}' });
      await page.screenshot({ path: join(stills, `${name}.png`) });
      await style.evaluate(node => node.remove());
      await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(650);
    };
    await page.evaluate(() => __trailer.cinema({ from: [0, 13, -30], to: [2, 12.5, -29], aim: [0, 1, 0], centerOn: 'flock', seconds: 16, fov: 55 }));
    await take('200-flock-close', 8);
    await still('01-200-sheep');
    await page.evaluate(() => __trailer.walkTo(-15, -39)); await page.waitForTimeout(2600);
    await page.evaluate(() => __trailer.cinema({ from: [0, 17, -36], to: [0, 16, -34], aim: [0, 1, -5], centerOn: 'flock', seconds: 20, fov: 55 }));
    await still('02-dog-and-200');
    await take('200-working-flock', 14, async () => {
      await page.evaluate(() => __trailer.walkTo(-15, -22, .65));
      await page.waitForTimeout(1800); await page.keyboard.press('Space');
      await page.waitForTimeout(1800); await page.evaluate(() => __trailer.walkTo(-36, -18, .7));
      await page.waitForTimeout(3200); await page.keyboard.press('Space');
      await page.waitForTimeout(1200); await page.evaluate(() => __trailer.walkTo(-26, 8, .68));
      await page.waitForTimeout(6000);
    });
    await page.evaluate(() => __trailer.stopWalk());
    await still('03-200-in-motion');
    await page.evaluate(() => __trailer.cinema({ from: [8, 25, -38], to: [8, 25, -38], aim: [0, 1, 0], centerOn: 'flock', seconds: 1, fov: 52 }));
    await still('04-200-overview');
  } else if (mode === 'action') {
    await page.keyboard.press('KeyC'); await page.waitForTimeout(2200);
    await page.keyboard.down('KeyW'); await page.waitForTimeout(1400); await page.keyboard.up('KeyW');
    await take('close-herding', 10, async () => {
      await page.keyboard.down('KeyW'); await page.waitForTimeout(1000);
      await page.keyboard.press('Space'); await page.keyboard.up('KeyW');
      await page.keyboard.down('KeyA'); await page.waitForTimeout(650); await page.keyboard.up('KeyA');
      await page.keyboard.down('KeyW'); await page.waitForTimeout(1300); await page.keyboard.up('KeyW');
      await page.keyboard.press('Space'); await page.waitForTimeout(7050);
    });
  } else if (mode === 'flock') {
    await page.evaluate(() => __trailer.cinema({ from: [0, 22, -45], to: [3, 21, -43], aim: [0, 2, 0], centerOn: 'flock', seconds: 14, fov: 48 }));
    await page.waitForTimeout(1000);
    await take('pasture-glide', 10);
  } else {
    await take('flock-wide', 8);
    const dog = report.scene.dog;
    await page.evaluate(config => __trailer.cinema(config), { from: [dog.x + 10, 5, dog.z + 12], to: [dog.x + 8, 4, dog.z + 10], aim: [dog.x, 2.4, dog.z], seconds: 14, fov: 42 });
    await page.waitForTimeout(1000);
    await take('dog-portrait', 10);
    await page.evaluate(() => __trailer.cinema({ from: [30, 35, -70], to: [16, 29, -59], aim: [-15, 1, -20], seconds: 14, fov: 48 }));
    await page.waitForTimeout(1000);
    await take('pasture-glide', 10);
    await page.evaluate(() => __trailer.cinema(null));
    await page.keyboard.press('KeyC');
    await page.waitForTimeout(3000);
    await take('follow-flock', 12, async () => {
      await page.keyboard.down('KeyW'); await page.waitForTimeout(2500);
      await page.keyboard.press('Space'); await page.waitForTimeout(1800);
      await page.keyboard.up('KeyW'); await page.waitForTimeout(7700);
    });
  }
  report.releaseAfter = await (await fetch('https://sheepdogsim.com/release.json')).json();
  if (report.releaseAfter.commit !== release.commit) throw new Error('Release changed during filming');
} finally {
  writeFileSync(join(out, `${mode}-report.json`), JSON.stringify(report, null, 2));
  await browser.close();
}
