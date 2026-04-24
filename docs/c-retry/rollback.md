# C-retry rollback runbook

> **SUPERSEDED 2026-04-24.** The pragmatic rollback for this side project is `git revert <cutover-commit> && git push` (which triggers a fresh Pages deploy) and optionally a DNS record swap back to the droplet. The DigitalOcean droplet stays up as a parallel fallback for 3-7 days after cutover. See `NEXT_SESSION.md` and `AGENT_PLAN.md` Section 10. The detailed runbook below is retained as historical context.
>
> Original prep brief follows:
>
> Per-stage rollback for the Cycle 2 Cloudflare backend cutover. Every step is a single command, or has a note why it cannot be. Gate on prod deploy per POSTMORTEM 5.5. POSTMORTEM 4.5: Cycle 1's "one DNS flip" rollback was false - actual teardown took ~15 min / ~10 CF API calls. cycle-1-audit.md ("`VITE_USE_DO_BACKEND` is not a one-line flip") identified the build-baked flag as root cause; Stage 6 fixes it.

## How to use

1. Complete **Rollback rehearsal** (bottom) against staging first. No rehearsal = no deploy.
2. Stages go least-destructive (1) to most-destructive (5). Pull the lowest that restores service.
3. **Before** deploy, capture route IDs, `$RECORD_ID`, Pages deployment ID, D1 backup filename into a `rollback-state.json` block in the PR comment. All commands assume these are pre-captured.
4. Pre-reqs: `wrangler whoami` = correct account; `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_ZONE_ID` exported.

---

## Stage 1 - Remove Worker routes

**What:** Detach `sheepdogsim.com/api/*` and `sheepdogsim.com/r/*/ws`. Traffic falls through to origin (Geckos is still the client default during soak, POSTMORTEM 5.8). First lever. Wrangler v4 has no `route delete` subcommand; use the CF API directly against pre-captured route IDs:

```bash
curl -fsS -X DELETE "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/workers/routes/$API_ROUTE_ID" -H "Authorization: Bearer $CF_API_TOKEN" && curl -fsS -X DELETE "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/workers/routes/$WS_ROUTE_ID" -H "Authorization: Bearer $CF_API_TOKEN"
```

**Verify:** `curl -sSf https://sheepdogsim.com/api/leaderboard` returns 404, not Worker JSON.
**Time:** ~30s.
**Data:** None lost; droplet is authoritative (POSTMORTEM 5.8).
**Escalate to Stage 2** if another route still reaches the worker, or DO state is corrupt.

---

## Stage 2 - Revert / delete Worker

**What:** Roll the worker to a known-good version, or delete it. Use when bad code can't be contained by route removal alone.

```bash
wrangler rollback --name sds-worker --version-id <PRIOR_VERSION_ID>
```

If no good prior version:

```bash
wrangler delete sds-worker
```

**Verify:** `wrangler deployments list --name sds-worker` shows expected active version.
**Time:** ~60s rollback; ~30s delete.
**Data:** DO storage survives a code rollback. Delete wipes all DO instances - in-progress rooms drop, clients reconnect to Geckos on refresh. D1 untouched. Escalate to Stage 5 if D1 is bad.

---

## Stage 3 - DNS restore

**What:** Repoint `sheepdogsim.com` to the pre-cutover CNAME `matthew-kissinger.github.io` (POSTMORTEM 2). Use when Stages 1-2 aren't enough and the site must come fully off CF Pages.

```bash
curl -fsS -X PUT "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$RECORD_ID" \
  -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"sheepdogsim.com","content":"matthew-kissinger.github.io","ttl":1,"proxied":true}'
```

`$RECORD_ID` must be pre-captured or this is not one-command.

**Verify:** `dig +short sheepdogsim.com @1.1.1.1` shows GH Pages CNAME; `curl -sSfL https://sheepdogsim.com/` returns GH Pages HTML.
**Time:** ~60s API + <30s CF proxy propagation. Resolver caches up to old TTL (300s).
**Data:** None. Users on DO disconnect on next fetch; reload hits Geckos.

---

## Stage 4 - Revert / delete Pages deployment

**What:** Promote a prior `sds-frontend` production deployment, or delete the project. Use when the bundle is broken (e.g. built with `VITE_USE_DO_BACKEND=true` while Worker is down - see Stage 6). Wrangler v4 has no `pages deployment activate`; the supported single-command path is to redeploy a known-good artifact, or to use the CF API to set the production deployment:

```bash
curl -fsS -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/pages/projects/sds-frontend/deployments/$DEPLOYMENT_ID/retry" -H "Authorization: Bearer $CF_API_TOKEN"
```

If nothing good exists, delete the project:

```bash
wrangler pages project delete sds-frontend
```

**Verify:** `curl -sSfL https://sheepdogsim.com/ | grep -o 'BUILD_ID[^"]*' | head -n1` matches prior-good build ID (compare to Track A's `sw.js` cache name).
**Time:** ~2 min promote (incl. edge purge); ~1 min delete.
**Data:** Static assets; no direct loss. DO clients disconnect on refresh, land on Geckos.

---

## Stage 5 - D1 data rollback

**What:** Restore `sds-db` from pre-deploy export, or drop and recreate. Last resort - only when D1 is demonstrably corrupt **and** the droplet SQLite is still authoritative (POSTMORTEM 5.8).

**Pre-deploy hook (must run every deploy):**
```bash
wrangler d1 export sds-db --output backup-$(date -u +%Y%m%dT%H%M%SZ).sql --remote
```
Without this, Stage 5 has no rollback at all.

**Rollback:**
```bash
wrangler d1 execute sds-db --remote --file=backup-<TIMESTAMP>.sql
```

If the schema itself is broken:

```bash
wrangler d1 delete sds-db && wrangler d1 create sds-db && wrangler d1 execute sds-db --remote --file=backup-<TIMESTAMP>.sql
```

**Verify:** `wrangler d1 execute sds-db --remote --command "SELECT COUNT(*) FROM players;"` >= 207.
**Time:** ~2 min restore; ~5 min delete+recreate+import.
**Data:** **Drops any D1 writes between backup and rollback.** During the 7-day soak (POSTMORTEM 5.8) the droplet is source of truth and D1 is a shadow write, so loss is bounded. Warn the user before running.

---

## Stage 6 - `VITE_USE_DO_BACKEND` feature flag (the hard one)

**Problem:** Today the flag is read at build time via `import.meta.env.VITE_USE_DO_BACKEND` (`NetworkManager.js:5`) and baked into the bundle. Flipping it requires rebuild + Pages redeploy - not one command. This is the failure POSTMORTEM 4.5 and cycle-1-audit.md call out.

**Fix (option a - required):** Move the flag to runtime. Ship `public/config.json` with `{ "useDoBackend": false }`. `NetworkManager.js` fetches `/config.json` once at startup (before Geckos/WS init), caches it, branches on `config.useDoBackend`. Cost: one round-trip at page load (~10-50ms from CF edge, cacheable). Rollback is one command.

Option a.1 - Pages static-asset redeploy after editing `public/config.json`:

```bash
wrangler pages deploy public --project-name sds-frontend --branch main --commit-dirty=true
```

Option a.2 - serve `/config.json` from a Worker route backed by KV, flip atomically:

```bash
wrangler kv key put --binding=CONFIG "useDoBackend" "false"
```

KV = fastest flip (~5s). Pages-deploy = fewer moving parts.

**Verify:** `curl -sSf https://sheepdogsim.com/config.json` = `{"useDoBackend": false}`. Reload browser; devtools logs `[NetworkManager] Geckos path (config.useDoBackend=false)`.
**Time:** ~5s (KV) or ~2 min (static redeploy, no rebuild).
**Data:** None. Already-loaded clients stay on DO until refresh; droplet is authoritative during soak.
**When to use:** **First** stage for client-side failures (adapter, reconnect, missing gates - cycle-1-audit.md "Critical"). Stage 1 is for server-side failures. Use both together for a full stop.

**Fallback (option b - not primary):** If option (a) ships broken:

```bash
VITE_USE_DO_BACKEND=false npm run build && wrangler pages deploy dist --project-name sds-frontend --branch main
```

Timing ~3 min. **Not acceptable as primary** per POSTMORTEM 5.5; last resort.

---

## Rollback rehearsal (required before prod deploy)

POSTMORTEM 5.5 requires rollback to be tested, not aspirational. Run end-to-end against staging. If a step fails or exceeds its documented time, hold prod and fix first.

- [ ] `wrangler whoami` = correct account.
- [ ] Pre-deploy D1 export succeeds, file non-empty.
- [ ] Deploy worker + Pages + route + DNS to staging; capture all IDs into `rollback-state.json` in the PR comment.
- [ ] Open staging in **two browser contexts**; run a two-player room end-to-end (POSTMORTEM 5.3). Do not skip - Cycle 1 shipped without this.
- [ ] Stage 1 route delete (timed); verify Worker stops answering within 60s; re-add route.
- [ ] Stage 2 `wrangler rollback` to prior version (timed); verify active version ID changed.
- [ ] Stage 3 DNS update against staging hostname (timed); verify `dig`; restore.
- [ ] Stage 4 Pages activate against prior preview (timed); verify bundle hash changed.
- [ ] Stage 5 against a **throwaway** D1 (`sds-db-rehearsal`) - never the real DB. Export, corrupt, restore, verify count, delete.
- [ ] Stage 6 option (a): flip `config.json` or KV key, reload browser, verify devtools shows Geckos branch activating.
- [ ] Total wall-clock <= 5 min; escalate if not.
- [ ] Paste the log (commands, timings, verification) into the PR as `Rollback rehearsal YYYY-MM-DD`. No rehearsal comment = deploy not approved.

---

## References

- POSTMORTEM.md 2 - Cycle 1 teardown that Stages 1-5 mirror.
- POSTMORTEM.md 4.5 - misrepresented rollback; justifies this doc.
- POSTMORTEM.md 5.5 - one-command rollback; the rule operationalized here.
- POSTMORTEM.md 5.8 - parallel droplet fallback; justifies "no data lost" in Stages 1-4.
- docs/cycle-1-audit.md "`VITE_USE_DO_BACKEND` is not a one-line flip" - Stage 6 origin.
- docs/cycle-1-audit.md "CF Pages vs. Worker route priority" - Stage 1/4 ordering.
