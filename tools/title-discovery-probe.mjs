// SPDX-License-Identifier: AGPL-3.0-or-later
// Title composition and modal isolation against the production build.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, repo, startPreviewServer, stopServer, stubHarnessNetwork } from './probe-lib.mjs';

const port = Number(process.argv.find(arg => arg.startsWith('--port='))?.slice(7) ?? 5330);
const out = join(repo, 'captures', 'discovery');
mkdirSync(out, { recursive: true });
const results = [];
let server;
let browser;
try {
  server = await startPreviewServer(port);
  browser = await launchBrowser();
  for (const mobile of [true, false]) {
    const sizes = mobile ? [[390, 844], [375, 667], [844, 390], [667, 375]] : [[1440, 900]];
    const context = await browser.newContext({
      viewport: { width: sizes[0][0], height: sizes[0][1] },
      isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce',
    });
    try {
      await stubHarnessNetwork(context, { displayName: 'Meadow Scout' });
      await context.route('**/api/leaderboard?*', route => route.fulfill({
        json: { entries: Array.from({ length: 10 }, (_, i) => ({
          rank: i + 1, persistentId: `player-${i}`, displayName: `Shepherd ${i + 1}`,
          fullName: `Shepherd ${i + 1}`, score: 60 + i,
        })) },
      }));
      await context.route('**/r/lobbies/*', route => route.fulfill({ json: { rooms: [] } }));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(`http://127.0.0.1:${port}/?debug=webgl`);
      await page.locator('.herd-app[data-ready="true"]').waitFor({ state: 'attached', timeout: 90_000 });
      await page.evaluate(() => document.fonts.ready);
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        const layout = await page.evaluate(() => {
          const card = document.querySelector('.herd-title-card');
          const controls = [...card.querySelectorAll('button, a')].map(node => ({
            label: node.textContent.trim(), button: node.tagName === 'BUTTON',
            ...node.getBoundingClientRect().toJSON(),
          }));
          return { controls, scrollHeight: card.scrollHeight, clientHeight: card.clientHeight,
            overflow: document.documentElement.scrollWidth - innerWidth };
        });
        assert.equal(layout.overflow, 0);
        assert.ok(layout.scrollHeight <= layout.clientHeight + 1, JSON.stringify({ width, height, layout }));
        for (const control of layout.controls) {
          assert.ok(control.x >= 0 && control.y >= 0 && control.right <= width && control.bottom <= height,
            JSON.stringify({ width, height, control }));
          if (control.button) assert.ok(control.width >= 44 && control.height >= 44, JSON.stringify(control));
        }
        for (let i = 0; i < layout.controls.length; i++) {
          for (const b of layout.controls.slice(i + 1)) {
            const a = layout.controls[i];
            assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y,
              JSON.stringify({ width, height, overlap: [a.label, b.label] }));
          }
        }
        await page.screenshot({ path: join(out, `title-${width}x${height}.png`) });
        const multiplayer = page.locator('.herd-title-actions button').filter({ hasText: 'Play multiplayer' });
        const box = await multiplayer.boundingBox();
        await page.getByRole('button', { name: 'Times', exact: true }).click();
        await page.getByRole('list', { name: '25-sheep solo times' }).waitFor();
        assert.ok(await multiplayer.isDisabled());
        assert.ok(await multiplayer.evaluate(node => !!node.closest('[inert]')));
        await multiplayer.evaluate(node => node.focus());
        assert.ok(!(await multiplayer.evaluate(node => node === document.activeElement)));
        // A real pointer at the former button location must stay in the board.
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
        assert.equal(await page.locator('.mp-dialog[open]').count(), 0);
        await page.getByRole('button', { name: 'Close solo times' }).focus();
        for (let i = 0; i < 12; i++) {
          await page.keyboard.press('Tab');
          assert.ok(await page.evaluate(() => !!document.activeElement.closest('.herd-board-panel')));
        }
        await page.screenshot({ path: join(out, `times-${width}x${height}.png`) });
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Times', exact: true }).waitFor();
        assert.ok(await multiplayer.isEnabled());
        await multiplayer.click();
        await page.locator('.mp-dialog[open]').waitFor();
        await page.getByRole('button', { name: 'Back to solo', exact: true }).click();
        results.push({ width, height, layout, modalIsolation: true, multiplayerReopens: true });
      }
      await page.getByRole('button', { name: 'Play solo', exact: true }).click();
      await page.locator('.herd-app[data-phase="playing"]').waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log(`PASS: ${results.length} title layouts; board touch/keyboard isolation, multiplayer reopen and solo start.`);
} finally {
  await browser?.close();
  stopServer(server);
  writeFileSync(join(out, 'title-layout.json'), JSON.stringify(results, null, 2));
}
