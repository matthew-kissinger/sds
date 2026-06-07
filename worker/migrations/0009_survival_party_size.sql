-- Cycle 67 P7: co-op survival leaderboard. Add party_size so survival boards
-- partition by (scene_id, party_size) - solo (party 1) and co-op (2-4 dogs) stay
-- on separate boards. Append-only (new sequence number; never edit an applied
-- migration).
--
-- Every existing row is solo, so the DEFAULT 1 backfills correctly: prior solo
-- survival rows + all non-survival rows read as party_size = 1, and the Cycle 66
-- survival board (now filtered to party 1) is byte-identical to before. Co-op
-- runs submit party_size 2-4 from the DO's onSubmitScores.
--
-- D1 ALTER TABLE has no IF NOT EXISTS for column adds; `wrangler d1 migrations
-- apply` tracks applied migrations so a re-run is a no-op. The partition index
-- mirrors idx_submissions_partition (0002) with party_size folded in.

ALTER TABLE score_submissions ADD COLUMN party_size INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_submissions_party_partition
  ON score_submissions(game_mode, scene_id, party_size, score);
