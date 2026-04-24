# Cloudflare Resources Recreation Runbook (C-retry)

> Purpose: rebuild every Cloudflare resource torn down in the 2026-04-23 rollback so the C-retry can reproduce the environment on demand. Scope is recreation only - porting the worker code, fixing the audit bugs, and cutting traffic over are handled in other C-retry artifacts. This doc must stay in sync with the schema under `worker/migrations/0001_init.sql` once that is re-authored.
>
> This runbook is the teardown reference as well (see section 5). Do not run any command here without reading the section it lives under.

---

## 1. What was deleted on 2026-04-23

From `POSTMORTEM.md` Section 2, verbatim:

- `sheepdogsim.com` CNAME - pointed back to `matthew-kissinger.github.io`.
- CF Pages `sds-frontend` project - deleted.
- CF Worker `sds-worker` - deleted.
- CF D1 database `sds-db` - deleted (207 player rows lost; droplet remains authoritative).
- Agent-scoped API token `claude-agent-sds` - revoked.
- GitHub repo secrets `CF_API_TOKEN` and `CF_ACCOUNT_ID` - removed.

In addition, the repo artifacts `worker/`, `.github/workflows/deploy.yml`, `.github/workflows/build-itchio.yml`, `.env.production`, `public/_redirects`, `public/_headers`, and the `@msgpack/msgpack` dependency were removed locally. Those are code-side concerns handled by the C-retry rescaffold, not by this runbook.

---

## 2. Prerequisites

### 2.1 Credentials

Credentials live in `~/.config/mk-agent/env` (600 perms). The file holds:

- `CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}` - placeholder, the real token is in the env file. Never print, never commit.
- `CLOUDFLARE_ACCOUNT_ID=56adffd40534f7fe110fc661a40bbf53` - this is not secret; it is shown in the CF dashboard URL.

Load with `source ~/.config/mk-agent/env` in bash, or let the PowerShell profile auto-load it (Git Bash on Windows loads it via `.bashrc`).

The `claude-agent-sds` token was revoked in the rollback and must be reissued (see section 3.4). Until then, use the account-scoped token above as a bootstrap only and rotate to the new project-scoped token before any automation runs against the account.

### 2.2 Tool versions

- Wrangler: `npx wrangler --version` should print `>= 4.84`. Cycle 1 used 4.84.1. Pin via `npx wrangler@4.84.1 ...` if drift matters.
- Node: `node --version` must satisfy `>= 22.0.0` (see root `package.json` `engines`).
- gh CLI: `gh --version` `>= 2.80` for `gh secret set`.

### 2.3 Account context

Account: `matt.m.kissinger@gmail.com`, account ID `56adffd40534f7fe110fc661a40bbf53`. Zone: `sheepdogsim.com` (Free plan). Droplet `147.182.185.185` must stay online through this process - it is still authoritative for leaderboard state.

---

## 3. Step-by-step recreation

Run each step only after the prior step verifies. Everything here is manual-first; the optional `scripts/cf-recreate.sh` wraps the idempotent subset.

### 3.1 Worker - `sds-worker`

1. Rescaffold `worker/` per the C-retry tracks (this doc does not cover source code). Verify `worker/wrangler.toml` has:
   - `name = "sds-worker"`
   - `main = "src/index.ts"`
   - `compatibility_date` current (e.g. `2026-04-01`)
   - `compatibility_flags = ["nodejs_compat"]`
   - DO bindings `ROOM_DO` -> class `RoomDO`, `LOBBY_DO` -> class `LobbyDO`
   - D1 binding `DB` -> database `sds-db` (the id is filled in after step 3.2)
   - Migrations block: `[[migrations]] tag = "v1" new_sqlite_classes = ["RoomDO", "LobbyDO"]`
   - Routes for `sheepdogsim.com/api/*` and `sheepdogsim.com/r/*`
2. Cross-check against cycle-1 wrangler.toml as reference only. Per `docs/cycle-1-audit.md`, reconsider:
   - CORS allowlist - cycle 1 omitted `*.pages.dev` preview URLs.
   - WebSocket URL handling - cycle 1 stripped `playerId`/`name`/`dogType` query params, which must be passed through.
   - The "one DNS flip rollback" claim was false because the flag was build-baked; plan rollback accordingly before deploy.
3. Create the secret (generate fresh 64-char hex; do not reuse cycle-1's):
   ```bash
   openssl rand -hex 32 | npx wrangler secret put JWT_SECRET --name sds-worker
   ```
4. First deploy: `cd worker && npx wrangler deploy`. This is the step that creates the Worker named `sds-worker` on the account. Safe to re-run; wrangler uploads a new version.
5. Verify: `npx wrangler deployments list --name sds-worker` prints at least one deployment.

### 3.2 D1 database - `sds-db`

1. Create: `npx wrangler d1 create sds-db`. Copy the `database_id` from output into `worker/wrangler.toml` under the `DB` binding. Re-running this command fails with `a database with that name already exists` - that failure mode is expected and the script in section 6 handles it.
2. Apply schema: `npx wrangler d1 execute sds-db --file worker/migrations/0001_init.sql --remote`. The schema documents the `players`, `discriminators`, and `score_submissions` tables.
3. **Schema-level bug flag for the retry (do not skip):** per `docs/cycle-1-audit.md`, cycle 1's `/api/register` issued a JWT but never inserted a row into `players`. The schema does not enforce this - it is a worker-side bug. The retry must (a) insert a `players` row on `/api/register`, (b) update materialized-bests on `/api/score`, and (c) compute/assign `discriminator` using the same algorithm as `server/LeaderboardManager.js`. Document that flag in the worker README too. This runbook flags it here because the schema is the natural hinge point.
4. Migrate 207 rows from droplet:
   ```bash
   ssh sds "sqlite3 /opt/sds-server/leaderboard.db '.dump players' '.dump discriminators'" > /tmp/sds-dump.sql
   # Clean SQLite-isms wrangler d1 rejects; strip PRAGMA lines and BEGIN/COMMIT if present.
   npx wrangler d1 execute sds-db --file /tmp/sds-dump-clean.sql --remote
   ```
5. Verify: `npx wrangler d1 execute sds-db --command "SELECT COUNT(*) AS n FROM players" --remote` returns approximately 207.

### 3.3 Pages project - `sds-frontend`

1. Create: `npx wrangler pages project create sds-frontend --production-branch main`. Fails cleanly if already exists; treat that as success.
2. Custom domain attach (dashboard is simpler than wrangler for this):
   - Dashboard -> Pages -> sds-frontend -> Custom domains -> Set up -> `sheepdogsim.com`.
   - Cloudflare auto-creates the CNAME in the zone (zone is already on the account).
   - Do not flip the CNAME until the worker and frontend bundle have both passed the two-client integration test the C-retry requires. Until then, leave the CNAME pointing at `matthew-kissinger.github.io`.
3. Create `public/_redirects` and `public/_headers` per Track F spec. These ship in the Pages build output.
4. First deploy: `npx wrangler pages deploy dist --project-name sds-frontend` after `npm run build`. Uploads a new version; safe to re-run.
5. Verify: `npx wrangler pages deployment list --project-name sds-frontend` lists the deploy.

### 3.4 Agent API token - `claude-agent-sds`

Only the dashboard can issue tokens (the API is account-owner only). Steps:

1. Dashboard -> My Profile -> API Tokens -> Create Token -> Custom Token.
2. Name: `claude-agent-sds`. Permissions:
   - Account: `Workers Scripts:Edit`, `Workers Routes:Edit`, `D1:Edit`, `Pages:Edit`, `Account Settings:Read`.
   - Zone: `Zone:Read`, `DNS:Edit` limited to `sheepdogsim.com`.
   - Do NOT grant `User:Edit` or any global scope.
3. Account resources: `Include -> Specific account -> SDS account`. Zone resources: `Include -> Specific zone -> sheepdogsim.com`.
4. TTL: 90 days. Rotate on schedule; record the rotation date in `DECISIONS.md`.
5. Copy the token to `~/.config/mk-agent/env` as `CLOUDFLARE_API_TOKEN`. Copy to hub via `sync-keys` in PowerShell per the global env sync flow. Never print the token in a commit, in a doc, or in a chat log.

### 3.5 GitHub secrets - `CF_API_TOKEN`, `CF_ACCOUNT_ID`

```bash
gh secret set CF_API_TOKEN      --repo matthew-kissinger/sds --body "${CLOUDFLARE_API_TOKEN}"
gh secret set CF_ACCOUNT_ID     --repo matthew-kissinger/sds --body "${CLOUDFLARE_ACCOUNT_ID}"
```

The token set here must be the `claude-agent-sds` project-scoped one, not the account-wide bootstrap token. Rotate via the same command; `gh secret set` overwrites.

---

## 4. Verification commands

Run after 3.1 through 3.5:

- Worker: `npx wrangler deployments list --name sds-worker` -> at least one entry.
- D1 players: `npx wrangler d1 execute sds-db --command "SELECT COUNT(*) FROM players" --remote` -> approximately 207.
- D1 submissions: `npx wrangler d1 execute sds-db --command "SELECT COUNT(*) FROM score_submissions" --remote` -> 0 before first gameplay.
- Worker HTTP (replace subdomain once deployed): `curl -sS https://sds-worker.<account-subdomain>.workers.dev/api/lobbies` -> `200` with an empty JSON array.
- Pages: `npx wrangler pages deployment list --project-name sds-frontend` -> at least one deploy.
- GitHub secrets: `gh secret list --repo matthew-kissinger/sds` -> shows `CF_API_TOKEN` and `CF_ACCOUNT_ID`.

The Pages site should NOT yet be at `sheepdogsim.com` - it lives at `sds-frontend.pages.dev` until the CNAME flip, which is a separate cutover step not covered here.

---

## 5. Teardown (for the rollback runbook to reference)

Run in this order. Every one of these is destructive; never run without explicit user confirmation.

1. DNS: in the dashboard, change the `sheepdogsim.com` CNAME from the Pages target back to `matthew-kissinger.github.io`. Wait 60 s for propagation.
2. Pages: `npx wrangler pages project delete sds-frontend`. Dashboard confirmation prompt appears; confirm.
3. Worker routes: `npx wrangler route list --zone-name sheepdogsim.com` to find the IDs, then `npx wrangler route delete <id>` for each.
4. Worker: `npx wrangler delete --name sds-worker`.
5. D1: `npx wrangler d1 delete sds-db`. Irreversible. The droplet must be authoritative before this runs.
6. Token: dashboard -> My Profile -> API Tokens -> `claude-agent-sds` -> Roll / Delete.
7. GitHub secrets: `gh secret delete CF_API_TOKEN --repo matthew-kissinger/sds` and `gh secret delete CF_ACCOUNT_ID --repo matthew-kissinger/sds`.

Cycle-1 lesson: a rollback is only a "one DNS flip" if the frontend bundle at the target is known-good. If the bundle at `matthew-kissinger.github.io` has drifted, step 1 alone is not enough - roll the frontend back in git first.

---

## 6. Idempotency notes

Behavior of each command if the resource already exists:

- `wrangler deploy` (Worker): always creates a new version; safe to re-run. Idempotent in effect.
- `wrangler d1 create sds-db`: **fails** with a name-collision error. The helper script treats that as success.
- `wrangler d1 execute ... --file migrations/0001_init.sql`: **fails** with `table already exists` on re-run unless the migration uses `CREATE TABLE IF NOT EXISTS`. The cycle-1 schema did not use `IF NOT EXISTS`; the retry schema should. Until it does, consider the schema apply step non-idempotent.
- `wrangler pages project create sds-frontend`: **fails** if already exists. Helper script treats that as success.
- `wrangler pages deploy dist`: always creates a new deploy; safe to re-run.
- `wrangler secret put JWT_SECRET`: overwrites. Safe to re-run; generates deploy churn.
- `gh secret set`: overwrites. Safe to re-run.
- `wrangler route ...`: create is idempotent if same `pattern`; delete requires the `id` lookup first.

The optional helper at `scripts/cf-recreate.sh` (a) checks existence before create, (b) exits 0 on "already exists," (c) prints every command before running it, and (d) gates all deletes behind `--force`. It does not attempt the 3.4 dashboard flow - that is manual by design.
