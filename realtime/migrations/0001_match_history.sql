-- Multiplayer only. Never apply to the solo score database.
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER,
  region TEXT NOT NULL, mode TEXT NOT NULL, flock_size INTEGER NOT NULL,
  party_size INTEGER NOT NULL, status TEXT NOT NULL, reason TEXT,
  wait_ms INTEGER, record TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_recent ON matches(created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS participants (
  match_id TEXT NOT NULL REFERENCES matches(id), player_id TEXT NOT NULL,
  slot INTEGER NOT NULL, outcome TEXT NOT NULL, forfeited INTEGER NOT NULL,
  sheep INTEGER, disconnects INTEGER NOT NULL, reconnects INTEGER NOT NULL,
  PRIMARY KEY(match_id, player_id)
);
CREATE INDEX IF NOT EXISTS participants_player ON participants(player_id, match_id);
CREATE TABLE IF NOT EXISTS capacity_days (
  day INTEGER NOT NULL, region TEXT NOT NULL, rejected INTEGER NOT NULL,
  PRIMARY KEY(day, region)
);
