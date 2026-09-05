// SPDX-License-Identifier: AGPL-3.0-or-later
import * as THREE from 'three/webgpu';
import { PALETTE } from '@app/tsl/palette';
import {
  attribute, color, float, hash, instanceIndex, instancedBufferAttribute,
  mix, normalWorld, positionGeometry, positionLocal, positionWorld, sin, smoothstep, step,
  time, vec3, type TSLNode,
} from '@app/tsl/nodes';
import { TREE_VERTICAL_DRIFT_MAX } from './diagnostics';
import { WIND_X, WIND_Z, aerial, gustAt, recede, sunFacing, threeBand } from './foliage';

export interface CanopyMaterialInputs {
  /** Fragment-only tint, turning and family. Vertex variation uses built-in index. */
  readonly instances: THREE.InstancedBufferAttribute;
}
export const CANOPY_ATTRIBUTE_SIZE = 3;
/** Placement is sorted by family; never read instance buffers in the vertex stage. */
export const CANOPY_FAMILY_STARTS = [57, 70, 111] as const;

export function makeCanopyMaterial(inputs: CanopyMaterialInputs): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const instance: TSLNode = instancedBufferAttribute(inputs.instances, 'vec3');
  const shape = hash(instanceIndex);
  const index = float(instanceIndex);
  const compact = step(float(CANOPY_FAMILY_STARTS[0]), index)
    .mul(float(1).sub(step(float(CANOPY_FAMILY_STARTS[1]), index)));
  const leaning = step(float(CANOPY_FAMILY_STARTS[2]), index);
  // positionLocal already includes the instance transform in Three's node path.
  // Shape coordinates must come from positionGeometry, or distant crowns shift.
  const upper = smoothstep(float(0.42), float(1), positionGeometry.y);
  const shapeX = positionGeometry.x.mul(compact.mul(float(-0.06)))
    .add(upper.mul(leaning).mul(float(0.028)));
  const part = attribute('crownPart');
  // Small motion around generous branch/canopy overlap, never vertical bobbing.
  const gust = gustAt(positionWorld.x, positionWorld.z);
  const sway = gust.mul(float(0.14))
    .add(sin(time.mul(float(0.8)).add(shape.mul(float(17)))).mul(float(0.035)))
    .mul(upper);
  material.positionNode = positionLocal.add(vec3(
    shapeX.add(sway.mul(float(WIND_X))),
    float(TREE_VERTICAL_DRIFT_MAX),
    sway.mul(float(WIND_Z)),
  ));

  // Broad pigment patches shape the light boundary, without leaf-scale shimmer.
  const brush = sin(positionGeometry.x.mul(float(19)).add(positionGeometry.z.mul(float(14)))
    .add(part.mul(float(2.3))))
    .mul(sin(positionGeometry.y.mul(float(21)).sub(positionGeometry.z.mul(float(9)))))
    .mul(float(0.024)).mul(float(1).sub(aerial()));
  const skyward = smoothstep(float(0.1), float(0.9), normalWorld.y);
  const light = sunFacing().add(brush).add(skyward.mul(float(0.04)));
  const body = mix(color(PALETTE.treeBody), color(PALETTE.treeTurning), instance.y.mul(float(0.45)));
  const banded = threeBand(color(PALETTE.treeShadow), body, color(PALETTE.treeLit), light);
  const tint = mix(float(0.97), float(1.03), instance.x);
  material.colorNode = recede(banded.mul(tint).add(color(PALETTE.sunGlow).mul(skyward).mul(float(0.014))));
  return material;
}
