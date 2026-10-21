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

import { useGameStore } from '@app/state/store';
import { useGameLoop } from '@app/game/useGameLoop';
import { Atmosphere } from './Atmosphere';
import { PlayerLabels } from './PlayerLabels';
import { Dog } from './Dog';
import { GateGuidance } from './GateGuidance';
import { Farmhouse, preloadFarmhouse } from './Farmhouse';
import { Farmer } from './Farmer';
import { FenceLine, preloadFence } from './FenceLine';
import { Flock } from './Flock';
import { GrassField } from './GrassField';
import { CompetitivePens } from './CompetitivePens';
import { Pen } from './Pen';
import { Scatter } from './Scatter';
import { Terrain } from './Terrain';
import { Treeline, preloadTreeline } from './Treeline';
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
  preloadFarmhouse();
  preloadTreeline();
  preloadFence();
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
  const sim = useGameStore(state => state.sim);

  return (
    <>
      <Atmosphere />
      <Terrain />
      <GrassField />
      <FenceLine />
      {sim.state.field.competition ? <CompetitivePens layout={sim.state.field.competition} /> : <Pen />}
      {sim.state.field.competition ? null : <><Farmhouse /><Farmer /><Scatter /></>}
      <Treeline />
      <Flock />
      {sim.state.dogs.map((dog, index) => <Dog key={dog.id} index={index} />)}
      <PlayerLabels />
      <GateGuidance />
      <SheepHoverLabel />
    </>
  );
}
