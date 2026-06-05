// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 58 Phase 4 — leaderboard partition switch (scene, slug) -> (scene, count).
//
// The load-bearing guarantee of this cycle: switching the solo leaderboard read
// to key on (scene_id, sheep_count) must be BYTE-IDENTICAL for every existing
// row, so no Home Field (or restored Sheep Dog Island) score moves. This spec
// proves it against a real SQLite engine with the committed migrations: it seeds
// existing-shape rows (each legacy slug 1:1 with its canonical count) and asserts
// the new `solo`/(scene, count) read returns exactly what the old per-slug read
// returned — same membership, order, scores, and formatting.
//
// Hard stop 1 (docs/cycle-58-plan.md): if any existing board changes membership
// or order here, the partition switch is wrong. This is that gate.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestD1, sqliteAvailable, type TestD1 } from './helpers/d1-sqlite';
import {
  registerPlayer,
  submitScore,
  getLeaderboard,
  getAllLeaderboards,
} from '../../worker/src/d1';

// A clean unflagged submit payload (no client window => skew check skipped;
// scores chosen above each count's fast-band so fast_for_count never fires).
function payload(sceneId: string, sheepCount: number) {
  return { gameMode: 'solo', sceneId, sheepCount, totalSheep: sheepCount, timestamp: 1 };
}

describe.skipIf(!sqliteAvailable)('leaderboard partition (scene, count) — Cycle 58 P4', () => {
  let h: TestD1;
  beforeEach(() => { h = createTestD1(); });
  afterEach(() => { h.close(); });

  async function seedRun(id: string, name: string, slug: string, sceneId: string, count: number, score: number) {
    await registerPlayer(h.db, id, name, 'custom');
    await submitScore(h.db, id, slug as any, score, payload(sceneId, count));
  }

  // Seed existing-shape prod data: each solo slug 1:1 with its canonical count.
  async function seedExistingShape() {
    await seedRun('a', 'Anna', 'soloClassic', 'field', 200, 60);
    await seedRun('b', 'Ben', 'soloClassic', 'field', 200, 45);   // faster -> ranks above Anna
    await seedRun('c', 'Cara', 'soloExtreme', 'field', 1000, 200);
    await seedRun('e', 'Evan', 'soloChaos', 'field', 5000, 300);
    await seedRun('d', 'Dana', 'soloClassic', 'rolling-hills', 200, 120); // id=16-like
  }

  it('the new (scene, count) read is byte-identical to the old per-slug read', async () => {
    await seedExistingShape();

    // For each legacy anchor, the new solo/(scene,count) board must equal the
    // old per-slug board exactly. The old per-slug read applied no sheepCount
    // filter (fixed-count modes stripped it), but each slug is count-homogeneous
    // so the rows are the same set.
    const cases: Array<[string, string, number]> = [
      ['soloClassic', 'field', 200],
      ['soloExtreme', 'field', 1000],
      ['soloChaos', 'field', 5000],
      ['soloClassic', 'rolling-hills', 200],
    ];
    for (const [slug, sceneId, count] of cases) {
      const legacy = await getLeaderboard(h.db, slug as any, 10, { sceneId });
      const next = await getLeaderboard(h.db, 'solo', 10, { sceneId, sheepCount: count });
      expect(next).toEqual(legacy);
    }
  });

  it('the field/200 board keeps its exact membership and order', async () => {
    await seedExistingShape();
    const board = await getLeaderboard(h.db, 'solo', 10, { sceneId: 'field', sheepCount: 200 });
    // MIN score ascending: Ben (45) then Anna (60). Cara/Evan are other counts.
    expect(board.map((e) => e.displayName)).toEqual(['Ben', 'Anna']);
    expect(board.map((e) => e.score)).toEqual([45, 60]);
    expect(board[0].rank).toBe(1);
  });

  it('two counts on the same scene are separate boards', async () => {
    await seedExistingShape();
    const at200 = await getLeaderboard(h.db, 'solo', 10, { sceneId: 'field', sheepCount: 200 });
    const at1000 = await getLeaderboard(h.db, 'solo', 10, { sceneId: 'field', sheepCount: 1000 });
    expect(at200.map((e) => e.displayName).sort()).toEqual(['Anna', 'Ben']);
    expect(at1000.map((e) => e.displayName)).toEqual(['Cara']);
  });

  it('scene partitions hold — Home Field 200 and Sheep Dog Island 200 do not mix', async () => {
    await seedExistingShape();
    const field200 = await getLeaderboard(h.db, 'solo', 10, { sceneId: 'field', sheepCount: 200 });
    const island200 = await getLeaderboard(h.db, 'solo', 10, { sceneId: 'rolling-hills', sheepCount: 200 });
    expect(field200.map((e) => e.displayName)).toEqual(['Ben', 'Anna']);
    expect(island200.map((e) => e.displayName)).toEqual(['Dana']);
  });

  it('a new ranked island tier (Rolling Hills 75) is a fresh, initially-empty board', async () => {
    await seedExistingShape();
    const rh75 = await getLeaderboard(h.db, 'solo', 10, { sceneId: 'rolling-hills', sheepCount: 75 });
    expect(rh75).toEqual([]);
    // ...and accepts a fast small-flock run that the old 30s floor would have
    // (via the new graduated floor) — 22s clears the 20s floor for 75 sheep.
    await seedRun('f', 'Fia', 'soloClassic', 'rolling-hills', 75, 22);
    const after = await getLeaderboard(h.db, 'solo', 10, { sceneId: 'rolling-hills', sheepCount: 75 });
    expect(after.map((e) => e.displayName)).toEqual(['Fia']);
  });

  it('getAllLeaderboards emits solo:<count> boards for the scene ladder, no slug keys', async () => {
    await seedExistingShape();
    const all = await getAllLeaderboards(h.db, 10, { sceneId: 'field' });

    // Field ranked ladder is [25, 200, 1000, 3000, 5000].
    expect(all['solo:200'].map((e) => e.displayName)).toEqual(['Ben', 'Anna']);
    expect(all['solo:1000'].map((e) => e.displayName)).toEqual(['Cara']);
    expect(all['solo:5000'].map((e) => e.displayName)).toEqual(['Evan']);
    expect(all['solo:25']).toEqual([]);   // new Quick board, empty
    expect(all['solo:3000']).toEqual([]); // Insane board, empty

    // The old per-slug keys are gone; MP keys remain.
    expect(all['soloClassic']).toBeUndefined();
    expect(all['soloExtreme']).toBeUndefined();
    expect(all).toHaveProperty('cooperative');
    expect(all).toHaveProperty('competitive');
    expect(all).toHaveProperty('timed');
  });

  it('getAllLeaderboards on Rolling Hills surfaces its 200 board (incident comparability)', async () => {
    await seedExistingShape();
    const all = await getAllLeaderboards(h.db, 10, { sceneId: 'rolling-hills' });
    // Rolling Hills ranked ladder is [25, 75, 200, 1000, 5000].
    expect(all['solo:200'].map((e) => e.displayName)).toEqual(['Dana']);
    expect(all).toHaveProperty('solo:75');
    expect(all['solo:1000']).toEqual([]);
  });
});
