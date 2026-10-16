// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScoreApi } from '@app/scores/api';
import { scoreApiBase } from '@app/scores/config';

describe('score API base', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is same-origin unless a build overrides it', async () => {
    vi.stubEnv('VITE_SCORE_API_BASE', '');
    expect(scoreApiBase()).toBe('');

    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ entries: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    await createScoreApi(scoreApiBase(), fetcher).leaderboard(25);
    expect(urls[0]).toMatch(/^\/api\/leaderboard\?/);
  });

  it('takes an absolute override without a trailing slash', () => {
    vi.stubEnv('VITE_SCORE_API_BASE', ' http://127.0.0.1:8788/ ');
    expect(scoreApiBase()).toBe('http://127.0.0.1:8788');
  });
});
