// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, it, vi } from 'vitest';

let unsubscribe: (() => void) | undefined;
afterEach(() => { unsubscribe?.(); vi.unstubAllGlobals(); vi.resetModules(); });

it('persists a completed best before online submission and reloads it after an outage', async () => {
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  vi.resetModules();
  const { useGameStore } = await import('@app/state/store');
  const { createScoresController } = await import('@app/scores/controller');
  const { useScoreStore } = await import('@app/scores/store');
  const { ScoreApiError } = await import('@app/scores/api');
  const controller = createScoresController({
    async register() { throw new ScoreApiError(503, 'unavailable'); },
    async rename() { throw new ScoreApiError(503, 'unavailable'); },
    async submit() { throw new ScoreApiError(503, 'unavailable'); },
    async leaderboard() { throw new ScoreApiError(503, 'unavailable'); },
  }, { load: () => null, save: () => {}, clear: () => {} });
  unsubscribe = controller.start();
  useGameStore.getState().startGame(25);
  let savedAtCompletion: string | null = null;
  const observe = useGameStore.subscribe(state => {
    if (state.gamePhase === 'complete') savedAtCompletion = stored.get('herd.personal-bests.v1') ?? null;
  });
  useGameStore.getState().complete(321000, 19260);
  observe();
  expect(JSON.parse(savedAtCompletion!)).toMatchObject({ 25: 321000 });
  await vi.waitFor(() => expect(useScoreStore.getState().submissionStatus).toBe('offline'));
  useGameStore.getState().startGame(25);
  expect(useGameStore.getState().gamePhase).toBe('playing');
  unsubscribe(); unsubscribe = undefined;
  vi.resetModules();
  const reloaded = (await import('@app/state/store')).useGameStore.getState();
  expect(reloaded.personalBests[25]).toBe(321000);
  expect(reloaded.gamePhase).toBe('title');
});
