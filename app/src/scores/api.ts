// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { FLOCK_SIZES, type FlockSize } from '@app/state/store';
import { SCORE_SCENE_ID } from './config';
import type { LeaderboardEntry, PlayerProfile, PlayerRun, RegisterReceipt } from './types';

type Fetcher = typeof fetch;

export class ScoreApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ScoreApiError';
    this.status = status;
  }
}

interface RawProfile {
  readonly persistent_id?: unknown;
  readonly persistentId?: unknown;
  readonly displayName?: unknown;
  readonly fullName?: unknown;
}

function profileFrom(value: unknown): PlayerProfile {
  const raw = (value ?? {}) as RawProfile;
  const persistentId = raw.persistentId ?? raw.persistent_id;
  if (
    typeof persistentId !== 'string'
    || typeof raw.displayName !== 'string'
    || typeof raw.fullName !== 'string'
  ) throw new ScoreApiError(502, 'invalid player profile');
  return { persistentId, displayName: raw.displayName, fullName: raw.fullName };
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  try {
    body = await response.json() as Record<string, unknown>;
  } catch {
    // A proxy error page is still represented by its HTTP status below.
  }
  if (!response.ok) {
    throw new ScoreApiError(
      response.status,
      typeof body.error === 'string' ? body.error : `score service returned ${response.status}`,
    );
  }
  return body;
}

export interface ScoreApi {
  register(stored?: { readonly persistentId: string; readonly authSecret: string }): Promise<RegisterReceipt>;
  rename(token: string, displayName: string): Promise<PlayerProfile>;
  submit(token: string, flockSize: FlockSize, seconds: number): Promise<void>;
  leaderboard(flockSize: FlockSize): Promise<LeaderboardEntry[]>;
  myRuns(token: string): Promise<PlayerRun[]>;
}

export function createScoreApi(base: string, fetcher: Fetcher = fetch, requestTimeoutMs = 8_000): ScoreApi {
  const request = async (url: string, init?: RequestInit) => {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      return await responseJson(await fetcher(url, { ...init, signal: controller.signal }));
    } finally {
      globalThis.clearTimeout(timeout);
    }
  };

  const post = async (path: string, body: unknown, token?: string) => request(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  return {
    async register(stored) {
      const body = stored
        ? { persistentId: stored.persistentId, authSecret: stored.authSecret, nameType: 'random' }
        : { displayName: 'Player', nameType: 'random' };
      const receipt = await post('/api/register', body);
      if (typeof receipt.token !== 'string') throw new ScoreApiError(502, 'registration token absent');
      return {
        token: receipt.token,
        ...(typeof receipt.authSecret === 'string' ? { authSecret: receipt.authSecret } : {}),
        playerProfile: profileFrom(receipt.playerProfile),
      };
    },

    async rename(token, displayName) {
      const receipt = await post('/api/rename', { displayName }, token);
      return profileFrom(receipt.playerProfile);
    },

    async submit(token, flockSize, seconds) {
      await post('/api/score', {
        gameMode: 'soloClassic',
        score: seconds,
        additionalData: { sceneId: SCORE_SCENE_ID, sheepCount: flockSize },
      }, token);
    },

    async myRuns(token) {
      // Authenticated on the server against the token's own persistent id, so
      // there is no player identifier in this URL to tamper with.
      const query = new URLSearchParams({ scene: SCORE_SCENE_ID });
      const receipt = await request(`${base}/api/my-scores?${query}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!Array.isArray(receipt.entries)) throw new ScoreApiError(502, 'run entries absent');
      return receipt.entries.flatMap((value): PlayerRun[] => {
        const raw = (value ?? {}) as Record<string, unknown>;
        // A count the client does not offer is dropped rather than shown: the
        // ranked set is the contract, and a stale row under some other count
        // is not a time the player can compare against anything.
        if (
          typeof raw.score !== 'number'
          || typeof raw.submittedAt !== 'number'
          || !FLOCK_SIZES.includes(raw.sheepCount as FlockSize)
        ) return [];
        return [{
          flockSize: raw.sheepCount as FlockSize,
          scoreSeconds: raw.score,
          submittedAt: raw.submittedAt,
        }];
      });
    },

    async leaderboard(flockSize) {
      const query = new URLSearchParams({
        mode: 'solo',
        scene: SCORE_SCENE_ID,
        sheepCount: String(flockSize),
        limit: '100',
      });
      const receipt = await request(`${base}/api/leaderboard?${query}`);
      if (!Array.isArray(receipt.entries)) throw new ScoreApiError(502, 'leaderboard entries absent');
      return receipt.entries.flatMap((value): LeaderboardEntry[] => {
        const raw = (value ?? {}) as Record<string, unknown>;
        const persistentId = raw.persistent_id ?? raw.persistentId;
        if (
          typeof raw.rank !== 'number'
          || typeof persistentId !== 'string'
          || typeof raw.displayName !== 'string'
          || typeof raw.fullName !== 'string'
          || typeof raw.score !== 'number'
        ) return [];
        return [{
          rank: raw.rank,
          persistentId,
          displayName: raw.displayName,
          fullName: raw.fullName,
          scoreSeconds: raw.score,
        }];
      });
    },
  };
}
