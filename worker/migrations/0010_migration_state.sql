-- P2-MIGRATE-STATE: deploy-controlled migration state table.
--
-- The built-in d1_migrations tracking table is out of sync from early manual
-- applies (0007-0009 were run by hand), so the deploy workflow cannot use
-- `wrangler d1 migrations apply`. This table is the replacement: the deploy's
-- migrate job (scripts/d1-migrate-remote.mjs) records every migration id here,
-- marking it 'failed' BEFORE applying the file and 'applied' after, so a
-- half-failed apply leaves a 'failed' row the next deploy detects and refuses
-- to skip.
--
-- Seeds: every migration file that exists at the time this migration ships is
-- already live in prod (0001-0009 plus this file itself), so they are seeded as
-- 'applied'. INSERT OR IGNORE keeps the seed idempotent for local re-runs and
-- for the bootstrap deploy that applies this file via the legacy diff path.
-- applied_at on seed rows is the seed date, not the true historical apply date.

CREATE TABLE IF NOT EXISTS sds_migration_state (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applied', 'failed'))
);

INSERT OR IGNORE INTO sds_migration_state (id, applied_at, status) VALUES
  ('0001_init.sql', '2026-06-09T00:00:00Z', 'applied'),
  ('0002_backfill_droplet.sql', '2026-06-09T00:00:00Z', 'applied'),
  ('0002_mode_matrix.sql', '2026-06-09T00:00:00Z', 'applied'),
  ('0003_score_anomalies.sql', '2026-06-09T00:00:00Z', 'applied'),
  ('0004_events.sql', '2026-06-09T00:00:00Z', 'applied'),
  ('0005_score_submissions_backfill.sql', '2026-06-09T00:00:00Z', 'applied'),
  ('0006_score_errors.sql', '2026-06-09T00:00:00Z', 'applied'),
  ('0007_player_auth_secret.sql', '2026-06-09T00:00:00Z', 'applied'),
  ('0008_rename_wolfcoast_to_newsheepdogland.sql', '2026-06-09T00:00:00Z', 'applied'),
  ('0009_survival_party_size.sql', '2026-06-09T00:00:00Z', 'applied'),
  ('0010_migration_state.sql', '2026-06-09T00:00:00Z', 'applied');
