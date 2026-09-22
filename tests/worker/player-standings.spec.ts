// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// "Where does this run rank?" against a real SQLite engine with the committed
// migrations.
//
// The load-bearing guarantee: a standing is measured against the SAME
// population the public board displays. If these two ever disagree, the number
// in the player's history is a different statistic wearing the board's name,
// and the player has no way to tell.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestD1, sqliteAvailable, type TestD1 } from './helpers/d1-sqlite';
import {
  registerPlayer, submitScore, getLeaderboard, getPlayerScores, getPlayerScoreStandings,
} from '../../worker/src/d1';

const SCENE = 'field-v3';

function payload(sheepCount: number) {
  return { gameMode: 'solo', sceneId: SCENE, sheepCount, totalSheep: sheepCount, timestamp: 1 };
}

describe.skipIf(!sqliteAvailable)('player board standings', () => {
  let h: TestD1;
  beforeEach(() => { h = createTestD1(); });
  afterEach(() => { h.close(); });

  async function seed(id: string, name: string, count: number, score: number) {
    await registerPlayer(h.db, id, name, 'custom');
    await submitScore(h.db, id, 'soloClassic' as any, score, payload(count));
  }

  it('gives a player their exact board position for their best', async () => {
    await seed('a', 'Anna', 25, 40);
    await seed('b', 'Ben', 25, 50);
    await seed('c', 'Cara', 25, 60);

    const board = await getLeaderboard(h.db, 'solo', 10, { sceneId: SCENE, sheepCount: 25 });
    expect(board.map((e) => e.displayName)).toEqual(['Anna', 'Ben', 'Cara']);

    const standings = await getPlayerScoreStandings(h.db, SCENE, [{ sheepCount: 25, score: 50 }]);
    expect(standings).toEqual([{ sheepCount: 25, score: 50, rank: 2, players: 3 }]);
    // The same number the board shows for that player, arrived at another way.
    expect(standings[0]!.rank).toBe(board.find((e) => e.displayName === 'Ben')!.rank);
  });

  it('ranks a slower run of your own where that run would have placed', async () => {
    await seed('a', 'Anna', 25, 40);
    await seed('b', 'Ben', 25, 50);
    await seed('c', 'Cara', 25, 60);
    // Ben improves. His old 50 is still a run he made, and it would now sit
    // behind Anna and behind his own faster self.
    await submitScore(h.db, 'b', 'soloClassic' as any, 30, payload(25));

    const standings = await getPlayerScoreStandings(h.db, SCENE, [
      { sheepCount: 25, score: 30 }, { sheepCount: 25, score: 50 },
    ]);
    const at = (score: number) => standings.find((s) => s.score === score)!;
    expect(at(30).rank).toBe(1);
    // Anna (40) and Ben's own best (30) are both ahead of the old 50.
    expect(at(50).rank).toBe(3);
    // Ben's two submissions are one player on the board, so the field is 3.
    expect(at(50).players).toBe(3);
  });

  it('keeps each flock size a separate field', async () => {
    await seed('a', 'Anna', 25, 40);
    await seed('b', 'Ben', 25, 50);
    await seed('c', 'Cara', 200, 300);

    const standings = await getPlayerScoreStandings(h.db, SCENE, [
      { sheepCount: 25, score: 40 }, { sheepCount: 200, score: 300 },
    ]);
    expect(standings.find((s) => s.sheepCount === 25)).toEqual(
      { sheepCount: 25, score: 40, rank: 1, players: 2 },
    );
    expect(standings.find((s) => s.sheepCount === 200)).toEqual(
      { sheepCount: 200, score: 300, rank: 1, players: 1 },
    );
  });

  it('gives tied times the same rank, as the board does', async () => {
    await seed('a', 'Anna', 25, 40);
    await seed('b', 'Ben', 25, 40);
    await seed('c', 'Cara', 25, 60);

    const standings = await getPlayerScoreStandings(h.db, SCENE, [{ sheepCount: 25, score: 40 }]);
    expect(standings[0]).toEqual({ sheepCount: 25, score: 40, rank: 1, players: 3 });
  });

  it('measures against the board population, not against every submission', async () => {
    // One player with five runs must not inflate the field to five.
    await seed('a', 'Anna', 25, 40);
    for (const score of [41, 42, 43, 44]) {
      await submitScore(h.db, 'a', 'soloClassic' as any, score, payload(25));
    }
    await seed('b', 'Ben', 25, 90);

    const board = await getLeaderboard(h.db, 'solo', 10, { sceneId: SCENE, sheepCount: 25 });
    const standings = await getPlayerScoreStandings(h.db, SCENE, [{ sheepCount: 25, score: 90 }]);
    expect(standings[0]!.players).toBe(board.length);
    expect(standings[0]!.players).toBe(2);
  });

  it('ranks nothing for a count the player has never run', async () => {
    await seed('a', 'Anna', 25, 40);
    const standings = await getPlayerScoreStandings(h.db, SCENE, [{ sheepCount: 25, score: 40 }]);
    expect(standings.map((s) => s.sheepCount)).toEqual([25]);
  });

  it('ranks every run the history read returns', async () => {
    await seed('a', 'Anna', 25, 40);
    await submitScore(h.db, 'a', 'soloClassic' as any, 55, payload(25));
    await submitScore(h.db, 'a', 'soloClassic' as any, 260, payload(200));
    await seed('b', 'Ben', 25, 45);

    const runs = await getPlayerScores(h.db, 'a', SCENE);
    const standings = await getPlayerScoreStandings(h.db, SCENE, runs);
    const placed = new Map(standings.map((s) => [`${s.sheepCount}:${s.score}`, s]));
    for (const entry of runs) {
      expect(placed.has(`${entry.sheepCount}:${entry.score}`)).toBe(true);
    }
    expect(placed.get('25:40')!.rank).toBe(1);
    expect(placed.get('25:55')!.rank).toBe(3);
    expect(placed.get('200:260')!.rank).toBe(1);
  });
});
