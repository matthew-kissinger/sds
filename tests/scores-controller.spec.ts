// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { beforeEach, describe, expect, it } from 'vitest';
import { ScoreApiError, type ScoreApi } from '@app/scores/api';
import { createScoresController } from '@app/scores/controller';
import type { IdentityStorage } from '@app/scores/storage';
import { resetScoreStore, useScoreStore } from '@app/scores/store';
import type { ScoreIdentity } from '@app/scores/types';

function memoryStorage(initial: ScoreIdentity | null = null): IdentityStorage & { value: ScoreIdentity | null } {
  return {
    value: initial,
    load() { return this.value; },
    save(identity) { this.value = identity; },
    clear() { this.value = null; },
  };
}

const freshReceipt = {
  token: 'token-new', authSecret: 'secret-new',
  playerProfile: { persistentId: 'pid-new', displayName: 'CalmKeeper', fullName: 'CalmKeeper#0001' },
};

beforeEach(() => resetScoreStore());

describe('scores controller', () => {
  it('replaces invalid stored credentials with a fresh server identity', async () => {
    const storage = memoryStorage({
      persistentId: 'pid-old', authSecret: 'secret-old',
      displayName: 'OldName', fullName: 'OldName#0001',
    });
    const registerCalls: unknown[] = [];
    const api: ScoreApi = {
      async register(stored) {
        registerCalls.push(stored);
        if (stored) throw new ScoreApiError(401, 'auth required');
        return freshReceipt;
      },
      async rename() { return freshReceipt.playerProfile; },
      async submit() {},
      async leaderboard() { return []; },
    };

    const identity = await createScoresController(api, storage).ensureIdentity();

    expect(registerCalls).toEqual([
      { persistentId: 'pid-old', authSecret: 'secret-old' },
      undefined,
    ]);
    expect(identity?.displayName).toBe('CalmKeeper');
    expect(storage.value?.persistentId).toBe('pid-new');
    expect(useScoreStore.getState().identityStatus).toBe('ready');
  });

  it('refreshes an expired token, records seconds, and resolves the player rank', async () => {
    const storage = memoryStorage({
      persistentId: 'pid-1', authSecret: 'secret-1',
      displayName: 'GentleGuide', fullName: 'GentleGuide#0001',
    });
    let registration = 0;
    let submissions = 0;
    const api: ScoreApi = {
      async register() {
        registration += 1;
        return {
          token: `token-${registration}`,
          playerProfile: { persistentId: 'pid-1', displayName: 'GentleGuide', fullName: 'GentleGuide#0001' },
        };
      },
      async rename() { return { persistentId: 'pid-1', displayName: 'GentleGuide', fullName: 'GentleGuide#0001' }; },
      async submit(token, count, seconds) {
        submissions += 1;
        expect(count).toBe(200);
        expect(seconds).toBe(123.4);
        if (token === 'token-1') throw new ScoreApiError(401, 'expired');
      },
      async leaderboard() {
        return [{
          rank: 7, persistentId: 'pid-1', displayName: 'GentleGuide',
          fullName: 'GentleGuide#0001', scoreSeconds: 123.4,
        }];
      },
    };
    const controller = createScoresController(api, storage);

    await controller.submit({ flockSize: 200, completionTimeMs: 123400, completionTick: 7404 });

    expect(registration).toBe(2);
    expect(submissions).toBe(2);
    expect(useScoreStore.getState()).toMatchObject({
      submissionStatus: 'ready', rank: 7, submissionMessage: 'Online rank 7.',
    });
  });

  it('resolves rank against a fresh identity minted after invalid credentials', async () => {
    const storage = memoryStorage({
      persistentId: 'pid-old', authSecret: 'secret-old',
      displayName: 'OldName', fullName: 'OldName#0001',
    });
    let registration = 0;
    const api: ScoreApi = {
      async register(stored) {
        registration += 1;
        if (registration === 1 && stored) throw new ScoreApiError(401, 'invalid credentials');
        return freshReceipt;
      },
      async rename() { return freshReceipt.playerProfile; },
      async submit() {},
      async leaderboard() {
        return [{
          rank: 4, persistentId: 'pid-new', displayName: 'CalmKeeper',
          fullName: 'CalmKeeper#0001', scoreSeconds: 80,
        }];
      },
    };

    await createScoresController(api, storage).submit({
      flockSize: 75, completionTimeMs: 80000, completionTick: 4800,
    });

    expect(useScoreStore.getState()).toMatchObject({
      submissionStatus: 'ready', rank: 4, submissionMessage: 'Online rank 4.',
    });
  });

  it('keeps completion fail-soft when registration is offline', async () => {
    const api: ScoreApi = {
      async register() { throw new TypeError('offline'); },
      async rename() { throw new TypeError('offline'); },
      async submit() { throw new TypeError('offline'); },
      async leaderboard() { throw new TypeError('offline'); },
    };
    const controller = createScoresController(api, memoryStorage());

    await controller.submit({ flockSize: 25, completionTimeMs: 50000, completionTick: 3000 });

    expect(useScoreStore.getState()).toMatchObject({
      identityStatus: 'offline', submissionStatus: 'offline',
      submissionMessage: 'Your local time is safe. The online board is unavailable.',
    });
  });
});
