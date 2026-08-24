// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The building skins: limewash, weathered board, barn boards, dressings and
 * stone, openings, lamps, the outline and the ground. The slate has its own
 * module because it carries two painted systems (farmhouse/roofMaterial.ts).
 *
 * ALL OF THEM GO THROUGH THE ONE TOON RAMP from tsl/toon.ts except the lamplit
 * glass, which is a lamp and is not lit by the sun, and the outline, which is a
 * flat tone by definition.
 *
 * EVERY BREAKUP IS A HARD STEP, AND SMALL. A cel surface breaks up in steps: a
 * low-frequency field thresholded with an edge a couple of pixels wide, so a wall
 * is two flat tones meeting along a crisp line. The threshold sits well off the
 * noise's own mean, so a patch is a defined shape rather than a broad region
 * hovering either side of the line, and the contrast stays near seven luminance
 * points, which is the ceiling at which a patch reads as plaster rather than damp.
 *
 * THE STRUCTURAL BREAKUP IS MODELLED, NOT SPRAYED. The shadow under an eave and
 * under a rake comes from `uv.y`, which the wall builder fills with how far below
 * a roof edge each vertex sits (farmhouse/parts.ts), so it falls where a shadow
 * would fall and follows a rake where a rake is what is over it.
 *
 * EVERY BREAKUP IS ALSO STRETCHED. Limewash weathers in vertical runs and boards
 * in vertical strips; an isotropic noise on both gives the same beige static
 * twice and the buildings stop being made of different materials.
 *
 * THE FREQUENCIES ARE PICKED FOR THE VIEWING DISTANCE. This cluster is never
 * nearer than about 90 m to a gameplay camera, where the 45 degree vertical fov
 * spans roughly 75 m over 1000 px. Nothing here has a period under a metre.
 */

import * as THREE from 'three/webgpu';
import { PALETTE } from '@app/tsl/palette';
import { makeToonMaterial } from '@app/tsl/toon';
import {
  color,
  dot,
  float,
  mix,
  normalLocal,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  uv,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import { bandedBase } from './bands';
import {
  CONTACT,
  OPENING,
  OUTLINE,
  WINDOW_GAIN,
  WINDOW_GLOW,
  YARD,
  YARD_PACKED,
} from './palette';
import { makeFarmhouseSurfaceMaterial } from './surfaceMaterial';

/**
 * Compact world-space brush field in roughly [-1, 1]. Farmhouse ground only
 * needs broad, deterministic painted breakup. MaterialX gradient noise pulled
 * its full helper graph into the first yard pipeline; two crossed sine strokes
 * keep the irregular edge and close-value mottle without that startup cost.
 */
function paintedField(point: TSLNode, phase: number): TSLNode {
  const broad = sin(dot(point, vec3(0.73, 1.17, 1.43)).add(float(phase)));
  const cross = sin(dot(point, vec3(1.61, -0.91, 0.57)).add(float(phase * 1.73 + 0.41)));
  return broad.mul(float(0.68)).add(cross.mul(float(0.32)));
}

/**
 * Limewash. One cream in three values, a hard shadow band under every eave and
 * every rake, a damp course at the footing, and small plaster patches. `level` is
 * the pad the cluster stands on, which is what turns world height into height up
 * a wall without a second attribute.
 */
export function makeWallMaterial(level: number): THREE.MeshBasicNodeMaterial {
  return makeFarmhouseSurfaceMaterial('wall', level);
}

/**
 * Weathered board: the lean-to and the log stack. Vertical strips at a period a
 * pixel can hold, and the same modelled eave shadow the limewash takes, so the
 * shed's end walls carry structure rather than one flat trapezoid of tone.
 */
export function makeTimberMaterial(): THREE.MeshBasicNodeMaterial {
  return makeFarmhouseSurfaceMaterial('timber');
}

/** Board-and-batten rust: vertical strips, at a period a pixel can hold. */
export function makeBarnMaterial(): THREE.MeshBasicNodeMaterial {
  return makeFarmhouseSurfaceMaterial('barn');
}

/**
 * Dressings and masonry, in one draw call. `uv.x` names which: 0 is the plinth
 * course under each building, 1 is the chimney, which takes the stone band set
 * and a hard course line every half metre.
 */
export function makeDressMaterial(): THREE.MeshBasicNodeMaterial {
  return makeFarmhouseSurfaceMaterial('dress');
}

/**
 * Every unlit opening in the cluster, window and door alike: one warm-shifted
 * dark through the same ramp as the wall it sits in. There is no glass tint, no
 * sky reflection and no head shadow, because at a hundred metres none of those
 * survive and all of them cost detail the sheep should be spending instead.
 */
export function makeOpeningMaterial(): THREE.MeshBasicNodeMaterial {
  return makeToonMaterial(bandedBase(OPENING));
}

/**
 * Lamplight behind glass. Not toon-shaded: a window that dimmed with the ramp
 * would go dark on exactly the shadowed end wall the player is looking at. Driven
 * above 1.0 so the post chain's bloom catches it, which is also the spill on the
 * render around the opening.
 */
export function makeLampMaterial(): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = color(WINDOW_GLOW).mul(float(WINDOW_GAIN));
  return material;
}

/**
 * The ground under the cluster. `uv.x` is how much trodden earth covers the grass
 * - above 1 the ground is packed rather than loose - and `uv.y` is how deep the
 * contact shadow at a footing runs; both come from farmhouse/ground.ts, so the
 * yard, the drive, the ruts and the shadow at every wall are one draw call.
 *
 * THE BOUNDARY IS A RAGGED LINE, NOT A HALO. The yard now holds its cover flat
 * and drops it through this threshold inside a metre (farmhouse/ground.ts), and
 * the threshold itself is displaced by the mottle field, so the edge wanders a
 * good third of a metre in and out and the pasture fingers into the earth the way
 * grass does at the edge of a worn patch.
 *
 * TWO EARTHS. Loose dirt round the outside, packed grey-brown down the middle of
 * the yard and in the wheel ruts. One trodden surface with two values in it has
 * structure; one value is a wash.
 *
 * The surround expression is lifted from scene/Terrain.tsx deliberately: the yard
 * has to land on the green the ground already is. That duplication is the one
 * thing in this asset that wants hoisting in the cohesion pass.
 */
export function makeYardMaterial(): THREE.MeshBasicNodeMaterial {
  const yardPoint = vec3(positionWorld.x, float(0), positionWorld.z);
  const patches = paintedField(yardPoint.mul(float(0.07)), 0.7);
  const mottle = paintedField(yardPoint.mul(float(0.26)), 2.3);
  const fine = paintedField(yardPoint.mul(float(0.62)), 5.1);
  const groundBlend = smoothstep(float(-0.35), float(0.35), patches.add(mottle.mul(float(0.45))));
  const surround: TSLNode = color(PALETTE.surround).mul(mix(float(0.94), float(1.06), groundBlend));

  const cover = uv().x;
  const shade = uv().y;
  const packed = smoothstep(float(0.98), float(1.3), cover.add(mottle.mul(float(0.12))));
  const scuffField = paintedField(yardPoint.mul(vec3(0.34, 0.02, 0.34)), 6.7);
  const scuff = smoothstep(float(0.26), float(0.3), scuffField);
  const earth = mix(bandedBase(YARD), bandedBase(YARD_PACKED), packed).mul(
    mix(float(1.0), float(0.95), scuff),
  );

  // The edge. A narrow threshold displaced by two octaves of noise: the step
  // itself stays a step, and where it lands wanders.
  const ragged = cover.add(mottle.mul(float(0.2))).add(fine.mul(float(0.09)));
  const worn = smoothstep(float(0.22), float(0.34), ragged);
  const ground = mix(surround, earth, worn);

  // The contact shadow is a mix toward an authored warm plum, not a gain. A gain
  // cannot cool a warm earth without also greying it, and grey mud at a footing
  // is what makes a building look printed on the ground rather than bedded in it.
  const contact = smoothstep(float(0.02), float(0.7), shade.sub(mottle.mul(float(0.16))));
  return makeToonMaterial(mix(ground, color(CONTACT), contact.mul(float(0.82))));
}

/** How far the hull is pushed out along its normals. Just over a pixel at 100 m. */
const OUTLINE_WIDTH = 0.09;

/**
 * The outline (spec/05: thin, and a darkened warm tone of the surface, never
 * black). An inverted hull over a plain envelope of the buildings, drawn back
 * faces only, so the grown shell shows only where a wall or a roofline meets the
 * sky, the treeline or the grass.
 */
export function makeOutlineMaterial(): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  material.side = THREE.BackSide;
  material.colorNode = color(OUTLINE);
  material.positionNode = positionLocal.add(normalLocal.mul(float(OUTLINE_WIDTH)));
  return material;
}
