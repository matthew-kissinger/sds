-- Cycle 35 Phase 2: score-submission error log.
--
-- Records every submitScore() exception (validation reject, D1 batch
-- failure, "player not found") so post-deploy regressions show up as
-- data instead of a silent console.error in the worker. Read with
--   SELECT * FROM score_errors ORDER BY submitted_at DESC LIMIT 50;
-- The optional /api/score-errors admin route (gated by SCORE_ADMIN_SECRET)
-- exposes this without dropping into a wrangler d1 session.
--
-- The insert runs inside the submitScore catch path BEFORE the original
-- error propagates; the route handler still returns 4xx/5xx as today.
-- This is observability, not flow control. If the INSERT itself fails
-- (D1 unavailable), the original error still propagates — see
-- cycle-35-plan.md hard stop #2.

CREATE TABLE IF NOT EXISTS score_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persistent_id TEXT,
  claimed_mode TEXT NOT NULL,
  claimed_score REAL,
  claimed_sheep_count INTEGER,
  claimed_scene_id TEXT,
  reason TEXT NOT NULL,
  submitted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_score_errors_at
    ON score_errors(submitted_at);

CREATE INDEX IF NOT EXISTS idx_score_errors_reason
    ON score_errors(reason);
