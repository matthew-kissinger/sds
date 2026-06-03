/**
 * Cycle 51 P6: the live flow hook behind the world-first entrance, promoted
 * from the bake-off's useMockFlow and wired to the real engine. It owns the
 * armed world / difficulty / dog (preselected to last-used, the persistent
 * avatar), and surfaces the real scene-load progress to the loading surface.
 *
 * Unlike the mock, `commit` does not fake a timer: it hands off to `onPlay`
 * (the StartScreen orchestration that builds the armed scene and starts the
 * game), and the loading bar is driven by the real per-stage build marks via
 * js/boot/loadProgress.js. No simulated RAF here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from '../ui/useReducedMotion';
import { WORLDS, DOGS, MODES, WAYS, defaultWorldIndex, type World, type Dog, type Mode, type Way } from './worlds';
import { subscribeGameEvent } from '../../GameBridge.js';
import { mapLoadStep, FIRST_LOAD_LABEL } from './loadStages';

const LAST_WORLD = 'sds.last-world';
const LAST_DOG = 'sds.last-dog';
const LAST_MODE = 'sds.last-mode';

function readLS(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLS(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* privacy mode: skip */ }
}

export interface BootLoading {
  pct: number;
  label: string;
  done: boolean;
}

export interface BootFlow {
  worlds: World[];
  dogs: Dog[];
  modes: Mode[];
  ways: Way[];
  world: World;
  mode: Mode;
  dog: Dog;
  worldIndex: number;
  armWorld: (id: string) => void;
  nextWorld: () => void;
  prevWorld: () => void;
  setMode: (id: string) => void;
  setDog: (id: string) => void;
  commit: () => void;
  loading: BootLoading;
  reducedMotion: boolean;
}

export interface BootFlowOptions {
  /** Called when Play commits; receives the armed selection. */
  onPlay: (world: World, dog: Dog, mode: Mode) => void;
}

export function useBootFlow({ onPlay }: BootFlowOptions): BootFlow {
  const reducedMotion = useReducedMotion();

  const [worldIndex, setWorldIndex] = useState(() => defaultWorldIndex(readLS(LAST_WORLD)));
  const [modeId, setModeId] = useState(() => readLS(LAST_MODE) ?? MODES[0].id);
  const [dogId, setDogId] = useState(() => readLS(LAST_DOG) ?? DOGS[0].id);

  // The real loading bar: the boot emits 'scene-load-step' per build mark; we
  // map the raw label (carried on a window global) to a friendly caption + a
  // calibrated fraction. Monotonic so it never jumps backward within a build.
  const [load, setLoad] = useState<{ pct: number; label: string }>({ pct: 0, label: '' });
  useEffect(() => subscribeGameEvent('scene-load-step', () => {
    const label = typeof window !== 'undefined' ? (window as { __sdsLoadStep?: string }).__sdsLoadStep : '';
    const m = label ? mapLoadStep(label) : null;
    if (m) setLoad((prev) => ({ pct: Math.max(prev.pct, m.pct), label: m.label }));
  }), []);

  const world = WORLDS[worldIndex] ?? WORLDS[0];
  const mode = useMemo(() => MODES.find((m) => m.id === modeId) ?? MODES[0], [modeId]);
  const dog = useMemo(() => DOGS.find((d) => d.id === dogId) ?? DOGS[0], [dogId]);

  const armWorld = useCallback((id: string) => {
    const i = WORLDS.findIndex((w) => w.id === id);
    if (i >= 0) { setWorldIndex(i); writeLS(LAST_WORLD, id); }
  }, []);
  const nextWorld = useCallback(() => setWorldIndex((i) => {
    const next = (i + 1) % WORLDS.length;
    writeLS(LAST_WORLD, WORLDS[next].id);
    return next;
  }), []);
  const prevWorld = useCallback(() => setWorldIndex((i) => {
    const next = (i - 1 + WORLDS.length) % WORLDS.length;
    writeLS(LAST_WORLD, WORLDS[next].id);
    return next;
  }), []);
  const setMode = useCallback((id: string) => { setModeId(id); writeLS(LAST_MODE, id); }, []);
  const setDog = useCallback((id: string) => { setDogId(id); writeLS(LAST_DOG, id); }, []);

  const commit = useCallback(() => {
    setLoad({ pct: 0, label: FIRST_LOAD_LABEL }); // reset the bar for this build
    onPlay(world, dog, mode);
  }, [onPlay, world, dog, mode]);

  return {
    worlds: WORLDS,
    dogs: DOGS,
    modes: MODES,
    ways: WAYS,
    world,
    mode,
    dog,
    worldIndex,
    armWorld,
    nextWorld,
    prevWorld,
    setMode,
    setDog,
    commit,
    loading: {
      pct: load.pct,
      label: load.label,
      done: load.pct >= 100,
    },
    reducedMotion,
  };
}
