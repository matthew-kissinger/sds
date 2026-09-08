// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, it } from 'vitest';
import { useGameStore } from '@app/state/store';

const original = useGameStore.getState();
afterEach(() => useGameStore.setState(original, true));

it('stops a lost-graphics run and rejects delayed ready, resume and restart actions', () => {
  useGameStore.getState().startGame(25);
  const sim = useGameStore.getState().sim;
  useGameStore.getState().reportGraphicsLost();
  useGameStore.getState().markSceneReady();
  useGameStore.getState().resume();
  useGameStore.getState().startGame(200);
  expect(useGameStore.getState()).toMatchObject({ graphicsLost: true, sceneReady: false,
    gamePhase: 'paused', uiPanel: 'none', flockSize: 25 });
  expect(useGameStore.getState().sim).toBe(sim);
});

it('preserves recorded results and preferences when loss interrupts another screen', () => {
  useGameStore.setState({ gamePhase: 'complete', uiPanel: 'settings', completionTimeMs: 123400,
    quality: 'low', cameraMode: 'follow' });
  useGameStore.getState().reportGraphicsLost();
  useGameStore.getState().reportGraphicsLost();
  expect(useGameStore.getState()).toMatchObject({ graphicsLost: true, gamePhase: 'paused',
    completionTimeMs: 123400, quality: 'low', cameraMode: 'follow', uiPanel: 'none' });
});
