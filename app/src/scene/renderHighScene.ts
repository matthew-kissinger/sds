// SPDX-License-Identifier: AGPL-3.0-or-later
import * as THREE from 'three/webgpu';

/** Render at the same top-level context used by compileMountedScene. */
export function renderHighScene(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  target: THREE.RenderTarget,
  size: THREE.Vector2,
): void {
  renderer.getDrawingBufferSize(size);
  target.setSize(size.x, size.y);
  const previousTarget = renderer.getRenderTarget();
  const previousMrt = renderer.getMRT();
  const previousToneMapping = renderer.toneMapping;
  const previousColorSpace = renderer.outputColorSpace;
  const previousAutoClear = renderer.autoClear;
  const previousOpaque = renderer.opaque;
  const previousTransparent = renderer.transparent;
  try {
    renderer.setRenderTarget(target);
    renderer.setMRT(null);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.ColorManagement.workingColorSpace;
    renderer.autoClear = true;
    renderer.opaque = true;
    renderer.transparent = true;
    renderer.render(scene, camera);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setMRT(previousMrt);
    renderer.toneMapping = previousToneMapping;
    renderer.outputColorSpace = previousColorSpace;
    renderer.autoClear = previousAutoClear;
    renderer.opaque = previousOpaque;
    renderer.transparent = previousTransparent;
  }
}
