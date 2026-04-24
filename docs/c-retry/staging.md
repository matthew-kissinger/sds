# Staging environment plan for C-retry

> Written 2026-04-23 as prep for the Cycle 2 retry of the Cloudflare Workers + DO + D1 + Pages migration. Direct response to POSTMORTEM 5.8: "keep the droplet running, keep the Geckos path in NetworkManager.js, and keep VITE_USE_DO_BACKEND=false as the production default until the migration has run for >=7 days in a staging environment that real users (or the user + a second browser) have exercised." Cycle 1 shipped on curl smoke tests against production because no staging existed. This doc specs one.

## 1. Topology

```
                                     USERS
                                       |
                                       v
                        +------------------------------+
                        |  sheepdogsim.com (apex)      |
                        |  Cloudflare DNS/CDN proxy    |
                        |  CNAME -> GH Pages           |  <-- PRODUCTION (unchanged)
                        +------------------------------+
                                       |
                     +-----------------+-----------------+
                     |                                   |
                     v                                   v
          +----------------------+        +--------------------------+
          |  GitHub Pages        |        |  api.sheepdogsim.com     |
          |  static frontend     |        |  147.182.185.185 droplet |
          |  VITE_USE_DO_BACKEND |        |  Node 22 + Geckos + PM2  |
          |  = false (baked)     |        |  SQLite (207 players)    |
          +----------------------+        +--------------------------+

          - - - - - - - - - - separate zone - - - - - - - - - - - - -

                        +------------------------------+
                        |  staging.sheepdogsim.com     |
                        |  Cloudflare Pages project    |
                        |  sds-staging (branch:        |  <-- STAGING (new)
                        |  staging-retry)              |
                        |  VITE_USE_DO_BACKEND = true  |
                        +------------------------------+
                                       |
                     +-----------------+-----------------+
                     |                                   |
                     v                                   v
          +----------------------+        +--------------------------+
          |  Pages static assets |        |  Worker sds-worker-      |
          |  served from CF edge |        |  staging (routed on      |
          |                      |        |  staging.sheepdogsim.com |
          |                      |        |  /api/* and /r/*/ws)     |
          +----------------------+        +--------------------------+
                                                      |
                                          +-----------+-----------+
                                          |                       |
                                          v                       v
                                  +---------------+     +-------------------+
                                  | RoomDO (per   |     | D1: sds-db-       |
                                  | room) +       |     | staging           |
                                  | LobbyDO       |     | (seeded fixtures) |
                                  +---------------+     +-------------------+
```

The droplet continues to serve sheepdogsim.com users. staging.sheepdogsim.com is an entirely separate stack with its own Worker, DO namespace, D1, and Pages project. There is no cross-talk; a bug in staging cannot page-fault production.

## 2. Subdomain choice

Recommended: `staging.sheepdogsim.com`.

Rationale:
- Same parent zone, so no new DNS zone to manage.
- Browser same-site behavior matches prod (cookies, localStorage partitioning).
- CORS is still different host, so the allowlist bug from cycle-1-audit (CORS_ORIGIN omitted `sheepdogsim.pages.dev` and previews) gets caught here before it reaches prod.

Cloudflare dashboard steps to create:

1. Dash -> Workers & Pages -> Create application -> Pages -> Connect to Git -> pick `matthew-kissinger/sds` repo. Name the project `sds-staging`.
2. Build config: build command `npm run build`, output directory `dist`, root directory `/`. Set production branch to `staging-retry` (not `main`).
3. After first deploy, Custom domains -> Set up a custom domain -> `staging.sheepdogsim.com`. CF auto-creates the CNAME record because the zone is on the same account.
4. Workers & Pages -> sds-worker-staging -> Settings -> Triggers -> Custom Domains / Routes. Add routes `staging.sheepdogsim.com/api/*` and `staging.sheepdogsim.com/r/*`.
5. Worker secret: `wrangler secret put JWT_SECRET --env staging` with a freshly generated 64-char hex string (different from prod).

CORS allowlist update for the Worker: `CORS_ORIGIN` for the staging environment must include `https://staging.sheepdogsim.com`, `https://sds-staging.pages.dev`, `https://*.sds-staging.pages.dev` (preview deploys), and `http://localhost:3000`. Cycle-1 audit flagged that the prod allowlist only listed `https://sheepdogsim.com` and `http://localhost:3000`; every preview deploy would have silently 403'd. Verify this in staging before prod cutover.

## 3. DNS plan

All records live in the existing Cloudflare zone `sheepdogsim.com`.

Add:

| Type  | Name      | Content                         | Proxy | TTL  |
|-------|-----------|---------------------------------|-------|------|
| CNAME | staging   | sds-staging.pages.dev           | Proxied | Auto |

No change to:

- `@` (apex) - continues to point at GH Pages via existing setup.
- `api` - continues to point at the droplet `147.182.185.185`.
- `www` - existing CNAME to apex.

Pages custom-domain binding for `staging.sheepdogsim.com` is handled via the CF Pages UI, which uses a CNAME flattening record (CF-managed). This matches CF's documented convention for Pages custom subdomains. No A record needed; no apex change.

## 4. Pages project layout

One Pages project this cycle; a second (prod) project only gets created if/when Track F-retry runs.

| Project        | Prod branch     | Custom domain                 | Env var VITE_USE_DO_BACKEND | Exists today? |
|----------------|-----------------|-------------------------------|-----------------------------|---------------|
| sds-staging    | `staging-retry` | staging.sheepdogsim.com       | true                        | created by this plan |
| sds-frontend   | `main`          | sheepdogsim.com (Track F-retry only) | false                | not yet; prod is still GH Pages |

Branch `staging-retry` is long-lived; C1-C4 retry work lands on it via feature branches. `main` keeps deploying to GitHub Pages (with the Geckos path) for the entire soak window.

Workflow YAML sketch (do not create the file this unit; it ships with C4-retry):

```yaml
name: Deploy staging
on:
  push:
    branches: [staging-retry]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: VITE_USE_DO_BACKEND=true VITE_API_BASE=https://staging.sheepdogsim.com npm run build
      - uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CF_API_TOKEN_STAGING }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          projectName: sds-staging
          branch: staging-retry
          directory: dist
      - name: Deploy staging worker
        run: npx wrangler deploy --env staging
        working-directory: worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN_STAGING }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
```

`wrangler.toml` uses `[env.staging]` for the staging Worker name, DO namespace, D1 binding, and routes. Prod `[env.production]` is a separate block; neither touches the other's resources.

## 5. Auth / identity separation

Staging MUST NOT share credentials or data with prod.

- JWT secret: `wrangler secret put JWT_SECRET --env staging` with a fresh 64-char hex. Tokens signed for staging do not validate on prod and vice versa.
- D1 instance: `wrangler d1 create sds-db-staging`. Bound as `DB` only inside `[env.staging]`. Never bind `sds-db` (prod) to the staging worker.
- Worker name: `sds-worker-staging`. Separate DO namespace (DO IDs are scoped per Worker script, so RoomDO state in staging is isolated by default).
- localStorage `persistent_id`: browsers do NOT partition localStorage between `sheepdogsim.com` and `staging.sheepdogsim.com` by default (same eTLD+1), so a player who has played prod arrives at staging with their prod `persistent_id`. That is fine: the staging D1 treats them as a new player (no row in `players`), which is what we want. Their prod score is not at risk because staging's `POST /api/score` writes to `sds-db-staging`, never `sds-db`.

## 6. Data seeding

Staging D1 starts empty after `wrangler d1 execute sds-db-staging --file worker/migrations/0001_init.sql --remote`. To exercise the leaderboard without touching prod's 207 real rows, seed with synthetic fixtures.

Seed file: `worker/fixtures/staging-seed.sql`. Contains ~50 fake players across all game modes with plausible score distributions.

```sql
-- Fixture players (staging only, DO NOT run against prod)
INSERT INTO players (persistent_id, display_name, discriminator, full_name, created_at, last_active, solo_classic_best, solo_extreme_best, timed_best, competitive_wins, cooperative_best) VALUES
  ('fixture-001', 'TestDog', '0001', 'TestDog#0001', 1713830400000, 1713830400000, 42.3, 58.1, 120, 3, 91.2),
  ...
```

Apply via: `wrangler d1 execute sds-db-staging --file worker/fixtures/staging-seed.sql --remote`.

Reset: `wrangler d1 execute sds-db-staging --command "DELETE FROM players; DELETE FROM score_submissions; DELETE FROM discriminators;" --remote` then re-run the seed. The reset command is idempotent and safe because it targets `sds-db-staging`; a typo against `sds-db` would matter, so always include `--env staging` / explicit `sds-db-staging` name in every command.

## 7. How to playtest staging

URL: `https://staging.sheepdogsim.com`.

Browser setup:
1. Open Chrome or Firefox. Clear site data for `staging.sheepdogsim.com` (DevTools -> Application -> Storage -> Clear site data).
2. Open DevTools, Network tab, preserve log, filter "WS" to watch the WebSocket frames. Filter "Fetch/XHR" to watch REST calls to `/api/*`.
3. Open a second browser (or an incognito window in a different profile so the localStorage `persistent_id` differs) to act as Player B.

Pass criteria for a playtest session:

- Both clients load `staging.sheepdogsim.com` with no console errors.
- Player A clicks Create Room, sees a room code, and copies the invite link. `POST /api/rooms` returns 200 with `{roomCode, playerId}`. (Cycle-1-audit item: this endpoint did not exist in prod worker; it MUST exist in staging worker before any soak starts.)
- Player B pastes the invite URL, lands in the same lobby, both players visible to each other.
- Host starts a cooperative game. Both clients render sheep in the same positions within 250ms of each other.
- Player A herds sheep to the gate. Player B sees the sheep-retired counter increment (coop-branch adapter bug from audit).
- Game completes. Leaderboard query returns Player A's new score as a new row, not just the seeded fixtures (score-submission materialized-best bug from audit).
- Player A disconnects mid-lobby. Player B receives `hostChanged` with a non-null `newHostName`.
- Dog stops moving after sprint - no visible rubber-banding (audit item: `interpolatingToClient` must be preserved in DogState).

Every one of these maps to a specific launch-blocker from `docs/cycle-1-audit.md`. The playtest is not optional; it is the regression suite for Cycle 1's failures.

## 8. Soak criteria - 7-day pass

For the soak to count as passed (gating prod cutover per POSTMORTEM 5.8), all of the following must hold over a continuous >=7-day window on staging with at least one human-driven 2-client session per day:

- Worker error rate (non-2xx responses excluding 401/404 known-clients) < 0.5% over the window, measured from CF Workers analytics.
- DO average CPU time per request < 30ms; p99 < 200ms.
- DO wall-clock duration per tick alarm remains under 50ms (staying within the 20Hz budget).
- WebSocket reconnect success rate > 95% measured by the client emitting a `reconnect_result` event (to be added in C3-retry).
- Zero occurrences of visible rubber-banding (human-verified) across all playtests.
- Leaderboard writes: every completed game produces a `score_submissions` row AND a `players` materialized-best update. Verified by diffing `SELECT COUNT(*) FROM score_submissions` and `SELECT MAX(last_active) FROM players` before and after each session.
- No crash-loop in `wrangler tail --env staging` logs.
- No D1 quota warnings in the CF dashboard.

If any of these fails during the 7-day window, the clock resets. The window restarts when the fix ships.

## 9. What is NOT in staging

- Real player data. The 207-player prod SQLite dump does NOT get loaded into `sds-db-staging`. Fixtures only. Cycle-1 migrated real data into `sds-db` before verifying the write path worked, then lost 207 rows on rollback; we do not repeat that.
- Real payment or billing paths. (There are none in SDS today; listed for completeness.)
- The apex `sheepdogsim.com` domain. Staging lives only under `staging.sheepdogsim.com`. No DNS change to `@`, `api`, or `www`. The droplet continues to be authoritative.
- Worker routes on the apex. `sheepdogsim.com/api/*` stays unbound (the droplet at `api.sheepdogsim.com` handles prod API). Only `staging.sheepdogsim.com/api/*` routes to the staging worker.
- Geckos.io on staging. Staging is Worker-only; there is no droplet for the staging stack. This matches what prod will look like post-migration and is the point of the soak.
- Preview-branch deploys of prod. PRs into `main` do not trigger staging; they continue to build against the Geckos path with `VITE_USE_DO_BACKEND=false`.
</content>
