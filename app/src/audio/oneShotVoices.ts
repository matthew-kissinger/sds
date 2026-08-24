// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { AUDIO_ASSETS } from './assets';
import type { AudioAssetId, AudioBus, AudioCommand, SpatialPoint } from './types';
import { AUDIO_LOOP_IDS } from './types';

const MAX_FLOCK_VOICES = 6;
const MAX_PENDING_ASSET_COMMANDS = 32;

const COLD_START_DECODE_ORDER: readonly AudioAssetId[] = [
  'bark-01',
  'footfall-01',
  'bark-02',
  'footfall-02',
  'bark-03',
];

type AssetCommand = Extract<AudioCommand, { readonly kind: 'asset' }>;

interface OneShotVoicePoolOptions {
  readonly context: AudioContext;
  readonly fetchAsset: (url: string) => Promise<ArrayBuffer>;
  readonly decodeYield: () => Promise<void>;
  readonly getBus: (bus: AudioBus) => AudioNode;
  readonly makePanner: (point: SpatialPoint) => PannerNode;
  readonly duckAmbient: () => void;
}

/**
 * Owns decoded one-shots, their bounded cold queue, and active voice limits.
 * Continuous ambience remains in SoundscapeLoops because browser-managed
 * media lifecycle and decoded AudioBuffer voices have different constraints.
 */
export class OneShotVoicePool {
  private readonly buffers = new Map<AudioAssetId, AudioBuffer>();
  private readonly pendingCommands: AssetCommand[] = [];
  private readonly activeSources = new Set<AudioBufferSourceNode>();
  private readonly flockSources = new Set<AudioBufferSourceNode>();
  private preloadPromise: Promise<void> | null = null;
  private reduceTransients = false;
  private disposed = false;

  constructor(private readonly options: OneShotVoicePoolOptions) {}

  preload(): Promise<void> {
    if (this.preloadPromise !== null) return this.preloadPromise;
    // Only short one-shots belong to cold preload. Long loops are streamed
    // after gesture unlock so they do not contend with visual boot assets.
    const loopIds = new Set<AudioAssetId>(AUDIO_LOOP_IDS);
    const decodedAssets = AUDIO_ASSETS.filter((asset) => !loopIds.has(asset.id));
    const priority = new Map(COLD_START_DECODE_ORDER.map((id, index) => [id, index]));
    decodedAssets.sort((left, right) => (
      (priority.get(left.id) ?? COLD_START_DECODE_ORDER.length)
      - (priority.get(right.id) ?? COLD_START_DECODE_ORDER.length)
    ));
    this.preloadPromise = (async () => {
      // Decode serially in gameplay priority order. The queue preserves an
      // immediate command whose asset has not finished decoding yet.
      for (let index = 0; index < decodedAssets.length; index++) {
        const asset = decodedAssets[index]!;
        const encoded = await this.options.fetchAsset(asset.url);
        const decoded = await this.options.context.decodeAudioData(encoded);
        this.buffers.set(asset.id, decoded);
        this.flush(asset.id);
        if (index + 1 < decodedAssets.length) await this.options.decodeYield();
      }
    })().catch((error: unknown) => {
      this.pendingCommands.length = 0;
      throw error;
    });
    return this.preloadPromise;
  }

  setReduceTransients(reduce: boolean): void {
    this.reduceTransients = reduce;
  }

  execute(command: AssetCommand): boolean {
    if (this.disposed) return false;
    if (this.buffers.has(command.assetId)) return this.play(command);
    if (this.pendingCommands.length >= MAX_PENDING_ASSET_COMMANDS) return false;
    // Presentation points are mutable, so preserve the authored event location
    // while its asset finishes decoding.
    this.pendingCommands.push({
      ...command,
      point: command.point === undefined ? undefined : { ...command.point },
    });
    if (this.preloadPromise === null) void this.preload().catch(() => undefined);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* Source may already have ended. */ }
      source.disconnect();
    }
    this.activeSources.clear();
    this.flockSources.clear();
    this.pendingCommands.length = 0;
  }

  private flush(id: AudioAssetId): void {
    for (let index = 0; index < this.pendingCommands.length;) {
      const command = this.pendingCommands[index]!;
      if (command.assetId !== id) {
        index += 1;
        continue;
      }
      this.pendingCommands.splice(index, 1);
      this.play(command);
    }
  }

  private play(command: AssetCommand): boolean {
    const buffer = this.buffers.get(command.assetId);
    if (buffer === undefined || this.disposed) return false;
    if (command.bus === 'flock' && this.flockSources.size >= MAX_FLOCK_VOICES) return false;
    const source = this.options.context.createBufferSource();
    const gain = this.options.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = command.playbackRate ?? 1;
    gain.gain.value = clamp01(command.gain)
      * (this.reduceTransients && command.transient === true ? 0.68 : 1);
    source.connect(gain);
    if (command.point !== undefined) {
      const panner = this.options.makePanner(command.point);
      gain.connect(panner);
      panner.connect(this.options.getBus(command.bus));
    } else {
      gain.connect(this.options.getBus(command.bus));
    }
    this.activeSources.add(source);
    if (command.bus === 'flock') this.flockSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      this.flockSources.delete(source);
    };
    source.start(this.options.context.currentTime + Math.max(0, command.delaySeconds ?? 0));
    if (command.duckAmbient === true) this.options.duckAmbient();
    return true;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
