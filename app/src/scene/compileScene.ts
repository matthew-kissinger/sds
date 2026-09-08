// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import * as THREE from 'three/webgpu';

export const COMPILE_WHEN_HIDDEN = 'compileWhenHidden';

/**
 * Compile everything the honest title camera can submit, with its real scene,
 * geometry and cache keys, before Play becomes actionable.
 *
 * Every field asset, geometry and material is already mounted behind the one
 * Suspense boundary. We deliberately leave the real frustum in charge here:
 * forcing every distant material through Three's serial compiler made the
 * browser miss both boot budgets. Hidden first-bark effects opt in explicitly;
 * they must not defer their material setup until the player's first press.
 */
export async function compileMountedScene(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  target?: THREE.RenderTarget,
): Promise<void> {
  // The caller pauses rendering until this promise settles. Include first-use
  // effects without exposing unrelated hidden objects or changing culling.
  const hidden: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (!object.visible && object.userData[COMPILE_WHEN_HIDDEN] === true) {
      hidden.push(object);
      object.visible = true;
    }
  });
  const previousTarget = target ? renderer.getRenderTarget() : null;
  const previousMrt = target ? renderer.getMRT() : null;
  const previousToneMapping = renderer.toneMapping;
  const previousColorSpace = renderer.outputColorSpace;
  const restoreRenderer = () => {
    if (target) {
      renderer.setRenderTarget(previousTarget);
      renderer.setMRT(previousMrt);
      renderer.toneMapping = previousToneMapping;
      renderer.outputColorSpace = previousColorSpace;
    }
  };
  try {
    if (target) {
      renderer.setRenderTarget(target);
      renderer.setMRT(null);
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.outputColorSpace = THREE.ColorManagement.workingColorSpace;
    }
    await renderer.compileAsync(scene, camera, scene);
  } finally {
    restoreRenderer();
    for (const object of hidden) object.visible = false;
  }
}
