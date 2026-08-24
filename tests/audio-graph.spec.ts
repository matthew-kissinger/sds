// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { HerdAudioGraph } from '@app/audio/graph';
import { AUDIO_ASSETS } from '@app/audio/assets';
import { LOOP_PLAYBACK_RATES } from '@app/audio/soundscape';
import { AUDIO_LOOP_IDS } from '@app/audio/types';

class FakeParam {
  value = 0;
  setValueAtTime(value: number) { this.value = value; }
  cancelScheduledValues() {}
  linearRampToValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
  setTargetAtTime(value: number) { this.value = value; }
}

class FakeNode {
  connect() { return this; }
  disconnect() {}
}

class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakePanner extends FakeNode {
  panningModel = '';
  distanceModel = '';
  refDistance = 0;
  maxDistance = 0;
  rolloffFactor = 0;
  positionX = new FakeParam();
  positionY = new FakeParam();
  positionZ = new FakeParam();
}
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  playbackRate = new FakeParam();
  onended: (() => void) | null = null;
  started = false;
  start() { this.started = true; }
  stop() { this.onended?.(); }
}
class FakeOscillator extends FakeNode {
  type = '';
  frequency = new FakeParam();
  start() {}
  stop() {}
}

class FakeMediaElement {
  src = '';
  loop = false;
  preload = '';
  playsInline = false;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  load() { this.playbackRate = this.defaultPlaybackRate; }
  async play() { this.playCalls += 1; this.paused = false; }
  pause() { this.pauseCalls += 1; this.paused = true; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
}

class FakeContext {
  currentTime = 2;
  state: AudioContextState = 'suspended';
  destination = new FakeNode();
  closeCalls = 0;
  gains: FakeGain[] = [];
  panners: FakePanner[] = [];
  listener = {
    positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam(),
    forwardX: new FakeParam(), forwardY: new FakeParam(), forwardZ: new FakeParam(),
    upX: new FakeParam(), upY: new FakeParam(), upZ: new FakeParam(),
  };
  sources: FakeSource[] = [];
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createPanner() {
    const panner = new FakePanner();
    this.panners.push(panner);
    return panner;
  }
  createOscillator() { return new FakeOscillator(); }
  createMediaElementSource() { return new FakeNode(); }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  async decodeAudioData() { return {} as AudioBuffer; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.closeCalls += 1; this.state = 'closed'; }
}

describe('Web Audio graph', () => {
  it('preloads once, starts one ambience loop, and enforces six flock voices', async () => {
    const context = new FakeContext();
    let fetches = 0;
    const loopElements: FakeMediaElement[] = [];
    const graph = new HerdAudioGraph({
      context: context as unknown as AudioContext,
      fetchAsset: async () => { fetches += 1; return new ArrayBuffer(1); },
      createLoopElement: (url) => {
        const element = new FakeMediaElement();
        element.src = url;
        loopElements.push(element);
        return element as unknown as HTMLAudioElement;
      },
    });
    await Promise.all([graph.preload(), graph.preload()]);
    expect(fetches).toBe(AUDIO_ASSETS.filter((asset) => !asset.loop).length);
    expect(loopElements).toHaveLength(0);
    await graph.unlock();
    expect(loopElements).toHaveLength(AUDIO_ASSETS.filter((asset) => asset.loop).length);
    expect(loopElements.every((element) => element.playCalls === 1 && !element.paused)).toBe(true);
    expect(loopElements.map((element) => element.playbackRate)).toEqual(
      AUDIO_LOOP_IDS.map((id) => LOOP_PLAYBACK_RATES[id]),
    );
    expect(graph.startSoundscape()).toBe(false);
    graph.setLoopLevel('birds-loop', 0.14);
    graph.setLoopLevel('pant-loop', 0.1, 2, 3);

    const results = Array.from({ length: 7 }, () => graph.execute({
      kind: 'asset', assetId: 'baa-01', bus: 'flock', gain: 0.2,
      point: { x: 1, z: 2 },
    }));
    expect(results).toEqual([true, true, true, true, true, true, false]);
    await graph.dispose();
    expect(context.state).toBe('closed');
  });

  it('supports gesture unlock, pause, listener placement, and synthesized tones', async () => {
    const context = new FakeContext();
    const loopElements: FakeMediaElement[] = [];
    const graph = new HerdAudioGraph({
      context: context as unknown as AudioContext,
      fetchAsset: async () => new ArrayBuffer(1),
      createLoopElement: (url) => {
        const element = Object.assign(new FakeMediaElement(), { src: url });
        loopElements.push(element);
        return element as unknown as HTMLAudioElement;
      },
    });
    await graph.unlock();
    expect(context.state).toBe('running');
    expect(loopElements.every((element) => element.playCalls === 1 && !element.paused)).toBe(true);
    graph.setListener(12, -4, 3, 1, 0, 0, 0, 1, 0);
    expect(context.listener.positionX.value).toBe(12);
    expect(context.listener.positionZ.value).toBe(-4);
    expect(context.listener.forwardX.value).toBe(1);
    expect(context.listener.forwardZ.value).toBe(0);
    expect(context.listener.upY.value).toBe(1);
    graph.setReduceTransients(true);
    expect(graph.execute({
      kind: 'tone', bus: 'ui', frequencyHz: 220,
      gain: 0.05, durationSeconds: 0.2, transient: true,
    })).toBe(true);
    await graph.suspend();
    expect(context.state).toBe('suspended');
    expect(loopElements.every((element) => element.pauseCalls === 1 && element.paused)).toBe(true);
    await graph.resume();
    expect(context.state).toBe('running');
    expect(loopElements).toHaveLength(AUDIO_ASSETS.filter((asset) => asset.loop).length);
    expect(loopElements.every((element) => element.playCalls === 2 && !element.paused)).toBe(true);
    await graph.resume();
    expect(loopElements.every((element) => element.playCalls === 2)).toBe(true);
    await graph.dispose();
  });

  it('applies mute and bus levels, positions events, and disposes exactly once', async () => {
    const context = new FakeContext();
    const loopElements: FakeMediaElement[] = [];
    const graph = new HerdAudioGraph({
      context: context as unknown as AudioContext,
      fetchAsset: async () => new ArrayBuffer(1),
      decodeYield: async () => undefined,
      createLoopElement: (url) => {
        const element = Object.assign(new FakeMediaElement(), { src: url });
        loopElements.push(element);
        return element as unknown as HTMLAudioElement;
      },
    });

    await graph.preload();
    await graph.unlock();
    graph.setMasterGain(0.65);
    graph.setMuted(true);
    expect(context.gains[0]?.gain.value).toBe(0);
    graph.setMuted(false);
    expect(context.gains[0]?.gain.value).toBe(0.65);
    graph.setBusGain('ambient', 0.21);
    graph.setBusGain('dog', 0.27);
    expect(context.gains[1]?.gain.value).toBe(0.21);
    expect(context.gains[3]?.gain.value).toBe(0.27);

    const pannersBefore = context.panners.length;
    expect(graph.execute({
      kind: 'asset', assetId: 'bark-01', bus: 'dog', gain: 0.72,
      point: { x: 11, z: -7 }, transient: true,
    })).toBe(true);
    expect(context.panners).toHaveLength(pannersBefore + 1);
    expect(context.panners.at(-1)?.positionX.value).toBe(11);
    expect(context.panners.at(-1)?.positionZ.value).toBe(-7);

    await graph.dispose();
    await graph.dispose();
    expect(context.closeCalls).toBe(1);
    expect(loopElements).toHaveLength(AUDIO_ASSETS.filter((asset) => asset.loop).length);
    expect(loopElements.every((element) => element.paused && element.src === '')).toBe(true);
  });

  it('queues an immediate bark and footfall until cold-start decode completes', async () => {
    const context = new FakeContext();
    let releaseFirstDecode: () => void = () => {};
    const firstDecode = new Promise<void>((resolve) => { releaseFirstDecode = resolve; });
    let decodeIndex = 0;
    context.decodeAudioData = async () => {
      if (decodeIndex === 0) await firstDecode;
      decodeIndex += 1;
      return {} as AudioBuffer;
    };
    const graph = new HerdAudioGraph({
      context: context as unknown as AudioContext,
      fetchAsset: async () => new ArrayBuffer(1),
      decodeYield: async () => undefined,
      createLoopElement: (url) => Object.assign(
        new FakeMediaElement(),
        { src: url },
      ) as unknown as HTMLAudioElement,
    });

    const preload = graph.preload();
    expect(graph.execute({
      kind: 'asset', assetId: 'bark-01', bus: 'dog', gain: 0.72,
      point: { x: 3, z: 4 }, transient: true,
    })).toBe(true);
    expect(graph.execute({
      kind: 'asset', assetId: 'footfall-01', bus: 'dog', gain: 0.08,
      point: { x: 3, z: 4 }, transient: true,
    })).toBe(true);
    expect(context.sources).toHaveLength(0);

    releaseFirstDecode();
    await preload;

    expect(context.sources).toHaveLength(2);
    expect(context.sources.every((source) => source.started)).toBe(true);
    await graph.dispose();
  });

  it('paces decode jobs instead of scheduling the whole asset set together', async () => {
    const context = new FakeContext();
    let activeDecodes = 0;
    let maxActiveDecodes = 0;
    let yields = 0;
    context.decodeAudioData = async () => {
      activeDecodes += 1;
      maxActiveDecodes = Math.max(maxActiveDecodes, activeDecodes);
      await Promise.resolve();
      activeDecodes -= 1;
      return {} as AudioBuffer;
    };
    const graph = new HerdAudioGraph({
      context: context as unknown as AudioContext,
      fetchAsset: async () => new ArrayBuffer(1),
      decodeYield: async () => { yields += 1; },
      createLoopElement: (url) => Object.assign(new FakeMediaElement(), { src: url }) as unknown as HTMLAudioElement,
    });

    await graph.preload();

    expect(maxActiveDecodes).toBe(1);
    const decodedCount = AUDIO_ASSETS.filter((asset) => !asset.loop).length;
    expect(yields).toBe(decodedCount - 1);
    await graph.dispose();
  });
});
