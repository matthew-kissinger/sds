# Sheepdog Sim 3 solo-times cutover

## Status

Implemented locally on `codex/v3-static-cutover`. No production Worker, D1,
Pages, DNS or repository setting has been changed.

The Worker-only change adds `worker/src/scorePartitions.ts`. The helper keeps
the clean-room client on `field-v3`, allows exactly 25, 75 and 200 for solo
submissions, and is shared by the leaderboard route boundary and D1 submission
validation. Existing version 2 scene ladders still come from the existing
shared scene definitions.

## Why no migration is needed

The score tables already store `scene_id` and `sheep_count`. `field-v3` is a new
partition value in existing columns. Identity registration, rename, JWT refresh,
score submission and aggregate solo reads use the existing routes and schema.

## Required deployment order

1. Merge and deploy the reviewed Worker-only commit.
2. Confirm `GET /healthz` still reports the current Worker.
3. Register a temporary identity through `POST /api/register` and retain the
   returned token and device secret only for the smoke.
4. Confirm `GET /api/leaderboard?mode=solo&scene=field-v3&sheepCount=25&limit=1`
   returns 200.
5. Confirm an authenticated plausible `soloClassic` score for `field-v3` and 25
   is accepted, then confirm the same request with 50 sheep is rejected.
6. Confirm a version 2 `field` leaderboard still returns the same partition.
7. Only then deploy the version 3 Pages client.

The smoke identity and score are public data. Use an explicit operational name
and record the row so it can be excluded or removed deliberately if desired.

## Rollback

Rollback the Worker to its immediately previous Cloudflare deployment. No D1
rollback is required because the change creates no schema or data migration.
The version 3 client treats resulting `unknown_scene` errors as an unavailable
online board, so Play, completion and local personal bests continue.

## Verification

- `npx vitest run tests/worker/v3-score-partition.spec.ts`
- `npm run typecheck`
- full repository test, lint and build gates before merge
- production health, field-v3 read, accepted-count, rejected-count and version 2
  board-parity receipts after explicit deployment approval
