# Leaderboard Season Plan

Status: v2.6.0 beta plan. No production leaderboard reset is approved by this document.

## Decision

Do not wipe existing production leaderboard data as a launch shortcut. Preserve existing all-time records and add seasonal views when the backend/UI work is intentionally scoped.

Recommended beta model:

- Default beta view: `v2.6.0 Beta Season 1` once implemented.
- Permanent historical view: All-Time Top 5 per scene and mode.
- Seasonal reset cadence: manual per beta event, not automatic calendar churn at first.
- Focus boards: feature the modes with real participation first instead of spreading attention across every empty mode.

## Player Promise

Public copy should say:

> Leaderboards are active beta infrastructure. Scores may be reset, archived, or split into seasonal and all-time views before launch.

Do not say existing records will be deleted unless Matt approves a reset.

## Implementation Shape

The safe implementation is a follow-up Worker/D1 cycle:

1. Add an append-only migration for leaderboard seasons or partitions.
2. Keep legacy records readable as all-time records.
3. Add API query support for `season=current`, `season=all-time`, and a specific season id.
4. Update GlobalLeaderboard to default to current season when populated, with All-Time one tap away.
5. Backfill `all-time` from existing production data or treat existing rows as all-time by default.
6. Add admin-only season creation/activation tooling or a documented Wrangler/D1 runbook.
7. Add tests for legacy rows, current-season rows, empty-season fallback, and top-5 all-time display.

## No-Go Shortcuts

- Do not delete current production scores to simulate a season reset.
- Do not edit existing D1 migrations.
- Do not add a season UI that silently hides old records without an all-time route.
- Do not make every mode equally prominent if most boards are empty.

## Beta Event Candidates

- Quick 25 starter challenge on Home Field or Rolling Hills.
- Open Country portal drive.
- Multiplayer room night.
- Mobile device test weekend.
- Big-flock screenshot run, unranked if performance or fairness is inconsistent.
