// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Lab-only state. Deliberately a separate store from the game's: the lab reads
 * and drives the game store through its ordinary public actions, and nothing
 * the lab cares about is allowed to become a field in `app/src` (AGENTS.md
 * tripwire 10).
 */

import { create } from 'zustand';
import type { FlockSize, QualityPreference } from '@app/state/store';
import { labSubject, type LabSubjectId } from './subjects';
import type { GradingId } from './grassGradings';

/**
 * How the subject is shaded. `lit` is the only one the player ever sees.
 * A normals view belongs here too; it needs a different mechanism from the
 * clone in `ViewMode`, so it is left out rather than shipped as a lie.
 */
export type LabViewMode = 'lit' | 'silhouette' | 'wireframe';

export interface LabCounters {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly frameMs: number;
  /** Where the turntable actually put the camera. A NaN here explains a lot. */
  readonly camera: readonly [number, number, number];
}

export const EMPTY_COUNTERS: LabCounters = {
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  frameMs: 0,
  camera: [0, 0, 0],
};

export interface LabStore {
  readonly subject: LabSubjectId;
  readonly view: LabViewMode;
  readonly quality: Exclude<QualityPreference, 'auto'>;
  /** Terrain and grass under the subject. Off isolates it against the flat. */
  readonly ground: boolean;
  /** Which grading the grass wears. `shipped` is what the game draws. */
  readonly grading: GradingId;
  /**
   * Whether the controls are on screen. A 300 px panel over a 390 px phone
   * viewport leaves 90 px of subject, so the narrow viewports spec/13 names
   * are unjudgeable until this can be put away.
   */
  readonly panelOpen: boolean;
  readonly flockSize: FlockSize;
  /** Turntable bearing, radians. Advanced by `orbitRate` while spinning. */
  readonly orbit: number;
  readonly spinning: boolean;
  /** Ground distance and height of the turntable, metres. */
  readonly distance: number;
  readonly height: number;
  /** Treadmill: hold a commanded direction so a gait can be watched. */
  readonly walking: boolean;
  readonly sprinting: boolean;
  /** Which way the held turn key points: -1 left, 0 straight, 1 right. */
  readonly turnRate: number;
  readonly counters: LabCounters;
  readonly backend: string;

  setSubject(subject: LabSubjectId): void;
  setView(view: LabViewMode): void;
  setQuality(quality: Exclude<QualityPreference, 'auto'>): void;
  setGrading(grading: GradingId): void;
  setGround(ground: boolean): void;
  setPanelOpen(panelOpen: boolean): void;
  setFlockSize(flockSize: FlockSize): void;
  setOrbit(orbit: number): void;
  setSpinning(spinning: boolean): void;
  setDistance(distance: number): void;
  setHeight(height: number): void;
  setWalking(walking: boolean): void;
  setSprinting(sprinting: boolean): void;
  setTurnRate(turnRate: number): void;
  reportCounters(counters: LabCounters): void;
  reportBackend(backend: string): void;
}

/** The subject the lab opens on, and the frame it authored for itself. */
const OPENING: LabSubjectId = 'sheep';
const OPENING_VIEW = labSubject(OPENING);

export const useLabStore = create<LabStore>((set) => ({
  subject: OPENING,
  view: 'lit',
  quality: 'high',
  grading: 'shipped',
  ground: true,
  panelOpen: true,
  flockSize: 25,
  orbit: 0,
  spinning: false,
  distance: OPENING_VIEW.distance,
  height: OPENING_VIEW.height,
  walking: false,
  sprinting: false,
  turnRate: 0,
  counters: EMPTY_COUNTERS,
  backend: 'pending',

  setSubject: (subject) => set({ subject }),
  setView: (view) => set({ view }),
  setQuality: (quality) => set({ quality }),
  setGrading: (grading) => set({ grading }),
  setGround: (ground) => set({ ground }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setFlockSize: (flockSize) => set({ flockSize }),
  setOrbit: (orbit) => set({ orbit }),
  setSpinning: (spinning) => set({ spinning }),
  setDistance: (distance) => set({ distance: Math.max(1, distance) }),
  setHeight: (height) => set({ height }),
  setWalking: (walking) => set({ walking }),
  setSprinting: (sprinting) => set({ sprinting }),
  setTurnRate: (turnRate) => set({ turnRate }),
  reportCounters: (counters) => set({ counters }),
  reportBackend: (backend) => set({ backend }),
}));
