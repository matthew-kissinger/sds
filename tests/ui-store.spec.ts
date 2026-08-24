// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_AUDIO_LEVELS,
  DEFAULT_INPUT_BINDINGS,
  useGameStore,
} from '@app/state/store';
import { CpuDeterministicSim } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import { FIXED_DT } from '@sim/tuning';

const TEST_SEED = 20260821;

beforeEach(() => {
  useGameStore.setState({
    gamePhase: 'title',
    uiPanel: 'none',
    sceneReady: false,
    flockSize: 25,
    pennedCount: 0,
    penSerial: 0,
    penDelta: 0,
    acceptedBark: null,
    completionTick: -1,
    completionTimeMs: 0,
    personalBests: { 25: null, 75: null, 200: null },
    lastRunWasBest: false,
    inputBindings: { ...DEFAULT_INPUT_BINDINGS },
    muted: false,
    audioLevels: { ...DEFAULT_AUDIO_LEVELS },
    seed: TEST_SEED,
    sim: new CpuDeterministicSim(HOME_FIELD, 25, TEST_SEED),
  });
});

describe('UI game state', () => {
  it('freezes and resumes the live run through the pause panel', () => {
    const store = useGameStore.getState();
    store.startGame(75);
    store.pause();
    expect(useGameStore.getState()).toMatchObject({ gamePhase: 'paused', uiPanel: 'pause' });
    useGameStore.getState().resume();
    expect(useGameStore.getState()).toMatchObject({ gamePhase: 'playing', uiPanel: 'none' });
  });

  it('reuses the untouched title simulation for immediate default play', () => {
    const titleSim = useGameStore.getState().sim;
    useGameStore.getState().startGame(25);
    expect(useGameStore.getState().sim).toBe(titleSim);
  });

  it('replaces an unexpectedly advanced title simulation with a tick-zero run', () => {
    const titleSim = useGameStore.getState().sim;
    titleSim.step([{ direction: { x: 0, z: 0 }, sprint: false, bark: false }], FIXED_DT);
    expect(titleSim.tick).toBe(1);

    useGameStore.getState().startGame(25);
    expect(useGameStore.getState().sim).not.toBe(titleSim);
    expect(useGameStore.getState().sim.tick).toBe(0);
  });

  it('publishes penned state only on a real change', () => {
    let updates = 0;
    const unsubscribe = useGameStore.subscribe(() => { updates += 1; });
    const store = useGameStore.getState();
    store.sheepPenned(1);
    store.sheepPenned(1);
    store.sheepPenned(2);
    unsubscribe();
    expect(useGameStore.getState()).toMatchObject({
      pennedCount: 2,
      penSerial: 2,
      penDelta: 1,
    });
    expect(updates).toBe(2);
  });

  it('publishes accepted bark and completion epochs for scene and audio consumers', () => {
    const store = useGameStore.getState();
    store.barkAccepted({ serial: 1, tick: 30, dog: 0, x: 4, z: 8 });
    store.barkAccepted({ serial: 1, tick: 30, dog: 0, x: 4, z: 8 });
    store.complete(1_000, 60);
    expect(useGameStore.getState()).toMatchObject({
      acceptedBark: { serial: 1, tick: 30, dog: 0, x: 4, z: 8 },
      completionTick: 60,
    });
  });

  it('keeps the fastest completion as the personal best', () => {
    useGameStore.getState().startGame(25);
    useGameStore.getState().complete(92_000);
    expect(useGameStore.getState().lastRunWasBest).toBe(true);
    useGameStore.getState().startGame(25);
    useGameStore.getState().complete(94_000);
    expect(useGameStore.getState().lastRunWasBest).toBe(false);
    expect(useGameStore.getState().personalBests[25]).toBe(92_000);
  });

  it('swaps a conflicting binding so every action stays reachable', () => {
    useGameStore.getState().setInputBinding('forward', 'KeyS');
    expect(useGameStore.getState().inputBindings).toMatchObject({
      forward: 'KeyS',
      backward: 'KeyW',
    });
  });

  it('clamps live audio bus settings and keeps mute independent', () => {
    const store = useGameStore.getState();
    store.setAudioLevel('ambient', 2);
    store.setAudioLevel('dog', -1);
    store.setMuted(true);
    expect(useGameStore.getState()).toMatchObject({
      muted: true,
      audioLevels: { ambient: 1, dog: 0 },
    });
  });
});
