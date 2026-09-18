// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { AUDIO_ASSET_BY_ID } from './assets';
import type { AudioAssetId, AudioBus, AudioCommand, SpatialPoint } from './types';
import { AUDIO_BUSES } from './types';
import type { AudioLoopId } from './types';
import { OneShotVoicePool } from './oneShotVoices';
import { SoundscapeLoops } from './soundscape';

const AMBIENT_DUCK_GAIN = 10 ** (-2.5 / 20);

/**
 * One-shot reference distance, m, for each rig the listener can be sitting on.
 *
 * The listener is the camera, so a rig change is a mix change - but only for
 * the rig that moved. Classic did not move: its eye stands 53.24 m from a
 * source at the dog, exactly where it was when the mix was approved, so 18 m is
 * still its reference. The Follow eye went from 21.05 m to 29.10 m in
 * landscape, which costs a source at the dog 2.14 dB at 18 m. Inverse distance
 * is scale-free, so 24.88 m puts it back; 24.9 holds landscape to 0.005 dB and
 * portrait, whose eye went 25.83 -> 36.48 m, to -0.14 dB.
 *
 * One constant serving both rigs is what the round before this shipped, and it
 * made every diegetic source 2.30 to 2.68 dB LOUDER in Classic, 2.41 at the
 * dog, in the mode the game loads in. Interpolating on the live rig weight is
 * what holds both. Aiming the fit at the near field is deliberate: running the
 * scheduler's own selection rule over clustered flocks, 98.4% of chosen baas
 * fall inside the 34 m agitation radius, and weighting the one-shot classes by
 * their cadences and command gains puts about three quarters of the flow at the
 * dog itself.
 *
 * It is a near-field fit and not a listener move, and only a listener move is
 * exact. In Follow, sources past 34 m from the dog come out up to 3.06 dB
 * louder than they were, 3.32 dB in portrait, which is roughly 7% of the flow
 * under that same weighting. A second fitted parameter narrows it - 25.8 m at
 * rolloff 0.92 halves the field-wide mean, 2.35 dB to 1.11 dB - but moves the
 * weighted residual only from 0.33 to 0.12 dB in landscape while taking
 * portrait from 0.37 to 0.39 dB, so one constant per rig is what is kept.
 */
const CLASSIC_REF_DISTANCE = 18;
const FOLLOW_REF_DISTANCE = 24.9;

/**
 * The maxima, on the same pair. The inverse model's gain does not read
 * maxDistance - only the linear model does - so these are kept in step with the
 * references rather than being any part of the fit above.
 */
const CLASSIC_MAX_DISTANCE = 180;
const FOLLOW_MAX_DISTANCE = 249;

export interface AudioGraphOptions {
  readonly context?: AudioContext;
  readonly fetchAsset?: (url: string) => Promise<ArrayBuffer>;
  /** Test seam and main-thread pacing between browser decode jobs. */
  readonly decodeYield?: () => Promise<void>;
  /** Test seam for browser-managed ambience loop elements. */
  readonly createLoopElement?: (url: string) => HTMLAudioElement;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class HerdAudioGraph {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly buses = new Map<AudioBus, GainNode>();
  private readonly busLevels = new Map<AudioBus, number>();
  private readonly oneShots: OneShotVoicePool;
  private readonly soundscape: SoundscapeLoops;
  private muted = false;
  private masterLevel = 0.8;
  private reduceTransients = false;
  /** Where the camera stands between its two rigs: 0 Classic, 1 Follow. */
  private cameraBlend = 0;
  private disposed = false;

  constructor(options: AudioGraphOptions = {}) {
    this.context = options.context ?? new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.masterLevel;
    this.master.connect(this.context.destination);
    for (const bus of AUDIO_BUSES) {
      const node = this.context.createGain();
      const level = bus === 'ambient' ? 0.34 : bus === 'ui' ? 0.62 : 0.72;
      node.gain.value = level;
      node.connect(this.master);
      this.buses.set(bus, node);
      this.busLevels.set(bus, level);
    }
    this.soundscape = new SoundscapeLoops(
      this.context,
      (id) => AUDIO_ASSET_BY_ID.get(id)!.url,
      (id) => this.buses.get(AUDIO_ASSET_BY_ID.get(id)!.bus)!,
      options.createLoopElement ?? ((url) => {
        const element = document.createElement('audio');
        element.src = url;
        return element;
      }),
    );
    this.oneShots = new OneShotVoicePool({
      context: this.context,
      fetchAsset: options.fetchAsset ?? (async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Audio fetch failed (${response.status}): ${url}`);
        return response.arrayBuffer();
      }),
      decodeYield: options.decodeYield
        ?? (() => new Promise((resolve) => setTimeout(resolve, 0))),
      getBus: (bus) => this.buses.get(bus)!,
      makePanner: (point) => this.makePanner(point),
      duckAmbient: () => this.duckAmbient(),
    });
  }

  preload(): Promise<void> {
    return this.oneShots.preload();
  }

  async unlock(): Promise<void> {
    if (this.disposed) return;
    // Call play while still inside the accepted gesture. The media elements
    // route through this graph, but mobile autoplay policy can still require
    // the element's own play request to originate from the gesture.
    this.soundscape.start();
    if (this.context.state !== 'running') await this.context.resume();
  }

  async suspend(): Promise<void> {
    if (this.disposed) return;
    this.soundscape.pause();
    if (this.context.state === 'running') await this.context.suspend();
  }

  async resume(): Promise<void> {
    if (this.disposed) return;
    if (this.context.state !== 'running') await this.context.resume();
    this.soundscape.start();
  }

  setMasterGain(level: number): void {
    this.masterLevel = clamp01(level);
    this.master.gain.setValueAtTime(this.muted ? 0 : this.masterLevel, this.context.currentTime);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.master.gain.setValueAtTime(muted ? 0 : this.masterLevel, this.context.currentTime);
  }

  setBusGain(bus: AudioBus, level: number): void {
    const value = clamp01(level);
    this.busLevels.set(bus, value);
    const gain = this.buses.get(bus)!.gain;
    const now = this.context.currentTime;
    // A settings change supersedes any pending duck recovery to the old level.
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(value, now);
  }

  setReduceTransients(reduce: boolean): void {
    this.reduceTransients = reduce;
    this.oneShots.setReduceTransients(reduce);
  }

  /**
   * Which rig the listener is on, 0 Classic to 1 Follow, from the camera's own
   * published blend. Panners built after this read it; the pant loop is already
   * playing, so the soundscape retunes its one live panner instead.
   */
  setCameraBlend(weight: number): void {
    const value = clamp01(weight);
    if (value === this.cameraBlend) return;
    this.cameraBlend = value;
    this.soundscape.setCameraBlend(value);
  }

  setListener(
    x: number,
    z: number,
    y = 3,
    forwardX = 0,
    forwardY = 0,
    forwardZ = -1,
    upX = 0,
    upY = 1,
    upZ = 0,
  ): void {
    const listener = this.context.listener;
    const now = this.context.currentTime;
    listener.positionX.setValueAtTime(x, now);
    listener.positionY.setValueAtTime(y, now);
    listener.positionZ.setValueAtTime(z, now);
    listener.forwardX.setValueAtTime(forwardX, now);
    listener.forwardY.setValueAtTime(forwardY, now);
    listener.forwardZ.setValueAtTime(forwardZ, now);
    listener.upX.setValueAtTime(upX, now);
    listener.upY.setValueAtTime(upY, now);
    listener.upZ.setValueAtTime(upZ, now);
  }

  startSoundscape(): boolean {
    return !this.disposed && this.soundscape.start();
  }

  setLoopLevel(id: AudioLoopId, level: number, x?: number, z?: number): void {
    if (!this.disposed) {
      this.soundscape.set(id, level, x, z);
    }
  }

  execute(command: AudioCommand): boolean {
    const played = command.kind === 'asset'
      ? this.oneShots.execute(command)
      : this.playTone(command);
    return played;
  }

  private playTone(command: Extract<AudioCommand, { kind: 'tone' }>): boolean {
    if (this.disposed) return false;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = this.context.currentTime + (command.delaySeconds ?? 0);
    const softened = this.reduceTransients && command.transient === true;
    const peak = clamp01(command.gain) * (softened ? 0.68 : 1);
    const attack = softened ? 0.075 : 0.018;
    oscillator.type = command.bus === 'ui' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(command.frequencyHz, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + command.durationSeconds);
    oscillator.connect(gain);
    if (command.point !== undefined) {
      const panner = this.makePanner(command.point);
      gain.connect(panner);
      panner.connect(this.buses.get(command.bus)!);
    } else {
      gain.connect(this.buses.get(command.bus)!);
    }
    oscillator.start(start);
    oscillator.stop(start + command.durationSeconds + 0.02);
    return true;
  }

  /**
   * Inverse-distance attenuation against the rig the listener is on right now.
   * A one-shot is short, so it keeps the reference it was built with rather
   * than tracking a swap it cannot outlive.
   */
  private makePanner(point: SpatialPoint): PannerNode {
    const panner = this.context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = CLASSIC_REF_DISTANCE
      + (FOLLOW_REF_DISTANCE - CLASSIC_REF_DISTANCE) * this.cameraBlend;
    panner.maxDistance = CLASSIC_MAX_DISTANCE
      + (FOLLOW_MAX_DISTANCE - CLASSIC_MAX_DISTANCE) * this.cameraBlend;
    panner.rolloffFactor = 0.7;
    panner.positionX.setValueAtTime(point.x, this.context.currentTime);
    panner.positionY.setValueAtTime(1, this.context.currentTime);
    panner.positionZ.setValueAtTime(point.z, this.context.currentTime);
    return panner;
  }

  private duckAmbient(): void {
    const ambient = this.buses.get('ambient')!;
    const base = this.busLevels.get('ambient')!;
    const now = this.context.currentTime;
    ambient.gain.cancelScheduledValues(now);
    ambient.gain.setValueAtTime(base, now);
    ambient.gain.linearRampToValueAtTime(base * AMBIENT_DUCK_GAIN, now + 0.045);
    ambient.gain.linearRampToValueAtTime(base, now + 0.34);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.oneShots.dispose();
    this.soundscape.stop();
    for (const node of this.buses.values()) node.disconnect();
    this.master.disconnect();
    if (this.context.state !== 'closed') await this.context.close();
  }
}

export function assetDefinition(id: AudioAssetId) {
  return AUDIO_ASSET_BY_ID.get(id);
}
