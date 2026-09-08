// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { createTestD1, sqliteAvailable } from './helpers/d1-sqlite';
import { registerPlayer, submitScore, getLeaderboard } from '../../worker/src/d1';

describe.skipIf(!sqliteAvailable)('v3 completion payload persistence', () => {
  it.each([25, 75, 200])('stores and returns the %i-sheep client payload in its own board', async count => {
    const database = createTestD1();
    try {
      const id = `completion-${count}`;
      await registerPlayer(database.db, id, `Probe${count}`, 'custom');
      // Same minimal payload shape captured from the current production client
      // in completion-75-targeted: no v2 timestamps or invented mode fields.
      const result = await submitScore(database.db, id, 'soloClassic', 100.4,
        { sceneId: 'field-v3', sheepCount: count });
      expect(result.isNewRecord).toBe(true);
      const rows = database.query<{ score: number; score_anomalies: string | null }>(
        'SELECT score, score_anomalies FROM score_submissions WHERE persistent_id = ?', id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ score: 100.4, score_anomalies: null });
      const board = await getLeaderboard(database.db, 'solo', 100, { sceneId: 'field-v3', sheepCount: count });
      expect(board).toHaveLength(1);
      expect(board[0]).toMatchObject({ score: 100.4 });
      for (const other of [25, 75, 200].filter(value => value !== count)) {
        expect(await getLeaderboard(database.db, 'solo', 100, { sceneId: 'field-v3', sheepCount: other })).toEqual([]);
      }
    } finally { database.close(); }
  });
});
