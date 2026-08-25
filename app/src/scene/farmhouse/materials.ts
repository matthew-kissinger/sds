// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The building skins: limewash, weathered board, barn boards, dressings and
 * stone, openings, lamps and the outline. The slate has its own
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
import { makeToonMaterial } from '@app/tsl/toon';
import {
  color,
  float,
  normalLocal,
  positionLocal,
} from '@app/tsl/nodes';
import { bandedBase } from './bands';
import {
  OPENING,
  OUTLINE,
  WINDOW_GAIN,
  WINDOW_GLOW,
} from './palette';
import { makeFarmhouseSurfaceMaterial } from './surfaceMaterial';

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
