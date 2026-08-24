// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

export const AUDIO_BUSES = ['ambient', 'flock', 'dog', 'world', 'ui'] as const;
export type AudioBus = (typeof AUDIO_BUSES)[number];

export const AUDIO_ASSET_IDS = [
  'birds-loop',
  'leaves-loop',
  'crowd-loop',
  'farmhouse-chime-loop',
  'pant-loop',
  'baa-01',
  'baa-02',
  'baa-03',
  'bellwether',
  'bark-01',
  'bark-02',
  'bark-03',
  'footfall-01',
  'footfall-02',
  'huff',
  'gate-creak',
  'fence-knock',
] as const;
export type AudioAssetId = (typeof AUDIO_ASSET_IDS)[number];

export const AUDIO_LOOP_IDS = [
  'birds-loop',
  'leaves-loop',
  'crowd-loop',
  'farmhouse-chime-loop',
  'pant-loop',
] as const satisfies readonly AudioAssetId[];
export type AudioLoopId = (typeof AUDIO_LOOP_IDS)[number];

export interface AudioAssetDefinition {
  readonly id: AudioAssetId;
  readonly bus: AudioBus;
  readonly loop: boolean;
  readonly byteSize: number;
  readonly sha256: string;
  readonly durationSeconds: number;
  readonly url: string;
}

export interface SpatialPoint {
  readonly x: number;
  readonly z: number;
}

export interface AssetAudioCommand {
  readonly kind: 'asset';
  readonly assetId: AudioAssetId;
  readonly bus: AudioBus;
  readonly gain: number;
  readonly playbackRate?: number;
  readonly delaySeconds?: number;
  readonly point?: SpatialPoint;
  readonly duckAmbient?: boolean;
  readonly transient?: boolean;
}

export interface ToneAudioCommand {
  readonly kind: 'tone';
  readonly bus: 'world' | 'ui';
  readonly frequencyHz: number;
  readonly gain: number;
  readonly durationSeconds: number;
  readonly delaySeconds?: number;
  readonly point?: SpatialPoint;
  readonly transient?: boolean;
}

export type AudioCommand = AssetAudioCommand | ToneAudioCommand;
