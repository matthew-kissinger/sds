// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The whole scene, in one place, in draw order. The frame loop is started here
 * and nowhere else: `useGameLoop` subscribes at a negative render priority, so
 * the sim has stepped before Flock, Dog and the camera rig read from it.
 *
 * There is one scene and one start path (spec/01). Title, play and completion
 * are the same field with a different overlay; nothing here branches on phase.
 */

import { useGameLoop } from '@app/game/useGameLoop';
import { Atmosphere } from './Atmosphere';
import { Dog } from './Dog';
import { GateGuidance } from './GateGuidance';
import { Farmhouse } from './Farmhouse';
import { Farmer } from './Farmer';
import { FenceLine } from './FenceLine';
import { Flock } from './Flock';
import { GrassField } from './GrassField';
import { Pen } from './Pen';
import { Scatter } from './Scatter';
import { Terrain } from './Terrain';
import { Treeline } from './Treeline';
import { SheepHoverLabel } from './SheepHoverLabel';
import { loadHeightfield } from '@app/world/heightfield';
import { loadTufts } from './grass/tuftData';
import { loadTreelineManifest } from './treeline/manifest';
import { loadScatterManifest } from './scatter/manifest';
import type { BootStep } from '@app/boot/progress';

type BootReporter = (step: BootStep, fraction: number) => void;

/**
 * Start every cold field dependency without mounting the GPU scene. App calls
 * this while the configured renderer runs its small capability probe, so the
 * network work and renderer setup overlap without putting the full field in
 * front of the probe's timestamp readback.
 */
export function preloadFieldSceneAssets(report?: BootReporter): void {
  void loadHeightfield((value) => report?.('terrain', value));
  void loadTufts((value) => report?.('grass', value));
  void loadTreelineManifest((value) => report?.('treeline', value));
  void loadScatterManifest((value) => report?.('scatter', value));
}

/**
 * Mount-point contract (phase 3 fan-out): every asset system lives entirely in
 * its own component file above; builder agents edit ONLY their own file and its
 * tsl/asset modules, never this one. This file changes only when the set of
 * systems changes.
 */
export function FieldScene() {
  // Start every cold field dependency before any child reaches `use()` and
  // suspends. The one outer Suspense boundary stays honest, but the network no
  // longer waterfalls heightfield -> grass -> treeline -> scatter.
  preloadFieldSceneAssets();
  useGameLoop();

  return (
    <>
      <Atmosphere />
      <Terrain />
      <GrassField />
      <FenceLine />
      <Pen />
      <Farmhouse />
      <Farmer />
      <Treeline />
      <Scatter />
      <Flock />
      <Dog />
      <GateGuidance />
      <SheepHoverLabel />
    </>
  );
}
