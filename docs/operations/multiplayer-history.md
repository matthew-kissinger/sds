# Multiplayer history setup

Owner-directed implementation, 2026-10-21. Local code is separate from solo
scores. No new Cloudflare resource has been provisioned for this candidate.

## What deployment needs

- One D1 database named `sds-multiplayer`, bound as `MATCH_DB` to `sds-realtime`.
  Never reuse `sds-db`, `sds-db-preview` or the staging identity database.
- One random `OWNER_STATS_TOKEN` secret on `sds-realtime` (32 random bytes,
  encoded as 64 hex characters). It authorizes read-only dashboard queries.
  Keep it in the owner's password manager, not source, logs, URL or chat.
- The existing `/r/*` route and `GAME_SHELL`/`IDENTITY` service bindings suffice.
  No new Worker, hostname, Access application or third-party service is needed.
  Do not change room capacity, identity secrets or the solo database.

The actual D1 list request returned authentication error 10000 on October 21,
despite `whoami` succeeding and reporting D1 scope. Operational/bootstrap
credentials also failed that read. Refresh OAuth with
`node tools/staging-wrangler.mjs login`, then repeat
`node tools/staging-wrangler.mjs d1 list`. The wrapper omits a stale inherited
API token for its child process; it does not change machine credentials.
Do not infer usable D1 access from the login summary alone.

## One-time setup, after access and deployment authorization

1. Create `sds-multiplayer` in the existing account with
   `node tools/staging-wrangler.mjs d1 create sds-multiplayer`. Record its returned
   UUID. Add this object to `d1_databases` in `realtime/wrangler.json`:
   `binding: MATCH_DB`, `database_name: sds-multiplayer`, `database_id: <returned UUID>`,
   `migrations_dir: migrations`. Commit the real binding; no placeholder ID is
   checked in. The migration path is relative to that config.
2. Verify the binding points to that new database, then run
   `node tools/staging-wrangler.mjs d1 migrations apply MATCH_DB --remote --config realtime/wrangler.json`.
   Only `realtime/migrations/0001_match_history.sql` applies. It creates
   `matches`, `participants` and `capacity_days`; no existing tables are altered.
3. Generate the owner token securely and supply it through Wrangler's secret
   prompt: `node tools/staging-wrangler.mjs secret put OWNER_STATS_TOKEN --config realtime/wrangler.json`.
   Never pass its value as a shell argument. Secret changes may deploy a Worker
   revision: perform this during the same authorized empty-room cutover.
4. Follow [the production release procedure](deployment.md) for the exact
   reviewed commit and tag. Neither this note nor the feature PR authorizes a
   deploy. Keep protocol 3 and room schema 3; existing metadata is additive.
5. Play a two-player competitive round, leave once, and verify the departing
   player's forfeit and remaining player's separate win-by-forfeit in history.
   Refresh `/r/owner` with the owner key and check the regional totals. Confirm
   normal player authorization cannot open owner data and solo still works.

Without `MATCH_DB`, the game continues and stats report unavailable; it does
not silently fall back to solo storage. Without the owner secret, the owner
API fails closed. Both missing pieces must be supplied before claiming this
feature is enabled in production.

## Persistence and failure behaviour

Room lifecycle changes store a round record with the room state. A DO alarm
exports it with the participant rows in one D1 batch. Revision guards make
retries idempotent and prevent a stale start export replacing a final result.
Cloudflare documents [batch rollback on failure](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).
No D1 request runs inside the simulation tick or its concurrency guard.

Exports normally begin after five seconds. Failures back off to five minutes;
records survive DO eviction and room cleanup. A room with 64 pending rounds
refuses another start until export catches up. Active play continues. A live
simulation lost to a server restart remains interrupted, with no invented
completion or partial capture total. The history store is not a replay log.
Daily capacity counters retry separately; their outbox retains up to 64 days.

The owner view is manually refreshed, with bounded 1/7/30-day queries and 30
recent rounds. Player history is identity-filtered and paged 20 at a time.
Simple indexed SQL computes totals; no counter pipeline or scheduled analytics
job is needed at the current one-room-per-region cap. Monitor query rows/latency
before increasing capacity or adding a public leaderboard.

Initial retention is indefinite, flagged in STATUS for owner review. History
starts when enabled; old ephemeral rounds cannot be backfilled. Clearing local
identity does not delete server records. Names are frozen at round start.
Persistent IDs stay server-side; history responses contain player labels and
results, not identity proofs or invite handles. The owner key stays in tab
memory; Lock or reload clears it. Rotate the secret if access needs revoking.

Rollback retains the D1 database and DO outbox. Do not drop tables to roll back
code. A pre-history Worker will stop exports and new history collection; the
retained outbox can resume when compatible code returns. Confirm room drain
first, since rollback still interrupts active in-memory simulation.

## Cost scope

The existing account is Workers Paid, as confirmed by the owner. Current
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) includes
25 billion rows read, 50 million rows written and 5 GB storage monthly across
the account. Above those shared allowances, reads cost $0.001 per million,
writes $1 per million and storage $0.75 per GB-month. Index writes count too.
No separate fixed database fee applies. Remaining account allowances could not
be verified because the actual D1 request failed.

Planning example, not a billing measurement: 10,000 rounds at a conservative
100 billable row writes each, 100 million rows read and 0.1 GB-month would add
$1.175 in D1 charges even if all allowances were already consumed. Disconnect
churn, repeated reads and index work change those quantities. This excludes
existing Worker/DO simulation and new outbox-alarm/storage usage, which must
be checked against actual account metrics. The $20 pilot budget is unchanged;
there is no paid load experiment or increased room cap in this change.
