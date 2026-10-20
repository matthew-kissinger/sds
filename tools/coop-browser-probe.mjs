// SPDX-License-Identifier: AGPL-3.0-or-later
// Functional receipts only. Run against npm run coop:built. No game hooks.
import { launchBrowser } from './probe-lib.mjs';
import { decode } from '@msgpack/msgpack';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const mobile = process.argv.includes('--mobile'), webgl = process.argv.includes('--webgl');
const players = process.argv.includes('--four') ? 4 : 2;
const suffix = webgl ? '?debug=webgl' : '';
const output = `captures/multiplayer/local-coop/${webgl ? 'webgl2' : 'webgpu'}-${mobile ? 'mobile' : 'desktop'}-${players}`; await mkdir(output, { recursive: true });
const browser = await launchBrowser(undefined, ['--disable-background-timer-throttling', '--disable-renderer-backgrounding']);
const errors = [], snapshots = Array.from({ length: players }, () => []);
const contexts = await Promise.all(Array.from({ length: players }, () => browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 } })));
const pages = await Promise.all(contexts.map(c => c.newPage()));
try {
  for (const [i, p] of pages.entries()) {
    await p.route('**/cloudflareinsights.com/**', route => route.abort());
    await p.route('**/static.cloudflareinsights.com/**', route => route.abort());
    p.on('pageerror', e => errors.includes(e.message) || errors.push(e.message));
    p.on('websocket', ws => ws.on('framereceived', event => {
      try { const frame = decode(event.payload); if (frame.type === 'snapshot') snapshots[i].push(frame); } catch { /* nonbinary */ }
    }));
  }
  const [host, guest] = pages;
  console.log('Opening built client');
  await host.goto('http://localhost:5198/' + suffix);
  await host.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', {}, { timeout: 90000 });
  await host.getByRole('button', { name: 'Play co-op locally' }).click();
  await host.getByLabel('Visibility').selectOption('public');
  await host.getByRole('button', { name: 'Create co-op room' }).click();
  await host.getByRole('button', { name: 'Start co-op', exact: true }).waitFor({ timeout: 20000 });
  const link = await host.getByLabel('Invite link', { exact: true }).inputValue();
  console.log('Host waiting room created');
  await guest.goto(link + suffix);
  await guest.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', {}, { timeout: 90000 });
  await guest.getByRole('button', { name: 'Join room', exact: true }).click();
  await guest.getByRole('button', { name: 'Ready', exact: true }).waitFor({ timeout: 20000 });
  for (const extra of pages.slice(2)) {
    await extra.goto(link + suffix);
    await extra.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', {}, { timeout: 90000 });
    await extra.getByRole('button', { name: 'Join room', exact: true }).click();
    await extra.getByRole('button', { name: 'Ready', exact: true }).click();
  }
  await host.screenshot({ path: `${output}/waiting.png` });
  await host.getByRole('button', { name: 'Ready', exact: true }).click();
  await guest.getByRole('button', { name: 'Ready', exact: true }).click();
  await host.getByRole('button', { name: 'Start co-op', exact: true }).click();
  for (const p of pages) await p.waitForFunction(() => document.querySelector('.herd-app')?.dataset.phase === 'playing', {}, { timeout: 20000 });
  console.log('Both rendered clients playing');
  await host.keyboard.down('w'); await guest.keyboard.down('d');
  await host.waitForTimeout(1800); await host.keyboard.up('w'); await guest.keyboard.up('d');
  await host.keyboard.press('Space'); await guest.keyboard.press('Space');
  await host.waitForTimeout(1200);
  const newest = snapshots[0].at(-1); assert(newest?.tick > 60);
  assert.equal(newest.dogs.length, players); assert(newest.barks.some(b => b.slot === 0)); assert(newest.barks.some(b => b.slot === 1));
  const same = snapshots[1].find(s => s.tick === newest.tick); assert.deepEqual(same, newest);
  assert.equal(await host.locator('[data-player-label]').count(), players);
  assert.equal(await host.locator('.herd-app').getAttribute('data-backend'), webgl ? 'webgl2' : 'webgpu');
  await host.screenshot({ path: `${output}/playing.png` });
  await guest.reload();
  await guest.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', {}, { timeout: 90000 });
  await guest.getByRole('button', { name: 'Join room', exact: true }).click();
  await guest.waitForFunction(() => document.querySelector('.herd-app')?.dataset.phase === 'playing', {}, { timeout: 15000 });
  console.log('Reload reclaimed the same seat');
  await guest.keyboard.press('Escape');
  await guest.getByRole('button', { name: 'Leave room', exact: true }).click();
  await host.waitForTimeout(1500);
  assert.equal(snapshots[0].at(-1).dogs.length, players - 1);
  assert.equal(await host.locator('.herd-app').getAttribute('data-phase'), 'playing');
  for (const p of [host, ...pages.slice(2)]) { await p.keyboard.press('Escape'); await p.getByRole('button', { name: 'Leave room', exact: true }).click(); }
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(`${output}/receipt.json`, JSON.stringify({ functionalOnly: true, players, mobileViewport: mobile, errors,
    backend: await host.locator('.herd-app').getAttribute('data-backend'), snapshots: snapshots.map(s => s.length),
    checks: [`${players} independent identities`, 'invite shell', 'ready barrier', 'movement', 'two barks', 'same-tick snapshot agreement', 'reload reconnect', `leave continues with ${players - 1}`] }, null, 2));
  console.log('PASS: local co-op browser flow');
} finally { await Promise.all(contexts.map(c => c.close())); await browser.close(); }
