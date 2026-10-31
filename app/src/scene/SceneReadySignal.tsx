// SPDX-License-Identifier: AGPL-3.0-or-later
import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { useGameStore } from '@app/state/store';
import { compileMountedScene } from './compileScene';

/**
 * Owns the compile window: pauses the loop, compiles everything the camera
 * can submit against `target`, resumes, and marks the scene ready two frames
 * later.
 *
 * Host contract: the Canvas must hold `frameloop="never"` until
 * `sceneReady` (as App.tsx and the lab do). Fiber's `setFrameloop('never')`
 * only changes the mode; frames that mounting the field already requested
 * through `invalidate()` stay queued and still run (fiber 9.8.2 loop.ts). A
 * frame drawn while `compileAsync` is mid-flight used to share the compiler's
 * renderer state, and WebGPU rejected the scene target as a read and a write
 * of "output" in one synchronisation scope. r187 restores that state around
 * the yield (#34506). The pause stays: a frame submitted mid-compile is still
 * the wrong picture, and Play waits for the compiled field. With the prop on
 * `never`, `invalidate()` is a no-op during the mount and nothing is queued
 * (lab bisect, 2026-10-16).
 */
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
