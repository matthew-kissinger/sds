// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useGameStore, type FlockSize } from '@app/state/store';
import { createScoreApi, ScoreApiError, type ScoreApi } from './api';
import { scoreApiBase } from './config';
import { browserIdentityStorage, type IdentityStorage } from './storage';
import { useScoreStore } from './store';
import type { CompletedRun, ScoreIdentity } from './types';

export interface ScoresController {
  start(): () => void;
  ensureIdentity(): Promise<ScoreIdentity | null>;
  rename(displayName: string): Promise<boolean>;
  loadBoard(flockSize: FlockSize): Promise<void>;
  submit(run: CompletedRun): Promise<void>;
}

export function createScoresController(
  api: ScoreApi,
  storage: IdentityStorage,
): ScoresController {
  let token: string | null = null;
  let identityPromise: Promise<ScoreIdentity | null> | null = null;
  let lastRunKey = '';
  let boardRequest = 0;

  const register = async (fresh = false): Promise<ScoreIdentity> => {
    const stored = fresh ? null : storage.load();
    let receipt;
    try {
      receipt = await api.register(stored ? {
        persistentId: stored.persistentId,
        authSecret: stored.authSecret,
      } : undefined);
    } catch (error) {
      if (!fresh && stored !== null && error instanceof ScoreApiError && error.status === 401) {
        storage.clear();
        return register(true);
      }
      throw error;
    }
    const authSecret = receipt.authSecret ?? stored?.authSecret;
    if (!authSecret) throw new ScoreApiError(502, 'identity secret absent');
    const identity: ScoreIdentity = { ...receipt.playerProfile, authSecret };
    token = receipt.token;
    storage.save(identity);
    useScoreStore.getState().patch({
      identityStatus: 'ready', identity, identityMessage: '', renameMessage: '',
    });
    return identity;
  };

  const ensureIdentity = async (): Promise<ScoreIdentity | null> => {
    if (token !== null && useScoreStore.getState().identity !== null) {
      return useScoreStore.getState().identity;
    }
    if (identityPromise !== null) return identityPromise;
    const stored = storage.load();
    useScoreStore.getState().patch({
      identityStatus: 'connecting',
      identity: stored,
      identityMessage: '',
    });
    identityPromise = register().catch(() => {
      token = null;
      useScoreStore.getState().patch({
        identityStatus: 'offline',
        identity: storage.load(),
        identityMessage: 'Online times are unavailable. Play still works.',
      });
      return null;
    }).finally(() => {
      identityPromise = null;
    });
    return identityPromise;
  };

  const withFreshToken = async <T>(operation: (activeToken: string) => Promise<T>): Promise<T> => {
    const identity = await ensureIdentity();
    if (identity === null || token === null) throw new ScoreApiError(0, 'offline');
    try {
      return await operation(token);
    } catch (error) {
      if (!(error instanceof ScoreApiError) || error.status !== 401) throw error;
      token = null;
      const refreshed = await ensureIdentity();
      if (refreshed === null || token === null) throw error;
      return operation(token);
    }
  };

  const submit = async (run: CompletedRun): Promise<void> => {
    const runKey = `${run.completionTick}:${run.flockSize}:${run.completionTimeMs}`;
    if (runKey === lastRunKey) return;
    // A completion is attempted once. A later run gets a new key, while an
    // offline completion remains local instead of retrying invisibly.
    lastRunKey = runKey;
    useScoreStore.getState().patch({
      submissionStatus: 'submitting',
      submittedFlockSize: run.flockSize,
      entries: [], rank: null, submissionMessage: 'Checking the online times.',
    });
    try {
      const identity = await ensureIdentity();
      if (identity === null) throw new ScoreApiError(0, 'offline');
      await withFreshToken((activeToken) => api.submit(
        activeToken,
        run.flockSize,
        run.completionTimeMs / 1000,
      ));
      const entries = await api.leaderboard(run.flockSize);
      const activeIdentity = useScoreStore.getState().identity ?? storage.load() ?? identity;
      const ownEntry = entries.find((entry) => entry.persistentId === activeIdentity.persistentId);
      useScoreStore.getState().patch({
        submissionStatus: 'ready', entries, rank: ownEntry?.rank ?? null,
        submissionMessage: ownEntry === undefined
          ? 'Your time is recorded outside the first 100 places.'
          : `Online rank ${ownEntry.rank}.`,
      });
    } catch {
      useScoreStore.getState().patch({
        submissionStatus: 'offline', entries: [], rank: null,
        submissionMessage: 'Your local time is safe. The online board is unavailable.',
      });
    }
  };

  return {
    start() {
      const stored = storage.load();
      if (stored !== null) useScoreStore.getState().patch({ identity: stored });
      void ensureIdentity();
      let previousPhase = useGameStore.getState().gamePhase;
      return useGameStore.subscribe((state) => {
        if (state.gamePhase === 'complete' && previousPhase !== 'complete') {
          void submit({
            flockSize: state.flockSize,
            completionTimeMs: state.completionTimeMs,
            completionTick: state.completionTick,
          });
        }
        previousPhase = state.gamePhase;
      });
    },

    ensureIdentity,

    async rename(displayName) {
      const requested = displayName.trim();
      if (requested.length === 0) {
        useScoreStore.getState().patch({ renameMessage: 'Enter a name.' });
        return false;
      }
      useScoreStore.getState().patch({ renaming: true, renameMessage: '' });
      try {
        const profile = await withFreshToken((activeToken) => api.rename(activeToken, requested));
        const current = storage.load();
        if (current === null) throw new ScoreApiError(0, 'identity absent');
        const identity: ScoreIdentity = { ...profile, authSecret: current.authSecret };
        storage.save(identity);
        useScoreStore.getState().patch({
          identityStatus: 'ready', identity, renaming: false, renameMessage: '',
        });
        return true;
      } catch (error) {
        const message = error instanceof ScoreApiError && error.status === 400
          ? 'Use a name from 1 to 20 characters.'
          : 'Name change is unavailable. Play still works.';
        useScoreStore.getState().patch({ renaming: false, renameMessage: message });
        return false;
      }
    },

    async loadBoard(flockSize) {
      const request = ++boardRequest;
      useScoreStore.getState().patch({
        boardStatus: 'loading',
        boardFlockSize: flockSize,
        boardEntries: [],
        boardMessage: `Loading ${flockSize}-sheep times.`,
      });
      try {
        const entries = await api.leaderboard(flockSize);
        if (request !== boardRequest) return;
        useScoreStore.getState().patch({
          boardStatus: 'ready',
          boardFlockSize: flockSize,
          boardEntries: entries,
          boardMessage: entries.length === 0 ? 'No times yet. Yours could be first.' : '',
        });
      } catch {
        if (request !== boardRequest) return;
        useScoreStore.getState().patch({
          boardStatus: 'offline',
          boardFlockSize: flockSize,
          boardEntries: [],
          boardMessage: 'Online times are unavailable. Play still works.',
        });
      }
    },

    submit,
  };
}

export const scoresController = createScoresController(
  createScoreApi(scoreApiBase()),
  browserIdentityStorage(),
);
