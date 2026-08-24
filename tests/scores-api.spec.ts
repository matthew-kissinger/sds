// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { createScoreApi } from '@app/scores/api';

describe('score API boundary', () => {
  it('registers with a server-random name and submits only the v3 solo partition', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith('/api/register')) {
        return Response.json({
          token: 'jwt', authSecret: 'secret',
          playerProfile: {
            persistent_id: 'pid-1', displayName: 'GentleGuide', fullName: 'GentleGuide#0001',
          },
        });
      }
      if (url.endsWith('/api/score')) return Response.json({ success: true });
      return Response.json({ entries: [] });
    }) as typeof fetch;
    const api = createScoreApi('https://scores.test', fetcher);

    await api.register();
    await api.submit('jwt', 75, 92.5);

    expect(JSON.parse(String(requests[0]!.init?.body))).toEqual({
      displayName: 'Player', nameType: 'random',
    });
    expect(JSON.parse(String(requests[1]!.init?.body))).toEqual({
      gameMode: 'soloClassic',
      score: 92.5,
      additionalData: { sceneId: 'field-v3', sheepCount: 75 },
    });
    expect((requests[1]!.init?.headers as Record<string, string>).authorization).toBe('Bearer jwt');
  });

  it('reads the count-specific solo board and normalizes its public entries', async () => {
    let requested = '';
    const fetcher = (async (input: string | URL | Request) => {
      requested = String(input);
      return Response.json({
        entries: [{
          rank: 1, persistent_id: 'pid-1', displayName: 'SteadyCollie',
          fullName: 'SteadyCollie#0001', score: 64.25,
        }],
      });
    }) as typeof fetch;
    const entries = await createScoreApi('https://scores.test', fetcher).leaderboard(25);
    const url = new URL(requested);

    expect(url.pathname).toBe('/api/leaderboard');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mode: 'solo', scene: 'field-v3', sheepCount: '25', limit: '100',
    });
    expect(entries).toEqual([{
      rank: 1, persistentId: 'pid-1', displayName: 'SteadyCollie',
      fullName: 'SteadyCollie#0001', scoreSeconds: 64.25,
    }]);
  });

  it('aborts a score request that exceeds the fail-soft timeout', async () => {
    const fetcher = ((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as typeof fetch;

    await expect(createScoreApi('https://scores.test', fetcher, 5).register()).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
