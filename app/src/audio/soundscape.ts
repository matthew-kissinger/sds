// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import type { AudioAssetId, AudioLoopId } from './types';
import { AUDIO_LOOP_IDS } from './types';

interface LoopVoice {
  readonly element: HTMLAudioElement;
  readonly source: MediaElementAudioSourceNode;
  readonly gain: GainNode;
  readonly panner: PannerNode | null;
  level: number;
  x: number;
  z: number;
}

const SPATIAL_LOOPS = new Set<AudioLoopId>([
  'crowd-loop',
  'farmhouse-chime-loop',
  'pant-loop',
]);

/** Slightly different rates keep the layer seams from lining up. */
export const LOOP_PLAYBACK_RATES: Readonly<Record<AudioLoopId, number>> = {
  'birds-loop': 1.011,
  'leaves-loop': 0.983,
  'crowd-loop': 0.991,
  'farmhouse-chime-loop': 1.007,
  'pant-loop': 0.976,
};

/**
 * Owns the independently mixed continuous layers. Voices are started once at
 * zero gain after unlock, then state changes only touch AudioParams. That keeps
 * pause/resume and restarts free of stacked HTMLMediaElement loops.
 */
export class SoundscapeLoops {
  private readonly voices = new Map<AudioLoopId, LoopVoice>();

  constructor(
    private readonly context: AudioContext,
    private readonly getUrl: (id: AudioAssetId) => string,
    private readonly getBus: (id: AudioLoopId) => AudioNode,
    private readonly createElement: (url: string) => HTMLAudioElement,
  ) {}

  /** Begin browser-managed streaming/decoding without starting playback. */
  prepare(): void {
    if (this.voices.size > 0) return;
    for (const id of AUDIO_LOOP_IDS) {
      const element = this.createElement(this.getUrl(id));
      element.loop = true;
      element.preload = 'auto';
      // Chromium resets playbackRate to defaultPlaybackRate when load() runs.
      // Set the authored rate as the media default so the loop periods do
      // not silently collapse back to synchronized 1x playback in production.
      element.defaultPlaybackRate = LOOP_PLAYBACK_RATES[id];
      const source = this.context.createMediaElementSource(element);
      const gain = this.context.createGain();
      const panner = SPATIAL_LOOPS.has(id) ? this.makePanner() : null;
      gain.gain.value = 0;
      source.connect(gain);
      if (panner === null) gain.connect(this.getBus(id));
      else {
        gain.connect(panner);
        panner.connect(this.getBus(id));
      }
      element.load();
      element.playbackRate = LOOP_PLAYBACK_RATES[id];
      this.voices.set(id, { element, source, gain, panner, level: 0, x: 0, z: 0 });
    }
  }

  start(): boolean {
    this.prepare();
    let attempted = false;
    for (const voice of this.voices.values()) {
      if (!voice.element.paused) continue;
      attempted = true;
      void voice.element.play().catch(() => {
        // The next accepted gesture calls start again. Playback policy is not
        // a graph failure and must not take down the field.
      });
    }
    return attempted;
  }

  /** Pause in place so resume reuses the same elements, sources and offsets. */
  pause(): void {
    for (const voice of this.voices.values()) voice.element.pause();
  }

  set(id: AudioLoopId, level: number, x?: number, z?: number): void {
    const voice = this.voices.get(id);
    if (voice === undefined) return;
    const now = this.context.currentTime;
    const target = Math.max(0, Math.min(1, level));
    if (Math.abs(target - voice.level) > 0.002) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(target, now, 0.18);
      voice.level = target;
    }
    if (x !== undefined && z !== undefined && voice.panner !== null) {
      if (Math.abs(x - voice.x) > 0.01) {
        voice.panner.positionX.setValueAtTime(x, now);
        voice.x = x;
      }
      if (Math.abs(z - voice.z) > 0.01) {
        voice.panner.positionZ.setValueAtTime(z, now);
        voice.z = z;
      }
    }
  }

  stop(): void {
    for (const voice of this.voices.values()) {
      voice.element.pause();
      voice.element.removeAttribute('src');
      voice.element.load();
      voice.source.disconnect();
      voice.gain.disconnect();
      voice.panner?.disconnect();
    }
    this.voices.clear();
  }

  private makePanner(): PannerNode {
    const panner = this.context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 20;
    panner.maxDistance = 190;
    panner.rolloffFactor = 0.65;
    panner.positionY.value = 1;
    return panner;
  }
}
