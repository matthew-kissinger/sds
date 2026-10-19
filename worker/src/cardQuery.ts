// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Reads behind a card. Membership is the public board's: the four solo
// slugs, anomaly rows excluded, one flock size. A week adds a window on
// submitted_at and nothing else. The standings query is the one
// getPlayerScoreStandings already runs, plus that window.

import { getPlayerScoreStandings, isSoloMode, type PlayerScoreRow } from './d1';
import { V3_RANKED_COUNTS, V3_SCORE_SCENE_ID } from './scorePartitions';
import { signCardId, sharePath as cardSharePath } from './cardToken';
import { utcWeekStart, weekLabel } from './cardWeek';
import type { CardFacts } from './cardCopy';

const WEEK_MS = 7 * 86_400_000;
const WEEK_GROUP_CAP = 40;

export interface CardRun {
  readonly id: number;
  readonly name: string;
  readonly gameMode: string;
  readonly sheepCount: number;
  readonly score: number;
  readonly submittedAt: number;
  readonly sceneId: string;
  readonly flagged: boolean;
}

export function isShareableRun(run: {
  sceneId: string;
  sheepCount: number;
  gameMode: string;
  flagged: boolean;
}): boolean {
  return !run.flagged
    && run.sceneId === V3_SCORE_SCENE_ID
    && (V3_RANKED_COUNTS as readonly number[]).includes(run.sheepCount)
    && isSoloMode(run.gameMode);
}

export async function readCardRun(db: D1Database, id: number): Promise<CardRun | null> {
  const row = await db.prepare(
    `SELECT s.id, s.game_mode, s.score, s.submitted_at, s.sheep_count, s.scene_id, s.score_anomalies,
            p.display_name
       FROM score_submissions s
       JOIN players p ON p.persistent_id = s.persistent_id
      WHERE s.id = ?`,
  ).bind(id).first<{
    id: number;
    game_mode: string;
    score: number;
    submitted_at: number;
    sheep_count: number;
    scene_id: string;
    score_anomalies: string | null;
    display_name: string;
  }>();
  if (!row) return null;
  return {
    id: row.id,
    name: row.display_name,
    gameMode: row.game_mode,
    sheepCount: row.sheep_count,
    score: row.score,
    submittedAt: row.submitted_at,
    sceneId: row.scene_id,
    flagged: row.score_anomalies != null,
  };
}

export async function factsForRun(db: D1Database, run: CardRun): Promise<CardFacts | null> {
  if (!isShareableRun(run)) return null;
  if (run.sheepCount !== 25 && run.sheepCount !== 75 && run.sheepCount !== 200) return null;
  const from = utcWeekStart(run.submittedAt);
  const [allTime, week] = await Promise.all([
    getPlayerScoreStandings(db, run.sceneId, [{ sheepCount: run.sheepCount, score: run.score }]),
    standingsInWindow(db, run.sceneId, run.sheepCount, from, from + WEEK_MS, [run.score]),
  ]);
  const all = allTime.find((row) => row.sheepCount === run.sheepCount && row.score === run.score);
  const weekly = week.find((row) => row.score === run.score);
  if (!all || !weekly) return null;
  return {
    name: run.name,
    sheepCount: run.sheepCount,
    scoreSeconds: run.score,
    allTimeRank: all.rank,
    allTimePlayers: all.players,
    weekRank: weekly.rank,
    weekPlayers: weekly.players,
    weekLabel: weekLabel(run.submittedAt),
  };
}

interface WeekGroup {
  readonly sheepCount: number;
  readonly from: number;
  readonly to: number;
  readonly scores: number[];
}

interface WeekRank {
  readonly sheepCount: number;
  readonly score: number;
  readonly from: number;
  readonly rank: number;
  readonly players: number;
}

function weekGroups(runs: readonly PlayerScoreRow[]): WeekGroup[] {
  const groups = new Map<string, WeekGroup>();
  for (const run of runs) {
    if (run.flagged) continue;
    const from = utcWeekStart(run.submittedAt);
    const key = `${run.sheepCount}:${from}`;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.scores.includes(run.score)) existing.scores.push(run.score);
      continue;
    }
    if (groups.size >= WEEK_GROUP_CAP) continue;
    groups.set(key, { sheepCount: run.sheepCount, from, to: from + WEEK_MS, scores: [run.score] });
  }
  return [...groups.values()];
}

// Four fixed binds plus these scores stay under D1's 100-parameter cap.
// A history of 200 runs can all fall in one week.
const SCORE_BIND_BATCH = 64;

async function standingsInWindow(
  db: D1Database,
  sceneId: string,
  sheepCount: number,
  from: number,
  to: number,
  scores: readonly number[],
): Promise<{ score: number; rank: number; players: number }[]> {
  const out: { score: number; rank: number; players: number }[] = [];
  for (let i = 0; i < scores.length; i += SCORE_BIND_BATCH) {
    const slice = scores.slice(i, i + SCORE_BIND_BATCH);
    const slots = slice.map(() => '(?)').join(', ');
    const { results } = await db.prepare(
      `WITH bests AS (
         SELECT persistent_id, MIN(score) AS best
           FROM score_submissions
          WHERE game_mode IN ('soloClassic', 'soloExtreme', 'soloInsane', 'soloChaos')
            AND scene_id = ?
            AND sheep_count = ?
            AND score_anomalies IS NULL
            AND submitted_at >= ?
            AND submitted_at < ?
          GROUP BY persistent_id
       ),
       mine(score) AS (VALUES ${slots})
       SELECT mine.score AS score,
              (SELECT COUNT(*) FROM bests) AS players,
              (SELECT COUNT(*) FROM bests b WHERE b.best < mine.score) + 1 AS rank
         FROM mine`,
    ).bind(sceneId, sheepCount, from, to, ...slice).all<{ score: number; players: number; rank: number }>();
    out.push(...(results || []));
  }
  return out;
}

async function weekRanks(db: D1Database, sceneId: string, runs: readonly PlayerScoreRow[]): Promise<WeekRank[]> {
  const groups = weekGroups(runs);
  const out: WeekRank[] = [];
  for (let i = 0; i < groups.length; i += 6) {
    const slice = groups.slice(i, i + 6);
    const parts = await Promise.all(slice.map(async (group) => {
      const rows = await standingsInWindow(db, sceneId, group.sheepCount, group.from, group.to, group.scores);
      return rows.map((row) => ({ ...row, sheepCount: group.sheepCount, from: group.from }));
    }));
    for (const part of parts) out.push(...part);
  }
  return out;
}

export interface OwnedRunEntry {
  readonly sheepCount: number;
  readonly score: number;
  readonly submittedAt: number;
  readonly boardRank?: number;
  readonly boardPlayers?: number;
  readonly weekRank?: number;
  readonly weekPlayers?: number;
  readonly weekLabel?: string;
  readonly sharePath?: string;
}

/** The my-scores entries. A flagged row is still the player's run, and it gets no rank and no link. */
export async function ownedRunEntries(
  db: D1Database,
  sceneId: string,
  runs: readonly PlayerScoreRow[],
  secret: string,
): Promise<OwnedRunEntry[]> {
  const shareable = (run: PlayerScoreRow) => isShareableRun({
    ...run, gameMode: 'soloClassic', sceneId,
  });
  const rankable = runs.filter((run) => !run.flagged);
  const [allTime, weeks] = await Promise.all([
    getPlayerScoreStandings(db, sceneId, rankable),
    weekRanks(db, sceneId, runs.filter(shareable)),
  ]);
  const allKey = (sheepCount: number, score: number) => `${sheepCount}:${score}`;
  const weekKey = (sheepCount: number, score: number, from: number) => `${sheepCount}:${score}:${from}`;
  const all = new Map(allTime.map((row) => [allKey(row.sheepCount, row.score), row]));
  const weekly = new Map(weeks.map((row) => [weekKey(row.sheepCount, row.score, row.from), row]));
  const entries: OwnedRunEntry[] = [];
  for (const run of runs) {
    const entry: OwnedRunEntry = {
      sheepCount: run.sheepCount,
      score: run.score,
      submittedAt: run.submittedAt,
    };
    const standing = run.flagged ? undefined : all.get(allKey(run.sheepCount, run.score));
    const week = shareable(run)
      ? weekly.get(weekKey(run.sheepCount, run.score, utcWeekStart(run.submittedAt)))
      : undefined;
    const sig = shareable(run) ? await signCardId(run.id, secret) : null;
    entries.push({
      ...entry,
      ...(standing ? { boardRank: standing.rank, boardPlayers: standing.players } : {}),
      ...(week ? {
        weekRank: week.rank,
        weekPlayers: week.players,
        weekLabel: weekLabel(run.submittedAt),
      } : {}),
      ...(sig ? { sharePath: cardSharePath(run.id, sig) } : {}),
    });
  }
  return entries;
}

/** Fields POST /api/score adds once the inserted row is a shareable version 3 time. */
export async function submissionShare(
  db: D1Database,
  id: number,
  secret: string,
): Promise<{
  sharePath: string;
  boardRank: number;
  boardPlayers: number;
  weekRank: number;
  weekPlayers: number;
  weekLabel: string;
} | null> {
  const run = await readCardRun(db, id);
  if (!run) return null;
  const facts = await factsForRun(db, run);
  if (!facts) return null;
  return {
    sharePath: cardSharePath(id, await signCardId(id, secret)),
    boardRank: facts.allTimeRank,
    boardPlayers: facts.allTimePlayers,
    weekRank: facts.weekRank,
    weekPlayers: facts.weekPlayers,
    weekLabel: facts.weekLabel,
  };
}
