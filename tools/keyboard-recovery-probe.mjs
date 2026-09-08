// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { repo, startPreviewServer, stopServer } from './probe-lib.mjs';
const out = join(repo, 'captures', 'stability', 'keyboard-recovery');
mkdirSync(out, { recursive: true });
const checks = []; const errors = [];
const recovery = {};
let browser; let server; let failure; let chrome; let profile; let page;
try {
  server = await startPreviewServer(5362);
  profile = mkdtempSync(join(tmpdir(), 'sds-recovery-'));
  chrome = spawn(join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--window-size=1456,987', '--window-position=0,0'], { windowsHide: false, stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 10000;
  while (!existsSync(portFile) && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
  const port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
  // The installed Playwright supports noDefaults on CDP attachment. Its normal
  // launch session's focus override cannot be cancelled by a second session.
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
  const context = browser.contexts()[0];
  page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.bringToFront();
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ entries: [], token: 'probe', authSecret: 'probe', playerProfile: { persistentId: 'probe', displayName: 'Probe', fullName: 'Probe' } }) }));
  await page.addInitScript(() => {
    localStorage.setItem('herd.settings.v1', JSON.stringify({ quality: 'low', showTimer: true }));
    globalThis.__focusEvents = [];
    for (const type of ['blur', 'focus', 'visibilitychange']) {
      (type === 'visibilitychange' ? document : window).addEventListener(type, () => globalThis.__focusEvents.push({ type, at: performance.now(), visible: document.visibilityState, focused: document.hasFocus() }));
    }
    const roots = new Map(); let id = 0;
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, inject: () => ++id,
      onCommitFiberRoot: (id, root) => roots.set(id, root), onCommitFiberUnmount: () => {},
    };
    globalThis.__cameraReceipt = () => {
      for (const root of roots.values()) {
        const stack = [root.current];
        while (stack.length) {
          const fiber = stack.pop(); const props = fiber.memoizedProps;
          const state = (props?.store ?? props?.value)?.getState?.();
          if (state?.gl && state?.camera) return state.camera.position.toArray();
          if (fiber.child) stack.push(fiber.child);
          if (fiber.sibling) stack.push(fiber.sibling);
        }
      }
      throw new Error('Camera not found');
    };
  });
  await page.goto('http://localhost:5362/?seed=20260821&debug=webgl');
  await page.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', undefined, { timeout: 60000 });
  await page.waitForTimeout(700);
  const camera = () => page.evaluate(() => globalThis.__cameraReceipt());
  const titleCamera = await camera();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Leaderboard name' });
  await name.fill(''); await name.press('KeyC'); await name.press('KeyW');
  assert.equal(await name.inputValue(), 'cw');
  await page.waitForTimeout(700);
  assert.deepEqual(await camera(), titleCamera);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  checks.push('Typing C/W in the real name input does not move or switch the camera');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const quality = page.getByRole('combobox', { name: /Render quality/ });
  await quality.focus(); await quality.press('KeyC');
  assert.deepEqual(await camera(), titleCamera);
  await quality.press('Escape');
  await page.getByRole('button', { name: 'Play', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.locator('.herd-app[data-phase="playing"]').waitFor();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Pause', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.locator('.herd-app[data-phase="paused"]').waitFor();
  const pausedTime = await page.locator('.herd-timer').innerText();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.herd-timer').innerText(), pausedTime);
  await page.getByRole('button', { name: 'Resume', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.locator('.herd-app[data-phase="playing"]').waitFor();
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus(), undefined, { timeout: 5000 });
  await page.keyboard.press('KeyC');
  await page.waitForFunction(height => globalThis.__cameraReceipt()[1] < height - 10, titleCamera[1], { timeout: 5000 });
  assert.ok((await camera())[1] < titleCamera[1] - 10);
  checks.push('Select editing, Escape, native Space Play/Pause/Resume and camera handoff work');
  const other = await context.newPage(); await other.goto('about:blank');
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus(), undefined, { timeout: 5000 });
  await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(500);
  await other.bringToFront();
  await other.waitForFunction(() => document.hasFocus(), undefined, { timeout: 5000 });
  await other.keyboard.up('KeyW'); await other.keyboard.up('ShiftLeft');
  await page.bringToFront(); await page.waitForTimeout(1500);
  const stopped = await camera(); await page.waitForTimeout(600);
  recovery.before = stopped; recovery.after = await camera();
  recovery.events = await page.evaluate(() => globalThis.__focusEvents);
  assert.ok(recovery.events.some(event => event.type === 'blur'));
  await page.screenshot({ path: join(out, 'recovery-check.png') });
  assert.ok(Math.hypot(...recovery.after.map((v, i) => v - stopped[i])) < 0.1);
  checks.push('A real tab focus change releases held movement/sprint without a keyup in the game');
  await page.screenshot({ path: join(out, 'recovered.png') });
} catch (error) {
  failure = String(error?.stack ?? error);
  console.error(failure);
  await page?.screenshot({ path: join(out, 'failure.png'), timeout: 5000 }).catch(() => {});
}
finally {
  if (browser?.isConnected()) {
    const session = await browser.newBrowserCDPSession();
    await session.send('Browser.close').catch(() => {});
    await browser.close();
  }
  chrome?.kill(); stopServer(server);
  if (profile && dirname(resolve(profile)) === resolve(tmpdir()) && basename(profile).startsWith('sds-recovery-')) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
    catch (error) { errors.push(`Profile cleanup ${profile}: ${error.message}`); }
  }
}
writeFileSync(join(out, 'report.json'), JSON.stringify({ checks, errors, recovery, failure, limitation: 'Functional UI/recovery probe; PC timing is not a benchmark.' }, null, 2));
console.log(JSON.stringify({ checks, errors, failure }));
if (failure || errors.length || checks.length !== 3) process.exitCode = 1;
