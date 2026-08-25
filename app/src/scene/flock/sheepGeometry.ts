// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The sheep, as a recipe rather than a binary (AGENTS.md rule 11). Everything
 * here is arithmetic on primitives, so the mesh can be re-derived, re-tuned and
 * diffed in review; there is no opaque GLB behind it.
 *
 * THE BACK LINE IS AUTHORED, NOT AVERAGED. Three even stations under three even
 * crest lobes came back as a scalloped potato - the same height nose to tail,
 * with no landmark on it - so this cluster spells the shape out. Withers highest
 * at y 0.955 over z 0.20; the back DIPS to 0.89 behind the shoulder; a rounded
 * rump back up at 0.92; a fall to a tail nub off the centreline at z -0.67. Read
 * in flat black from the side that is a sheep and not a rock, the test spec/05 sets.
 *
 * The underline does the same work upside down: brisket down to about y 0.17 at
 * the chest, belly running above it, a deliberate GAP in the wool at z -0.16 where the
 * barrel's own wall is lowest - the flank tuck - then two haunch lobes back down
 * to 0.32. Dip, run, tuck, swell rather than one horizontal cut, so each leg
 * emerges from a mass rather than out of a flat plate.
 *
 * Numbers, all metres: 1.67 nose to tail, about 0.84 across the widest flank lobes,
 * 0.955 at the withers, hooves at y 0. The fleece bottoms out near 0.17, inside the
 * grass system's 0.44-0.52 m canopy, so a standing sheep is brisket deep in the
 * field rather than hovering over it.
 *
 * MASK CHANNELS. Vertex animation, the dark/light split and the hull's exposure
 * need five per-vertex weights and the TSL shim (tsl/nodes.ts) exposes no
 * generic `attribute`, so three UV sets carry them. Mask channels in spare UV
 * sets are ordinary game-art practice, and the sheep material is the only reader:
 *
 *   uv.x   wool      1 on the fleece, 0 on head, ears and legs
 *   uv.y   graze     how much this vertex follows the head when it drops
 *   uv1.x  legSign   +1 / -1, the diagonal pairs of a walk; 0 off the legs
 *   uv1.y  legWeight 0 at the shoulder, 1 at the hoof; the hoof's colour reads it
 *   uv2.x  exposure  1 in open air, 0 buried inside a neighbouring mass
 *
 * `abs(legSign)` doubles as the leg/face selector: it is the only channel that
 * separates a limb from a skull. `legWeight` is also what plants the hooves: the
 * breathing bob is scaled by (1 - legWeight) so the body rises and the feet do
 * not (sheepMotion.ts). `exposure` is why there is no ink inside the animal
 * (sheepExposure.ts).
 */

import * as THREE from 'three/webgpu';
import { type Puff, woolPuff } from './woolPuffs';
import { type Volume, exposureAt, puffVolume, segmentVolume } from './sheepExposure';
import {
  HEAD_GRAZE_END,
  HEAD_GRAZE_START,
  LEG_PLACEMENT,
  earShape,
  headShape,
  legShape,
} from './sheepParts';
import { FLEECE_LIFT, HEAD_LIFT } from './sheepFormTuning';

// --- the fleece -------------------------------------------------------------

/** A puff plus how far its shading normals are pulled onto the body axis. */
interface BodyPuff extends Puff {
  /** 0 keeps the puff's own rounded normals, 1 shades it as part of the barrel. */
  readonly blend: number;
  /** Stable contour orientation when a new puff is added to the recipe. */
  readonly spin?: number;
  /** Bounded share of the head nod used by wool wrapping the neck root. */
  readonly graze?: number;
}

/**
 * The cluster. The three stations loft the barrel; everything else is a named
 * landmark on it.
 *
 * THE BLEND COLUMN IS WHAT PUTS BANDS BACK ON THE WOOL. Pulled hard onto the
 * body axis, the shell's normals barely vary except with height and the ramp has
 * almost nothing to cut across - six sRGB points down a whole flank, measured.
 * The stations still take most of the pull, because a barrel should shade as one;
 * landmarks keep enough local roundness to turn softly, but the shared spine
 * now carries the primary ramp. Shape and outline describe the wool hierarchy;
 * the lighting no longer repeats one hard crescent per puff.
 */
const BODY_PUFFS: readonly BodyPuff[] = [
  // Stations: shoulder, barrel, haunch. These are now the deep primary fleece
  // mass, not three shallow balls with separate puffs hanging underneath. Their
  // lower halves overlap the upper legs while the crests below restore the
  // authored back line. This is what removes the cloud-on-sticks construction.
  // One dominant barrel now spans most of the body. The shoulder and haunch are
  // subordinate masses with different proportions, so a flock no longer reads
  // as the same three equal clouds repeated twenty-five times.
  { cx: 0.015, cy: 0.53, cz: 0.22, rx: 0.3, ry: 0.36, rz: 0.36, tx: 0.86, ty: -0.37, tz: -0.44, blend: 0.84 },
  { cx: -0.01, cy: 0.54, cz: -0.07, rx: 0.38, ry: 0.36, rz: 0.47, tx: -0.53, ty: 0.94, tz: 0.62, blend: 0.86 },
  { cx: -0.015, cy: 0.52, cz: -0.38, rx: 0.29, ry: 0.35, rz: 0.29, tx: 0.21, ty: 0.4, tz: 0.13, blend: 0.84 },
  // The back line: withers high at 0.955, the station's own 0.89 as the dip
  // behind the shoulder, a rump back up at 0.92, then the fall to the tail.
  { cx: 0.04, cy: 0.75, cz: 0.21, rx: 0.23, ry: 0.21, rz: 0.24, tx: 0.35, ty: 1.24, tz: -0.71, blend: 0.58 },
  { cx: 0.14, cy: 0.72, cz: -0.05, rx: 0.12, ry: 0.11, rz: 0.14, tx: -0.92, ty: 0.28, tz: 0.5, blend: 0.66 },
  { cx: -0.05, cy: 0.75, cz: -0.31, rx: 0.185, ry: 0.18, rz: 0.21, tx: 0.62, ty: -1.05, tz: 0.87, blend: 0.62 },
  { cx: 0.015, cy: 0.65, cz: -0.49, rx: 0.19, ry: 0.17, rz: 0.15, tx: 0.44, ty: 0.16, tz: -0.27, blend: 0.68 },
  // Shoulder and haunch swells descend over the top third of each leg. Their
  // large/medium pairing is intentionally uneven: the old four equal scallops
  // read as a cut-paper cloud perched on four long sticks.
  { cx: 0.22, cy: 0.39, cz: 0.23, rx: 0.215, ry: 0.26, rz: 0.22, tx: -0.24, ty: 0.71, tz: -0.96, blend: 0.68 },
  { cx: -0.22, cy: 0.44, cz: 0.2, rx: 0.12, ry: 0.2, rz: 0.15, tx: 1.13, ty: 0.52, tz: 0.19, blend: 0.74 },
  { cx: 0.225, cy: 0.43, cz: -0.31, rx: 0.17, ry: 0.23, rz: 0.2, tx: -0.68, ty: -0.83, tz: 0.34, blend: 0.68 },
  { cx: -0.22, cy: 0.45, cz: -0.34, rx: 0.11, ry: 0.19, rz: 0.14, tx: 0.9, ty: 0.31, tz: -0.55, blend: 0.76 },
  // The mid flank keeps the same hierarchy: one generous lobe and one smaller
  // interruption rather than two copies mirrored across the body.
  { cx: -0.22, cy: 0.43, cz: -0.07, rx: 0.18, ry: 0.22, rz: 0.22, tx: 0.06, ty: 1.4, tz: 0.22, blend: 0.68 },
  { cx: 0.22, cy: 0.48, cz: 0.08, rx: 0.105, ry: 0.13, rz: 0.14, tx: -1.2, ty: 0.44, tz: 0.78, blend: 0.76 },
  // The underline now only rounds the deep stations into brisket and belly. It
  // is tucked inside their envelope so neither puff can read as a hanging ball.
  { cx: 0.04, cy: 0.26, cz: 0.31, rx: 0.19, ry: 0.15, rz: 0.2, tx: 0.06, ty: 0.12, tz: 0, blend: 0.82 },
  { cx: -0.03, cy: 0.3, cz: 0.035, rx: 0.2, ry: 0.09, rz: 0.24, tx: 0.02, ty: -0.3, tz: 0.05, blend: 0.82 },
  // A paired shoulder ruff is the second layer of the fleece. It rises around
  // the buried head root and overlaps the cheek. The two lobes keep slightly
  // different heights and depths, but their outer reaches are balanced around
  // the face. The former +x lobe was nearly twice the width of its partner and
  // repeated as an obvious extra tuft on the same side of every sheep.
  // Explicit spins keep every earlier puff's authored contour stable.
  { cx: 0.19, cy: 0.49, cz: 0.4, rx: 0.21, ry: 0.26, rz: 0.23, tx: -0.41, ty: 0.64, tz: -0.73, blend: 0.72, spin: 16, graze: 0.18 },
  { cx: -0.18, cy: 0.5, cz: 0.39, rx: 0.18, ry: 0.235, rz: 0.21, tx: 0.77, ty: -0.48, tz: 0.36, blend: 0.78, spin: 17, graze: 0.14 },
  // A centre-front lock surrounds the buried root without climbing into a pale
  // vertical connector. Its width remains broad enough to be the collar from
  // which the visible muzzle emerges.
  { cx: 0.02, cy: 0.45, cz: 0.45, rx: 0.27, ry: 0.27, rz: 0.24, tx: 0.28, ty: -0.36, tz: 0.16, blend: 0.78, spin: 19, graze: 0.34 },
];

/**
 * The axis the barrel SHADES and EXPANDS around.
 *
 * Left alone, each puff carries its own rounded normals, the ramp puts a
 * terminator around every one of them, and the animal comes back wearing a dozen
 * hard crescents. Pulling the shading normal toward the direction out of a long
 * body AXIS makes the cluster read as one rounded barrel; the per-puff blend
 * above decides how much of that pull each landmark takes.
 *
 * A segment rather than a point, because a point centre makes a 1.2 m long body
 * shade like a ball: both ends turn away from the light at once and the animal
 * loses its length. The same segment is exported because the outline hull
 * expands along it too (sheepMaterial.ts).
 */
export const SPINE = { y: 0.57 + FLEECE_LIFT, zBack: -0.4, zFront: 0.28 } as const;

/** A shallow forehead cap at the ruff edge. Its vertical span stays below one
 *  quarter of the dark head height, so it cannot project as a pale neck stalk. */
const POLL: BodyPuff =
  { cx: 0, cy: 0.645 + HEAD_LIFT, cz: 0.67, rx: 0.15, ry: 0.019, rz: 0.065, tx: 0.1, ty: 0, tz: -0.1, blend: 0.52, spin: 15 };
/** How much of the nod the poll takes. Half, so it spills over the brow with
 *  the head and still stays welded to the shoulder. */
const POLL_GRAZE = 0.5;

/**
 * The tail: a small wool nub hung OFF THE CENTRELINE and low on the haunch.
 * Centred on the rump it drew a concentric ring in the outline; out at x 0.10 it
 * leaves the rump's silhouette instead of sitting inside it, which is what a
 * tail is for.
 */
const TAIL: BodyPuff =
  { cx: 0.1, cy: 0.585, cz: -0.665, rx: 0.058, ry: 0.11, rz: 0.075, tx: 0.55, tz: -0.35, blend: 0.44, spin: 18 };

/**
 * Landmarks the material also needs. Exported rather than duplicated, because a
 * neck pivot that disagrees between the mesh and the shader tears the head off.
 */
export const SHEEP_FORM = {
  /** The graze hinge sits inside the front ruff. The shorter arm keeps the cheek
   *  connected instead of making the face swing from an implied long neck. */
  pivotY: 0.63 + HEAD_LIFT,
  pivotZ: 0.53,
  /** Vertical span the fleece's own painted shading crosses. */
  bellyY: 0.2 + FLEECE_LIFT,
  crestY: 0.955 + FLEECE_LIFT,
  /** Jaw line: below this the underside of the skull darkens, so the muzzle
   *  reads as stepped in under the cheek. */
  jawY: 0.54 + HEAD_LIFT,
} as const;

// --- assembly ---------------------------------------------------------------

interface Buffers {
  readonly positions: number[];
  readonly normals: number[];
  /** uv: wool, graze. */
  readonly maskA: number[];
  /** uv1: legSign, legWeight. */
  readonly maskB: number[];
  /** uv2: exposure, spare. */
  readonly maskC: number[];
  readonly indices: number[];
}

/** Mask values for one vertex, given its index in the part and its position. */
type MaskWriter = (index: number, x: number, y: number, z: number, out: Float32Array) => void;

function append(
  into: Buffers,
  part: THREE.BufferGeometry,
  mask: MaskWriter,
  volumes: readonly Volume[],
  owner: number,
): void {
  const position = part.getAttribute('position');
  const normal = part.getAttribute('normal');
  const base = into.positions.length / 3;
  const out = new Float32Array(4);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    into.positions.push(x, y, z);
    into.normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
    mask(i, x, y, z, out);
    into.maskA.push(out[0]!, out[1]!);
    into.maskB.push(out[2]!, out[3]!);
    into.maskC.push(exposureAt(volumes, owner, x, y, z), 0);
  }
  const index = part.getIndex();
  const span = index === null ? position.count : index.count;
  for (let i = 0; i < span; i++) {
    into.indices.push(base + (index === null ? i : index.getX(i)));
  }
  part.dispose();
}

/** Pull a part's normals toward the direction out of the body's spine segment.
 *  Geometry untouched; only what the ramp reads changes. */
function smoothTowardBody(part: THREE.BufferGeometry, blend: number): THREE.BufferGeometry {
  const position = part.getAttribute('position');
  const normal = part.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const z = Math.min(Math.max(position.getZ(i), SPINE.zBack), SPINE.zFront);
    const dx = position.getX(i);
    const dy = position.getY(i) - SPINE.y;
    const dz = position.getZ(i) - z;
    const inverse = 1 / Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 1e-4);
    const nx = normal.getX(i) * (1 - blend) + dx * inverse * blend;
    const ny = normal.getY(i) * (1 - blend) + dy * inverse * blend;
    const nz = normal.getZ(i) * (1 - blend) + dz * inverse * blend;
    const unit = 1 / Math.max(Math.sqrt(nx * nx + ny * ny + nz * nz), 1e-4);
    normal.setXYZ(i, nx * unit, ny * unit, nz * unit);
  }
  return part;
}

const wool: MaskWriter = (_i, _x, _y, _z, out) => out.set([1, 0, 0, 0]);
const poll: MaskWriter = (_i, _x, _y, _z, out) => out.set([1, POLL_GRAZE, 0, 0]);
const wrappedWool = (graze: number): MaskWriter =>
  (_i, _x, _y, _z, out) => out.set([1, graze, 0, 0]);

/** The head follows the nod only forward of the shoulder. Its rear third is the
 *  neck, buried in the wool, and a neck that swung would tear out of it. */
const head: MaskWriter = (_i, _x, _y, z, out) => {
  const t = (z - HEAD_GRAZE_START) / (HEAD_GRAZE_END - HEAD_GRAZE_START);
  out.set([0, Math.min(Math.max(t, 0), 1), 0, 0]);
};

/** Ears ride with the head, just short of fully, so they lag a little as the
 *  nose drops. That lag is most of what makes the graze read as a movement. */
const ears: MaskWriter = (_i, _x, _y, _z, out) => out.set([0, 0.85, 0, 0]);

const legMask =
  (sign: number, weights: Float32Array): MaskWriter =>
  (i, _x, _y, _z, out) => {
    out.set([0, 0, sign, weights[i]!]);
  };

/** Every wool clump, as an occluder. The head, ears and legs are tested against
 *  these; the wool is tested against every clump but its own. */
/**
 * Raise the whole wool shell 7.5 cm without moving the planted hooves. This is
 * the bounded contact correction from the scene critic: more dark leg remains
 * visible above the grass, while every wool volume and exposure occluder moves
 * together, so no buried outline can reopen.
 */
const ALL_PUFFS: readonly BodyPuff[] = [...BODY_PUFFS, POLL, TAIL].map((puff) => ({
  ...puff,
  cy: puff.cy + FLEECE_LIFT,
}));

const VOLUMES: readonly Volume[] = [
  ...ALL_PUFFS.map((puff, i) => puffVolume(puff, i)),
  // The buried root, so neither the head nor the wool draws an interior line at
  // the join. The volume stops before the cheek so the face keeps its contour.
  segmentVolume(
    ALL_PUFFS.length,
    [0, 0.625 + HEAD_LIFT, 0.4],
    [0, 0.6 + HEAD_LIFT, 0.56],
    0.11,
  ),
];

/** Append one leg with its baked shoulder-to-hoof weight. */
function appendLeg(
  into: Buffers, x: number, z: number, rings: typeof LEG_PLACEMENT.front, sign: number, owner: number,
): void {
  const { geometry, weights } = legShape(x, z, rings);
  append(into, geometry, legMask(sign, weights), VOLUMES, owner);
}

/**
 * The whole sheep as one indexed geometry, under 2,100 triangles. One geometry
 * means one draw call for the flock however large it grows, which is the
 * constraint everything else here was designed around.
 */
export function buildSheepGeometry(): THREE.BufferGeometry {
  const buffers: Buffers = { positions: [], normals: [], maskA: [], maskB: [], maskC: [], indices: [] };

  ALL_PUFFS.forEach((puff, i) => {
    const mask = i === BODY_PUFFS.length
      ? poll
      : puff.graze === undefined ? wool : wrappedWool(puff.graze);
    append(buffers, smoothTowardBody(woolPuff(puff, puff.spin ?? i), puff.blend), mask, VOLUMES, i);
  });
  // The head, ears and legs are single convex parts and their creases against
  // the fleece are joins a painter would draw, so they all share one owner id:
  // none of them can bury another, only the wool can bury them.
  const loose = ALL_PUFFS.length + 1;
  append(buffers, headShape(), head, VOLUMES, loose);
  append(buffers, earShape(1), ears, VOLUMES, loose);
  append(buffers, earShape(-1), ears, VOLUMES, loose);
  // Diagonal pairs: front-left swings with back-right, which is a walk.
  const { frontX, frontZ, backX, backZ, front, back } = LEG_PLACEMENT;
  appendLeg(buffers, frontX, frontZ, front, 1, loose);
  appendLeg(buffers, -frontX, frontZ, front, -1, loose);
  appendLeg(buffers, backX, backZ, back, -1, loose);
  appendLeg(buffers, -backX, backZ, back, 1, loose);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.maskA, 2));
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(buffers.maskB, 2));
  geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(buffers.maskC, 2));
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingSphere();
  return geometry;
}
