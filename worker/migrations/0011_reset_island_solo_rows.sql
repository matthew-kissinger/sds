-- Cycle 117: reset the two Rolling Hills solo rows that predate the pasture.
--
-- D22 (DECISIONS.md, "Front door alignment, round two", locked 2026-07-25).
-- Append-only: new sequence number, never edit an applied migration.
--
-- WHY THESE TWO ROWS AND NOT A SCENE-WIDE RESET
--
-- D12 authorised a reset on the premise that the affected boards held "2 rows,
-- both Dev test entries, zero player-authored scores". A direct read against
-- remote D1 found that premise false. `id=16` is a genuine 12.6-minute human
-- playthrough - the Cycle 57 incident run, un-flagged by hand in production,
-- reading `Dev#0002` only because its owner used the rename endpoint that
-- shipped in the same cycle. The public API could never have shown this: it
-- hard-excludes anomaly-flagged rows (worker/src/d1.ts:1179-1181) and collapses
-- many rows to one per player (:1210).
--
-- Matt chose reset with those facts stated. Cycle 117 changes the Rolling Hills
-- objective from a hidden corral disc with an 8m trigger to a fenced pasture you
-- drive sheep into, so the times are no longer comparable and the board is
-- starting again on the new objective.
--
-- SCOPE IS EXACTLY TWO ROW IDS. Never `scene_id`.
--   id = 16  the Cycle 57 incident run
--   id = 21  a Dev test entry
-- `id = 23` belongs to `Pakrohk#0001`, an outside player, and is NOT touched.
-- Cycle 58 shaped the 200-sheep rung on Rolling Hills around keeping id=16
-- comparable; that rationale is now spent, and the rung itself is unchanged.
--
-- ARCHIVE FIRST, THEN DELETE
--
-- D22 requires the data stay recoverable. It is archived inside the database
-- rather than exported to a file in this repo, for two reasons: no token on the
-- authoring machine has D1 scope (the deploy workflow's CF_API_TOKEN is the only
-- credential that can read the table), and `score_submissions` carries
-- `persistent_id`, which is half of a player's auth pair - it does not belong in
-- a public repository. The archive table keeps every column, so a restore is an
-- INSERT ... SELECT away.
--
-- The DELETE is guarded on the archive actually holding the row, so a failed or
-- skipped archive cannot lose data. `SELECT *` carries whatever columns
-- `score_submissions` has at apply time (id, persistent_id, game_mode, score,
-- submitted_at, room_code, additional_data, sheep_count, scene_id,
-- score_anomalies, party_size), so this survives future column adds.

CREATE TABLE IF NOT EXISTS score_submissions_archive AS
  SELECT * FROM score_submissions WHERE id IN (16, 21);

DELETE FROM score_submissions
WHERE id IN (16, 21)
  AND id IN (SELECT id FROM score_submissions_archive);
