-- SDS leaderboard schema. Mirrors server/LeaderboardManager.js.
-- Idempotent for re-application.

CREATE TABLE IF NOT EXISTS players (
  persistent_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  discriminator TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL,
  solo_classic_best REAL,
  solo_extreme_best REAL,
  timed_best INTEGER,
  competitive_wins INTEGER DEFAULT 0,
  cooperative_best REAL
);

CREATE TABLE IF NOT EXISTS discriminators (
  display_name TEXT NOT NULL,
  discriminator TEXT NOT NULL,
  PRIMARY KEY (display_name, discriminator)
);

CREATE TABLE IF NOT EXISTS score_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persistent_id TEXT NOT NULL,
  game_mode TEXT NOT NULL,
  score REAL NOT NULL,
  submitted_at INTEGER NOT NULL,
  room_code TEXT,
  additional_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_players_display_name ON players(display_name);
CREATE INDEX IF NOT EXISTS idx_players_last_active ON players(last_active);
CREATE INDEX IF NOT EXISTS idx_players_solo_classic ON players(solo_classic_best);
CREATE INDEX IF NOT EXISTS idx_players_solo_extreme ON players(solo_extreme_best);
CREATE INDEX IF NOT EXISTS idx_players_timed ON players(timed_best);
CREATE INDEX IF NOT EXISTS idx_players_competitive ON players(competitive_wins);
CREATE INDEX IF NOT EXISTS idx_players_cooperative ON players(cooperative_best);
CREATE INDEX IF NOT EXISTS idx_score_submissions_player ON score_submissions(persistent_id);
CREATE INDEX IF NOT EXISTS idx_score_submissions_mode ON score_submissions(game_mode);
