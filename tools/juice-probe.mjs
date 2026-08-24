// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Capture the accepted bark echo through the real keyboard/input path. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEED,
  launchBrowser,
  pressPlay,
  readout,
  removeDir,
  repo,
  scratchDir,
  shot,
  startServer,
  stopServer,
  waitForTick,
} from './probe-lib.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const port = Number(value('port', '56060'));
const label = value('label', 'phase4-bark-echo');
const webgl = args.includes('--webgl');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`bad port ${port}`);
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(label)) throw new Error(`bad label ${label}`);

const outDir = join(repo, 'captures', 'juice', label);
mkdirSync(outDir, { recursive: true });
let server;
let browser;
let context;
let profile;
const errors = [];
const captures = [];

try {
  server = await startServer(port);
  profile = scratchDir(`herd-juice-${label}`);
  browser = await launchBrowser(profile);
  context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // Keep this on the real input path. The scripted herding driver deliberately
  // owns every tick's intent and would overwrite the keyboard bark.
  const debug = ['readout', 'follow', ...(webgl ? ['webgl'] : [])].join(',');
  await page.goto(`http://localhost:${port}/?seed=${SEED}&debug=${debug}`, { waitUntil: 'load', timeout: 60_000 });
  await pressPlay(page, { flockSize: 200 });
  await waitForTick(page, 300, 60_000);
  await page.keyboard.press('Space');

  for (const [name, delayMs] of [['front', 120], ['echo', 280]]) {
    await page.waitForTimeout(delayMs);
    const file = join(outDir, `${name}.png`);
    await shot(page, file);
    captures.push({ name, delayMs, file: `${name}.png`, state: await readout(page) });
  }
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  stopServer(server);
  removeDir(profile);
}

const manifest = {
  tool: 'tools/juice-probe.mjs',
  seed: SEED,
  backendRequested: webgl ? 'webgl2' : 'webgpu',
  capturedAt: new Date().toISOString(),
  captures,
  errors: [...new Set(errors)].slice(0, 10),
};
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
process.exit(manifest.errors.length === 0 && captures.length === 2 ? 0 : 1);
