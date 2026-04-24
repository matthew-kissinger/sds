# Cycle 2 — What's Left

> Punch list of remaining cleanup for the DigitalOcean → Cloudflare migration. `sheepdogsim.com` is live on Cloudflare Pages + Workers as of 2026-04-24. What's left here is automation, backfill, and droplet teardown. See [cycle-2-report.md](cycle-2-report.md) for the full shipped state.

## P0 — Cutover (done 2026-04-24)

- [x] **Bind `sheepdogsim.com` to the `sds-frontend` Pages project.** Attached via API with a scoped token; status `active/active/active`.
- [x] **Remove the legacy CNAME** pointing `sheepdogsim.com` at `matthew-kissinger.github.io`. Replaced by `CNAME → sds-frontend.pages.dev` (proxied).
- [x] **Remove the legacy `api.sheepdogsim.com` A record** (droplet). Gone.
- [x] **Verify end-to-end:** `https://sheepdogsim.com/` serves from Pages (no more `x-github-request-id`), bundle references the workers.dev URL, `/api/lobbies` returns `{"lobbies":[]}`, CORS OK.

## P1 — Deploy automation

- [ ] **Restore `.github/workflows/deploy.yml`.** Target: Cloudflare Pages via `wrangler pages deploy dist --project-name=sds-frontend` on push to `main`. Needs repo secrets `CF_API_TOKEN` and `CF_ACCOUNT_ID`.
- [ ] **Also build & deploy the worker from CI.** `cd worker && npx wrangler deploy` in a separate job. Secret required: `CF_API_TOKEN` with Worker edit scope.
- [ ] Decide if the worker needs its own tagged releases or if `main` is the release train. Recommendation: `main` is the release train for now; cut tags only when something warrants rollback rehearsal.

## P2 — Tear down the droplet

- [ ] **Soak period:** target destroy ~2026-05-01 (1 week post-cutover). No action until then unless a regression surfaces.
- [ ] **Final data pull:** on the droplet, `sqlite3 /opt/sds-server/leaderboard.db '.dump players' > /tmp/droplet-dump-YYYYMMDD.sql`. Copy off-box to a personal backup.
- [ ] **Destroy the droplet** via the DigitalOcean dashboard (one-off, not Terraform-managed). Record the destroy date in `DECISIONS.md`.
- [ ] Archive or delete `server/` from the repo, or leave it as historical reference. User preference — currently keeping it.

## P3 — Optional but good

- [ ] **Migrate the 207 legacy player rows** from the droplet's SQLite dump into D1 so leaderboards populate immediately on cutover rather than rebuilding organically. One-time `wrangler d1 execute sds-db --file /tmp/droplet-dump-*.sql --remote` after scrubbing PRAGMA / BEGIN / COMMIT lines.
- [ ] **Switch worker WebSocket handling to the Hibernation API** (`state.acceptWebSocket(ws)`). Saves duration billing on idle rooms. Current code uses `server.accept()` which keeps the DO warm continuously. Fine for low volume; worth revisiting at scale.
- [ ] **Delta-encode sheep state** in the worker broadcast. The client already extrapolates from `vx`/`vz`; sending only changed sheep would roughly halve outbound bandwidth from RoomDO. Requires a per-viewer `prevSnapshot` map in RoomDO and a `sheepFull` first frame on connect.
- [ ] **Observability:** wire Logpush or a lightweight custom endpoint so request-level errors and DO exceptions accumulate somewhere queryable. Right now `wrangler tail` is the only story.
- [ ] **Add route for `api.sheepdogsim.com/*` → `sds-worker`** so legacy API clients (if any linger) see a sane response. Low priority — no known public consumers.
- [ ] **Unskip `tests/integration/flow.spec.ts`** one step at a time and point them at `wrangler dev`. Cheap insurance against Cycle 1-class regressions.

## Nice-to-haves (no owner, no deadline)

- [ ] Host-migration unit test.
- [ ] Reconnect with short grace window in RoomDO (currently WS close → leave immediately).
- [ ] Rate limits on `/api/register` and `/api/score` (Workers native rate-limit binding, simple).
- [ ] Metrics: publish `sheepRetired` per game to `analytics_engine` for trending.

## Out of scope for Cycle 2

- SpacetimeDB. Deferred per DECISIONS.md #9.
- Native mobile apps. Web game stays on web.
- The 20 Hz tick downgrade. User prefers 60 Hz authoritative; revisit only if DO CPU cost becomes real.

## Roadmap beyond Cycle 2 (content + scene expansion)

With the backend fully on Cloudflare's edge, the product direction pivots from "ship the migration" to "expand the game." Tracked separately from the migration punch list above:

- **New scenes beyond the fenced valley.** Rolling hills, river crossings, moorland, canyon runs, forest clearings — each with its own terrain generator, grass density, prop set, and boundary rules. The `TerrainBuilder` module is already zone-based; swappable biomes slot in at that seam.
- **Scene-specific game modes.** Drive (A → B across rough terrain), chase (wandering flock into natural enclosures), endless (procedural, rising count). Mode-specific sim branches already live in `GameSim.js`.
- **Dynamic weather + time of day.** Grass already wind-ripples; rain, fog banks, and dusk/dawn lighting build on the existing atmospheric shader.
- **Richer NPC behavior.** Predators, rival herders, sheep personalities.
- **Mod-friendly scene format.** Extend the sandbox's lz-string URL format into full scene descriptions (terrain + props + rules), letting a biome ship as a single link.
- **Competitive seasons + tournaments** once the leaderboard has enough history to make them meaningful.

These land in parallel with the migration cleanup — they are additive changes to the client and sim, not dependent on DNS cutover. Contributors welcome.
