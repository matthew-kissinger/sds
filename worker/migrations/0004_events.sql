-- Cycle 11 Phase 5: client-side telemetry event log.
--
-- Anonymous events welcome (no auth required for game_completed,
-- mode_selected, scene_swapped). When a player JWT is present the worker
-- records persistent_id so we can dedupe users without gating the route.
-- props is a JSON blob capped at 2KB by the worker for safety.

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    props TEXT,
    player_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_name_created
    ON events(name, created_at);

CREATE INDEX IF NOT EXISTS idx_events_player_id
    ON events(player_id) WHERE player_id IS NOT NULL;
