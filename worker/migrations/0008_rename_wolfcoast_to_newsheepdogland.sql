-- Cycle 66 Phase 1: rename the Wolf Coast leaderboard partition to Newsheepdogland.
-- Append-only (new sequence number; never edit an applied migration).
--
-- The island scene id changed from 'wolf-coast' to 'newsheepdogland' (the full
-- Cycle 66 rename), so the score_submissions partition key (scene_id) must follow
-- or prior Wolf Coast solo scores orphan under a dead id. Per-scene leaderboards
-- are computed on demand from score_submissions(game_mode, scene_id, sheep_count,
-- score), so moving scene_id is the whole migration; players has no per-scene
-- column to touch.
--
-- Idempotent: a re-run finds no 'wolf-coast' rows and is a no-op. Wolf Coast solo
-- shipped in Cycle 64, so the affected row count is small.

UPDATE score_submissions
SET scene_id = 'newsheepdogland'
WHERE scene_id = 'wolf-coast';
