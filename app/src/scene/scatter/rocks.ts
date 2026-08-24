// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The stones: three authored masses (scatter/rockGeometry.ts), grouped into a
 * few tight clusters, MERGED INTO ONE MESH with their outlines baked in beside
 * them. One draw call for every stone and every contour.
 *
 * THEY ARE WARM GREY-TAUPE NOW, WHICH IS THE NOTE THAT MATTERED MOST. The pass
 * before this authored the mid band at hue 246 on the theory that a cool shadow
 * is what spec/05 asks for. What the capture showed was that the mid band is
 * exactly the band a CAMERA-FACING flank lands in under this scene's 8 degree
 * key, so the surface a player actually looks at photographed as lavender. The
 * whole lit half of a stone is a warm taupe that belongs beside the fence rails
 * (PALETTE.timber #8d6a43), and the cool violet is held back for the deepest
 * underside band alone, where it reads as saturated shadow rather than as the
 * rock's colour.
 *
 * WHY MERGED RATHER THAN INSTANCED. The dressing carries three shapes across
 * five clusters, so instancing would cost three draw calls for the solids and
 * three more for the outline hulls, to save a few hundred triangles of buffer.
 * Merging costs one build at mount - the field does not move - and buys back
 * both the shape variety and a single draw call. The per-stone value variation
 * is unaffected: the grain, the mottle and the lichen are all world-space noise,
 * so two stones a hand apart still draw different tones out of one material.
 *
 * THE OUTLINE IS IN THE SAME BUFFER. Every neighbour in the frame - dog, sheep,
 * fence, tree - carries the scene's thin warm-dark contour, and at comparable
 * screen size a scatter without one reads as a different renderer dropped into
 * the shot. The usual inverted hull needs a second material with `side:
 * BackSide`; here the shell is written into the same buffer with its winding
 * REVERSED, which makes front-face culling keep exactly the triangles back-face
 * culling would have kept on an unreversed shell. Same picture, no second draw.
 * The shell is offset along AVERAGED vertex normals in world space, so the
 * contour is a constant width in metres on every stone whatever its scale, and
 * it is now the thin ROCK_OUTLINE_WIDTH: the dog and the sheep carry the heavy
 * line in this frame, not the set dressing.
 *
 * THE VALUES SIT UNDER THE HERD. The bands are authored to land at 0.55 on a
 * crown, 0.44 on a lifted flank and 0.30 under an overhang, against pasture at
 * 0.46 to 0.60 and wool at 0.76, so a boulder reads as a solid receding into the
 * field and the sheep and the dog are the brightest things standing on it.
 */

import * as THREE from 'three/webgpu';
import {
  float,
  normalWorld,
  positionWorld,
  smoothstep,
  type TSLNode,
} from '@app/tsl/nodes';
import {
  bandWeights,
  makeBandedMaterial,
  paintedField,
  type BandTargets,
} from './bandedMaterial';
import { crust } from './crust';
import { OUTLINE_COLOR, ROCK_OUTLINE_WIDTH, outlineMask } from './outline';
import { rockKind, type RockKind } from './rockGeometry';
import type { RockTransform } from './placement';
import type { Facet, Vector } from './convexCut';

/**
 * Stone, in the three bands. palette candidate: promote in cohesion pass.
 *
 * These are TARGETS - what the pixel should be - and bandedMaterial.ts divides
 * the ramp's own gain back out of them.
 *
 * WARM ALL THE WAY THROUGH. Hue 34 to 40 across all three, which is the fence
 * timber's own family pulled most of the way to neutral: 8 to 14 per cent
 * chroma against the timber's 51. That is the separation the frame needs -
 * granite is not wood - without the stone belonging to a different painting.
 *
 * The cool shift lives in ONE place, UNDERSIDE below, and reaches only surfaces
 * whose normal points below the horizon. A stone in this field is lit by a
 * golden key on its crown and a blue sky on its overhangs, and that is exactly
 * where each of those colours is allowed to land.
 *
 * The capture still photographed a shade cool against the yellow-green pasture
 * around it - a warm grey beside a warm field reads as the cooler of the two -
 * so all three bands carry a few more points of red and a few fewer of blue than
 * the pass before. Same hue family, more of it.
 *
 *   lit     #a09080   hue 33   chroma 20%   renders near luminance 0.57
 *   mid     #857868   hue 34   chroma 18%   near 0.47
 *   shadow  #6e6455   hue 34   chroma 22%   near 0.39, lifted to 0.45 on a flank
 */
const STONE: BandTargets = { shadow: '#6f6250', mid: '#877864', lit: '#a2907c' };

/**
 * The deepest band, and the only cool thing on the asset. Hue 265 at 15 per cent
 * chroma, a step and a half darker than the flank above it. It is reached only
 * where the surface normal points below the horizon, so no camera-facing plane
 * can take it and the lavender note cannot come back.
 */
const UNDERSIDE: BandTargets = { shadow: '#4d4954', mid: '#4d4954', lit: '#5a5563' };

/**
 * Lichen, as a pale sage crust. palette candidate: promote in cohesion pass.
 *
 * IT SITS BETWEEN THE STONE AND THE PASTURE, WHICH IS THE NOTE. The last set was
 * a pure spring green at hue 110 and belonged to neither: too green for a rock,
 * too blue for this meadow. These run hue 62 to 70 - a couple of degrees cool of
 * the pasture's 73 - at 12 to 16 per cent chroma, which is grey-chartreuse. A
 * patch reads as something growing in the damp, and it reads as belonging to the
 * same field the grass does.
 *
 * IT IS PALE, AND IT WAS NOT BEFORE. The last set sat every lichen band a step
 * DARKER than the stone under it, on the reasoning that a growth should not
 * out-value its host. Against a warm taupe boulder at 14 m that produced a
 * difference of four points of luminance, which is invisible: even where the
 * mask fired there was nothing to see. Crustose lichen is the palest thing on a
 * real boulder, so these now sit a clear step LIGHTER - lit 0.70 against the
 * stone's 0.55 - and the separation is carried by value as well as by hue.
 *
 * LICHEN_CORE is the second value INSIDE each patch (scatter/crust.ts), and it
 * is the darker of the two, so a colony reads as a ring of new growth around an
 * older middle rather than as one flat shape.
 */
const LICHEN: BandTargets = { shadow: '#7c8168', mid: '#98a07e', lit: '#b0b892' };
const LICHEN_CORE: BandTargets = { shadow: '#6a6f58', mid: '#848a6c', lit: '#9aa07e' };

/**
 * The flank lift: how far a vertical face in shadow climbs, and the window of
 * `normalWorld.y` that counts as a flank.
 *
 * WITHOUT THIS A STONE IS TWO TONES, NOT THREE. Under an 8 degree key none of a
 * stone's facets lands in the mid band: the sun is at (-0.637, 0.139, 0.759) and
 * both gameplay rigs look up-field along roughly (0.481, 0.876), which is INTO
 * it, so a camera-facing facet has a half-lambert of about 0.32 and takes the
 * shadow band outright while a crown facet reads 0.57 and takes the key. The mid
 * band had no facet in the entire frame.
 *
 * So the middle step is reached by GEOMETRY rather than by waiting for the sun
 * to supply it. A face that is vertical AND in shadow is lifted, which carries
 * it from 0.38 into the mid 0.4s, while an OVERHANG stays where it is and takes
 * the cool UNDERSIDE band instead. The lift is a value multiplier, so a flank
 * keeps the warm taupe hue it was authored with.
 *
 * The lift is a seventh, not the four fifths the old cool authoring needed: the
 * shadow band is no longer a near-black navy that had to be rescued, so the
 * ladder is made of three authored colours with one small nudge rather than of
 * one colour and a large one.
 *
 * THE TERMINATOR BETWEEN CROWN AND FLANK IS RAGGED, not geometric. A window on
 * a raw normal puts the boundary exactly on a facet edge, which is the hardest
 * line on the stone and reads as a cut. A few centimetres of world noise added
 * to the normal before the window breaks that line into something painted.
 */
const FLANK_LIFT = 0.14;
const FLANK_EDGE = [-0.1, 0.2] as const;
const CROWN_EDGE = [0.58, 0.9] as const;
const TERMINATOR_NOISE_SCALE = 3.1;
const TERMINATOR_NOISE = 0.09;

/** Where a surface stops being a flank and becomes an overhang. */
const UNDER_EDGE = [-0.44, -0.04] as const;

/** The stone's own up-axis coordinate, roughened so no band boundary follows a
 *  facet edge. */
function raggedUp(): TSLNode {
  const wobble = paintedField(positionWorld.mul(float(TERMINATOR_NOISE_SCALE)), 4.7).mul(
    float(TERMINATOR_NOISE),
  );
  return normalWorld.y.add(wobble);
}

/** The three-step ladder around a stone, as one value multiplier. */
function flankTone(up: TSLNode): TSLNode {
  // Vertical-ish: out of the overhangs, not yet onto the crown.
  const flank = smoothstep(float(FLANK_EDGE[0]), float(FLANK_EDGE[1]), up).mul(
    float(1).sub(smoothstep(float(CROWN_EDGE[0]), float(CROWN_EDGE[1]), up)),
  );
  // Only where the key does not already reach. A sun-side flank is in the lit
  // band and lifting it too would flatten the stone the other way.
  const inShadow = float(1).sub(bandWeights().outOfShadow);
  return float(1).add(flank.mul(inShadow).mul(float(FLANK_LIFT)));
}

/** Fraction of a stone's height that sits below the ground. A third, so the
 *  lower facets are genuinely buried and the grass collar has something to
 *  stand against rather than a rim to trace. */
const BURY = 0.34;
/** How far a stone rolls onto the ground's own normal, 0..1. Not all the way:
 *  a boulder settles, it does not lie flush. */
const SETTLE = 0.6;
/** Quantisation of a world position when averaging normals for the hull, in
 *  metres. Corners that meet within this are one corner, so the shell closes. */
const WELD = 1e-3;

const UP = new THREE.Vector3(0, 1, 0);

interface Buffers {
  readonly positions: number[];
  readonly normals: number[];
  readonly flags: number[];
}

function key(p: Vector): string {
  return `${Math.round(p[0] / WELD)},${Math.round(p[1] / WELD)},${Math.round(p[2] / WELD)}`;
}

/** Fan one face into the buffers. `flag` 1 reverses the winding, which is what
 *  turns the offset shell into a back-face-only contour under front-face
 *  culling. */
function fan(target: Buffers, points: readonly Vector[], normal: Vector, flag: number): void {
  for (let i = 1; i + 1 < points.length; i++) {
    const ring =
      flag === 0
        ? [points[0]!, points[i]!, points[i + 1]!]
        : [points[0]!, points[i + 1]!, points[i]!];
    for (const p of ring) {
      target.positions.push(p[0], p[1], p[2]);
      target.normals.push(normal[0], normal[1], normal[2]);
      target.flags.push(flag, 0);
    }
  }
}

/** One stone, in world space, as solid faces plus the offset contour shell. */
function appendStone(
  target: Buffers,
  faces: readonly Facet[],
  matrix: THREE.Matrix4,
  normalMatrix: THREE.Matrix3,
): void {
  const work = new THREE.Vector3();
  const worldFaces = faces.map((face) => {
    work.set(face.normal[0], face.normal[1], face.normal[2]).applyMatrix3(normalMatrix).normalize();
    const normal: Vector = [work.x, work.y, work.z];
    const points = face.points.map<Vector>((p) => {
      work.set(p[0], p[1], p[2]).applyMatrix4(matrix);
      return [work.x, work.y, work.z];
    });
    return { normal, points };
  });

  // One averaged normal per corner, so the offset shell closes at the edges
  // instead of splitting into a face-per-face explosion.
  const corners = new Map<string, Vector>();
  for (const face of worldFaces) {
    for (const p of face.points) {
      const at = key(p);
      const sum = corners.get(at);
      if (sum === undefined) corners.set(at, [...face.normal]);
      else {
        sum[0] += face.normal[0];
        sum[1] += face.normal[1];
        sum[2] += face.normal[2];
      }
    }
  }

  for (const face of worldFaces) {
    fan(target, face.points, face.normal, 0);
    const shell = face.points.map<Vector>((p) => {
      const sum = corners.get(key(p)) ?? face.normal;
      const length = Math.hypot(sum[0], sum[1], sum[2]) || 1;
      return [
        p[0] + (sum[0] / length) * ROCK_OUTLINE_WIDTH,
        p[1] + (sum[1] / length) * ROCK_OUTLINE_WIDTH,
        p[2] + (sum[2] / length) * ROCK_OUTLINE_WIDTH,
      ];
    });
    fan(target, shell, face.normal, 1);
  }
}

function placeOne(target: Buffers, item: RockTransform, kind: RockKind): void {
  const dummy = new THREE.Object3D();
  const settled = new THREE.Vector3();
  settled
    .set(
      item.normalX * SETTLE,
      1 - SETTLE + item.normalY * SETTLE,
      item.normalZ * SETTLE,
    )
    .normalize();
  dummy.position.set(item.x, item.groundY - kind.height * item.scaleY * BURY, item.z);
  // Align first, then spin about the stone's own up: the two orders differ, and
  // this one keeps the yaw meaning "turned on the hillside".
  dummy.quaternion.setFromUnitVectors(UP, settled);
  dummy.rotateY(item.yaw);
  dummy.scale.set(item.scaleX, item.scaleY, item.scaleZ);
  dummy.updateMatrix();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(dummy.matrix);
  appendStone(target, kind.faces, dummy.matrix, normalMatrix);
}

export function buildRockMesh(items: readonly RockTransform[]): THREE.Mesh {
  const target: Buffers = { positions: [], normals: [], flags: [] };
  for (const item of items) placeOne(target, item, rockKind(item.kind));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(target.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(target.flags, 2));
  geometry.computeBoundingSphere();

  const up = raggedUp();
  const colony = crust({
    // It starts on the crown and spills over the lip: the gate opens just above
    // horizontal, so where the noise says a colony continues, it continues down
    // the flank instead of stopping dead at the top face.
    from: 0.02,
    to: 0.55,
    // Rather more than one colony per stone, now that a stone is about a metre
    // across: three or four islands with outliers between them.
    scale: 2.1,
    // A HARD-ISH CEL EDGE, and THIS NUMBER WAS THE BUG. The two coarse octaves
    // sum to a field whose standard deviation measures nearer 0.29 than the 0.4
    // the last pass assumed, which put a 0.46 threshold 1.6 sigma out: about
    // five per cent coverage, spread over a stone barely two colony-widths
    // across, so most stones grew no lichen at all and the capture came back
    // with bare rock. At 0.20 the threshold sits three quarters of a sigma out
    // and passes roughly a quarter of the upward surface, which is a weathered
    // boulder. The third octave inside crust.ts still makes the boundary ragged
    // rather than the blur.
    edge: 0.2,
    blur: 0.04,
    amount: 1,
  });
  const underside = float(1).sub(smoothstep(float(UNDER_EDGE[0]), float(UNDER_EDGE[1]), up));

  const material = makeBandedMaterial({
    surface: STONE,
    inlays: [
      { targets: UNDERSIDE, mask: underside },
      { targets: LICHEN, mask: colony.patch },
      { targets: LICHEN_CORE, mask: colony.core },
    ],
    // Fine grain, then a coarse quantised mottle over it: two or three flat
    // patches of slightly different value inside one facet, which is what stops
    // a plane reading as plastic.
    grainScale: 7.5,
    grainAmount: 0.035,
    mottle: { scale: 2.4, amount: 0.085, steps: 3 },
    tone: flankTone(up),
    outline: { color: OUTLINE_COLOR, mask: outlineMask() },
  });
  return new THREE.Mesh(geometry, material);
}
