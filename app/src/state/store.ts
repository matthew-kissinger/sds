// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { create } from 'zustand';
import { CpuDeterministicSim } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import type { AutoTierReceipt } from '@app/quality/autoTier';
import {
  EMPTY_BOOT_PROGRESS,
  clampBootProgress,
  type BootProgress,
  type BootStep,
} from '@app/boot/progress';

export type GamePhase = 'title' | 'playing' | 'paused' | 'complete';
export type UiPanel = 'none' | 'pause' | 'settings';
export type FlockSize = 25 | 75 | 200;
export const FLOCK_SIZES: readonly FlockSize[] = [25, 75, 200];
export type CameraMode = 'classic' | 'follow';
export type QualityPreference = 'auto' | 'high' | 'medium' | 'low';
export type InputAction =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'sprint'
  | 'bark'
  | 'camera';
export type InputBindings = Readonly<Record<InputAction, string>>;
export type AudioBusPreference = 'ambient' | 'flock' | 'dog' | 'world' | 'ui';
export type AudioLevels = Readonly<Record<AudioBusPreference, number>>;

/** Debug-only presentation receipts sampled by tools/playtest-profile.mjs. */
export interface RuntimeDiagnostics {
  readonly sheepFootErrorMax: number | null;
  readonly sheepAirborne: number | null;
  readonly sheepTurnStepMax: number | null;
  readonly dogTurnStep: number | null;
  readonly treeGroundErrorMax: number | null;
  readonly treeSupportGapMax: number | null;
  readonly treeUnsupported: number | null;
  readonly treeVerticalDriftMax: number | null;
}

const EMPTY_RUNTIME_DIAGNOSTICS: RuntimeDiagnostics = {
  sheepFootErrorMax: null,
  sheepAirborne: null,
  sheepTurnStepMax: null,
  dogTurnStep: null,
  treeGroundErrorMax: null,
  treeSupportGapMax: null,
  treeUnsupported: null,
  treeVerticalDriftMax: null,
};

export const DEFAULT_INPUT_BINDINGS: InputBindings = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  bark: 'Space',
  camera: 'KeyC',
};
export const DEFAULT_AUDIO_LEVELS: AudioLevels = {
  ambient: 0.34,
  flock: 0.72,
  dog: 0.72,
  world: 0.72,
  ui: 0.62,
};

type PersonalBests = Readonly<Record<FlockSize, number | null>>;

export interface AcceptedBark {
  readonly serial: number;
  readonly tick: number;
  readonly dog: number;
  readonly x: number;
  readonly z: number;
}

interface StoredSettings {
  readonly quality?: QualityPreference;
  readonly reduceMotion?: boolean;
  readonly colorblindMarker?: boolean;
  readonly showTimer?: boolean;
  readonly inputBindings?: Partial<Record<InputAction, string>>;
  readonly muted?: boolean;
  readonly audioLevels?: Partial<AudioLevels>;
}

export interface GameStore {
  readonly gamePhase: GamePhase;
  readonly uiPanel: UiPanel;
  readonly sceneReady: boolean;
  readonly bootProgress: BootProgress;
  readonly flockSize: FlockSize;
  readonly pennedCount: number;
  readonly penSerial: number;
  readonly penDelta: number;
  readonly acceptedBark: AcceptedBark | null;
  readonly completionTick: number;
  readonly completionTimeMs: number;
  readonly personalBests: PersonalBests;
  readonly lastRunWasBest: boolean;
  readonly cameraMode: CameraMode;
  readonly quality: QualityPreference;
  /** One measured boot capability receipt, held for the browser session. */
  readonly autoTierReceipt: AutoTierReceipt | null;
  readonly reduceMotion: boolean;
  readonly colorblindMarker: boolean;
  readonly showTimer: boolean;
  readonly inputBindings: InputBindings;
  readonly muted: boolean;
  readonly audioLevels: AudioLevels;
  readonly runtimeDiagnostics: RuntimeDiagnostics;
  readonly seed: number;
  readonly sim: CpuDeterministicSim;

  markSceneReady(): void;
  reportBootStep(step: BootStep, fraction: number): void;
  startGame(flockSize: FlockSize): void;
  pause(): void;
  resume(): void;
  openSettings(): void;
  closeSettings(): void;
  sheepPenned(pennedCount: number): void;
  barkAccepted(event: AcceptedBark): void;
  complete(completionTimeMs: number, completionTick?: number): void;
  reset(): void;
  setCameraMode(cameraMode: CameraMode): void;
  setQuality(quality: QualityPreference): void;
  recordAutoTier(receipt: AutoTierReceipt): void;
  demoteAutoTier(): void;
  setReduceMotion(reduceMotion: boolean): void;
  setColorblindMarker(colorblindMarker: boolean): void;
  setShowTimer(showTimer: boolean): void;
  setInputBinding(action: InputAction, code: string): void;
  setMuted(muted: boolean): void;
  setAudioLevel(bus: AudioBusPreference, level: number): void;
  reportRuntimeDiagnostics(receipt: Partial<RuntimeDiagnostics>): void;
}

const SETTINGS_KEY = 'herd.settings.v1';
const BESTS_KEY = 'herd.personal-bests.v1';
const EMPTY_BESTS: PersonalBests = { 25: null, 75: null, 200: null };

function loadJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private contexts. The run remains playable.
  }
}

function initialSeed(): number {
  const raw =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('seed');
  if (raw !== null && raw !== '') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed >>> 0;
  }
  const now = Date.now();
  return (now ^ (now >>> 13) ^ (now << 7)) >>> 0;
}

function newSim(flockSize: FlockSize, seed: number): CpuDeterministicSim {
  return new CpuDeterministicSim(HOME_FIELD, flockSize, seed);
}

function settingsSnapshot(state: GameStore): StoredSettings {
  return {
    quality: state.quality,
    reduceMotion: state.reduceMotion,
    colorblindMarker: state.colorblindMarker,
    showTimer: state.showTimer,
    inputBindings: state.inputBindings,
    muted: state.muted,
    audioLevels: state.audioLevels,
  };
}

export const useGameStore = create<GameStore>()((set, get) => {
  const seed = initialSeed();
  const flockSize: FlockSize = 25;
  const stored = loadJson<StoredSettings>(SETTINGS_KEY, {});
  const bindings: InputBindings = {
    ...DEFAULT_INPUT_BINDINGS,
    ...stored.inputBindings,
  };
  const bests = loadJson<PersonalBests>(BESTS_KEY, EMPTY_BESTS);

  function updateSetting(patch: Partial<GameStore>): void {
    set(patch);
    saveJson(SETTINGS_KEY, settingsSnapshot(get()));
  }

  return {
    gamePhase: 'title',
    uiPanel: 'none',
    sceneReady: false,
    bootProgress: { ...EMPTY_BOOT_PROGRESS },
    flockSize,
    pennedCount: 0,
    penSerial: 0,
    penDelta: 0,
    acceptedBark: null,
    completionTick: -1,
    completionTimeMs: 0,
    personalBests: { ...EMPTY_BESTS, ...bests },
    lastRunWasBest: false,
    cameraMode: 'classic',
    quality:
      stored.quality === 'high' || stored.quality === 'medium' || stored.quality === 'low'
        ? stored.quality
        : 'auto',
    autoTierReceipt: null,
    reduceMotion: stored.reduceMotion === true,
    colorblindMarker: stored.colorblindMarker === true,
    showTimer: stored.showTimer === true,
    inputBindings: bindings,
    muted: stored.muted === true,
    audioLevels: { ...DEFAULT_AUDIO_LEVELS, ...stored.audioLevels },
    runtimeDiagnostics: EMPTY_RUNTIME_DIAGNOSTICS,
    seed,
    sim: newSim(flockSize, seed),

    markSceneReady() {
      get().reportBootStep('presented', 1);
      if (!get().sceneReady) set({ sceneReady: true });
    },

    reportBootStep(step, fraction) {
      const previous = get().bootProgress[step];
      const next = Math.max(previous, clampBootProgress(fraction));
      if (next === previous) return;
      if (next === 1 && typeof performance !== 'undefined') {
        performance.mark(`herd:boot:${step}`);
      }
      set({ bootProgress: { ...get().bootProgress, [step]: next } });
    },

    startGame(nextFlockSize) {
      const current = get();
      const canUseColdTitleSim =
        current.gamePhase === 'title' &&
        current.flockSize === nextFlockSize &&
        current.sim.headings.length === nextFlockSize &&
        current.sim.tick === 0;
      set({
        gamePhase: 'playing',
        uiPanel: 'none',
        flockSize: nextFlockSize,
        pennedCount: 0,
        penSerial: 0,
        penDelta: 0,
        acceptedBark: null,
        completionTick: -1,
        completionTimeMs: 0,
        lastRunWasBest: false,
        sim: canUseColdTitleSim ? current.sim : newSim(nextFlockSize, current.seed),
      });
    },

    pause() {
      if (get().gamePhase === 'playing') {
        set({ gamePhase: 'paused', uiPanel: 'pause' });
      }
    },

    resume() {
      if (get().gamePhase === 'paused') {
        set({ gamePhase: 'playing', uiPanel: 'none' });
      }
    },

    openSettings() {
      const phase = get().gamePhase;
      set({
        gamePhase: phase === 'playing' ? 'paused' : phase,
        uiPanel: 'settings',
      });
    },

    closeSettings() {
      set({ uiPanel: get().gamePhase === 'paused' ? 'pause' : 'none' });
    },

    sheepPenned(pennedCount) {
      const state = get();
      if (pennedCount === state.pennedCount) return;
      set({
        pennedCount,
        penSerial: state.penSerial + 1,
        penDelta: pennedCount - state.pennedCount,
      });
    },

    barkAccepted(event) {
      if (event.serial === get().acceptedBark?.serial) return;
      set({ acceptedBark: event });
    },

    complete(completionTimeMs, completionTick = -1) {
      const state = get();
      const previous = state.personalBests[state.flockSize];
      const isBest = previous === null || completionTimeMs < previous;
      const personalBests = isBest
        ? { ...state.personalBests, [state.flockSize]: completionTimeMs }
        : state.personalBests;
      if (isBest) saveJson(BESTS_KEY, personalBests);
      set({
        gamePhase: 'complete',
        uiPanel: 'none',
        completionTimeMs,
        completionTick,
        personalBests,
        lastRunWasBest: isBest,
      });
    },

    reset() {
      const { flockSize: size, seed: currentSeed } = get();
      set({
        gamePhase: 'title',
        uiPanel: 'none',
        pennedCount: 0,
        penSerial: 0,
        penDelta: 0,
        acceptedBark: null,
        completionTick: -1,
        completionTimeMs: 0,
        lastRunWasBest: false,
        sim: newSim(size, currentSeed),
      });
    },

    setCameraMode(cameraMode) {
      set({ cameraMode });
    },

    setQuality(quality) {
      updateSetting({ quality });
    },

    recordAutoTier(receipt) {
      if (get().autoTierReceipt === null) set({ autoTierReceipt: receipt });
    },

    demoteAutoTier() {
      const current = get().autoTierReceipt;
      if (get().quality !== 'auto' || current === null || current.tier === 'low') return;
      set({
        autoTierReceipt: {
          ...current,
          tier: current.tier === 'high' ? 'medium' : 'low',
          reason: 'runtime-frame-budget',
          runtimeDemotions: current.runtimeDemotions + 1,
        },
      });
    },

    setReduceMotion(reduceMotion) {
      updateSetting({ reduceMotion });
    },

    setColorblindMarker(colorblindMarker) {
      updateSetting({ colorblindMarker });
    },

    setShowTimer(showTimer) {
      updateSetting({ showTimer });
    },

    setInputBinding(action, code) {
      const current = get().inputBindings;
      const displaced = (Object.keys(current) as InputAction[]).find(
        (key) => key !== action && current[key] === code,
      );
      const next: Record<InputAction, string> = { ...current, [action]: code };
      if (displaced !== undefined) next[displaced] = current[action];
      updateSetting({ inputBindings: next });
    },

    setMuted(muted) {
      updateSetting({ muted });
    },

    setAudioLevel(bus, level) {
      const audioLevels = {
        ...get().audioLevels,
        [bus]: Math.max(0, Math.min(1, level)),
      };
      updateSetting({ audioLevels });
    },

    reportRuntimeDiagnostics(receipt) {
      set({ runtimeDiagnostics: { ...get().runtimeDiagnostics, ...receipt } });
    },
  };
});
