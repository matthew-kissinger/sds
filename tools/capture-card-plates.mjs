// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Four cinema stills of a 25-sheep run. `low` is kept for the contact sheet
// and is not a card plate. The three that ship are baked by
// tools/bake-card-plates.mjs into app/public/cards. See assets/cards/README.md.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { installCapture } from './trailer/capture-browser.mjs';
import {
  SEED,
  launchBrowser,
  removeDir,
  scratchDir,
  startPreviewServer,
  stopServer,
} from './probe-lib.mjs';

const PORT = 5326;
const out = resolve(import.meta.dirname, '../captures/boards/plates');
mkdirSync(out, { recursive: true });

let server = null;
let browser = null;
let profile = null;

try {
  server = await startPreviewServer(PORT);
  profile = scratchDir('sds-card-plates');
  browser = await launchBrowser(profile);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 810 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(installCapture);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.route(`http://localhost:${PORT}/api/**`, (route) => route.abort('blockedbyclient'));
  await page.goto(`http://127.0.0.1:${PORT}/?seed=${SEED}&debug=webgl`, {
    waitUntil: 'load',
    timeout: 60_000,
  });
  await page.waitForSelector('.herd-app[data-ready="true"]', { timeout: 90_000 });
  await page.locator('.herd-button--primary').click();
  await page.waitForSelector('.herd-app[data-phase="playing"]', { timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => globalThis.__trailer.find());
  await page.evaluate(() => {
    const api = globalThis.__trailer;
    const state = api.sim.state;
    const flock = state.sheep;
    const densest = flock.reduce((best, sheep) => {
      const count = flock.filter((other) => Math.hypot(
        other.position.x - sheep.position.x,
        other.position.z - sheep.position.z,
      ) < 10).length;
      return count > best.count ? { count, point: sheep.position } : best;
    }, { count: 0, point: flock[0].position });
    const heading = Math.atan2(
      densest.point.z - state.dogs[0].position.z,
      densest.point.x - state.dogs[0].position.x,
    );
    const native = navigator.getGamepads.bind(navigator);
    const began = performance.now();
    let trackAngle = heading;
    api.stopSocialDrive = () => { navigator.getGamepads = native; };
    navigator.getGamepads = () => {
      const elapsed = (performance.now() - began) / 1000;
      const gx = densest.point.x;
      const gz = densest.point.z;
      const dog = state.dogs[0].position;
      const wanted = Math.atan2(gz - dog.z, gx - dog.x);
      const delta = Math.atan2(Math.sin(wanted - trackAngle), Math.cos(wanted - trackAngle));
      trackAngle += Math.max(-0.04, Math.min(0.04, delta));
      const close = Math.hypot(gx - dog.x, gz - dog.z) < 8;
      const angle = close ? trackAngle + 0.9 : trackAngle;
      return [{
        connected: true,
        mapping: 'standard',
        axes: [-Math.cos(angle), -Math.sin(angle)],
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: index === 7 && elapsed < 1.4,
          value: index === 7 && elapsed < 1.4 ? 1 : 0,
        })),
      }];
    };
  });
  await page.waitForTimeout(2_400);
  await page.evaluate(() => globalThis.__trailer.stopSocialDrive?.());
  await page.addStyleTag({
    content: '.herd-app > * { visibility: hidden } canvas { visibility: visible !important }',
  });

  const shots = await page.evaluate(() => {
    const api = globalThis.__trailer;
    const dog = api.sim.state.dogs[0].position;
    const sheep = api.sim.state.sheep;
    const cx = sheep.reduce((sum, s) => sum + s.position.x, 0) / sheep.length;
    const cz = sheep.reduce((sum, s) => sum + s.position.z, 0) / sheep.length;
    const hx = cx - dog.x;
    const hz = cz - dog.z;
    const len = Math.hypot(hx, hz) || 1;
    const fx = hx / len;
    const fz = hz / len;
    const sx = -fz;
    const sz = fx;
    const at = (x, y, z) => [x, y, z];
    return [
      {
        name: 'flank',
        from: at(dog.x + sx * 11 - fx * 2, 3.4, dog.z + sz * 11 - fz * 2),
        aim: at(cx - sx * 2, 1.3, cz - sz * 2),
        fov: 42,
      },
      {
        name: 'wide',
        from: at(dog.x - sx * 16 - fx * 6, 5.2, dog.z - sz * 16 - fz * 6),
        aim: at(cx, 1.6, cz),
        fov: 38,
      },
      {
        name: 'low',
        from: at(dog.x - fx * 6 + sx * 3.5, 1.7, dog.z - fz * 6 + sz * 3.5),
        aim: at(dog.x + fx * 8, 1.15, dog.z + fz * 8),
        fov: 46,
      },
      {
        name: 'across',
        from: at(dog.x + sx * 8 + fx * 10, 4.1, dog.z + sz * 8 + fz * 10),
        aim: at(dog.x - sx * 3, 1.2, dog.z - sz * 3),
        fov: 40,
      },
    ];
  });

  for (const shot of shots) {
    await page.evaluate((shot) => {
      globalThis.__trailer.cinema({
        from: shot.from,
        to: shot.from,
        aim: shot.aim,
        seconds: 0.01,
        fov: shot.fov,
        exclusive: false,
      });
    }, shot);
    await page.waitForTimeout(180);
    await page.screenshot({ path: join(out, `${shot.name}.png`), animations: 'disabled' });
  }
  if (errors.length > 0) console.error(errors.join('\n'));
  console.log(JSON.stringify(shots, null, 2));
  await page.close();
  await context.close();
} finally {
  if (browser) await browser.close().catch(() => {});
  stopServer(server);
  removeDir(profile);
}
