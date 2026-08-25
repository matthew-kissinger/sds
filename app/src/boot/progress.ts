// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

export type BootStep =
  | 'renderer'
  | 'terrain'
  | 'grass'
  | 'treeline'
  | 'scatter'
  | 'capability'
  | 'scene'
  | 'shaders'
  | 'presented';

export type BootProgress = Readonly<Record<BootStep, number>>;

export const EMPTY_BOOT_PROGRESS: BootProgress = Object.freeze({
  renderer: 0,
  terrain: 0,
  grass: 0,
  treeline: 0,
  scatter: 0,
  capability: 0,
  scene: 0,
  shaders: 0,
  presented: 0,
});

/**
 * Work weights are tied to the shipping boot path. Asset shares roughly match
 * their committed byte sizes; renderer setup and shader compilation retain
 * explicit shares because they dominate readiness after downloads complete.
 */
const BOOT_WEIGHTS: Readonly<Record<BootStep, number>> = Object.freeze({
  renderer: 0.2,
  terrain: 0.03,
  grass: 0.18,
  treeline: 0.1,
  scatter: 0.04,
  capability: 0.1,
  scene: 0.05,
  shaders: 0.27,
  presented: 0.03,
});

const LABELS: Readonly<Record<BootStep, string>> = Object.freeze({
  renderer: 'Starting graphics',
  terrain: 'Shaping the field',
  grass: 'Loading grass',
  treeline: 'Planting the treeline',
  scatter: 'Dressing the meadow',
  capability: 'Checking graphics',
  scene: 'Building the field',
  shaders: 'Preparing cel shading',
  presented: 'Drawing the first frame',
});

const ASSET_STEPS: readonly BootStep[] = ['terrain', 'grass', 'treeline', 'scatter'];

export function clampBootProgress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function bootPercent(progress: BootProgress): number {
  const weighted = (Object.keys(BOOT_WEIGHTS) as BootStep[]).reduce(
    (sum, step) => sum + BOOT_WEIGHTS[step] * clampBootProgress(progress[step]),
    0,
  );
  return Math.min(100, Math.floor(weighted * 100));
}

export function bootStatus(progress: BootProgress): string {
  if (progress.renderer < 1) return LABELS.renderer;

  const asset = ASSET_STEPS
    .filter((step) => progress[step] < 1)
    .sort((a, b) => (
      BOOT_WEIGHTS[b] * (1 - progress[b]) - BOOT_WEIGHTS[a] * (1 - progress[a])
    ))[0];
  if (asset !== undefined) return LABELS[asset];
  if (progress.capability < 1) return LABELS.capability;
  if (progress.scene < 1) return LABELS.scene;
  if (progress.shaders < 1) return LABELS.shaders;
  return LABELS.presented;
}
