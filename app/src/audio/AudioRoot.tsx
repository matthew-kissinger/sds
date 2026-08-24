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
    forward: new THREE.Vector3(),
    up: new THREE.Vector3(),
  }), []);

  useFrame(({ camera }) => {
    if (graph === null) return;
    camera.getWorldDirection(listener.forward);
    listener.up.copy(camera.up).applyQuaternion(camera.quaternion).normalize();
    graph.setListener(
      camera.position.x,
      camera.position.z,
      camera.position.y,
      listener.forward.x,
      listener.forward.y,
      listener.forward.z,
      listener.up.x,
      listener.up.y,
      listener.up.z,
    );
    measureSoundscape(
      frame,
      sim,
      sim.tick,
      camera.position.x,
      camera.position.z,
    );
    applySoundscape(graph, frame, sim);
    commands.length = 0;
    scheduler.scheduleFrame(sim, sim.tick, camera.position.x, camera.position.z, commands);
    for (let i = 0; i < commands.length; i++) graph.execute(commands[i]!);
  });

  return null;
}
