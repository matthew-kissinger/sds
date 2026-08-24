// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Captures the post-bus running mix from the normal game. A tools-only init
// script mirrors nodes connected to the browser AudioDestinationNode into a
// MediaStream destination. The shipped application has no capture helper,
// globals or diagnostic mode.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEED,
  launchBrowser,
  removeDir,
  repo,
  scratchDir,
  startPreviewServer,
  startServer,
  stopServer,
} from './probe-lib.mjs';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const match = argv.find((arg) => arg.startsWith(`--${name}=`));
  return match === undefined ? fallback : match.slice(name.length + 3);
};
const port = Number(value('port', '5320'));
const label = value('label', 'phase5-running-mix');
const seconds = Number(value('seconds', '20'));
const production = argv.includes('--production');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`bad port ${port}`);
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(label)) throw new Error(`bad label ${label}`);
if (![20, 600].includes(seconds)) throw new Error('--seconds must be 20 or 600');

const base = `http://localhost:${port}`;
const outDir = join(repo, 'captures', 'audio', label);
const recording = join(outDir, 'herd-running-mix.webm');
mkdirSync(outDir, { recursive: true });

let server = null;
let browser = null;
let context = null;
let page = null;
let profile = null;
const errors = [];
const networkFailures = [];

try {
  server = production ? await startPreviewServer(port) : await startServer(port);
  profile = scratchDir(`herd-audio-${port}`);
  browser = await launchBrowser(profile);
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    const NativeAudioContext = globalThis.AudioContext;
    const destinationTaps = new WeakMap();
    const records = [];
    const nativeConnect = globalThis.AudioNode.prototype.connect;
    globalThis.AudioNode.prototype.connect = function (destination, ...args) {
      const tap = destinationTaps.get(destination);
      if (tap !== undefined && destination !== tap) nativeConnect.call(this, tap);
      return nativeConnect.call(this, destination, ...args);
    };

    globalThis.AudioContext = new Proxy(NativeAudioContext, {
      construct(Target, args) {
        const audio = Reflect.construct(Target, args);
        const streamNode = audio.createMediaStreamDestination();
        const record = { audio, streamNode, bufferSources: 0, oscillators: 0 };
        destinationTaps.set(audio.destination, streamNode);
        records.push(record);
        const nativeBufferSource = audio.createBufferSource.bind(audio);
        const nativeOscillator = audio.createOscillator.bind(audio);
        audio.createBufferSource = (...sourceArgs) => {
          record.bufferSources += 1;
          return nativeBufferSource(...sourceArgs);
        };
        audio.createOscillator = (...oscillatorArgs) => {
          record.oscillators += 1;
          return nativeOscillator(...oscillatorArgs);
        };
        return audio;
      },
    });

    Object.defineProperty(globalThis, '__herdToolAudioCapture', {
      configurable: true,
      value: {
        start(durationSeconds) {
          const record = records[0];
          if (record === undefined) throw new Error('AudioContext not created');
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';
          const chunks = [];
          const recorder = new MediaRecorder(record.streamNode.stream, {
            mimeType,
            audioBitsPerSecond: 128_000,
          });
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
          };
          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            const anchor = document.createElement('a');
            anchor.href = URL.createObjectURL(blob);
            anchor.download = 'herd-running-mix.webm';
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(anchor.href), 1_000);
          };
          recorder.start(250);
          setTimeout(() => recorder.stop(), durationSeconds * 1_000);
        },
        snapshot() {
          return records.map((record) => ({
            state: record.audio.state,
            currentTime: record.audio.currentTime,
            bufferSources: record.bufferSources,
            oscillators: record.oscillators,
          }));
        },
      },
    });
  });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`page: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) networkFailures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${base}/?seed=${SEED}`, {
    waitUntil: 'load',
    timeout: 60_000,
  });
  await page.locator('.herd-app[data-ready="true"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForFunction(() => globalThis.__herdToolAudioCapture?.snapshot().length === 1);
  await page.locator('.herd-size').filter({ hasText: '25' }).click();
  await page.locator('.herd-title-actions > .herd-button--primary').click();
  await page.locator('.herd-pause-button').waitFor({ state: 'visible', timeout: 30_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: (seconds + 120) * 1000 });
  await page.evaluate((durationSeconds) => globalThis.__herdToolAudioCapture.start(durationSeconds), seconds);
  if (seconds === 20) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2600);
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(2200);
    await page.keyboard.press('Space');
    await page.waitForTimeout(2300);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(6600);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(2600);
    await page.keyboard.press('Space');
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(13_000);
  }
  const download = await downloadPromise;
  await download.saveAs(recording);
  const audioActivity = await page.evaluate(() => globalThis.__herdToolAudioCapture.snapshot());

  const packets = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'packet=pts_time,duration_time', '-of', 'csv=p=0', recording,
  ], { encoding: 'utf8' }).trim().split(/\r?\n/);
  const lastPacket = packets.at(-1)?.split(',').map(Number) ?? [];
  const duration = (lastPacket[0] ?? 0) + (lastPacket[1] ?? 0);
  const loudnessRun = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', recording,
    '-filter_complex', 'ebur128=peak=true', '-f', 'null', 'NUL',
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const loudnessText = loudnessRun.stderr ?? '';
  const lastNumber = (pattern) => [...loudnessText.matchAll(pattern)].at(-1)?.[1] ?? null;
  const measurement = (raw) => raw === null ? null : Number(raw);
  const integratedLufs = measurement(lastNumber(/I:\s+(-?\d+\.\d+)\s+LUFS/g));
  const loudnessRangeLu = measurement(lastNumber(/LRA:\s+(\d+\.\d+)\s+LU/g));
  const truePeakDbfs = measurement(lastNumber(/Peak:\s+(-?\d+\.\d+)\s+dBFS/g));
  const sha256 = createHash('sha256').update(readFileSync(recording)).digest('hex');
  const expectedNetworkFailures = networkFailures.filter((item) => (
    production && /^404 .*\/api\/(?:lobbies|register)$/.test(item)
  ));
  const unexpectedNetworkFailures = networkFailures.filter(
    (item) => !expectedNetworkFailures.includes(item),
  );
  const receipt = {
    tool: 'tools/audio-capture.mjs',
    server: production ? 'production-preview' : 'vite-dev',
    seed: SEED,
    capturedAt: new Date().toISOString(),
    durationSeconds: duration,
    byteSize: statSync(recording).size,
    sha256,
    integratedLufs,
    loudnessRangeLu,
    truePeakDbfs,
    audioActivity,
    errors,
    networkFailures,
    expectedNetworkFailures,
    unexpectedNetworkFailures,
    pass: duration >= seconds - 1 && duration <= seconds + 2 && errors.length === 0 &&
      unexpectedNetworkFailures.length === 0 && audioActivity.length === 1 &&
      audioActivity[0].state === 'running' && audioActivity[0].bufferSources >= 2 &&
      integratedLufs !== null &&
      loudnessRangeLu !== null && truePeakDbfs !== null,
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.pass) process.exitCode = 1;
} finally {
  if (page) await page.close().catch(() => {});
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  stopServer(server);
  removeDir(profile);
}
