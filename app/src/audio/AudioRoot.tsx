// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { cameraModeBlend } from '@app/camera/CameraRig';
import { useGameStore, type GameStore } from '@app/state/store';
import { HerdAudioGraph } from './graph';
import {
  FlockAudioScheduler,
  scheduleStoreAudio,
  type AudioStoreSnapshot,
} from './scheduler';
import {
  applySoundscape,
  createSoundscapeFrame,
  measureSoundscape,
} from './environment';
import type { AudioCommand } from './types';
import {
  AUDIO_PREFERENCES_CHANGED,
  audioLifecycleCommand,
  audioStoreChangeMask,
} from './lifecycle';

const AudioGraphContext = createContext<HerdAudioGraph | null>(null);

function snapshot(state: GameStore): AudioStoreSnapshot {
  return {
    gamePhase: state.gamePhase,
    uiPanel: state.uiPanel,
    acceptedBark: state.acceptedBark,
    penSerial: state.penSerial,
    penDelta: state.penDelta,
    pennedCount: state.pennedCount,
    completionTick: state.completionTick,
  };
}

function applyPreferences(graph: HerdAudioGraph, state: GameStore): void {
  graph.setMuted(state.muted);
  graph.setReduceTransients(state.reduceMotion);
  for (const [bus, level] of Object.entries(state.audioLevels)) {
    graph.setBusGain(bus as keyof GameStore['audioLevels'], level);
  }
}

/** Owns the one AudioContext. Nothing escapes through a module singleton. */
export function AudioRoot({ children }: PropsWithChildren) {
  const [graph, setGraph] = useState<HerdAudioGraph | null>(null);

  useEffect(() => {
    let alive = true;
    let frameRequest = 0;
    let fallbackTimer = 0;
    let disposeInitialized: (() => void) | null = null;

    const initialize = () => {
      if (!alive) return;
      const nextGraph = new HerdAudioGraph();
      setGraph(nextGraph);
      let previous = snapshot(useGameStore.getState());
      let suspendTimer = 0;
      let preloadStarted = false;
      let unlockClaimed = false;

      applyPreferences(nextGraph, useGameStore.getState());
      const preloadOneShots = () => {
        if (preloadStarted) return;
        preloadStarted = true;
        void nextGraph.preload().catch((error: unknown) => {
          console.error('audio_preload_failed', error);
        });
      };

      const unlock = () => {
        if (unlockClaimed) return;
        unlockClaimed = true;
        // Pointer and keyboard are sibling fallbacks for one activation. Remove
        // both before entering async work so a later key cannot unlock twice.
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
        void nextGraph.unlock().catch((error: unknown) => {
          console.error('audio_unlock_failed', error);
          unlockClaimed = false;
          if (alive) {
            window.addEventListener('pointerdown', unlock, { once: true, capture: true });
            window.addEventListener('keydown', unlock, { once: true, capture: true });
          }
        });
      };
      window.addEventListener('pointerdown', unlock, { once: true, capture: true });
      window.addEventListener('keydown', unlock, { once: true, capture: true });

      const unsubscribe = useGameStore.subscribe((state, previousState) => {
        const changes = audioStoreChangeMask(previousState, state);
        // Runtime diagnostics are intentionally published through Zustand for
        // probes. They must not make the audio graph rebuild snapshots, reapply
        // every gain or reschedule lifecycle work on each diagnostic sample.
        if (changes === 0) return;

        const next = snapshot(state);
        if ((changes & AUDIO_PREFERENCES_CHANGED) !== 0) applyPreferences(nextGraph, state);
        // Renderer assets own the strict navigation budget. Once its honest
        // live frame is ready, warm short sounds sequentially; an immediate
        // click is still lossless because the graph queues commands while the
        // first bark and footfall decode. Long loops remain gesture-streamed.
        if (state.sceneReady) preloadOneShots();
        for (const command of scheduleStoreAudio(previous, next)) nextGraph.execute(command);
        const lifecycle = audioLifecycleCommand(previous.gamePhase, next.gamePhase);
        previous = next;
        if (lifecycle !== null) {
          window.clearTimeout(suspendTimer);
          if (lifecycle === 'suspend') {
            suspendTimer = window.setTimeout(() => void nextGraph.suspend(), 220);
          } else if (document.visibilityState === 'visible') {
            void nextGraph.resume();
          }
        }
      });
      if (useGameStore.getState().sceneReady) preloadOneShots();

      const visibility = () => {
        if (document.visibilityState === 'hidden') void nextGraph.suspend();
        else if (useGameStore.getState().gamePhase !== 'paused') void nextGraph.resume();
      };
      document.addEventListener('visibilitychange', visibility);

      disposeInitialized = () => {
        window.clearTimeout(suspendTimer);
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
        document.removeEventListener('visibilitychange', visibility);
        unsubscribe();
        void nextGraph.dispose();
      };
    };

    const yieldPastPaint = () => {
      if (!alive) return;
      const taskScheduler = (globalThis as typeof globalThis & {
        scheduler?: { yield?: () => Promise<void> };
      }).scheduler;
      if (taskScheduler?.yield !== undefined) {
        void taskScheduler.yield().then(initialize, () => {
          if (alive) fallbackTimer = window.setTimeout(initialize, 0);
        });
      } else {
        fallbackTimer = window.setTimeout(initialize, 0);
      }
    };

    // requestAnimationFrame runs before paint. Yielding once from that callback
    // gives the browser a paint opportunity before AudioContext construction.
    frameRequest = window.requestAnimationFrame(yieldPastPaint);

    return () => {
      alive = false;
      window.cancelAnimationFrame(frameRequest);
      window.clearTimeout(fallbackTimer);
      disposeInitialized?.();
    };
  }, []);

  return (
    <AudioGraphContext.Provider value={graph}>
      {children}
    </AudioGraphContext.Provider>
  );
}

/** A position or a direction, structurally. The pose check needs nothing else. */
interface Triple {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Below this `|forward x up|` the basis has no right vector left to give.
 *
 * A well-formed camera quaternion rotates two orthogonal local axes, so the
 * cross is 1 wherever the camera aims. Measured over a camera walking into the
 * pole - horizontal offsets of 1 m down to 1e-9 m and then exactly 0 - it reads
 * 1.000000000000 at every one, including the frame `lookAt` resolves with its
 * own nudge. So this threshold has an enormous margin against any legitimate
 * framing and fires only on a basis that has already gone wrong.
 */
const MIN_LISTENER_CROSS = 1e-3;

/**
 * Whether a camera pose is safe to hand to the Web Audio listener.
 *
 * Reads nine numbers and allocates nothing; called once a frame.
 */
function usablePose(position: Triple, forward: Triple, up: Triple): boolean {
  const crossX = forward.y * up.z - forward.z * up.y;
  const crossY = forward.z * up.x - forward.x * up.z;
  const crossZ = forward.x * up.y - forward.y * up.x;
  const cross = crossX * crossX + crossY * crossY + crossZ * crossZ;
  return (
    Number.isFinite(cross) &&
    cross >= MIN_LISTENER_CROSS * MIN_LISTENER_CROSS &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Number.isFinite(position.z)
  );
}

/** Mounted inside Canvas: listener and flock scheduling stay outside React state. */
export function AudioScene() {
  const graph = useContext(AudioGraphContext);
  const sim = useGameStore((state) => state.sim);
  const seed = useGameStore((state) => state.seed);
  const scheduler = useMemo(
    () => new FlockAudioScheduler(seed, sim.positions.length / 2),
    [seed, sim],
  );
  const frame = useMemo(createSoundscapeFrame, [scheduler]);
  const commands = useMemo<AudioCommand[]>(() => [], [scheduler]);
  const listener = useMemo(() => ({
    // Scratch for this frame's camera read.
    forward: new THREE.Vector3(),
    up: new THREE.Vector3(),
    // The last pose that passed `usablePose`. Every read of the camera
    // TRANSFORM below goes through these fields - the listener write and the
    // scheduler's distance term both - so there is no second path by which a
    // collapsed basis could reach the audio graph. Seeded to the field origin
    // and the rest orientation `graph.setListener` itself defaults to, so even
    // a first frame under a bad camera is a sane image rather than a silent or
    // inverted one.
    held: {
      x: 0,
      y: 3,
      z: 0,
      forwardX: 0,
      forwardY: 0,
      forwardZ: -1,
      upX: 0,
      upY: 1,
      upZ: 0,
    },
  }), []);

  useFrame(({ camera }) => {
    if (graph === null) return;
    // The listener is the camera, and the camera is two rigs whose eyes stand
    // 53 m and 29 to 36 m from the dog, with a blend between them. The
    // reference distances in `graph.ts` and `soundscape.ts` and the selection
    // weight in `scheduler.ts` are therefore per rig and ride that same weight:
    // Classic never moved and keeps the mix it shipped with, and only Follow is
    // compensated for the eye it moved to. Scaling all three to Follow alone
    // made Classic 2.3 to 2.7 dB louder and changed which sheep it gives a
    // voice. Moving the listener off the camera would make all three
    // unnecessary rather than merely wrong, and that is an audio-spec decision.
    const rigBlend = cameraModeBlend();
    graph.setCameraBlend(rigBlend);
    scheduler.setCameraBlend(rigBlend);
    camera.getWorldDirection(listener.forward);
    listener.up.copy(camera.up).applyQuaternion(camera.quaternion).normalize();
    // The listener copies the camera basis, and the Web Audio panner builds its
    // right vector from cross(forward, up) exactly as the camera does. So a
    // degenerate camera is not only a visual problem: the same frame that flips
    // the horizon inverts or collapses the stereo image with it. Taking the
    // pose only when it is usable holds the mix where it was for those frames -
    // stale rather than inverted - and keeps non-finite values out of the
    // listener's AudioParams, which are not values a panner can interpolate
    // from.
    //
    // This catches a collapsed or non-finite basis. It does NOT catch the pole
    // crossing itself: three's `lookAt` nudges its way out of the singularity
    // and returns a basis that is finite and orthonormal but rotated about the
    // view axis, which no single-frame test can distinguish from a real turn.
    // Only the camera paths that keep the aim away from the pole prevent that.
    const held = listener.held;
    if (usablePose(camera.position, listener.forward, listener.up)) {
      held.x = camera.position.x;
      held.y = camera.position.y;
      held.z = camera.position.z;
      held.forwardX = listener.forward.x;
      held.forwardY = listener.forward.y;
      held.forwardZ = listener.forward.z;
      held.upX = listener.up.x;
      held.upY = listener.up.y;
      held.upZ = listener.up.z;
    }
    graph.setListener(
      held.x,
      held.z,
      held.y,
      held.forwardX,
      held.forwardY,
      held.forwardZ,
      held.upX,
      held.upY,
      held.upZ,
    );
    measureSoundscape(frame, sim);
    applySoundscape(graph, frame, sim);
    commands.length = 0;
    scheduler.scheduleFrame(sim, sim.tick, held.x, held.z, commands);
    for (let i = 0; i < commands.length; i++) graph.execute(commands[i]!);
  });

  return null;
}
