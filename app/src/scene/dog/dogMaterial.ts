// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Coat and outline share the native SkinnedMesh transform on both TSL backends. */
import * as THREE from 'three/webgpu';
import { float, mix, normalLocal, positionLocal, smoothstep, uniform, uv, type TSLNode } from '@app/tsl/nodes';
import { outlineColor, paintDog } from './dogMarkings';
import { COAT_LIT, COAT_MID, COAT_SHADOW, OUTLINE } from './coatTones';
import { makeDogSurface, shadeDog } from './dogToon';
export interface DogMaterial {
  readonly material: THREE.MeshBasicNodeMaterial;
  readonly outlineMaterial: THREE.MeshBasicNodeMaterial;
  readonly outlineWidth: TSLNode;
  readonly coatUniforms: { readonly shadow: TSLNode; readonly mid: TSLNode; readonly lit: TSLNode; readonly outline: TSLNode };
}
export function makeDogMaterial(): DogMaterial {
  const outlineWidth = uniform(0.03);
  const shadow = uniform(new THREE.Color(COAT_SHADOW));
  const mid = uniform(new THREE.Color(COAT_MID));
  const lit = uniform(new THREE.Color(COAT_LIT));
  const outline = uniform(new THREE.Color(OUTLINE));
  const material = makeDogSurface(shadeDog(paintDog({ shadow, mid, lit })));
  const outlineMaterial = makeDogSurface(outlineColor(outline));
  outlineMaterial.side = THREE.BackSide;
  // NodeMaterial applies skeletal positions and normals before positionNode.
  // Paint remains in positionGeometry bind space, so coat identity cannot swim.
  const hullScale = mix(float(0.55), float(1), smoothstep(float(0), float(0.2), uv().x));
  outlineMaterial.positionNode = positionLocal.add(normalLocal.mul(outlineWidth).mul(hullScale));
  return { material, outlineMaterial, outlineWidth, coatUniforms: { shadow, mid, lit, outline } };
}
