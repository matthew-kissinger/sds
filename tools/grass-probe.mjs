// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The grass perf probe (spec/08: budgets are requirements with numbers, checked
// by probes in tools/, not vibes).
//
// It drives the REAL app through its normal path - open the page, press the
// real Play button at the real flock size, let the scripted dog herd - and then
// watches rAF from inside the page for ten seconds mid-herd, which is the
// worst-case frame for grass: two hundred bodies moving, two hundred trails of
// ghosts behind them, and every blade in range testing four of them.
//
//   node tools/grass-probe.mjs --port=5304
//   node tools/grass-probe.mjs --port=5304 --webgl
//   node tools/grass-probe.mjs --port=5304 --flock=25 --seconds=6
//   node tools/grass-probe.mjs --url=http://localhost:5304
//
// Flags. --port (default 5304) is the dev server this run starts; --url reuses
// one already up. --flock is 25, 75 or 200 (default 200, the budget case).
// --ticks is the sim tick to start sampling at (default 1800 = 30 s in, with
// the flock well off its spawn). --seconds is the sampling window (default 10).
// --width/--height set the viewport (default 2560x1440, the desktop budget).
// --webgl forces the WebGL2 backend for the both-backends check.
//
// Prints one JSON line of percentiles per run. Nothing is written to disk: the
// numbers belong in the phase report, not in a file nobody rereads. The server,
// browser and profile are torn down on every exit path.

import {
  SEED,
  launchBrowser,
  pressPlay,
  readout,
  removeDir,
  sampleFrameTimes,
  scratchDir,
  startServer,
  stopServer,
  waitForTick,
} from './probe-lib.mjs';

const argv = process.argv.slice(2);

function flag(name, fallback) {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

const port = Number(flag('port', 5304));
if (!Number.isInteger(port) || port < 1024 || port > 65535) fail(`bad --port ${port}`);

const flockSize = Number(flag('flock', 200));
if (![25, 75, 200].includes(flockSize)) fail(`bad --flock ${flockSize} (25, 75 or 200)`);

const ticks = Number(flag('ticks', 1800));
if (!Number.isInteger(ticks) || ticks < 1) fail(`bad --ticks ${ticks}`);

const seconds = Number(flag('seconds', 10));
if (!Number.isFinite(seconds) || seconds <= 0) fail(`bad --seconds ${seconds}`);

const width = Number(flag('width', 2560));
const height = Number(flag('height', 1440));
if (!Number.isInteger(width) || !Number.isInteger(height)) fail('bad --width/--height');

const urlFlag = flag('url', '');
const base = urlFlag ? urlFlag.replace(/\/$/, '') : `http://localhost:${port}`;
const forceWebGL = argv.includes('--webgl');
const debug = ['driver', ...(forceWebGL ? ['webgl'] : [])].join(',');

/**
 * The default run is vsync-limited, which is the honest answer to "does it hold
 * 60 fps": the browser presents on the display's clock and the percentiles say
 * whether the frame fitted in the interval. It is NOT an answer to "how much
 * headroom is left", because a frame that finishes early just waits.
 *
 * --uncapped turns the presenter off and lets the page run flat out, which is
 * how a density decision gets made with a number instead of a guess. Its
 * percentiles are throughput, not smoothness, and the two are never quoted as
 * the same measurement.
 */
const uncapped = argv.includes('--uncapped');
const UNCAPPED_ARGS = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];

/** The sim runs at 60 Hz and the loop can take five steps a frame; four times
 *  real time plus a minute of boot covers a 200-sheep run on a busy machine. */
const TICK_TIMEOUT_MS = Math.ceil((ticks / 60) * 4000) + 60_000;

let server = null;
let browser = null;
let profile = null;
let torndown = false;

async function teardown() {
  if (torndown) return;
  torndown = true;
  if (browser) await browser.close().catch(() => {});
  stopServer(server);
  removeDir(profile);
}

process.on('SIGINT', () => {
  void teardown().then(() => process.exit(130));
});

let failed = false;

try {
  if (urlFlag) {
    console.log(`using the server already at ${base}`);
  } else {
    console.log(`starting vite on port ${port}`);
    server = await startServer(port);
  }
  profile = scratchDir(`herd-grass-probe-${port}`);
  if (uncapped) {
    // Same profile discipline as probe-lib's launcher (see its comment on why
    // the temp root is how concurrent probes stay out of each other's way);
    // only the presenter flags differ.
    browser = await launchBrowser(profile, UNCAPPED_ARGS);
  } else {
    browser = await launchBrowser(profile);
  }

  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => {
    const message = String(error);
    if (errors.length < 5 && !errors.includes(message)) errors.push(message);
  });

  try {
    await page.goto(`${base}/?seed=${SEED}&debug=${debug}`, { waitUntil: 'load', timeout: 60_000 });
    await pressPlay(page, { flockSize });
    await waitForTick(page, ticks, TICK_TIMEOUT_MS);
    const before = await readout(page);
    const frames = await sampleFrameTimes(page, seconds * 1000);
    const after = await readout(page);
    if (errors.length > 0) throw new Error(`page errors: ${errors.join(' | ')}`);

    console.log(
      JSON.stringify({
        backend: after.backend,
        present: uncapped ? 'uncapped' : 'vsync',
        flockSize: Number(after.flockSize),
        viewport: `${width}x${height}`,
        tickAtStart: Number(before.tick),
        tickAtEnd: Number(after.tick),
        penned: Number(after.penned),
        drawCallsPerFrame: Number(Number(after.drawCalls).toFixed(2)),
        seconds,
        frames: frames.frames,
        fpsFromP50: Math.round(1000 / frames.p50),
        p50: Number(frames.p50.toFixed(2)),
        p95: Number(frames.p95.toFixed(2)),
        p99: Number(frames.p99.toFixed(2)),
      }),
    );
  } finally {
    await page.close();
    await context.close();
  }
} catch (error) {
  failed = true;
  console.error(`grass-probe failed: ${error}`);
} finally {
  await teardown();
}

process.exit(failed ? 1 : 0);
