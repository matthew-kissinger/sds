// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Cool, dark ground-cover ramp. This material intentionally omits crown sway,
 * sky lift and gold rim so a bramble wedge cannot read as a small fallen tree.
 * A fragment-only family value separates the lighter hawthorn and deeper
 * blackthorn reads without adding a draw or touching the proven vertex path. */

import * as THREE from 'three/webgpu';
import {
  color,
  float,
  instancedBufferAttribute,
  mix,
  positionLocal,
  smoothstep,
  type TSLNode,
} from '@app/tsl/nodes';
import {
  UNDER_BODY,
  UNDER_LIT,
  UNDER_SHADOW,
  recede,
  sunFacing,
  threeBand,
} from './foliage';

export interface ShrubMaterialInputs {
  /** Per-wedge (tint, family), read only by the fragment stage. */
  readonly instances: THREE.InstancedBufferAttribute;
}

export function makeShrubMaterial(inputs: ShrubMaterialInputs): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const instance: TSLNode = instancedBufferAttribute(inputs.instances, 'vec2');
  const tint = instance.x;
  const family = instance.y;
  let tone = threeBand(
    color(UNDER_SHADOW),
    color(UNDER_BODY),
    color(UNDER_LIT),
    sunFacing(),
  );
  const speciesTone = mix(float(0.88), float(0.97), family);
  const boundedTint = mix(float(0.94), float(1), tint).mul(speciesTone);
  const groundContact = mix(
    float(0.72),
    float(1),
    smoothstep(float(0), float(0.42), positionLocal.y),
  );
  tone = tone.mul(boundedTint).mul(groundContact);
  material.colorNode = recede(tone);
  return material;
}

export const SHRUB_ATTRIBUTE_SIZE = 2;
