-- Cycle 10 Phase 6: score-integrity anomaly column.
--
-- Stores soft-signal anomalies surfaced by submitScore() — cross-field
-- plausibility checks that we want to log but not always reject. Examples:
--   - fast_for_count: score is implausibly low for the claimed sheep_count
--     (e.g. soloChaos at 5000 sheep finishing under 60s)
--   - mode_count_mismatch: claimed sheep_count is outside the allowed set
--     for the mode (e.g. soloClassic with 1000 sheep — rejected outright)
--   - client_clock_skew: clientFinishedAt - clientStartedAt diverges from
--     the claimed score (duration) by > 10s
--
-- Stored as a JSON blob so future anomalies can be added without further
-- migrations. Default null means "no anomalies flagged" — same semantics
-- as legitimate pre-Cycle-10 rows.
--
-- Hard-rejected submissions never reach this column; they 400 at the
-- worker boundary (submissionScoreBoundsOk).
--
-- Backfill is a no-op: leaving NULL on existing rows is the correct
-- "no anomalies known" default.

ALTER TABLE score_submissions ADD COLUMN score_anomalies TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_anomalies
  ON score_submissions(score_anomalies)
  WHERE score_anomalies IS NOT NULL;
