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

import { createElement, type ComponentType } from 'react';
import { Dog } from '@app/scene/Dog';
import { Farmer } from '@app/scene/Farmer';
import { Farmhouse } from '@app/scene/Farmhouse';
import { FenceLine } from '@app/scene/FenceLine';
import { RectFence } from '@app/scene/RectFence';
import { FIELD_FENCE_SECTIONS } from '@app/scene/fence/fieldSections';
import { Flock } from '@app/scene/Flock';
import { Pen } from '@app/scene/Pen';
import { Scatter } from '@app/scene/Scatter';
import { Terrain } from '@app/scene/Terrain';
import { Treeline } from '@app/scene/Treeline';
import { HOME_FIELD } from '@sim/field';
import { BARN_AT, HOUSE_AT } from '@app/scene/farmhouse/plan';
import { GradedGrass } from './GradedGrass';
import { KilnBarn } from './KilnBarn';
import { KilnFence } from './KilnFence';
import { KilnHouse } from './KilnHouse';
import { KilnTreeline } from './KilnTreeline';
import { LibraryGrass } from './LibraryGrass';

export type LabPartId =
  | 'terrain' | 'grass' | 'grass-lib' | 'fence' | 'fence-previous' | 'pen' | 'farmhouse' | 'kiln-house'
  | 'kiln-barn' | 'kiln-fence' | 'farmer' | 'treeline' | 'kiln-treeline' | 'scatter' | 'flock' | 'dog';

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
  'fence-previous': () => createElement(RectFence, { sections: FIELD_FENCE_SECTIONS }),
  'kiln-fence': KilnFence,
  pen: Pen,
  farmhouse: Farmhouse,
  // The Kiln-authored walk-in house on the procedural range's pad, whatever
  // FARMHOUSE_SOURCE says, so the two can be flipped between at one camera.
  'kiln-house': KilnHouse,
  // The Kiln-authored threshing barn on the barn's pad, whatever BARN_SOURCE
  // says, with the house FARMHOUSE_SOURCE ships.
  'kiln-barn': KilnBarn,
  farmer: Farmer,
  treeline: Treeline,
  // The Kiln-authored oak in every stand of the same placement, whatever
  // TREE_SOURCE says, so the two oaks can be flipped between at one camera.
  'kiln-treeline': KilnTreeline,
  scatter: Scatter,
  flock: Flock,
  dog: Dog,
};

/**
 * The parts that are the FIELD rather than the asset standing in it.
 *
 * Dropping them is what makes the silhouette view do its job: it paints every
 * mesh flat black, so with the ground mounted a sheep is a black shape against
 * a black meadow and the one hard rule in spec/05 - every asset must read as
 * itself in flat black - cannot be judged at all.
 */
export const GROUND_PARTS: readonly LabPartId[] = ['terrain', 'grass', 'grass-lib'];

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

/**
 * The oak the two tree subjects look at: stand 18 of the placement manifest, a
 * full-size front-row stand in the north of the ring with ten metres of air
 * round it. It is the side of the field both game cameras face, so it is seen
 * against the low sun, as most trees in the game are. Its field side is at a
 * bearing of about 2.8.
 */
const TREE_AT = { x: -45.4, z: 146.6 } as const;

export const LAB_SUBJECTS = [
  {
    id: 'kiln-fence-outline', label: 'Fence perimeter (Kiln)',
    note: 'The complete perimeter and attached three-sided pen on the exact game outline. New mortised oak kit, three asset draws, buildings in their actual placements.',
    parts: ['terrain', 'grass', 'kiln-fence', 'pen', 'farmhouse', 'treeline', 'flock', 'dog'],
    target: { kind: 'fixed', x: 0, z: 15 }, distance: 200, height: 300,
  },
  {
    id: 'fence-reference', label: 'Fence previous',
    note: 'Previous procedural fence in the same homestead frame for the redesign comparison.',
    parts: ['terrain', 'grass', 'fence-previous', 'pen', 'farmhouse', 'treeline'],
    target: { kind: 'fixed', x: 18, z: 112 }, distance: 74, height: 24,
  },
  {
    id: 'kiln-fence-straight', label: 'Fence straight (Kiln)',
    note: 'Broad hewn rails enter pointed posts as mortised joints. Full perimeter remains mounted.',
    parts: ['terrain', 'grass', 'kiln-fence', 'pen', 'farmhouse', 'treeline'],
    target: { kind: 'fixed', x: 40, z: 100 }, distance: 16, height: 4,
  },
  {
    id: 'kiln-fence-corner', label: 'Fence corner (Kiln)',
    note: 'The pen corner shares one heavier pointed post, with knee braces joining the top rails.',
    parts: ['terrain', 'grass', 'kiln-fence', 'pen', 'farmhouse', 'treeline'],
    target: { kind: 'fixed', x: HOME_FIELD.pen.maxX, z: HOME_FIELD.pen.maxZ }, distance: 18, height: 6,
  },
  {
    id: 'kiln-fence-gate', label: 'Fence gate (Kiln)',
    note: 'Eight-metre mouth, single pointed strainers and swept-top leaves. No blue bands. Use Gate open / Gate closed to review the swing.',
    parts: ['terrain', 'grass', 'kiln-fence', 'pen', 'farmhouse', 'treeline'],
    target: { kind: 'fixed', x: HOME_FIELD.gate.position.x, z: HOME_FIELD.gate.position.z }, distance: 25, height: 6,
  },
  {
    id: 'kiln-fence', label: 'Fence kit (Kiln)',
    note: 'The redesigned mortised oak kit around the complete perimeter and pen. Procedural surfaces, three fence draws. Farmhouse facade parallel with the pen fence. The game uses this same kit.',
    parts: ['terrain', 'grass', 'kiln-fence', 'pen', 'farmhouse', 'treeline'],
    target: { kind: 'fixed', x: 18, z: 112 }, distance: 74, height: 24,
  },
  {
    id: 'kiln-fence-alone', label: 'Fence kit alone (Kiln)',
    note: 'The complete fence without buildings or trees. Hide terrain and grass to isolate the three-draw kit. Use Gate closed to review the swing.',
    parts: ['terrain', 'grass', 'kiln-fence'],
    target: { kind: 'fixed', x: 0, z: 15 }, distance: 200, height: 300,
  },
  {
    id: 'sheep',
    label: 'Sheep',
    note: 'The hero asset at 200 instances. Silhouette, wool volume, face, gait, hoof contact. Sprint the dog through them to raise agitation and see the bound.',
    // THE DOG IS MOUNTED HERE ON PURPOSE, and it is not scope creep. A sheep's
    // agitation is the sim's, and the sim only raises it when a dog presses the
    // flock - so without one this subject can only ever show a grazing animal,
    // and spec/13's promise to "watch the animation cycle without playing the
    // game to reach that state" is unmet for the hero asset. The treadmill
    // already drives the dog through the real controller, so mounting it makes
    // the whole gait reachable with the mechanism that is already here, rather
    // than with a lab flag inside app/src that tripwire 4 forbids.
    parts: ['terrain', 'grass', 'flock', 'dog'],
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
    id: 'house',
    label: 'House (procedural)',
    // The code-built house at the Kiln subject's own frame, target and part
    // list, so flipping between the two holds the camera and changes nothing
    // but the house. `farm` cannot do that: it aims between house and barn.
    note: 'The shipped, code-built house (farmhouse/cluster.ts) at the same frame as House (Kiln). Context for the Kiln house, not its reference.',
    parts: ['terrain', 'grass', 'farmhouse', 'farmer'],
    target: { kind: 'fixed', x: HOUSE_AT.x, z: HOUSE_AT.z },
    distance: 26,
    height: 6,
  },
  {
    id: 'kiln-house',
    label: 'House (Kiln)',
    // The same pad, yaw, footprint, target and frame as the subject above, so
    // the panel holds the camera across the flip and the comparison is the
    // asset alone.
    note: 'The walk-in house authored in Kiln, re-banded through the shipped toon ramp and welded into the farm cluster (barn, shadows, smoke unchanged). Real reveals, joinery, a door on its hinges and a room behind it. Drop the distance to walk up to it.',
    parts: ['terrain', 'grass', 'kiln-house', 'farmer'],
    target: { kind: 'fixed', x: HOUSE_AT.x, z: HOUSE_AT.z },
    distance: 26,
    height: 6,
  },
  {
    id: 'barn',
    label: 'Barn (procedural)',
    // The code-built barn at the Kiln barn's frame, target and part list, so
    // flipping between the two holds the camera and changes only the barn.
    note: 'The shipped, code-built barn (farmhouse/cluster.ts): gabled, with its outshot and cupola. Context for the Kiln barn, not its reference.',
    parts: ['terrain', 'grass', 'farmhouse', 'farmer'],
    target: { kind: 'fixed', x: BARN_AT.x, z: BARN_AT.z },
    distance: 30,
    height: 9,
  },
  {
    id: 'kiln-barn',
    label: 'Barn (Kiln)',
    // The same pad, yaw, box, target and frame as the subject above.
    note: 'The threshing barn authored in Kiln: a gambrel over three bays, cart doors standing open on a dark threshing floor, a hay door under its hood, a lit loft window and a louvred cupola. Re-banded through the shipped toon ramp and welded into the farm cluster (house, shadows, smoke unchanged). Drop the distance to walk up to the doors.',
    parts: ['terrain', 'grass', 'kiln-barn', 'farmer'],
    target: { kind: 'fixed', x: BARN_AT.x, z: BARN_AT.z },
    distance: 30,
    height: 9,
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
    id: 'tree',
    label: 'Tree (procedural)',
    // The shipped sculpted oak at the Kiln oak's frame, target and part list,
    // so flipping between the two holds the camera and changes only the oak.
    note: 'The shipped sculpted oak (treeline/crownShape.ts) in every stand, framed on one front-row stand in the north of the ring. Context for the Kiln oak, not its reference.',
    parts: ['terrain', 'grass', 'treeline'],
    target: { kind: 'fixed', x: TREE_AT.x, z: TREE_AT.z },
    distance: 34,
    height: 5,
  },
  {
    id: 'kiln-tree',
    label: 'Tree (Kiln)',
    // The same stands, target and frame as the subject above.
    note: 'The spreading oak authored in Kiln, instanced into every stand of the same placement and painted by the game: lobe-blended bands, leaf dabs on the terminator, a swollen outline, a backlit rim and a slow sway. Swing the bearing to about 2.4 to look into the sun, and draw back past 100 m for the Follow camera\'s read.',
    parts: ['terrain', 'grass', 'kiln-treeline'],
    target: { kind: 'fixed', x: TREE_AT.x, z: TREE_AT.z },
    distance: 34,
    height: 5,
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
