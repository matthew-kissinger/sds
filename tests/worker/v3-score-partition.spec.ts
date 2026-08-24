// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import worker from '../../worker/src/index';
import { modeSheepCountOk } from '../../worker/src/d1';
import {
  isKnownScoreScene,
  rankedCountsForScoreScene,
  V3_SCORE_SCENE_ID,
} from '../../worker/src/scorePartitions';

function readEnv() {
  const statement = {
    bind() { return this; },
    async all() { return { results: [] }; },
  };
  return {
    ROOM_DO: {},
    LOBBY_DO: {},
    DB: { prepare: () => statement },
    JWT_SECRET: 'test-secret',
  } as any;
}

const context = { waitUntil() {}, passThroughOnException() {} } as ExecutionContext;

describe('version 3 score partition', () => {
  it('allows exactly the three version 3 solo counts without changing the v2 field ladder', () => {
    expect(rankedCountsForScoreScene(V3_SCORE_SCENE_ID)).toEqual([25, 75, 200]);
    for (const count of [25, 75, 200]) {
      expect(modeSheepCountOk('soloClassic', count, V3_SCORE_SCENE_ID)).toBe(true);
    }
    for (const count of [24, 50, 201, 5000]) {
      expect(modeSheepCountOk('soloClassic', count, V3_SCORE_SCENE_ID)).toBe(false);
    }
    expect(rankedCountsForScoreScene('field')).not.toEqual([25, 75, 200]);
  });

  it('accepts field-v3 on the leaderboard read route and still rejects unknown scenes', async () => {
    expect(isKnownScoreScene(V3_SCORE_SCENE_ID)).toBe(true);
    const accepted = await worker.fetch(
      new Request(`https://worker.test/api/leaderboard?mode=solo&scene=${V3_SCORE_SCENE_ID}&sheepCount=25`),
      readEnv(),
      context,
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ entries: [] });

    const rejected = await worker.fetch(
      new Request('https://worker.test/api/leaderboard?mode=solo&scene=field-v4&sheepCount=25'),
      readEnv(),
      context,
    );
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: 'unknown_scene' });
  });

  it('uses the version 3 count ladder on the aggregate leaderboard route', async () => {
    const response = await worker.fetch(
      new Request(`https://worker.test/api/leaderboards?scene=${V3_SCORE_SCENE_ID}&limit=1`),
      readEnv(),
      context,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { leaderboards: Record<string, unknown> };
    expect(Object.keys(body.leaderboards).filter((key) => key.startsWith('solo:'))).toEqual([
      'solo:25',
      'solo:75',
      'solo:200',
    ]);
  });
});
