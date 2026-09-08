// SPDX-License-Identifier: AGPL-3.0-or-later
import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { useGameStore } from '@app/state/store';
import { compileMountedScene } from './compileScene';

export function SceneReadySignal({ target }: {
  target?: THREE.RenderTarget;
}) {
  const { gl, scene, camera, setFrameloop } = useThree();
  useLayoutEffect(() => {
    if (useGameStore.getState().sceneReady) return;
    let alive = true;
    let compiled = false;
    let readyFrame = 0;
    let presentedFrame = 0;

    // Stop before R3F submits the newly mounted field. Three's async compiler
    // then asks the browser for every pipeline the honest title camera can
    // submit without turning deferred driver work into a first-frame freeze.
    setFrameloop('never');
    useGameStore.getState().reportBootStep('scene', 1);
    useGameStore.getState().reportBootStep('shaders', 0.05);
    void compileMountedScene(gl as unknown as THREE.WebGPURenderer, scene, camera, target)
      .then(() => {
        if (!alive) return;
        compiled = true;
        useGameStore.getState().reportBootStep('shaders', 1);
      })
      .catch((error: unknown) => {
        console.error('scene_compile_failed', error);
      })
      .finally(() => {
        if (!alive) return;
        setFrameloop('always');
        // A rejected compiler may still let Three attempt an ordinary frame,
        // but Play must never become actionable on that unverified scene.
        if (!compiled) return;
        // One rAF lets R3F submit the compiled field; the second makes the Play
        // button honest by publishing readiness only after that visible frame.
        presentedFrame = window.requestAnimationFrame(() => {
          useGameStore.getState().reportBootStep('presented', 0.5);
          readyFrame = window.requestAnimationFrame(() => {
            if (alive) useGameStore.getState().markSceneReady();
          });
        });
      });

    return () => {
      alive = false;
      window.cancelAnimationFrame(presentedFrame);
      window.cancelAnimationFrame(readyFrame);
      setFrameloop('always');
    };
  }, [camera, gl, scene, setFrameloop, target]);
  return null;
}
