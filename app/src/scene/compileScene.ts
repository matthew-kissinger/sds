// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import * as THREE from 'three/webgpu';

/**
 * Compile everything the honest title camera can submit, with its real scene,
 * geometry and cache keys, before Play becomes actionable.
 *
 * Every field asset, geometry and material is already mounted behind the one
 * Suspense boundary. We deliberately leave the real frustum in charge here:
 * forcing every distant material through Three's serial compiler made the
 * browser miss both boot budgets, while the production profiler still guards
 * every later first-use frame with an absolute 100 ms freeze ceiling.
 */
export async function compileMountedScene(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Promise<void> {
  await renderer.compileAsync(scene, camera, scene);
}
