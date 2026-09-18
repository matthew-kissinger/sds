// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The gate cue, per backend. Seven cases, and which camera each one needs:
 *
 *   1 Classic, 160 m out   the cue is shown, and reports the gate off screen.
 *   2 Follow, gate in frame the badge is suppressed outright, and the old fence
 *                           icon is gone.
 *   3 Classic, two phone viewports  the badge stays inside the frame and clear
 *                           of the controls.
 *   4 Classic, approach     the gate can be reached to 28 m on ordinary keys,
 *                           and at that range it is in frame and the badge is
 *                           suppressed. This is the premise case 6 inverts.
 *   5 Follow, close         same suppression from the low rig, unobscured.
 *   6 Classic, driving away THE OFF-SCREEN CASE. The gate leaves the frame and
 *                           must not return while the rig settles.
 *   7 Classic, pause/resume pausing hides the cue; resuming restores a
 *                           projection consistent with what it shows.
 *
 * CASE 6 USED TO RUN UNDER FOLLOW, AND CANNOT ANY MORE. It entered Follow, held
 * the back key for 1.6 s and asserted the gate stayed off screen once the
 * camera settled. Under the approach-hold rule in `followFraming.ts` a dog
 * turning back through the camera produces no camera rotation at all until it
 * has committed 20 m to the reversal, so that manoeuvre no longer turns the rig
 * and no longer takes the gate out of frame. The premise is gone, not the
 * behaviour: Classic is world-locked and never rotates, so driving away from
 * the gate there still takes it out of frame, and the rig's glide forward on
 * key release is still a real chance to bring it back. The case runs there.
 */
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
      const gateDistance = async () => Number.parseInt(await cue.locator('.herd-gate-cue__distance').textContent(), 10);
      // CASE 1. Classic at the spawn, 160 m from the gate.
      await cue.waitFor({ state: 'visible' });
      assert.equal(await cue.getAttribute('data-onscreen'), 'false');
      // CASE 2. Follow looks up the field, so the gate is in frame and the
      // badge gives way to the world opening itself.
      await page.keyboard.press('KeyC');
      await page.waitForFunction(() => document.querySelector('.herd-gate-cue')?.getAttribute('data-onscreen') === 'true');
      assert.equal(await cue.getAttribute('data-onscreen'), 'true');
      await cue.waitFor({ state: 'hidden' });
      assert.equal(await cue.locator('.herd-gate-cue__mark').count(), 0);
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(output, `${backend}-visible.png`) });
      // CASE 3. Back to Classic through the normal camera control, where the
      // gate is off screen at both phone shapes and the badge has to place
      // itself inside the frame without covering a control.
      await page.keyboard.press('KeyC');
      await page.waitForTimeout(1200);
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
      // CASE 4. Normal world-axis Classic controls line up with the opening.
      // Stop by the player-facing distance, avoiding a hidden camera/position
      // override.
      await page.keyboard.down('KeyA');
      await page.waitForTimeout(1400);
      await page.keyboard.up('KeyA');
      await page.keyboard.down('KeyW');
      try {
        for (let step = 0; step < 60 && await gateDistance() > 28; step++) await page.waitForTimeout(500);
      } finally { await page.keyboard.up('KeyW'); }
      const closeDistance = await gateDistance();
      assert.ok(Number.isFinite(closeDistance) && closeDistance <= 28, `Normal gate approach stopped at ${closeDistance}m`);
      await page.waitForTimeout(1200);
      await page.waitForFunction(() => {
        const node = document.querySelector('.herd-gate-cue');
        return node?.dataset.onscreen === 'true' && node.hidden;
      });
      // CASE 5. The same suppression from the low rig, with the line of sight
      // clear. The world opening highlight is what the screenshot is for.
      await page.keyboard.press('KeyC');
      await page.waitForTimeout(1200);
      await page.waitForFunction(() => {
        const node = document.querySelector('.herd-gate-cue');
        return node?.dataset.onscreen === 'true' && node.dataset.obscured === 'false' && node.hidden;
      });
      await page.screenshot({ path: join(output, `${backend}-opening-close.png`) });
      // CASE 6. The off-screen case. Classic, world-axis, so reverse means the
      // same world direction for the whole hold. Drive well past the range at
      // which the gate leaves the frame, then release: the rig trails the dog
      // on the way out and glides forward when the key comes up, and that glide
      // is the one chance the gate has to come back into frame.
      await page.keyboard.press('KeyC');
      await page.waitForTimeout(1200);
      await page.keyboard.down('KeyS');
      try {
        for (let step = 0; step < 40 && await gateDistance() < 75; step++) await page.waitForTimeout(400);
      } finally { await page.keyboard.up('KeyS'); }
      const behindDistance = await gateDistance();
      assert.ok(behindDistance >= 75, `Reverse route stopped at ${behindDistance}m`);
      const settling = [];
      for (let step = 0; step < 10; step++) {
        await page.waitForTimeout(200);
        settling.push(await cue.getAttribute('data-onscreen'));
      }
      assert.deepEqual([...new Set(settling)], ['false'], 'Gate must stay offscreen while the Classic rig settles');
      await cue.waitFor({ state: 'visible' });
      await page.screenshot({ path: join(output, `${backend}-behind.png`) });
      // CASE 7. The cue is on screen going in, so pausing has something to hide.
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
      assert.deepEqual(errors, []);
      receipts.push({ backend, visibleGateBadgeHidden: true, fenceIconRemoved: true, behind: true,
        behindMode: 'classic', behindDistance, pauseResume: true, resumedProjection, viewportBounds: true,
        controlClearance: true, closeDistance, errors,
        note: 'World opening highlight requires screenshot review. Viewport resize verifies layout, not touch hardware or performance. The off-screen case runs under Classic because Follow no longer rotates on a reversal.' });
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
