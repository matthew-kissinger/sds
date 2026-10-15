// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the lab can look at.
 *
 * Every entry mounts the game's own scene components, unchanged and with no
 * props, exactly as `FieldScene` does. That is the whole trick: because each
 * asset system owns one zero-prop component, isolating one is a matter of
 * mounting a shorter list. The lab adds no parallel implementation of anything.
 *
 * The distances and heights below are authored starting points, not measured
 * values. They are the frame I would open each review at; the panel moves them.
 */

import type { ComponentType } from 'react';
import { Dog } from '@app/scene/Dog';
import { Farmer } from '@app/scene/Farmer';
import { Farmhouse } from '@app/scene/Farmhouse';
import { FenceLine } from '@app/scene/FenceLine';
import { Flock } from '@app/scene/Flock';
import { Pen } from '@app/scene/Pen';
import { Scatter } from '@app/scene/Scatter';
import { Terrain } from '@app/scene/Terrain';
import { Treeline } from '@app/scene/Treeline';
import { HOME_FIELD } from '@sim/field';
import { BARN_AT, HOUSE_AT } from '@app/scene/farmhouse/plan';
import { GradedGrass } from './GradedGrass';
import { LibraryGrass } from './LibraryGrass';

export type LabPartId =
  | 'terrain' | 'grass' | 'grass-lib' | 'fence' | 'pen' | 'farmhouse' | 'farmer'
  | 'treeline' | 'scatter' | 'flock' | 'dog';

/** Draw order matters, so this record is ordered as `FieldScene` orders it. */
export const LAB_PARTS: Record<LabPartId, ComponentType> = {
  terrain: Terrain,
  // The game's own grass, wearing whichever grading the panel selected. With
  // `Shipped` chosen - the default - this IS `GrassField` as the game mounts
  // it, because that is the style it falls back to.
  grass: GradedGrass,
  // The extracted library, in the same slot in the draw order. The only part
  // here that is not a game component: it is the other side of an A/B.
  'grass-lib': LibraryGrass,
  fence: FenceLine,
  pen: Pen,
  farmhouse: Farmhouse,
  farmer: Farmer,
  treeline: Treeline,
  scatter: Scatter,
  flock: Flock,
  dog: Dog,
};

/**
 * Where the turntable points. `dog` and `flock` track the live simulation, so
 * a subject that moves stays framed without anyone typing coordinates.
 */
export type LabTarget =
  | { readonly kind: 'dog' }
  | { readonly kind: 'sheep' }
  | { readonly kind: 'flock' }
  | { readonly kind: 'fixed'; readonly x: number; readonly z: number };

export interface LabSubject {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly parts: readonly LabPartId[];
  readonly target: LabTarget;
  readonly distance: number;
  readonly height: number;
}

const FARM_MID_X = (HOUSE_AT.x + BARN_AT.x) / 2;
const FARM_MID_Z = (HOUSE_AT.z + BARN_AT.z) / 2;

export const LAB_SUBJECTS = [
  {
    id: 'sheep',
    label: 'Sheep',
    note: 'The hero asset at 200 instances. Silhouette, wool volume, face, gait, hoof contact.',
    parts: ['terrain', 'grass', 'flock'],
    // ONE sheep, not the centroid. A 25-sheep spawn is 50 m across, so a
    // centroid orbit at review distance puts the camera inside the flock and
    // frames grass. The cohesion view below is where the flock is the subject.
    target: { kind: 'sheep' },
    distance: 6,
    height: 2,
  },
  {
    id: 'dog',
    label: 'Dog',
    note: 'The player. Face, chest, legs, the trot-to-gallop transition, paw contact and IK.',
    parts: ['terrain', 'grass', 'dog'],
    target: { kind: 'dog' },
    distance: 8,
    height: 2.4,
  },
  {
    id: 'grass',
    label: 'Grass',
    note: 'The signature system and the largest performance lever. The Grading control regrades it. Flip to Grass (library code) for the implementation A/B: same bytes, same blade mesh, same tier, camera held.',
    parts: ['terrain', 'grass', 'dog'],
    target: { kind: 'dog' },
    distance: 11,
    height: 2,
  },
  {
    id: 'grass-lib',
    label: 'Grass (library code)',
    // Identical frame to `grass` on purpose: the panel holds the camera when
    // the two frames match, which is what makes the flip a comparison rather
    // than two separate views.
    note: 'threejs-field-grass drawing the same tufts.bin. It brings its own material, so the Grading control does not reach it. No bark wave, no reduced-motion path, and the wake is a 1 m CPU raster instead of a per-vertex footprint SDF.',
    parts: ['terrain', 'grass-lib', 'dog'],
    target: { kind: 'dog' },
    distance: 11,
    height: 2,
  },
  {
    id: 'farm',
    label: 'Farmhouse and barn',
    note: 'Silhouette on the Classic approach, window glow, weathered timber.',
    parts: ['terrain', 'grass', 'farmhouse', 'farmer'],
    target: { kind: 'fixed', x: FARM_MID_X, z: FARM_MID_Z },
    distance: 46,
    height: 17,
  },
  {
    id: 'gate',
    label: 'Fence, gate and pen',
    note: 'The modular kit and the gate that visibly swings. The opening is the whole goal.',
    parts: ['terrain', 'grass', 'fence', 'pen'],
    target: { kind: 'fixed', x: HOME_FIELD.gate.position.x, z: HOME_FIELD.gate.position.z },
    distance: 24,
    height: 8,
  },
  {
    id: 'treeline',
    label: 'Treeline',
    note: 'Crown silhouettes and the rhythm of the ring. Judge from inside the field, looking out.',
    parts: ['terrain', 'grass', 'treeline'],
    target: { kind: 'fixed', x: 0, z: 0 },
    distance: 120,
    height: 26,
  },
  {
    id: 'scatter',
    label: 'Scatter',
    note: 'Rocks, flowers, logs. Grounding and contact shade more than shape.',
    parts: ['terrain', 'grass', 'scatter'],
    target: { kind: 'fixed', x: -20, z: -20 },
    distance: 16,
    height: 4,
  },
  {
    id: 'field',
    label: 'Whole field',
    note: 'The cohesion pass. Painterly styles die by mixed provenance, so judge neighbours together.',
    parts: ['terrain', 'grass', 'fence', 'pen', 'farmhouse', 'farmer', 'treeline', 'scatter', 'flock', 'dog'],
    target: { kind: 'flock' },
    distance: 36,
    height: 9,
  },
] as const satisfies readonly LabSubject[];

export type LabSubjectId = (typeof LAB_SUBJECTS)[number]['id'];

export function labSubject(id: LabSubjectId): LabSubject {
  const found = LAB_SUBJECTS.find((subject) => subject.id === id);
  if (found === undefined) throw new Error(`unknown lab subject ${id}`);
  return found;
}
