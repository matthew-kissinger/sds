// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
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
import { WORLDS, DOGS, MODES, WAYS, DEFAULT_WORLD_INDEX, modesForWorld, familiesForWorld, type World, type Dog, type Mode, type Way, type ModeFamily } from './worlds';
import { subscribeGameEvent } from '../../GameBridge.js';
import { COUNTING_GAME_MODE, COUNTING_CURVES } from '../../../shared/countingModes.js';
import { mapLoadStep, FIRST_LOAD_LABEL } from './loadStages';

const LAST_DOG = 'selectedDog';
const LEGACY_LAST_DOG = 'sds.last-dog';
const LAST_MODE = 'sds.last-mode';
// Cycle 59 (Counting Sheep): the chosen family and the counting curve persist
// separately from the solo difficulty, so visiting Counting Sheep does not erase
// the player's last solo difficulty (and vice versa).
const LAST_FAMILY = 'sds.last-family';
const LAST_CURVE = 'sds.last-curve';

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
  /** Cycle 59: the armed world's mode families + the active one. */
  families: ModeFamily[];
  family: ModeFamily;
  setFamily: (id: string) => void;
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
  /** Called when Play commits; receives the armed selection + the family's
   * top-level gameMode ('solo' | 'counting') so the caller dispatches the
   * right start path. */
  onPlay: (world: World, dog: Dog, mode: Mode, gameMode: string) => void;
}

export function useBootFlow({ onPlay }: BootFlowOptions): BootFlow {
  const reducedMotion = useReducedMotion();

  // The entrance always lands on the default world; only dog + mode + family
  // persist per-player. Browsing worlds is session-local.
  const [worldIndex, setWorldIndex] = useState(DEFAULT_WORLD_INDEX);
  const [modeId, setModeId] = useState(() => readLS(LAST_MODE) ?? MODES[0].id);
  const [curveId, setCurveId] = useState(() => readLS(LAST_CURVE) ?? COUNTING_CURVES[0]);
  const [familyId, setFamilyId] = useState(() => readLS(LAST_FAMILY) ?? '');
  const [dogId, setDogId] = useState(() => readLS(LAST_DOG) ?? readLS(LEGACY_LAST_DOG) ?? DOGS[0].id);

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

  // Cycle 59: the armed world's mode families. A multi-family world (Home Field,
  // Rolling Hills) exposes Classic + Counting Sheep; a single-family world (Open
  // Country = Objective) renders the family as a label. The active family falls
  // back to the world's first family when the persisted choice is not offered
  // here (e.g. Counting Sheep on Open Country).
  const families = useMemo(() => familiesForWorld(world.id), [world.id]);
  const family = useMemo(
    () => families.find((f) => f.id === familyId) ?? families[0],
    [families, familyId],
  );
  const isCounting = family.gameMode === COUNTING_GAME_MODE;

  // Cycle 58/59: rung options come from the ACTIVE FAMILY (the solo ladder for
  // Classic/Objective, the two curves for Counting Sheep). The active rung is
  // tracked per family-kind: counting uses curveId, the rest use modeId. When
  // the tracked id is not a rung here (world or family swap), fall back to the
  // 'classic' rung, then any ranked rung, then the first - always valid.
  const modes = family.rungs;
  const activeRungId = isCounting ? curveId : modeId;
  const mode = useMemo(
    () =>
      modes.find((m) => m.id === activeRungId)
      ?? modes.find((m) => m.id === 'classic')
      ?? modes.find((m) => m.ranked)
      ?? modes[0],
    [modes, activeRungId],
  );
  const dog = useMemo(() => DOGS.find((d) => d.id === dogId) ?? DOGS[0], [dogId]);

  const armWorld = useCallback((id: string) => {
    const i = WORLDS.findIndex((w) => w.id === id);
    if (i >= 0) setWorldIndex(i);
  }, []);
  const nextWorld = useCallback(() => setWorldIndex((i) => (i + 1) % WORLDS.length), []);
  const prevWorld = useCallback(() => setWorldIndex((i) => (i - 1 + WORLDS.length) % WORLDS.length), []);
  const setFamily = useCallback((id: string) => { setFamilyId(id); writeLS(LAST_FAMILY, id); }, []);
  // Route the chosen rung id to the right persistence slot for the active family
  // so the solo difficulty and the counting curve do not clobber each other.
  const setMode = useCallback((id: string) => {
    if (isCounting) { setCurveId(id); writeLS(LAST_CURVE, id); }
    else { setModeId(id); writeLS(LAST_MODE, id); }
  }, [isCounting]);
  const setDog = useCallback((id: string) => { setDogId(id); writeLS(LAST_DOG, id); }, []);

  const commit = useCallback(() => {
    setLoad({ pct: 0, label: FIRST_LOAD_LABEL }); // reset the bar for this build
    onPlay(world, dog, mode, family.gameMode);
  }, [onPlay, world, dog, mode, family.gameMode]);

  return {
    worlds: WORLDS,
    dogs: DOGS,
    modes,
    ways: WAYS,
    world,
    mode,
    dog,
    worldIndex,
    families,
    family,
    setFamily,
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
