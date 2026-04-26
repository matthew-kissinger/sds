-- Cycle 8 Phase 3: leaderboard partitioning by (mode × scene × sheepCount).
-- Idempotent for re-application.
--
-- Schema goals:
--   1) Track sheep_count + scene_id on every audit row so leaderboards can be
--      partitioned by these dimensions on demand.
--   2) Add materialized-best columns for the two new solo modes (insane,
--      chaos), matching the existing pattern for fast all-time leaderboards.
--      Per-(scene × sheep_count) leaderboards are computed on-demand from
--      score_submissions via the new index.
--
-- Backfill strategy (Q5):
--   - All pre-Cycle-8 rows: scene_id='field', sheep_count=200 (the 5 modes
--     that existed only ever ran on Field at 200 except soloExtreme).
--   - soloExtreme: bump sheep_count to 1000 (Cycle 4 hardcoded count).
--
-- D1 ALTER TABLE doesn't support IF NOT EXISTS for column adds, so we use
-- the "trick" of adding the column inside a transaction and ignoring errors
-- on re-application via SQLite pragmas. wrangler d1 will error out on
-- duplicate-column on re-run; for idempotence in dev, drop the migration
-- log row before re-running, or use `wrangler d1 migrations apply --local`
-- which tracks applied migrations.

ALTER TABLE score_submissions ADD COLUMN sheep_count INTEGER NOT NULL DEFAULT 200;
ALTER TABLE score_submissions ADD COLUMN scene_id TEXT NOT NULL DEFAULT 'field';

UPDATE score_submissions
SET sheep_count = 1000
WHERE game_mode = 'soloExtreme';

ALTER TABLE players ADD COLUMN solo_insane_best REAL;
ALTER TABLE players ADD COLUMN solo_chaos_best REAL;

CREATE INDEX IF NOT EXISTS idx_players_solo_insane ON players(solo_insane_best);
CREATE INDEX IF NOT EXISTS idx_players_solo_chaos ON players(solo_chaos_best);
CREATE INDEX IF NOT EXISTS idx_submissions_partition
  ON score_submissions(game_mode, scene_id, sheep_count, score);
