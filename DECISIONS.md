# SDS · Locked Decisions

> Created during Track A of the agent development cycle (2026-04-23). These decisions were made with the human during the initial planning session and are treated as constraints by all subsequent agents. Do not re-litigate.

---

1. **Backend migrates to Cloudflare Workers + Durable Objects + WebSockets.** SpacetimeDB was considered and deferred. Geckos/WebRTC and the droplet go away in Track C/G.
2. **Frontend moves to Cloudflare Pages.** GitHub Pages retires in Track F.
3. **Leaderboard moves to Cloudflare D1.** Not DO storage, not external SQLite. The 207-player SQLite dataset on the droplet gets migrated.
4. **Tick rate drops from 60Hz to 20Hz** server-side once on DO. Clients interpolate.
5. **Wire protocol becomes MessagePack over WebSocket** with delta-encoded sheep state. JSON-everywhere is out.
6. **Auth:** persistent_id (localStorage) + Worker-issued short-lived signed token. Signed with `JWT_SECRET` Workers secret.
7. **Lobby UX:** shareable invite URLs, public lobby list, host-starts, host-migration on disconnect, game-mode cycling in public rooms.
8. **Drop `framer-motion` and `stats.js`** - unused. Node engines pin to `>=22.0.0`.
9. **SpacetimeDB - not now.** Revisit for a future persistent-world project.
10. **Keep the droplet running in parallel for 30 days after DO cutover** as rollback. Track G destroys it.

---

## Track F - CF Pages Setup (2026-04-23)

Cloudflare Pages project `sds-frontend` created with production branch `main`. GitHub Actions workflows added: `deploy.yml` (auto-deploy on push to main via `cloudflare/pages-action@v1`) and `build-itchio.yml` (manual or tag-triggered itch.io zip builds). CF Pages `_redirects` (SPA fallback) and `_headers` (security headers) added to `public/`. DNS cutover and CNAME removal deferred to Track G after CF Pages is verified live.

**Revert procedure (14-day safety window):** Re-enable GitHub Pages in repo Settings > Pages, point source back to `gh-pages` branch or `main`/`docs` folder, update Cloudflare DNS to point `sheepdogsim.com` CNAME back to `matthew-kissinger.github.io`. The CNAME file remains in repo root until Track G.

---

## Track C4 - Cutover - 2026-04-23 (ROLLED BACK SAME DAY)

Worker was deployed to `sheepdogsim.com/api/*` and `/r/*`, D1 had 207 players migrated, CF Pages was serving frontend on `sheepdogsim.com` as a custom domain.

**Rollback executed 2026-04-23:** Opus 4.7 audit found 7+ launch-blocking bugs (see `docs/archive/cycle-1-audit.md` and `docs/archive/POSTMORTEM.md`). The multiplayer happy path was non-functional (missing `/api/rooms` endpoint, no `players` table insert on register, no materialized-best update on score). Production was returned to Geckos/droplet within the hour.

**Artifacts scrubbed:**
- CNAME reverted to `matthew-kissinger.github.io`
- CF Pages `sds-frontend` project deleted
- Worker `sds-worker` deleted (routes removed automatically)
- D1 database `sds-db` deleted
- Agent API token revoked
- GitHub repo secrets `CF_API_TOKEN`, `CF_ACCOUNT_ID` removed
- `worker/`, `.env.production`, `public/_redirects`, `public/_headers`, both workflows deleted
- `@msgpack/msgpack` dep removed
- `NetworkManager.js`, `README.md`, `ARCHITECTURE.md` reverted to pre-cycle state

**Decisions 1-5 above remain intact** as intent for the next attempt. Decision 10 (30-day droplet parallel) was never triggered because cutover was reverted. Track F's 14-day safety window also moot.

**For the next cycle:** read `docs/archive/POSTMORTEM.md` first. Do not start writing code until you can answer "how will I playtest this" concretely.

---

## Cycle 2 — CF backend shipped (2026-04-23, overnight)

The migration from Geckos.io + DigitalOcean to Cloudflare Workers + Durable Objects + D1 + Pages shipped and is live. DNS cutover completed 2026-04-24: `sheepdogsim.com` now CNAMEs at `sds-frontend.pages.dev`; the legacy `api.sheepdogsim.com` record was removed in the same operation. The DigitalOcean droplet remains running for a brief soak (target destroy: ~2026-05-01) as a rollback safety net.

Full closeout: [docs/cycle-2-report.md](docs/cycle-2-report.md).

**Deviations from the Cycle 2 plan documented in `docs/archive/c-retry/`:**

- **Tick rate:** Decision 4 in the original list called for 20 Hz on DO. We kept 60 Hz at the user's instruction — the 20 Hz rubber-banding was one of the Cycle 1 regressions the 7-day soak was meant to catch, and running 60 Hz inside an active DO is a known-good pattern. Reopen the 20 Hz question only if DO CPU cost becomes a real constraint.
- **Identity handshake:** `protocol-v2.md` Section 5 proposed a post-upgrade `hello` message. We kept identity on the WS URL (`?playerId=<sessionId>`) because the REST join has already stored the session in the DO, so the WS upgrade is a lookup, not a credential handshake. Simpler and one round-trip faster. `authority.md` §1 called this out as the contract-doc-vs-protocol-doc tension; this is the resolution.
- **Staging subdomain:** dropped. The Cycle 1 postmortem's 7-day-soak, mandatory-gate process ceremony was retired for this cycle per the `docs/archive/NEXT_SESSION.md` directive. Ship to prod, find bugs there, fix them.
- **`sheepRetired` is always emitted.** We kept the droplet's behavior: `sheepRetired` is a top-level field on every state broadcast in every mode (not just coop). The client reads it in the HUD regardless.
- **Route bindings deferred:** `wrangler.toml` does not currently declare routes for `sheepdogsim.com/api/*` or `/r/*` — the frontend hits the `workers.dev` hostname directly. The route binding is part of the DNS cutover, not a prereq for the new stack working.

**Follow-ups that stayed on the list:**

- GitHub Actions workflow for auto-deploy (Pages + Worker) — not re-added this cycle.
- 207-row leaderboard migration from droplet SQLite to D1 — pending.
- Switching the worker to the Hibernation WebSocket API — deferred until idle-room cost matters.
- Droplet destroy once the soak window closes (~1 week).

**Decisions 1-5 from the top of this file remain in force** as the direction. Decision 10 (30-day parallel droplet) is relaxed: plan is a ~1-week soak then destroy.

---

## Cycle 3 — Cleanup + Scene-as-data + minimal Track 2 (2026-04-24)

Structural foundation for content expansion. Full closeout: [docs/cycle-3-plan.md](docs/cycle-3-plan.md) § Progress log.

**What shipped:**

- **Track 1 — Cleanup.** Deleted dead code (`StaminaUI`, `ExtremeBoid`, `js/styles/`, 13 of 18 runtime locales). Renamed misnamed controllers (`StartScreen` → `MenuController`, `MultiplayerUI` → `MultiplayerState`; the latter also trimmed 501 → 95 lines by removing DOM-write paths that targeted hidden elements). Replaced HUD polling (`setInterval(16)`) with a frame-event bus on `GameBridge`. Local-dev DX: `npm run dev` runs Vite + wrangler concurrently, `dev:setup` applies D1 migrations, invite URLs use `location.origin`, `.dev.vars.example` committed. Polish: dead-DOM references removed, `GameBridge.js` compressed 310 → 86 lines.
- **Track 3 — Scenes as data.** `shared/scenes/{types,field,index,rolling-hills}.js` — JSDoc-typed `SceneDef`, registry with `loadScene` / `listScenes` / `DEFAULT_SCENE_ID`. Sim (`shared/index.js createGameState`, `worker/src/GameSim.js`) and client renderer (`TerrainBuilder`, `GrassSystem`) both consume scene data. Second scene (Rolling Hills) registered; today it's a sim-differentiated variant (250 sheep, scattered spawn) — visual differentiation lands when `TerrainBuilder` consumes `terrain.heightScale` / `grass.colors` / `props[]`. `?scene=<id>` URL param for pre-UI switching. Extension guide: [docs/adding-a-biome.md](docs/adding-a-biome.md).
- **Track 2 (stepping stone).** `ScenePicker` tile strip above `ModeSelection` surfaces the scene registry to players. Full scene-first state-machine restructure, mode-shaped HUD profiles, onboarding, compass locator, and real dog PNG thumbnails are deferred to a dedicated UI session.

**Decisions recorded:**

- **Game identity: mode-shaped.** Classic = zen register (no timer, soft stamina, ambient copy). Timed/Racing = arcade register (prominent timer, scoreboard, celebrations). Sandbox = playground register (tools, no score). Menu shell stays tonally neutral. Detail: [docs/cycle-3-ui-ux.md](docs/cycle-3-ui-ux.md) § Vision.
- **Default scene naming: `field` / "Home Field", not "valley".** The current scene is a flat fenced play area with mountain props ringing the perimeter — not a true valley. User correction mid-cycle; docs and code aligned.
- **Scene format: `.js` + JSDoc, not `.ts`.** `shared/` is consumed by three contexts (Vite, wrangler/esbuild, Node tests); `.js` needs zero new build plumbing, JSDoc gives IDE types. Reverts to `.ts` trivially if strict type-checking becomes valuable later; the other direction is worse.

**Known open questions** (not blockers for content work):

- Client `FieldConfig` / `SandboxConfig` vs `SceneDef` harmonization. Today solo/sandbox use client-side field configs orthogonal to the scene registry; the scene picker UI for MP is straightforward, but deciding how solo "picks a scene" vs "picks a field shape" needs a call.
- MP joiner renderer sync: host's picked `sceneId` flows to Worker sim end-to-end (shipped post-initial-push 2026-04-24), but each client still renders its own URL-param scene. Joining a room whose host picked a different scene gives correct sim but mismatched visuals. Fix lands with Track 2 (either a pre-join redirect or runtime scene reactivity).
- Client `ExtremeBoidSystem` vs shared `FlockingAlgorithms` consolidation — deferred per user ("not sure what is best solution"). The drift is real; a cross-check of runtime behavior is prerequisite.

---

## Cycle 4 — Foundation for biome variety + pastoral aesthetic + user camera (2026-04-24)

Cycle 3 made biomes a data change but left them visually identical (Rolling Hills shipped with `heightScale: 0`). Cycle 4 builds the foundation needed to make biomes actually look different — heightfield terrain, an analytic sky, real grass color variance — and introduces a user-controlled camera so the dog can be framed cinematically. Full plan: [`docs/cycle-4-plan.md`](docs/cycle-4-plan.md). Sequential follow-up: [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md).

**Decisions recorded:**

- **Phase A vs Phase B split.** Phase A shipped 11 parallel units (standalone modules, asset pipeline, schema, polish, camera). Phase B is one sequential PR by the user that wires those modules into the render path (TerrainBuilder displacement, GrassSystem y-sample, Sheep/Sheepdog y-clamp, Atmosphere wiring, ProceduralMountains wiring, slope-modulated sheep speed, prop placement on terrain, camera y-clamp). The split exists because every Phase B item touches the y-axis and shares a regression surface — running them in parallel would force constant rebases against the very files Phase A's M/H/I just rewrote, and a single bad Heightfield sample would surface as "dog floats, sheep sink, grass clips" simultaneously across three worktrees. Sequencing it as one PR keeps the verification loop tight.
- **Heightmap baked, not runtime-generated.** The rolling-hills and open-country heightmaps are 1024×1024 R32F floats baked once by `scripts/bake-heightmap.mjs` and shipped as static assets in `public/terrain/`. Runtime fBm in a Worker would cost ~30ms of CPU per scene-load on the Worker hot path, which is unacceptable when the same biome is loaded thousands of times across rooms. Baking once at build time is free per-load. The 4MB asset cost is acceptable (CF Pages caches it). Re-bake by editing the script and re-running; manifest carries a `version` field so consumers can detect staleness.
- **Hosek-Wilkie ported from Terror in the Jungle.** The sibling repo on Three.js 0.184 already had a working Hosek-Wilkie analytic sky shader, scenario preset table, and weather-modulated fog. Porting it (TS → JS + JSDoc, GLSL is verbatim) saved an estimated 2-3 days of shader debugging vs. building from scratch. The port lives in `js/atmosphere/`. Trade-off accepted: we now carry a small dependency on the sibling repo's preset format; if Terror evolves the format, we either re-port or fork. Acceptable because the sky math is well-understood and the preset enum is stable.
- **Camera modes: Classic preserved as default.** The current isometric (distance 80, height 60, no rotation) is the established UX; returning players should not see a different game on first load. Cycle 4 adds Follow (close-up cinematic) and Free (yaw-orbit) as opt-in modes, cycled with the `C` hotkey or the settings panel. Snap freeYaw to Follow yaw on mode switch so there's no jump-cut. Future cycles may revisit the default (the new camera framing makes the dog read as "the player character" much more strongly), but not this cycle.
- **Three.js bumped to 0.184.** Low-risk migration. 0.181 → 0.184 has no breaking API changes that affect this codebase (verified by build + test). The bump aligns us with the sibling repo's Atmosphere port (which was authored against 0.184) and unlocks any 0.182/0.183/0.184 fixes for free. Future-bumps remain incremental and routine.
