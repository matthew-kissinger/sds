// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { Suspense, useLayoutEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  detectRendererBackend,
  glFactory,
  measureRendererFill,
  rendererBackendName,
} from './scene/glFactory';
import { FieldScene, preloadFieldSceneAssets } from './scene/FieldScene';
import { CameraRig } from './camera/CameraRig';
import { IntentResolver } from './input/IntentResolver';
import { TouchControls } from './input/TouchControls';
import { Boot } from './ui/Boot';
import { Hud } from './ui/Hud';
import { SettingsPanel } from './ui/SettingsPanel';
import { CustomizePanel } from './ui/CustomizePanel';
import { UiStyles } from './ui/UiStyles';
import { useReducedMotion } from './ui/useReducedMotion';
import { UI_TOKENS } from './ui/tokens';
import { useGameStore } from './state/store';
import { useHeightfield } from './world/heightfield';
import { AudioRoot, AudioScene } from './audio/AudioRoot';
import { ScoresRoot } from './scores/ScoresRoot';
import { compileMountedScene } from './scene/compileScene';
import {
  fallbackAutoTier,
  renderDprForTier,
  resolvedRenderTier,
} from './quality/autoTier';
import { RuntimeQualityGovernor } from './quality/RuntimeQualityGovernor';

function trackedGlFactory(props: Parameters<typeof glFactory>[0]) {
  const report = useGameStore.getState().reportBootStep;
  report('renderer', 0.05);
  return glFactory(props).then((renderer) => {
    report('renderer', 1);
    return renderer;
  });
}

function CapabilityProbe() {
  const { gl, setFrameloop } = useThree();
  useLayoutEffect(() => {
    let alive = true;
    let frame = 0;
    // Pause from the mount layout effect, before R3F submits an expendable
    // empty-canvas frame. On a 4x CPU profile that output-node build alone was
    // a 137 ms task. The fill probe below creates the first renderer work while
    // field assets continue downloading in parallel.
    setFrameloop('never');
    useGameStore.getState().reportBootStep('capability', 0.05);
    frame = window.requestAnimationFrame(() => {
      void (async () => {
        const renderer = gl as unknown as THREE.WebGPURenderer;
        // WebGL2 is the conservative fallback only if even backend inspection
        // fails. glFactory normally publishes the exact backend before mount.
        let backend: 'webgpu' | 'webgl2' = 'webgl2';
        try {
          const reportedBackend = rendererBackendName();
          backend = reportedBackend === 'pending'
            ? detectRendererBackend(renderer)
            : reportedBackend;
          const receipt = await measureRendererFill(
            renderer,
            backend,
          );
          if (alive) {
            useGameStore.getState().reportBootStep('capability', 1);
            useGameStore.getState().recordAutoTier(receipt);
          }
        } catch (error: unknown) {
          console.error('scene_boot_failed', error);
          if (alive) {
            useGameStore.getState().reportBootStep('capability', 1);
            useGameStore.getState().recordAutoTier(fallbackAutoTier(backend));
          }
        }
        if (!alive) return;
        // Keep rendering paused across the capability-to-field React commit.
        // The capability receipt mounts the field while the Canvas prop stays
        // paused. SceneReadySignal alone resumes after the title view compiles.
      })();
    });
    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
    };
  }, [gl, setFrameloop]);
  return null;
}

function SceneReadySignal() {
  const { gl, scene, camera, setFrameloop } = useThree();
  useLayoutEffect(() => {
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
    void compileMountedScene(gl as unknown as THREE.WebGPURenderer, scene, camera)
      .then(() => {
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
  }, [camera, gl, scene, setFrameloop]);
  return null;
}

function ColorblindDogMarker() {
  const field = useHeightfield();
  const marker = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const dog = useGameStore.getState().sim.state.dogs[0];
    if (!marker.current || dog === undefined) return;
    const { x, z } = dog.position;
    marker.current.position.set(x, field.groundY(x, z) + 0.045, z);
  });
  return (
    <mesh ref={marker} rotation-x={-Math.PI / 2} renderOrder={8}>
      <ringGeometry args={[1.08, 1.22, 48]} />
      <meshBasicMaterial
        color={UI_TOKENS.color.marker}
        transparent
        opacity={0.82}
        depthWrite={false}
      />
    </mesh>
  );
}

function HerdApp() {
  const gamePhase = useGameStore((state) => state.gamePhase);
  const uiPanel = useGameStore((state) => state.uiPanel);
  const sceneReady = useGameStore((state) => state.sceneReady);
  const quality = useGameStore((state) => state.quality);
  const autoTierReceipt = useGameStore((state) => state.autoTierReceipt);
  const colorblindMarker = useGameStore((state) => state.colorblindMarker);
  const reducedMotion = useReducedMotion();
  preloadFieldSceneAssets(useGameStore.getState().reportBootStep);
  const capabilityReady = autoTierReceipt !== null;
  const renderTier = resolvedRenderTier(quality, autoTierReceipt);
  const dpr = renderDprForTier(renderTier);

  return (
    <AudioRoot>
      <ScoresRoot />
      <div
        className="herd-app"
        data-phase={gamePhase}
        data-ready={sceneReady}
        data-reduced-motion={reducedMotion}
        data-render-tier={renderTier}
        data-backend={autoTierReceipt?.backend ?? 'pending'}
        data-device-class={autoTierReceipt?.deviceClass ?? 'pending'}
        data-tier-reason={autoTierReceipt?.reason ?? 'pending'}
        data-tier-demotions={autoTierReceipt?.runtimeDemotions ?? 0}
        data-fill-ms={autoTierReceipt === null ? '' : autoTierReceipt.fillMs.toFixed(2)}
      >
        <UiStyles />
        <Canvas
          gl={trackedGlFactory as never}
          dpr={dpr}
          // The capability probe needs one live frame. Its receipt causes this
          // React commit to mount the field, and that commit must stay paused:
          // otherwise Canvas reapplies `always` while compileMountedScene has
          // only begun its first async pipeline and the ordinary render loop
          // synchronously steals the rest. SceneReadySignal owns the resume.
          frameloop={capabilityReady && !sceneReady ? 'never' : 'always'}
          camera={{ position: [-20, 52, -98], fov: 45, near: 0.5, far: 1200 }}
        >
          <IntentResolver />
          <RuntimeQualityGovernor />
          {capabilityReady ? (
            <Suspense fallback={null}>
              <FieldScene />
              {colorblindMarker ? <ColorblindDogMarker /> : null}
              <SceneReadySignal />
            </Suspense>
          ) : <CapabilityProbe />}
          <CameraRig />
          <AudioScene />
        </Canvas>
        {uiPanel === 'none' ? <Boot /> : null}
        {gamePhase !== 'title' ? <Hud /> : null}
        {uiPanel === 'settings' ? <SettingsPanel /> : null}
        {uiPanel === 'customize' ? <CustomizePanel /> : null}
        <TouchControls />
      </div>
    </AudioRoot>
  );
}

export function App() {
  return <HerdApp />;
}
