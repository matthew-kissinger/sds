// SPDX-License-Identifier: AGPL-3.0-or-later
// A browser blocking all site data throws on reading `localStorage` at all, even
// from `typeof`, and the game still has to start.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeEach(() => {
  vi.resetModules();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('denied', 'SecurityError'); },
  });
});

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('with storage blocked', () => {
  it('the game store loads with its defaults, and a setting still changes for this page', async () => {
    const { useGameStore } = await import('@app/state/store');
    expect(useGameStore.getState().gamePhase).toBe('title');
    expect(useGameStore.getState().personalBests).toEqual({ 25: null, 75: null, 200: null });
    useGameStore.getState().setMuted(true);
    expect(useGameStore.getState().muted).toBe(true);
  });

  it('a score identity reads as none, and keeping one throws nothing', async () => {
    const { browserIdentityStorage } = await import('@app/scores/storage');
    const storage = browserIdentityStorage();
    expect(storage.load()).toBeNull();
    storage.save({ persistentId: 'p', authSecret: 's', displayName: 'd', fullName: 'f' } as never);
    storage.clear();
  });

  it('a rename the service took holds for this page, with the same secret', async () => {
    const { createScoresController } = await import('@app/scores/controller');
    const { browserIdentityStorage } = await import('@app/scores/storage');
    const { useScoreStore } = await import('@app/scores/store');
    const profile = { persistentId: 'p', displayName: 'Minted', fullName: 'Minted#0001' };
    const controller = createScoresController({
      register: async () => ({ token: 't', authSecret: 's', playerProfile: profile }),
      rename: async (_token: string, displayName: string) => ({ ...profile, displayName, fullName: `${displayName}#0001` }),
    } as never, browserIdentityStorage());
    await controller.ensureIdentity();
    expect(await controller.rename('Bracken')).toBe(true);
    expect(useScoreStore.getState()).toMatchObject({
      identity: { persistentId: 'p', authSecret: 's', displayName: 'Bracken', fullName: 'Bracken#0001' },
      renaming: false,
      renameMessage: '',
    });
  });

  it('the move hint shows, and learning it throws nothing', async () => {
    const { forgetMoveHint, markMoveHintLearned, moveHintLearned } = await import('@app/input/moveHint');
    expect(moveHintLearned()).toBe(false);
    markMoveHintLearned();
    forgetMoveHint();
    expect(moveHintLearned()).toBe(false);
  });
});
