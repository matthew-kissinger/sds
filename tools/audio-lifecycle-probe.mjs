// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Compact production-browser acceptance for the one AudioRoot. The probe
// instruments browser audio primitives before the app loads, then drives only
// real public controls. Its temporary probe object exists only in the browser
// context created by this tool. The shipped app adds no globals or modes.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEED,
  launchBrowser,
  removeDir,
  repo,
  scratchDir,
  startPreviewServer,
  stopServer,
} from './probe-lib.mjs';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const port = Number(value('port', '5348'));
const label = value('label', 'phase5-lifecycle-final');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`bad port ${port}`);
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(label)) throw new Error(`bad label ${label}`);

const outDir = join(repo, 'captures', 'audio', label);
const base = `http://localhost:${port}`;
const EXPECTED_LOOP_RATES = [1.011, 0.983, 0.991, 1.007, 0.976];
mkdirSync(outDir, { recursive: true });

let server = null;
let browser = null;
let context = null;
let page = null;
let profile = null;
const errors = [];
const networkFailures = [];
const stages = {};
let failure = null;

const snapshot = (target) => target.evaluate(() => globalThis.__herdAudioProbe.snapshot());
const loopShape = (state) => state.media
  .filter((item) => item.loop)
  .map(({ id, playCalls, pauseCalls, paused, playbackRate }) => ({
    id, playCalls, pauseCalls, paused, playbackRate,
  }));
const closeTo = (left, right, epsilon = 0.02) => Math.abs(left - right) <= epsilon;
const pressPlay = async (target) => {
  await target.locator('.herd-size').filter({ hasText: '25' }).click();
  await target.locator('.herd-title-actions > .herd-button--primary').click();
  await target.locator('.herd-pause-button').waitFor({ state: 'visible', timeout: 30_000 });
};

try {
  server = await startPreviewServer(port);
  profile = scratchDir(`herd-audio-lifecycle-${port}`);
  browser = await launchBrowser(profile);
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    const contexts = [];
    const media = [];
    let nextMediaId = 1;
    const mediaRecord = (element) => {
      let record = media.find((item) => item.element === element);
      if (record !== undefined) return record;
      record = {
        id: nextMediaId++, element, playCalls: 0, pauseCalls: 0,
        loadCalls: 0, playRejects: 0,
      };
      media.push(record);
      return record;
    };

    const mediaPrototype = globalThis.HTMLMediaElement.prototype;
    const nativePlay = mediaPrototype.play;
    const nativePause = mediaPrototype.pause;
    const nativeLoad = mediaPrototype.load;
    mediaPrototype.play = function (...args) {
      const record = mediaRecord(this);
      record.playCalls += 1;
      const result = nativePlay.apply(this, args);
      void result.catch(() => { record.playRejects += 1; });
      return result;
    };
    mediaPrototype.pause = function (...args) {
      mediaRecord(this).pauseCalls += 1;
      return nativePause.apply(this, args);
    };
    mediaPrototype.load = function (...args) {
      mediaRecord(this).loadCalls += 1;
      return nativeLoad.apply(this, args);
    };

    const NativeAudioContext = globalThis.AudioContext;
    globalThis.AudioContext = new Proxy(NativeAudioContext, {
      construct(Target, args) {
        const audio = Reflect.construct(Target, args);
        const record = {
          audio,
          resumeCalls: 0,
          suspendCalls: 0,
          closeCalls: 0,
          decodeCalls: 0,
          bufferSources: 0,
          oscillators: 0,
          gains: [],
          panners: [],
        };
        contexts.push(record);

        const nativeResume = audio.resume.bind(audio);
        const nativeSuspend = audio.suspend.bind(audio);
        const nativeClose = audio.close.bind(audio);
        const nativeDecode = audio.decodeAudioData.bind(audio);
        const nativeCreateGain = audio.createGain.bind(audio);
        const nativeCreatePanner = audio.createPanner.bind(audio);
        const nativeCreateBufferSource = audio.createBufferSource.bind(audio);
        const nativeCreateOscillator = audio.createOscillator.bind(audio);
        audio.resume = (...resumeArgs) => {
          record.resumeCalls += 1;
          return nativeResume(...resumeArgs);
        };
        audio.suspend = (...suspendArgs) => {
          record.suspendCalls += 1;
          return nativeSuspend(...suspendArgs);
        };
        audio.close = (...closeArgs) => {
          record.closeCalls += 1;
          return nativeClose(...closeArgs);
        };
        audio.decodeAudioData = (...decodeArgs) => {
          record.decodeCalls += 1;
          return nativeDecode(...decodeArgs);
        };
        audio.createGain = (...gainArgs) => {
          const node = nativeCreateGain(...gainArgs);
          record.gains.push(node);
          return node;
        };
        audio.createPanner = (...pannerArgs) => {
          const node = nativeCreatePanner(...pannerArgs);
          record.panners.push(node);
          return node;
        };
        audio.createBufferSource = (...sourceArgs) => {
          record.bufferSources += 1;
          return nativeCreateBufferSource(...sourceArgs);
        };
        audio.createOscillator = (...oscillatorArgs) => {
          record.oscillators += 1;
          return nativeCreateOscillator(...oscillatorArgs);
        };
        return audio;
      },
    });

    Object.defineProperty(globalThis, '__herdAudioProbe', {
      configurable: true,
      value: {
        snapshot() {
          return {
            contexts: contexts.map((record, index) => ({
              id: index + 1,
              state: record.audio.state,
              currentTime: record.audio.currentTime,
              resumeCalls: record.resumeCalls,
              suspendCalls: record.suspendCalls,
              closeCalls: record.closeCalls,
              decodeCalls: record.decodeCalls,
              bufferSources: record.bufferSources,
              oscillators: record.oscillators,
              gains: record.gains.slice(0, 6).map((node) => node.gain.value),
              panners: record.panners.map((node, pannerIndex) => ({
                id: pannerIndex + 1,
                x: node.positionX.value,
                y: node.positionY.value,
                z: node.positionZ.value,
                panningModel: node.panningModel,
                distanceModel: node.distanceModel,
              })),
            })),
            media: media.map((record) => ({
              id: record.id,
              loop: record.element.loop,
              paused: record.element.paused,
              playbackRate: record.element.playbackRate,
              playCalls: record.playCalls,
              pauseCalls: record.pauseCalls,
              loadCalls: record.loadCalls,
              playRejects: record.playRejects,
              source: record.element.currentSrc || record.element.src,
            })),
          };
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

  await page.goto(`${base}/?seed=${SEED}`, { waitUntil: 'load', timeout: 60_000 });
  await page.locator('.herd-app[data-ready="true"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForFunction(() => globalThis.__herdAudioProbe?.snapshot().contexts.length === 1);
  stages.beforeGesture = await snapshot(page);

  await pressPlay(page);
  await page.waitForFunction((expectedLoopCount) => {
    const state = globalThis.__herdAudioProbe.snapshot();
    const loops = state.media.filter((item) => item.loop);
    return state.contexts[0]?.state === 'running' && loops.length === expectedLoopCount
      && loops.every((item) => !item.paused);
  }, EXPECTED_LOOP_RATES.length);
  stages.afterGesture = await snapshot(page);

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForFunction(() => globalThis.__herdAudioProbe.snapshot().contexts[0]?.state === 'suspended');
  stages.paused = await snapshot(page);
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForFunction(() => globalThis.__herdAudioProbe.snapshot().contexts[0]?.state === 'running');
  stages.resumed = await snapshot(page);

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Mute all sound').check({ force: true });
  await page.waitForFunction(() => globalThis.__herdAudioProbe.snapshot().contexts[0]?.gains[0] === 0);
  stages.muted = await snapshot(page);
  await page.getByLabel('Mute all sound').uncheck({ force: true });
  await page.getByLabel('Meadow volume').fill('0.15');
  await page.getByLabel('Dog volume').fill('0.25');
  await page.waitForFunction(() => {
    const gains = globalThis.__herdAudioProbe.snapshot().contexts[0]?.gains ?? [];
    return Math.abs(gains[1] - 0.15) < 0.02 && Math.abs(gains[3] - 0.25) < 0.02;
  });
  stages.levels = await snapshot(page);
  await page.getByRole('button', { name: 'Close settings' }).click();

  await page.getByRole('button', { name: 'End run' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
  await page.waitForFunction(() => globalThis.__herdAudioProbe.snapshot().contexts[0]?.state === 'running');
  stages.titleAfterEnd = await snapshot(page);
  await pressPlay(page);
  await page.waitForFunction((expectedLoopCount) => {
    const loops = globalThis.__herdAudioProbe.snapshot().media.filter((item) => item.loop);
    return loops.length === expectedLoopCount && loops.every((item) => !item.paused);
  }, EXPECTED_LOOP_RATES.length);
  stages.restarted = await snapshot(page);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => globalThis.__herdAudioProbe.snapshot().contexts[0]?.state === 'suspended');
  stages.hidden = await snapshot(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => globalThis.__herdAudioProbe.snapshot().contexts[0]?.state === 'running');
  stages.visible = await snapshot(page);

  await page.waitForFunction(() => globalThis.__herdAudioProbe.snapshot().contexts[0]?.decodeCalls >= 12, null, {
    timeout: 30_000,
  });
  const beforeBark = await snapshot(page);
  await page.keyboard.press('Space');
  await page.waitForFunction(({ count }) => {
    const panners = globalThis.__herdAudioProbe.snapshot().contexts[0]?.panners ?? [];
    return panners.length > count;
  }, {
    count: beforeBark.contexts[0].panners.length,
  });
  stages.afterBark = await snapshot(page);

  const loopsAfterGesture = loopShape(stages.afterGesture);
  const loopsPaused = loopShape(stages.paused);
  const loopsResumed = loopShape(stages.resumed);
  const loopsRestarted = loopShape(stages.restarted);
  const loopsVisible = loopShape(stages.visible);
  const newBarkPanners = stages.afterBark.contexts[0].panners
    .slice(beforeBark.contexts[0].panners.length);
  const checks = {
    oneAudioContext: Object.values(stages).every((stage) => stage.contexts.length === 1),
    gestureUnlock: ['suspended', 'running'].includes(stages.beforeGesture.contexts[0].state)
      && stages.beforeGesture.media.length === 0
      && stages.afterGesture.contexts[0].state === 'running'
      && (stages.beforeGesture.contexts[0].state === 'running'
        || stages.afterGesture.contexts[0].resumeCalls > stages.beforeGesture.contexts[0].resumeCalls)
      && loopsAfterGesture.length === EXPECTED_LOOP_RATES.length
      && loopsAfterGesture.every((item) => item.playCalls === 1 && !item.paused),
    pauseSuspends: stages.paused.contexts[0].state === 'suspended'
      && loopsPaused.every((item) => item.paused),
    resumeReusesLoops: stages.resumed.contexts[0].state === 'running'
      && loopsResumed.length === EXPECTED_LOOP_RATES.length
      && loopsResumed.every((item, index) => (
        item.id === loopsAfterGesture[index]?.id && item.playCalls === 2 && !item.paused
      )),
    muteAndVolume: stages.muted.contexts[0].gains[0] === 0
      && closeTo(stages.levels.contexts[0].gains[0], 0.8)
      && closeTo(stages.levels.contexts[0].gains[1], 0.15)
      && closeTo(stages.levels.contexts[0].gains[3], 0.25),
    restartReusesGraph: stages.restarted.contexts[0].state === 'running'
      && loopsRestarted.length === EXPECTED_LOOP_RATES.length
      && loopsRestarted.every((item, index) => item.id === loopsAfterGesture[index]?.id),
    visibilityLifecycle: stages.hidden.contexts[0].state === 'suspended'
      && loopShape(stages.hidden).every((item) => item.paused)
      && stages.visible.contexts[0].state === 'running'
      && loopsVisible.every((item) => !item.paused),
    positionalBark: newBarkPanners.some((item) => (
      item.panningModel === 'HRTF'
      && item.distanceModel === 'inverse'
      && Number.isFinite(item.x)
      && Number.isFinite(item.z)
      && Math.abs(item.x) <= 100
      && Math.abs(item.z) <= 100
    )),
    noDuplicateLoops: Object.values(stages).every(
      (stage) => stage.media.filter((item) => item.loop).length <= EXPECTED_LOOP_RATES.length,
    ) && loopsVisible.length === EXPECTED_LOOP_RATES.length,
    loopRatesApplied: loopsAfterGesture.every((item, index) => (
      closeTo(item.playbackRate, EXPECTED_LOOP_RATES[index], 0.0001)
    )),
    noMediaPlayRejects: stages.afterBark.media.every((item) => item.playRejects === 0),
  };
  const expectedNetworkFailures = networkFailures.filter(
    (item) => /^404 .*\/api\/lobbies$/.test(item),
  );
  const unexpectedNetworkFailures = networkFailures.filter(
    (item) => !expectedNetworkFailures.includes(item),
  );
  const receipt = {
    tool: 'tools/audio-lifecycle-probe.mjs',
    server: 'production-preview',
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    capturedAt: new Date().toISOString(),
    seed: SEED,
    backend: 'production-auto',
    checks,
    stages: Object.fromEntries(Object.entries(stages).map(([name, stage]) => [name, {
      contexts: stage.contexts.map((item) => ({
        ...item,
        panners: item.panners.length,
      })),
      loops: loopShape(stage),
    }])),
    pageOrAudioErrors: errors,
    expectedNetworkFailures,
    unexpectedNetworkFailures,
    focusedUnitCoverage: 'tests/audio-graph.spec.ts and tests/audio-lifecycle.spec.ts',
    pass: Object.values(checks).every(Boolean)
      && errors.length === 0
      && unexpectedNetworkFailures.length === 0,
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.pass) process.exitCode = 1;
} catch (error) {
  failure = String(error?.stack ?? error);
  const receipt = {
    tool: 'tools/audio-lifecycle-probe.mjs',
    server: 'production-preview',
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    capturedAt: new Date().toISOString(),
    seed: SEED,
    pass: false,
    failure,
    pageOrAudioErrors: errors,
    networkFailures,
    stages,
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.error(failure);
  process.exitCode = 1;
} finally {
  if (page) await page.close().catch(() => {});
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  stopServer(server);
  removeDir(profile);
}
