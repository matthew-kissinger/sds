// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The slate entry point. The authored course, sky-occlusion and weather values
 * live in `surfaceMaterial.ts`, where the roof shares one graph and pipeline
 * cache key with the other four opaque farmhouse skins. This separate factory
 * remains because Farmhouse names surfaces by what they are and the slate's
 * recipe is still independently reviewable in that shared module.
 */

import type * as THREE from 'three/webgpu';
import { makeFarmhouseSurfaceMaterial } from './surfaceMaterial';

export function makeRoofMaterial(): THREE.MeshBasicNodeMaterial {
  return makeFarmhouseSurfaceMaterial('roof');
}
