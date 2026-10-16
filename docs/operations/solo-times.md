# Sheepdog Sim solo times

## Status

Deployed. The `field-v3` partition first shipped as a Worker-only change,
without a D1 migration, before the version 3 client went live. Since Release 1
the client and the score API ship together: `sds-worker` serves both on
`sheepdogsim.com`, from one commit, through the single `Deploy` workflow in
`docs/operations/deployment.md`.

`worker/src/scorePartitions.ts` keeps the clean-room client on `field-v3`,
allows exactly 25, 75 and 200 for solo submissions, and is shared by the
leaderboard route boundary and D1 submission validation. Existing version 2
scene ladders still come from the existing shared scene definitions until the
Release 2 score-service rewrite.

## Why no migration is needed

The score tables already store `scene_id` and `sheep_count`. `field-v3` is a new
partition value in existing columns. Identity registration, rename, JWT refresh,
score submission and aggregate solo reads use the existing routes and schema.

## Required deployment order for a score-service change

A change to `worker/` is a release like any other, with two additions because
it can break returning players silently.

1. Merge the reviewed commit to `main` and confirm `Client CI` is green. It
   runs the Worker typecheck and the full suite, including `tests/worker`.
2. Optionally confirm it on the pull request's preview alias,
   `https://pr-<n>-sds-worker-preview.matt-m-kissinger.workers.dev`, which
   runs that build against the preview D1.
3. Mint a check identity on production and keep the file outside the
   repository:
   `node scripts/verify-identity.mjs --url https://sheepdogsim.com --save <file>`
   The token it stores is valid for 24 hours.
4. Tag and push, which runs `Deploy`. The workflow verifies
   `GET https://sheepdogsim.com/api/healthz` is `application/json`, the
   `field-v3` 25-sheep board read, the release SHA, and the same on the
   `workers.dev` host.
5. `node scripts/verify-identity.mjs --url https://sheepdogsim.com --check <file>`
   must report the pre-change token accepted and the same full name.
6. If the change touches submission, confirm an authenticated plausible
   `soloClassic` score for `field-v3` and 25 is accepted, the same request
   with 50 sheep is rejected, and a version 2 `field` leaderboard still
   returns the same partition.

The check identity is public data named `Cutover Check`. Record the row so it
can be excluded or removed deliberately if desired.

## Rollback

Dispatch `Deploy` with the previous good commit, or run
`wrangler rollback <version-id>` from `worker/`. Either reaches any version from
Release 1 on; neither can cross the Durable Object deletion to an earlier one.
No D1 rollback is required for a change that adds no schema or data migration.
The version 3 client treats resulting `unknown_scene` errors as an unavailable
online board, so Play, completion and local personal bests continue.

## Verification

- `npx vitest run tests/worker`
- `npm run typecheck:worker`
- full repository test, lint and build gates before merge
- production health, field-v3 read and identity receipts after explicit
  deployment approval
