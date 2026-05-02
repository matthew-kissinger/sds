# Next Session — Cycle 12 (`post-v1-polish`) Phase 6 closed; 5 phases remain

> Updated 2026-05-02 (post Phase 6 land). Active plan: [`docs/cycle-12-plan.md`](docs/cycle-12-plan.md) — Phase 6 (leaderboard data-visibility + filter UX) shipped to prod 2026-05-02. Five phases remain (1, 2, 3, 4, 5). Last closed: [`docs/archive/cycles/cycle-11-plan.md`](docs/archive/cycles/cycle-11-plan.md). Cold-start agents: read this page top-to-bottom, then [`docs/cycle-12-plan.md`](docs/cycle-12-plan.md), then [`docs/BACKLOG.md`](docs/BACKLOG.md). Earlier cycles: [`docs/archive/cycles/cycle-10-plan.md`](docs/archive/cycles/cycle-10-plan.md), [`docs/archive/cycles/cycle-9-plan.md`](docs/archive/cycles/cycle-9-plan.md).

## Where the project stands (2026-05-02)

- **`sheepdogsim.com` is live with v1.0.0** on Cloudflare Pages + Worker + DO + D1. Three post-v1.0.0 hotfixes on main (`faad467` skip /api/event in dev/e2e; `55f6db7` worker `req`→`request` typo; **Phase 6 leaderboard fix shipped 2026-05-02** — see below).
- **Cycle 11 (`release-finish`) closed 2026-04-28.** Headlines: in-process scene swap shipped (`swapScene`/`disposeScene`/`rebuildScene`/`restartToMenu` flipped from hard-reload to true in-process, with `<SceneSwapOverlay>` fade and `history.replaceState`); marketing assets generated via cinematic pipeline (3 OG WebPs, 5 dog portraits, 192/512/maskable PWA icons); `0003_score_anomalies` + `0004_events` migrations applied to prod D1; new `/api/event` route + `js/telemetry.js` wrapper + 4 wired events; sky exposure fix on pastoral-noon; rocks no longer spawn inside Field play area or float above ground.
- **136/136 vitest pass** (was 111; +25 from new `tests/worker-leaderboard.spec.ts`). Production build clean. Worker `wrangler deploy --dry-run` clean (180.61 KB / 37.70 KB gzip). Sim-baseline byte-identical (preserved through cycles 5-11).
- **Cycle 12 (`post-v1-polish`) Phase 6 closed 2026-05-02.** Five phases remain (1, 2, 3, 4, 5). Worker now: validates `mode=` at the boundary (400 not 500), per-mode dispatch in `getAllLeaderboards` (drops sheepCount on solo+timed), and slow-path → fast-path fallback when partition matches mode's natural (scene, sheepCount). Migration `0005_score_submissions_backfill.sql` applied to prod (synthesizes one row per (player, mode) for pre-partition entries). Frontend now: collapsible Filters disclosure (default-collapsed on solo+timed), default `sheepFilter=0`, inline + empty-state Clear-filters action.

## Phase 6 close (2026-05-02) — leaderboard fix shipped

Fix landed on prod. Surface map:

- **Worker** ([`worker/src/index.ts`](worker/src/index.ts), [`worker/src/d1.ts`](worker/src/d1.ts)) — exported `isValidGameMode` validates the `mode=` param at the boundary (400 with `{"error":"invalid mode"}` instead of leaking 500 D1_ERROR). New `MODE_NATURAL_PARTITION` map + exported `isNaturalPartition(mode, filters)` helper drives the slow-path → fast-path fallback in `getLeaderboard` (when the partitioned slow-path returns 0 rows AND the requested `(scene, sheepCount)` matches the mode's natural pair, recurse into the fast path). `getAllLeaderboards` now dispatches per-mode filters: solo + timed modes drop `sheepCount` (their counts are intrinsic, never variable), so picking "250 sheep" from the panel dropdown no longer blanks every solo board.
- **Migration** ([`worker/migrations/0005_score_submissions_backfill.sql`](worker/migrations/0005_score_submissions_backfill.sql)) — synthesizes one `score_submissions` row per (player, mode) for entries whose materialized best exists on `players.*_best` but has no matching submission row (pre-Cycle-8 entries). Idempotent (`NOT EXISTS` guard), append-only. Belt-and-suspenders to the in-worker fallback.
- **Frontend** ([`js/components/Multiplayer/GlobalLeaderboard.js`](js/components/Multiplayer/GlobalLeaderboard.js)) — `SOLO_TAB_FIXED_SHEEP_COUNT` map removed; replaced with `FIXED_COUNT_TABS` set covering `soloClassic`/`soloExtreme`/`soloInsane`/`soloChaos`/`timed`. `sheepFilter` defaults to `0` ("Any size") on every tab. Filters now live behind a collapsible `▾ Filters` disclosure: default-collapsed on fixed-count tabs, default-expanded on cooperative/competitive. Active filters surface a `•` in the disclosure label. Empty-state shows an inline `Clear filters` button when filters are responsible for the empty result.
- **Tests** ([`tests/worker-leaderboard.spec.ts`](tests/worker-leaderboard.spec.ts)) — 25 cases: `isValidGameMode` matrix (rejects unknown modes, casing, non-strings); `isNaturalPartition` matrix (every solo+timed mode at its natural pair, none of the non-natural pairs, no natural for competitive/cooperative); 5 mocked-D1 cases for `getLeaderboard` slow-path → fast-path fallback (fast-path direct, fallback fires on natural-partition empty, no fallback on non-natural-partition empty, no fallback for competitive scene-filter, slow-path-with-rows returns slow-path results without fallback).

### Carry-forward findings (still relevant for later phases)

1. **Mac white-ground bug** — photos at `~/Downloads/sds-mac-bug/` (NOT in repo). Three frames show: pre-bug rendering with **rainbow color-banding stripe across the sky horizon** (separate artifact, likely 8-bit color quantization or ACES tonemap precision); white-ground manifest with **terrain-only failure** (trees/sheep/rocks/fence still render correctly). The terrain-only signal narrows the suspect to `BlendedTerrainMaterial`, the grass instanced mesh, or heightfield texture upload — not a global WebGL context failure. Fold into Phase 4.
2. **Browserbase API key provisioned** at `~/.config/mk-agent/env` as `BROWSERBASE_API_KEY` — use it for Phase 4 remote-Safari repro spike. Free-tier; flag for upgrade if iteration burns through limits. See `reference_cloudflare.md` memory.
3. ~~Leaderboard panel renders empty~~ — fixed by Phase 6 (this commit).

## What to pick up next

Run `/cycle-start` to orient on Cycle 12.

**Recommended order (Phase 6 done 2026-05-02):**
- **Phase 1 (A8 drift)** — the technical unknown. Clean acceptance test (`window.__sdsStressTestSwaps(5)` reports drift). Instrument `disposeScene` step-by-step to isolate the remaining ~41% texture leak.
- **Phase 2 (UI unification)** is mechanical work on a known surface — good background-thread work.
- **Phase 5 manual playtest** is now unblocked (Phase 6 dependency satisfied). Walk the Cycle 8/9 backlog plus the new leaderboard surface (`Filters` disclosure, Clear-filters action, partition behavior on MP tabs).
- **Phases 3-4 are independent / Matt-gated.** Phase 4 (Mac) is Browserbase-enabled so AI can iterate without round-tripping; start the spike when ready.

## Cycle 11 → 12 carryover (deferred items)

Per `BACKLOG.md` close entry — list here for fast-recall:

1. **A8 stress drift partial.** Cycle 11 brought texture drift from initial ~100% down to ~41% over 5×3 swap loop (programs/geometries within ±10%). Architecture is sound; remaining slow accumulator is GPU-resource leak class that needs deeper Three.js renderer.info instrumentation to isolate. Suspect: per-swap Atmosphere ShaderMaterial recreation and/or sky/cloud shader programs. Cycle 12 Phase 1.
2. **Phase 2 UI carryover.** Mode-shaped HUD subcomponents (`<SoloClassicHUD>`, `<TimedHUD>`, etc.) and Button-component unification across ~40-50 raw `<button>` callsites (largest cluster: `SettingsPanel.js`). Cycle 12 Phase 2.
3. **Phase 3 video shots.** 4 specs in `tools/cinematic/shot-list.mjs` (dog-into-sunset, lightning-strike, chaos-5000, oc-portal). Headless Chromium WebGL on Windows is flaky; runner works in `--headed` mode. Iterate framing per-shot. Cycle 12 Phase 3.
4. **Phase 5 CF Web Analytics beacon.** Add `<script>` from CF Pages console → Analytics tab into `index.html`. Manual user action. Cycle 12 Phase 5.
5. **Mac rendering bug.** Bug does NOT reproduce on GH Actions Safari (verified across two macos-latest runs). Environmental to Matt's specific Mac. Debug recipe unchanged from Cycle 9 close. Cycle 12 Phase 4.
6. **Cycle 9/8 manual playtest.** Solo Classic 0/200, MP host sheepCount stickiness, guest invite scene rendering, leaderboard solo dropdown hidden, sheep+dog patch Y-lift. Cycle 12 Phase 5.

## Cycle 11 surfaces worth knowing

- **In-process scene swap entry points** ([`js/main.js`](js/main.js)): `swapScene`, `disposeScene`, `rebuildScene`, `_buildSceneBody`, `restartToMenu`. MP guests and `gameMode === 'multiplayer'` fall back to hard reload (Q1). `_sceneRebuilding` flag guards `animate()`. `history.replaceState` only fires on rebuild success; catch path falls back to `location.href`.
- **Stress harness** ([`js/main.js`](js/main.js)): `await window.__sdsStressTestSwaps(5)` runs 5×A→B→C→A and reports drift on geometries/textures/programs.
- **SceneSwapOverlay** ([`js/components/ui/SceneSwapOverlay.js`](js/components/ui/SceneSwapOverlay.js)): subscribes to `scene-swap-start`/`-end`/`-error`. 200ms in / 200ms min visible / 200ms out. z-index 10000.
- **Telemetry surface** ([`js/telemetry.js`](js/telemetry.js)): `emitEvent(name, props)` — anonymous welcome, JWT-aware, fire-and-forget. 4 events wired: `game_completed`, `mode_selected`, `scene_swapped`, `mp_room_created`.
- **Marketing assets**: `assets/marketing/og/og-{rolling-hills,open-country,field}.webp` (1200×630 WebP, 158-186 KB each). `assets/dogs/{jep,pip,sally,shiloh,george_washington}.{webp,png}` (512×512 thumbnails). `assets/images/icons/icon-{192,512,maskable-512}.png` (PWA).
- **Cinema runner** ([`tools/cinematic/run.mjs`](tools/cinematic/run.mjs)): `npm run cinema -- --shot=<id>` `--headed` `--skip-video` `--no-encode`. Shot list at [`tools/cinematic/shot-list.mjs`](tools/cinematic/shot-list.mjs).
- **Cinema API** ([`js/cinematic.js`](js/cinematic.js)): `pauseSimulation()`, `startSolo(dogId, mode)`, `waitReady(timeoutMs)`, `mountDogShowcase(dogId)`, plus existing `setSun`, `setCameraPose`, `playPath`, `triggerLightning`.
- **Sky preset fix**: `pastoral-noon` exposure 0.22 → 0.08 in [`js/atmosphere/skyPresets.js`](js/atmosphere/skyPresets.js).
- **Rock placement**: per-rock playarea buffer 20 → 40m + always-buried Y offset in [`js/TerrainBuilder.js`](js/TerrainBuilder.js).

## Running locally

First time on a fresh clone:

```
npm install
cp worker/.dev.vars.example worker/.dev.vars   # sets JWT_SECRET for local
npm run dev:setup                              # applies D1 migrations to local sqlite
```

Every session after that:

```
npm run dev    # starts Vite (:3000) + wrangler (:8787) together
```

To run cinematic captures locally:

```
npm install --save-dev sharp                                    # one-time
choco install ffmpeg  # or scoop install ffmpeg                 # one-time, system
npx playwright install chromium                                  # one-time
npm run cinema -- --skip-video --headed                          # render OG + dog + PWA stills
npm run cinema -- --shot=dog-into-sunset --headed                # iterate single shot
```

Open `http://localhost:3000`. URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl` (probe), `?cinematic=1` (filming infra), `?ui=off` (hide React overlay), `?sun=0.5` (sun position).

### Standing risks (carried into Cycle 12)

- **A8 strict-numeric drift.** Repeat-swap GPU memory grows ~41% per 5×3 cycle. Doesn't crash; doesn't visually regress; affects long demo sessions or stress tests.
- **Y-sample regression surface still wide.** Bad heightfield change makes dog float, sheep sink, grass clip simultaneously.
- **Sim-baseline fixtures one-way.** Don't regenerate without understanding the diff. Cycles 5-11 left them bit-identical.
- **`?cinematic=1` flips `preserveDrawingBuffer`.** Documented perf hit. Any change letting the flag affect normal play is a Hard Stop.
- **GLB shared-material trap (Cycle 11 finding).** Sheepdog/structure/mountain meshes are SkeletonUtils.clone or .clone() of cached GLBs. Their geometries + materials are SHARED with the originals — disposing the clones invalidates the cache and forces texture re-upload on next clone (the 100% → 41% A8 drift improvement). Future GLB-using code should remove-from-scene only, never traverse-and-dispose materials.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-12-plan.md`](docs/cycle-12-plan.md) — five phases, picks up Cycle 11 carryover |
| Latest closed cycle | [`docs/archive/cycles/cycle-11-plan.md`](docs/archive/cycles/cycle-11-plan.md) |
| Prior closed cycle | [`docs/archive/cycles/cycle-10-plan.md`](docs/archive/cycles/cycle-10-plan.md) |
| Older cycles | [`docs/archive/cycles/cycle-9-plan.md`](docs/archive/cycles/cycle-9-plan.md), [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md), [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md), [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md) |
| Cycle stub template | [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) |
| Frozen files / fence rules | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Closed cycles + deferred items | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player CHANGELOG | [`CHANGELOG.md`](CHANGELOG.md) |
| Press kit | [`PRESSKIT.md`](PRESSKIT.md) |
| Electron readiness | [`docs/electron-readiness.md`](docs/electron-readiness.md) |
| How to add a biome | [`docs/adding-a-biome.md`](docs/adding-a-biome.md) |

## What NOT to do

- Don't rearchitect multiplayer. It works.
- Don't reintroduce procedural mountains. The right path is a height-displaced skirt.
- Don't add new scenes. Three is the right number.
- Don't touch `shared/MovementPhysics.js`'s `updateMovement` for obstacle composition — Cycle 6 deliberately put obstacle-force composition at the call site.
- Don't blow up `main.js` in one PR. Shrink one responsibility at a time.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why.
- Don't hardcode grass-exclusion zones for non-Field scenes. Gate on `sceneDef?.farmHouse` and `sceneDef?.pasture`.
- Don't gate sprint *continuation* on `stamina >= minStaminaToSprint` — only sprint *start*.
- Don't traverse-and-dispose materials on GLB clones (SkeletonUtils.clone, .clone()) — they share materials with the cache. Cycle 11 A8 leak class.
- Don't let `?cinematic=1` flip `preserveDrawingBuffer` on the normal-play codepath.
- **Cycle 12:** Don't redesign UI from scratch — Phase 2 is unification + carry-over close-out only. Don't ship Electron packaging.
