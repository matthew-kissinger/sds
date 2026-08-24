// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The dark grass at the foot of every solid. One disc, instanced, one draw call.
 *
 * WHY IT HAS TO EXIST. This scene has no shadow pass: the toon ramp is a
 * function of a surface normal (tsl/toon.ts), so a boulder resting in a meadow
 * casts nothing and the grass under it is lit exactly as brightly as the grass
 * beside it. That is the whole reason round one's stones read as decals sitting
 * on the field rather than as objects in it, and the critic named it: nothing
 * looked buried. A painter fixes this in one stroke - the grass at the foot of a
 * stone is in the stone's shade - and so does this.
 *
 * PLAIN ALPHA, HALF STRENGTH. The first build reached for `MultiplyBlending`,
 * which is the correct operator for shade and would have kept the pasture's own
 * hue underneath it. It did not survive the trip: the capture came back with a
 * white plate under every stone, because the blend mode was not applied and the
 * disc's rim colour - white, the multiply identity - was simply painted over the
 * field. Measured, not guessed, and the lesson is the ordinary one: use the
 * blend every backend agrees about. So this is a shaded green laid over the
 * pasture at half opacity, authored close enough to the grass that the tint
 * reads as the same field in shade rather than as a foreign colour.
 *
 * The tone is warm-olive rather than neutral for the same reason the stone's
 * shadow band is: everything that darkens in this field darkens toward umber,
 * because there is no cool bounce in a meadow at golden hour.
 *
 * DEPTH-TESTED, DEPTH-WRITING OFF. Grass tufts standing in front of a blob
 * occlude it, blobs never occlude each other, and nothing here disturbs the
 * order of the opaque pass.
 */

import * as THREE from 'three/webgpu';
import type { Heightfield } from '@app/world/heightfield';
import { clamp, color, float, pow, smoothstep, uv, type TSLNode } from '@app/tsl/nodes';
import type { ContactSpot } from './placement';

/** Sides of the disc. Sixteen: the rim is invisible by construction (it fades
 *  to no effect at all), so this only has to avoid reading as a polygon. */
const SIDES = 16;

/**
 * The colour laid over the grass, and how much of it lands at the very centre of
 * a blob.
 *
 * IT WENT DARKER AND COOLER, AND THAT IS MEASURED. The last set laid #4f5a33 at
 * 0.66 over pasture, which lands about a tenth under the grass around it - and a
 * tenth is not visible at any of the four cameras, which is exactly the note.
 * These numbers put the darkest ground near luminance 0.30 against open pasture
 * at 0.50, a drop of two fifths, which is a shadow a viewer can see. It stays a
 * SHADE and not a hole: a cool green-slate over the field's own green, so the
 * pasture's hue survives under it.
 *
 * It is also only half the answer. A flat disc lying on the ground is largely
 * hidden by the blade layer standing over it, so the darkening a player actually
 * reads is the dark grass collar (scatter/baseGrass.ts) that grows out of the
 * same spots. The disc is what fills the gaps between those blades.
 */
const SHADE = '#3b4430';
const CORE_ALPHA = 0.74;
/** How the darkening falls off from centre to rim. Above 1 keeps the deep part
 *  tight under the object and lets the rest feather out into the grass. */
const FALLOFF_POWER = 1.4;
/** Metres the disc floats above the ground line. Enough to clear the terrain's
 *  own relief across its own width without ever reading as a hovering plate. */
const LIFT = 0.06;
/** How far a disc rolls onto the ground's normal, 0..1. All the way: unlike a
 *  boulder, a shadow has no reason not to lie flush. */
const SETTLE = 1;

/**
 * A fan with uv.x carrying the radius: 0 at the centre, 1 at the rim. That one
 * channel is the whole shader, and it costs no texture and no alpha map.
 */
function buildDiscGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array((SIDES + 2) * 3);
  const uvs = new Float32Array((SIDES + 2) * 2);
  const indices = new Uint16Array(SIDES * 3);

  uvs[0] = 0;
  uvs[1] = 0;
  for (let s = 0; s <= SIDES; s++) {
    const angle = (s / SIDES) * Math.PI * 2;
    const at = (s + 1) * 3;
    positions[at] = Math.cos(angle);
    positions[at + 1] = 0;
    positions[at + 2] = Math.sin(angle);
    uvs[(s + 1) * 2] = 1;
    uvs[(s + 1) * 2 + 1] = 0;
  }
  for (let s = 0; s < SIDES; s++) {
    indices[s * 3] = 0;
    indices[s * 3 + 1] = s + 2;
    indices[s * 3 + 2] = s + 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function makeContactMaterial(): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const radius: TSLNode = uv().x;
  const strength = pow(
    clamp(float(1).sub(smoothstep(float(0), float(1), radius)), float(0), float(1)),
    float(FALLOFF_POWER),
  );
  material.colorNode = color(SHADE);
  material.opacityNode = strength.mul(float(CORE_ALPHA));
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.FrontSide;
  return material;
}

const UP = new THREE.Vector3(0, 1, 0);

export function buildContactMesh(
  field: Heightfield,
  spots: readonly ContactSpot[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(buildDiscGeometry(), makeContactMaterial(), spots.length);
  const dummy = new THREE.Object3D();
  const normal = { x: 0, y: 1, z: 0 };
  const settled = new THREE.Vector3();

  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i]!;
    field.normal(spot.x, spot.z, normal);
    settled.set(normal.x * SETTLE, 1 - SETTLE + normal.y * SETTLE, normal.z * SETTLE).normalize();
    dummy.position.set(spot.x, field.groundY(spot.x, spot.z) + LIFT, spot.z);
    dummy.quaternion.setFromUnitVectors(UP, settled);
    dummy.scale.set(spot.radius, 1, spot.radius);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  // Draw after the opaque field, before nothing: these only ever darken ground
  // that is already on the screen.
  mesh.renderOrder = 1;
  return mesh;
}
