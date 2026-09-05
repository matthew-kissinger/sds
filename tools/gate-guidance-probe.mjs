// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, repo, scratchDir, removeDir, startPreviewServer, stopServer, SEED } from './probe-lib.mjs';
import { collectBuildReceipt, sameBuildReceipt } from './playtest-profile-receipt.mjs';

const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'gate-guidance';
if (!/^[a-z0-9_-]+$/i.test(label)) throw new Error('Invalid label');
const output = join(repo, 'captures', 'guidance', label);
if (existsSync(output)) throw new Error(`Capture already exists: ${output}. Use a fresh label to preserve evidence.`);
mkdirSync(output, { recursive: true });
const server = await startPreviewServer(5324);
const receipts = [];
let failure;
const build = collectBuildReceipt(repo);
try {
  for (const backend of ['webgpu', 'webgl2']) {
    const profile = scratchDir(`gate-${backend}`);
    let browser;
    try {
      browser = await launchBrowser(profile);
      const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      await context.route('**/api/**', route => route.fulfill({ status: 200,
        contentType: 'application/json', body: JSON.stringify({ token: 'local-review', authSecret: 'local-review',
          entries: [], playerProfile: { persistentId: 'local-review', displayName: 'Review', fullName: 'Review' } }) }));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(`http://localhost:5324/?seed=${SEED}${backend === 'webgl2' ? '&debug=webgl' : ''}`);
      await page.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true');
      assert.equal(await page.locator('.herd-app').getAttribute('data-backend'), backend);
      await page.locator('.herd-title-actions > .herd-button--primary').click();
      const cue = page.locator('.herd-gate-cue');
      await cue.waitFor({ state: 'visible' });
      await page.keyboard.press('KeyC');
      await page.waitForFunction(() => document.querySelector('.herd-gate-cue')?.getAttribute('data-onscreen') === 'true');
      assert.equal(await cue.getAttribute('data-onscreen'), 'true');
      await cue.waitFor({ state: 'hidden' });
      assert.equal(await cue.locator('.herd-gate-cue__mark').count(), 0);
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(output, `${backend}-visible.png`) });
      // Turn in world-axis Classic, then inspect Follow facing away. Holding
      // reverse in camera-relative Follow continually changes the input basis.
      await page.keyboard.press('KeyC');
      await page.keyboard.down('KeyS');
      await page.waitForTimeout(1600);
      await page.keyboard.up('KeyS');
      await page.keyboard.press('KeyC');
      await page.waitForFunction(() => document.querySelector('.herd-gate-cue')?.getAttribute('data-onscreen') === 'false');
      await page.waitForTimeout(800);
      assert.equal(await cue.getAttribute('data-onscreen'), 'false', 'Gate must stay offscreen after the camera settles');
      await cue.waitFor({ state: 'visible' });
      await page.screenshot({ path: join(output, `${backend}-behind.png`) });
      await page.locator('.herd-pause-button').click();
      await cue.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.waitForTimeout(1200);
      await page.waitForFunction(() => {
        const node = document.querySelector('.herd-gate-cue');
        return node && node.hidden === (node.dataset.onscreen === 'true' && node.dataset.obscured !== 'true');
      });
      const resumedProjection = await cue.evaluate(node => ({ onScreen: node.dataset.onscreen,
        obscured: node.dataset.obscured, hidden: node.hidden }));
      // The preceding route is Follow. Explicitly return to Classic through
      // its normal camera control before checking an offscreen destination.
      await page.keyboard.press('KeyC');
      for (const [width, height] of [[390, 844], [844, 390]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(1200);
        await page.waitForFunction(() => document.querySelector('.herd-gate-cue')?.dataset.onscreen === 'false');
        await cue.waitFor({ state: 'visible' });
        const box = await cue.boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height);
        const overlaps = await page.evaluate(() => {
          const badge = document.querySelector('.herd-gate-cue').getBoundingClientRect();
          return [...document.querySelectorAll('button, [role="slider"], .herd-progress, .herd-stamina, .herd-timer')]
            .filter(node => {
              const r = node.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && r.left < badge.right && r.right > badge.left
                && r.top < badge.bottom && r.bottom > badge.top;
            }).map(node => node.getAttribute('aria-label') || node.textContent || node.className);
        });
        assert.deepEqual(overlaps, [], `Gate cue overlaps controls at ${width}x${height}`);
        await page.screenshot({ path: join(output, `${backend}-${width}.png`) });
      }
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.waitForTimeout(800);
      // Normal world-axis Classic controls line up with the opening. Stop by
      // the player-facing distance, avoiding a hidden camera/position override.
      await page.keyboard.down('KeyA');
      await page.waitForTimeout(1400);
      await page.keyboard.up('KeyA');
      const gateDistance = async () => Number.parseInt(await cue.locator('.herd-gate-cue__distance').textContent(), 10);
      await page.keyboard.down('KeyW');
      try {
        for (let step = 0; step < 60 && await gateDistance() > 28; step++) await page.waitForTimeout(500);
      } finally { await page.keyboard.up('KeyW'); }
      const closeDistance = await gateDistance();
      assert.ok(Number.isFinite(closeDistance) && closeDistance <= 28, `Normal gate approach stopped at ${closeDistance}m`);
      await page.keyboard.press('KeyC');
      await page.waitForTimeout(1200);
      await page.waitForFunction(() => {
        const node = document.querySelector('.herd-gate-cue');
        return node?.dataset.onscreen === 'true' && node.dataset.obscured === 'false' && node.hidden;
      });
      await page.screenshot({ path: join(output, `${backend}-opening-close.png`) });
      assert.deepEqual(errors, []);
      receipts.push({ backend, visibleGateBadgeHidden: true, fenceIconRemoved: true, behind: true,
        pauseResume: true, resumedProjection, viewportBounds: true, controlClearance: true, closeDistance, errors,
        note: 'World opening highlight requires screenshot review. Viewport resize verifies layout, not touch hardware or performance.' });
      await context.close();
    } finally {
      await browser?.close();
      removeDir(profile);
    }
  }
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  stopServer(server);
  const stable = sameBuildReceipt(build, collectBuildReceipt(repo));
  writeFileSync(join(output, 'report.json'), JSON.stringify({ build, stable, receipts, failure }, null, 2));
  if (!stable) process.exitCode = 1;
}
console.log(JSON.stringify(receipts));
