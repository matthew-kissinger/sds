// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, startPreviewServer, stopServer } from './probe-lib.mjs';
const out = join(repo, 'captures', 'stability', 'desktop-controls');
mkdirSync(out, { recursive: true });
const checks = []; const errors = [];
let browser; let server; let failure;
try {
  server = await startPreviewServer(5361);
  browser = await chromium.launch({ channel: 'chrome', headless: false });
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
    page.on('pageerror', error => errors.push(String(error)));
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '{"entries":[]}' }));
    await page.addInitScript(() => localStorage.setItem('herd.settings.v1', JSON.stringify({ quality: 'low' })));
    await page.goto('http://localhost:5361/?seed=20260821&debug=webgl');
    await page.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', undefined, { timeout: 60000 });
    const hint = page.getByRole('group', { name: 'Keyboard controls' });
    assert.equal(await hint.count(), 0);
    await page.locator('.herd-title-actions > .herd-button--primary').click();
    await page.waitForTimeout(1000);
    if (mobile) {
      assert.equal(await hint.count(), 0); // display:none excludes it from the accessibility tree
      assert.equal(await page.locator('.herd-camera-button').isVisible(), true);
      await page.screenshot({ path: join(out, 'touch.png') });
      checks.push('Touch keeps its camera button and hides keyboard hints');
      await page.getByRole('button', { name: 'Change camera', exact: true }).focus();
      await page.keyboard.press('Space'); await page.waitForTimeout(900);
      await page.screenshot({ path: join(out, 'touch-keyboard-camera.png') });
      await page.keyboard.press('KeyC'); await page.waitForTimeout(900);
      await page.screenshot({ path: join(out, 'touch-keyboard-return.png') });
      const sprint = page.getByRole('button', { name: 'Hold to sprint', exact: true });
      const pressed = async (value) => assert.equal(await sprint.getAttribute('aria-pressed'), String(value));
      await sprint.focus();
      for (const key of ['Space', 'Enter']) {
        await page.keyboard.down(key); await pressed(true);
        await page.keyboard.down(key); await pressed(true);
        await page.keyboard.up(key); await pressed(false);
      }
      await page.keyboard.down('Space'); await page.keyboard.down('Enter');
      await page.keyboard.up('Space'); await pressed(true);
      await page.keyboard.up('Enter'); await pressed(false);
      await page.keyboard.down('Space');
      await page.getByRole('button', { name: 'Change camera', exact: true }).focus();
      await pressed(false); await page.keyboard.up('Space');
      const cdp = await page.context().newCDPSession(page);
      await page.evaluate(() => {
        globalThis.__sprintPointers = [];
        for (const name of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']) {
          document.addEventListener(name, event => globalThis.__sprintPointers.push({ type: event.type, id: event.pointerId, target: event.target.className }));
        }
      });
      const bounds = await sprint.boundingBox();
      const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 1 };
      await sprint.focus();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await page.keyboard.down('Space');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await pressed(true); await page.keyboard.up('Space'); await pressed(false);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await sprint.focus(); await page.keyboard.down('Space');
      await page.keyboard.up('Space'); await pressed(true);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point, { ...point, x: point.x + 3, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...point, x: point.x + 3, id: 2 }] });
      console.log(JSON.stringify(await page.evaluate(() => globalThis.__sprintPointers)));
      await pressed(true);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await pressed(false);
      await cdp.detach();
      checks.push('Touch Sprint supports keyboard holds, repeat, overlapping keys and focus loss');
    } else {
      assert.equal(await hint.isVisible(), true);
      const text = await hint.innerText();
      for (const value of ['W A S D', 'Space', 'Bark', 'Sprint', 'C', 'Camera', 'Esc']) assert.ok(text.includes(value));
      const bounds = await hint.boundingBox();
      assert.ok(bounds.height < 50 && bounds.width < 600);
      await page.screenshot({ path: join(out, 'desktop.png') });
      checks.push('Desktop shows default bindings in one compact row');
      await page.keyboard.press('Escape');
      assert.equal(await hint.count(), 0);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('combobox', { name: 'Camera', exact: true }).selectOption('KeyF');
      await page.getByRole('combobox', { name: 'Move forward', exact: true }).selectOption('KeyQ');
      await page.getByRole('button', { name: 'Close settings' }).click();
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      assert.match(await hint.innerText(), /Q A S D/);
      assert.match(await hint.innerText(), /F\s*Camera/);
      await page.keyboard.press('KeyF');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(out, 'desktop-remapped.png') });
      checks.push('Pause hides hints; remapped movement and camera labels update');
    }
    await page.close();
  }
} catch (error) { failure = String(error?.stack ?? error); }
finally { if (browser) await browser.close(); stopServer(server); }
writeFileSync(join(out, 'report.json'), JSON.stringify({ checks, errors, failure, limitation: 'UI verification, not performance measurement; touch is desktop emulation.' }, null, 2));
console.log(JSON.stringify({ checks, errors, failure }));
if (failure || errors.length || checks.length !== 4) process.exitCode = 1;
