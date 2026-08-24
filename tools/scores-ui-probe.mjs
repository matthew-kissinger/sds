// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const appPort = 5196;
const apiPort = 5197;
const appUrl = `http://127.0.0.1:${appPort}`;
let displayName = 'SteadyCollie';

function json(response, body, status = 200) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': appUrl,
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  response.end(JSON.stringify(body));
}

const api = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return json(response, {});
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (request.url === '/api/register') {
    return json(response, {
      token: 'probe-token', authSecret: 'probe-secret',
      playerProfile: {
        persistent_id: 'probe-player', displayName, fullName: `${displayName}#0001`,
      },
    });
  }
  if (request.url === '/api/rename') {
    displayName = body.displayName;
    return json(response, {
      success: true,
      playerProfile: {
        persistent_id: 'probe-player', displayName, fullName: `${displayName}#0001`,
      },
    });
  }
  if (request.url === '/api/score') return json(response, { success: true });
  if (request.url?.startsWith('/api/leaderboard')) {
    return json(response, { entries: [
      { rank: 1, persistent_id: 'probe-player', displayName, fullName: `${displayName}#0001`, score: 48.4 },
      { rank: 2, persistent_id: 'two', displayName: 'QuietDrover', fullName: 'QuietDrover#0001', score: 55.2 },
      { rank: 3, persistent_id: 'three', displayName: 'GoldenGuide', fullName: 'GoldenGuide#0001', score: 62.8 },
    ] });
  }
  return json(response, { error: 'not found' }, 404);
});

const app = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(appPort)],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VITE_SCORE_API_BASE: `http://127.0.0.1:${apiPort}` },
  },
);

async function waitForApp() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(appUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error('score UI probe app did not start');
}

let browser;
try {
  console.log('starting score UI probe servers');
  await new Promise((resolve) => api.listen(apiPort, '127.0.0.1', resolve));
  await waitForApp();
  console.log('score UI probe app ready');
  await mkdir('captures', { recursive: true });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  let offlineExpected = false;
  page.on('console', (message) => {
    if (message.type() === 'error' && !offlineExpected) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('Running as').waitFor();
  await page.locator('.herd-boot[data-ready="true"]').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1_500);
  console.log('score identity ready');
  await page.screenshot({ path: 'captures/solo-times-title.png' });

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Leaderboard name').fill('MeadowRunner');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('MeadowRunner', { exact: true }).waitFor();

  await page.evaluate(async () => {
    const { useGameStore } = await import('/src/state/store.ts');
    useGameStore.setState({
      gamePhase: 'complete', uiPanel: 'none', flockSize: 25,
      completionTimeMs: 48400, completionTick: 2904,
      personalBests: { 25: 48400, 75: null, 200: null }, lastRunWasBest: true,
    });
  });
  await page.getByText('Online rank 1.').waitFor();
  await page.getByText(/QuietDrover/).waitFor();
  console.log('score completion board ready');
  await page.screenshot({ path: 'captures/solo-times-completion.png' });

  offlineExpected = true;
  await new Promise((resolve) => api.close(resolve));
  await page.evaluate(async () => {
    const { useGameStore } = await import('/src/state/store.ts');
    useGameStore.setState({ gamePhase: 'playing' });
    useGameStore.setState({
      gamePhase: 'complete', flockSize: 75,
      completionTimeMs: 75200, completionTick: 4512,
      personalBests: { 25: 48400, 75: 75200, 200: null }, lastRunWasBest: true,
    });
  });
  await page.getByText('Your local time is safe. The online board is unavailable.').waitFor();
  if (!(await page.getByRole('button', { name: 'Play again' }).isEnabled())) {
    throw new Error('offline completion blocked Play again');
  }
  await page.screenshot({ path: 'captures/solo-times-offline.png' });
  console.log('score fail-soft state ready');
  if (errors.length > 0) throw new Error(`browser errors:\n${errors.join('\n')}`);
  console.log('score UI probe passed');
} finally {
  await browser?.close();
  if (api.listening) await new Promise((resolve) => api.close(resolve));
  app.kill();
}
