-- Cycle 12 Phase 6: backfill `score_submissions` for pre-partition entries.
--
-- Context: prior to Cycle 8 Phase 3, score_submissions had no
-- (scene_id, sheep_count) columns. Migration 0002_mode_matrix added them
-- with `DEFAULT 'field'`/`DEFAULT 200`, but DEFAULT only applies to NEW
-- inserts -- existing rows that already had a materialized best on
-- `players.*_best` were never re-emitted into score_submissions.
--
-- Result: a player whose only ever submission was pre-Cycle-8 has a
-- valid `players.solo_classic_best` value but ZERO rows in
-- score_submissions for soloClassic. The Cycle 8 partitioned-leaderboard
-- slow path joins through score_submissions, so partitioned queries
-- return [] for that player even though their best is live and visible
-- on the fast path.
--
-- This migration inserts ONE synthetic submission per (player, mode) when
-- the materialized best exists but score_submissions is empty for that
-- pair. The synthetic row uses the mode's natural (scene_id, sheep_count)
-- so it lights up both the fast and slow paths consistently.
--
-- Lossy by design: only the materialized best is recoverable, not full
-- history. Append-only, idempotent on re-application via the NOT EXISTS
-- guard.
--
-- Cycle 12 Phase 6 also adds an in-worker slow-path -> fast-path fallback
-- for the natural-partition case (see d1.ts isNaturalPartition), so this
-- backfill is belt-and-suspenders: it makes the slow path correct on its
-- own merits in addition to the runtime fallback.

INSERT INTO score_submissions
  (persistent_id, game_mode, score, submitted_at, room_code, additional_data, sheep_count, scene_id)
SELECT p.persistent_id, 'soloClassic', p.solo_classic_best, p.last_active,
       NULL, '{"backfilled":"0005"}', 200, 'field'
FROM players p
WHERE p.solo_classic_best IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM score_submissions s
    WHERE s.persistent_id = p.persistent_id
      AND s.game_mode = 'soloClassic'
      AND s.scene_id = 'field'
      AND s.sheep_count = 200
  );

INSERT INTO score_submissions
  (persistent_id, game_mode, score, submitted_at, room_code, additional_data, sheep_count, scene_id)
SELECT p.persistent_id, 'soloExtreme', p.solo_extreme_best, p.last_active,
       NULL, '{"backfilled":"0005"}', 1000, 'field'
FROM players p
WHERE p.solo_extreme_best IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM score_submissions s
    WHERE s.persistent_id = p.persistent_id
      AND s.game_mode = 'soloExtreme'
      AND s.scene_id = 'field'
      AND s.sheep_count = 1000
  );

INSERT INTO score_submissions
  (persistent_id, game_mode, score, submitted_at, room_code, additional_data, sheep_count, scene_id)
SELECT p.persistent_id, 'soloInsane', p.solo_insane_best, p.last_active,
       NULL, '{"backfilled":"0005"}', 3000, 'field'
FROM players p
WHERE p.solo_insane_best IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM score_submissions s
    WHERE s.persistent_id = p.persistent_id
      AND s.game_mode = 'soloInsane'
      AND s.scene_id = 'field'
      AND s.sheep_count = 3000
  );

INSERT INTO score_submissions
  (persistent_id, game_mode, score, submitted_at, room_code, additional_data, sheep_count, scene_id)
SELECT p.persistent_id, 'soloChaos', p.solo_chaos_best, p.last_active,
       NULL, '{"backfilled":"0005"}', 5000, 'field'
FROM players p
WHERE p.solo_chaos_best IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM score_submissions s
    WHERE s.persistent_id = p.persistent_id
      AND s.game_mode = 'soloChaos'
      AND s.scene_id = 'field'
      AND s.sheep_count = 5000
  );

INSERT INTO score_submissions
  (persistent_id, game_mode, score, submitted_at, room_code, additional_data, sheep_count, scene_id)
SELECT p.persistent_id, 'timed', p.timed_best, p.last_active,
       NULL, '{"backfilled":"0005"}', 200, 'field'
FROM players p
WHERE p.timed_best IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM score_submissions s
    WHERE s.persistent_id = p.persistent_id
      AND s.game_mode = 'timed'
      AND s.scene_id = 'field'
      AND s.sheep_count = 200
  );
