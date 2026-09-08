// SPDX-License-Identifier: AGPL-3.0-or-later
// Normal keyboard/menu route. CDP counters are observations, not leak verdicts.
import { writeFileSync } from 'node:fs';
import { analyzeScreenshot } from './screenshot-analysis.mjs';

export async function runSessionSoak(page, seconds, path, checkpoint) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.evaluate(() => {
    const sampler = { live: true, capturing: false, gaps: [] };
    globalThis.__soakFrames = sampler;
    let previous;
    const tick = now => {
      if (!sampler.live) return;
      if (!sampler.capturing && document.visibilityState === 'visible' && document.querySelector('.herd-app')?.dataset.phase === 'playing') {
        if (previous !== undefined) sampler.gaps.push(now - previous);
        previous = now;
      } else previous = undefined;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const samples = [];
  const started = Date.now();
  const sample = async (name) => {
    await page.evaluate(() => { globalThis.__soakFrames.capturing = true; });
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const dom = await cdp.send('Memory.getDOMCounters');
    const state = await page.evaluate(() => ({ visibility: document.visibilityState, data: { ...document.querySelector('.herd-app').dataset } }));
    const png = await page.screenshot({ path: `${path}-${name}.png` });
    const visual = await analyzeScreenshot(page, png);
    const frames = await page.evaluate(() => {
      const gaps = globalThis.__soakFrames.gaps.splice(0).sort((a, b) => a - b);
      globalThis.__soakFrames.capturing = false;
      return { count: gaps.length, p95: gaps[Math.ceil(gaps.length * .95) - 1], p99: gaps[Math.ceil(gaps.length * .99) - 1], max: gaps.at(-1), over33: gaps.filter(x => x > 33.4).length };
    });
    samples.push({ name, elapsed: (Date.now() - started) / 1000, metrics, dom, state, visual, frames });
    writeFileSync(`${path}.json`, JSON.stringify({ seconds, samples, limitation: 'Desktop keyboard route; screenshots outside active movement. Heap/DOM observations do not prove GPU/audio release or full completion.' }, null, 2));
    if (!visual.nonblank || state.visibility !== 'visible' || state.data.phase !== 'playing' || (name !== 'initial' && state.data.renderTier !== 'high')) throw new Error(`Soak checkpoint failed: ${name}`);
    checkpoint(samples.at(-1));
  };
  try {
    await sample('initial');
    let cycle = 0;
    while (Date.now() - started < seconds * 1000) {
      // Two laps give approximately a minute of movement, sprint and barks.
      for (let lap = 0; lap < 2; lap++) for (const key of ['KeyW', 'KeyD', 'KeyS', 'KeyA']) {
        await page.keyboard.down(key);
        if (lap === 1) await page.keyboard.down('ShiftLeft');
        await page.keyboard.press('Space');
        await page.waitForTimeout(7000);
        await page.keyboard.up(key); await page.keyboard.up('ShiftLeft');
      }
      await page.keyboard.press('KeyC');
      await page.keyboard.press('Escape');
      await page.locator('.herd-app[data-phase="paused"]').waitFor();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const quality = page.getByRole('combobox', { name: /Render quality/ });
      await quality.selectOption('low'); await page.waitForTimeout(500);
      await quality.selectOption('high'); await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Close settings' }).click();
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.waitForTimeout(1500);
      await sample(`cycle-${++cycle}`);
      if (cycle % 5 === 0) {
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'End run', exact: true }).click();
        await page.locator('.herd-size').filter({ hasText: '200' }).click();
        await page.getByRole('button', { name: 'Play', exact: true }).click();
        await page.waitForTimeout(1500);
        await sample(`restart-${cycle}`);
      }
    }
    return samples;
  } finally {
    await page.evaluate(() => { if (globalThis.__soakFrames) globalThis.__soakFrames.live = false; }).catch(() => {});
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']) await page.keyboard.up(key).catch(() => {});
    await cdp.detach();
  }
}
