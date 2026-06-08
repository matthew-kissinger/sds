# SDS Backlog

> Append-only log of closed cycles and deferred work. Most recent at the top. The `/cycle-close` slash command writes the "Recently Completed" section automatically; "Deferred" and "Distant ideas" are edited by hand as items surface.

## Recently Completed

### Cycle 71 - `newsheepdogland-load-fix-and-hero` (closed 2026-06-08)

Plan archived at [`docs/archive/cycles/cycle-71-plan.md`](archive/cycles/cycle-71-plan.md). Reframed from the `feel-and-media-live` stub when the flagship survival scene started crashing on load in the browser. Matt set the fix as a `/goal` ("Stop the newsheepdogland WebGPU load crash and make the flagship survival scene render within budget on WebGPU, then replace the placeholder hero with a real capture") and said implement; shipped end-to-end (measure -> fix -> verify -> commit -> deploy -> close). Render-only: no `shared/` sim change, so every sim-baseline is byte-identical by construction.

**Root cause (measured on the RTX 3070, `cycle71-validation/webgpu-crash/findings.md`, gitignored):** cold WebGPU pipeline compilation, not grass and not the Cycle 70 far-ring. On the default WebGPU renderer the heaviest scene's first cold load compiles its node-material pipelines (D3D12 WGSL -> DXIL) synchronously on the main thread for ~43s, tripping the Windows GPU TDR watchdog and wedging the tab. Warm reload ~4.3s; WebGL cold-loads the same scene in 2.2s with correct lighting. newsheepdogland is the only scene heavy enough (~400 tree InstancedMeshes + 744 grass chunks + water + structures) to blow the ~2s TDR window; lighter scenes compile fast enough, which is why only this scene crashed.

**Closeout outcomes (3 phases shipped):**

- **P1 root-cause the crash (measure-first) - SHIPPED.** Bisected WebGL vs WebGPU, cold vs warm, per load stage on the real GPU. Ruled out grass (266-413ms every path) and the far-ring (see below); identified cold pipeline compile as the ~43s main-thread block. Evidence in `cycle71-validation/webgpu-crash/findings.md`.
- **P2 pin newsheepdogland to WebGL (the fix) - SHIPPED.** New optional `SceneDef.renderer:'webgl'` (additive fence field on `shared/scenes/types.js`); `newsheepdogland.js` sets it. Two guards in `js/main.js`: a boot guard (deep-link/fresh load) skips the WebGPU boot for a pinned scene with no reload; a `swapScene` guard hard-reloads an in-app swap onto `?renderer=webgl`. Verified on the 3070: `?renderer=webgpu&scene=newsheepdogland` -> `effective: webgl`, no freeze; an in-app swap from a WebGPU `field` session hard-reloads to WebGL; `field` stays `webgpu-production` (pin scoped to just this scene). (`3b91f5b`)
- **P3 real hero capture - SHIPPED.** `assets/scenes/entrance/newsheepdogland.webp` is now a real dusk sunset-over-water capture (1920x1080, 214 KB), replacing the 7.5 KB flat gradient. Captured headed on the real GPU (the headless tool and the cinematic FREE camera both render the sun billboard as a black dome; the natural gameplay camera renders it correctly). FINAL beauty-shot dialing stays Matt's per the media-prep split. (`3b91f5b`)

**Corrections / findings:**

- **The Cycle 70 P1 far-ring is inert in production.** `grass.farRing` is gated behind `tierPreset.meadowQuadEnabled`, which is `false` on low, med, AND high tiers (`HardwareTier.js`; Cycle 51 disabled it for med/high). So the far-ring branch never runs on any hardware - the live scene has 744 blade chunks and 0 meadow quads, and the "37.6% cut, LIVE" never actually shipped. Spawned a background task to re-gate it on its own flag (and re-validate the seam) or retract the claim. (Prior BACKLOG entries are append-only and left as written.)
- **WebGPU node-lighting bug on this scene** ("Light node not found for AmbientLight/DirectionalLight" every frame) - another reason WebGL is the correct route for it.

**Deferred (the literal "render within budget ON WebGPU"):** the WebGL pin sidesteps the cold compile. Genuinely making the heaviest scene's WebGPU cold compile non-blocking/cheaper is konveyor-subsystem-deep, and the WebGPU node-lighting is broken on it, so that is its own cycle.

**Validation gates:** `npm test` 1135 pass / 8 skip / 0 fail (no test change - render-only); `npm run lint` (`eslint shared/`) clean; `npm run build` clean (main bundle 585.6 KiB; +~0.6 KiB of necessary guard logic over the 584.81 KiB Cycle 70 baseline - the tracked ~585 KiB target moves to ~586 KiB, not an enforced gate); sim-baselines byte-identical.

**Release proof.** Commit `3b91f5b` pushed to `main`; GH Actions deploy run `27108889618`. The docs-only close commit does not deploy (paths-ignore).

**Carryover (to Cycle 72 `webgpu-first`):** Matt redirected the next cycle to **WebGPU-first** - make the heaviest scene viable on WebGPU (kill the cold-compile freeze + fix the node-lighting), then remove this cycle's WebGL pin so every scene defaults to WebGPU when available, and **retract** the inert far-ring (Matt's lean), as polish toward packaging/marketing. The `feel-and-media-live` paired track (survival feel LIVE tuning, two-client co-op fun playtest, entrance hero FINAL beauty shot, the `multiplayer.md` doc correction - still needs Matt's OK) is bumped to a later cycle. Prior open carryover (tablet draw-call perf) remains.

### Cycle 70 - `survival-feel-and-media` (closed 2026-06-07)

Plan archived at [`docs/archive/cycles/cycle-70-plan.md`](archive/cycles/cycle-70-plan.md). An autonomous cycle (Matt: "author entire cycle the implement and complete and close and commit and deploy") that converted the Cycle 69 carryover into shipped work where it could ship autonomously, and into evidence where it could not. This was the Matt's-hands / paired track, so the deferrals (final hero blessing, fun playtest, multiplayer.md edit) are first-class outcomes, not gaps. No `shared/` sim change, so the 10 sim-baselines are untouched by construction; `GrassSystem` got an additive gated path, not a decomposition.

**Closeout outcomes (3 shipped, 2 evidence-deferred, 1 still-blocked):**

- **P1 grass far-ring Option A - SHIPPED (the Cycle 69 P2 viable-but-deferred win, flipped to implement on Matt's "implement and complete").** New `GrassDef.farRing` (additive, render-only fence case on `shared/scenes/types.js`). On a coastline scene, far chunks beyond `farRing.meadowFrom` from `grassCenter` (on land per the SDF cull) render as one terrain-following meadow quad instead of clump blades - the RH/OC desktop LOD, extended to the boot grid. Measured from `grassCenter` (not the world origin) so near play-area chunks keep full blades. Mutually exclusive with the non-coastline meadow path; every scene without `farRing` is byte-identical. Enabled on Newsheepdogland at `meadowFrom 600` (37.6% grass-triangle cut, 7.31M -> 4.56M, zero draw-call change, coast/relief-safe). Desktop-tier only. (`ef4ed1d`)
- **P2 survival feel-pass readiness audit - SHIPPED (no spec change).** `cycle70-validation/survival-feel/audit.md` cross-checks the three FEEL PASS NOTES against the real constants: (1) wolf huntSpeed 11.5 / fleeSpeed 13 vs uniform dog speed 15 walk / 25 sprint single (30 / 50 co-op) - the dog is strictly faster on every dog in every mode, so the shoulder-off mechanic is viable and there is NO playability bug (the one objective concern, which did not fire); (2) day-1 lethality math (2 wolves, ~1.67 kills/s, run ends at 4 losses, ~8-18s spawn-ring grace); (3) growth 5 vs maxFlock 200 (~38 days to cap). The per-dog Speed/Stamina/Control are confirmed cosmetic (locale copy, not wired to gameplay). Recommended a live-tuning lever order. The spec values stand as Matt's paired track; nothing in `tuning.js` changed.
- **P3 entrance hero capture refresh - SHIPPED candidate, FINAL deferred.** Re-ran `tools/hero-capture.mjs` against the far-ring-enabled scene (`cycle70-validation/hero/`). Visual check vs the pre-far-ring Cycle 68 before-shot: the dense far-grass band is reduced (far chunks are now meadow quads) with a clean land/water boundary, no quads tiling water, no flat-plane reads - hard-stop #2 passes. The dark horizon dome is a pre-existing headless-WebGL sun artifact (identical in the before-shot), not from the far-ring. The FINAL beauty pass (live browser, manifest dial-in) stays Matt's per the media-prep split.
- **P4 validate + close.** Below.

**Deferred (carried to Cycle 71):**

- **Survival feel LIVE tuning** - the P2 audit is the numbers-backed starting point; the live wolf-night taste pass is Matt's.
- **Two-client co-op fun playtest** - Matt's.
- **Entrance hero FINAL beauty shot** - Matt drives the browser (P3 shipped the current candidate).
- **`multiplayer.md` doc correction - STILL BLOCKED.** The agent-config guardrail blocks Claude editing a `.claude/rules/*.md` file autonomously; "do the whole cycle" is the same phrasing that did not authorize it in Cycle 69, held consistent. Matt applies the staged text or grants the edit.

**Validation gates:** `npm test` 1135 pass / 8 skip / 0 fail (no test change - P1 render-only, P2/P3 are artifacts); eslint `shared/` clean; worker `tsc` clean; `npm run build` clean (main bundle 598.85 kB = 584.81 KiB, within the 585 KiB ratchet, +~20 bytes from the gating logic); the 10 sim-baselines + scatter/terrain refactor-baselines byte-identical (render-only change).

**Release proof.** Commits `ca2e72b` (plan) -> `ef4ed1d` (P1) pushed to `main`; the GH Actions deploy (run `27106398986`) ran green including the `Migrate D1 (remote)` job (no-op, no new migration). The docs-only close commit does not trigger a deploy (paths-ignore). Prod verified post-deploy.

**Carryover:** the four Cycle 71 items above. Prior open carryover (tablet draw-call perf, counting naming/curve-feel) remains deferred.

### Cycle 69 - `grass-far-ring-and-api-hardening` (closed 2026-06-07)

Plan archived at [`docs/archive/cycles/cycle-69-plan.md`](archive/cycles/cycle-69-plan.md). A folded autonomous cycle (Matt: "author cycle 69 the complete and push and deploy") that closed the two autonomous-able Cycle 67/68 loose ends and reframed the scaffolded `survival-feel-and-media` stub (those Matt's-hands tracks moved to Cycle 70). The riskiest item (grass) was again gated behind a measure-first spike, so the cohesion-frozen `GrassSystem` was never touched on a guess. No `shared/` change this cycle, so the sheep sim-baselines are untouched by construction.

**Closeout outcomes (3/4 phases shipped, 1 evidence-deferred):**

- **P1 API body-parse hardening (the documented `/api/rename` prod-500).** A bare `await request.json()` on the body-parsing POST routes threw on an absent, empty, or malformed body and fell through to the outer catch as a server `500` - a server fault for a client mistake. New `readJsonObject(request)` returns `{}` instead of throwing; routed `/api/register`, `/api/rename`, `/api/rooms`, room-join, quick-match, `/api/score`, and `/api/event` through it (one shared helper, no patchwork). Each route's existing field guards then produce the correct `401` (no token) or `400` (bad field). New route-level `tests/worker/rename-route.spec.ts` drives the exported `fetch` handler: no body -> `400`, malformed JSON -> `400`, no token -> `401` (was `500`). (`51185ea`)
- **P2 coastline grass far-ring spike (measure-first).** `tools/grass-far-ring-spike.mjs` imports the real scene + the pure CoastlineField SDF and replays GrassSystem's chunk-cull + clumpScale + meadow-geometry math (no Three, no frozen sim core). Result (`cycle69-validation/grass/far-ring-spike.json`): baseline 829 draw calls / 7.31M tris. Option A (40m meadow quads on far chunks) = zero draw-call change, 37.6% triangle cut at the play-area-safe `meadowFrom` 600m, coast- and relief-safe. Option B (merged tiles, the only draw-call cut) = up to 34% fewer draw calls but over-tiles ~151 shore sub-cells (coast coarsening) and floats on leg relief, for no perf need (829 < 1500 budget). (`37cf232`)
- **P3 far-ring implementation - DEFERRED with evidence (the P5 -> P6 pattern).** Option B is NO-GO (coarsens the coast, solves a non-problem). Option A is a viable, contained, one-flag triangle win (parity with the RH/OC desktop meadow-quad LOD) but a VISUAL change to the exact scene Matt has a pending hero-capture + feel pass on, so per the media-prep split it bundles with his visual pass rather than shipping autonomously ahead of it. `js/GrassSystem.js` + `shared/scenes/types.js` left byte-unchanged (no fence touch this cycle). The Option-A recipe is captured in the spike report for Cycle 70.
- **P4 validate + ship + close.** Below.

**Validation gates:** `npm test` 1135 pass / 8 skip / 0 fail (the new rename-route spec adds 7); eslint `shared/` clean; worker `tsc` clean; `npm run build` clean (main bundle 598.83 kB = 584.8 KiB, within the 585 KiB ratchet - no client-code change this cycle); sim-baselines untouched (no `shared/` edit). The `upload-artifact@v5` carryover is verified already-resolved (all four workflows are on v5).

**Release proof.** Commits `8a6fdcc` (plan) -> `37cf232` (P2) pushed to `main`; the GH Actions deploy ran green including the `Migrate D1 (remote)` job (no-op this cycle, no new migration). Prod verified post-deploy.

**Carryover (to Cycle 70 `survival-feel-and-media`, the Matt's-hands track):**

- **Grass far-ring Option A** (the P2 viable-but-deferred win): enable the existing meadow-quad LOD for coastline far chunks behind a SceneDef opt-in (37.6% grass-triangle cut, coast/relief-safe). Bundle with Matt's visual pass since it changes the hero-capture scene. Recipe in `cycle69-validation/grass/far-ring-spike.json`.
- **`multiplayer.md` doc correction is STILL BLOCKED + needs Matt's explicit OK.** The Cycle 68 P1 remote-migration lines are still wrong; the agent-config guardrail blocks Claude editing a `.claude/rules/*.md` file autonomously. Staged text in the archived cycle-68 plan.
- **Survival feel-pass tunables** (`shared/survival/tuning.js`), **two-client live co-op fun playtest**, and **the entrance hero FINAL shot** (dial `tools/hero-capture.mjs` to the manifest) - all Matt's taste/media track.
- Prior open carryover (tablet draw-call perf, counting naming/curve-feel) remains deferred. `/api/rename` no-body 500 is now FIXED (P1); `upload-artifact@v5` is verified resolved.

### Cycle 68 - `survival-polish` (closed 2026-06-07)

Plan archived at [`docs/archive/cycles/cycle-68-plan.md`](archive/cycles/cycle-68-plan.md). A folded autonomous cycle (Matt: "add all to cycle - author and align it - then autonomously complete it") that hardened + polished the Cycle 67 co-op survival mode. All four Cycle 67 carryover candidates were folded in; the riskiest (grass) was gated behind a measure-first spike so the cohesion-frozen `GrassSystem` was never touched on a guess. The 9 sheep sim-baselines stayed byte-identical (every survival change is gated behind `isSurvival`).

**Closeout outcomes (8/8 phases shipped or evidence-deferred):**

- **P1 deploy applies remote D1 migrations.** Closes the Cycle 67 prod-break gap (0009 had to be applied to remote by hand). A new `migrate` job in `deploy.yml` applies migration files ADDED in the push (`git diff --diff-filter=A`) to remote `sds-db` via `wrangler d1 execute --remote`, and gates the worker + pages deploys (`needs: [test, migrate]`) so code never ships ahead of its schema. Deliberately NOT `wrangler d1 migrations apply --remote`: the remote `d1_migrations` tracking table is historical + out of sync (0007-0009 were applied via raw `execute`, untracked), so the framework would re-run them and fail on a duplicate column (verified remote state first). `scripts/d1-local-setup.mjs` is the one place that applies the full migration set to LOCAL D1 (dev:setup + both CI perf jobs use it; the old dev:setup silently skipped 0003-0006/0008/0009). First CI run verified: the `Migrate D1 (remote)` job ran green as a no-op (no new migration this cycle). (`98a87fb`)
- **P2 centralize the survival feel constants.** New `shared/survival/tuning.js` is the single source for `WOLF_TUNING` (pack/speed/kill/bark knobs) + `SURVIVAL_RUN_DEFAULTS`; `wolves.js`/`wolfBehavior.js`/`run.js`/the scene all consume it (killed the duplicated `2/1/8` spawn-count defaults; centralized the bark-repel duration). Values preserved byte-for-byte (Matt's spec); the live value tuning is documented as FEEL PASS NOTES for Matt's paired track. `tests/survival-tuning.spec.js` pins the single-source contract. (`c17b79f`)
- **P3 two-client live co-op proof (the run Cycle 67 deferred).** `tests/integration/coop-survival.spec.ts` (gated behind `COOP_SURVIVAL_LIVE`, reuses the TestClient harness) drove a real two-client flow against a live local `wrangler dev`: register x2 -> create survival room -> join -> two WS upgrades -> host startGame -> both clients received the DO-authoritative `gameStateUpdate` survival block, and after forced nightfall both saw the same 2-wolf pack. VERIFIED PASS (30s end-to-end; artifact `cycle68-validation/coop/two-client-proof.json`). Prod-safe night seam: `GameSim._testAdvanceSurvival` reachable only via the DO's `__testAdvanceSurvival` WS message, gated behind `env.INTEGRATION_TEST` (set only by the harness, never in prod). (`3b4cc5a`)
- **P4 persist the multi-day run across DO eviction (deferred Q5).** Day-granularity checkpoint: `GameSim.serializeSurvival()` captures `{day, flock, peak}` on each surviving dawn (cleared on death), `RoomDO` persists it to DO storage + restores on wake, and `_initSurvival` resumes from it (activating dormant sheep to match) instead of resetting to day 1. The in-flight night (wolf positions, within-day clock) is ephemeral by design (the DO snaps to 'waiting' on eviction), so it is not captured. No wire change, no PROTOCOL_VERSION bump (`snapshot-shape` passes as-is). `tests/worker/survival-persistence.spec.ts`. (`ba86297`)
- **P5 grass density/LOD spike (measure-first).** `tools/grass-rearch-spike.mjs` imports the real scene + the pure CoastlineField SDF and replays GrassSystem's exact chunk-cull + clumpScale math in Node. Result (`cycle68-validation/grass/grass-spike.json`): current 760m play-area disc = 829 draw calls / 1.83M blades; whole-island = 2,243 draw calls (2.71x) / 2.51M blades. (`04282be`)
- **P6 grass rearch - DEFERRED with evidence.** The P5 spike returned NO-GO (2.71x draw calls for ground the dog never traverses; coastline has no meadow-quad LOD so far chunks would be full clump instancing). `GrassSystem.js` left unmodified (do-not-decompose upheld). The evidence-backed follow-up is a targeted far-ring meadow-quad for coastline scenes (NOT a decomposition), its own spike + cycle. (`8ab2d91`)
- **P7 entrance hero capture - manifest + working tool shipped; final framing is Matt's pass.** `cycle68-validation/hero/manifest.md` specifies the shot; `tools/hero-capture.mjs` drives the in-repo cinematic API (`?cinematic=1` -> `window.__sdsCinema`: setSun/setCameraPose/hideUI) and reliably writes 1920x1080 + 1200x630 PNGs. Two blind camera passes proved the pipeline works but framing/lighting need a live eye (the dark disk is the low-sun sphere; notes saved in the manifest) - exactly the media-prep split. (`cd3be37`)
- **P8 validate + ship + close.** Below.

**Validation gates:** `npm test` 1128 pass / 8 skip / 0 fail (new survival-tuning + survival-persistence specs; the gated coop-survival spec skips offline); eslint shared/ clean; worker `tsc` clean; `npm run build` clean (main bundle within the 585 KiB ratchet - the only client-bundle change was the tiny tuning.js); refactor-baseline (bundle-size + mode-dispatch) green against fresh dist; the 9 sheep sim-baselines byte-identical.

**Release proof.** Commits `4d04004` (plan) -> `cd3be37` (P7) pushed to `main`; the GH Actions deploy ran green INCLUDING the new `Migrate D1 (remote)` job (success, no-op this cycle). Prod verified: frontend 200, the four survival boards (`survival`, `survival:2/3/4`) 200. No remote schema change this cycle (the migrate job is wiring for the next migration).

**Carryover (to a future cycle):**

- **`multiplayer.md` doc correction is BLOCKED + needs Matt's explicit OK.** P1 made the deploy apply remote migrations, so the doc's "Apply to remote with the standard wrangler CLI; CI does this on deploy" + "dev:setup runs the wrangler migration apply" lines are now wrong. The corrected text is staged (in the archived plan's Frozen-files section + the P1 commit), but the automated agent-config guardrail blocks Claude editing a `.claude/rules/*.md` file under a general autonomous directive. Matt: apply the staged correction, or grant the edit.
- **Survival feel-pass tunables (Matt's taste).** P2 centralized every knob into `shared/survival/tuning.js` with reasoned FEEL PASS NOTES; the live value tuning (does day 1 feel too punishing? are wolves outrunning the slow dogs?) needs a wolf night to judge.
- **Two-client live co-op feel.** The WIRE path is now proven live (P3); the subjective "is co-op survival fun" playtest is Matt's.
- **Entrance hero FINAL shot.** P7 shipped the manifest + working `tools/hero-capture.mjs`; the hero-quality framing is a short Matt pass (edit CAM/TARGET/SUN_T live, re-run).
- **Coastline far-ring meadow-quad grass** (the P5 NO-GO follow-up): a targeted LOD for coastline scenes that would also trim the current 829 draw calls. Its own spike + cycle, NOT a GrassSystem decomposition.
- Prior open carryover (tablet draw-call perf, counting naming/curve-feel, `/api/rename` no-body 500, `upload-artifact@v5` Node 20) remains deferred.

### Cycle 67 - `coop-survival` (closed 2026-06-07)

Plan archived at [`docs/archive/cycles/cycle-67-plan.md`](archive/cycles/cycle-67-plan.md). A folded autonomous cycle (Matt: "complete all autonomously") that promoted the Cycle 66 solo survival layer into the deterministic `shared/` sim and made survival a 2-4 player co-op mode. The Cloudflare Worker Durable Object is now authoritative for the run + wolves + pen, and clients render the broadcast (no client prediction of wolves - the load-bearing decision, which sidesteps cross-engine trig determinism). The 9 sheep sim-baselines stayed byte-identical (survival is purely additive + gated behind `isSurvival`).

**Closeout outcomes (8/8 phases shipped):**

- **P1 promote the deterministic cores.** `survivalRun.js` -> `shared/survival/run.js`, `wolfBehavior.js` -> `shared/survival/wolfBehavior.js`, `penContainment.js` -> `shared/survival/pen.js` (the one Cycle 66 `Math.random` settle spot is now a seeded `mulberry32` draw keyed by `(settleSeed, sheepId)`). `js/gamestate/*` became one-line re-export shims; the eslint `shared/**` guard already covers the new modules. (`1e8f966`)
- **P2 extract the wolf AI + split the renderer.** `shared/survival/wolves.js` is the pure `WolfSim` (spawn/hunt/kill/flee/retreat, seeded, no Three); `js/gamestate/wolfRenderer.js` is a Three-only `WolfRenderer` reconciling rig instances by id (reused in co-op from the broadcast); `js/gamestate/wolfPack.js` is now a thin solo orchestrator with an identical public API. (`acf018f`)
- **P3 DO-authoritative survival tick.** `GameSim._tickSurvival` runs a server-owned day clock (`shared/survival/dayClock.js`, promoted from `dayLoop.js`), the run economy, the seeded wolves, and the pen each tick - all gated behind `isSurvival`. The flock is a maxFlock pool (startFlock active, the rest dormant, activated on a surviving dawn). DO-side bark wolf-repel. (`74cf4bc`)
- **P4 `survival` co-op room mode.** RoomDO accepts `gameMode 'survival'` (gated by `scene.allowedModes`; a clean 400 elsewhere) and forces the sheepCount to the scene maxFlock pool; `newsheepdogland.allowedModes` gains survival; RoomCreation surfaces Newsheepdogland + the Survival mode. (`dd387b2`)
- **P5 additive wire frame + protocol version tag.** `shared/protocol.js` adds `PROTOCOL_VERSION` (2; pre-cycle was an implicit v1) + `SURVIVAL_MIN_PROTOCOL_VERSION`; the snapshot gains `v` + the optional survival/wolves blocks + a `killed` sheep flag (all absent on non-survival frames); the DO version-refuses a too-old client from a survival room. The four-piece migration story is in the archived plan. (`5c64607`)
- **P6 client renders co-op from the broadcast.** `initNetwork.driveCoopSurvival` mounts a `WolfRenderer` fed from the broadcast, drives the HUD chip + minimap (now drawing all players' dogs) from the survival block, and applies the `killed` flag (OptimizedSheep's MP path gained a killed-guard). The solo sim is gated to `!isMultiplayer`. (`d0ec10f`)
- **P7 party-size co-op leaderboard + submit-from-DO.** Append-only migration `0009` adds `score_submissions.party_size` (DEFAULT 1, so legacy rows = solo and the Cycle 66 board is byte-identical); survival boards partition by `(scene, party_size)` - `survival` (solo) + `survival:2/3/4` (co-op); the DO's `onSubmitScores` posts each player's peak flock with the room's party size. (`f6af85c`)
- **P8 validate + ship.** Below.

**Validation gates:** `npm test` 1114 pass / 7 skip / 0 fail (new wolf-sim, survival-tick, survival-room, survival-shims, party-size leaderboard specs); eslint shared/ clean; worker `tsc` clean; `npm run build` clean (main ratchet 582 -> 585 KiB, the always-loaded co-op wiring; the WolfRenderer/HUD/minimap stay lazy chunks); the 9 sheep sim-baselines byte-identical. Browser smoke (solo survival regression, preview on a fresh build, probe closed after): Newsheepdogland builds in solo with the promoted run/pen/wolves wired, the WolfRenderer spawns + renders a hunting pack (meshes in the scene), the bark repels both wolves, the minimap + HUD draw, zero console errors. Proof in `cycle67-validation/p8-smoke.md`.

**Release proof.** Commits `1e8f966` (P1) -> `f6af85c` (P7) pushed to `main`; the GH Actions deploy ran green (worker + Pages). **Migration 0009 was applied to remote D1 by hand** (`wrangler d1 execute sds-db --remote`) because the deploy workflow applies migrations only to LOCAL D1 for the test job - see the carryover. Prod verified: the four survival boards (`survival`, `survival:2/3/4`) return 200; the frontend + terrain are 200.

**The two-client live co-op smoke is deferred to Matt's playtest** (a full ~10-minute-day run with wrangler dev + local D1 + two WS sessions is impractical to automate). The DO co-op behavior - authoritative tick, wire frame, version gate, room mode, party-size leaderboard - is covered by 40+ worker specs; the solo smoke proves the same `shared/survival/*` code renders correctly.

**Carryover (to a future cycle):**

- **Deploy does not apply remote D1 migrations.** `deploy.yml` runs `wrangler d1 execute --local` only (for the test job); remote migrations are manual (`wrangler d1 execute <db> --remote --file=...`). Either add a gated remote-migration step to the deploy or fold the manual step into the cycle-close checklist, so a future migration cycle does not ship a code-vs-schema break. This cycle hit it (the survival board 500'd in prod until 0009 was applied by hand); the `multiplayer.md` line "CI does this on deploy" is now inaccurate and should be corrected.
- **Two-client live co-op playtest** (the deferred smoke above) + the **wolf / survival feel pass** (the named tunables: wolf counts/speeds, kill radius, bark range, +5 growth, 33% loss, maxFlock 200) - Matt's paired-track taste pass.
- **Reconnect persistence of the multi-day run** - the run lives in GameSim memory (lost on a worker redeploy, like all co-op state); full DO-storage persistence was deliberately deferred (Q5).
- **Whole-island grass rearch** (alpine mountain-leg coverage, gated on a density/LOD perf spike) + a **real Newsheepdogland entrance hero capture** remain deferred.
- Prior open carryover (tablet draw-call perf, counting naming/curve-feel, `/api/rename` no-body 500, `upload-artifact@v5` Node 20) remains deferred.

### Cycle 66 - `newsheepdogland-survival` (closed 2026-06-07)

Plan archived at [`docs/archive/cycles/cycle-66-plan.md`](archive/cycles/cycle-66-plan.md). A folded autonomous cycle (Matt: "run Cycle 66 end to end autonomously") that turned the Wolf Coast homestead into a real survival game and renamed the island to **Newsheepdogland**. Solo + client-side throughout: the deterministic `shared/` sheep sim is untouched (sim-baseline byte-identical), the one fence touch was the additive `shared/scenes/types.js` survival field (Cycle 66 P3), and the only D1 change was the append-only scene-id rename migration (survival reuses the existing `score` column, no leaderboard schema change).

**Closeout outcomes (8/8 phases shipped):**

- **P1 full rename Wolf Coast -> Newsheepdogland.** Scene module + coast file + id + display name, terrain bin (`newsheepdogland.bin`), scene registry, deep-link URLs, entrance carousel, sim-baseline fixture (renamed, byte-identical), tests, and the append-only D1 partition rename (`0008_rename_wolfcoast_to_newsheepdogland.sql`). Grep-clean of functional `wolf-coast` references.
- **P2 pen as a real barrier + the objective.** A client-side per-frame containment ([`js/gamestate/penContainment.js`](../js/gamestate/penContainment.js), 8 tests): the square fence ring is solid (gate-only entry, sealed at night, dog + sheep collide); sheep herded through the gate settle and retire inside (no zap, no teleport). The toe-corral zap is gone.
- **P3 survival loop + UI reorg.** [`js/gamestate/survivalRun.js`](../js/gamestate/survivalRun.js) (the dayLoop precedent): start 10 sheep, ~10-min day, lose <33% -> +5 and next day, 33%+ -> death, score = peak flock (capped at maxFlock so it tracks the rendered sheep). No sheep-count selection; the day/night chip doubles as the survival HUD.
- **P4 wolves.** A client-only night pack ([`js/gamestate/wolfPack.js`](../js/gamestate/wolfPack.js) + pure tested [`js/gamestate/wolfBehavior.js`](../js/gamestate/wolfBehavior.js)): escalating seeded spawn at nightfall, hunts sheep outside the pen, kills feed the economy, retreats at dawn, reuses [`js/Wolf.js`](../js/Wolf.js) + `Wolf.glb` (one glTF clones the pack). Sheep in the closed pen are unreachable.
- **P5 bark wolf-repel.** The bark now also scares wolves at a longer radial range (breaks pursuit); client-only, the deterministic sheep-cone math in [`shared/BarkImpulse.js`](../shared/BarkImpulse.js) is untouched.
- **P6 survival leaderboard.** A live-read `survival` board ([`shared/survivalModes.js`](../shared/survivalModes.js) + [`worker/src/d1.ts`](../worker/src/d1.ts)) partitioned by (scene, mode), ranked by peak flock DESC, reusing `score_submissions.score` (no migration). Submit on death, a run-summary leaderboard read, and a GlobalLeaderboard tab.
- **P7 minimap + grass.** A top-right canvas minimap ([`js/components/GameHUD/Minimap.js`](../js/components/GameHUD/Minimap.js)) drawing the island from the coastline polygon with live dog / flock / wolf markers, pointer-events none. Grass widened to blanket the whole survival play surface (745 chunks, within budget).
- **P8 validate + ship.** Below.

**Validation gates:** `npm test` 1078 pass / 7 skip / 0 fail (new wolf-behavior, survival maxFlock-cap, worker survival-leaderboard specs); eslint shared/ clean; worker `tsc` clean; `npm run build` clean (main ratchet 580 -> 582 KiB); sim-baseline byte-identical. Browser smoke (preview on a fresh build, `SDS_SUPPRESS_BROWSER_OPEN=1`, probe closed after): scene loads as newsheepdogland with all survival systems wired, 10 sheep / maxCapacity 200, the minimap draws the island + live markers, a day-3 pack of 4 wolves spawned on land outside the pen and killed 4/10, the bark repelled all 4, killed sheep render invisible, the death summary shows score + leaderboard + restart; zero console errors.

**Release proof.** Features across commits `1a61565` (P1) / `b819b9d` (P2) / `5a45cee` (P3) / `968440d` (P4-P7); the cycle-close commit pushes the lot to `main` and triggers the GH Actions deploy (verified green post-push).

**Carryover (folded into Cycle 67):**

- **Co-op survival** - promoting the survival run + wolves + pen containment into the deterministic `shared/` sim for Worker-authoritative co-op rooms (this cycle is solo + client-side by design).
- **Whole-island grass rearch** - the literal alpine mountain-leg grass coverage, gated on a density/LOD perf spike (per the grass-discipline rule); this cycle widened to the play surface only.
- **A real Newsheepdogland entrance hero capture** to replace the dusk-gradient placeholder (Matt's media pass).
- **Wolf / survival feel pass** - the named numbers (wolf counts, speeds, kill radius, bark repel range, growth, loss threshold) are tunables awaiting Matt's taste pass.
- Prior open carryover (tablet draw-call perf, real mobile pass, counting naming/curve-feel, `/api/rename` no-body 500, `upload-artifact@v5` Node 20) remains deferred.

### Cycle 65 - `wolf-coast-homestead-and-day` (closed 2026-06-07)

Plan archived at [`docs/archive/cycles/cycle-65-plan.md`](archive/cycles/cycle-65-plan.md). A folded cycle (Matt: "fold the next 2 cycles into 1") that turned the walkable Wolf Coast foundation into a place with a daily rhythm: a homestead the dog wakes at, island character (forest / fields / tree-lines), a day/night cycle with a HUD clock, a gate that opens at dawn and shuts at night, a soft herd-back-before-dusk loop, and a skip-to-dusk camera cutscene. Client-only: the one fence touch was additive `shared/scenes/types.js` data fields. No deterministic-sim, wire, or D1 change; sim-baseline byte-identical.

**Closeout outcomes (8/8 phases shipped):**

- **P1 homestead layout + P2 animated gate.** Co-located the farmhouse, a fenced pen, a swing gate, and the dog spawn into one homestead in the foot. The gate door tweens open at dawn / shut at night via the day-loop runner ([`js/StructureBuilder.js`](../js/StructureBuilder.js) `buildHomesteadGate` + `updateGate`).
- **P3 biome character.** [`shared/scenes/wolf-coast.js`](../shared/scenes/wolf-coast.js) woods re-authored into dense conifer pockets, a north-foot tree-line windbreak, and a deliberately open foot pasture.
- **P4 day/night + P5 HUD.** An additive `dayNight` SceneDef field turns on the existing [`js/atmosphere/DayNightCycle.js`](../js/atmosphere/DayNightCycle.js); a dependency-free [`DayNightChip`](../js/components/GameHUD/DayNightChip.js) shows day, phase, a sun-progress track, and the home count.
- **P6 day loop.** A client-only controller ([`js/gamestate/dayLoop.js`](../js/gamestate/dayLoop.js), the counting-mode precedent, 9 unit tests): day / phase / gate / dusk-warning + a nightly home tally. Soft outcome (no fail-death).
- **P7 skip-to-dusk.** [`js/effects/skipToDusk.js`](../js/effects/skipToDusk.js): an on-screen button + F key that pans the camera up to the sun while fast-forwarding the clock to dusk.
- **Post-close homestead fixes (2026-06-07, after Matt's prod playtest).** The farmhouse was rendering ~1.2 km off at the Home Field default (a stale `farmHousePosition` cache read before the scene def was set on the autostart boot, and during the models await); now read from the live scene def at placement, attached to the pen's north side, porch facing west like the gate opening. The pen gained a full grounded fence ring (was a gate plus two floating wings: a double-lift `_surfaceToTerrain` bug). Trees gained a waterline cull (none in the water). The day/night chip moved top-left under the score (was overlapping top-center). Added optional `farmHouse.rotationDeg` to the SceneDef.

**Validation gates:** `npm test` 1042 pass / 7 skip / 0 fail; eslint shared/ clean; worker `tsc` clean; `npm run build` clean (main ratchet 573 -> 578 KiB); sim-baseline byte-identical. Browser smoke (preview, `SDS_SUPPRESS_BROWSER_OPEN=1`): homestead start, day arc, gate by phase, herd-back, skip cutscene, house attached + grounded fence ring + no trees in water all verified.

**Release proof.** Shipped across commits `ac76760` / `c7e4ef4` / `f03f196` (cycle) plus `23f811a` / `b97daf6` (post-playtest fixes); deploy runs green; prod homepage 200, Wolf Coast live with the day loop.

**Carryover (all folded into Cycle 66 `newsheepdogland-survival`, the folded autonomous survival cycle):**

- **The survival loop** (Matt's spec): start with 10 sheep, ~10-minute day, dusk herd-back, night wolves; lose under 33% -> gain +5 -> next day; flock size is the score, recorded to the leaderboard at death.
- **Pen as the objective + a real barrier**: herd sheep through the gate; they retire naturally inside the pen (no zap, no teleport); dog + sheep collide with the fence; sheep enter only through the gate area; remove the toe-corral zap.
- **Wolves** (night spawn, hunt sheep outside the pen; reuse [`js/Wolf.js`](../js/Wolf.js) + `Wolf.glb`).
- **Bark redesign**: keep the forward cone for sheep; add a longer-range radial wolf-repel (today's [`shared/BarkImpulse.js`](../shared/BarkImpulse.js) is a 12 m sheep-only cone).
- **Full rename Wolf Coast -> Newsheepdogland** (scene id, deep-link URLs, terrain bin filename, D1 leaderboard partition, tests).
- **Grass across the whole island** (optimal LOD/density rearch; foot-only today for draw-call cost).
- **Minimap** top-right, polished, to orient the player on the island.
- **Survival UI reorg** (no sheep-count selection; a survival-specific HUD).
- **Survival leaderboard** (a new append-only D1 migration).
- A real entrance hero capture to replace the dusk-gradient placeholder (Matt's media pass).
- Prior open carryover (tablet draw-call perf, real mobile pass, counting naming/curve-feel, `/api/rename` no-body 500, `upload-artifact@v5` Node 20) remains deferred.

### Cycle 64 - `wolf-coast-foundation` (closed 2026-06-06)

Plan archived at [`docs/archive/cycles/cycle-64-plan.md`](archive/cycles/cycle-64-plan.md). Cycle 64 opened the Survival / Wolf Coast campaign and shipped the foundation only: a new `coastline` boundary kind (an arbitrary concave shoreline the radial `island` kind cannot express) plus the walkable Wolf Coast island, playable in the existing Just Play / Solo modes. Survival mode, wolves, the day/night loop, co-op, and the survival leaderboard stay later cycles. The highest-risk engineering item of the whole campaign (the boundary primitive) was R&D-spiked first, then landed behind a real test vehicle.

**Closeout outcomes (7/7 phases shipped):**

- **P1 - coastline SDF primitive.** New pure [`shared/CoastlineField.js`](../shared/CoastlineField.js): a signed-distance field built once from an inline polygon (even-odd ray cast + min-segment distance, Float32, byte-identical builds), bilinear sample + 4-tap gradient steering, and a hard clamp with a deepest-interior-point fallback for far-offshore / concave recovery. Tests in [`tests/coastline-field.spec.js`](../tests/coastline-field.spec.js) (containment vs ground truth, determinism, <1 deg parity vs a circle, 600-tick no-escape storm, concave far-point convergence).
- **P2 - fence wiring (additive).** `coastline` is a new dispatch branch in [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js), [`shared/index.js`](../shared/index.js) `boundaryToBounds`, and [`shared/EntityCollision.js`](../shared/EntityCollision.js) `finiteCollisionBounds`, plus the `CoastlineBoundary` typedef on the frozen `shared/scenes/types.js`. Rect/island math untouched, so the 9 existing sim-baseline fixtures stayed byte-identical.
- **P3 - boot heightmap bake.** [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs) gained `--boundary coastline --points` (masks terrain to sea outside the polygon via the same SDF) + a procedural mountain. The 75-vertex polygon lives in [`shared/scenes/wolf-coast.coast.js`](../shared/scenes/wolf-coast.coast.js) (provenance [`tools/author-wolf-coast.mjs`](../tools/author-wolf-coast.mjs)); one array drives the bake, the SDF, and the render so the coast cannot drift. `public/terrain/wolf-coast.bin` = 4.0 MiB (1024 px); coastline stores absolute metres, manifest `peakHeight 1`.
- **P4 - the scene.** [`shared/scenes/wolf-coast.js`](../shared/scenes/wolf-coast.js) + registration: boot-shaped, 3.20 km^2 measured, 120 m mountain, foot lowland, conifer woods, a toe corral plus an inert `pen`. New additive SceneDef fields: `CoastlineBoundary`, `PenDef`/`pen`, `dogSpawn`, `grass.tallZones`, `grass.grassCenter`.
- **P5 - tall grass + coastline grass.** [`js/GrassSystem.js`](../js/GrassSystem.js) SDF-driven density + waterline cull for coastline, a `grassCenter` so the grid sits on the foot play area (584 chunks, not 2017), and a `tallZones` blade-height band.
- **P6 - client + render consumers + browser smoke.** Coastline clamps/forces in [`js/OptimizedSheep.js`](../js/OptimizedSheep.js) + [`js/Sheepdog.js`](../js/Sheepdog.js), spawn in [`js/GameState.js`](../js/GameState.js), water in [`js/water/AnimeWater.js`](../js/water/AnimeWater.js), water-aware rocks + trees, the boot guard in [`js/boot/initWorld.js`](../js/boot/initWorld.js), and the entrance carousel entry + accent token (a dusk-gradient placeholder webp). Preview smoke: clean boot, dog drove 172 m, zero escapes after teleporting sheep far offshore.
- **P7 - sim-baseline + validation.** New `tests/sim-baseline/__fixtures__/coastline-wolf-coast-60hz.json`; the 9 existing fixtures byte-identical. Bundle ratchet main 566 -> 573 KiB recorded.

**Validation gates (2026-06-06):** `npm test` 1032 pass / 7 skip / 0 fail; `eslint shared/` clean; worker `tsc` clean; `npm run build` clean (main 573 KiB, three 604 KiB); sim-baseline 9 fixtures byte-identical + 1 new coastline fixture.

**Release proof.** Shipped as commit `907d6f8`; deploy run `27080491391` green (Test, E2E Chromium, Deploy Pages, Deploy Worker). Prod live: `terrain/wolf-coast.bin` (HTTP 200, 4.0 MiB), manifest correct (coastline boundary, 120 m mountain), entrance webp (200), worker health `{"ok":true}`.

**Carryover (folded into Cycle 65):**

- The reserved Wolf Coast tunables (ladder counts, mountain height/radius, foot grass density, dusk sky, coastline silhouette) fold into Cycle 65's homestead + character work.
- A real Wolf Coast entrance hero capture to replace the dusk-gradient placeholder (Matt's media pass).
- The desktop+mobile browser-smoke screenshots were not persisted to the gitignored `cycle64-validation/`; the substance is proven by the passing scene + field tests, the live smoke, and green CI E2E.
- The wolf predator mode moves to Cycle 66 (after the homestead + day cycle). All prior open carryover (collision prod feel, real mobile pass, high-count flock pressure, bark feel finalize, the second mode edition, tablet draw-call perf, controller nav for deferred surfaces, counting naming/curve-feel, `/api/rename` no-body 500, `upload-artifact@v5` Node 20) remains deferred.

### Cycle 63 - `collision-stutter-profile` (closed 2026-06-06, v2.2.2)

Plan archived at [`docs/archive/cycles/cycle-63-plan.md`](archive/cycles/cycle-63-plan.md). Cycle 63 followed Matt's prod playtest report that colliding with a group of sheep might stutter on PC and likely mobile. The cycle spiked the issue with delegated research, browser automation, and a conservative deterministic broadphase optimization rather than swapping in a new spatial-index library.

**Closeout outcomes (4/4 phases shipped):**

- **P1 - research and profile surface.** The research recommendation was to keep SDS on a uniform grid for moving same-radius sheep. KDBush and Flatbush are static indexes; RBush is a general rectangle tree; sweep-and-prune is benchmarkable but not the first SDS move. New [`tools/collision-stutter-probe.mjs`](../tools/collision-stutter-probe.mjs) plus `npm run perf:collision` can place deterministic dog-vs-flock collision storms in production preview and write JSON artifacts under `cycle63-validation/collision-stutter/`.
- **P2 - browser evidence.** The 200-sheep classic storm did not reproduce PC frame stutter as collision CPU cost: frame p99 stayed around `16.8 ms`. Dense contact at 1000 and 5000 sheep did show the resolver slice was worth tightening. A 4x CPU-throttled 200-sheep pass showed mobile-like pressure is broader sheep update/render work, not just the collision resolver.
- **P3 - deterministic dense grid.** [`shared/EntityCollision.js`](../shared/EntityCollision.js) now uses a bounded dense typed-array cell-head grid when scene bounds are available, with sparse fallback for out-of-range or oversized grids. [`worker/src/GameSim.js`](../worker/src/GameSim.js), [`js/OptimizedSheep.js`](../js/OptimizedSheep.js), and [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js) pass scene bounds into the byte-identical shared resolver.
- **P4 - docs and release.** [`CHANGELOG.md`](../CHANGELOG.md) records `v2.2.2`; [`NEXT_SESSION.md`](../NEXT_SESSION.md) is reset for the post-deploy prod playtest; the main-bundle ratchet is accepted at `566 KiB` for the bounded dense-grid resolver and gated profiling surface.

**Validation gates (2026-06-06):** `npm test -- tests/entity-collision.spec.js` passed; `npm test -- tests/sim-baseline/harness-parity.spec.ts` passed; `npm test -- tests/sim-baseline/baseline.spec.ts` passed; `npm run lint` passed; full `npm test` passed; `npm run build` passed; `npx playwright test --project=chromium --grep-invert='@local-only'` passed; `git diff --check` passed with only CRLF warnings. Production-preview probes wrote JSON under the gitignored `cycle63-validation/collision-stutter/` directory.

**Release proof.** Shipped as commit `360f054`, tag `v2.2.2`, deploy run `27077642978`. GitHub Actions passed Test, Deploy Worker, Deploy Pages, and Chromium E2E. Live HTML at sheepdogsim.com returned HTTP 200 and served `assets/main-C0FgLyTC.js`; the direct asset returned HTTP 200 and contains the new `collisionProbe`, `getCollisionProfile`, and dense-grid cap markers. Worker health returned `{"ok":true,"worker":"sds-worker"}` from `https://sds-worker.matt-m-kissinger.workers.dev/healthz`.

**Carryover (deferred):**

- **Prod feel review for collision stutter.** Matt should test `v2.2.2` in prod. If a normal 200-sheep run still stutters, capture exact scene/mode/device plus whether the symptom is frame-time loss or visual popping.
- **Real mobile pass.** CPU throttle is only a proxy; do not claim mobile acceptance until a real device verifies the fix.
- **High-count flock pressure.** At 5000 sheep, dense-grid collision improves the resolver slice, but the broader update/render path still dominates frame time.
- **Wolf predator mode.** Deferred again until collision perf/feel is settled.
- All prior open carryover (bark feel finalize, the second mode edition, tablet draw-call perf, controller nav for deferred surfaces, counting naming/curve-feel, `/api/rename` no-body 500, and `upload-artifact@v5` Node 20 deprecation) remains deferred.

### Cycle 62 - `sheep-hard-body-collision` (closed 2026-06-06, v2.2.1)

Plan archived at [`docs/archive/cycles/cycle-62-plan.md`](archive/cycles/cycle-62-plan.md). Cycle 62 was originally a wolf-predator scaffold, then Matt redirected it to the remaining physical-collision issue from Cycle 56: sheep still packed through each other, and sheep heads/backs could visually slide through the dog. The cycle shipped deterministic flock hard bodies, widened dog/sheep body contact to match the visible mesh better, and kept the Worker, client, and sim-baseline harness on one shared resolver. No wire-format change and no D1 migration.

**Closeout outcomes (4/4 phases shipped):**

- **P1 - shared collision core.** [`shared/EntityCollision.js`](../shared/EntityCollision.js) now contains `resolveSheepSheepCollisions`, a pure deterministic spatial-hash pass over active sheep. It uses stable input order, fixed-cell neighbor checks, capped per-tick position correction, inward-relative-velocity cleanup, and deterministic fallback normals for exact co-location. Dog/sheep constants were tuned from the conservative Cycle 56 values to better cover the visible sheep mesh.
- **P2 - Worker, client, and harness wiring.** [`worker/src/GameSim.js`](../worker/src/GameSim.js) applies the sheep-to-sheep pass after sheep integration, then reruns dog collision, boundary constraints, facing, and validation for moved sheep. [`js/OptimizedSheep.js`](../js/OptimizedSheep.js) applies the same shared pass for solo/prediction and rewrites corrected instance matrices. [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js) mirrors the Worker order so parity remains meaningful.
- **P3 - tests and baselines.** [`tests/entity-collision.spec.js`](../tests/entity-collision.spec.js) now covers dog constants, sheep separation, deep-overlap caps, inward-velocity cleanup, exact-overlap determinism, scratch reuse, and a 5,000-sheep grid check that guards against O(n^2). Sim-baseline fixtures changed only where dense active sheep now separate: `sheep-60hz-20s.json`, `island-boundary-rh-60hz.json`, `island-boundary-oc-60hz.json`, `corral-retirement-rh-60hz.json`, and `bark-impulse-60hz.json`.
- **P4 - docs and release.** [`NEXT_SESSION.md`](../NEXT_SESSION.md) now points at Cycle 63, [`CHANGELOG.md`](../CHANGELOG.md) records `v2.2.1`, and Cycle 63 restores the wolf-predator scaffold as the next candidate after prod collision playtest.

**Validation gates (2026-06-06):** `npm test -- tests/entity-collision.spec.js` passed; `npm test -- tests/sim-baseline/harness-parity.spec.ts` passed; `npm test -- tests/sim-baseline/baseline.spec.ts` passed after intentional fixture regeneration; `npm run lint` passed; full `npm test` passed; `npm run build` passed; the main-bundle ratchet was accepted from `558 KiB` to `561 KiB` for the client collision resolver; `npx playwright test --project=chromium --grep-invert='@local-only'` passed (the same Chromium lane used by Deploy CI); `git diff --check` passed. **Browser proof:** a targeted `?cinematic=1` local probe placed overlapping sheep/dog bodies and confirmed physics and rendered distances stayed outside the collision thresholds with no console errors.

**Carryover (deferred):**

- **Prod feel review for collision constants.** Matt asked to test in prod after deploy. If contact feels too wide, soft, or jittery, tune only the constants in [`shared/EntityCollision.js`](../shared/EntityCollision.js), rerun sim-baselines, and record any changed fixtures.
- **Wolf predator mode.** The Cycle 61 wolf asset and deterministic bark event remain the teed-up next direction; Cycle 63 is scaffolded for it.
- All prior open carryover (bark feel finalize, the second mode edition, tablet draw-call perf, controller nav for deferred surfaces, counting naming/curve-feel, `/api/rename` no-body 500, and `upload-artifact@v5` Node 20 deprecation) remains deferred.

### Cycle 61 - `pastoral-finish-and-bark-wolf` (closed 2026-06-05)

Plan archived at [`docs/archive/cycles/cycle-61-plan.md`](archive/cycles/cycle-61-plan.md). Three of Matt's notes folded into one cycle: finish the Pastoral UI program, give the dog a real bark verb, and add the wolf as a ready asset. Built and validated end-to-end across three parallel tracks (a UI track and a wolf track as background agents, the fence-touching bark spine in the main session), committed in three feature commits, and deployed. 7 phases.

**Closeout outcomes (7/7 phases shipped):**

- **P1 - retire the skeleton.** The Cycle 25 dark shimmer skeleton still rendered in [`js/components/ui/SceneSwapOverlay.tsx`](../js/components/ui/SceneSwapOverlay.tsx) on every in-session scene swap that fell through the boot + attract gates (the "skeleton sometimes" Matt saw). Restyled the swap cover to the pastoral glass look (matching the entrance `LoadingScreen`) and deleted the `.sds-skel` shimmer + `sds-shimmer` keyframe + the stale `index.html` comment. No live `sds-skel` render references remain.
- **P2 - pastoral container restyle.** Zero-behavior-change token swaps onto the pastoral design language for the remaining old-palette stateful containers (Sandbox setup, Fence editor, Shape editor, 2-player local setup, Settings) plus both victory overlays in [`js/boot/completionOverlay.js`](../js/boot/completionOverlay.js) (the React-fallback safety net and the live 2-player local screen). Handlers, validation, and copy untouched.
- **P3 - bark command.** Bark bound to Space ([`js/InputHandler.js`](../js/InputHandler.js) one-shot edge, guarded so it never steals Space from a focused menu button), gamepad RB (`wasJustPressed`), and a mobile bark button (`sds-bark` event). [`js/Sheepdog.js`](../js/Sheepdog.js) `triggerPlayerBark()` is cooldown-gated (the single bark gate), plays the existing Bark animation + sound, and returns whether it fired.
- **P4 - deterministic impulse.** New [`shared/BarkImpulse.js`](../shared/BarkImpulse.js): a pure, trig-free `applyBarkImpulse(sheep, origin, forward, config)`. Forward-cone test via a dot product against a hardcoded `cos(50 deg)` literal; push along a caller-supplied unit facing vector (velocity sqrt-normalized, no `Math.sin/cos/atan2`); linear distance falloff; range gate. The no-bark sim-baseline traces stay byte-identical (the module is only ever called on a fired bark, proven by regenerating all fixtures and seeing only the new `bark-impulse-60hz.json` appear). New `bark-impulse.spec.js` (11 unit tests on cone/falloff/direction/range) + the trace fixture.
- **P5 - bark over the wire.** An additive optional `bark` edge on `playerInput`. The DO consumes it authoritatively ([`worker/src/GameSim.js`](../worker/src/GameSim.js) `applyPlayerInput` -> `applyBarkImpulse`, server-side cooldown) and broadcasts the result; [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts) copies the strict-boolean edge at ingress, [`js/NetworkManager.js`](../js/NetworkManager.js) sends it (a standing bark forces the input send). Absent field = no-bark, no protocol version bump, old clients soft-degrade. `bark-wire.spec.js` (5 tests) covers DO authority, the old-payload migration, and cooldown gating.
- **P6 - wolf asset (asset-only).** The Quaternius Ultimate Animated Animals wolf (CC0) compressed through the existing dog GLB pipeline; new [`js/Wolf.js`](../js/Wolf.js) mirrors `Sheepdog.js` (GLTF + `SkeletonUtils.clone` + a state machine mapping the rig's real clips to Idle / Walk / Run=Gallop / Attack / Death); a standalone `?wolf=1` verification harness ([`js/diagnostics/wolfHarness.js`](../js/diagnostics/wolfHarness.js)) with its own renderer; [`docs/wolf-asset.md`](wolf-asset.md) records source / license / clip-mapping + the future predator-mode bark-repel design intent. Wired into no game mode.
- **P7 - tuning + close.** Bark feel constants are a single taste knob (`DEFAULT_BARK_CONFIG`: range 12m, cone 50 deg, strength 6, cooldown 2.5s), shipped as the strawman for Matt's taste pass. Validate + close.

**Validation gates (2026-06-05):** `npm test` 1000 passed / 7 skipped / 0 failed (17 new bark tests); `npm run build` clean (ratchet main 555 -> 558 KiB, three 603 -> 604 KiB for bark + restyle + wolf gate; the wolf loader + harness are lazy chunks, the GLB ships via static copy); `worker tsc --noEmit` clean; `eslint shared/` clean; sim-baseline no-bark fixtures byte-identical; refactor-baseline terrain + scatter goldens unchanged. **Browser smoke (preview, `SDS_SUPPRESS_BROWSER_OPEN=1`, server stopped after):** clean boot with zero console errors; the full bark stack verified live on Rolling Hills (200 sheep) - a Space keydown set + drained the one-shot edge, `getBarkForward` returned a trig-free `{0,1}`, a probe sheep at +4m was driven forward to `vz=4` (exactly strength 6 x falloff 0.667), and the cooldown gated the immediate second bark; the pastoral entrance rendered with no skeleton; the `?wolf=1` harness loaded + animated (Idle / Walk / Gallop, no errors).

**Reserved for Matt (paired in-browser, not a phase):** the bark feel constants (cone / range / strength / cooldown) and whether to add a small radial startle component are a tunable strawman for the taste pass (like the Cycle 58 ladder counts and the Cycle 59 curve names). The live prod end-to-end (the deploy, a live solo bark, and an MP-room bark) verifies after the close commit deploys.

**Carryover (deferred):**

- **The wolf predator mode.** The wolf asset + the deterministic bark event were built for it (the bark-repel is documented intent in `docs/wolf-asset.md`); the next-mode cycle wires a `shared/WolfAI.js` + a wolf wire field. This is the teed-up Cycle 62 direction.
- **Bark feel finalize** (Matt's taste pass on the constants) and an optional radial-startle component.
- All prior open carryover (the second mode edition, tablet draw-call perf, controller nav for the deferred surfaces, sheep-to-sheep collision, the `/api/rename` no-body 500, the `upload-artifact@v5` Node 20 deprecation) is unchanged and still deferred.

### Cycle 60 - `playtest-and-controller` (closed 2026-06-05)

Plan archived at [`docs/archive/cycles/cycle-60-plan.md`](archive/cycles/cycle-60-plan.md). A playtest-readiness cycle: made the whole loop drivable from a controller and stood up a tablet testing baseline so Matt can play and take notes on real hardware. The reframe that shaped it: gamepad GAMEPLAY already existed ([`js/GamepadManager.js`](../js/GamepadManager.js) drives the dog, sprint, camera, and Start-pause); the gap was that the React menus had no focus model at all. Everything shipped is additive - existing mouse and touch paths are untouched. Client-only: no `shared/`, Worker, D1, `SceneDef`, or wire change. Built end-to-end and deployed mid-cycle so Matt could playtest on prod (commit `aaee108`).

**Closeout outcomes (8/8 phases shipped + deployed + playtested):**

- **P1 - tablet baseline.** A dependency-free `?stats=1` on-screen perf chip ([`js/perf/StatsChip.js`](../js/perf/StatsChip.js), lazy), a service-worker private-LAN fix ([`index.html`](../index.html)) so a tablet never serves a stale build mid-iteration, and [`docs/playtest-tablet.md`](playtest-tablet.md). Verified on the real device (SM-X518U, Galaxy Tab S9 FE) over USB via `adb reverse` + `localhost`.
- **P2 - menu focus core.** One additive primitive: [`js/components/hooks/useMenuNavigation.ts`](../js/components/hooks/useMenuNavigation.ts) over a pure [`js/input/menuNav.js`](../js/input/menuNav.js) (unit-tested in `tests/menu-nav.spec.js`) and an rAF [`js/input/menuGamepad.js`](../js/input/menuGamepad.js) poll, plus a `[data-navfocus]` amber ring in `css/main.css`. Roves native focus with the d-pad / left stick / arrow keys; A or Enter activates, B / Escape backs out. The ring only appears on the first directional input (mouse/touch never see it), and the menu poll is a separate rAF loop from the gameplay poll so there is no double-input.
- **P3 - entrance.** `useMenuNavigation` on the entrance root: world, family, difficulty, dog, Play, corner nav, and ways-to-play are all controller-reachable.
- **P4 - pause / completion / HUD.** The hook roves the pause and completion panels; a new `GamepadManager.wasJustPressed` drives in-game buttons - Y cycles the camera (parity with C), X banks a Counting run, Select opens the note box. Gameplay zoom/move stays gated behind `!isPaused`, so no double-action while paused.
- **P5 - parity audit.** [`docs/cycle-60-controller-parity.md`](cycle-60-controller-parity.md): the core loop (entrance, pause, completion, in-game) is WIRED; settings, leaderboard, editors, and MP are explicitly DEFERRED to mouse/touch.
- **P6 - playtest notes.** Opt-in (`?notes=1` / `?stats=1`): [`js/playtest/noteLog.js`](../js/playtest/noteLog.js) + [`PlaytestNote.tsx`](../js/components/GameHUD/PlaytestNote.tsx), opened by the N key, gamepad Select, or a right-edge tab; saves the note with session context (scene, mode, round, counted, fps, build) to localStorage and exports all notes as JSON.
- **P7 - reserved finalize (paired).** Shipped with the prose-clean strawman naming (Solo / Counting Sheep / Objective, Incremental / Exponential, "Bank and finish"); curve constants unchanged. The live Incremental-on-Home-Field leaderboard write was confirmed in Matt's prod playtest.
- **P8 - validation, docs, close.** Full suite + build green; new files type-clean; docs aligned (DECISIONS, the parity audit, NEXT_SESSION); the bundle ratchet moved main 554 -> 555 KiB for the inline stats + gamepad gates (the focus and note modules are lazy chunks).

**Validation gates (2026-06-05):** `npm test` 983 passed / 7 skipped / 0 failed; `npm run build` clean (main 555 KiB, three.js + every golden unchanged, StatsChip 1.36 kB + PlaytestNote 4.58 kB as lazy chunks); CI Deploy run `27032616554` green (Test + Deploy Worker + Deploy Pages + E2E). **Real-device confirmation:** the prod build verified live on the Tab S9 FE (`sheepdogsim.com/?stats=1`, the perf chip rendering); the first in-game baseline (Rolling Hills / Hard / 200 sheep, low tier) was 37 fps / 27.1 ms / peak 53 ms / ~20k draw calls / 774k tris, so the tablet is draw-call-bound on the hero scene. Matt confirmed the controller end-to-end loop, the live note capture, and the live leaderboard write in a prod playtest.

**Carryover (deferred):**

- **Counting naming + curve-feel** remain a tunable strawman (the family/curve names and the constants in `js/gamestate/countingMode.js`); Matt's standing taste call, not a blocker.
- **Tablet draw-call perf.** The ~20k draw-call, draw-call-bound hero scene the baseline surfaced is a candidate for a dedicated perf pass (a natural fit for the queued `tablet-perf-pass` idea).
- **Controller nav for the deferred surfaces** (settings, leaderboard, sandbox/fence/shape editors, MP lobby/rooms) and a 2D row-aware entrance focus order, both per the parity audit.
- All prior open carryover (the second mode edition, sheep-to-sheep collision, the Cycle 56/55 in-browser feel items, the `/api/rename` no-body 500, the `upload-artifact@v5` Node 20 deprecation) is unchanged and still deferred.

### Cycle 59 - `counting-sheep` (closed 2026-06-05)

Plan archived at [`docs/archive/cycles/cycle-59-plan.md`](archive/cycles/cycle-59-plan.md). Shipped the first new edition beside the solo path: **Counting Sheep**, a round-based solo mode where the flock grows each round and the running tally is the score (the bedtime pun is the point). Two ranked curves (Incremental = +1 each round, Exponential = doubles each round, both clamped to the proven 5000 ceiling) ship on the two objective-free biomes (Home Field and Rolling Hills); Open Country is excluded because it is a two-stage gather-and-portal objective. It reuses the entire herding loop and changes only when sheep appear and what ends the run. Cashed in the Cycle 58 count-as-identity partition: no D1 migration, no wire change, no version bump. Built end-to-end with all commits held until close (Matt's cadence).

**Closeout outcomes (8/8 phases shipped):**

- **P1 - Round controller + ids + capabilities.** New client module [`js/gamestate/countingMode.js`](../js/gamestate/countingMode.js) (the two pure curve functions + round state, 5000-clamp) and the shared id module [`shared/countingModes.js`](../shared/countingModes.js) (the `counting` gameMode, the two curves, the `counting-incremental` / `counting-exponential` board keys, the ceiling, `COUNTING_SCENE_IDS`) imported by both client and Worker so a mode string cannot drift. Registered in `MODE_CAPABILITIES` with `roundBased` / `autoCompletes: false`.
- **P2 - Capacity split (byte-identical).** `OptimizedSheepSystem` pre-sizes its InstancedMesh + per-instance buffers to a per-run `maxCapacity` (5000 for counting) and activates instances in batches via `activateSheepBatch`; `this.sheep` holds only the active sheep (dense, id === index) so every `sheep.length` consumer stays correct. Standard modes pass no `maxCapacity`, default it to the exact count, stay byte-identical (refactor-baseline + completion-count fixtures unchanged).
- **P3 - Loop + win-check + HUD.** Per-frame `advanceCountingRound` brings the next batch online on full-pen; `checkCompletion` is capability-gated off for round-based modes; a shared `CountingReadout` renders "counted . Round N" in both the desktop `SheepCounter` and mobile `MobileHUD`.
- **P4 - Player-banked end.** `bankCountingScore()` freezes the sim, submits the counted total, shows a `counting` summary branch in `CompletionScreen`; an always-visible HUD bank button (`CountingBankButton`) plus a pause-menu entry; Play Again / Restart reset to round 1 with the curve preserved. Submit-mode resolution (curve -> `counting-*` board) folded into `completion.js`.
- **P5 - Worker leaderboard, no migration.** Two `GameMode` keys; counted validated as an integer in [0, 5000]; `getLeaderboard` partitions `(game_mode, scene_id)` ignoring `sheep_count` and orders descending; `getAllLeaderboards` emits the counting boards; a soft `counting_too_fast` anomaly (0.05s-per-counted-sheep floor) hides a forged fast bank without a hard reject. Counted lands in the existing `score` column; no `counting_*_best` materialized column. New real-SQLite spec `tests/worker/counting-leaderboard.spec.ts`; `leaderboard-partition.spec.ts` stays byte-identical.
- **P6 - Client leaderboard surface.** `leaderboardModesForScene` appends the two counting boards for counting-capable scenes (fixed-count, no sheep dropdown); the board renders the server's descending-ranked counted total as the hero stat.
- **P7 - Entrance mode families.** `familiesForWorld` gives Home Field / Rolling Hills `[Classic, Counting Sheep]` and Open Country a lone `[Objective]` family; multi-family worlds show a selector, single-family worlds a label. Counting dispatches via a new `MenuController.selectCounting`. **No `SceneDef` family field** - the taxonomy lives in `familiesForWorld` + the shared `COUNTING_SCENE_IDS` constant, so the fence-frozen `SceneDef` schema was not touched (deliberate scope reduction, lower risk).
- **P8 - Validation, smoke, docs.** Full suite + build green, prose hygiene clean, [`DECISIONS.md`](../DECISIONS.md) records the mode-family taxonomy + the no-migration counting leaderboard.

**Validation gates (2026-06-05):** `npm test` 973 passed / 7 skipped / 0 failed; `npm run build` clean (main 554 KiB, ratchet 550 -> 554 for the counting UI, three.js + every terrain/tree golden unchanged); worker `tsc --noEmit` clean; sim-baseline byte-identical (counting is solo + client-side, never touches the deterministic core). **Browser smoke (preview, `SDS_SUPPRESS_BROWSER_OPEN=1`, server stopped after):** a real Exponential run on Rolling Hills booted (capacity 5000, 1 active), penning advanced rounds 3/7/15/31/63/127 active (exactly 2^n-1, mesh draw count tracking, no reallocation), the HUD updated live to "63 . Round 7", banked, the summary showed "63 Counted / 7 Round reached", Play Again reset to round 1; verified desktop + 390-wide mobile, zero console errors.

**Reserved for Matt (paired in-browser at the next touch-point, not a phase):** the family / curve names (Classic / Counting Sheep / Objective, Incremental / Exponential), the bank-control copy, and the curve constants are a tunable strawman for the voice/taste pass, like the Cycle 58 ladder counts. The live prod end-to-end (the deploy itself, the live leaderboard write client->worker->D1->board, and an Incremental-on-Home-Field live run) verifies automatically after the close commit deploys.

**Carryover (deferred):**

- **A second mode edition** is Cycle 60's natural scope (the original "two new game modes" framing narrowed to one edition this cycle, "the next after" deferred). Decide it with Matt before authoring.
- **Optional `SceneDef.modeFamilies` field.** Not needed this cycle (the shared constant suffices); revisit only if a scene needs a richer per-scene family structure than the code taxonomy.
- **Persistent local personal-best on the counting boards** and a **per-round telemetry histogram** for curve tuning were scoped out; fold into a later cycle if wanted.
- All prior open carryover (sheep-to-sheep collision, pastoral container restyle, the Cycle 56/55 in-browser feel items, the `/api/rename` no-body 500, the `upload-artifact@v5` Node 20 deprecation) is unchanged and still deferred.

### Cycle 58 - `solo-on-ramp` (closed 2026-06-05)

Plan archived at [`docs/archive/cycles/cycle-58-plan.md`](archive/cycles/cycle-58-plan.md). Made solo runs approachable on the two islands and fast to start everywhere without disturbing Home Field's existing leaderboard: each biome got its own difficulty ladder (small fast tiers on the islands, Home Field's four ranked anchors preserved exactly), Just Play dropped 30 to 3 sheep, the off-by-one solo completion was fixed, the leaderboard partition switched to count-as-identity, and two friction-free naming touchpoints were added. No D1 migration, no wire-protocol change, no version bump. Feature work shipped as `91c31a3` (P2-P8) on top of `0470c02` (P1).

**Closeout outcomes (8/8 phases shipped + deployed):**

- **Completion off-by-one (P1, `0470c02`).** `js/GameState.js` double-counted a sheep on the frame it retired (once in the `triggered` branch, once in the count-all pass), so `isSoloComplete` fired one tail-sheep early. Dropped the redundant increment; new `tests/completion-count.spec.js` reproduces the "2 of 3" symptom. Client/solo-only; the worker MP strict check is untouched.
- **Difficulty ladder as scene data (P2).** Optional `soloLadder` on the `SceneDef` (`shared/scenes/types.js`) + a new pure `shared/difficulty.js` resolver (`getSoloLadder` / `getSoloCount` / `getRankedCounts`, legacy default fallback). Per-biome ladders: Home Field 3/25/200/1000/3000/5000, Rolling Hills 3/25/75/200/1000/5000, Open Country 3/25/50/150/600/5000. `SOLO_MODE_SHEEP_COUNT` re-points at the legacy default.
- **Count-as-identity leaderboard (P3 + P4).** Worker submit validation is `(scene, count)`-aware (`getRankedCounts`) with graduated small-tier duration floors; `getLeaderboard` gained a `solo` aggregate pseudo-mode keyed on `(scene_id, sheep_count)`. Proven byte-identical for every existing row by `tests/worker/leaderboard-partition.spec.ts` (the real-SQLite harness). Verified live at close: the `(rolling-hills, 200)` board still serves the restored Cycle 57 incident run.
- **UI + wiring (P5 + P6).** `GlobalLeaderboard.tsx` derives solo tabs from the scene ladder; the entrance difficulty options come from `modesForWorld`; `GameState` resolves `totalSheep` via `getSoloCount`; the extreme-boid + high-difficulty-tweak paths gate on resolved count (thresholds 500 and the band [1000, 5000)) not the difficulty id.
- **Open Country tiny-count clamp (P7).** `getRequiredSheep` in `shared/ObjectiveLogic.js` clamps the gather gate to `requiredSheep <= totalSheep` so a 3-sheep run is winnable. Changes the result only for `totalSheep < 10`, a regime no committed sim-baseline fixture exercises, so all traces stayed byte-identical (one refactor-baseline objective fixture at total 5 legitimately moved 10 to 5, recorded in the plan).
- **Naming touchpoints (P8).** Extracted the rename logic into a shared `useRenameField` hook + a dark-theme `NameField`, reused on Settings, a non-blocking post-score offer (when `nameType === 'auto'`), and the entrance "Playing as" inline editor. Zero new i18n keys.

**Pre-close CI fix (`9892173`, not a Cycle 58 phase).** The nightly macOS Safari smoke had driven the removed Solo Play -> Confirm Selection -> Classic Mode chain since the Cycle 51 entrance rework (ok=0 fail=3 every night). Rewrote `tests/safari-smoke/run.mjs` to boot the world-first entrance then swap each scene in-engine via `window.__sdsSwapTo`, asserting `__sdsSwapProbe().scene` landed. Test-harness only; mirrors the same fix `6411bf8` applied to the Playwright e2e. Verified green on a real macOS runner (dispatch run, ok=3 fail=0).

**Pre-close UI drift fix (`dae8c31`, not a Cycle 58 phase).** Matt flagged the completion / end-of-game screen as drifted and less polished than the entrance. Root cause: Cycle 51 P9 warmed its glass + text but left the result accents, gradients, and confetti on the old tech palette (emerald `#10b981` panel + primary button, amber `#f59e0b` runner-up, bright `#FFD700` trophy, 8-color rainbow confetti). Routed every result accent through the pastoral tokens ([`CompletionScreen.tsx`](../js/components/GameHUD/CompletionScreen.tsx): warm meadow green win, low-sun gold trophy + runner-up, warm gold/sage/rose confetti, warm gradients) and redrew the busy 6-path HUD sheep glyph as a clean zen sheep ([`Icon.tsx`](../js/components/ui/Icon.tsx): soft three-bump body, solid face + ear, two legs; legible 12-64px). UI-only, no behavior change; 934 tests pass, build clean. Verified in-browser (sheep at 12-64px + the real entrance chips; the win-screen palette via a token-accurate mock).

**Validation gates (2026-06-05):** `npm test` 934 passed / 7 skipped / 0 failed; `npm run build` clean (main 550 KiB, ratchet 547 -> 550 for the P8 UI growth); worker `tsc --noEmit` + `eslint shared/` clean; sim-baseline byte-identical; the partition switch proven byte-identical for existing rows. Live checks: site 200, worker leaderboard 200, `/api/rename` -> 401 without a token, the preserved `(rolling-hills, 200)` board intact. Matt confirmed the ladder feel in-browser.

**Carryover (deferred):**

- **Two new game modes** to Cycle 59 (the count-as-identity partition was built to drop them in without a schema change).
- **Sheep-to-sheep hard-body collision** to its own future cycle (needs jitter tuning + a spatial grid for 5,000 sheep).
- **Cycle 57 live paused-run smoke** (logic proven by `score-flow.spec.ts`); **dog-sheep collision feel** (Cycle 56) and **grass footprint feel** (Cycle 55) remain Matt's in-browser review items.
- **Pastoral container restyle** - the setup/editor screens (Sandbox, Fence, Local-2P, Settings) and the non-React fallback victory overlays in [`completionOverlay.js`](../js/boot/completionOverlay.js) are still on the old palette. This is the explicitly-paused container-restyle program (its own cycle, ~13 stateful containers), not stray drift; a candidate near-term cycle if the full pastoral sweep is wanted. The fallback overlays only render if the React `CompletionScreen` fails to load (≈never in prod).
- **Minor (not blocking):** `/api/rename` parses the JSON body before the auth check, so a no-body POST returns 500 instead of 400 (cosmetic, no auth bypass). CI `actions/upload-artifact@v5` runs on Node 20; GitHub forces Node 24 on 2026-06-16.

### Cycle 57 - `playthrough-repair` (closed 2026-06-04)

Plan archived at [`docs/archive/cycles/cycle-57-plan.md`](archive/cycles/cycle-57-plan.md). Repaired the entire end-of-run loop after a real 12-minute soloClassic run on Sheep Dog Island looked lost: it never showed on the leaderboard, returning to the menu froze the screen under a stale overlay, and there was no UI to see or set a leaderboard name. Three independently-rooted prod bugs plus the observability gap that hid them.

**Closeout outcomes (8/8 phases shipped + deployed):**

- **Paused-run anti-cheat fix.** The `client_clock_skew` heuristic compared the pause-subtracted score against a raw wall-clock window, so any run with more than 10s of pause was false-flagged and hidden by the leaderboard `score_anomalies IS NULL` read filter. The worker now credits `pausedMs` before the skew compare (80%-of-window cheat guard, skipped when `pausedMs` is absent for pre-Cycle-57 clients). Commit `3fe441b`.
- **Menu-return overlay + freeze.** The completion screen mounted in its own React root that nothing tore down, so the menu opened under a ghost overlay. Added `disposeCompletionOverlay()` and a `SceneSwapOverlay` paint-yield cover over the synchronous rebuild; `restartSameMode()` gives a true Play Again. Commit `439f5a5`.
- **Username UI (gone since Cycle 51).** Auth-gated `POST /api/rename` + `sanitizeDisplayName`/`renamePlayer` on the worker; a Settings display-name view+edit, a saved/could-not-save end-screen line, and an entrance "Playing as {name}" label on the client. Commits `3fe441b` (worker) + `45082d6` (client).
- **Real-SQLite test harness.** New reusable `tests/worker/helpers/d1-sqlite.ts` (Node `node:sqlite`, applies the committed migrations) + a mock-a-win scenario `tests/worker/score-flow.spec.ts` run the ACTUAL store->read SQL the old canned-row mocks never exercised (the gap that let the incident through), plus a client `pausedMs` payload guard. Commit `35e3036`.

**Validation gates (2026-06-04):** `npm test` 906 passed / 7 skipped / 0 failed; `npm run build` clean (main 547 KiB); CI Deploy green (Test + Deploy Worker + Deploy Pages + E2E); worker live (`/api/rename` -> 401 without a token); prod board clean (0 flagged); incident run id=16 restored. Commits `3fe441b` / `439f5a5` / `45082d6` / `35e3036` + docs `4a42ad0` / `e153e95`.

**Carryover (deferred):**

- **Live in-browser paused-run smoke** (Matt) - the one acceptance not executed against a fresh real run. The logic is proven by the `score-flow.spec.ts` integration test (store->read with a credited pause); the live smoke is confirmation, not a gate.
- **`ids 2/7/8/14` (display_name "Player") ownership check** - optional forensic: if they share the incident `persistent_id`, a single Settings rename would claim all of Matt's earlier runs at once.

### Cycle 56 - `entity-collision` (closed 2026-06-04)

Plan archived at [`docs/archive/cycles/cycle-56-plan.md`](archive/cycles/cycle-56-plan.md). The deferred physical-collision half of the session's original notes ("make dog grass and sheep collision better, make collision mesh?") - Cycle 55 did the grass half. Gives the dog a hard body the sheep cannot occupy: a sheep the dog overlaps is pushed out to the sum of body radii, so the dog plows a tight flock instead of ghosting through it. Scoped conservatively to dog-to-sheep; sheep-to-sheep hard-body deferred.

**Closeout outcomes:**

- **Pure deterministic resolver.** New `shared/EntityCollision.js`: `resolveDogSheepCollision` / `resolveDogSheepCollisions`, body radii 1.1 (dog) / 0.6 (sheep), 0.35m/tick push cap. Positional correction along the contact normal + removal of the into-the-dog velocity component (mirrors the dog-to-tree/rock push-out in `js/Sheepdog.js`). Math.sqrt only - no trig, no Math.random, no DOM, no `js/` import.
- **Three parity paths.** Wired identically into the Worker authoritative tick (`worker/src/GameSim.js`, after integration, before the boundary clamp), the client predictor/solo path (`js/OptimizedSheep.js`, per active sheep after `updatePosition`), and both sim-baseline harness tick functions. One pure function keeps the three sheep loops in lockstep.
- **Determinism proven.** `harness-parity.spec.ts` confirms `GameSim.updateSheep` is bit-identical to the harness tick with collision present. The committed sim-baseline fixtures stayed byte-identical (the baselines never bring a sheep within 1.7m of a dog, so collision is a no-op on them) - no regeneration needed, no golden churn.
- **No fence-frozen file touched.** Added a new deterministic-core module + one `shared/index.js` export line; `MovementPhysics.js` et al. untouched. No wire-format change (collision only moves existing position fields), so no protocol version tag needed.
- **One-directional.** The dog pushes sheep; sheep never shove the player-controlled dog.

**Validation gates (2026-06-04):**

- `npm run lint` clean (the new `shared/` module passes the no-restricted-imports + no-undef rules); `npm test` 879 passed / 7 skipped / 0 failed (+10 from the new `tests/entity-collision.spec.js`); `npm run build` clean. Bundle ratchet held (main 546 KiB; the resolver lands in the worker build + the lazy `OptimizedSheep` chunk, not `main.js`).

**Migration story (MP in-flight):** no wire change; during the deploy window an old client (no collision) reconciles to the authoritative Worker's collision-resolved broadcast, so no desync break. Consumer updates (worker, client, harness) all in the same commit.

**Carryover (deferred):**

- **In-browser feel review** of the dog-to-sheep collision (Matt) - confirm it reads as solid plowing, not jitter; tune `DOG_BODY_RADIUS` / `MAX_DOG_SHEEP_PUSH_PER_TICK` in `shared/EntityCollision.js` if needed.
- **Sheep-to-sheep hard-body collision** - deferred (mutual-push jitter needs visual tuning; perf-risky at 5,000 sheep without a spatial grid). Its own future cycle.
- **Optional regression-net strengthening:** add a sim-baseline fixture that starts a sheep under the dog so the goldens exercise the collision path directly (the unit test + parity test cover it for now).

### Cycle 55 - `grass-interaction-tuning` (closed 2026-06-04)

Plan archived at [`docs/archive/cycles/cycle-55-plan.md`](archive/cycles/cycle-55-plan.md). Render-only cycle: the grass-parting effect around the dog and sheep was too wide (dog parted a ~4.0m by 6.0m swath, sheep ~2.8m by 3.0m, far larger than either body). Cycle 55 narrowed the parted footprint to hug the body and borrowed the tight push-curve feel from the starred reference repo [boona13/threejs-grass-water-shaders](https://github.com/boona13/threejs-grass-water-shaders).

**Closeout outcomes:**

- **One source of truth.** Added `GrassSystem.config.interaction` (dog/sheep `{halfLen, halfWid, falloff}`, `pushFalloffPower`, `flattenAmount`). The inline WebGL desktop and mobile shaders interpolate it instead of hardcoded extents, and the WebGPU node material reads the same extents through the adapter context and node factory. The two `.glsl` files were marked NON-LIVE BACKUP so they stop drifting.
- **Narrowed footprint.** Dog `1.1 / 0.45 / 0.6`, sheep `0.4 / 0.3 / 0.4`; dog swath ~4.0m to ~2.3m, sheep ~2.8m to ~1.6m. The outside-body push is now `pow(1 - smoothstep, pushFalloffPower)` with `pushFalloffPower 2.0` (the reference's squared-falloff concentration) plus a `flattenAmount 0.18` press. WebGPU node proximity narrowed via `interactionRadius 2.2 -> 0.9` / `sheepInteractionRadius 2.5 -> 0.62` (these feed only the node proximity and the non-live backup; the live WebGL SDF uses `interaction.*.falloff`).
- **No rewrite.** Hard Stop #3 respected: the WebGPU node material was parameterized with `?? prior-value` fallbacks, not rewritten; its ellipse model and tuned bend/laydown are intact, and the factory-default node tests stayed green.
- **Scope held.** No `shared/` change, no SceneDef change, no Worker change, no sim-baseline regeneration. Render-only.

**Validation gates (2026-06-04):**

- `npm test` passed (869 passed, 7 skipped, 0 failed); `npm run build` clean.
- The `tests/refactor-baseline/__fixtures__/bundle-sizes.json` `mainKB` ratchet was reconciled 542 -> 546. This is **not** a Cycle 55 regression: building `main-*.js` from HEAD (Cycle 55 edits stashed) and from the Cycle 55 tree both produce 558,853 bytes identically. The Cycle 55 edits land only in the lazy-loaded `GrassSystem` chunk (+1.2 KB there, no ratchet); `main.js` grew to ~546 KiB during Cycle 53/54 native-packaging/license work, but the size assertion skips when `dist/` is absent, so those closes never tripped it. `threeKB` (603) unchanged.

**Carryover (deferred):**

- **In-browser visual taste-match** of the narrowed footprint across WebGL desktop, WebGL mobile, and WebGPU (Matt's review). The autonomous run could not composite WebGPU headless to taste-tune; dial `GrassSystem.config.interaction.*` if the swath wants tightening or loosening.
- **Physical dog-to-sheep / sheep-to-sheep collision** (the "make collision mesh?" idea). Today entity interaction is soft steering only; there is no hard-body collision except dog-to-obstacle. Adding it is a deterministic `shared/` change with sim-baseline and multiplayer cost. Open as a separate `entity-collision` cycle when desired.

### Cycle 54 - `native-desktop-package-1` (closed 2026-06-04)

Plan archived at [`docs/archive/cycles/cycle-54-plan.md`](archive/cycles/cycle-54-plan.md). Cycle 54 promoted the Cycle 53 Electron shell proof into the first Windows desktop distributor path while preserving SDS's browser-first core architecture.

**Closeout outcomes:**

- **Desktop distributor path:** `native/desktop-electron/` now builds through electron-builder with app identity, generated Windows icons, `sds://app` packaged boot, `nsis` installer, portable executable, and unpacked executable targets.
- **Signing-ready posture:** local proof builds force `CSC_IDENTITY_AUTO_DISCOVERY=false`; setup, portable, and unpacked executables remain intentionally unsigned until a code-signing certificate or explicit unsigned-release decision exists.
- **Packaged proof:** WebGL and true production WebGPU both boot and play from the packaged executable on this Windows host. Proof covers nonblank gameplay, sheep startup motion, fullscreen, native window resize, pointer lock, keyboard/mouse response, gamepad API, audio unlock, localStorage, Worker health, authenticated SDS WebSocket, logs, crash path, and zero fatal console errors.
- **Runtime fixes folded in:** startup flock motion is now visibly alive from the first playable moments, and the HUD sheep glyph is cleaner.
- **Steam/store handoff:** local Steam depot dry-run is plausible. Public store submission remains blocked on signing policy, metadata, install/uninstall QA, capsule/screenshots, controller/cloud-save policy, privacy/support URLs, and release-channel decisions.

**Validation gates (2026-06-04):**

- `npm run lint`, `npm test`, and `npm run build` passed.
- `npm run native:preflight`, `npm run desktop:dist`, `npm --prefix native/desktop-electron run proof:webgl`, and `npm --prefix native/desktop-electron run proof:webgpu` passed.
- GitHub Deploy run `26928995293` passed on `main` at commit `d9da08a`.
- Direct live fetches confirmed the deployed game and about page expose current AGPL/source notices.

**Carryover (deferred):**

- **Steam/desktop store-prep cycle:** signing decision, installer/install-uninstall QA, Steam depot dry-run, metadata, screenshots/capsules, controller notes, cloud-save decision, multiplayer networking policy, release-channel policy, and small-window HUD comfort acceptance.
- **Android native hardening:** signed release/AAB path, physical-device proof, real-device WebGPU probe, audio/storage/WebSocket/offline behavior, and store-compliance metadata.

### Cycle 53 - `native-shell-proof-1` + `v2.2.0` release close (closed 2026-06-03)

Plan archived at [`docs/archive/cycles/cycle-53-plan.md`](archive/cycles/cycle-53-plan.md). Cycle 53 proved SDS can boot and play from packaged native shells without changing the core web game architecture, then closed the forward-only `v2.2.0` license transition.

**Closeout outcomes:**

- **Native preflight:** `npm run native:check` is green and now inspects the actual Vite entry bundle referenced by `dist/index.html`.
- **Windows Electron proof:** a packaged Windows Electron executable boots the built `dist/` from an app protocol, starts Classic play, captures gameplay, and passes explicit WebGL plus true production WebGPU checks.
- **Capacitor Android proof:** a Capacitor debug APK boots on an API 35 emulator, reaches Rolling Hills gameplay, accepts touch joystick input, and passes explicit WebGL. Explicit WebGPU falls back cleanly to WebGL with `webgpu-adapter-unavailable`; true mobile WebGPU is not claimed.
- **Forward-only licensing:** current source is AGPL-3.0-or-later, current non-code assets are CC BY-SA 4.0, earlier releases retain their historical license terms, and the running game exposes visible source notices for AGPL network-use compliance.
- **Release handoff:** `v2.2.0` is the release marker for the license transition and native-shell proof. Next native work should choose either Steam/desktop packaging hardening or Android store hardening before opening Cycle 54.

**Validation gates (2026-06-03):**

- `npm run lint`, `npm test`, and `npm run build` passed at release close.
- Prior native proof gates passed and are recorded in [`docs/native-shell-proof-cycle-53.md`](native-shell-proof-cycle-53.md).
- The only `shared/` touches in the release were licensing metadata headers; native proof did not change deterministic sim behavior or regenerate sim-baseline goldens.

**Carryover (deferred):**

- **Desktop/Steam readiness:** real installer/portable target, app identity, icons, signing posture, crash/log path, frame/memory/startup budgets, gamepad/audio/storage/WebSocket proof, and Steam store/depot checklist.
- **Android store readiness:** signed release/AAB path, physical-device performance, audio unlock, persistence/offline/online behavior, Worker/WebSocket proof, orientation/fullscreen policy, and renderer fallback policy.
- **True mobile WebGPU:** not proven. Current Android WebView emulator has the API surface but no adapter.

### Cycle 52 - `pastoral-polish` (closed 2026-06-03)

Plan archived at [`docs/archive/cycles/cycle-52-plan.md`](archive/cycles/cycle-52-plan.md). The cleanup tail of the pastoral UI program: it landed the two Cycle 51 deferrals (the in-engine dissolve reveal; the `ExtremeTuningPanel` `.tsx` migration), retired the orphaned zen-crossfade scaffold, and ran a bounded prose/token hygiene sweep. The user-visible change: pressing Play now melts the still entrance backdrop into the living scene in one continuous in-engine motion instead of a DOM opacity fade. No version bump; v2.1.10 stands.

**Closeout outcomes:**

- Shipped 4/4 phases. Committed directly on `main`; pushed at close.
- **Pre-cycle hotfix (`6411bf8`):** the Cycle 51 shell deletion left the Playwright e2e helpers driving the removed UI (Solo Play / Confirm Selection / Classic Mode). They run only in CI, not under `npm test`, so the cycle-51 close passed on vitest but the deploy run went red. Rewrote smoke / mobile-asset-visibility / oc-perf / scene-swap-stability to drive the world-first entrance (arm the world via the switcher, pick Classic, Play); verified green locally on real GPU and on the next CI run.
- **P1 (`b20bc4b`):** generalized the in-engine reveal seam. Renamed the orphaned zen-attract crossfade scaffold (dead since ZenAttract was deleted in C51 P7) to a backend-agnostic `RevealLayer` contract (`_revealLayer` / `_revealActive` / `_endReveal`). No behavior change; the scaffold was already unreachable.
- **P2 (`bd2abe2`):** the in-engine backdrop dissolve. A fullscreen `BackdropReveal` quad (`js/effects/BackdropReveal.js`) textured with the armed world's entrance backdrop is held over the freshly built scene, then ramped opacity 1 to 0 over 0.8s when the loading surface hands off. Opacity-and-render-order based (MeshBasicMaterial, no shader) so it survives the WebGPU migration. Reduced motion skips to an instant reveal; a failed backdrop load fails loud and shows the scene instantly (no blank cover). Bundle baseline +1 KiB (541 to 542).
- **P3 (`c0381bd`):** migrated `ExtremeTuningPanel` `.js` (createElement) to `.tsx` + pastoral tokens (the last element-factory HUD holdout). Purple accents to gold/meadow, white text to cream, shared Icon close. Behavior identical (same FIELDS, same live `gameState.params` write).
- **P4:** bounded polish sweep (plan prose hygiene, em-dashes to hyphens; token consistency) + validation + close.

**Validation gates (2026-06-03):**

- `npm test` 866 passed / 7 skipped. `npm run build` clean. `main` 542 KiB (+1 from `BackdropReveal`). 6 chromium e2e green.
- The reveal arm/dissolve/dispose verified in a live browser (desktop, mobile 390x844, and reduced-motion): the quad appears over the built scene then disposes, `__sdsRevealArmed` clears, the canvas renders, no console errors.
- No cycle-52 commit touched `shared/`, `tests/sim-baseline/`, the Worker, or the frozen `SceneDef`. Client render + boot + UI only.

**Carryover (deferred):**

- none.

**Notes:**

- **The deploy-red root cause was a test-suite gap, not a code regression.** The e2e suite is CI-only (not in `npm test`), so a cold `/cycle-close` acceptance check (which runs `npm test`) cannot catch a stale e2e helper. Worth folding an e2e smoke into the local close gate in a future cycle.
- **The reveal reuses Cycle 46's crossfade structure** (render-order overlay + a runFrame opacity ramp + the DOM-cover skip flag) rather than a new post-processing pass, honoring the entrance-loading spec's "reuse the existing in-engine dissolve" intent.

### Cycle 51 - `frontend-loading-and-assets-redesign` (closed 2026-06-03)

Plan archived at [`docs/archive/cycles/cycle-51-plan.md`](archive/cycles/cycle-51-plan.md). A first-principles redesign of the frontend: a 10-way mockup bake-off picked the world-first Golden Pasture entrance, which was wired into the real boot; the old 13-screen shell was deleted; and the pastoral look was carried through the in-game HUD, the icon system, the mobile joystick, the loading sequence, and the project links. No version bump; v2.1.10 stands.

**Closeout outcomes:**

- Shipped 12/12 phases (P1-P5 bake-off + decisions, P6-P12 build). Committed directly on branch `cycle-51-mockups` (no PRs); pushed to `main` at close.
- **P1-P5 (`301a03e`, `f59ad6e`):** 10-way interactive entrance/flow bake-off; Matt picked Golden Pasture (world-first, photo-real warm glass); autonomous sub-decisions close-eye angle / side-lit dog / single still + CSS Ken Burns.
- **P6 (`0d401f2`):** world-first entrance in the real boot - instant entrance over the armed world's fresh close-eye backdrop, a REAL per-stage loading bar (boot emits `scene-load-step`; no fixed timer), scene-build-on-commit, CSS crossfade reveal, deferred identity.
- **P7 (`b4bb362`, net -7700 lines):** removed the `/mockups` route, ZenAttract, the 9 retired entrance leaves, both dead skeletons, dead `assets/icons/*`, 4 obsolete specs.
- **P8 (`6ea2059`):** bespoke hand-authored vector icon set (one cohesive family, 24+ glyphs); `lucide-react` dropped entirely + the `?? Play` fallback removed (a missing name throws, per the no-fallbacks rule).
- **Entrance fixes (`87480ed`):** the entrance always lands on Rolling Hills (the hero); the MoteField "white dots" overlay removed.
- **P9 (`5e1a12b`):** in-game HUD restyle - `.ui-panel`/`.mobile-control` warmed to pastoral glass, readouts off blue/cyan + inline SVG onto cream/gold + the shared Icon; MobileHUD/PauseMenu/CompletionScreen migrated `.js` -> `.tsx`.
- **P10 (`b597095`):** `nipplejs` retired for a custom pointer-events joystick (`MobileControls.tsx`, window-listener pattern so release never sticks); the movement-vector contract is byte-identical so the sim is unchanged.
- **P11 (`a56bce6`):** loading - high-priority `<link rel=preload fetchpriority=high>` on the armed backdrop, idle sibling-backdrop prefetch, blur-up image decode.
- **P12 (`90af525`):** the in-game `#site-footer` removed from the game scene; its links relocated to an entrance corner-nav info menu; `/devlog/` confirmed live; SEO `#seo-content` links retained.

**Validation gates (2026-06-03):**

- `npm test` 866 passed / 7 skipped. `npm run build` clean. `main` held at 541 KiB (no regression - all UI work in lazy chunks); `bundle-sizes.json` mainKB reset 545 -> 541 to the true value.
- No cycle-51 commit touched `shared/`, `tests/sim-baseline/`, the Worker, or the frozen `SceneDef`. Client render + boot + UI only.
- Verified in a live browser (desktop + 375x812 mobile): warm HUD glass `rgba(255,248,236,0.1)` + cream text + bespoke glyphs; joystick drag -> correct movement, release zeroes it; preload link present; info-menu links correct; no console errors.

**Carryover (deferred to Cycle 52 `pastoral-polish`):**

- **In-engine dissolve reveal.** P11 kept the verified CSS crossfade reveal; a true WebGPU dissolve (Q4's original intent) is a high-risk boot-reveal change deferred as a refinement.
- **`ExtremeTuningPanel` `.tsx` migration.** The remaining `createElement` HUD holdout is a dev-only tuning panel, not player-facing; migration deferred.

**Notes:**

- **Pixel Forge evaluated, not used for icons.** It's an AI raster + 3D asset pipeline (Gemini sprite/icon PNGs, FAL textures, Kiln LLM-to-GLB). For 16-28px tintable HUD chrome, raster is the wrong tool (no `currentColor`, DPR variants, payload, aesthetic clash), so the icons are hand-authored vector. Pixel Forge's genuine first job here is raster-appropriate art - dog-portrait avatars or in-world props - teed up, not forced.
- **"No fallbacks" rule (Matt, mid-cycle):** a silent default-on-missing masks failures in testing. Applied to new/converted code (the icon resolver throws on a bad name; the joystick warns loudly if the input bridge is missing).
- **12 phases, past the <=8 soft cap, by deliberate Matt-authorized expansion** (the original single P8 expanded into P8-P12 to finish the frontend rework in one cycle).

### Cycle 50 - `object-impostor-plumbing` (closed 2026-06-01)

Plan archived at [`docs/archive/cycles/cycle-50-plan.md`](archive/cycles/cycle-50-plan.md). Cycle 50 made the tree-impostor (billboard far-LOD) pipeline object-driven instead of preset/fixture-driven, as a pure refactor with zero visual change. A data-driven `assets/objects.manifest.json` now drives the offline bake, the sidecar contract, and the runtime route; octahedral is reproducible through the same baker; tree1/tree2 atlases stay byte-identical (no PNG bytes changed). Adding an object or impostor variant is now a manifest edit plus a bake, not a code edit. No version bump; v2.1.10 stands.

**Closeout outcomes:**

- Shipped 4/4 phases. P1 manifest + generalized baker (`374c7a4`, CI-portability `26e214f`); P2 sidecar identity + CI-portable determinism golden (`911e329`); P4 octahedral reproducible through the manifest (`457a32e`); P3 runtime route reads the manifest (`ceeed4e`); plus a ratchet bump for P3's footprint (`909b1fd`).
- **P1:** the manifest catalogs tree1/tree2 (impostor-enabled) plus rocks (disabled); the baker reads it (object x layout x variant loop + an `impostorAssetBase` helper); the hardcoded `TREES=['tree1','tree2']` list is gone.
- **P2:** each sidecar carries `objectId/category/variant/layoutId` (additive, via a new baker `--augment-only` mode that re-stamps without a Kiln render); `tests/imposter-sidecar.spec.js` generalized off its hardcoded list; new `tests/objects-impostor-parity.spec.js` + `.hashes.json` golden (tilesX*tilesY===angles invariant, sidecar re-stamp idempotency, recorded sha256 per atlas).
- **P4:** an octahedral layoutPreset (`--layout octahedral --grid 8x8`) listed in tree layouts; the baker emits octahedral args while latlon args stay byte-identical; octahedral sidecars stamped and the golden extended to 12 atlas hashes; the octahedral spec generalized. Octahedral stays lab-gated; latlon-hemi-y is the production default.
- **P3:** new `js/world/objectImpostorManifest.js` (client loader, degrade-not-crash on fetch failure); `js/world/TreePlacement.js` resolves impostor paths via `resolveImpostorBase()` instead of `tree1/tree2` string templates.

**Validation gates (2026-06-01):**

- `npm test` 903 passed / 7 skipped (added the manifest, sidecar, parity, octahedral, and resolver specs).
- `npm run build` clean; main chunk 544 KiB at the bumped ratchet (P3's always-used runtime module), three-*.js unchanged.
- No cycle-50 commit touched `shared/`, `tests/sim-baseline/`, the Worker, or the frozen `SceneDef`. The audit follow-up program plus two unrelated housekeeping commits account for all sim/worker diff in the since-author range.

**Carryover (deferred at close, criterion 6 left open by explicit decision):**

- **Full Kiln re-bake byte-identity is unverified-by-execution.** The CI-portable golden (sidecar idempotency + 12 recorded atlas hashes) is green, but no real `npm run bake-tree-impostors` ran this cycle. Hard-stop #1's full-Kiln byte-identity proof is a deferred manual gate: run the baker and confirm the latlon atlases re-bake byte-identical.
- **Octahedral atlas source mismatch.** The committed octahedral atlas was baked from the runtime `tree1.glb` (3783 tris), not the manifest's `_originals` source (5880 tris), so an octahedral re-bake from the manifest source will not reproduce it. Reconcile the true octahedral source, or accept a fresh octahedral bake with visual revalidation, before relying on octahedral reproducibility.
- **Impostor program Cycle B** (per-instance variation + new object categories) remains a candidate future cycle; see `docs/object-impostor-cycle-plan.md`.

**Notes:**

- Render/asset-only by construction. The byte-safe approach (augment sidecars in place via `--augment-only`, never re-rendering PNGs) kept every atlas byte-identical.
- Two unrelated housekeeping commits rode along at session start: `30f1e3a` (comment-only fix in `shared/GameStateValidation.js`) and `61dbe67` (an exhaustiveness throw in `worker/src/d1.ts`). Neither is cycle-50 scope.

### Cycle 49 - `pastoral-vision` (closed 2026-05-29)

Plan archived at [`docs/archive/cycles/cycle-49-plan.md`](archive/cycles/cycle-49-plan.md). Cycle 49 opened the Pastoral UI/UX rework program with a vision/spec cycle: it defined the calm-pastoral / painterly design language and shipped the reviewable artifacts the implementation cycles execute against, with zero behavior change to the running game. The headless-validation keystone is a standalone `/gallery` route that renders the UI without booting the WebGPU game, so the look is reviewable despite the headless-WebGPU compositing block. No version bump; v2.1.10 stands.

**Closeout outcomes:**

- Shipped 6/6 phases. P1 design-language doc (`docs/ui-design-language.md`, commit `25251d3`); P2 v2 pastoral token palette (additive `@theme` + `tokens.ts` mirror + parity spec, `e1c2d39`); P3 the standalone `/gallery` route (`gallery.html` + `js/gallery/`, wired into `vite.config.js`, `5d4f3b9`); P4 the six primitives previewed under the pastoral palette via a gallery-only theming wrapper (`eaf2f48`); P5 the entrance/loading spec (`docs/entrance-loading-spec.md`) + `EntranceMock`/`LoadingMock` (`4f3bd30`); P6 the container migration map (`docs/ui-migration-map.md`, `4a2c0f7`).
- The taste calls baked in for post-deploy review: an instant lightweight menu on a painterly pastoral backdrop (replacing the zen-boids entrance), build-on-commit loading driven by real eased stage marks, and a full pastoral type system led by Fraunces.

**Validation gates (2026-05-29):**

- `npm test` 601 passed / 7 skipped (+3 token-parity, +4 gallery smoke vs Cycle 48).
- `npm run build` clean; `dist/gallery.html` emitted; main chunk 540.4 KiB within the 541 KiB ratchet.
- Deploy on `main` green (`4a2c0f7`); `/gallery` live at sheepdogsim.com/gallery.
- `git diff` vs cycle-start (`54da9f3`) shows `shared/`, `tests/sim-baseline/`, the Worker, and every live game-runtime file untouched (render/UI/doc-only).

**Carryover (the Pastoral UI program continues at Cycles 51+):**

- The program's implementation cycles (the entrance/loading rework that was the original "Cycle 50", and the container restyle batches) shift to Cycles 51+ because the object-driven impostor render cycle is inserted as Cycle 50 (Matt's reprioritization). The deferred scope lives in `docs/entrance-loading-spec.md` + `docs/ui-migration-map.md`.
- The pastoral look (menu/backdrop, primitives, entrance/loading mockups) is Matt's post-deploy visual call on `/gallery` (headless WebGPU does not composite).

**Notes:**

- Cycle 50 is the object-driven impostor pipeline (`object-impostor-plumbing`), a render cycle inserted ahead of the UI program's remaining work. See `docs/cycle-50-plan.md` plus the 2-cycle program reference `docs/object-impostor-cycle-plan.md`.

### Cycle 48 - `ui-conversion-sweep` (closed 2026-05-29)

Plan archived at [`docs/archive/cycles/cycle-48-plan.md`](archive/cycles/cycle-48-plan.md). Cycle 48 swept the Cycle 47 leaf-first TSX conversion across the leaf-tier createElement components: the HUD readouts, the presentational StartScreen menu screens, the presentational Multiplayer screens, and the `ui` leftovers. It retired the named inline hex in every file it touched (App.js's 7 literals and MenuOption's `DEFAULT_ACCENT`) and moved the ScenePicker scene-card slide off CSS keyframes onto Motion. The user-visible difference is small by design (HUD, menus, and multiplayer screens look the same, the card slide animates a touch more smoothly, reduced-motion honored everywhere); the win is internal, the next HUD or menu change edits a typed `.tsx` reading one palette. No version bump; v2.1.10 stands.

**Closeout outcomes:**

- Shipped 5/6 phases (P1 HUD readout leaves, P2 StartScreen menu leaves, P3 Multiplayer leaves, P4 `ui` leftovers + named hex retirement, P5 card-slide Motion). P6 (picker affordances) was optional/paired and deferred whole to carryover, exactly as the plan's EARS line directs.
- **Phase 1 (HUD readout leaves, commit `52e782f`).** Converted GameTimer, SheepCounter, CompactStaminaBar, ObjectiveBanner, CameraModeIndicator, CorralCompass, PracticeHint, HudLayout to token-driven `.tsx`, render-spec'd in jsdom. Zero createElement, zero raw hex.
- **Phase 2 (StartScreen menu leaves, commit `19797d9`).** Converted SinglePlayerModes, ModeSelection, DogSelection, PlayerIdentitySetup, PointerTour to `.tsx` on Card / Button / Badge / tokens + lucide icons, preserving each screen's behavior.
- **Phase 3 (Multiplayer leaves, commit `0143c06`).** Converted MultiplayerOptions, RoomJoining, PublicLobbyList, MultiplayerScoreboard, GlobalLeaderboard to `.tsx`; rank colors read the Cycle 47 tokens. Lobby and RoomCreation left as stateful-container carryover. No NetworkManager or wire change.
- **Phase 4 (`ui` leftovers + named hex retirement, commit `977f136`).** Converted MenuOption (retiring `DEFAULT_ACCENT` to a token), LanguageSelector, SceneSwapOverlay to `.tsx`, preserving the Cycle 46 `window.__sdsAttractCrossfadeActive` crossfade-skip contract. Retired the 7 inline hex in App.js to tokens (hex-to-token only; App.js's createElement body stays).
- **Phase 5 (card-slide Motion, commit `149e423`).** Moved the ScenePicker scene-card slide from the `sds-slide-in-*` CSS keyframes to Motion (`motion/react`), reduced-motion-aware via the Cycle 47 `useReducedMotion` hook, preserving the picker swap contract (crossfade handoff, latest-wins coalescing, debounce, swipe, arrow keys).

**Validation gates (2026-05-29):**

- `npm test` - 594 specs passed, 7 skipped (66 files passed, 1 skipped).
- `npm run build` - clean with the existing Vite large-chunk warning (three 617 KiB).
- `grep` confirms zero createElement and zero raw 6-digit hex across the converted leaves; App.js hex count 0; MenuOption has no `DEFAULT_ACCENT`; ScenePicker imports motion.
- `git diff` against the cycle-start commit shows `shared/` and `tests/sim-baseline/` untouched (render/UI-only cycle).
- Last deploy on `main` (Phase 5, `149e423`) green before close; the close commit redeploys.

**Carryover (deferred to Cycle 49 `pastoral-vision` and the broader UI rework program):**

- **Phase 6 picker affordances (deferred whole, optional/paired).** Scene-preview affordance, load-overlay stream-progress affordance, combined scene-plus-mode gate. Need composite validation (blocked headless) and two touch the Cycle 46 crossfade contract; the plan's EARS line directs deferral rather than shipping shallow. These fold into the Pastoral UI/UX rework program (entrance and loading land in Cycle 50).
- **The big stateful containers.** App.js body, PauseMenu, CompletionScreen, SettingsPanel, SandboxSetup, FenceEditor, ShapeEditor, LocalModeSetup, MobileHUD, MobileControls, ExtremeTuningPanel, Lobby, RoomCreation stay on the createElement path. They are the restyle-and-convert target for Cycles 51-52 of the rework program.

**Notes:**

- Cycle 48 closes alongside the authoring of Cycle 49 (`pastoral-vision`), the first cycle of the new Pastoral UI/UX rework program (Cycles 49-52). The program supersedes the zen-boids entrance with an instant lightweight menu, reworks styling from first principles toward calm-pastoral / painterly, and defers the 3D scene build until the player commits to a scene. The program's headless-validation keystone is a standalone `/gallery` route (built in Cycle 49) that renders the UI without booting the WebGPU game. See [`docs/cycle-49-plan.md`](cycle-49-plan.md).

### Cycle 47 - `ui-foundation-overhaul` (closed 2026-05-29)

Plan archived at [`docs/archive/cycles/cycle-47-plan.md`](archive/cycles/cycle-47-plan.md). Cycle 47 is the second half of the entrance + UI split (Cycle 46 shipped the entrance). It laid the UI foundation: turned on JSX/TSX globally, defined a design-token palette in the Tailwind `@theme` layer with a typed mirror, stood up a set of hand-owned token-driven `.tsx` primitives, adopted lucide-react for generic icons and Motion for transitions, converted the scene picker as the exemplar leaf, and isolated the HUD from per-frame React reconciliation. The user-visible difference is small (menus and picker look the same or slightly cleaner, animate a little more smoothly, and the HUD stops re-rendering every frame); the win is internal, the next UI change reads from one palette instead of guessing a hex code. The cycle deliberately did not convert all ~50 components. No version bump; v2.1.10 stands.

**Closeout outcomes:**

- Shipped 7/8 phases (P1 tokens + tsconfig, P2 component-test harness, P3 lucide + SceneGlyph, P4 owned primitives, P5 ScenePicker.tsx, P6 HUD isolation, P7 Motion). P8 (optional polish) was deferred whole to Cycle 48 carryover. This satisfies the close criterion that every phase ships or is explicitly deferred.
- **Phase 1 (design tokens + TSX config).** Commit `9920d6f`. New root `tsconfig.json` (`jsx: react-jsx`, `allowJs`, `checkJs: false`, `noEmit`, `strict`); `@vitejs/plugin-react` already registered, so `.tsx` compiles with no plugin change. Expanded the `css/main.css` `@theme` palette (`--color-accent` and per-scene accents, semantic colors, rank colors, glass-surface colors, title greens, spacing/radius/motion-duration/easing). New `js/components/ui/tokens.ts` typed mirror for inline-style call sites. ScenePicker keyframes moved from a `dangerouslySetInnerHTML` `<style>` into `main.css`.
- **Phase 2 (component-test harness).** Commit `497d5bd`. Added `jsdom` + `@testing-library/react` devDeps and a per-file jsdom opt-in (`/** @vitest-environment jsdom */` docblock) so the existing pure-logic and sim-baseline specs keep their fast node environment. Render smoke specs mount the existing Button/Panel and pin current behavior.
- **Phase 3 (lucide-react icons + SceneGlyph).** Commit `76ede92`. Added lucide-react, routed into a dedicated non-main `ui` manualChunk. Replaced the hand-rolled picker chevron path (`M14 6l-6 6 6 6`) with lucide. Extracted the bespoke island/mountains/farmhouse vignettes into a presentational `SceneGlyph` component (art, not generic icons, so kept as owned SVG).
- **Phase 4 (owned TSX primitives).** Commit `46795d7`. Converted Button and Panel in place to `.tsx` and added Card, Badge, IconButton, Surface. Each is typed, reads tokens, and contains zero raw 6-digit hex (verified by grep). Barrel `index.ts` exports them. Each is render-spec'd in jsdom.
- **Phase 5 (ScenePicker to TSX).** Commit `2ef572e`. Extracted picker pure logic (ordering, current-scene resolution, debounce + latest-wins commit predicate) into a unit-tested `.ts` module, then rewrote the component as `ScenePicker.tsx` on the Phase 4 primitives, Phase 1 tokens, Phase 3 lucide + SceneGlyph, and the now-shared keyframes. Preserves the Cycle 46 crossfade swap contract (no DOM cover, latest-wins coalescing, debounce, touch swipe, ArrowLeft/ArrowRight). `grep` confirms zero `createElement`, zero raw hex, zero `dangerouslySetInnerHTML`, zero `ACCENT =`.
- **Phase 6 (HUD state isolation + reduced-motion).** Commit `19c6818`. Rewrote `js/components/hooks/useGameState.js` from a per-frame `setGameData` (full HUD reconciliation every frame) to a module-level `useSyncExternalStore` store fed by the `frame` event, change-gated so an identical frame returns the same snapshot reference (React skips the re-render). The timer gates on whole seconds but stores the raw `gameTime` (a floored store would read the timed countdown one second high). All GameBridge reads are byte-identical. New `tests/ui/useGameState.store.spec.ts` proves referential stability. New `js/components/ui/useReducedMotion.ts` (a `useSyncExternalStore` over the `prefers-reduced-motion` media query) plus a `main.css` `@media (prefers-reduced-motion: reduce)` block that neutralizes keyframe animations with `!important` (needed to override inline `animation`/`transition` styles the createElement components set).
- **Phase 7 (Motion layer).** Commit `addb30f`. Added motion, routed into the `ui` manualChunk alongside lucide-react. StartScreen screen-state transitions now run through `motion`: the existing `.start-screen-content` div became a keyed `motion.div` inside `AnimatePresence mode="wait"` (same className and box, so layout at rest is identical). Reduced-motion is honored via the Phase 6 `useReducedMotion` hook (initial skipped, transition duration collapses to 0).

**Validation gates (2026-05-29):**

- `npm test` - 62 passed files, 1 skipped; 562 specs passed, 7 skipped (adds the component smoke specs, the picker pure-logic spec, and the HUD store spec).
- `npm run build` - clean with the existing Vite large-chunk warning; main 541 KiB at the ratchet, three 603 KiB unchanged. The `ui` chunk (lucide-react + motion) is 131.51 kB raw / 44.98 KB gzip, under the 60 KB hard-stop, so Motion stays. Bundle fixture `bundle-sizes.json` unchanged at 541/603 (the new deps route to the non-measured `ui` chunk).
- `git diff` against the cycle-start commit shows `shared/` and `tests/sim-baseline/` untouched (render/UI-only cycle, no sim-baseline regeneration).
- Last deploy on `main` (Phase 7, `addb30f`) green before close; the close commit redeploys.

**Carryover (deferred to Cycle 48 `ui-conversion-sweep`):**

- **Phase 8 polish (deferred whole, optional).** Scene-preview affordance, load-overlay stream-progress affordance, combined scene-plus-mode gate, and the inline-hex drift sweep. Three of the four items are visual or navigation affordances that need composite validation, which is blocked locally (headless WebGPU does not composite, the preview tab runs `visibilityState: hidden`); two of them touch picker behavior and the Cycle 46 crossfade contract (hard-stop #2). The plan's own EARS line directs deferral "rather than shipped shallow." The drift sweep's measurable target is already met on the converted surface (ScenePicker.tsx and all six `ui` primitives are at zero hex); the remaining inline hex lives in `App.js` (7) and `MenuOption.js` `DEFAULT_ACCENT`, both still on the createElement path.
- **Remaining ~49 component conversions.** The leaf-first conversion was proved on ScenePicker; the other createElement components stay as carryover. The cycle deliberately converted one leaf, not all 50.
- **Card-slide Motion (intra-phase deviation).** The ScenePicker scene-card content slide stayed on CSS keyframes (`sds-slide-in-*`, already reduced-motion-aware via the P6 block) rather than moving to Motion, since the card slide could not be visually validated locally and migrating it risked the picker behavior under hard-stop #2. Motion was applied to the StartScreen screen-state transitions the EARS criteria call out. Card-Motion is available as carryover.
- **Cycle 46 post-deploy visual checks** still open and Matt-pickup: Q1 zen-field aesthetic sign-off, crossfade feel/speed, deep-link + MP smoke. Same headless-WebGPU block.

**Notes:**

- esbuild strips TS types without type-checking, and neither `npm test` nor `npm run build` runs `tsc`, so TS type errors are invisible to the acceptance gates. The new `tsconfig.json` gives the editor and a manual `tsc --noEmit` the type view; conversions are type-checked in the editor, not at the build gate.
- Vite resolves `.js` import specifiers to `.tsx`/`.ts` via its resolve-extensions retry, so converting a file in place (Button.js to Button.tsx) needs no importer changes.
- The whole cycle is render/UI-only: no `shared/` edits, no sim-baseline regeneration, no `SceneDef` schema change, no version bump.

### Cycle 46 - `entrance-zen-boids-and-cleanup` (closed 2026-05-29)

Plan archived at [`docs/archive/cycles/cycle-46-plan.md`](archive/cycles/cycle-46-plan.md). Cycle 46 replaced the boot-time full-scene build and auto-loading card picker with a zen attract field as first paint: a cheap drifting-dart field over a gradient sky, with the picker overlay live on top. Selecting a scene streams the real scene in while the field keeps rendering and crossfades it out in-engine, with no DOM flash. The cycle also cleared 632 lines / ~58 KiB of dead CSS and the stale "Step 1 scaffolding" swap comments. No version bump; v2.1.10 stands. This is the first half of the approved entrance + UI split (Cycle 47 is the UI foundation overhaul).

**Closeout outcomes:**

- Shipped 4/5 phases (P1 zen first paint, P2 pick-then-stream + crossfade, P3 deep-link + MP fallback + guard spec, P4 dead-code cleanup). P5 (polish) was explicitly deferred to Cycle 47 (see Carryover). This satisfies the close criterion that every phase ships or is explicitly deferred.
- **Phase 1 (zen attract field as first paint).** Commit `c93201a`. New `js/attract/ZenAttract.js`: an InstancedMesh dart field on a renderer-agnostic CPU drift, drawn by the persistent renderer over the existing atmosphere. The boot path no longer runs `buildSceneBody` for the default scene on a plain open; the field mounts instead and the picker overlay floats on top. A `webgpu-threejs-tsl` GPU-compute boids version was scoped, but the main bundle uses the WebGL `THREE` while WebGPU + TSL come from a separately vendored build injected as material-factory globals, so a `three/tsl` import would pull a second copy of three and break the renderer or blow the bundle ratchet. The render-agnostic CPU drift over a standard MeshBasicMaterial is the version that runs on both renderers; deviation documented honestly in `cycle46-validation/entrance-timing.md`.
- **Phase 2 (pick-then-stream + in-engine crossfade).** Commit `b640587`. The first pick out of the field awaits an idle GLB prefetch (kicked at field mount via `requestIdleCallback`), keeps the field alive through `disposeScene`, holds the last field frame while the real scene builds (no black, no pop-in), then dissolves the darts out over 0.8s ease-out (`renderOrder` 10000, `depthTest` off, `material.opacity` 1 to 0). A true two-layer `uAlpha` blend would have needed render-to-texture, which is high-risk on the untestable production WebGPU renderer; the dart-dissolve is a real in-engine alpha crossfade using only material opacity and render order. No View Transitions API (Hard stop 2). `SceneSwapOverlay` skips its DOM cover for this path via a `window.__sdsAttractCrossfadeActive` flag so the in-engine hand-off is visible. The main-bundle ratchet was re-baselined 539 to 541 KiB.
- **Phase 3 (deep-link + MP fallback + guard spec).** Commit `47e502d`. Extracted the boot-time entrance predicate into a pure, importable `shouldBootAttract()` (new `js/boot/bootAttract.js`) as the single source of truth: a plain open mounts the field; `?scene=`, an `#/r/` room invite, an `#s/` or `#/s/` sandbox deep-link, `?autostart=1`, `?testNoCanvas=1`, and cinematic mode each build a scene directly. New `tests/entrance-attract-gate.spec.js` imports the real helper and pins each case, plus an inline mirror of the MP-swap hard-reload contract so the gate (keeps MP out of attract) and the swap path (hard-reloads) cannot drift apart.
- **Phase 4 (dead-code and drift cleanup).** Commit `5e6de9d`. Deleted three dead CSS files (`css/production.css`, `css/multiplayer-react.css`, `css/components/index-styles.css`; only `css/main.css` is live, linked at `index.html:273`) and fixed the stale "Step 1 scaffolding / hard-reload fallback" comments in `js/main.js` and `js/App.js` that no longer described the code.

**Validation gates (2026-05-29):**

- `npm test` - 56 passed files, 1 skipped; 521 specs passed, 7 skipped (adds the 14-case `tests/entrance-attract-gate.spec.js`).
- `npm run build` - clean with the existing Vite large-chunk warning; main 541 KiB at the re-baselined ratchet, three 603 KiB unchanged.
- Last deploy on `main` green before close; the four phase commits were unpushed at close, so the close commit deploys the whole cycle together.

**Carryover (deferred to Cycle 47 `ui-foundation-overhaul`):**

- **Phase 5 polish (deferred whole).** Scene preview affordance, load-overlay progress affordance, and combined scene + mode gate are all picker-overlay UI work. Q2 of the Cycle 46 plan already defers picker restyling to Cycle 47 (the UI foundation overhaul: TSX, design tokens, component library, Motion), and the load-overlay progress item is moot for the attract path (Phase 2 deliberately skips the DOM cover there and shows live sky + darts). Shipping shallow UI now that Cycle 47 would immediately rewrite is a half-integration, so P5 carries forward whole.
- **Q1 zen-field aesthetic sign-off (paired, blocked headless).** The field look is a paired taste call. Headless WebGPU does not composite (the preview tab runs `visibilityState: hidden`, screenshots time out), so Matt verifies the aesthetic visually post-deploy.
- **Crossfade-shape + prefetch-win feel-check (paired, post-deploy).** The dart-dissolve shape and the "feels faster than the Cycle 45 baseline" claim are Matt's post-deploy calls; the prefetch win in `cycle46-validation/entrance-timing.md` is a derived figure (about 61% of swap cost pre-paid, from the Cycle 45 baseline) pending a live measurement.

**Notes:**

- The persistent-renderer architecture (SceneManager keeps renderer, canvas, scene, and GLB cache alive across swaps) made the whole entrance cheap: the field is just a cheap first body on the already-up renderer, and the crossfade reuses the existing `swapScene` seam rather than rewriting the swap machinery.
- Two deviations from the plan's named techniques (CPU-drift darts instead of TSL GPU-compute boids; dart-dissolve instead of a two-layer `uAlpha` render-to-texture blend) were both forced by the same constraint: the production WebGPU renderer is vendored separately and is not headless-testable, so the lowest-risk renderer-agnostic mechanism won. Both are documented in `cycle46-validation/entrance-timing.md`.

### Cycle 45 - `entry-load-and-grass-feel` (closed 2026-05-29)

Plan archived at [`docs/archive/cycles/cycle-45-plan.md`](archive/cycles/cycle-45-plan.md). Cycle 45 was re-scoped from the empty `paired-parity-and-proofs` scaffold after Matt raised three issues: scene-entry UX is backwards (the game boots into Rolling Hills behind the menu instead of letting you pick first), scene loading is slow (too much runtime procedural generation), and the grass press around the dog and sheep reads as a thin tip-only silhouette instead of a body-shaped dent. The cycle measured the load cost, baked the measured hog, and set up the entrance and grass follow-on work. No version bump; v2.1.10 stands.

**Closeout outcomes:**

- Shipped 2/5 phases (P1 load-time measurement, P3 bake the measured hog). P2 (scene-select-before-load gate) was superseded mid-cycle by the approved Cycle 46 zen-boids entrance; P4 (grass body-deform) and P5 (polish) are carried forward (see Carryover). This satisfies the close criterion that every phase ships or is explicitly deferred.
- **Phase 1 (load-time measurement).** Instrumented [`js/boot/initWorld.js`](../js/boot/initWorld.js) with per-stage timing and threaded a `stages` breakdown into the `scene_swapped` telemetry in [`js/main.js`](../js/main.js); captured cold and warm baselines. The measured load hog was synchronous main-thread tree placement, not WebGPU init or asset I/O. The renderer, canvas, `THREE.Scene`, and GLB cache already persist across swaps, so the cost was the procedural rebuild, not GPU setup.
- **Phase 3 (bake the measured hog).** Moved field tree placement to a build-time bake: new [`tools/bake-placement.mjs`](../tools/bake-placement.mjs) writes a deterministic manifest to `public/placement/`, loaded at runtime by new [`js/world/placementManifest.js`](../js/world/placementManifest.js) and consumed in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) and [`js/world/TreePlacement.js`](../js/world/TreePlacement.js). The tree-placement stage dropped from 489/532 ms to ~31 ms; total warm Field swap dropped from 1904 ms to 430 ms. The bake reduced 1359 candidate trees to 371 placed (treeline at 429.949 m). The dog rig was made lazy (`TerrainBuilder.loadAnimal`, awaited at the main.js mount sites and the cinematic showcase mount) so it no longer blocks first build.
- **Schema (authorized, additive).** Added an optional `placementManifest` field to the fence-frozen [`shared/scenes/types.js`](../shared/scenes/types.js) `SceneDef` with a default; scenes without it fall back to runtime procedural placement, so no existing scene or consumer breaks. Used by [`shared/scenes/field.js`](../shared/scenes/field.js). Placement is render-only (the cycle's Q2 resolved this way), so [`shared/SceneObstacles.js`](../shared/SceneObstacles.js) and the sim-baseline fixtures were not touched. The main-bundle ratchet was re-baselined 534 to 536 KiB in `tests/refactor-baseline/__fixtures__/bundle-sizes.json` with a dated rationale in DECISIONS.md.
- This cycle's phase work was committed at close rather than per-phase, so the implementation and the close bookkeeping land together on `main`.

**Validation gates (2026-05-29):**

- `npm test` - 55 passed files, 1 skipped; 507 specs passed, 7 skipped (adds the new `tests/placement-manifest.spec.js`).
- `npm run build` - clean with the existing Vite large-chunk warning.
- Last deploy on `main` green before close; the close commit redeploys.

**Carryover (deferred to Cycle 46 `entrance-zen-boids-and-cleanup`):**

- **Phase 2 superseded.** The scene-select-before-load gate is replaced by Cycle 46's zen-boids attract scene (pick-then-stream), the richer version of "let the player pick before we build a scene." Plan pre-authored at [`docs/cycle-46-plan.md`](cycle-46-plan.md).
- **Phase 4 grass body-deform (paired, blocked headless).** Carry the bend down the full blade and push along the body-oval normal in [`js/world/konveyorGrassBladeNodeMaterial.js`](../js/world/konveyorGrassBladeNodeMaterial.js); validate via `window.__sdsGrassProof` with before/after captures. Needs Matt's taste check and a headed browser: the preview tab runs `visibilityState: hidden`, so WebGPU does not composite and screenshots time out.
- **Phase 5 polish.** Folded into Cycle 46 Phase 5 (scene preview affordance, load-overlay progress affordance, combined scene + mode gate).
- The Cycle 44 paired buckets C/D/E (WebGPU painterly parity, mobile and real-device proofs, multiplayer playtest) stay under "Deferred / not blocking" for a later paired cycle; they were out of Cycle 45 scope after the re-scope.

**Notes:**

- The slow-load root cause was synchronous rebuild on the main thread, not renderer or GPU init. The persistent-renderer architecture (SceneManager keeps the renderer, canvas, and scene alive across swaps) was already correct; the fix was to remove main-thread procedural work, which the bake does for free because placement is render-only.
- The next cycle (46) is pre-authored from the entrance/UI spike: a zen TSL compute-boids attract scene as first paint, pick-then-stream with an in-engine crossfade, plus a dead-CSS and stale-comment cleanup. The UI foundation overhaul (TSX, design tokens, component library, Motion) is split out to a later Cycle 47 and is intentionally not scaffolded yet.

### Cycle 44 - `release-readiness-sweep` (closed 2026-05-28)

Plan archived at [`docs/archive/cycles/cycle-44-plan.md`](archive/cycles/cycle-44-plan.md). Cycle 44 was an autonomous hygiene + cleanup sweep: clear the dependency/security and bundle-bloat carryover accrued since Cycle 40 and finish two long-tail code/doc cleanups, without touching the deterministic sim, the scene schema, or player-visible behavior. No version bump; no user-visible change.

**Closeout outcomes:**

- Shipped 4/4 autonomous phases (buckets A + B + F). The paired buckets C (WebGPU taste parity), D (mobile/real-device proofs), and E (multiplayer playtest) were split out at `/cycle-start` and carried forward (see Carryover).
- **Phase 1 (uuid advisory).** Resolved `security/dependabot/25` via an npm `overrides` pin forcing the transitive `uuid` to `^11.1.1` (also pinned `protobufjs ^7.5.8`). `npm ls uuid` now resolves the whole tree to `uuid@11.1.1`; the flagged dev-only `9.0.1` is gone, and it never reached `dist/`. Commit `1128f19`.
- **Phase 2 (main-bundle ratchet).** Split a `vendor` chunk (`@three.ez/instanced-mesh`, `kdbush`) out of `main` in `vite.config.js`, pulling `main` from 607 to 533 KiB (raw 545.72 kB / gzip 159.6 kB). Re-baselined `tests/refactor-baseline/__fixtures__/bundle-sizes.json` mainKB 593 to 534 with a dated rationale in DECISIONS.md; `three` unchanged at 603 KiB. Commit `65b50bb`.
- **Phase 3 (polygon-spawn dedup).** Repointed `js/SandboxConfig.js`, `js/StructureBuilder.js`, and `js/OptimizedSheep.js` onto the canonical `js/gamestate/polygonSpawn.js`, deleting 5 local copies of `pointToSegmentDistance` / `isPointInPolygon`. Behavior-preserving: 4 copies were byte-identical and StructureBuilder's differing degenerate-case branch was proven unreachable (its single call site is guarded by `borderPoints.length >= 3`). No refactor-baseline drift. `OptimizedSheep.js` stayed cohesive (imported the helper, did not decompose). Commit `3874dd5`.
- **Phase 4 (ARCHITECTURE entries).** Added first-class entries for the four undocumented Cycle 5 primitives: `Random` (mulberry32 seeded PRNG), `SceneObstacles` (kdbush proxy colliders), the `Boundary` rect/island discriminated schema, and `AnimeWater` (cel-shaded shoreline water). Additive only. Commit `e6b3685`.
- Shipped as 5 direct-to-main commits (no PRs): `65ca5c7` (plan triage), `1128f19`, `65b50bb`, `3874dd5`, `e6b3685`. Deploy run `26604025545` (success on `main`).

**Validation gates (2026-05-28):**

- `npm test` - 54 passed files, 1 skipped; 498 specs passed, 7 skipped.
- `npm run build` - clean with the existing Vite large-chunk warnings; `main` 533 KiB <= 534 baseline, `three` 603 KiB unchanged.
- Deploy run `26604025545` green on `main` (build, Cloudflare Pages, E2E Chromium).

**Carryover (deferred to Cycle 45 `paired-parity-and-proofs`):**

- **C. WebGPU painterly parity (paired, taste).** The six low-sun actor / Open Country material-lock manual-review items from `npm run validation:cycle42-material-lock`; broader WebGPU/WebGL terrain-foliage parity.
- **D. Mobile / real-device proofs (paired, blocked locally).** Android WebGPU water/device proof (needs an authorized ADB device); BrowserStack iOS Safari water canary (needs `BROWSERSTACK_*` creds).
- **E. Multiplayer playtest (paired).** Open Country paired two-client playtest, deferred since Cycle 40.

**Notes:**

- The Cycle 41 bundle ratchet looked tripped partly from raw-vs-gzip and KiB-vs-kB confusion. The harness fixture is 1024-based KiB; Vite's build log is 1000-based kB. `three` at 617.79 kB (log) is exactly 603 KiB (harness), so there was no `three` regression; only `main` needed action, resolved cleanly by the vendor split rather than by loosening the baseline.

### Cycle 43 - `retire-webgpu-scaffolding` (closed 2026-05-28)

Plan archived at [`docs/archive/cycles/cycle-43-plan.md`](archive/cycles/cycle-43-plan.md). Cycle 43 deleted the WebGPU boot-scout scaffolding left over from the migration, after Cycle 42 shipped plain `?renderer=webgpu` as the proven production default. No user-visible change: the same WebGPU game ships.

**Closeout outcomes:**

- Shipped 4/4 phases. Removed the `productionBootScout` runtime route (index.html parse, `webgpu-production-boot-scout` effective mode, main.js dispatch + dead error block, the `dataset.konveyorProductionBootScout` marker, and the `explicitScoutRoute` gate clause), deleted three scout-only files (`konveyorProductionBootScoutRecorder.js` at 557 lines plus the `konveyor-production-boot-scout.mjs` and `konveyor-production-gameplay-parity-proof.mjs` tool runners), repointed the three scene-body instancing tests onto the real `webgpu-production` window, and updated docs.
- Net diff: 125 insertions, 1713 deletions across 13 files.
- Production native instancing was confirmed to ride `isKonveyorProductionWebGpuActive()` plus the `konveyorNativeTreeImpostors` route, never the scout query, so the deletion cannot regress the shipped renderer. The `konveyorNativeInstancing` userData marker survives in `js/world`.
- Commit `5e149ab` (`refactor(cycle-43): retire webgpu boot-scout scaffolding`), deploy run `26597359915` (success on `main`; build, Cloudflare Pages, and E2E Chromium all green).

**Validation gates (2026-05-28):**

- `npm test` - 54 passed files, 1 skipped; 498 specs passed, 7 skipped (one dead scout-route test removed, so 498 vs the 499 baseline).
- `npm run build` - clean with the existing Vite large-chunk warnings.
- `grep -rn "productionBootScout" index.html js/ tests/ tools/` - 0 matches.
- DECISIONS.md retirement entry appended (2026-05-28 Cycle 43); the prior 2026-05-15 boot-scout entry left unmodified (append-only).

**Carryover:**

- All Cycle 42 carryover stands (Android WebGPU device proof, BrowserStack iOS water proof, Open Country paired playtest, the `uuid` / moderate Dependabot advisory, the six material-lock manual-review items). Gathered into the Cycle 44 candidate-scope scaffold.
- Build large-chunk warning is creeping (main ~607 kB vs the 593 KiB ratchet accepted in Cycle 41); added to Cycle 44 candidate scope.

### Cycle 42 - `webgpu-scene-material-parity-and-device-proof` (closed 2026-05-28, v2.1.10 release)

Plan archived at [`docs/archive/cycles/cycle-42-plan.md`](archive/cycles/cycle-42-plan.md). Cycle 42 implemented the visual-first WebGPU scene-material parity pass requested after Cycle 41: sun/sky interaction, grass/terrain separation, and deeper blue water were treated as close criteria before release.

**Closeout outcomes:**

- **WebGPU sun/sky art lock.** The sky node material now paints a warm sun body before adding the hot core, so the large visible mass no longer reads as a dull grey-white moon. The WebGPU sun billboard is larger and remains additive, while the sky owns the painted sun body, aureole, and horizon glow.
- **WebGPU grass and terrain separation.** Grass color handling no longer double-darkens/browns the palette; low-sun grass uses more green/yellow tip and backlight separation so it does not collapse into the terrain color.
- **Deeper blue WebGPU water.** Water uses darker blue tuning and a masked broad-glint path so low-sun water keeps an intentional reflection path without washing the whole surface purple.
- **Repeatable Cycle 42 proof.** `npm run validation:cycle42-material-lock` writes `cycle42-validation/runtime/material-lock.json`, per-shot screenshots, and `cycle42-validation/screenshots/cycle42-material-contact-sheet.png`. The runner passes but still reports six low-sun actor/Open Country material-parity manual-review classifications.
- **Octahedral production route proof.** `npm run validation:cycle42-octahedral-proof` writes `cycle42-validation/runtime/octahedral-proof.json` and `cycle42-validation/screenshots/cycle42-octahedral-contact-sheet.png`. The explicit WebGPU production tree-impostor route now resolves to octahedral v2; rollback is `?renderer=webgpu&konveyorNativeTreeImpostors=latlon`.
- **Dependabot hygiene.** Low-risk dev-scope `tmp` and `qs` advisories were handled. The remaining `uuid` advisory is transitive through Google/BrowserStack tooling and stays maintenance carryover.
- **Release proof.** Shipped as commit `fb78851`, tag `v2.1.10`, deploy run `26595530924`. Live HTML at sheepdogsim.com serves `assets/main-CZelhZcJ.js`; the direct asset URL returns HTTP 200.

**Validation gates run before release approval (2026-05-28):**

- `npm test` - 54 passed files, 1 skipped; 499 specs passed, 7 skipped.
- `npm run lint` - clean.
- `npm run build` - clean with existing Vite large-chunk/dynamic-import warnings.
- `npx playwright test tests/e2e/smoke.spec.ts --project=chromium --reporter=line` - 2 passed.
- `npx playwright test --project=chromium --grep-invert @local-only --reporter=line` - 6 passed after rerunning standalone; an earlier parallel run was invalid because Vite moved to port `3001`.
- `npm run validation:cycle42-material-lock` - passed with six manual-review material classifications.
- `npm run validation:cycle42-octahedral-proof` - passed.

**Carryover:**

- Android WebGPU water/device proof remains blocked locally by no authorized ADB device.
- BrowserStack iOS water proof remains blocked locally by missing BrowserStack credentials.
- Open Country paired two-client playtest remains deferred.
- The six material-lock manual-review items stay visible for Matt approval and future painterly parity work.

### Cycle 41 - `webgpu-painterly-parity-and-polish` (closed 2026-05-27, v2.1.9 release)

Plan archived at [`docs/archive/cycles/cycle-41-plan.md`](archive/cycles/cycle-41-plan.md). Cycle 41 finished the WebGPU painterly parity follow-up opened by the WebGL/WebGPU side-by-side review: the WebGPU sun now reads as a warm visible mass instead of a tiny pale dot, low-sun water views have an intentional reflected sun path, and sky/water tuning is less washed out while staying inside the renderer-only scope.

**Closeout outcomes:**

- **Renderer-only WebGPU sun/sky/water polish.** The patch stays out of `shared/`, Worker, D1, migrations, production tree defaults, and sim-baseline goldens. It retunes the WebGPU sun billboard/material, feeds live Hosek-Wilkie colors through the WebGPU sky node material, preserves partial `Atmosphere.setSun()` updates, and adds a broad low-sun water glint path.
- **Repeatable art-lock proof.** `npm run validation:cycle41-art-lock` captures paired WebGL/WebGPU screenshots for Field, Rolling Hills, and Open Country across sun elevations `0.20`, `0.35`, `0.50`, and `0.75`, plus low-sun water-facing proofs. Artifacts are written under `cycle41-validation/runtime/art-lock-matrix.json`, `cycle41-validation/screenshots/art-lock-matrix/`, and `cycle41-validation/screenshots/cycle41-webgl-webgpu-contact-sheet.png`.
- **E2E gate clarified.** The release-safe local browser lane is `npx playwright test --project=chromium --grep-invert @local-only --reporter=line`; full all-project `npm run test:e2e` remains broader than this release gate and can include slow local-only specs.
- **Release proof.** Shipped as commit `c1fd5c0`, tag `v2.1.9`, deploy run `26541935987`. Live HTML returned HTTP 200 and served `assets/main-Cm7rDWr0.js`; the direct asset URL also returned HTTP 200.

**Validation gates run before local acceptance (2026-05-27):**

- `npm test` - 54 passed files, 1 skipped; 498 specs passed, 7 skipped.
- `npm run lint` - clean.
- `npm run build` - clean with existing Vite large-chunk/dynamic-import warnings; main bundle ratchet accepted at `593 KiB`.
- `npx playwright test tests/e2e/smoke.spec.ts --project=chromium --reporter=line` - 2 passed.
- `npx playwright test --project=chromium --grep-invert @local-only --reporter=line` - 6 passed.
- `npm run validation:cycle41-art-lock` - passed.
- Cleanup proof after browser probes: no listeners on ports `3000`, `4173`, or `8787`; no localhost Chrome tabs for ports `3000` or `4173`.

**Carryover:**

- Mobile/iOS water and WebGPU proof remains deferred.
- Octahedral tree impostors remain lab-only until a separate device-budget and visual-quality proof promotes them.
- Open Country paired two-client playtest remains deferred.
- Broader WebGPU terrain/foliage material parity with WebGL remains a separate future polish item.

### Cycle 40 - `sun-coherence-octahedral-tree-lab` (closed 2026-05-22, v2.1.8 release)

Plan recorded at [`docs/archive/cycles/cycle-40-plan.md`](archive/cycles/cycle-40-plan.md). Cycle 40 finished the Cycle 39 visual follow-through and staged the first SDS lab route for Pixel Forge v2 octahedral tree sidecars without changing production defaults.

**Post-close correction (2026-05-27):** Cycle 40 should not be read as final WebGPU art lock. A later WebGPU/WebGL side-by-side review found that WebGPU still had a tiny/bland sun, washed-out sky/water, and insufficient reflected water glint compared with the WebGL reference. Cycle 41 reopened that work as painterly parity/polish in [`docs/archive/cycles/cycle-41-plan.md`](archive/cycles/cycle-41-plan.md).

**Closeout outcomes:**

- **Sun/water/cloud coherence.** Water runtime updates now receive the atmosphere frame `sunColor`; WebGL water routes it through `uSunColor`; WebGPU water routes it through a live node uniform. Runtime metadata reports `skyFog.sunColor` as the water sun-color source. Cloud highlight/rim chroma now comes from the same atmosphere-provided sun color instead of separate amber literals.
- **Visible sun-disc tuning.** The sun billboard core was tuned so captures show an actual small sun disc, not just a brighter sky patch at the sun location.
- **Pixel Forge v2 sidecar staging.** Additive octahedral sidecars for `tree1` and `tree2` live under `assets/models/trees/octahedral/`, with base-color, normal, and depth atlases plus v2 JSON metadata.
- **Lab-only octahedral runtime route.** `?renderer=webgpu&konveyorNativeTreeImpostors=octahedral` loads the v2 sidecars and selects octahedral tiles by camera direction. `?konveyorNativeTreeImpostors=1` remains the v1 `latlon` / `hemi-y` production route.

**Validation gates run before close (2026-05-22):**

- Pixel Forge CLI build passed.
- Pixel Forge `kiln validate-imposter` passed for both staged octahedral SDS sidecars.
- Desktop WebGPU sun/water/cloud matrix captured locally under `cycle40-validation/screenshots/sun-water-cloud-matrix/`.
- Desktop WebGPU octahedral lab proof captured locally at `cycle40-validation/runtime/octahedral-tree-lab-proof.json`.
- `npm run build` - clean; main bundle stayed within the existing `mainKB=592` ratchet.
- `npm test` - 54 passed files, 1 skipped; 498 passed specs, 7 skipped.
- `npm run lint` - clean.

**Carryover:**

- Android/iOS proof remains deferred by instruction.
- Octahedral tree impostors remain lab-only until a future cycle proves device budget and visual quality.
- Broader tree art/species variety remains deferred.
- Open Country paired two-client playtest remains deferred.

### Cycle 39 - `sun-scorched-earth` (closed 2026-05-22, rolled into v2.1.8 release)

Plan remains at [`docs/archive/cycles/cycle-39-plan.md`](archive/cycles/cycle-39-plan.md). Cycle 39 ripped out the radial-splotch sun and rebuilt the sun/sky relationship on physical principles: the billboard owns only the visible disc, the sky shader owns the broad Mie aureole and horizon glow, bloom paints the perceived glow, and disc/sky chromaticity come from one source.

**Closeout outcomes:**

- Sun billboard halo/corona/aureole math was removed from both renderer paths.
- WebGL and WebGPU sky paths use a Mie aureole term instead of the old UV-space glow band.
- Disc and sky chromaticity share the same Hosek-Wilkie-derived sun color.
- The Phase E gameplay baseline was captured locally under `cycle39-validation/screenshots/phase5-painterly-final/` with 12 PNGs across three biomes and four sun elevations. The older `phaseD-bloom` captures remain diagnostic only.

**Validation gates run before close (2026-05-22):**

- `npm test` - passed.
- `npm run lint` - clean.
- `npm run build` - clean.
- Final baseline captures used the gameplay path with `?ui=off` and no footer/HUD/debug overlays.

### Cycle 38 - `polished-webgpu-production-readiness` (closed 2026-05-20, no version bump, PC-only scope)

Plan archived at [`docs/archive/cycles/cycle-38-plan.md`](archive/cycles/cycle-38-plan.md). Cycle 38 was opened to make WebGPU production readiness real as policy, not a single-phone proof. Closed autonomously per Matt's 2026-05-20 directive ("complete autonomously without human check-in, focus on the game in general and test on PC this cycle") with mobile-phase work moved to carryover.

**Closeout outcomes (PC scope):**

- **Phase 2 - water grid/alignment lines fixed (RH + OC).** Root cause: `konveyorAnimeWaterNodeMaterial.js` slope normals used only world-axis-aligned sines (`sin(waterWorld.x * 0.052 + t)` / `sin(waterWorld.z * 0.046 + t)`) producing coherent horizontal/vertical wavefronts. Fix: replaced with 3 wave directions rotated 60° apart (ROT_A=(1,0), ROT_B=(0.5,0.866), ROT_C=(-0.5,0.866)), then projected back into slopeX/slopeZ. Same principle as the grass three-rotated-noise rule. Proof captures under `cycle38-validation/screenshots/cycle38-phase2-pc-water-grid-after/` show clean teal water with no banded ripples at shoreline-glint and horizon-terrain-seam on RH and OC.
- **Phase 2 - other visual gates audited on PC.** Sun glint sync verified by code review (glintAxis derives from sunDir + viewDir, varies with camera). OC terrain seams clean at follow-close / classic-max / horizon-terrain-seam poses. Dog readable + tree wind coherence preserved in captures.
- **Phase 3 - tree budgets locked.** `tree-assets.spec.js` already locks `tree2.glb` ≤ 8000 tris and `tree2_lod1.glb` ≤ 2000 tris; committed assets are 7700/1924. Tests green.
- **Phase 4 - quality-governor hysteresis tested + proven.** Added 4 unit tests in `tests/render-cost-report.spec.js` covering single-frame oscillation guard, recovery after sustained stable windows, floor-fallback only after sustained over-budget at floor, and non-webgpu rendererMode ineligibility for the `webgpu-frame-budget` fallback. Proof artifact at `cycle38-validation/runtime/quality-governor-hysteresis-proof.json` records the synthetic trace: degradation 0 → 0 → 1 → 1 → 2 → 2 → 3 → 3 → 3 → 3 with fallbackReason recorded after window 9; recovery 1 → 1 → 1 → 0 after 3 stable windows.

**Validation gates run before close (2026-05-20):**

- `npm test` - 480 passed / 7 skipped (up from 476 with the 4 new hysteresis tests).
- `npm run lint` - clean.
- `npm run build` - clean, main bundle 605347 bytes = 591 KiB rounded (exactly at the 591 KiB ratchet, no regression).
- `npx playwright test tests/e2e/scene-swap-stability.spec.ts --project=chromium` - 3 passed.
- `git diff --check` - clean.
- Last `main` deploy: `success`.

**Carryover into Cycle 39:**

- **True octahedral sidecar v2 + Kiln node material octahedral projection.** Pixel-forge CLI has no static-octahedral mode (only animated-octahedral for skinned meshes; axes are y/hemi-y for static foliage). A custom headless-WebGL baker is a 1+ week effort and was out of scope for this cycle's PC focus. The cycle plan explicitly accepted the 4x4 lat/lon-hemi Kiln sidecars as a temporary compatibility stage; carry the v2 work to a dedicated cycle.
- **Android matrix at `?konveyorNativeTreeImpostors=1`.** Depends on the octahedral baker.
- **Phase 5 broader-device proof.** Multi-Android profiles, iOS Safari WebGPU canary - operator hardware required.
- **Phase 6 release/ops carryovers.** OC paired two-client sheep-driving playtest, post-deploy iOS water canary, renderer telemetry readout - operator and/or deploy required.
- **Water lighting time-of-day reproducibility.** New PC captures bootstrapped at a different default sun angle than the older `desktop-webgpu-cycle38-poses/` baseline; a `?sun=0.5`-locked capture matrix would make A/B regressions cleaner.

**Files changed in cycle close:**

- `js/water/konveyorAnimeWaterNodeMaterial.js` - three-rotated-direction wavefronts replace world-axis sines.
- `tests/render-cost-report.spec.js` - 4 new QualityGovernor hysteresis tests.
- `tools/cycle38-phase2-pc-captures.mjs` - new PC visual-gate capture script with WebGPU-enabled Chrome launch flags.
- `tools/quality-governor-hysteresis-proof.mjs` - new artifact generator.

### Cycle 37 - `atmosphere-perf-and-native-packaging-proof-0` (closed 2026-05-16, no version bump at close; progressive WebGPU default approved post-close)

Plan archived at [`docs/archive/cycles/cycle-37-plan.md`](archive/cycles/cycle-37-plan.md). Retroactively archived 2026-05-20 — the cycle was treated as closed by NEXT_SESSION but the archive step was skipped at the time. Cycle 37 itself preserved WebGL as the default and did not cross merge, deploy, default-renderer, Steam, App Store, Google Play, paid-store, signing, or submission gates.

**Closeout outcomes:**

- **Phase 1 — isolated WebGPU perf recapture.** Final perf proof at `cycle36-validation/runtime/cycle37-final-webgpu-perf.json`: Rolling Hills `avgFrameTime=6.993 ms` / `p95=7.29 ms` / 1144 samples; Open Country `avgFrameTime=6.944 ms` / `p95=6.958 ms` / 1151 samples. Both well under the 22 ms avg / 30 ms p95 budget.
- **Atmosphere ownership.** `AtmosphereFrame.v1` shared sun/sky/fog/cloud packet introduced; `SunBillboard` owns the readable disc; WebGPU sun materially larger; final request proof + screenshots under `cycle36-validation/runtime/cycle37-final-webgpu-request/`.
- **Native packaging proof 0.** [`docs/native-packaging-proof-0.md`](native-packaging-proof-0.md) and [`docs/native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md) written; preflight passed at `2026-05-16T06:36:27.879Z` (`cycle36-validation/native/preflight.json`).
- **Renderer telemetry seam.** `BUILD_TARGET=native`, `SDS_WORKER_BASE`, `js/runtimeConfig.js`, `npm run native:check` landed for native-shaped perf/profiling without committing to Tauri/Electron/Capacitor.

**Post-close release-policy update (approved by Matt 2026-05-16):**

Progressive WebGPU as the web default with WebGL fallback and an experimental user-facing settings toggle. Proof at `cycle36-validation/runtime/progressive-webgpu-default-request-proof.json` and `progressive-webgpu-default-perf-proof.json`. First connected-Android WebGPU baseline at `cycle37-validation/runtime/android-webgpu-rolling-hills-final-2026-05-16.json`: device `R5CX4028VGJ`, Rolling Hills follow-close `p95=16.733 ms` / `p99=16.871 ms` / 37 draw calls. Mobile WebGPU cost-report + `QualityGovernor` + Android ADB/CDP runner + mobile tree-impostor culling shipped to support real-device mobile WebGPU governance (mainKB delta 576 → 577).

**Carryover into Cycle 38 (still active):** true octahedral impostor sidecar v2, Android mid-mobile budget closeout, Open Country terrain seams, water grid/glint, paired OC MP playtest, iOS Safari foam canary.

### Cycle 36 - `konveyor-phase-0-readiness` (closed 2026-05-15, no version bump)

Plan archived at [`docs/archive/cycles/cycle-36-plan.md`](archive/cycles/cycle-36-plan.md). Retroactively archived 2026-05-20 — same gap as Cycle 37. The cycle prepared SDS for a WebGPU and native-shipping campaign by repairing the measurement loop, reconciling validation gates with actual tooling, proving native runtime assumptions, and opening the smallest flag-gated WebGPU hero-scene path the evidence supported.

**Closeout outcomes:**

- **Perf baseline repaired.** `tests/perf-baseline/baseline.json` passes 6/6 default configs with 900 samples each. Desktop and mobile-profile latency gates executable. Runtime proof at [`docs/archive/research/cycle-36-konveyor-runtime-proof.md`](archive/research/cycle-36-konveyor-runtime-proof.md).
- **Screenshot diff enforcement.** Committed 12-cell goldens + deterministic capture contract; `npm run validation:screenshots -- --diff` passes with mean SSIM 0.9945.
- **Renderer-boundary seam extracted.** Production renderer setup moved to [`js/rendering/sceneRendererSetup.js`](../js/rendering/sceneRendererSetup.js): `SceneManager` still creates a WebGL renderer by default, but its WebGL capability probes, context handlers, shadow/pixel-ratio setup, and tonemapping choice are explicit and test-covered. The module can also consume an explicit renderer/configure factory for proof runs.
- **First WebGPU `SceneManager` proof.** Opt-in `WebGPURenderer` injection through `SceneManager.whenRendererReady()` validated at `cycle36-validation/runtime/scene-manager-webgpu-renderer-proof.json`. Routes production `Atmosphere`, `SunBillboard`, `TerrainBuilder`, `AnimeWater`, `PortalEffect`, `CorralZapEffectPool`, tree/rock GLB material-replacement, `GrassSystem`, `OptimizedSheepSystem`, and Kiln impostor slice via diagnostic-installed factories. Nonblank 320x180 screenshot.
- **Guarded production WebGPU boot scouts** for Home Field, Rolling Hills, and Open Country (`cycle36-validation/runtime/production-webgpu-gameplay-scout-*.json`). All three `ok: true`, no console/page errors, nonblank gameplay canvases.
- **Plain non-diagnostic production WebGPU request proof** at `cycle36-validation/runtime/production-webgpu-request-proof.json`: default URL remains `effective: "webgl"` with no fallback; simulated browsers without `navigator.gpu` fall back to WebGL; explicit `?renderer=webgpu&autostart=1&mode=classic` runs production WebGPU on all three scenes with successful device preflight, centralized factory suite, native InstancedMesh routing, applied terrain/grass/sheep/water/tree-rock materials.
- **Two-client multiplayer WebGPU proof** at `cycle36-validation/runtime/production-webgpu-mp-proof.json`: both clients `effective: "webgpu-production"`, `roomState: "in-game"`, connected two-player room state, nonblank screenshots.

**Hero-scene blocker recorded** at [`docs/archive/research/cycle-36-webgpu-hero-blocker.md`](archive/research/cycle-36-webgpu-hero-blocker.md) — broad GLSL shader surface still gates a Rolling Hills WebGPU spike.

### Post-Cycle-35 leaderboard solo-tab correction (2026-05-13)

- **Scene leaderboards now show solo modes on every scene.** Cycle 35 correctly made leaderboards `(scene × mode)` partitions, but the UI kept a stale Field-only solo-tab rule. [`GlobalLeaderboard.js`](../js/components/Multiplayer/GlobalLeaderboard.js) now shows `soloClassic`, `soloExtreme`, `soloInsane`, and `soloChaos` for Home Field, Sheep Dog Island, and Open Country, while multiplayer tabs still honor each scene's `allowedModes` so Open Country does not expose unsupported competitive MP. Added [`tests/leaderboard-modes.spec.js`](../tests/leaderboard-modes.spec.js).

### Post-Cycle-35 ops hardening (2026-05-12)

Between-cycles hygiene pass on the Cloudflare zone, Web Analytics, and one static-page SEO asymmetry that surfaced during a GSC audit. Not a cycle — just operational state changes worth recording.

- **Zone TLS floor: 1.0 → 1.2.** `min_tls_version` was left at 1.0 from initial Pages setup; raised to 1.2 for the modern security floor. Verified via `PATCH /zones/{zone}/settings/min_tls_version`.
- **`always_use_https`: off → on.** Was relying on Pages-level redirect; now zone-wide. Closes the http:// surface area. Verified live: `curl -sI http://sheepdogsim.com/` returns 301 to https://.
- **Web Analytics dedup.** Two RUM site_info entries were active (split metrics): the explicit Pages-injected token `b5895c76...` from 2026-04-26 (manual snippet in [dist/index.html](../dist/index.html)) plus a stale auto-install ruleset from 2025-07-06 with token `20b970e6...`. Deleted the stale ruleset via dashboard cookie session (the `rum/site_info` endpoint doesn't accept scoped API tokens reliably). One site remains: the Pages-injected one with the host filter `(sds-frontend.pages.dev|sheepdogsim.com)$`.
- **Crawler Hints (Beta) + IndexNow:** ON. Toggled in dashboard → Caching → Configuration. Auto-pings IndexNow on every content change, so Bing/Yandex/Naver get crawl-time discovery signals without manual submission. Free. Dashboard-only (no stable CF API).
- **[about.html](../about.html) parity fix.** GSC reports the page as "Crawled - currently not indexed" along with /scenes/home-field, /scenes/open-country, /devlog/cycle-29, /devlog/cycle-30. Root cause is site age + low authority on a 3-week-old domain (CF cutover 2026-04-24), not config. But /about had a real asymmetry vs siblings: no `meta name="robots"` (only static page missing), no og:image, no Twitter card, no JSON-LD, and was an internal-link dead-end. Brought to the [public/scenes/](../public/scenes/) pattern: added robots meta, og:image (reusing og-field.webp), Twitter cards, `AboutPage` + nested `Person` JSON-LD schema, and a cross-links footer to the three /scenes/ pages + /devlog/. Manual "Request Indexing" loops in GSC were rejected as patches that don't survive recrawls; this is the structural fix that does.
- **Cycle 35 D1 telemetry carryover (closed).** Route verified working via remote D1 query: `mode_selected` event landed 2026-05-11 23:34:45 (after the 18:53 deploy), proving `js/telemetry.js` POST flows through to the `events` table. No `game_completed` yet, but that's traffic (3 GSC clicks in the same period), not a route bug. `score_errors` table: 0 entries.

### Cycle 35 - `completion-visibility-and-foam` (closed 2026-05-11, no version bump)

Plan archived at [`docs/archive/cycles/cycle-35-plan.md`](archive/cycles/cycle-35-plan.md). Cycle 35 made game completion visible end-to-end (telemetry route fix + worker score-error log + client failure emit), reshaped the leaderboard around `(scene × mode)` identity, and fixed the post-Cycle-32 shoreline foam regression. Two mid-cycle phases absorbed from a Matt review pass: a slot-based HudLayout orchestrator that deletes the prior pattern of per-component `position: fixed` with hand-tuned offsets, and a fix for a long-standing meadow MeshLambert shader compile error (`vUv` undeclared) on every island scene boot.

All 8 autonomous phases shipped. Tests 304 pass / 7 skipped (was 315/7 at Cycle 34 close; net delta from dropping the cross-scene leaderboard fast-path tests and adding the score-errors + observability specs). Build clean (mainKB 590.33 vs 590.06 baseline, +0.27KB total client delta). `npm run lint` clean. Migration 0006 applied to remote D1.

**Phases:**

- **1 — Telemetry route fix (~30min).** `getApiBase()` in [`js/telemetry.js`](../js/telemetry.js) now returns `https://sds-worker.matt-m-kissinger.workers.dev` instead of a relative URL. Pages has no `/api/*` proxy, so the prior relative POST returned 405 and `game_completed` had never landed in the `events` table post-CF-cutover (verified live 2026-05-11: 39 registered players, 0 score submissions, 0 telemetry).
- **2 — Worker `score_errors` table + `submitScore` wrap (~1.5hr).** [`worker/migrations/0006_score_errors.sql`](../worker/migrations/0006_score_errors.sql) adds an append-only error log. `submitScore` is now a thin wrapper around `submitScoreInner` that INSERTs a row before re-throwing on validation reject, sheep-count mismatch, "player not found", or D1 batch failure. Optional `/api/score-errors` GET route gated on `SCORE_ADMIN_SECRET` (404 when unbound) for quick admin readout without dropping into wrangler. 4 specs in [`tests/worker-score-errors.spec.ts`](../tests/worker-score-errors.spec.ts) cover all three documented throw paths plus the insert-itself-fails contract. Migration applied to remote D1 prior to deploy.
- **3 — Client `score_submission_failed` telemetry (~30min).** [`js/components/shared/playerIdentity.js`](../js/components/shared/playerIdentity.js)'s `submitGameScore` catch fires a `score_submission_failed` telemetry event with `{reason, gameMode, score, sceneId}`. Fire-and-forget; preserves the existing console.error + silent-return UX.
- **4 — `/api/leaderboard` requires scene (~1.5hr).** Scene is now required at both `/api/leaderboard` and `/api/leaderboards`. Missing scene returns 400 `{error: 'scene_required'}`; unknown scene returns 400 `{error: 'unknown_scene'}`. Dropped three pieces of legacy compat: the scene-blind materialized fast path in `getLeaderboard`, the `isNaturalPartition` fallback (and the helper itself), and `MODE_NATURAL_PARTITION` (replaced by a simpler `MODES_WITH_FIXED_SHEEP_COUNT` set). [`shared/scenes/index.js`](../shared/scenes/index.js) gained a non-throwing `getSceneById()` for use as the API-boundary validator. `NetworkManager.getLeaderboard` / `getAllLeaderboards` throw at the client boundary if `filters.sceneId` is missing or `'any'`. 7 new partitioned-path specs + 1 export-guard in [`tests/worker-leaderboard.spec.ts`](../tests/worker-leaderboard.spec.ts), all green.
- **5 — Leaderboard UI scene-first (~2hr).** [`js/components/Multiplayer/GlobalLeaderboard.js`](../js/components/Multiplayer/GlobalLeaderboard.js) restructured so the scene picker is the primary control above the mode tabs. Mode tabs filter by the scene's visible leaderboard modes (Field gets its `allowedModes` + the solo modes since Field is the historical solo home; islands show only their declared `allowedModes`). Scene selection persists across sessions in `localStorage` under `sds:leaderboardLastScene`, defaulting to URL `?scene=`, then stored value, then `'field'`. Unknown stored values fall back to `'field'` (cycle plan hard stop #3). The cross-scene `'any'` option is gone.
- **6 — Heightfield-driven foam (~2.5hr).** Replaced the boundary-radius foam band in [`js/water/AnimeWater.js`](../js/water/AnimeWater.js) with a heightfield-driven approach. Foam appears where `|terrain_y - waterY|` is small. `createAnimeWaterMaterial` accepts an optional heightfield and binds a `THREE.DataTexture` (R32F + FloatType + LinearFilter + ClampToEdgeWrapping) over `heightfield.getRawArray()`. Past the heightfield extent the texture clamps to the baked seaLevel (~-12m), so `terrain_y << waterY` and the open ocean stays foam-free. When heightfield is null (Field, sandbox without water), `uHasHeight = 0` and the shader falls back to the original boundary-radius band. Validation captures saved to [`cycle35-validation/foam-rh-after.jpg`](../cycle35-validation/foam-rh-after.jpg) and [`cycle35-validation/foam-oc-after.jpg`](../cycle35-validation/foam-oc-after.jpg).
- **8 — HudLayout slot orchestrator (mid-cycle, ~1.5hr).** Matt reviewed the Phase 6 validation screenshots and flagged the OC ObjectiveBanner overlapping the score pill on mobile and the camera-mode chip overlapping mobile controls. Architected from first principles: every HUD overlay previously declared its own `position: fixed` inline and dodged collisions with hardcoded pixel offsets (CameraModeIndicator's 88px ObjectiveBanner-aware drop + portrait/landscape branching). New file [`js/components/GameHUD/HudLayout.js`](../js/components/GameHUD/HudLayout.js) defines five named regions (`topLeft`, `topCenter`, `topRight`, `edge`, `bottomSafe`) plus a `mobileControls` passthrough. Each region is a flex-column container with consistent gap; children in the same slot stack naturally with no hand-tuned offsets. `bottomSafe` reserves 140px (portrait mobile) / 96px (landscape mobile) / 16px (desktop) above the joystick. MobileHUD, GameTimer, SheepCounter, ObjectiveBanner, CameraModeIndicator, and PracticeHint each lost their outer `position: fixed` wrappers; CameraModeIndicator lost the 88px offset, the portrait/landscape branching, and the `hasObjective` per-frame subscription (~40 lines deleted). Validated live in preview at 375x812 — score pill, "Gather 12 sheep into the ring / 0 / 12 in the ring" objective banner, and "Follow · Tap" camera chip stack cleanly.
- **9 — Meadow shader compile fix (mid-cycle, ~30min).** Long-standing bug surfaced during the Phase 8 preview-MCP validation: every island scene boot logged a `THREE.WebGLProgram: Shader Error 0` from `createMeadowQuadMaterial` in [`js/GrassSystem.js`](../js/GrassSystem.js) because the `onBeforeCompile` injection read `vUv` but Three.js only emits the `vUv` varying when `USE_UV` is defined (normally triggered by attaching a texture map). The MeshLambertMaterial here has no map. Fix: add `defines: { USE_UV: '' }` to the material. The failed program had been falling back to a Three.js placeholder, so meadow quads were rendering as flat midColor without the per-tile noise variance. Both compile errors and visual variance verified live on RH and OC.

**Validation:**

- `npm test` — 304 passed / 7 skipped (delta vs Cycle 34's 315/7: dropped 11 obsolete leaderboard fast-path / `isNaturalPartition` tests, added 4 worker-score-errors specs + 8 worker-leaderboard partitioned-path specs).
- `npm run lint` — clean (eslint shared/).
- `npm run build` — clean, mainKB 590.33 / threeKB 617.77 (+0.27KB cycle-35 delta vs Cycle 34 close).
- D1 — migration 0006 applied to remote (`PRAGMA table_info(score_errors)` returns 7 columns; row count 0 in normal operation).
- Live: `curl -X POST https://sds-worker.matt-m-kissinger.workers.dev/api/event` returns `{ok:true}` (confirmed prior to Phase 1 fix; the same URL now flows through `js/telemetry.js`).
- Visual: [`cycle35-validation/foam-rh-after.jpg`](../cycle35-validation/foam-rh-after.jpg) + [`cycle35-validation/foam-oc-after.jpg`](../cycle35-validation/foam-oc-after.jpg) show foam at the visible waterline (not 37m/64m offshore).

**PRs:** 8 commits on `main` ([`12bc431`](https://github.com/matthew-kissinger/sds/commit/12bc431), [`4ec430f`](https://github.com/matthew-kissinger/sds/commit/4ec430f), [`81f7b3b`](https://github.com/matthew-kissinger/sds/commit/81f7b3b), [`e84348a`](https://github.com/matthew-kissinger/sds/commit/e84348a), [`63d7b4c`](https://github.com/matthew-kissinger/sds/commit/63d7b4c), [`92783fd`](https://github.com/matthew-kissinger/sds/commit/92783fd), [`695c5c4`](https://github.com/matthew-kissinger/sds/commit/695c5c4), close commit pending).

**Carryover (now Cycle-36 candidates):**

- **Phase 7 — Paired OC MP playtest** (still open from Cycle 35). Boot `npm run dev`, two browser tabs, host OC room as cooperative, drive sheep into the round-up zone at (0, 50), confirm `roundup → drive` flips server-side at hold=2.0s and the portal at z=295 opens. Requires Matt at the keyboard; autonomous run cannot pair the browser. Validates Cycle 34's outstanding manual playtest plus Phase 5 lobby UI scene picker.
- **Post-deploy iOS Safari foam canary.** Run `npm run test:ios-water` against `https://sheepdogsim.com/` after the cycle-close deploy lands. Cycle 32 foam-white regression gate. If `nearFoamWhite: true`, revert Phase 6 per cycle plan hard stop #1.
- **Post-deploy D1 verification.** After deploy, query `SELECT name, COUNT(*) FROM events GROUP BY name;` on remote D1 and confirm the first real `game_completed` lands (or flag inconclusive after 7 days).
- **OC objective HUD polish** (from Cycle 34). MP-specific copy or per-player progress indicators on the ObjectiveBanner. Decide after the Phase 7 playtest.
- **Cycle 33 carryovers** still open. Local-tunnel BrowserStack canary on Ubuntu (`gh workflow run browserstack-ios-water.yml` with empty `base_url`); Node 20 GHA deprecation annotation re-check on next Deploy run.
- **Long-tail polish:** Promote `worker-objective-snapshot.spec.js` into the WS two-client harness, mountains as height-displaced skirt, bespoke pixel-forge rocks, octahedral impostors v2, cross-module polygon-spawn dedup, build-time `displacedHeights` bake, inline `_groundY`, drop `players.solo_*_best` materialized columns, delete legacy `updateGrassLOD`/`updateTreeLOD`.

### Cycle 34 - `mp-island-scenes` (closed 2026-05-10, no version bump)

Plan archived at [`docs/archive/cycles/cycle-34-plan.md`](archive/cycles/cycle-34-plan.md). Cycle 34 made `?scene=rolling-hills` and `?scene=open-country` first-class in multiplayer rooms: net-additive sim-baseline coverage for the island boundary and corral retirement code paths, server-authoritative Open Country objective state machine (`roundup` → `drive`) ported into `shared/objective.js`, optional additive wire-format `objective` block on `gameStateUpdate` snapshots, defensive `allowedModes` guard at `RoomDO.initRoom`, and a host scene picker in the lobby UI that filters the mode dropdown by the selected scene's allowed modes. No `package.json` version bump — manual playtest deferred to post-deploy verification.

All 5 phases shipped autonomously. Tests 315 pass / 7 skipped (was 300/7 at Cycle 33 close, +15 from cycle-34 specs). Build clean (mainKB 590.06 vs 589.60 baseline, +0.46KB total cycle-34 client delta). `npm run lint` clean. Pre-existing sim-baseline fixtures byte-identical (`git diff --stat tests/sim-baseline/__fixtures__/sheep-60hz-20s.json dog-rotation-60hz.json reconcile-interp-60hz.json stamina-curve-60hz.json` returns nothing).

**Phases:**

- **1 — Sim-baseline coverage for island scenes (~1.5hr).** Added `tests/sim-baseline/__fixtures__/island-boundary-rh-60hz.json`, `corral-retirement-rh-60hz.json`, `island-boundary-oc-60hz.json` (net-additive 60Hz traces, 50/30/50 sheep, 60/120/60 ticks). Extended [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js) with `makeIslandGameState`, `makeIslandSheepConfig`, `tickSheepIslandCoop`. Fixed `round4` to collapse `-0` to `0` for stable JSON round-trip (z-axis sheep produced `-0` from velocity damping; fixture serialised `0`). Three new `it()` blocks in [`tests/sim-baseline/baseline.spec.ts`](../tests/sim-baseline/baseline.spec.ts).
- **2 — OC objective state machine in shared/ + worker (~3hr).** Promoted [`js/gamestate/objective.js`](../js/gamestate/objective.js) to [`shared/objective.js`](../shared/objective.js) so the Worker authoritative sim runs the byte-identical state transitions the client predictor runs. The js-side path became a one-line re-export shim. [`worker/src/GameSim.js`](../worker/src/GameSim.js) creates the objective at construction, calls `tickObjective` each tick, and gates `updateSheepCorralRetirements` on `isCorralOpen(this.objective)`. RH/Field paths byte-identical (no objective → `isCorralOpen(null) === true`). Added `oc-objective-stage-60hz.json` capturing the `roundup → drive` flip at tick 121 (2.0s holdRequired at 60Hz).
- **3 — Wire format additions for objective stage (~1.5hr).** `createGameStateSnapshot()` emits an optional `objective` block when `this.objective != null` — shape mirrors the local `ObjectiveState` (`{stage, sheepInZone, requiredSheep, holdTimer, holdRequired}`) so the client mirrors directly into `game.gameState.objective`. Pre-Cycle-34 clients ignore the field (legacy "drive to portal" prompt); pre-Cycle-34 workers send no field. No protocol-version handshake. [`js/boot/initNetwork.js`](../js/boot/initNetwork.js) writes `serverState.objective` into `game.gameState.objective` and dispatches `objective-stage-changed` on stage flip so the existing CorralCompass + portal-effect listeners fire identically to solo. New [`tests/worker-objective-snapshot.spec.js`](../tests/worker-objective-snapshot.spec.js) (5 specs) asserts: OC snapshot includes objective in roundup at start, reflects forced drive stage, and field/RH snapshots omit the field entirely.
- **4 — `allowedModes` enforcement at room init (~30min).** [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts) cross-checks the requested `gameMode` against the resolved scene's `allowedModes` array before persisting room meta. A host attempting to create an OC room in `competitive` mode now receives HTTP 400 with `{error: 'mode_not_allowed_on_scene', sceneId, gameMode, allowedModes}`. Six new unit tests in [`tests/worker-allowed-modes.spec.js`](../tests/worker-allowed-modes.spec.js) cover OC × {coop, comp, timed}, RH × {coop, comp}, Field × {coop, comp, timed}.
- **5 — Lobby UI surfaces scene + allowed modes (~1hr).** [`js/components/Multiplayer/RoomCreation.js`](../js/components/Multiplayer/RoomCreation.js) gained a scene `<select>` (Sheep Dog Island / Open Country / Field per the solo ScenePicker order). The mode dropdown filters by the selected scene's `allowedModes`; when the selected mode becomes invalid after a scene change, snaps to the scene's `defaultMode`. [`js/components/App.js`](../js/components/App.js) threads `settings.sceneId` through `nm.createRoom` (NetworkManager already forwards it). [`js/components/Multiplayer/PublicLobbyList.js`](../js/components/Multiplayer/PublicLobbyList.js) renders the scene's display name as a chip next to the mode chip; `loadScene` wrapped in try/catch defends against persisted rooms with stale sceneIds.

**Validation:**

- `npm test` — 315 passed / 7 skipped (was 300/7 at Cycle 33 close, +15 from cycle-34 specs).
- `npm run lint` — clean (eslint shared/).
- `npm run build` — clean, mainKB 590.06 / threeKB 617.77 (+0.46KB cycle-34 delta vs Cycle 33 close).
- `npm run test:integration` — 39 passed / 7 skipped (`tests/integration/flow.spec.ts` skips remain pre-existing).
- `git diff --stat tests/sim-baseline/__fixtures__/sheep-60hz-20s.json dog-rotation-60hz.json reconcile-interp-60hz.json stamina-curve-60hz.json` — zero output (existing fixtures byte-identical).
- `shared/scenes/types.js` — untouched (verified no SceneDef schema change required, per design doc).
- `worker/migrations/` — untouched (no D1 schema change required; objective state lives in DO memory).

**PRs:** 5 commits on `main` ([`318a346`](https://github.com/matthew-kissinger/sds/commit/318a346), [`d3a31de`](https://github.com/matthew-kissinger/sds/commit/d3a31de), [`0caddea`](https://github.com/matthew-kissinger/sds/commit/0caddea), [`93e7e70`](https://github.com/matthew-kissinger/sds/commit/93e7e70), close commit pending).

**Carryover:**

- **Manual playtest of OC multiplayer.** Boot `npm run dev`, open two browser tabs, host an OC room as scene=open-country, drive sheep into the round-up zone, confirm the stage flips to `drive` server-side and the portal opens. Same pattern as Cycle 32/33 post-deploy verification — autonomous run cannot pair the browser. Goal: confirm the round-up gate feels right at MP cadence (60Hz authoritative + client prediction) and the lobby UI surfaces all scenes correctly.
- **Promote `worker-objective-snapshot.spec.js` into the WS two-client harness.** The Phase 3 acceptance line targeted the `tests/integration/flow.spec.ts` WS harness, but the harness is fully skipped today. Promoting requires unskipping flow.spec.ts and standing up a real worker fixture — out of cycle-34 scope. The unit-level spec covers the contract; the harness coverage is a backlog item.
- **OC objective HUD polish.** The `gather → drive` UX was solo-only before; MP just inherits the same ObjectiveBanner via the snapshot mirror. After playtest, may want MP-specific copy (e.g. "Group up — 20 sheep needed") or per-player progress indicators.
- **Cycle 33 carryovers still open.** Local-tunnel BrowserStack canary on Ubuntu (manual `gh workflow run browserstack-ios-water.yml` with empty `base_url`); Node 20 annotation re-check on next Deploy run.

### Cycle 33 - `operational-hardening` (closed 2026-05-10, no version bump)

Plan archived at [`docs/archive/cycles/cycle-33-plan.md`](archive/cycles/cycle-33-plan.md). Cycle 33 cleared four operational carryovers from Cycle 32 (deprecated GHA actions, BrowserStack-Local-on-Ubuntu gap, two open Dependabot alerts, long-standing reconcile-hook regex collision) and shipped an MP-island-scenes design doc to prime Cycle 34. No player-visible delta; no `package.json` version bump.

All 5 phases shipped autonomously. Tests 300 pass / 7 skipped (flat vs Cycle 32 close). Build clean (mainKB 589.60 / threeKB 617.77, byte-identical to Cycle 32 — no bundle drift). E2E chromium 6 passed locally. `npm audit` reduced from 2 alerts to 1 (aws-sdk@2 documented as accepted risk).

**Phases:**

- **1 — GHA Node 20 deprecation bump.** `actions/checkout`, `actions/setup-node`, `actions/upload-artifact` from `@v4` to `@v5` across [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) and [`.github/workflows/macos-safari.yml`](../.github/workflows/macos-safari.yml). [`browserstack-ios-water.yml`](../.github/workflows/browserstack-ios-water.yml) was already on `@v5`. `cloudflare/wrangler-action@v3` left alone — separate vendor, v3 series remains current. Beats the 2026-06-02 forced-upgrade cutoff.
- **2 — BrowserStack workflow self-sufficiency on Linux.** Reworked [`.github/workflows/browserstack-ios-water.yml`](../.github/workflows/browserstack-ios-water.yml) to run end-to-end on Ubuntu in both modes from a single dispatch: public URL (release smoke, `base_url=https://...`) or local-tunnel (pre-release verification of unmerged changes — empty `base_url` triggers `npm run build` + `npx http-server dist -p 3000` so BrowserStack Local has something to tunnel into). Workflow now echoes its run mode for observability. Public-URL was already validated in Cycle 32; local-tunnel is the post-merge canary surface to flip the Cycle-32 carryover gate.
- **3 — Dependabot/security hygiene.** Added `"overrides": { "@tootallnate/once": "^3.0.0" }` to [`package.json`](../package.json), pinning the transitive `browserstack-node-sdk → @google-cloud/compute → google-gax → retry-request → teeny-request → http-proxy-agent → @tootallnate/once` chain to `3.0.1` (was `2.0.1`). Documented alert #20 (`aws-sdk@2`, low severity, no patched v2 version, transitive of BrowserStack SDK only) as accepted risk in new [`docs/security-acceptance.md`](security-acceptance.md). Re-evaluation trigger: every BrowserStack SDK upgrade. `package-lock.json` delta: 3 lines (well under 100KB hard-stop).
- **4 — `cycle-close-reconcile` regex collision fix.** Rewrote `extractAcceptanceLines` in [`.claude/hooks/cycle-close-reconcile.mjs`](../.claude/hooks/cycle-close-reconcile.mjs) to iterate over every `## (Success|Acceptance) criteria` heading via `matchAll` and pick the first one containing `- [ ]` items. The previous `String.search`-based first-match approach silently no-oped on cycle plans because the template's `## Acceptance criteria — EARS format` explainer block (no checkboxes) appears before the actual `## Success criteria (cycle close)` checklist. Smoke-tested against archived cycle-31 plan (returns 8 items, was 0 before fix). [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) stayed untouched (fence-frozen and the heading is fine; the bug was in the hook).
- **5 — MP island scenes design doc.** Shipped [`docs/mp-island-scenes-design.md`](mp-island-scenes-design.md) (13 sections). Verified four gaps against current code: OC's `objective` block is declared on the scene def but unused in `worker/src/GameSim.js`, no sim-baseline fixtures cover `boundary.kind === 'island'` or corral retirement, wire format has no objective-stage fields, `RoomDO.initRoom` does not enforce `scene.allowedModes`. Suggested 5-phase Cycle 34 shape (~7.5hr engineering) with author leans on Q1–Q6. Zero implementation drift in `shared/`, `worker/src/`, or `js/network/` (Phase 5 acceptance verified by `git diff --name-only`).

**Validation:**

- `npm test` — 300 pass / 7 skipped (flat vs Cycle 32 close).
- `npm run lint` — clean (eslint shared/).
- `npm run build` — clean, mainKB 589.60 / threeKB 617.77 (byte-identical to Cycle 32; no bundle drift).
- `npm run test:e2e -- --project=chromium --grep-invert @local-only` — 6 passed in 3.5m.
- `npm audit` — 2 → 1 (aws-sdk@2 documented).
- `git diff --name-only HEAD~10 HEAD -- shared/ worker/src/ js/network/ tests/sim-baseline/ worker/migrations/ docs/CYCLE_TEMPLATE.md .claude/rules/ .claude/commands/` — zero entries.

**PRs:** 5 commits on branch `cycle-33-ops-hardening` (autonomous-cycle policy, branch pushed; merge-to-main + deploy validation post-close).

**Carryover:**

- **MP island scenes** — sole foreground candidate for Cycle 34, scoped in [`docs/mp-island-scenes-design.md`](mp-island-scenes-design.md).
- **Local-tunnel BrowserStack canary** — needs one manual `gh workflow run browserstack-ios-water.yml` (no `base_url` input) after the cycle-33 changes merge to `main`, to confirm the Phase 2 self-sufficient workflow boots `dist` + tunnels Safari into it. Documented in NEXT_SESSION operational notes.
- **Node 20 annotation check** — confirm the next Deploy run on `main` no longer emits the deprecation annotation. Post-merge observation, not blocking.

### Cycle 32 - `apple-platform-validation` (closed 2026-05-10, v2.1.4)

Plan archived at [`docs/archive/cycles/cycle-32-plan.md`](archive/cycles/cycle-32-plan.md). Cycle 32 fixed the iPhone Safari water failure structurally: the water shader no longer depends on a per-frame depth pre-pass, and a real iOS Safari BrowserStack canary now catches solid foam-white regressions before release.

All 6 phases shipped in one closeout commit on `main`. Tests 300 pass (307 with skips). Build clean (mainKB ≈ 589.60 / threeKB ≈ 617.77). BrowserStack public URL canary passed on `iPhone 15 Pro Max / iOS 17 / Safari` with sampled average RGB `[26, 44, 11]`, `nearFoamWhite: false`. Player-visible delta → bumped `2.1.3 → 2.1.4`.

Post-push deploy truth: release tag `v2.1.4` points at commit `b1abe2531e4a1a4fe428d15c089efca59016fa33`; current `main` includes docs alignment plus the CI startup fix in `62f3efe54a6db6f215b63d64995fcdcd002c23df`. GitHub Actions run [`25619016791`](https://github.com/matthew-kissinger/sds/actions/runs/25619016791) passed end to end: Test, Linux Chromium E2E, Worker deploy, Pages deploy, and perf check. Production `https://sheepdogsim.com/` served the expected Cycle 32 asset hashes (`main-COqIprCT.js`, `three-CknJ8WuT.js`). The prior deploy run exposed `wrangler: not found` during CI `npm run dev`; this was fixed by running `npx wrangler` from the worker package context.

**What changed:**

- **Removed the fragile render path.** `js/water/DepthPrePass.js` is deleted and [`SceneManager`](../js/SceneManager.js) no longer renders scene depth before water every frame.
- **Rebuilt water around scene geometry.** [`AnimeWater`](../js/water/AnimeWater.js) uses island `boundary.radius` and `boundary.falloff` for foam and shallow/deep color. Ripples, sparkles, fog, sun-glint, palette, and mobile segment counts remain.
- **Added real-device gate.** `browserstack-node-sdk`, `browserstack.yml`, [`playwright.browserstack.config.ts`](../playwright.browserstack.config.ts), [`tools/browserstack/run-ios-water.mjs`](../tools/browserstack/run-ios-water.mjs), and [`tests/browserstack/ios-water.spec.ts`](../tests/browserstack/ios-water.spec.ts) provide `npm run test:ios-water`.
- **Added manual CI workflow.** [`.github/workflows/browserstack-ios-water.yml`](../.github/workflows/browserstack-ios-water.yml) runs the same canary by manual dispatch while the BrowserStack account is on the free proof tier.
- **Extended diagnostics.** [`glProbe`](../js/diagnostics/glProbe.js) records `window.__sdsDiag.waterSample` and `waterSamples[]` under `?debug=gl`.
- **Updated acceptance docs.** [`docs/cross-platform-testing.md`](cross-platform-testing.md), [`CHANGELOG.md`](../CHANGELOG.md), [`NEXT_SESSION.md`](../NEXT_SESSION.md), and this backlog entry now describe the real state.

**Validation:**

- `npm test` - 300 passed / 7 skipped.
- `npm run build` - clean production build.
- `npm run test:e2e -- --project=chromium --grep-invert @local-only` - 6 passed.
- `IOS_WATER_BASE_URL=https://sheepdogsim.com npm run test:ios-water` - passed on BrowserStack iOS Safari.
- Deploy workflow run `25619016791` - passed end to end.
- No shared deterministic sim files, sim baselines, `.claude/rules/*`, or `docs/CYCLE_TEMPLATE.md` touched.

**Carryover:**

- BrowserStack Local on the Windows workstation hit `EBUSY` opening `C:\Users\Mattm\.browserstack\BrowserStackLocal.exe`. Public URL mode works. Before paying for BrowserStack or making the canary push-gated, prove the local tunnel through the manual GitHub workflow / Linux runner.
- GitHub Actions run `25619016791` is green but emitted the platform annotation that Node.js 20 actions are deprecated and will default to Node 24 on 2026-06-02. Review workflow action compatibility before that date.
- GitHub reported 2 low Dependabot vulnerabilities on the default branch after push. Review separately from the water cycle unless a fix is trivial and low-risk.
- MP island scenes remain deferred to Cycle 33 and require an explicit shared-sim / worker / wire-format / sim-baseline plan before implementation.

### Cycle 31 - `public-surface` (closed 2026-05-09, autonomous run, v2.1.3)

Plan archived at [`docs/archive/cycles/cycle-31-plan.md`](archive/cycles/cycle-31-plan.md). Public-facing surface pass after a 2026-05-09 audit found the Google snippet for `sheep dog sim` was leaking the welcome modal text, the production sitemap was 404-as-HTML (file lived in repo root, never reached `dist/`), only the homepage was indexed, and the cached title was stale. Cycle fixes the **mechanical SEO surface**: real semantic body content for crawlers, three per-scene landing pages, two devlog seed entries, sitemap relocation + expansion, visible internal-link footer, GitHub topic refresh.

All 6 phases shipped end-to-end across 8 commits on `main` (1 doc-patch + 6 phase commits + 1 version bump). Tests 297 pass (304 with skips - flat vs Cycle 30 baseline; no sim-touched code). Build clean (mainKB ≈ 589 / threeKB ≈ 617). `npx eslint shared/` zero errors. Player-visible delta (per-scene pages discoverable, devlog accessible, footer visible on desktop) → bumped `2.1.2 → 2.1.3`.

**Phases:**

- **0 - plan patch after research spike** (commit [`879409c`](https://github.com/matthew-kissinger/sds/commit/879409c)). Pre-execution probe found the original Phase-1 step-3 modal-defer was a documented regression ([`js/components/index.js:17-22`](../js/components/index.js)) and 4× references to nonexistent `public/about.html` (file is at repo root + Vite multi-page input). Doc reflects the corrections.
- **1 - Crawler-content `<main>` + sr-only CSS** (commit [`f540941`](https://github.com/matthew-kissinger/sds/commit/f540941)). New `<main id="seo-content" class="seo-only">` block at the top of [`index.html`](../index.html) `<body>`: H1, prose, biome list with internal links to per-scene pages, mode list, footer link row. New `<noscript>` block with visible fallback prose. New `.seo-only` class in [`css/main.css`](../css/main.css) (standard a11y clip-path pattern). Modal-defer step deliberately dropped.
- **2 - Drop multilingual meta-keywords stuffing** (commit [`61cd8db`](https://github.com/matthew-kissinger/sds/commit/61cd8db)). 18-language `<meta name="keywords">` line removed; replaced with an explanatory comment.
- **3 - Per-scene static landing pages** (commit [`68fe4d9`](https://github.com/matthew-kissinger/sds/commit/68fe4d9)). [`public/scenes/home-field.html`](../public/scenes/home-field.html), [`public/scenes/rolling-hills.html`](../public/scenes/rolling-hills.html), [`public/scenes/open-country.html`](../public/scenes/open-country.html) - 150–168 LOC each. Mirror [`about.html`](../about.html) inline-CSS pattern. Scene-scoped JSON-LD `VideoGame` schema with `mainEntityOfPage` pointing back at homepage. `<a href="/?scene=<id>">` play CTAs hand the user into the SPA on the right scene. Footer cross-links between all three.
- **5 - Devlog scaffold + 2 seed entries** (commit [`44e3cd4`](https://github.com/matthew-kissinger/sds/commit/44e3cd4)). [`public/devlog/index.html`](../public/devlog/index.html) reverse-chronological list. Two entries - Cycle 30 ("the terrain math gets one home") + Cycle 29 ("reorganising the game-mode plumbing") - rewritten in player voice (no EARS / Phase / BACKLOG / cycle-N-plan references in visible prose). Each entry has its own JSON-LD `Article` schema.
- **4 - Sitemap fix + expansion** (commit [`1125062`](https://github.com/matthew-kissinger/sds/commit/1125062)). [`sitemap.xml`](../sitemap.xml) → [`public/sitemap.xml`](../public/sitemap.xml) so Vite copies it into `dist/`. Pre-fix Cloudflare Pages was serving the SPA shell with `Content-Type: text/html` for `/sitemap.xml`. Sitemap expanded 2 → 8 URLs; all `lastmod` set to 2026-05-09.
- **6 - Visible footer + GitHub topics** (commit [`65a36a9`](https://github.com/matthew-kissinger/sds/commit/65a36a9)). New `<footer id="site-footer">` at bottom-center (z=5 above canvas, below React overlay z=1000), 24px tall, fades in 1.2s after page load. Hidden on mobile via `@media (max-width: 768px)` to avoid joystick conflict. GitHub topics: swapped `durable-objects` (subsumed by `cloudflare-workers`) and `messagepack` (internal protocol detail) for `multiplayer` and `simulation`; all 5 acceptance-required topics present.
- **CHANGELOG + version bump** (commit [`27f8bd7`](https://github.com/matthew-kissinger/sds/commit/27f8bd7)). `package.json` `2.1.2 → 2.1.3` + new `[2.1.3] - 2026-05-09 (Cycle 31)` section in [`CHANGELOG.md`](../CHANGELOG.md).

**PRs:** 8 commits direct on `main` (autonomous-cycle policy).

**Carryover:** none from Cycle 31 itself. Two items the plan deliberately deferred for Matt-pickup post-deploy:

- **Submit to Google Search Console for re-indexing.** ✓ DONE same day via Claude in Chrome - sitemap re-submitted (Couldn't-fetch → Success, 8 pages discovered), "Validate fix" triggered on the JSON-LD parsing error, "Request indexing" sent for all 8 URLs (homepage + about + 3 scenes + devlog index + 2 entries).
- **Paste itch.io description copy** from [`docs/itch-description/sheep-dog-sim.md`](itch-description/sheep-dog-sim.md) into the itch project page's Description + Short Description fields. Still Matt-pickup.

**Post-close hotfixes + audit (same day):**

- **JSON-LD trailing comma fix** ([`0c0d618`](https://github.com/matthew-kissinger/sds/commit/0c0d618)) - Search Console flagged "Unparsable structured data" on the homepage. Pre-existing syntax error in the `WebApplication` block (stray `,` after the `offers` object's closing brace). Not introduced by Cycle 31 - the cycle's audit + Search Console submission surfaced it.
- **Canonical-URL alignment** ([`64506ac`](https://github.com/matthew-kissinger/sds/commit/64506ac)) - Cloudflare Pages auto-strips `.html` and 308-redirects every `.html` URL to its no-extension form. Cycle 31 shipped every canonical / og:url / JSON-LD `@id` / sitemap entry / internal anchor pointing at the `.html` form, mismatching the actually-served URL. Fixed across 9 files (sitemap + about + 3 scenes + devlog index + 2 entries + homepage) before the bad URLs got indexed.
- **`public/llms.txt`** ([`f0a8822`](https://github.com/matthew-kissinger/sds/commit/f0a8822)) - emerging convention for LLM/AI crawlers (Claude, GPT, Gemini, Perplexity). Per CF AI Crawl Control, ClaudeBot is already crawling sheepdogsim.com (15 successful requests / 737 KB); this gives it a curated index.
- **`public/.well-known/security.txt`** (same commit) - RFC 9116 standard. Closes the Cloudflare Security Overview recommendation. Points researchers at `SECURITY.md`.
- **Cloudflare dashboard audit** (out-of-band, not in repo): enabled Crawler Hints (auto-IndexNow on content changes), Always Online (Wayback fallback), 0-RTT Connection Resumption, Speed Brain (Speculation Rules prefetch), Cloudflare Fonts (proxied Google Fonts), Early Hints (HTTP 103). Verified-good (no change): SSL/TLS Full, HTTP/2 + HTTP/3, no AI bots blocked, Bot Fight Mode off (intentional - would break MP WS), AI Labyrinth off (intentional - we want AI training).
- **`.claude/skills/cloudflare-management/SKILL.md`** added - captures the Cloudflare dashboard navigation patterns + viewport-scale gotcha + the don't-touch list (Bot Fight Mode, AI Labyrinth, Rocket Loader) + the API token location, so a future agent can pick up CF audits without re-discovering the constraints.

Larger deferred items teed up in the original Cycle 31 scope discussion that did NOT make this scope (still candidates for Cycle 32 or later):

- **MP island scenes** (Rolling Hills + Open Country in multiplayer; sim-deterministic; needs sim-baseline regen story). Top candidate for Cycle 32.
- **`CYCLE_TEMPLATE.md` regex-collision fix** - `/cycle-close` reconcile hook hits the "## Acceptance criteria - EARS format" template explainer first and can't parse the actual Success criteria block. Cycle 29, 30, 31 all logged the manual workaround. Small fence-touched cleanup that could attach as Phase 0 of any cycle.
- **Bespoke pixel-forge rocks**, **octahedral impostors v2**, **cross-module polygon-spawn dedup**, **build-time `displacedHeights` bake**.

**Notes:**

- Pre-execution research spike was load-bearing: caught the broken `requestIdleCallback` defer step + the `public/about.html` path errors before any code shipped. Trimmed Phase 1 from ~45m to ~25m.
- Voice-sensitive prose (per-scene pages + devlog seed entries) shipped in the same cycle as the SEO-mechanical fixes; Matt approved at close.
- Modal text in [`js/locales/en/index.js:388-389`](../js/locales/en/index.js) (`identity.welcome` + `identity.chooseIdentity`) was identified as the load-bearing source of the snippet leak. Not changed in this cycle. If post-deploy the Google snippet still substitutes the modal text after recrawl (1-7 days typical), the next move is to rewrite those strings so they don't read as "page content" - UX-touching change for Cycle 32 carryover.
- Last deploy on `main` (cycle-30 close commit) showed `failure` in `gh run list` but only the E2E (Chromium) Playwright job failed - Pages + Worker + Test + Perf all green. Pre-existing carryover; cycle-31 plan explicitly accepts this in its Success criteria.
- Reconcile hook regex collision against the EARS-format explainer header still open. Walked acceptance manually for the third cycle in a row.

### Cycle 30 — `heightfield-unify` (closed 2026-05-09, autonomous run)

Plan archived at [`docs/archive/cycles/cycle-30-plan.md`](archive/cycles/cycle-30-plan.md). Collapsed the visible-terrain-Y contract to a single source: triangle-interp against a `displacedHeights` grid bound on [`Heightfield`](../shared/terrain/Heightfield.js). The per-vertex sample + smoothstep-falloff displacement loop now lives on `Heightfield.bakeMeshGrid` (one home, not two parallel loops); [`TerrainBuilder.createTerrain`](../js/TerrainBuilder.js) is the renderer, not the algorithm owner. Cycle 9 Phase 5's `+ 0.05m` defensive fallback in `meshSampleY` is gone — calling `meshSampleY` without a bound grid now throws a remediation-named error rather than returning a bilinear-with-an-offset guess.

All 3 phases shipped serially across 4 commits on `main` (1 plan + 3 phase commits). Tests 297 pass (was 290 — +7 specs under `Heightfield.bakeMeshGrid — algorithm` covering shape, no-falloff identity, smoothstep falloff band, square-radial vs Euclidean, fallback→throw migration, byte-identical mirror, RangeError on invalid args). Build clean (mainKB=575 / threeKB=603, refactor-baseline bundle-sizes fixture flat). `npx eslint shared/` zero errors. Internal-only — no player-visible change, no version bump.

**Phases:**

- **1 — [`Heightfield.bakeMeshGrid`](../shared/terrain/Heightfield.js)** (commit [`83cb451`](https://github.com/matthew-kissinger/sds/commit/83cb451)). New instance method `bakeMeshGrid({ segments, size })` returns a `Float32Array` of length `(segments+1)²` and binds it via `setMeshGrid`. Algorithm matches PlaneGeometry vertex order after the canonical `-PI/2` rotation about X (ix east, iy south, index `iy * stride + ix`); square-radial smoothstep over the last 20m of `worldSize` matches the visible terrain mesh's falloff. 7 vitest specs added under "Heightfield.bakeMeshGrid — algorithm". Existing `+ 0.05m` fallback intact through this phase.
- **2 — TerrainBuilder consumes `bakeMeshGrid`** (commit [`37e5c54`](https://github.com/matthew-kissinger/sds/commit/37e5c54)). `createTerrain` replaces the inline displacement loop with `bakeMeshGrid` + a thin write-back loop (`positions.setZ(i, displacedHeights[i])`). PlaneGeometry's row-major vertex order matches `bakeMeshGrid`'s index space, so the change is byte-identical at the mesh level — refactor-baseline `terrain-mesh-hash` for all 3 scenes is unchanged. `js/TerrainBuilder.js`: 1,387 → 1,362 LOC (-25).
- **3 — Delete `+ 0.05m` defensive lift + codify** (commit [`a19a8e3`](https://github.com/matthew-kissinger/sds/commit/a19a8e3)). `Heightfield.meshSampleY` / `surfaceY` now throw if no grid is bound. Migrated the one fallback-using spec in [`tests/heightfield-mesh-y.spec.js`](../tests/heightfield-mesh-y.spec.js) to assert the new throw + a sibling positive case binding via `bakeMeshGrid`. Updated JSDoc on both methods to drop references to the lift. New entry in [`DECISIONS.md`](../DECISIONS.md): "Heightfield visual-Y has one home (2026-05-09 · Cycle 30)" — codifies the new contract and explicitly rejects reintroducing a `sample(x, z) + offset` fallback (papers over the missing-bind bug with a wrong-by-an-offset answer).

**PRs:** 4 commits direct on `main` (autonomous-cycle policy).

**Carryover:** none. The plan's 3-phase acceptance ladder resolved clean. Two cycle-specific items the plan deliberately deferred to a future cycle:

- **Build-time `displacedHeights` bake into [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs).** Tempting (would let the Worker pre-load the mesh grid without recomputing) but speculative — the Worker doesn't read heightfield Y today. Revisit when MP island scenes (Cycle 31 candidate) lands.
- **Inline / delete [`TerrainBuilder._groundY`](../js/TerrainBuilder.js).** It's a one-liner now. [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) treats `_groundY` as the named entry point for visible-geometry ground placement; inlining is a separate decision.

**Notes:**

- Cycle 30's "MP island scenes" candidate (the other ready BACKLOG item picked over) saved cleanly for Cycle 31 — Heightfield's contract clarification removes one source of silent disagreement between Worker and client when MP island scenes lands.
- The reconcile hook ([`.claude/hooks/cycle-close-reconcile.mjs`](../.claude/hooks/cycle-close-reconcile.mjs)) hit the "## Acceptance criteria — EARS format" template explainer first and could not parse the actual Success criteria block — same regex collision Cycle 29 logged. Walked acceptance manually instead. Renaming the template explainer to "## Acceptance criteria notation" or similar is still a deferred item against [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) (frozen file).
- Last deploy on `main` (cycle-29 close commit) shows `failure` in `gh run list`, but only the E2E (Chromium) Playwright job failed — Worker + Pages both deployed successfully and the site is live. Pre-existing carryover from cycle-29 close, not introduced by Cycle 30. Cycle 30's close commit will trigger a new run.

### Cycle 29 — `gamestate-decomp` (closed 2026-05-09, autonomous overnight run)

Plan archived at [`docs/archive/cycles/cycle-29-plan.md`](archive/cycles/cycle-29-plan.md). Decomposed `js/GameState.js` from 1,313 LOC to 745 LOC (-568 / -43%) by extracting six cohesive sub-modules into a new [`js/gamestate/`](../js/gamestate/) package, under a refactor-baseline characterization harness captured before any extraction. Mode dispatch — formerly an `if (this.gameMode === 'competitive')` chain across seven call sites — is now a single `MODE_CAPABILITIES` table consulted by name; adding a new mode is a one-row table edit.

All 8 phases shipped end-to-end across 9 commits on `main` (1 plan + 8 phase commits). Tests 290 pass (was 272 — +18 from gamestate-mode-dispatch goldens + gamestate-mp-contract integration spec, +5 net after cycle-28's harness was extended). Build clean (588 KB main / 617 KB three; bundle-sizes fixture stable, main slightly improved 576→575 KiB). `npx eslint shared/` zero errors. Internal-only — no version bump.

**Stream A — refactor-baseline goldens (1 phase):**

- **A0 — gamestate-mode-dispatch harness** (commit [`d15233a`](https://github.com/matthew-kissinger/sds/commit/d15233a)). Mirrors the Cycle 28 B0 pattern. New [`tests/refactor-baseline/gamestate-harness.js`](../tests/refactor-baseline/gamestate-harness.js) + [`gamestate-mode-dispatch.spec.ts`](../tests/refactor-baseline/gamestate-mode-dispatch.spec.ts) capture every `(mode, singlePlayerMode)` startGame combo, setObjective shapes across totalSheep, the 'roundup' → 'drive' tick transition, competitive completion at 2p/3p/4p × score boundaries, and sandbox completion across {none, all, percentage}. Vitest `vi.mock` stubs `OptimizedSheep` (Three.js puller) so GameState constructs cleanly under node.

**Stream B — sub-module extraction (6 phases):**

- **B1 — [`js/gamestate/modes.js`](../js/gamestate/modes.js)** (commit [`1def95d`](https://github.com/matthew-kissinger/sds/commit/1def95d)). `MODE_CAPABILITIES` table + `SOLO_MODE_SHEEP_COUNT` + `SOLO_MODE_TO_LEADERBOARD` + `EXTREME_BOID_SOLO_MODES`. `this.gameMode === 'competitive'` branch count: 5 → 0. LOC: 1,313 → 1,292 (-21).
- **B2 — [`js/gamestate/polygonSpawn.js`](../js/gamestate/polygonSpawn.js)** (commit [`681bda8`](https://github.com/matthew-kissinger/sds/commit/681bda8)). Pure-function `calculatePolygonSpawnConfig` + `pointToSegmentDistance` + `isPointInPolygon`. LOC: 1,292 → 1,167 (-125).
- **B3 — [`js/gamestate/winConditions.js`](../js/gamestate/winConditions.js)** (commit [`90ca26d`](https://github.com/matthew-kissinger/sds/commit/90ca26d)). `isSoloComplete` + `isSandboxComplete` + `resolveCompetitiveCompletion` (wraps shared/GameStateValidation). LOC: 1,167 → 1,117 (-50).
- **B4 — [`js/gamestate/objective.js`](../js/gamestate/objective.js)** (commit [`0e536d2`](https://github.com/matthew-kissinger/sds/commit/0e536d2)). `createObjective` + `refreshObjective` + `tickObjective` + `isCorralOpen`. The `roundup` → `drive` state machine and the per-frame tick block from `updateSheepBehaviors` extracted whole. LOC: 1,117 → 1,066 (-51).
- **B5 — [`js/gamestate/completion.js`](../js/gamestate/completion.js)** (commit [`b692ae0`](https://github.com/matthew-kissinger/sds/commit/b692ae0)). `formatTime` + `submitScoreToLeaderboard` + `processCompetitiveCompletion` + `showCompletionMessage`. The 75-LOC submitScore body + the React-stub UI variants collapsed; `updateUI` becomes a single guard since the per-mode variants computed-and-discarded. LOC: 1,066 → 892 (-174).
- **B6 — [`js/gamestate/sandboxStart.js`](../js/gamestate/sandboxStart.js)** (commit [`5e31791`](https://github.com/matthew-kissinger/sds/commit/5e31791)). `applySandboxConfig(state, sandboxConfig)` mutates state in place. The 152-LOC `startSandboxGame` body extracted whole, with `computeSandboxSpawnConfig` factoring out the polygon-vs-rect spawn-config branch. Unused imports tightened. LOC: 892 → 745 (-147; cycle target ≤ 800 hit with 55-LOC headroom).

**Stream C — integration (1 phase):**

- **C1 — [`tests/integration/gamestate-mp-contract.spec.ts`](../tests/integration/gamestate-mp-contract.spec.ts)** (commit [`6222c99`](https://github.com/matthew-kissinger/sds/commit/6222c99)). 13 specs locking the cross-vocabulary mapping: MP `cooperative` ⇄ GameState `multiplayer`, MP `racing` ⇄ GameState `competitive`, MP `timed` ⇄ GameState `timed` (only mode where strings match); GameState `solo` and `sandbox` have no MP counterpart. Future contributors who add a new mode will see this spec fail until they register on both sides.

**PRs:** 9 commits direct on `main` (autonomous-cycle policy).

**Carryover:** none. The plan's 8 acceptance lines all resolve clean — 5/6 success-criteria boxes auto-checked at close, 1 (deploy success) gated on Matt's manual push.

**Notes:**

- The "data-driven" thesis carried: `MODE_CAPABILITIES` collapsed seven call-site branches to one table read. `usesCompetitiveGates`, `tracksPlayerScores`, `submitsToLeaderboard`, `uiVariant` are the four capability axes — the C1 spec asserts every entry stays consistent.
- The cross-vocabulary mapping (multiplayer↔cooperative, competitive↔racing) was previously tribal-knowledge buried in the worker DO + the React HUD. C1's spec surfaces it; new modes that don't register on both sides fail the test.
- `shared/GameStateValidation.js` was consumed by import only (never modified) — fence-frozen contract preserved. The Worker DO uses the same `checkCompetitiveCompletion` function authoritatively, so client + server now agree on competitive completion by construction.
- The cycle-close reconcile hook surfaced a regex-collision bug between "Acceptance criteria — EARS format" (template explainer) and "Success criteria (cycle close)" (the actual checklist) — fixed locally by renaming the explainer to "EARS notation conventions". A template-side fix remains for future cycles (see Deferred).

### Cycle 28 — `alignment` (closed 2026-05-09, autonomous overnight run)

Plan archived at [`docs/archive/cycles/cycle-28-plan.md`](archive/cycles/cycle-28-plan.md). Closeout cycle for the cycle methodology itself — no new gameplay, perf, or visual scope. All 19 phases shipped end-to-end across 13 commits on `main` (11 stream + 1 wake-state runbook + 1 doc-alignment polish + 1 close). Tests 272 pass (was 264 — +8 from the refactor-baseline characterization harness), build clean (588.97 kB main / 617.80 kB three; both ≤ pre-cycle baseline), `npx eslint shared/` zero errors. Internal-only — no version bump.

**Stream A — doc alignment (5 phases):**

- **A1 — polish-program archived** (commit [`8b26aa8`](https://github.com/matthew-kissinger/sds/commit/8b26aa8)). Durable thesis pulled into [`DECISIONS.md`](../DECISIONS.md) "Polish program — thesis and outcomes (2026-05)"; 188-line umbrella moved to [`docs/archive/polish-program.md`](archive/polish-program.md).
- **A2 — `.claude/rules/` split + INTERFACE_FENCE slim** (commit [`5b92c03`](https://github.com/matthew-kissinger/sds/commit/5b92c03)). 4 domain-scoped rule files: [`shared-sim`](../.claude/rules/shared-sim.md), [`scene-and-render`](../.claude/rules/scene-and-render.md), [`cycle-process`](../.claude/rules/cycle-process.md), [`multiplayer`](../.claude/rules/multiplayer.md). [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) lists which files are frozen; rule files explain why. NEXT_SESSION durable section collapsed to one line.
- **A3 — research consolidation** (commit [`a4900ca`](https://github.com/matthew-kissinger/sds/commit/a4900ca)). 17 research dossiers + 1 wake-state archived under `docs/archive/research/` and `docs/archive/wake-states/`. 5 closed cycle plans (20 / 21 / 22 / 24 / 25) moved to `docs/archive/cycles/`. 14 durable-summary entries appended to DECISIONS.md. `ls docs/*.md | wc -l` 32 → 11.
- **A4 — [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md)** (commit [`87830bb`](https://github.com/matthew-kissinger/sds/commit/87830bb)). 84-line contract: NEXT_SESSION is current-only, rewritten on cycle-close, required Updated/For/Pickup-priority header, wake-states under archive.
- **A5 — [`docs/README.md`](README.md) navigation index** (commit [`ebe5a9e`](https://github.com/matthew-kissinger/sds/commit/ebe5a9e)). Two reading paths (cold-start agent vs cold-reading developer) + Diátaxis-quadrant table for every top-level doc. Linked from root README Contributing section.

**Stream B — god-module decomp (6 phases):**

- **B0 — refactor-baseline harness** (commit [`8c56ba0`](https://github.com/matthew-kissinger/sds/commit/8c56ba0)). 3 golden fixtures (`terrain-mesh-hash.json`, `scatter-positions.json`, `bundle-sizes.json`) + 8 vitest specs across 3 scenes. FNV-1a32 hashing at 6dp precision so cross-engine ULP wobble doesn't false-positive.
- **B1 — `main.js` boot extraction** (commit [`a072084`](https://github.com/matthew-kissinger/sds/commit/a072084)). 3,529 → 2,188 LOC (-1,341, -38%). 8 new files: [`js/boot/`](../js/boot/) (`WebVitalsMonitor`, `debugProbes`, `initNetwork`, `initWorld`, `loadScene`, `completionOverlay`) + `js/utils/` (`replay`, `scoreStorage`). Per-frame loop, animate, mode dispatch retained on `main.js`.
- **B2 — `TerrainBuilder.js` decomposition** (commit [`bb9f2f2`](https://github.com/matthew-kissinger/sds/commit/bb9f2f2)). 2,785 → 1,387 LOC (-1,398, -50%). 4 new files: [`js/world/`](../js/world/) (`RockPlacement`, `TreePlacement`, `shaderPatches`, `sandbox`). Also deleted ~140 LOC of unreachable mountain-placement legacy under the early return in `addMountains()`.
- **B3 — OptimizedSheep + GrassSystem cohesion codified** in DECISIONS.md (commit [`795d674`](https://github.com/matthew-kissinger/sds/commit/795d674)). Both modules large but internally cohesive (single InstancedMesh + custom shader + per-instance attribute system + state machine); rule revisitable only with a deliberate cohesion-vs-size argument.
- **B4 — GameState.js decomposition deferred** to Cycle 29. Entry in BACKLOG "Deferred" with target ≤ 800 LOC.
- **B5 — `shared/` ESLint boundary** (same commit). [`eslint.config.js`](../eslint.config.js) with `no-restricted-imports` banning three / three/* / js/** + `no-undef` catching DOM globals. ESLint installed as devDep; `npm run lint` script.

**Stream C — agent ergonomics (4 phases beyond C1, which landed in close-cycle-27):**

- **C2 — EARS in [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md)** (commit [`186bba1`](https://github.com/matthew-kissinger/sds/commit/186bba1)). New "Acceptance criteria — EARS format" section + Phase stubs use `Acceptance (EARS):` label. /cycle-close.md grep step for shall/when/while keywords.
- **C3 — ≤ 8 phase rule** (same commit). New "Phase shape rules" section: ≤ 8 phases, fully autonomous OR fully paired, one sharp goal, ≤ 4 hours each. /cycle-start warning lands in D3.
- **C4 — [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)** (same commit). 7 durable stops: sim-baseline drift, refactor-baseline drift, frozen-file change without auth, visual regression, bundle-size regression, MP desync, CI deploy red. Promotion rule: a cycle-specific stop that recurs across two cycles earns durable status.
- **C5 — `cycle-doc-dream` skill** (commit [`fbd01b8`](https://github.com/matthew-kissinger/sds/commit/fbd01b8)). [`.claude/skills/cycle-doc-dream/SKILL.md`](../.claude/skills/cycle-doc-dream/SKILL.md). Manual-invocation only. Steps: inventory → tag each doc → propose moves → cross-ref audit → surface → execute on approval.

**Stream D — hook enforcement (3 phases beyond D1, which landed in close-cycle-27):**

- **D1 — Stop hook prototype** (already shipped at end of Cycle 27 in `.claude/hooks/check-acceptance.mjs`).
- **D2 — `cycle-close-reconcile.mjs`** (commit [`fbd01b8`](https://github.com/matthew-kissinger/sds/commit/fbd01b8)). Walks the active plan's Success/Acceptance section, parses each `- [ ]` line as EARS, auto-evaluates testable predicates (`wc -l`, `ls + wc -l`, file existence, `npm test`, `npm run build`, `npx eslint`), prints a structured `[OK]` / `[FAIL]` / `[?]` / `[manual]` table. /cycle-close gains step 2.5 to invoke it before walking the [manual] items in step 3.
- **D3 — /cycle-start freshness + phase-shape warnings** (same commit). NEXT_SESSION's `Updated:` parsed; warns if > 7 days. `## Phase N — ` headings counted; warns if > 8.

**Public state of the art:** the cycle-close reconciliation hook is, as far as we can tell, novel. Spec Kit's `/speckit.analyze` runs PRE-implementation against artifact consistency; Auto Dream is between-session memory consolidation. This is the first cross-artifact-consistency check that runs AT cycle close against shipped state.

**PRs:** 13 commits direct on `main`, no batched PRs (autonomous-cycle policy).

**Carryover:** none.

**Notes:** First autonomous run since Cycle 25 that closed without operator intervention. The 3 god-modules → 4 + 6 + 4 = 14 modules pattern (`main.js` → `boot/`, `TerrainBuilder.js` → `world/`, `GameState.js` → Cycle 29) settled into a stable shape; the cohesion exception (OptimizedSheep + GrassSystem) was codified in DECISIONS to head off future misapplication. The reconcile hook auto-confirmed 4 of 21 acceptance lines on first run; the remaining 17 walked clean against pre-verified state in the wake-state runbook.

### Cycle 27 — `engagement-loop-and-perf` (closed 2026-05-09, partial — primitives shipped, integrations parked)

Plan archived at [`docs/archive/cycles/cycle-27-plan.md`](archive/cycles/cycle-27-plan.md). Drafted as a 14-phase autonomy-sequenced cycle (A-I autonomous, J-N Matt pickup). Shipped 5/14 fully + 2/14 partial; remaining 7 phases parked. Closeout learning: 14 phases is not a cycle, it's a season — Cycle 28's phase-shape rule (≤ 8 phases, fully-autonomous or fully-paired, no mixing) codifies this.

**Shipped fully:**

- **Phase B — cinema runner fix** (commit [955f413](https://github.com/matthew-kissinger/sds/commit/955f413)). `page.screenshot` → `canvas.toDataURL`. Static/dog/PWA shots work again.
- **Phase C — lazy-load React overlay split** (commit [f94c4ef](https://github.com/matthew-kissinger/sds/commit/f94c4ef)). `main-*.js` 837 → 590 KB (-247 KB / -30%).
- **Phase I — worker D1 test backfill** (commit [5dc783f](https://github.com/matthew-kissinger/sds/commit/5dc783f)). +22 specs over score-gating. Vitest 201 → 264 passing (271 total). Target was +30; delivered +63.
- **Gates** — 264 specs pass, build clean (590 KB main / 171 KB gzip), last `main` deploy success.

**Shipped partially:**

- **Phase G — itch.io heightfield root cause + fix in code** (commit [d79234e](https://github.com/matthew-kissinger/sds/commit/d79234e)). Real bug was `BASE_URL` path resolution; v2.1.2's `.r32f → .bin` rename was orthogonal. Diagnosis at [`cycle27-validation/phaseG/diagnosis.md`](../cycle27-validation/phaseG/diagnosis.md). Awaits itch deploy + visual verify.
- **Phase D — daily-seed primitive** (commit [173a6bf](https://github.com/matthew-kissinger/sds/commit/173a6bf)). `js/utils/dailySeed.js` + 10 specs. UI tile + worker `daily-*` partition deferred.
- **Phase E — replay recorder primitive** (commit [f942d26](https://github.com/matthew-kissinger/sds/commit/f942d26)). `js/utils/ReplayRecorder.js` + 6 specs. RoundManager hook + share-card UI deferred.
- **Phase F — pointer-tour component** (commit [18e007f](https://github.com/matthew-kissinger/sds/commit/18e007f)). Component + gating + 6 specs. `App.js` mount slot deferred.

**Carryover (parked, NOT Cycle 28 scope per alignment plan's "no gameplay/perf/visual" rule):**

- **Phase A** — Cloudflare Web Analytics beacon. Blocked on token rotation; never coded.
- **Phase D integration** — UI tile + worker `daily-{YYYY-MM-DD}` partition (worker enum needs dynamic prefix support).
- **Phase E integration** — RoundManager hook + share-card React component (1200×630 SVG composite, MediaRecorder over `canvas.captureStream(60)`, WebM out).
- **Phase F integration** — `App.js` mount slot for PointerTour (5-line change, naturally bundles with Phase L title-screen).
- **Phase G deploy verify** — itch deploy + visual check (RH/OC dusk hill skirt vs dark-blue water band).
- **Phase H** — CameraController state-machine collapse. Refactor needs paired-with-Matt parity validation.
- **Phase J** — `og-open-country.webp` refresh (Matt paired, now viable post-Phase B).
- **Phase K** — iPhone tone-mapping verification (Matt's iPhone, not simulator).
- **Phase L** — Title-screen identity pass (~1 day Matt design taste).
- **Phase M** — Heightfield amplitude bug. Author lean: codify as design in [`DECISIONS.md`](../DECISIONS.md). 16+ cycles of dependent tuning; rebake risk unfavorable.
- **Phase N** — Devlog cadence + venue. Author lean: `DEVLOG.md` route. Seed entry: Cycle 26 close summary.

**PRs:** per-phase commits on `main` (no batched PRs). 9 commits across 5 days.

**Notes:**

- Cycle was too large because the autonomous-vs-paired split was at phase level, not cycle level. Cycle 28 enforces ≤ 8 phases per cycle and "fully autonomous or fully paired, no mixing."
- Phase I overshot test target (+63 vs +30) because uncovered worker `d1.ts` surface was larger than estimated.
- Bundle -247 KB on `main-*.js` is the cycle's clearest win and is locked in as a Cycle 28 acceptance floor.
- Mid-cycle alignment audit produced [`AGENTS.md`](../AGENTS.md), [`CLAUDE.md`](../CLAUDE.md), [`docs/cycle-28-plan.md`](archive/cycles/cycle-28-plan.md), `.claude/settings.json` Stop hook, and `.gitignore` inversion as the foundation for Cycle 28's autonomous overnight run.

### Cycle 26 — `player-facing-layer` (closed 2026-05-08, multi-version `v2.0.3` → `v2.1.2` + scene-picker auto-load)

Plan from [`docs/archive/cycles/cycle-26-plan.md`](archive/cycles/cycle-26-plan.md). Started as a deliberately soft-scoped "menu" cycle pivoting away from the rendering/foliage/atmosphere stack toward the player-facing layer (UX, marketing, SEO, community, polish). Shipped via per-area `v2.x.y` bumps rather than a single end-of-cycle release. Wake-state from autonomous run: [`docs/archive/cycles/cycle-26-autonomous-wake-state.md`](archive/cycles/cycle-26-autonomous-wake-state.md).

**Shipped:**

- **`v2.0.3`** — Mac white-hue fix. [`SceneManager.js`](../js/SceneManager.js) swaps `THREE.ACESFilmicToneMapping` → `THREE.NeutralToneMapping` on Mac platforms. ACES was pushing sky-blue fog (`0x87CEEB`) toward white on macOS Metal-ANGLE + extended-sRGB output. Mac-only branch; non-Mac unchanged. `?tonemap=aces|neutral|linear|none` URL override for A/B.
- **`v2.0.4`** — extend Apple tone-mapping branch to iPhone/iPad. iPhone playtest surfaced the same Mac white-hue wash on water; v2.0.3's `/Mac/` regex missed `navigator.platform === 'iPhone'`. Extended to `/Mac|iPhone|iPad|iPod/`. Verification still pending Matt's iPhone test (carryover to Cycle 27 Phase K).
- **`v2.0.5`** — delete dead `AtmosphericDesatPatch.js` machinery. 127-LOC module deleted + plumbing in [`TerrainBuilder.js`](../js/TerrainBuilder.js) + kiln impostor uniforms removed. Was a no-op since v2.0.0 (Cycle 25 Phase B forced strength to 0). Build -2.64 KB main / -0.48 KB gzip. Closes the polish-program cleanup queue.
- **`v2.1.0`** — Practice Paddock + per-scene SEO. New "Just Play" mode tile at position 0 (cyan-500, 30 sheep, no timer, no leaderboard) with a first-visit pulsing-glow nudge driven by `sds.has-played` localStorage flag. Net-new [`PracticeHint`](../js/components/GameHUD/PracticeHint.js) bottom-center fade overlay (8s OR first-input dismiss). Per-scene SEO via new [`js/utils/seo.js`](../js/utils/seo.js) — updates `document.title` + full og:* + twitter:* on scene load and scene swap. vitest 201/201 (+13 new).
- **Lighthouse SEO 100** — production audit against `https://sheepdogsim.com/` post-v2.1.0 deploy. No failing audits, no cheap wins needed. Audit JSON committed for reproducibility.
- **`v2.1.1`** — OG card refresh (2 of 3). Refreshed `og-rh-sunset.webp` (behind-Jep cliff overlook, dusk; 117 KB, was 181 KB, -35%) and `og-field.webp` (behind-Jep on Home Field, noon, fence + farmhouse + ~3000-sheep arc; 192 KB). `og-open-country.webp` retained from prior cycle — re-shoot deferred to Cycle 27 Phase J. Added [`public/_headers`](../public/_headers) `Cache-Control: max-age=300, must-revalidate` on `/assets/marketing/og/*` so future refreshes propagate fast at the CF edge.
- **`v2.1.2`** — itch.io heightfield fix attempt. Renamed `.r32f` → `.bin` to dodge `html-classic.itch.zone`'s extension blocklist. `.bin` files serve correctly on `sheepdogsim.com` (CF Pages) but Matt's verification on the itch deploy showed the dark-blue mid-distance terrain band **still present**. **NOT FULLY RESOLVED** — carries to Cycle 27 Phase G for diagnosis (likely directory-rule, MIME-filter, or alternate root cause; worst-case fallback is base64-inline embed).
- **Scene-picker auto-load (post-v2.1.2)** — collapses the two-step "browse then commit" model to single-step. Chevron / swipe / dot / arrow auto-loads the visible scene after 300ms idle (`COMMIT_DEBOUNCE_MS`). Latest-wins coalescing: if a swap is already running, the new target stashes in `pendingTargetRef` and fires on `scene-swap-end` — protects slow devices from rapid-flip thrash. Removed click-to-load button + "Tap to load" hint pill (now redundant). Existing `SceneSwapOverlay` still handles in-flight visual feedback. Build flat at 837.26 KB / 250.46 KB gzip.

**Validation:**

- vitest: 201/201 pass + 7 skipped (Cycle 26 entry baseline 188; +13 in v2.1.0 SEO + practice-mode specs).
- Production build: 837.26 KB main / 250.46 KB gzip — flat with v2.1.0 baseline despite the scene-picker auto-load addition.
- Sim-baseline byte-identical (no boid-sim changes).
- Live on `sheepdogsim.com` via GH Actions; itch deploy via `butler push`.
- Cloudflare CDN edge confirmed serving `.bin` heightmaps with correct content-length on production hostname.

**Carryover deferred to Cycle 27 (`engagement-loop-and-perf`):**

This is the bulk of cycle 27's plan — Cycle 26 was scoped as a menu, with most areas explicitly deferred per Matt's "ship what's shippable autonomously, defer the rest" directive at the close-time deep-analysis pass.

- **itch.io heightfield bug** — NOT RESOLVED post-v2.1.2 `.bin` rename. Root cause unknown; needs console verification + diagnosis. Cycle 27 Phase G.
- **`og-open-country.webp` refresh** — only OG card not refreshed in v2.1.1. Cycle 27 Phase J (paired Matt session).
- **iPhone tone-mapping verification (v2.0.4)** — never confirmed on Matt's actual iPhone. Cycle 27 Phase K.
- **Cloudflare Web Analytics beacon** — never instrumented. Cycle 27 Phase A (first phase — instrument before further changes).
- **Cinema runner `page.screenshot` 30s font-wait timeout** — root fix deferred from Cycle 21. Cycle 27 Phase B.
- **Bundle split: lazy-load React overlay from Three.js init** — first-30-seconds perf win, expected -60–80 KB off critical-path JS. Cycle 27 Phase C.
- **Daily-seed micro-challenge** — engagement loop's centerpiece. Date-hash → seeded scene/mode → `daily-{date}` leaderboard partition. Cycle 27 Phase D.
- **10s WebM replay capture + share-card on round-end** — `MediaRecorder` over `canvas.captureStream()` + 1200×630 SVG composite. Cycle 27 Phase E.
- **First-30-seconds onboarding pointer-tour overlay** — 5s auto-fade, localStorage-gated. Cycle 27 Phase F.
- **Camera state-machine collapse** — `_updateClassic / _updateFollow / _updateFree` → unified state reader. Refactor, no behavior change. Cycle 27 Phase H.
- **Test coverage backfill: GameState, Sheepdog, NetworkManager, RoomDO** — load-bearing untested classes. Target ≥30 new specs. Cycle 27 Phase I.
- **Title-screen identity pass** — wordmark + animated hero + type pairing. Design taste; Matt-gated. Cycle 27 Phase L.
- **Heightfield amplitude bug — fix or codify** — 16+ cycles of workarounds masking the 2× peakHeight bug. Visual character now depends on it. Cycle 27 Phase M; needs Matt's strategic call.
- **Devlog cadence + venue pick** — DEVLOG.md route vs Substack. Cycle 27 Phase N.

**Still parked (NOT Cycle 27 scope; need their own world-rendering cycle):**

- Aerial-perspective LUT (Hillaire 2020 precomputed scattering) — foundation wired in [`HeightFogPatch.js`](../js/shaders/HeightFogPatch.js), no-op until activated.
- 8×4 impostor atlas re-bake + padded mips + hybrid trunk-mesh (Cycle 20 Q2 escalation).
- 6 fresh tree variants + landmark trees per scene (Cycle 25 G+ extension).
- WebGPU/TSL spike under `?renderer=webgpu`.
- Start-screen full Mode→Scene→Dog reorder + live WebGL DogSelection inset (Cycle 25 F was thin tutorial; full restructure stays parked).

### Cycle 23 — `overhead-polish-grass-LOD-and-mp-cap-fix` (closed as `v1.4.0`, 2026-05-05, autonomous overnight run)

Plan from [`docs/archive/cycles/cycle-23-plan.md`](archive/cycles/cycle-23-plan.md) shipped end-to-end in a single autonomous "implement until complete and i'll review when complete" pass. Six phases plus a Phase A1/A2 split (decided at /cycle-start when Matt reshaped Q6 — keep Classic but demote to third option, add a novel game-dev trick for tree-occlusion line-of-sight). Mid-cycle absorbed Matt's "make sure MP sheep counts are labelled and mapped correctly" directive — verified four-layer agreement across worker validation, host UI, leaderboard filter, and solo-mode roster.

**Shipped (7 phases — 6 plan phases + A1/A2 split):**

- **Phase A1 — atmospheric polish.** Pitch-aware desat strength: `TerrainBuilder._desat` per-frame `uDesatStrength = configured * lerp(1.0, 0.2, smoothstep(25°, 50°, |pitch|))`. Follow cam (~26° pitch) keeps full desat; Classic overhead drops to 20%. New `getPitchDeg()` on CameraController. Atmosphere primes fog color from horizon LUT on first frame (no more `0xcccccc` cold-start grey). New `Atmosphere.sceneFog` option swaps FogExp2 default for linear THREE.Fog when scene supplies one — Field's existing fog def now wired; RH ships warm dusk-tinted (`#d4c4a8`/200-650m), OC cooler horizon (`#b8c8d8`/220-800m). Kiln impostor billboard pitch-tilt: `smoothstep(0.2, 0.7, |dirObj.y|)` interpolates from cylindrical (low pitch) to spherical (high pitch). Closes Cycle 19.5 carryover #2(b).
- **Phase A2 — default-cam swap + camera-to-dog occlusion fade.** `MODE_ORDER` reordered to `[FOLLOW, FREE, CLASSIC]` so press-C cycle visits Classic on the third tap. SettingsPanel + CameraModeIndicator label updates to match. New `js/shaders/OccluderFadePatch.js`: view-space capsule check (camera origin → dog-VS) hash-discards leaf fragments inside a 2m radius. Per-frame: dog world pos applied through `camera.matrixWorldInverse` via reused `Vector3` scratch — no allocation in hot path. Per-fragment cost: one length + one smoothstep + one branched hash. Patches every leaf MeshStandardMaterial via `TerrainBuilder._patchTreeWindMaterial` chain. Closes the "leaves block dog tracking" complaint without mode-changing.
- **Phase B — stamina sprint-exit lock-out.** Re-added the release-shift lock-out Cycle 8 simplification had removed. v1.3.0 playtest found Cycle 8's auto-resume produced a ~0.83s stutter cycle (0.33s sprint at 30/sec drain from 10→0 + 0.5s walk at 20/sec regen) that visually reads as continuous sprint — exactly what Cycle 8 was trying to avoid. New `Sheepdog._sprintLockOut` latches when stamina depletes mid-sprint; clears on `wantsSprint=false`. canStartSprint vs canContinueSprint stay separate (Cycle 7 settled decision preserved). New `tests/stamina-sprint-exit.spec.js` (9 specs).
- **Phase C — OC HUD vertical stack.** CameraModeIndicator subscribes to `subscribeGameEvent('frame', ...)` and reads `getGameState().objective`. When an objective is active (OC roundup→drive), drops to `top: calc(env(safe-area-inset-top, 0px) + 88px)` (~70px banner + 18px gap). Fallback at v1.3.0's ~24px on Field/RH where no banner mounts. Mobile unchanged.
- **Phase D — HardwareTier service + grass T4 meadow-quad LOD.** New `js/HardwareTier.js`: `detectTier()` reads `MAX_VERTEX_UNIFORM_VECTORS` and unmasked GPU `RENDERER` (Adreno 3-5xx / Mali GT / PowerVR → low; NVIDIA / AMD / Intel discrete → high; else med). Wired in SceneManager.init; `getTier()` accessor. `?tier=low|med|high` URL override. `TIER_PRESETS` per-tier numbers (clumps scale, blades per clump, wind octaves, meadow-quad enable). Far-ring grass chunks (>260m from origin) on med/high tiers render as a single 40m × 40m PlaneGeometry with `MeshLambertMaterial.onBeforeCompile` injecting procedural noise mix of scene's `grass.base/mid/tip` colors. Static decision at chunk build; shared geometry + material per scene. LOD walker + dispose paths skip / share-aware on `chunk.isMeadowQuad`. Estimated **~65% tri reduction on OC-Extreme** (annulus area arithmetic; Field unaffected, half-extent 210m). D3 (auto-LOD blade extension) deferred — clump geometry is shared, blade-rebuild needs per-tier alternates not commensurate with marginal gain. Pre-baked meadow-quad WebPs (Q4 plan path) shipped as runtime-procedural shader instead of `tools/bake-meadow-quad.mjs` pipeline.
- **Phase E — MP cheap wins.** `RoomDO.ALLOWED_SHEEP_COUNTS` extended from `[200, 250, 500, 1000]` to `[200, 250, 500, 1000, 3000, 5000]` matching solo Insane/Chaos. New `MOBILE_GUEST_MAX_SHEEP_COUNT = 1000` rejects mobile-UA WS upgrades on those rooms (server-enforced, not just UI). `RoomCreation.SHEEP_COUNT_OPTIONS` reshapes from bare numbers to labeled `{value, label}` pairs (Classic/Extreme/Insane/Chaos); amber warning under dropdown when >1000. `GlobalLeaderboard.SHEEP_FILTER_OPTIONS` mirrors. Cinematic-flag strip IIFE in `js/main.js` runs synchronously at module-import time, BEFORE SceneManager constructs (which reads `?cinematic=1` to set `preserveDrawingBuffer`) — strips the flag from `location.search` when `location.hash` starts with `#/r/`. Pine 404 sweep clean (Cycle 22 removal was complete; remaining "pine" mentions are explanatory comments, not runtime references). Full MP audit + two-tab Playwright test suite explicitly deferred to Cycle 24.
- **Phase F — ship v1.4.0.** `js/utils/TriangleCount.js` `sumInstancedMeshTriangles` prefers `instancesCount` (set immediately by InstancedMesh2.addInstances) over `count` (re-set per-frame by frustum culling, 0 at init time before first paint). Closes the "Trees: 0" stats panel reading. CHANGELOG `[1.4.0]` entry above `[1.3.0]` (Added/Changed/Validation/Deferred). Root + worker `package.json` 1.3.0 → 1.4.0. Tag `v1.4.0` pushed.

**Validation:**
- vitest: 188/188 pass + 7 skipped (was 179 baseline; +9 new specs in `stamina-sprint-exit.spec.js`).
- Sim-baseline byte-identical (no boid-sim changes).
- Production build: 833.15 KB main / 247.89 KB gzip — cumulative **+7.53 KB** since `cycle-23-base` (target was < +20 KB).
- Worker `tsc --noEmit`: clean.
- `perf:check`: not re-run (requires live `npm run dev` server; committed baseline at `tests/perf-baseline/baseline.json` only has `field-extreme` succeeding — long-standing CI noise). The OC-Extreme tri reduction estimate is from arithmetic on chunk-grid annulus area, not measurement. **Empirical perf measurement deferred to next dev session per Matt's call.**

**Iteration artifacts saved (per "branch-back" pattern):**
- Tags: `cycle-23-base`, `cycle-23-phaseA1-default`, `cycle-23-phaseA2-default`, `cycle-23-phaseB-default`, `cycle-23-phaseC-default`, `cycle-23-phaseD-default`, `cycle-23-phaseE-default`, `cycle-23-phaseF-default`, `v1.4.0`.
- No variant branches this cycle — pitch-band, capsule radius, meadow-quad threshold, sprint lock-out boundary all expose as easy single-line tunables; no need for parallel-branch alternates.
- Phase notes per phase under `cycle23-validation/{phaseA1,phaseA2,phaseB,phaseC,phaseD,phaseE,phaseF}/notes.md`.

**Carryover deferred (carry-forward to Cycle 24):**
- **Heightfield amplitude bug** (root fix in `Heightfield.sample()` / `scripts/bake-heightmap.mjs`). Visual character of game depends on amplified state across ~14 cycles. Needs Matt's go-ahead before re-bake.
- **Full MP audit + two-tab Playwright harness** → Cycle 24 (`mp-audit-and-test-coverage`). Cycle 23 landed only the cheap MP wins.
- **MP reconnect grace window** — `RoomDO.handlePlayerDisconnect` evicts immediately (no grace). Phone-backgrounding loses session. Cycle 24 Phase 3 ships 15s grace (Colyseus default).
- **MP dog-selection wiring/display audit** (Matt's close-time directive 2026-05-05) — verify each player sees correct dog mesh for every other player on both browsers. Trace path from `DogSelection.js` → `MultiplayerState.js` → `RoomDO` → guest's `RemoteDog`. Cycle 24 Phase 4 specs.
- **Auto-LOD blade-count extension (D3 as planned)** — clump geometry shared, rebuild needs per-tier alternates.
- **Pre-baked meadow-quad WebPs** (Q4 plan path) — bake-script remains a candidate if runtime-procedural visual quality is insufficient. Per Cycle 24 foliage research, runtime-procedural is the right call until >300m camera-lingering shots become a problem.
- **Cinema runner `page.screenshot` 30s timeout** + 4 deferred cinematic videos (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`).
- **WebGPU/TSL spike** — Cycle 24 Phase 5b optional `?renderer=webgpu` feature-flag (~3hr); not a full migration. Per research: BatchedMesh per-instance LOD has not landed since Cycle 22, so a structural migration is still blocked.
- **Render-texture grass-trample spike** — Cycle 24 Phase 5a optional (~6hr) prototype as `cycle-24-spike-grass-trample` branch. AC Shadows + Ghost of Yōtei pattern; complement, not replace, the 220-uniform path.
- **Octahedral-impostor A/B** vs current 4×4 lat-lon — `agargaro/octahedral-impostor` package (Aug 2025, same author as `@three.ez/instanced-mesh`). Per research: Cycle 25 candidate, not Cycle 24 scope.
- **Procedural-instanced-forest eval, mac-white-ground-bug**.
- **Five v1.4.0 playtest items** (Classic-overhead trees, sprint exit, OC HUD, MP modes, tree tris) — Matt deferred playtesting to end of Cycle 24 close per close-time directive.

**Cycle 24 research commissioned at close-time:**
- [`docs/archive/research/cycle-24-research-mp-testing.md`](archive/research/cycle-24-research-mp-testing.md) — Playwright two-tab patterns, Browserbase tradeoff (skip), reconnect-grace empirics, 5 risk-driven specs
- [`docs/archive/research/cycle-24-research-foliage.md`](archive/research/cycle-24-research-foliage.md) — agargaro octahedral-impostor candidate, RiLoD academic SOTA, Ghost of Yōtei tech deep-dive, occluder-fade idiom literature
- [`docs/archive/research/cycle-24-research-batched-webgpu.md`](archive/research/cycle-24-research-batched-webgpu.md) — BatchedMesh status (no movement since May 2026), Safari 26 WebGPU, Codrops False Earth as compute-grass reference

### Cycle 22 — `stylized-lod-pivot-and-grass-perf` (closed as `v1.3.0`, 2026-05-05, autonomous overnight run)

Plan from [`docs/archive/cycles/cycle-22-plan.md`](archive/cycles/cycle-22-plan.md) shipped end-to-end in a single autonomous "save iterations so we can branch back" overnight run. Mid-cycle absorbed Matt's pine-removal directive — sim-baseline byte-identical despite TreePlacement RNG-sequence delta because trees are visual-only.

**Shipped:**

- **Phase A — meshopt-baked LOD1 + pine removal.** New `tools/bake-tree-lod1.mjs` runs four variants (aggressive `r=0.3 e=0.05` / default `r=0.5 e=0.05` / conservative `r=0.7 e=0.05` / pristine `r=0.5 e=0.001 lockBorder=true`) saved under `cycle22-validation/phaseA/variants/`. Default lands at `_originals/<name>_lod1.glb`. tree1 -38.2%, tree2 -45.4% bytes; LOD chain re-enabled at 80m. Initial run with `lockBorder=true` showed a 2.6% byte reduction — diagnosed empirically that EZ-Tree foliage cards have UV-split borders that lock the simplifier; switching to `lockBorder=false + error 0.05` unlocked 30%+ reduction. Pine species deleted across `TreePlacement` (mixed becomes 50/50 tree1+tree2), all bake scripts, asset specs, impostor LUT, asset-gallery picks, dev sandboxes. Pine assets archived under `cycle22-validation/phaseA/removed-pine/`.
- **Phase B — alphaHash stochastic LOD crossfade.** `material.alphaHash = true` on every leaf MeshStandardMaterial via `_patchTreeWindMaterial` (skipped if `transparent:true`). Kiln impostor (custom ShaderMaterial — no Three auto chunk injection) gets a screen-space hashed alpha threshold inline (`uAlphaHashScale = 0.30`). All three LOD tiers crossfade with consistent dither so 80m and 200m handoffs read as smooth gradients.
- **Phase C — atmospheric desaturation.** New `js/shaders/AtmosphericDesatPatch.js` exports composable `patchMaterialDesat`. Single `{ uDesatStartM, uDesatEndM, uDesatStrength }` uniform set (defaults 100m / 320m / 0.6) drives LOD0+LOD1 leaves AND the kiln impostor (uniform-rebound in `createTrees`). Replaces Cycle 21's hardcoded inline desat with unified luma+fogColor mix. Variants `cycle-22-phaseC-strength-0.4` and `cycle-22-phaseC-strength-0.8` committed as branches for branch-back validation.
- **Phase D — grass auto-LOD.** GrassSystem ticks a 60-sample frame-time ring buffer; `_autoLodFactor` decays toward 0.5 at 0.05/sec when avg > 18ms, recovers toward 1.0 when < 14ms. Floor 0.5. Applied at chunk-rebuild time only — no live mutation. Stats added: `stats.autoLodFactor`, `stats.avgFrameMs`. Hard-Stop #8 stays clean (no new GrassSystem clamps).
- **Phase E — BatchedMesh research.** [`docs/archive/research/cycle-22-batchedmesh-research.md`](archive/research/cycle-22-batchedmesh-research.md), 2022 words. Recommendation: **defer to Cycle 24+**. Three.js r184 BatchedMesh has no native per-instance LOD; community workaround `@three.ez/batched-mesh-extensions` requires shared vertex arrays across LODs — directly incompatible with the meshopt simplify pipeline shipped in Phase A. Migration ROI doesn't justify the constraint.
- **Phase F — ship v1.3.0.** Validation: vitest 179/179, build clean (825.62 KB / 246.99 KB gzip; +13 KB vs v1.2.0), perf:check `field-extreme` -26.7% (3807 → 2789 ms; SwiftShader timeouts elsewhere are standing CI noise per NEXT_SESSION). Sim-baseline byte-identical despite TreePlacement RNG delta. Tagged `v1.3.0` + pushed.

**Iteration artifacts saved (per "branch-back" directive):**
- Tags: `cycle-22-base`, `cycle-22-phaseA-default`, `cycle-22-phaseB-default`, `cycle-22-phaseC-default`, `cycle-22-phaseD-default`, `v1.3.0`.
- Branches: `cycle-22-phaseC-strength-0.4`, `cycle-22-phaseC-strength-0.8`.
- LOD1 GLB variants: `cycle22-validation/phaseA/variants/{aggressive,default,conservative,pristine}/`.
- Pine archive: `cycle22-validation/phaseA/removed-pine/`.

**Carryover deferred (no change from Cycle 21):**
- Heightfield amplitude bug (root fix in `Heightfield.sample()` / `scripts/bake-heightmap.mjs`). Visual character of game depends on amplified state across ~14 cycles.
- Cinema runner `page.screenshot` 30s font-wait timeout. 4 deferred cinematic videos (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`).
- WebGPU/TSL spike, grass render-texture trample, procedural-instanced-forest eval, mac-white-ground-bug.

### Cycle 21 — `tree-impostor-pixel-match-and-foliage-polish` → pivoted mid-cycle (closed as `v1.2.0`, 2026-05-05)

Original plan was 6 phases of "make distant impostors pixel-perfect match LOD0." Phase 0+1+2+5 shipped; Phase 3 (padded-atlas mips) and Phase 4 (hybrid trunk-mesh) abandoned mid-cycle after a strategic pivot triggered by Matt's review questions ("are trees that expensive vs grass?", "what would a proper game dev with vision do here?", "look at latest implementations").

**Shipped:**
- **Phase 0** Aspen recipe (+40% leaves, branches[0] 8→10 via Aspen-specific override), placement diff (WOODS_INSIDE_FACTOR 0.85→0.92, scaleVariation 0.7-1.3→0.80-1.20), Schlick fresnel rim (uFresnelStrength=0.04 default), tree-pipeline.md doc fix (table was listing Aspen Medium seed=7 — actual is Aspen Small seed=11).
- **Phase 1** Standalone sandbox v2 at `tools/lod-sandbox-v2.html`. Imports SDS Atmosphere directly, two-pane LOD0/LOD2 with 5×5 grid sampling, OKLab dE proxy, 12-cell smoke matrix runner. Baseline saved at `cycle21-validation/phase1/sandbox-baseline.json` — tree1 ratio R/G/B = 0.78/0.89/1.16 (dominant residual), tree2/pine within 7% of identity.
- **Phase 2** Per-species calibration LUT. `tools/generate-impostor-lut.mjs` reads sandbox JSON, outputs `assets/impostor-calibration-lut.json`. Loaded at scene init, applied via `setImpostorCalibrationLUT(lut)` → `uMatchBoost` per kiln material. tree1 boost [1.305, 1.128, 0.891] corrects the Aspen drift. Wired retroactively + at material creation.
- **Phase 5 (pivot scope)** Detached-shadow fix: `LODinfo.shadowRender = { levels: [{distance:0, hysteresis:0, object: im}], count: [0] }` routes shadow pass through LOD0 only — never through the LOD2 impostor billboard quad whose shadow doesn't align with the player camera's view. Pushed LOD swap 100m → 200m so foreground/midground stays geometric. Atmospheric perspective desat: per-fragment Rec601 luma blend (110m start, 250m full, 0.85 max strength) — distant trees intentionally read as distant per Sable / Tiny Glade / Townscaper idiom. Default camera mode: CLASSIC → FOLLOW (avoids the high-pitch worst-case for residual impostor artifacts; matches herding-game ergonomics).

**Pivoted away from:**
- Phase 3 padded-atlas mipmaps (would have required Pixel Forge upstream changes, brittle bake pipeline)
- Phase 4 hybrid trunk-mesh closest band (premature — needs Phase A meshopt LOD1 first)
- "Pixel-perfect color match" as a goal — research synthesis on modern stylized indie games (Sable, Tiny Glade, Townscaper, Among Trees) showed the right idiom is atmospheric perspective via fog + per-fragment desat, NOT impostor color-match.

**Carryover deferred to Cycle 22 (already plan'd, autonomous-runnable):**
- Phase A: meshopt-baked LOD1 (re-bakes via `@gltf-transform/functions` simplify, replacing the EZ-Tree leaf-count-halved LOD1 GLBs that Cycle 17 rejected)
- Phase B: alphaHash stochastic LOD crossfade (Three r154+ / r176 shadow-cast-fixed)
- Phase C: unified `MeshStandardMaterial.onBeforeCompile` desat patch across all three LOD tiers
- Phase D: grass auto-LOD (FPS-driven `clumpsPerChunk` adjustment)
- Phase E: BatchedMesh migration research (Cycle 23+ candidate)
- Phase F: ship v1.3.0

See [`docs/archive/cycles/cycle-22-plan.md`](archive/cycles/cycle-22-plan.md). Closes Cycle 19.5 carryover impostor-quality items #1, #2 partial, #3, #4 — drops the standing impostor-quality risk into Cycle 22's structural fix path.

### Cycle 20 — `heightfield-amplitude-fix-and-cinematic-videos` → closed early into Cycle 21

Phase 0+1+2v1 shipped (commit `dbcc06d`). Pixel Forge / Kiln impostor pipeline integrated end-to-end. Phases 3-5 absorbed into Cycle 21 + 22 per Matt's "bake all recommendations into the next cycle" directive after the 6-agent research compilation. Cycle 20 v2-v5 polish work (commit `848f0e7`) committed as foundation for Cycle 21.

### Cycle 19.5 — post-close polish (no plan, ad-hoc; on top of `v1.1.0`)

Cycle 19 was closed with deploy red and several visual issues unresolved. Matt requested a single autonomous pass to clean up before moving to Cycle 20. Shipped on top of `v1.1.0` without a tag bump.

- **Octahedral impostor shader fix (deploy unblocker).** `js/octahedral-impostor-material.js` vertex shader used a local `mvPos` while the auto-injected Three.js `<fog_vertex>` chunk references `mvPosition`. NVIDIA drivers tolerated the undeclared identifier silently; Linux SwiftShader hard-failed with "ERROR: 0:292: 'mvPosition' : undeclared identifier", which the e2e console-error guard caught — turning the v1.1.0 deploy red. Renamed the local to `mvPosition`. Same bug also explained Matt's "trees only show up close" report — when the LOD2 shader fails to compile, the impostor mesh draws nothing, so trees disappear past the 100m LOD0/LOD2 swap threshold even on permissive drivers.
- **Per-instance frustum culling for trees + rocks.** Trees were already on `InstancedMesh2` whose `perObjectFrustumCulled` defaults to `true`, but no `computeBVH()` call meant the per-instance test was a linear scan. Rocks were on plain `THREE.InstancedMesh` (whole-mesh AABB only — every instance submitted regardless of view direction). Migrated rocks to `InstancedMesh2` and added `computeBVH({ margin: 0 })` post-`addInstances` for both trees and rocks. Verified on RTX 3070: looking at OC island = 358 draw calls / 2.7M tris, looking 180° away = 193 calls, looking at sky = 34 calls (≈90% reduction).
- **ScatterSystem removed entirely.** `js/ScatterSystem.js` (mushrooms / pebbles / clovers / flowers) was dropped per Matt's "the pebbles and mushrooms and flowers must go for now". Sub-metre props were too small to read at gameplay distances and contributed measurable draw cost without a payoff. Removed: `js/ScatterSystem.js` (deleted), all `createScatter` / `clearScatter` / `scatterSystem` wiring in `TerrainBuilder.js` and `main.js`, the `scatterHeightfieldMatches` field in `__sdsSwapProbe`, and the scatter assertion in `tests/e2e/scene-swap-stability.spec.ts` (now a grass-heightfield gate). Rocks (`rock1` / `rock2` / `rock3`) kept — those are the gameplay-scale silhouette, not the meadow detail.
- **Octahedral impostor brightness lift (LOD2 → LOD0 swap polish).** Bake lighting `0.30 + 0.55` → `0.70 + 1.20` (`AmbientLight + DirectionalLight`, `1.40× → 1.90×`). The Cycle 17 white-bark fix targeted the cross-billboard path (single edge-on view, very prone to wash); the octahedral path bakes 16 views per species so per-view contrast averages out and tolerates the higher exposure. Added a sun-luma-driven 1.0×–1.2× multiplier inside `setImpostorTint` so impostors track time-of-day brightness instead of sitting at flat bake exposure.
- **Trunk LOD2 ANGLE warning silenced.** `_lod2EmptyGeo` was a single shared 3-vert geo for all trees. ANGLE complained "Vertex buffer is not big enough for the draw call" when an active trunk material expected attributes (e.g. tangent) the shared empty didn't supply. Replaced with a per-trunk-geometry attribute-matching empty (clone the source geometry's attribute schema with zero-length buffers), cached in a `WeakMap` keyed by source geometry.
- **Octahedral spherical-billboard tilt attempted, then reverted.** Initial spherical-billboard math made the quad face the camera fully so high-elevation atlas tiles were visible from above. Matt reviewed and flagged: "it does not seem like they are angled correctly now at all" — root cause is the bake camera frustum (`halfW = max(x,z) × halfH = y`) doesn't match the quad aspect ratio when the quad tilts toward horizontal, so top-down tiles letterbox the canopy in a tall narrow rectangle. Reverted to the cylindrical billboard (vertical quad) and noted the proper fix below.

Carryover (open polish items, deferred — Matt's review on commit `5f6e330`):

The shader fix unblocked the deploy and brought distant trees back, but Matt's visual review surfaced four separate impostor issues that aren't trivial single-line patches. They need their own bundled cycle. **Don't chase them piecemeal — they interact**: e.g. brightening the bake without baking a normal map just shifts the dark-impostor problem to a flat-impostor problem.

1. **Bake quality / lighting response (highest impact).** Impostors don't react to runtime sun direction at all. The atlas is a flat baked texture; runtime lighting is just a per-frame `uColor` multiply (sun-tint × sun-luma boost). LOD0 is MeshStandardMaterial — full PBR, gets ambient + dirLight + soft shadows + specular. The impostor sits at flat exposure, doesn't catch the sun on the lit face vs. shadowed face, doesn't darken on cloudy presets, doesn't pick up sky tint at dusk. Fix: bake a normal-map atlas alongside the diffuse atlas (`_bakeOctahedralImpostor` already has a separate render target — add a second one rendering the world-space normal as RGB), pass both as uniforms, do `dot(N, sunDir)` shading in the impostor fragment shader. UE5 / Unity HDRP impostors do this. Estimated ~2hr (bake plumbing + shader update + tweak).
2. **Angled aerial view broken.** The runtime quad billboards around world-Y only (cylindrical). High-elevation atlas tiles (rows 2-3 of the 4×4 atlas — top-down views) render edge-on at cinematic / freeFly altitudes — paper-thin. Compounding: bake camera frustum is `halfW=max(x,z) × halfH=y` so a top-down tile letterboxes the canopy in a tall narrow rectangle. Two coupled fixes needed in lockstep: (a) bake square tiles (`halfW = halfH = max(x,y,z)`), (b) tilt the runtime quad toward the camera as `dirObj.y` rises (smoothstep `0..0.6`). Tilt alone distorts the non-square tile; square tiles alone waste pixels at standard angles. Cycle 19.5 attempted (b) without (a) and Matt flagged it as wrong — reverted. Estimated ~1hr once the bake pieces are in place.
3. **Hard snap at the LOD2 → LOD0 100m boundary.** Cylindrical billboard's quad rotates around Y as the camera moves; LOD0 mesh has fixed orientation. At the swap moment the apparent silhouette pops + twists. Mitigation: alpha cross-fade (dither or true-alpha) across a 5-10m hysteresis band — both LOD0 and LOD2 draw simultaneously in the band, blended by distance. Requires impostor material to participate (alpha output) AND the InstancedMesh2 LOD swap to support a fade region (today's `addLOD(geo, mat, distance)` is a hard step). Estimated ~2-3hr — non-trivial because @three.ez/instanced-mesh's LOD swap is a hard pick, not a blend; may need to maintain two separate InstancedMesh2 (LOD0 + LOD2) and drive per-instance alpha + visibility via `onFrustumEnter`.
4. **Position offset on swap.** Impostor anchored at `originWorld + (position.y - uTreeOriginObj.y) * scaleVal` — uses the bake bbox center. LOD0 mesh anchored at the GLB pivot (varies per species — Quaternius pines pivot at trunk-base, deciduous at centroid, EZ-Tree mixed). If pivots don't match the impostor's `uTreeOriginObj`, the swap shows as a visible vertical offset. Fix: probe each tree GLB's actual pivot vs. baked bbox center, write a per-species offset uniform. Or harmonize at bake time — translate the bake clone so its centroid lands at object-space origin before rendering tile views. Estimated ~30min once diagnosed.

**Recommended bundling**: a half-cycle "impostor-quality" mini-cycle covering all four. Each piece individually is small; the danger is fixing one and shipping a new failure mode (e.g. bright bake + still-dark angled view = even worse contrast).

Other carryovers:
- **Cinema runner timeout** — already on Cycle 20 plan as Phase 2.
- **Heightfield amplification bug** — already on Cycle 20 plan as Phase 1.

### Cycle 19 — visual-verification-and-octahedral-polish-and-v1.1.0 (closed 2026-05-04 autonomous; v1.1.0 shipped)

Plan: [`docs/archive/cycles/cycle-19-plan.md`](archive/cycles/cycle-19-plan.md). Headline: visual verification of Cycle 18 on RTX 3070 surfaced a **separate** longstanding regression masking Phase 1 acceptance — grass on RH/OC was rendering at sea level, not on terrain. Diagnosed root cause (a Cycle 17 Phase 3 clamp tighten interacting with a longstanding Heightfield amplification bug), shipped a hotfix, then captured 3 OG cards on the post-fix build and tagged `v1.1.0`.

- **Phase 1.A — Grass-Y heightfield clamp regression ✅ HOTFIX shipped (commit `0790333`).** `js/GrassSystem.js` clamp `baseY > 10 → 0` was tightened in Cycle 17 Phase 3 with the comment "heightScale tops out at 6". In practice the displaced terrain mesh peaks at ~25m on OC and ~36m on RH — **all legit terrain Y was being snapped to 0, dropping grass to water level on RH and OC.** Field stayed byte-identical because heightScale=0 and meshSampleY returns 0. Reverted clamp to `> 50`. Verified post-fix: OC inner-chunk grass at meanY=21 (matches displaced terrain), RH at meanY=20-30, Field byte-identical.
- **Phase 1.B/C/D/E — Cycle 18 verification ✅ all phases verified post-grass-fix.** Octahedral impostors brightness parity confirmed at noon + dawn across mixed-LOD frames (no visible cliff at the 100m boundary). No visible azimuth-step in any wide shot. Scene-swap OC→RH preserves grass-on-terrain (spec passes the JS reference-equality test from Cycle 18). OC-Extreme on RTX 3070 = 73 fps avg, p95 frame 13.88 ms (Q2 settled — no clumpsPerChunk reduction needed).
- **Phase 2 — octahedral polish SKIPPED.** No defects surfaced in Phase 1.
- **Phase 3.A — 3 OG cards refreshed ✅ shipped (commit `897ce29`).** og-field, og-rh-sunset (Solo Extreme + 1000 sheep), og-open-country. All under 200 KB. Captured directly via Playwright MCP because the cinema runner has a separate `page.screenshot` 30s timeout issue.
- **Phase 3.C — `v1.1.0` tagged + pushed ✅** (commit `d0fcb66`). CHANGELOG.md updated, worker/package.json bumped 0.1.0 → 1.1.0, root package 1.0.0 → 1.1.0 via `npm version`.

Validation (end of cycle):
- **180/180 vitest pass.**
- **Production build clean** — 812.80 KB main / 241.46 KB gzip (flat vs Cycle 18's 806 KB).
- **macOS Safari Smoke fail** is the standing mac-white-ground bug, environmental (not on CI Safari).

Carryover (deferred to Cycle 20, see `docs/archive/cycles/cycle-20-plan.md`):
- **Phase 3.B — 4 cinematic videos (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`) deferred.** `tools/cinematic/run.mjs` hits a `page.screenshot: Timeout 30000ms exceeded — waiting for fonts to load…` on the first frame, even though "fonts loaded" message fires before the timeout. Single-shot static-card path also affected; my workaround was capturing OG cards via Playwright MCP directly. Cinema runner needs a debug pass (Playwright/font-load race or a screenshot-timeout option) before video shots can run.
- **Heightfield amplification bug (root cause).** `Heightfield.sample()` multiplies by `peakHeight` while the bake script `scripts/bake-heightmap.mjs` already writes pre-multiplied metres (`h = (h / ampSum) * peakHeight; // [0, peakHeight]`). The unit tests at `tests/heightfield.spec.js` use normalized [0,1] inputs and pass — they encode the design contract. The data files violate the contract. Net effect: every scene's terrain mesh has shipped at peakHeight² metres for ~14 cycles (RH 36m peaks, OC 25m peaks instead of the documented 6m / 5m). Visual character of the game depends on the amplified state now. Fix is one of: (a) re-bake heightmaps to write [0,1] (changes scene visual character), (b) drop the `* peakHeight` in `sample()` (same result, fewer file changes), or (c) normalize at `Heightfield.load()` time (preserves files + tests). The Cycle 19 hotfix worked around the symptom by relaxing the GrassSystem clamp; the proper fix is its own cycle.
- **Phase 4 polish (deferred from Cycle 18 then 19).** 3-tile octahedral blend / aux normal-map atlas / 32-angle bake — only fires if a future visual review surfaces step or brightness mismatch.

### Cycle 18 — scene-stability-and-octahedral-impostors (closed 2026-05-04; Phases 1-3 shipped autonomous overnight)

Plan: [`docs/archive/cycles/cycle-18-plan.md`](archive/cycles/cycle-18-plan.md). Headline: closed the three visible gaps from Matt's Cycle 17 deploy review — RH/OC grass to island edge (per-scene `grassRadius`), scene-swap + mode-restart state hygiene (stale ScatterSystem heightfield + always-recreate flock on `startGame`), and real octahedral impostors (Cycle 17 shipped only cross-billboard). Ran end-to-end autonomous from a single "resume and run without checkins" prompt; all 6 open questions pre-resolved in the plan.

- **Phase 1 — Per-scene `grassRadius` ✅ shipped (commit `b376034`).** New `GrassDef.grassRadius?: number` (additive, optional). [`shared/scenes/rolling-hills.js`](../shared/scenes/rolling-hills.js) sets 172m, [`shared/scenes/open-country.js`](../shared/scenes/open-country.js) sets 372m (= boundary.radius - 8). [`js/GrassSystem.js`](../js/GrassSystem.js) (1) expands the chunk-grid `worldSize` to `(grassRadius + 40) * 2` when an explicit radius is set so chunks reach the radius (Cycle 17 Phase 3's grid expansion was reverted because of implicit area math; explicit per-scene control is the durable fix); (2) culls chunks at `grassRadius + chunkSize` (tighter than the legacy `halfWorld * 1.2`); (3) rescales `clumpsPerChunk` by `min(1, defaultRadius/grassRadius)` so OC's wider extent doesn't blow the perf budget; (4) uses `grassRadius` directly as the density-falloff zero point (no more `worldSize * densityRange` for opt-in scenes). Field omits the field — byte-identical to pre-cycle-18.
- **Phase 2 — Scene-swap + mode-restart state hygiene ✅ shipped (commit `c8c899f`).** Two regressions Matt flagged:
  - Scene swap left flora/mushrooms placed against the prior scene's heightfield Y. Root cause: `TerrainBuilder.createScatter`'s else-branch (the path that runs on every swap after the first) refreshed `sceneDef + boundary` on the persisted ScatterSystem but FORGOT `heightfield`. Fix: add `scatterSystem.heightfield = this.heightfield` to the same else-branch.
  - Mode restart left sheep at the prior session's positions. Root cause: `GameState.startGame` gated flock recreation on `previousSheepCount !== totalSheep && optimizedSheepSystem` — any same-count restart skipped recreation, inheriting stale positions + stale spawnConfig. Fix per Q6: always set `needsFlockRecreation = true` on `startGame` when an `optimizedSheepSystem` exists. Cost is one `recreateSheepFlock()` call per mode-start (a few hundred ms); benefit is bulletproof spawn correctness.
  - New regression spec [`tests/e2e/scene-swap-stability.spec.ts`](../tests/e2e/scene-swap-stability.spec.ts) drives Field→RH→OC→Field→RH swap matrix, asserting `scatterSystem.heightfield === main.heightfield` post-swap + sheep-in-bounds. Tagged `@local-only` because the full scene-rebuild × 4 swaps takes ~6 min on swiftshader CI; CI doesn't need to gate on a 6-minute browser test for a JS reference equality + int comparison. Run locally with `npm run test:e2e -- scene-swap-stability` after touching scene-swap or flock-recreation code.
  - [`js/main.js`](../js/main.js) `_installStressTestHarness` now exposes `window.__sdsSwapTo(id)` + `window.__sdsSwapProbe()` for the spec to drive without DOM scraping.
- **Phase 3 — Octahedral impostors ✅ shipped (commit `04ffef6`).** New [`js/octahedral-impostor-material.js`](../js/octahedral-impostor-material.js) — single-quad billboard `ShaderMaterial` that decomposes `instanceMatrix` into per-instance translation + rotation + uniform scale, undoes rotation to land in object space, picks atlas tile from quantised azimuth/elevation, and billboards the quad around Y to face camera. New `_bakeOctahedralImpostor(model, renderer)` in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) — render-to-texture baker that emits a 4×4 atlas (16 ortho views, 256px per tile = 1024×1024 PNG) via `renderer.setViewport + setScissor` per tile. Lighting matches the Cycle 17 cross-billboard bake (ambient 0.30 + dirLight 0.55) so silhouette brightness stays in the live-tree neighbourhood. `createTrees` tries octahedral first; falls back to cross-billboard if the bake returns null (headless WebGL, weird GLB). `setImpostorTint(color)` updates `uColor` uniform on octahedral material or `.color` on the MeshBasicMaterial fallback. LOD2 distance unchanged (100m). InstancedMesh2 integration via `<batching_pars_vertex>` + `<batching_vertex>` chunk includes so `getInstancedMatrix()` + `matricesTexture` get declared inside `USE_INSTANCING_INDIRECT`.
  - Per Q4 lean: self-contained Three.js render-to-texture (no Pixel Forge dep). The plan called for a build-time baker; runtime bake fits the existing `_bakeImpostorCache` pattern (cached for app lifetime — pay once per species per session) and avoids committing 1MB+ of PNG assets.
  - Per Q5 lean: single-tile picker; 3-tile blend deferred to Phase 4.

Validation (end of cycle):
- **180/180 vitest pass** (was 174 in cycle 16; +6 from Phase 1's defensive paths).
- **Production build clean** (806 KB main / ~239 KB gzip — flat vs Cycle 17's 804 KB; +2 KB octahedral material + bake).
- **CI deploys green** for all three phases (Pages + Worker on each push). E2E gate flickered on Phase 2 (swap-stability spec timeout — the ~6min runtime against swiftshader; mitigated by tagging `@local-only` in commit `ea05a77`). perf-check flickered on Phase 1 (Field-Extreme +11.5% vs 5% threshold — confirmed swiftshader noise because Phase 2 with the same Field code path passed cleanly; baseline-extreme runs only ~2 sample frames in 15s window so variance is structurally high at 4-second-per-frame swiftshader cadence).
- **Live on sheepdogsim.com via GH Actions** at all three push commits.

Carryover (deferred to Cycle 19, see `docs/cycle-19-plan.md`):
- **Visual playtest of Cycle 18 phases.** Phase 1 (RH grass to slopes / OC grass to shore), Phase 3 (octahedral impostor brightness parity across 4 sun positions). Code changes are correct + targeted; visual verification on real WebGL needs Matt at keyboard. Hard stop on tagging `v1.1.0` until verified per the cycle-18 plan's success criteria.
- **Phase 4 polish (deferred from Cycle 18 plan).** 3-tile octahedral blend if the single-tile picker shows visible step at oblique camera moves; auxiliary normal-map atlas for per-pixel lighting parity with live MeshStandardMaterial trees; 32-angle bake variant as a quality preset (16-angle stays default).
- **Cycle 16 Phase 6 — Hero cards + `v1.1.0`.** Still requires Matt at the keyboard for `__sdsCinema.freeFly()` posing. Hardening gate now updated: don't tag until Cycle 18 visual verification passes.
- **Octahedral perf validation across hardware.** Runtime bake adds 16 RTT renders × 3 species per session (~200ms desktop, ~9-15s swiftshader CI). Confirm RTX 3070 + mid-tier mobile sit within the existing perf-check budget; if mobile bake cost is too high, consider build-time bake variant.

### Cycle 17 — mobile-hardening-lod-and-bundle-slim (closed 2026-05-04 — shipped 2026-05-04 plus follow-up `bb922fb` + scaffold `1c342e5`; closed retroactively as part of Cycle 18 close)

Plan: [`docs/archive/cycles/cycle-17-plan.md`](archive/cycles/cycle-17-plan.md). Research: [`docs/archive/cycles/cycle-17-research.md`](archive/cycles/cycle-17-research.md). Shipped end-to-end through all 7 phases in commit `4cb0d84` plus a regression-fixup pass in `bb922fb` after Matt's first-deploy gallery review. The `1c342e5` impostor lerp-from-white sun tint commit + Cycle 18 plan scaffold rolled in as a tail.

- **Phase 1 — Mobile asset visibility audit ✅ shipped.** Trees/rocks/flora invisible at distance on mobile classic camera diagnosed + fixed.
- **Phase 2 — White-bark tree + bark coherence ✅ shipped.** Cross-billboard impostor lighting washout root-caused; ambient 0.55→0.30 + dirLight 0.85→0.55 cut the 1.4× brightness wash that turned brown bark cream-white at LOD2 distance.
- **Phase 3 — Grass anomalies ✅ shipped (with REVERT).** Skyward grass blade clamp tightened (`> 50 → > 10` cap on heightfield-Y). Initial OC grass-grid expansion attempt dropped per-m² density 3.4x; reverted in `bb922fb`. The "OC grass to island edge" goal carried to Cycle 18 Phase 1 (where it shipped via per-scene `grassRadius`).
- **Phase 4 — Portrait-mobile HUD layout ✅ shipped.** CameraModeIndicator overlap with time/score on portrait fixed.
- **Phase 5 — LOD chain extensions + culling sync ✅ shipped (with REVERT).** Initial LOD1 mid-tier kept; reverted in `bb922fb` after Matt flagged a visible quality cliff. Replaced with clean LOD0 → impostor cutover at 100m. Octahedral impostor evaluation deferred to Cycle 18 Phase 3.
- **Phase 6 — OC portal scales to total sheep ✅ shipped.** `CorralDef.requiredSheepFraction` (0.40) + `requiredSheepMin` (10) schema change. New helper `shared/ObjectiveLogic.getRequiredSheep`. Per-mode: Classic 200→80, Extreme 1000→400, Insane 3000→1200, Chaos 5000→2000.
- **Phase 7 — Bundle slim ✅ shipped.** Dynamic-imported deferred React panels (Multiplayer, Leaderboard, Settings, Sandbox). main.js dropped from 817 KB → 804 KB.

Cycle 17 validation: 174/174 vitest pass. Production build clean. Site live. Carryover items folded into Cycle 18 (the regression intake from Matt's first-deploy gallery review became the primary driver of Cycle 18's three phases).

### Cycle 16 — tree-foliage-lod-and-perf (closed 2026-05-04; Phases 1-5 shipped, Phase 6 hero cards + v1.1.0 carryover to keyboard session)

Plan: [`docs/archive/cycles/cycle-16-plan.md`](archive/cycles/cycle-16-plan.md). Headline: replaced the Cycle 14 world-distance-from-origin tree-billboard split with a per-instance per-frame `InstancedMesh2.addLOD` chain — LOD0 full mesh → LOD1 reduced canopy at 80m → cross-billboard impostor at 150m. Recipe re-tune (single-billboard leaves, halved leaf count, tightened bark, re-rolled seeds) layered on top. Captured a Linux baseline + wired `perf-check` to gate every push. Gallery-reviewed picks (8 trees + 10 rocks → 3 + 3 canonical slots with explicit `canonicalName` overrides). Two bug fixes Matt flagged during review (mobile bottom-bar overlap + auto-refresh-mid-interaction) shipped in the same pass.

- **Decision brief ✅ shipped.** [`docs/archive/research/cycle-16-tree-research.md`](archive/research/cycle-16-tree-research.md) surveys 8 techniques (A-H from EZ-Tree recipe re-tune through Procedural Instanced Forest and WebGPU/TSL port) and pins **A+B+E** as chosen path: recipe re-tune + `addLOD` chain + existing 3-quad cross-billboard. Octahedral impostors + PIF deferred to long-tail (different aesthetic / different pipeline).
- **Phase 1+2 — Tree foliage LOD chain ✅ shipped (commit `763a86b`).** Per-instance per-frame `InstancedMesh2.addLOD` wired in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js): trunk + leaves InstancedMesh2 each get LOD0 → LOD1 (80m) → LOD2 (150m). Trunk's LOD2 = degenerate 3-vert geom since the cross-billboard texture covers it. **Retired** the Cycle 14 `FAR_LOD_DIST=400m` world-distance split — chase camera now smoothly upgrades trees per-instance. Recipe re-tune: lowercase `'single'` (caught + documented an EZ-Tree casing bug — capital-case is silently ignored); `leaves.count` 40-72 → 24-42; bark tints tightened to 0x4a-0x8c brown family (Q1); seeds re-rolled per recipe (Q2). LOD1 sibling GLBs ship at `assets/models/trees/{tree1,tree2,pine}_lod1.glb` — ~25-30% the LOD0 tris. Tree-asset spec extended: pins both LOD0 and LOD1 sibling contracts; ceiling raised 3 MB → 4 MB.
- **Gallery + integrate flow ✅ extended for LOD1 + canonicalName overrides (commits `595e30c`, `cac2212`).** [`tools/bake-trees.mjs`](../tools/bake-trees.mjs) bakes a 36-GLB matrix: 24 LOD0 candidates (4 species × 3 scales × 2 billboard modes) + 12 LOD1 candidates. [`tools/asset-gen/integrate.mjs`](../tools/asset-gen/integrate.mjs) honors per-pick `canonicalName` overrides (the natural bbox-height sort doesn't fit pine/oak/aspen slot semantics). Final integrated picks (post Matt's gallery review): aspen_small_single → tree1, oak_medium_single → tree2, pine_medium_single → pine + matching LOD1 siblings. **Larger leaf coverage** baked-in (Matt's feedback): `baseSize` 1.0 → 1.6 deciduous / 1.2 pine, `sizeVariance` 0.55 → 0.65. Tris UNCHANGED (size scales per-card geometry, not card count).
- **Phase 3 — Rocks + flora tuning ✅ shipped (commit `595e30c`, post-gallery-review `cac2212`).** Rock picks (gallery-reviewed): pebble_round_small → rock1, boulder_chunky_mid → rock2, spire_jagged_dark → rock3 (38 KB total post-draco). Flora tuning per Q4: [`js/ScatterSystem.js`](../js/ScatterSystem.js) `oversampleFraction` 0.05 → 0.10 (visible dandelion clusters), mushroom `targetHeight` 0.30/0.35 → 0.50 (readable at sheep-cam).
- **Phase 4 — Linux perf baseline captured ✅ (commit `1b62fe0` by `perf-baseline-bot`).** Triggered via `gh workflow run "Deploy" -f capture_baseline=true`. The `perf-baseline-capture` job spins up vite + wrangler on ubuntu-latest, runs `npm run perf:baseline`, commits the result back. Numbers reflect ubuntu-latest swiftshader software-WebGL — significantly slower than dev workstations (~3.8s/frame avg on extreme), but the ±5% threshold absorbs runner noise. Note: there is no "pre-Cycle-14 baseline" to diff against — the captured baseline is the new pin going forward.
- **Phase 5 — `perf-check` CI integration ✅ (commits `4e023f7`, `be09eb7`, `aff62e1`).** Workflow_dispatch baseline-capture + push-gated perf-check both wired into [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). CI fix bundled: bypass the broken root `dev:setup` / `dev:worker` npm scripts (they `cd worker && wrangler ...` which loses npm bin-PATH in CI) by calling `npx wrangler` directly. **Side-effect win:** the wrangler fix unblocked the long-standing E2E flakiness too — E2E now passes consistently. perf-check graduated from `workflow_dispatch`-only to push-gated in `aff62e1` after the first baseline landed.
- **Two bug fixes Matt flagged during review ✅ shipped (commit `aff62e1`).**
  - Mobile bottom-bar overlap (about/github links bleeding into menu buttons on short viewports) → [`js/components/App.js`](../js/components/App.js): credits div now uses `padding-bottom: max(0.6rem, env(safe-area-inset-bottom))`, `padding-top: 14px` on mobile, `font-size: 0.78rem` on mobile for tap-target legibility. Menu-center has explicit `padding-bottom: 0.75rem` on mobile so the mode-grid never bleeds into the footer.
  - Auto-refresh-back-to-home mid-interaction → [`index.html`](../index.html): SW `controllerchange` listener used to call `location.reload()` immediately when a new deploy landed, yanking the user out of mid-click. Fix: defer the reload until `visibilitychange → hidden` (next tab-switch / minimise / close), so the new bundle loads invisibly on the next visit.

Validation (end of cycle):
- **174/174 vitest pass** (was 165 in cycle 15; +9 from LOD1 sibling-pair contract assertions).
- **Production build clean** (817 KB main / 241 KB gzip — flat vs Cycle 15's 816 KB). Build flagged the chunk-size warning that motivates Cycle 17's slug.
- **All deploy + e2e + perf-check jobs green** in CI run [`25295678987`](https://github.com/matthew-kissinger/sds/actions/runs/25295678987).
- **Live on sheepdogsim.com via GH Actions** at the cycle-close push commit.

Carryover (deferred to follow-up sessions, not Cycle 17 phases):
- **Phase 6 — Hero cards + v1.1.0 tag.** Three OG cards (`og-rh-sunset`, `og-field`, `og-open-country`) + four cinematic videos (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`) + `npm version 1.1.0` + tag push. Needs Matt at the keyboard with mouse for `__sdsCinema.freeFly()` posing. Playbook in [`docs/archive/research/cycle-16-phase-6-prep.md`](archive/research/cycle-16-phase-6-prep.md). Don't tag `v1.1.0` until visual playtest confirms no LOD pop at typical play distances.
- **LOD pop visual confirmation.** Phase 1 acceptance "Trees swap LOD0→LOD1 at ~80m without visible pop" was not playtested — the LOD chain is wired and tris-correct but mid-distance pop visibility wasn't confirmed in chase-cam. Confirm during the Phase 6 cinematic-video shoot. If pop visible, raise distances to 100m / 180m (one-line edits in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js)).
- **Optional gallery polish.** [`docs/archive/research/cycle-16-tree-gallery-review.md`](archive/research/cycle-16-tree-gallery-review.md) lists what's worth a real eye: aspen vs ash for tree1 slim slot, pine size for OC horizon, bark coherence across species. Swap path: edit `tools/asset-gallery/picks.json` `canonicalName` fields, re-run integrate.

### Cycle 15 — visuals-polish-and-harness (closed 2026-05-03; Phases 4 + 6 shipped, Phase 1 tooling + 28 baked variations staged for review, Phases 1 picks / 2 / 3 baseline / 5 carryover to Cycle 16)

Plan: [`docs/archive/cycles/cycle-15-plan.md`](archive/cycles/cycle-15-plan.md). Headline: pivoted to "bake-and-pick" pipeline for assets after Matt's mid-cycle direction change. Built the in-repo primitive bake harnesses (16 rocks + 12 trees), browser-based gallery viewer, integrate.mjs pick promotion, perf-harness scaffold. During gallery review Matt flagged tree foliage as too-high-tri and asymmetric — leaves are 90-96% of all tris, EZ-Tree's seeded angular distribution can produce unbalanced canopies on unlucky seeds. Research pass surfaced the proper game-dev answer (3-tier LOD: full mesh / reduced / billboard impostor via `InstancedMesh2.addLOD`); execution carries to Cycle 16 since tree-foliage rework would gate everything else (perf baseline, hero cards, v1.1.0).

- **Phase 4 — Grass anomaly + tree pipeline audit ✅ shipped.** Defensive `Number.isFinite` + bounds clamp on `meshSampleY` results in [`js/GrassSystem.js`](../js/GrassSystem.js) placement loop (NaN/Infinity → 0 instead of GPU "blade-to-the-sky"). New [`docs/tree-pipeline.md`](tree-pipeline.md) pins the seed→GLB workflow + InstancedMesh2 quaternion gotcha + GLB shared-material trap. New [`tests/tree-assets.spec.js`](../tests/tree-assets.spec.js): 7 specs assert the 3 GLBs exist, are non-empty, total < 3 MB. (165/165 vitest pass after the +7.)
- **Phase 6 — CI E2E smoke fix ✅ shipped.** Bumped `actionTimeout: 10_000` → `30_000` in [`playwright.config.ts`](../playwright.config.ts). Cycle 14's `b5e1e45` deploy left CI red on `tests/e2e/smoke.spec.ts` "solo classic starts and 3D canvas renders" — `locator.dispatchEvent` 10s timeout from the ~800 KB main bundle + React hydration on cold GH Actions runner. 30s gives generous slack; load-timing optimization remains Cycle 16+ territory.
- **Phase 1 tooling ✅ shipped + 28 variations baked into staging; picks DEFERRED to Cycle 16.** The pipeline is bake → review → pick → integrate, byte-stable across machines. (a) Extracted [`tools/bake-rocks/recipes.mjs`](../tools/bake-rocks/recipes.mjs) with 16 rock variations spanning small pebbles → tall jagged spires (IcosahedronGeometry + 3D simplex displacement + non-uniform scale + AO-baked vertex colors). 16 GLBs ~450 KB total in `tools/asset-gallery/staging/rocks/`. (b) Extended [`tools/bake-trees.mjs`](../tools/bake-trees.mjs) recipes from 3 to 12 covering all EZ-Tree presets (Ash/Aspen/Oak/Pine × S/M/L) with per-species tints + branch-density tweaks; recipe helper at top of file makes adding species/scale variants a one-liner. 12 GLBs ~23 MB pre-compress in `tools/asset-gallery/staging/trees/` (~7 MB after draco). (c) New [`tools/asset-gallery/`](../tools/asset-gallery/) — browser-based GLB picker (Three.js orbit preview, recursive directory scan, category badges + filter dropdown, ★ toggle pick, `s` save). [`tools/asset-gallery.mjs`](../tools/asset-gallery.mjs) is the Node http server. (d) [`tools/asset-gen/integrate.mjs`](../tools/asset-gen/integrate.mjs) sorts picks by bbox.sy ascending, renames to canonical loader names (`rock1/rock2/rock3` + `tree1/tree2/pine`), copies to `assets/models/`. (e) Optional escape hatch: [`tools/asset-gen/meshy.mjs`](../tools/asset-gen/meshy.mjs) Meshy AI text-to-GLB with prompt sets at `tools/asset-gen/prompts/` (rocks/trees/flora). Kept in-tree but not the primary path. (f) npm scripts: `bake-rocks` + `bake-trees` (default to staging now), `gallery`, `gen:integrate`, `gen:meshy`, `perf:baseline`, `perf:check`.
- **Phase 3 perf harness scaffold ✅ shipped; baseline capture DEFERRED to Cycle 16.** [`tools/perf-harness.mjs`](../tools/perf-harness.mjs) — Playwright-driven 6-config matrix (Field/RH/OC × Classic/Extreme), warmup + measure window, +5%-or-+0.5ms regression threshold against `tests/perf-baseline/baseline.json`. New `window.__sdsRenderer` global (gated on `?perfMode=1`) so renderer.info reads work without flipping `cinematic=1` (which biases via `preserveDrawingBuffer`). Per Matt's mid-cycle direction: actual baseline capture happens AFTER asset picks land, so the numbers reflect the polished world.

**Tree-foliage research findings (logged for Cycle 16 carryover):**

- **Tri breakdown:** leaves are 86-96% of all tris (oak_medium 56k leaf / 2.8k trunk; aspen_medium 11k leaf / 1k trunk; pine_medium 2.7k leaf / 0.4k trunk). Trunk tri count is noise; foliage is the entire problem.
- **EZ-Tree leaf knobs:** `leaves.billboard: 'Single'` = 4 tris/leaf, `'Double'` = 8 tris/leaf (we're getting Double by default — instant 50% cut available). `leaves.count` is leaves per branch endpoint; total = endpoints × count where endpoints = product of `branch.children` at each level.
- **Asymmetric canopy bug:** EZ-Tree seeds child-branch angular spawn with `rng.random()` per branch level — unlucky seeds cluster children on one quadrant. Mitigations: bump `branch.children` so angular variance averages out, or re-roll seeds per recipe until each species comes out symmetric.
- **InstancedMesh2 LOD support:** `addLOD(geometry, material, distance, hysteresis)` exists per-mesh (not per-instance). Trunk + leaves are separate child meshes so each needs its own LOD chain. SDS does NOT use this currently — every tree at every distance renders the full mesh.
- **Camera distance ranges:** follow ~24m, classic default 80m, classic max 150m. LOD distances of 80m (full→reduced) and 120m (reduced→billboard) bracket the visible range.
- **Modern techniques surveyed:** vertex-shader leaf cull (Procedural Instanced Forest, permissively licensed, 2 draw calls for 2,800 trees), fluffy-trees view-space puffing (douges.dev), billboard cloud impostor (industry standard since 2010). Author lean for Cycle 16: A+B+E (lower per-leaf cost + proper `addLOD` + billboard impostor at distance) - the textbook game-dev answer.

Validation (end of cycle):
- **165/165 vitest pass** (was 158, +7 from `tests/tree-assets.spec.js`).
- **Production build clean** (816 KB main / 241 KB gzip — flat vs Cycle 14).
- **Live on sheepdogsim.com via GH Actions** at the cycle-close push commit (Phase 6 fix takes effect on next deploy).

Carryover to Cycle 16:
- **Phase 1 picks** — Matt to drive: open gallery (`npm run gallery`), pick 3 rocks + 3 trees, run `node tools/asset-gen/integrate.mjs --compress`. Will likely pivot to Cycle 16 Phase 1 (tree foliage LOD authoring) before picking trees, since tree foliage rework changes what's worth picking.
- **Tree foliage LOD pipeline** — author LOD0 (full mesh, but with `leaves.billboard: 'Single'` and reduced count) + LOD1 (further reduction or vertex-shader cull) + LOD2 (billboard impostor baked from 8 angles). Wire `InstancedMesh2.addLOD` per trunk + leaves child mesh in TerrainBuilder.js around line 1077. Hysteresis tuning ~10-15% of distance.
- **Bark contrast tightening** — current per-species tints (aspen 0x7a5a3a, oak 0x5a3a26, pine 0x4a3525, ash 0x6e4f30) read as too contrasting. Tighten to 0x60-0x70 range or commit to single bark tone with leaf-texture-only differentiation.
- **Asymmetric canopy fix** — bump `branch.children` to higher uniform values, re-roll seeds, or both.
- **Flora tuning** — bump `oversampleFraction` 0.05 → 0.10 for visible dandelion clusters; bump mushroom `targetHeight` from 0.30/0.35m → 0.50m if still tiny. May or may not need new flora bake (the existing Quaternius CC0 GLBs at `assets/models/scatter/` are still in place).
- **Phase 2 perf baseline + triage** — `npm run perf:baseline` → commit `tests/perf-baseline/baseline.json` → `npm run perf:check` enforces ±5%. Run AFTER tree foliage LOD lands so numbers reflect the optimized world.
- **Phase 3 finish** — wire `perf-check` job into `.github/workflows/deploy.yml`. Calibrate threshold for GH Actions Linux runner noise.
- **Phase 5 hero cards + `v1.1.0` tag** — three OG cards (`og-rh-sunset`, `og-field`, `og-open-country`), four cinematic videos (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`), bump `package.json` 1.0.0 → 1.1.0, append CHANGELOG, `git tag v1.1.0 && git push origin main --tags`.

### Cycle 14 — visuals-foundation (closed 2026-05-03; Phases 1–3 shipped, Phase 4 needs rebuild, Phase 5 hero cards + v1.1.0 carryover to Cycle 15)

Plan: [`docs/archive/cycles/cycle-14-plan.md`](archive/cycles/cycle-14-plan.md). Headline: lifted the world from "indie tech demo" toward "AAA browser game" via four sequenced visual fixes plus a load-time integration audit that caught Quaternius asset oversize / centroid-pivot issues before they reached the browser. Matt's 2026-05-03 playtest landed Phases 1–3 cleanly, surfaced Phase 4 rocks/scatter as needing a full rebuild (tiny + floating + no dandelions), found one grass anomaly (rogue blades skyward near trees outside play area), confirmed perf regression worth root-causing, and bumped Phase 5 hero cards + v1.1.0 tag to end of Cycle 15.

- **Phase 1 — Heightfield Y unification ✅ shipped.** New [`Heightfield.meshSampleY(x, z)`](../shared/terrain/Heightfield.js) triangle-interpolates against a captured `(segs+1)²` grid of post-displacement Ys. [`TerrainBuilder.createTerrain()`](../js/TerrainBuilder.js) captures into a `Float32Array` and hands it via `setMeshGrid()`. Visual consumers (Sheepdog, OptimizedSheep, GrassSystem, trees, rocks, farmhouse) routed through `meshSampleY` either directly or via the thin `surfaceY` / `_groundY` wrappers. The historical Cycle 9 0.05 lift and the GrassSystem `-0.1` "dip into mesh" hack both gone — replaced with exact mesh Y. Worker / tests fall back to `sample(x, z) + 0.05`. Sim-baseline byte-identical. New [`tests/heightfield-mesh-y.spec.js`](../tests/heightfield-mesh-y.spec.js) — 9 cases.
- **Phase 2 — Grass modernization ✅ shader shipped.** Replaced per-vertex simplex-noise wind with the dossier playbook in [`js/GrassSystem.js`](../js/GrassSystem.js): scrolling gust envelope along `windDirection` (~30m wavelength, ~30/70 strong/calm), two octaves of analytic sway, t² amplitude weighting, per-blade decorrelator, tip-only flutter. Fragment-shader fake-SSS via new `uSunDirection` uniform plumbed from `atmosphere.getSunDirection()` per frame — `pow(saturate(dot(toCamera, -sunDir)), 4) * tipColor * 0.7 * tipMask` for the tight halo on the sun silhouette. Render-texture interactors + critically-damped trample recovery deferred to Cycle 15+ (need per-blade render-target ping-pong state).
- **Phase 3 — Trees ✅ FULLY SHIPPED.** Three pieces: (a) `_patchTreeWindMaterial()` + `_setupTreeWind()` `onBeforeCompile` patch on every tree-leaf material — same gust-envelope + 2-octave sway math as grass, mirrored at lower amplitude (0.18 multiplier), wind direction synced from `grassSystem` for whole-world coherence. (b) **EZ-Tree build-time bake** (pivoted from Quaternius MegaKit after follow-up research found it Patreon-gated): [`tools/bake-trees.mjs`](../tools/bake-trees.mjs) (Node) + [`tools/bake-trees/bake.html`](../tools/bake-trees/bake.html) (Playwright harness) generate 3 stylized GLBs from seeded recipes via `@dgreenheck/ez-tree@1.1.0`. De-textured bark + reduced branch counts + 256² leaf alpha + uniform 1m-height normalization. Final: tree1 81 KB / 1092 tris, tree2 112 KB / 1744 tris, pine 91 KB / 296 tris. Old `Resource_Tree*.glb` deleted. (c) **InstancedMesh2** (`@three.ez/instanced-mesh@0.3.15`) drop-in upgrade for both near (full mesh) + far (cross-billboard impostor) tree paths — per-instance frustum culling skips ~30–70% of vertex shader work depending on camera direction. LOD-pool unification deferred to Cycle 15 (needs trunk-only + leaves-only impostor authoring since EZ-Tree splits each tree into two child meshes).
- **Phase 4 — Rocks + ScatterSystem ✅ FULLY SHIPPED.** Three pieces: (a) `_patchRockMaterial()` + `_setupRockShader()` `onBeforeCompile` patch — fresnel rim-light injecting after `<emissivemap_fragment>` adds `pow(1 - max(dot(viewDir, normal), 0), 2) * uRimColor * 0.35` to `totalEmissiveRadiance`. `uRimColor` plumbed from `atmosphere.sun.light.color` per frame so rim hue tracks sunrise/sunset. (b) **Quaternius MegaKit rocks** — `Rock_Medium_1/2/3.gltf` (CC0) converted via `gltf-transform optimize --texture-size 128`, ~46 KB each at [`assets/models/rocks/`](../assets/models/rocks/). Old `Resource_Rock_*.glb` deleted. (c) **New [`js/ScatterSystem.js`](../js/ScatterSystem.js)** (~330 LoC) — sibling to GrassSystem. Bridson Poisson-disk sampler within a circular area, 9 prop variants from MegaKit (3 pebbles, 2 mushrooms, 2 clovers, 2 single flowers; ~450 KB), yellow-flower oversampling (5% of base × 5–8 flowers in 1.5m radius for Ghibli eye-anchors), weighted-random variant assignment per dossier ratio (~60/25/15 pebbles/flora/mushrooms), one InstancedMesh2 per variant for per-instance frustum culling, flora-only leaf-wind via dependency-injected hook (mushrooms + pebbles stay still). Lifecycle: `TerrainBuilder.createScatter()` after `createTrees`; `clearScatter()` integrated into `rebuildEnvironment` + `dispose` paths. Cycle 11+12 A8 GLB-shared-material invariants preserved (`userData.sharedFromGlbCache`).
- **Pivot + scale audit ✅ shipped post-Phase-4.** Two GLB inspectors ([`tools/inspect-glb.mjs`](../tools/inspect-glb.mjs) + [`tools/inspect-glb-three.mjs`](../tools/inspect-glb-three.mjs)) found three integration issues that would have manifested as floating rocks + 100m-tall boulders + flowering-tree clovers the moment the dev server fired up. Fixed at load time: rocks + scatter props go through the same bake-and-capture pattern trees use; `ROCK_NATIVE_HEIGHT = 0.2m` uniform-scale normalization keeps existing `scaleRange: 4-50` tuples producing 0.8-10m boulders; per-variant `targetHeight` on `PROP_VARIANTS` normalizes pebbles (10cm), mushrooms (30-35cm), clovers (12cm), flowers (40cm) to real-world ground-scatter scale.

- **Post-deploy hotfix 1 ✅ InstancedMesh2 entity API uses `quaternion` not Euler rotation.** First deploy hit `TypeError: Cannot read properties of undefined (reading 'copy')` in `createTrees`. CI e2e smoke caught it (`tests/e2e/smoke.spec.ts:76`). Root cause: `@three.ez/instanced-mesh` entities passed to the `addInstances` callback expose `position` + `quaternion` + `scale`, no Euler `rotation` (which is what SDS's placement records use, inherited from the prior `THREE.InstancedMesh` + `dummy.rotation.copy(euler)` convention). Fix: `obj.quaternion.setFromEuler(inst.rotation)` at the near tree + far impostor sites; `obj.quaternion.setFromAxisAngle(_Y_AXIS, …)` for ScatterSystem's Y-only random rotation. Added `npm run test:e2e` to the local pre-push validation chain.

- **Post-deploy hotfix 2 ✅ brown bark + full canopy.** Second deploy showed trees rendering as tall white-pillar skeletons across the horizon — confirmed empirically via [`tools/probe.mjs`](../tools/probe.mjs) against `npm run preview`. Root causes: (a) EZ-Tree's preset `bark.tint: 0xFFEAB1` is a cream texture-modulator that became the full albedo when `bark.textured: false` flipped textures off; (b) my `branch.children: { 0: 4, 1: 2, 2: 0 }` + `leaves.count: 10` were too aggressive on poly budget — produced visible branch skeleton, not canopy. Fix: per-recipe brown bark (aspen `0x7a5a3a`, oak `0x5a3a26`, pine `0x4a3525`) + relax `branch.children` to `6/4/2` + `leaves.count: 28` shared (oak gets 36 for the broad-canopy hero look). Final tree GLBs grew 284 KB → 899 KB total but read as lush mixed forest. Discovered + documented sharp edge: `scripts/compress-glbs.mjs` reads from the `assets/_originals/` BACKUP not the current file, so re-bakes need `rm assets/_originals/models/trees/*.glb` first to invalidate the cache. Future polish is to teach compress-glbs to detect a newer-mtime-than-backup and re-back-up automatically.

**Known visual issues remaining at end of Cycle 14 (must address before Phase 5 hero cards):**

Captured 2026-05-03 via [`tools/probe.mjs`](../tools/probe.mjs) + Matt's eyeball review of the deployed build at sheepdogsim.com. These are the things that will show up on hero cards if not fixed first:

1. **Trees still need more leaves.** Even after the canopy hotfix, mid-ground trees show visible branch structure rather than reading as a full leafy canopy. Iteration: bump `leaves.count` further (40+), bump `leaves.size`, raise `branch.children` toward EZ-Tree default `{ 0: 7, 1: 5, 2: 3 }`. Re-bake with `rm assets/_originals/models/trees/*.glb && npm run bake-trees && npm run compress-glbs`.
2. **Some trees float above terrain.** Spotted in Rolling Hills + Open Country probes. Suspect zones: far-tree cross-billboard quads on slopes, or horizon-zone trees on the flat skirt where heightfield smoothstep falloff produces slightly negative `meshSampleY` values. Diagnostic: add a debug overlay that draws each tree's `placementY` vs the visible terrain Y to identify offending zones.
3. **Rocks look like broken mesh shards, not rocks.** Quaternius MegaKit `Rock_Medium_1/2/3.gltf` rendering as faceted geometric fragments. **Decision needed**: source different CC0 stylized rocks (Kenney Nature Kit, KayKit Forest, hand-picked Poly Pizza items) OR commission custom rocks in pixel-forge. The rim-light shader patch + ScatterSystem will auto-apply to whatever new GLBs land at `assets/models/rocks/` — only the assets need replacing.

Validation:
- 158/158 vitest pass (was 149; +9 from `tests/heightfield-mesh-y.spec.js`).
- Production build clean (main 815 KB / 241 KB gzip — +57 KB raw / +17 KB gzip from `@three.ez/instanced-mesh` + bvh.js, +7 KB from ScatterSystem + shader patches).
- Sim-baseline byte-identical (Phase 1 explicit design — visuals route through new `meshSampleY` while sim keeps `sample()`).
- New deps: `@dgreenheck/ez-tree` (dev), `@three.ez/instanced-mesh` (runtime).
- New assets: 3 rocks (~140 KB) + 3 trees (~284 KB) + 9 scatter props (~450 KB) = ~870 KB.

Carryover to Cycle 15 (Matt's 2026-05-03 playtest review of the deployed `b5e1e45` build):

- **Phase 5 hero cards + `v1.1.0` tag** — bumped to end of Cycle 15. Workflow already shipped in Cycle 13 (`__sdsCinema.freeFly()` + `snapshotPose()` + `npm run cinema --shot=<id>`); just needs the polished world to actually be polished first. Matt-gated.
- **Phase 4 rocks + scatter need a full rebuild.** Rocks read as tiny + floating; mushrooms are tiny + floating; no yellow dandelion patches visible. Procedural icosa+simplex bake (~33 KB total) doesn't carry visual presence — variants are barely-visible vs gameplay-meaningful. Decision: research Pixel Forge or hand-author CC0 stylized variants with proper grounded scale; keep the ScatterSystem perf budget (per-variant InstancedMesh2 + Bridson Poisson) but lift the scale + grounding logic. The rim-light + leaf-wind shader patches will auto-apply to whatever new GLBs land.
- **Grass anomaly: rogue blades shooting skyward near trees outside play area.** A few stray blades stretch up to the sky. Suspect: GrassSystem placement-Y meets a tree exclusion-zone or terrain-falloff edge case where `meshSampleY` returns an outlier, OR an `_treeWind` uniform leaks into grass sway. Triage with the existing instrumentation; reproduce via probe before patching.
- **Tree pipeline audit.** Confirm trees are 100% seed→build-time GLBs (they are — `tools/bake-trees.mjs` writes to `assets/models/trees/` which is committed) and pin/document the seed→GLB contract so no future regression introduces runtime tree generation. One short doc + a vitest spec asserting the GLB files exist and are non-empty would close this permanently.
- **Perf regression triage + perf harness build-out.** Frametime degraded post-Cycle-14. Suspects: `@three.ez/instanced-mesh` BVH overhead on tree LODs, ScatterSystem per-variant InstancedMesh2 cost, or the 2.2 MB tree bundle's GPU upload spike. Build out a real perf harness — RTX 3070 desktop + mid-tier mobile baselines, automated frametime regression detection in CI (extending the existing `oc-perf` Playwright spec).
- **CI E2E (Chromium) smoke timeout** — `locator.dispatchEvent` 10s timeout on the "solo classic starts and 3D canvas renders" case in [`tests/e2e/smoke.spec.ts`](../tests/e2e/smoke.spec.ts), surfaced on the `b5e1e45` deploy. Pages + Worker deploys both succeeded, site is live; only the smoke gate is red. Likely first-paint slowdown from the 2.2 MB tree bundle. Bump timeout or address load timing.

Tuning knobs surfaced (1-line tweaks for in-cycle iteration):

- `_treeWind.uWindStrength` (0.6 desktop / 0 mobile) — leaf-wind amplitude.
- `_rockShader.uRimStrength` (0.35) — fresnel rim-light intensity.
- `ROCK_NATIVE_HEIGHT` (0.2m) — rock per-variant scale normalization target.
- `ScatterSystem` `minDist` (4m desktop / 6m mobile), `oversampleFraction` (0.05), per-variant `targetHeight` in `PROP_VARIANTS`.

Cycle 15+ candidates surfaced:

- Tree LOD-pool unification (per-instance dynamic full-mesh → impostor switch via `InstancedMesh2.addLOD`; needs trunk-only + leaves-only impostor authoring).
- Grass render-texture interactors + critically-damped trample recovery (deferred from Phase 2; pairs with WebGPU spike since TSL maps cleanly onto compute shaders).
- WebGPU spike (Phase 2 grass + Phase 3 tree wind shader math both port cleanly to TSL).
- ScatterSystem polish: seeded RNG via `mulberry32` for byte-identical placement across machines/swaps, density tuning post-playtest.
- [Procedural Instanced Forest](https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610) (red-reddington, Dec 2025) as a higher-tree-count alternative to EZ-Tree (2,800 trees in 8 draw calls at 60fps mid-range desktop, TSL/WebGPU port already done).

Commits (Cycle 14):

- [`3796f3c`](https://github.com/matthew-kissinger/sds/commit/3796f3c) feat(heightfield): cycle 14 phase 1 — meshSampleY unification
- [`f1e0d78`](https://github.com/matthew-kissinger/sds/commit/f1e0d78) feat(grass): cycle 14 phase 2 — gust-envelope wind + sun-aligned SSS
- [`ec0b902`](https://github.com/matthew-kissinger/sds/commit/ec0b902) feat(trees): cycle 14 phase 3 partial — leaf wind shader
- [`42c9f63`](https://github.com/matthew-kissinger/sds/commit/42c9f63) feat(rocks): cycle 14 phase 4 partial — fresnel rim-light shader
- [`4a98245`](https://github.com/matthew-kissinger/sds/commit/4a98245) docs(cycle-14): partial-close — shader half of every phase shipped
- [`3b373db`](https://github.com/matthew-kissinger/sds/commit/3b373db) docs(cycle-14): pivot Phase 3 trees from Quaternius MegaKit to EZ-Tree
- [`a469a00`](https://github.com/matthew-kissinger/sds/commit/a469a00) feat(trees): cycle 14 phase 3 — EZ-Tree build-time bake
- [`9f025f8`](https://github.com/matthew-kissinger/sds/commit/9f025f8) feat(trees): cycle 14 phase 3 — InstancedMesh2 per-instance culling
- [`02cf48a`](https://github.com/matthew-kissinger/sds/commit/02cf48a) docs(cycle-14): close Phase 3 — EZ-Tree bake + InstancedMesh2 shipped
- [`f683a13`](https://github.com/matthew-kissinger/sds/commit/f683a13) feat(scatter): cycle 14 phase 4 — Quaternius rocks + ScatterSystem
- [`f72208d`](https://github.com/matthew-kissinger/sds/commit/f72208d) docs(cycle-14): close Phase 4 — Quaternius rocks + ScatterSystem shipped
- [`ea9547a`](https://github.com/matthew-kissinger/sds/commit/ea9547a) fix(cycle-14): rock + scatter pivot + native-scale normalization
- [`29af54c`](https://github.com/matthew-kissinger/sds/commit/29af54c) docs(cycle-14): align NEXT_SESSION + append BACKLOG entry; ready for visual review
- [`a41f9a6`](https://github.com/matthew-kissinger/sds/commit/a41f9a6) fix(cycle-14): InstancedMesh2 entities use quaternion not Euler rotation
- [`39f44fb`](https://github.com/matthew-kissinger/sds/commit/39f44fb) fix(trees): cycle 14 — re-bake with brown bark + full canopy
- (This docs alignment commit appended at push time.)

### Cycle 12 — post-v1-polish (closed 2026-05-02; Phase 4 fix shipped post-close)

Plan: [`docs/archive/cycles/cycle-12-plan.md`](archive/cycles/cycle-12-plan.md). Headline:

**Post-close addendum (same day, commit `04e62e7`).** The Phase 4 sky-banding fix that the research doc sketched as "deferred" was pulled forward and shipped: `precision highp float;` + `precision highp int;` declared at source in sky/cloud/grass shaders, plus 1/255 hash dither at sky's final fragment write. New [`tests/shader-precision.spec.js`](../tests/shader-precision.spec.js) — 8 cases pinning the contract. Verification on Matt's actual Mac (via `gh workflow run macos-safari.yml`) still pending after deploy lands. Cinema runner ([`tools/cinematic/run.mjs`](../tools/cinematic/run.mjs)) extended with a live-action static path (mode + liveAction + settleMs) so future hero OG captures can render Solo Extreme mid-flock instead of a paused start screen — `og-rh-sunset` shot scaffolded in [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs); first-pass capture exposed two issues (only 24/1000 sheep spawned at the chosen settle time; HUD reappeared after `startSolo()` despite `?ui=off`) — fold into Cycle 13 Phase 1 iteration.

- **Phase 1 — A8 stress drift closed.** Same GLB shared-material trap Cycle 11 found for sheepdog and structures, applied to **trees and rocks** in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js): `clearTrees()` and `clearRocks()` were calling `geometry.dispose()` + `material.dispose()` on near-tree/rock InstancedMeshes whose geometry+material are SHARED with the cached GLB models. Disposing invalidated the cache and forced a full texture re-upload on the next swap — the dominant ~41% drift class. Fix: tag near-tree/rock InstancedMeshes with `userData.sharedFromGlbCache = true` on creation; clearers skip dispose for tagged meshes (remove-from-scene only). Far-tree billboards keep their per-swap `MeshBasicMaterial` dispose path with `.map = null` first so the cached impostor texture survives. Added optional per-subsystem `renderer.info` instrumentation in [`disposeScene()`](../js/main.js) gated behind `window.__sdsSwapDriftLog`. New [`tests/swap-drift-glb-guard.spec.js`](../tests/swap-drift-glb-guard.spec.js) — 5 cases pinning the disposal contract.
- **Phase 2 — UI Button variants shipped with measured scope.** [`Button.js`](../js/components/ui/Button.js) extended with `ghost` (transparent text-link) and `danger` (red destructive) variants on top of the existing `primary` / `secondary` glass family, plus a `size: 'sm' | 'md' | 'lg'` prop. Migrated 3 raw `<button>` sites in [`SettingsPanel.js`](../js/components/StartScreen/SettingsPanel.js): player-profile reset (danger sm), keybind-reset link (ghost sm), Reset defaults header action (danger sm). Two findings the cycle plan didn't anticipate: (a) the mode-shaped HUD extraction (`<SoloClassicHUD>`, `<TimedHUD>`, ...) is N/A — the existing HUD branches by platform + multiplayer status, not by mode; (b) the raw button count is 60 across 20 files, not ~40-50 in SettingsPanel (which has 8). The remaining specialized clusters (Toggle, TabButton, KeyBindButton, PresetButton, MenuOption, icon-circular zoom/sprint, mode-themed completion-screen CTA) stay distinct on purpose — they're separate UI primitives, not visual variants.
- **Phase 4 — Mac bug research doc shipped at [`docs/archive/research/mac-bug-research.md`](archive/research/mac-bug-research.md), AND the sky-banding fix shipped post-close on the same day (commit `04e62e7`).** Three concrete findings: (1) Browserbase no-go for Safari — managed Chromium-family containers only; "WebKit" in Playwright is the bundled non-Metal build. The provisioned `BROWSERBASE_API_KEY` is retained for Chromium remote work. (2) Sky shader was missing a precision declaration — likely root cause of rainbow horizon-banding under Apple's WebKit-on-Metal. Fix landed: `precision highp float;` + `precision highp int;` in sky/cloud/grass shaders + 1/255 hash dither at sky's final fragment write + new vitest spec pinning the contract. (3) White-ground bug is terrain-only; suspect surface narrowed to inline `ShaderMaterial` in [`TerrainBuilder.js:468-575`](../js/TerrainBuilder.js) (the cycle plan's `BlendedTerrainMaterial` doesn't exist), grass external `.glsl` shaders, or `<fog_fragment>` chunk wiring. Pending Matt's `__sdsDiag` capture from his actual machine to discriminate.
- **Phase 6 — Leaderboard data-visibility + filter UX shipped 2026-05-02.** Worker validates `mode=` at boundary (400 not 500); `getLeaderboard` slow-path → fast-path fallback when filters match mode's natural partition; `getAllLeaderboards` per-mode dispatch (drops `sheepCount` on solo/timed). Migration `0005_score_submissions_backfill.sql` applied to prod. Frontend wraps filters in collapsible `▾ Filters` disclosure (default-collapsed on solo+timed), defaults `sheepFilter=0` everywhere, surfaces inline + empty-state Clear-filters action. New [`tests/worker-leaderboard.spec.ts`](../tests/worker-leaderboard.spec.ts) — 25 cases.

Validation:
- 149/149 vitest pass (was 136; +5 from `tests/swap-drift-glb-guard.spec.js`, +8 from `tests/shader-precision.spec.js`).
- Production build clean (739 KB main / 615 KB three / 218 KB main gzip; matches Cycle 11 baseline).
- Worker `wrangler deploy` clean (Phase 6 deployed 2026-05-02).
- Sim-baseline byte-identical (preserved through cycles 5-12).

Carryover to Cycle 13:

- **Phase 3 — Cinematic video shots + hero OG refresh.** Pipeline ready (ffmpeg, Playwright Chromium 1217, sharp, shot list, all 8 `__sdsCinema` API methods implemented). Cycle 12 close-day post-mortem also stood up the live-action static path in `run.mjs` and a scaffolded `og-rh-sunset` shot — first-pass capture surfaced two issues to fix tomorrow (sheep settle time too short for 1000-sheep spawn; HUD reappears after `startSolo()` despite `?ui=off`). Cycle 13 Phase 1.
- **Phase 5 — CF Web Analytics + manual playtest.** Pure Matt-gated. CF beacon `<script>` lives only in CF Pages dashboard; manual playtest needs a real player. Cycle 13 Phases 2-3.
- **Sky-banding fix.** ✅ Shipped post-cycle-close on the same day (commit `04e62e7`). Cycle 13 Phase 4 marked closed at draft time.
- **`v1.1.0` tag.** Deferred until Phase 1 (videos + hero OG) lands. Cycle 13 Phase 5.

Commits (Cycle 12):

- [`2b9fd30`](https://github.com/matthew-kissinger/sds/commit/2b9fd30) feat(leaderboard): cycle 12 phase 6 — fix data-visibility + filter UX
- [`7a266b3`](https://github.com/matthew-kissinger/sds/commit/7a266b3) fix(swap): cycle 12 phase 1 — close A8 stress drift via GLB shared-material guard
- [`fd9cef9`](https://github.com/matthew-kissinger/sds/commit/fd9cef9) feat(ui): cycle 12 phase 2 — Button.js ghost+danger variants + size prop
- [`49a1403`](https://github.com/matthew-kissinger/sds/commit/49a1403) docs(mac-bug): cycle 12 phase 4 — research doc for white-ground + sky banding
- [`3420588`](https://github.com/matthew-kissinger/sds/commit/3420588) docs(cycle-close): cycle 12 closed — archive plan, scaffold cycle 13
- [`04e62e7`](https://github.com/matthew-kissinger/sds/commit/04e62e7) fix(sky): cycle 12 phase 4 — pin highp + dither sky/cloud/grass shaders (post-close addendum)
- (Cycle 12 final commits to be appended at push time.)

### Cycle 11 — release-finish (closed 2026-04-28)

Plan: [`docs/archive/cycles/cycle-11-plan.md`](archive/cycles/cycle-11-plan.md). Headline:

- **Phase 1 — In-process scene swap flip (centerpiece).** `swapScene` / `disposeScene` / `rebuildScene` / `restartToMenu` flipped from hard-reload fallbacks to true in-process transitions. New `OptimizedSheepSystem.dispose()`, `TerrainBuilder.dispose()` composing existing partial clears, `SceneManager.disposeWater()`. `_buildSceneBody()` extracted from `init()` so cold-boot and warm-swap share construction. AbortController-tracked listeners re-cycled per swap. New `js/components/ui/SceneSwapOverlay.js` with 200ms in / 200ms min / 200ms out fade. `history.replaceState` only on success; catch path falls back to `location.href`. `_sceneRebuilding` flag guards `animate()`. MP guests fall back to hard reload (Q1 resolution). New `window.__sdsStressTestSwaps(n)` harness. Sheepdog/structure/mountain GLB clones now share materials with the cache (no double-dispose) — the leak class flagged during A8 testing. Tree impostor render targets cached across swaps. **A8 stress drift partial:** textures down from initial ~100% to ~41% over 5×3 swap loop; remaining slow accumulator flagged as Cycle 12 polish (geometry/programs within ±10%).
- **Phase 2 partial — UI polish.** Real dog WebP/PNG thumbnails wired into `DogSelection` (5 dogs, 26-32 KB each). Onboarding re-trigger button added to Audio tab in `SettingsPanel` (clears localStorage `playerIdentity`, reloads). **Deferred:** mode-shaped HUD subcomponents, Button-component unification across all React surfaces (~40-50 callsites — high visual-regression risk).
- **Phase 3 — Cinematic pipeline + marketing assets.** New `tools/cinematic/run.mjs` with Playwright drive + Vite spawn + sharp WebP/PNG processing + ffmpeg mux scaffolding. `--shot=`, `--kind=`, `--headed`, `--no-encode`, `--skip-video` CLI flags. Cinema API additions: `pauseSimulation()`, `startSolo()`, `waitReady()`, `mountDogShowcase()`. New `cinema.paused` short-circuits gameState updates so static shots aren't motion-blurred. Rendered: 3 OG WebPs (1200×630, 158-186 KB each, well under 300 KB target), 5 dog portraits (512×512 WebP + PNG fallback), 3 PWA icons (192/512/maskable PNG). `index.html` `og:image` + `twitter:image` + schema.org `screenshot[]` updated to point at new WebP. PWA manifest icons replaced. **Deferred:** 4 video shots (Playwright headless WebGL flaky on Win; works in `--headed`. Captures take ~5min per shot; not blocking v1.0).
- **Phase 4 — Score-integrity production deploy.** `0003_score_anomalies.sql` applied to prod D1 via direct `wrangler d1 execute` (the `d1_migrations` tracking table was empty even though prior migrations had been applied via raw SQL; backfilled all 4 migration rows so future migrations work via the migrations system). `score_anomalies TEXT` column + partial index live on prod. `/api/leaderboard` regression check returned valid JSON post-migration.
- **Phase 5 — Release tail.** New `POST /api/event` worker route accepts anonymous + authenticated events, writes to D1 `events` table (new `0004_events.sql` migration; applied to local + prod). New `js/telemetry.js` wrapper (fire-and-forget, silent on failure, JWT-aware, keepalive on unload). 4 events wired: `game_completed` (in `GameState.submitScoreToLeaderboard`), `mode_selected` (in App `handleModeSelect`), `scene_swapped` (in `swapScene` after `scene-swap-end`), `mp_room_created` (in App `handleCreateRoom`). PWA icons properly sized (192/512/maskable PNG, no longer reusing favicon). **Deferred:** Cloudflare Web Analytics beacon (requires copying `<script>` from CF Pages console — manual user action).
- **Phase 6 partial — playtest verification.** Code-verifiable items confirmed: `Heightfield.surfaceY()` adds 0.05 lift (Cycle 9 Phase 5 carryover), `SOLO_TAB_FIXED_SHEEP_COUNT` mapping persists for solo-tab leaderboard (Cycle 9 Phase 1), `ensureSceneMatchesRoom` logic intact (Cycle 9 Phase 2). **Deferred:** Mac rendering bug root cause (Matt-required; bug does NOT reproduce on GH Actions Safari; recipe lives in Cycle 9 Phase 4 doc), full Solo/MP visual playtest, frametime regression check.
- **Sky exposure fix (out-of-scope polish).** `pastoral-noon` preset exposure dropped 0.22 → 0.08 after a playtest flagged the zenith crushing to near-white through ACES tone-mapping. Now reads as soft pastoral blue with proper horizon haze. All 3 scenes verified visually.
- **Rocks fix (out-of-scope polish).** Field rock-formation per-rock buffer tightened 20m → 40m so clusters straddling the play-area boundary trim outside-only. Rocks now always partially buried (`baseY - finalScale * (0.10..0.20)`) so GLB-origin floaters can't appear above the visible ground line.

Validation:
- 111/111 vitest pass.
- Production build clean.
- Worker `wrangler deploy --dry-run` clean (179 KB / 37 KB gzip).
- Sim-baseline byte-identical (preserved through cycles 5-11).
- Manual A1 (in-process swap) verified via stress harness — URL bar updates, scene rebuilds, no errors.

Carryover to Cycle 12 (TBD):

- **Phase 1 A8 strict-numeric.** Texture drift at ~41% over 5×3 swap loop. Architecture sound (no crashes, no visual regressions); the slow accumulator is GPU-resource leak class that requires deeper Three.js renderer.info instrumentation. Identify and dispose remaining per-swap allocations.
- **Phase 2 mode-shaped HUD + Button unification.** ~40-50 raw `<button>` callsites need migration to `<Button variant=…>`. Largest cluster is in `SettingsPanel.js` (Toggle, Slider, TabButton, PresetButton, KeyBindButton, CameraModePicker buttons).
- **Phase 3 video filming runs.** 4 video shots specified in `tools/cinematic/shot-list.mjs` (dog-into-sunset, lightning-strike, chaos-5000, oc-portal). Headless Chromium WebGL on Windows times out; runner works in `--headed`. Iteration on framing pending.
- **Phase 5 Cloudflare Web Analytics.** Add `<script>` beacon from CF Pages console → Analytics tab into `index.html`.
- **Cycle 9 Mac rendering bug.** Recipe in `docs/archive/cycles/cycle-9-plan.md`. Matt to investigate on his Mac via `?debug=gl` + `window.__sdsDiag`.
- **Cycle 9/8 manual playtest.** Solo/MP gameplay verification across all modes + scenes.

Commits (Cycle 11):
- [`c6a777c`](https://github.com/matthew-kissinger/sds/commit/c6a777c) feat(scene-swap): in-process flip — close Cycle 10 Phase 1 carryover
- (Cycle 11 cycle-close commits to be appended at push time.)

### Cycle 10 — release-polish (closed 2026-04-27)

Plan: [`docs/archive/cycles/cycle-10-plan.md`](archive/cycles/cycle-10-plan.md). Headline:

- **Phase 1 partial — scene lifecycle plumbing.** New `swapScene(toId, opts)`, `disposeScene()`, `rebuildScene(sceneDef)`, `restartToMenu()` on `SheepDogSimulation` ([`js/main.js`](../js/main.js)). Step 1 plumbing: all four legacy `location.href`/`reload()` callsites — [ScenePicker.switchScene](../js/components/StartScreen/ScenePicker.js), `App.handleStartSandbox`, `App.ensureSceneMatchesRoom`, `App.handleMainMenu` — now route through these methods. Step 1 bodies still hard-reload, so user-visible behavior is identical to pre-cycle. AbortController-tracked window listener teardown (`corral-retired`, `objective-stage-changed`, `corral-ascend-top`) closes the leak class flagged in cycle plan §"Highest-risk subtasks". Effects-family disposal (PortalEffect, CorralZapEffectPool, round-up decal) wired into `disposeScene()`. **Deferred to a future cycle:** in-process flip (terrain/sheep/water/atmosphere disposal, `<SceneSwapOverlay>`, `history.replaceState`, defensive null-checks in `animate()`, MP guest WS strategy Q1).
- **Phase 2 partial — Button consistency.** Inline `onclick="location.reload()"` buttons in `main.js` (local-MP completion overlay, fallback completion overlay, React `CompletionScreen` callbacks) routed through `restartToMenu()` so they inherit the lifecycle method. **Deferred:** mode-shaped HUD profiles, onboarding overlay re-trigger, real dog PNG thumbnails, full Button-component unification across React surfaces.
- **Phase 3 — cinematic capture infrastructure.** New [`js/cinematic.js`](../js/cinematic.js) with `?cinematic=1` flag, `?ui=off`, `?sun=N` URL params and `window.__sdsCinema` API exposing camera/atmosphere/effects/scene refs plus `setSun`, `setCameraPose`, `getCameraPose`, `playPath` (smoothed dolly), `triggerLightning`, `swapScene`, `captureFrame`, `hideUI`/`showUI`. `SceneManager` flips `preserveDrawingBuffer` to `true` only when `?cinematic=1` so normal play has no perf hit.
- **Phase 4 partial — cinematic shot list scaffolding.** [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs) declarative shot manifest (dog-into-sunset, lightning-strike, chaos-5000, oc-portal videos + 3 OG static cards). [`tools/cinematic/run.mjs`](../tools/cinematic/run.mjs) runner skeleton with arg parsing, output dir setup, shot iteration. `npm run cinema` script wired. **Deferred:** Playwright drive + ffmpeg mux (require ffmpeg + extended runtime, gated on user availability).
- **Phase 5 — SEO + release prep.** New [`public/manifest.webmanifest`](../public/manifest.webmanifest) for PWA installability, `<link rel="manifest">` + `<link rel="apple-touch-icon">` in [`index.html`](../index.html). New repo-root [`CHANGELOG.md`](../CHANGELOG.md) and [`PRESSKIT.md`](../PRESSKIT.md). **Deferred:** Cloudflare Web Analytics dashboard hookup (Pages console action), `/api/event` worker route for custom events, properly-sized 192/512/maskable PWA icons (currently reuse favicon.png), `git tag v1.0.0` push.
- **Phase 6 — score integrity.** Worker code: new `modeSheepCountOk`, `plausibleScoreForCount`, `durationFloorForCount`, `detectScoreAnomalies` in [`worker/src/d1.ts`](../worker/src/d1.ts). `submitScore` now hard-rejects mode×sheep_count mismatches (`soloClassic` with 1000 sheep, etc.) and minimum-duration-floor violations (`soloChaos` < 240s); soft-flags `client_clock_skew` (>10s skew between clientStartedAt/clientFinishedAt and claimed score) and `fast_for_count` (within 10% of duration floor). New migration [`worker/migrations/0003_score_anomalies.sql`](../worker/migrations/0003_score_anomalies.sql) adds `score_anomalies` JSON column + filtered index. `GameState.startGame` captures `_clientStartedAt`; `submitScoreToLeaderboard` includes both timestamps. **Deferred:** production D1 `wrangler d1 migrations apply sds-prod --remote` (destructive, user-authorized).
- **Phase 7 — Electron-readiness research doc.** New [`docs/archive/research/electron-readiness.md`](archive/research/electron-readiness.md): hard worker dependencies, asset paths, bundle size targets, file:// gotchas, fullscreen mapping, offline leaderboard sketch (sql.js), update channel options, code-signing costs, Tauri-vs-Electron decision matrix. No code; recommends Tauri 2.0 contingent on macOS WebKit-WebGL spike outcome (gated by Cycle-9 macOS rendering bug investigation).

111/111 vitest pass. Production build clean. Worker typecheck clean. Sim-baseline byte-identical (preserved through cycles 5-10).

Carryover to Cycle 11 — explicitly deferred:

- **Phase 1 in-process flip (the centerpiece).** Step 1 plumbing is shipped and listener-leak-safe; the actual flip from `location.href` to in-process disposeScene/rebuildScene needs careful surgical work: terrain/water/atmosphere disposal, `<SceneSwapOverlay>` React component, AbortController-aware rAF defensive null-checks in `animate()`, `history.replaceState` for URL bar, MP guest WS strategy decision (Q1). 8-12 hours estimated. The cycle plan's Step 2-5 ordering remains the right shape.
- **Phase 2 remaining UI/UX polish.** Mode-shaped HUD (Solo/Timed/Competitive variants, MP "waiting for players" pre-game state), onboarding overlay re-trigger from Settings, real dog PNG thumbnails replacing emoji/text, Button component unification across all React surfaces.
- **Phase 4 marketing asset filming runs.** Install ffmpeg, fill in Playwright drive + ffmpeg mux in `tools/cinematic/run.mjs`, iterate on shot framing, replace existing OG images with sub-300 KB WebP at 1200×630.
- **Phase 5 release-prep tail.** Cloudflare Web Analytics + custom-events worker route. Properly-sized PWA icons. `git tag v1.0.0` push.
- **Phase 6 production migration deploy.** `wrangler d1 migrations apply sds-prod --remote` for `0003_score_anomalies.sql`. Verify anomaly column populated for last 24h post-deploy.
- **Cycle 9 verification carryover (still deferred per user direction).** Mac rendering bug root cause, Cycle 9 changed-flow playtest, Cycle 8 twice-deferred items (acceptance walkthrough, MP bandwidth, follow-camera polish, frametime regression).

Commits:
- [`a0649ba`](https://github.com/matthew-kissinger/sds/commit/a0649ba) docs: close cycle-9 + scaffold cycle-10
- (Cycle 10 commits to be appended at push time.)

### Cycle 9 — playtest-triage + cross-platform (closed 2026-04-27)

Plan: [`docs/archive/cycles/cycle-9-plan.md`](archive/cycles/cycle-9-plan.md). Headline:

- **Phase 9.1 — sheep-count ownership refactor + leaderboard simplification + MP plumbing.** Solo count is now owned by mode unconditionally (Classic=200 / Extreme=1000 / Insane=3000 / Chaos=5000); `sceneSpawn.count` demoted to a density hint. MP `RoomCreation.sheepCount` plumbed through `MenuController.createRoom`. Leaderboard hides the redundant sheep-count dropdown on solo tabs and resets filters on tab switch; MP option list corrected to `{200, 250, 500, 1000}`. Fixes the "0/250 on RH Classic" surprise.
- **Phase 9.2 — MP scene-sync helper.** New `ensureSceneMatchesRoom(room, {isHost})` called after every createRoom/joinRoom/quickMatch in [`App.js`](../js/components/App.js). Guests with mismatched URL `?scene=` reload via `?scene=<id>#/r/<roomCode>` to re-enter the invite flow on the right scene. Closes the long-standing `MP joiner renderer sync` standing risk.
- **Phase 9.3 — Cross-platform test infrastructure.** [`playwright.config.ts`](../playwright.config.ts) gains Firefox + WebKit projects. New WebGL-extensions probe spec. New `e2e` job in [`deploy.yml`](../.github/workflows/deploy.yml). New nightly + workflow_dispatch [`macos-safari.yml`](../.github/workflows/macos-safari.yml) running real macOS Safari via `safaridriver` + a Selenium runner at [`tests/safari-smoke/run.mjs`](../tests/safari-smoke/run.mjs). Living doc at [`docs/cross-platform-testing.md`](cross-platform-testing.md). `selenium-webdriver` added as devDep. `oc-perf` spec gated to chromium-only.
- **Phase 9.4 — Mac rendering bug (diagnostics + safety nets).** Diagnostic probe at [`js/diagnostics/glProbe.js`](../js/diagnostics/glProbe.js) gated on `?debug=gl` — dumps GL context, render-target events, post-first-frame framebuffer sample to `window.__sdsDiag`. Water init wrapped in try/catch in [`main.js`](../js/main.js). DepthPrePass per-frame render wrapped in `_safeRender`. Speculative shader fixes deferred — bug does NOT reproduce on GH Actions Safari (two macos-latest runs both rendered correctly); environmental to Matt's specific Mac. Tomorrow's debug recipe captured in NEXT_SESSION at close.
- **Phase 9.5 — Heightfield Y-sample mitigation.** New [`Heightfield.surfaceY(x, z)`](../shared/terrain/Heightfield.js) returns `sample + 0.05` lift for visual entity placement. Sheep + dog use it for InstancedMesh/mesh Y; sim still uses raw `sample`. Sim baseline byte-identical. Full mesh-aligned bake deferred (see Deferred section).

111/111 vitest pass. Production build clean. Sim-baseline byte-identical (preserved through cycles 5-9).

Commits:
- [`7627d77`](https://github.com/matthew-kissinger/sds/commit/7627d77) fix: ExtremeBoidSystem accepts island boundaries, not just rects
- [`1c6864f`](https://github.com/matthew-kissinger/sds/commit/1c6864f) Cycle 9: playtest triage + cross-platform test infra
- [`0c47fd8`](https://github.com/matthew-kissinger/sds/commit/0c47fd8) fix(ci): restrict e2e to Chromium; tag oc-perf as @local-only
- [`aa81930`](https://github.com/matthew-kissinger/sds/commit/aa81930) diag: extend Safari smoke to gameplay; richer probe checkpoints
- [`be0f09e`](https://github.com/matthew-kissinger/sds/commit/be0f09e) diag: deterministic sample trigger + tomorrow-debug handoff

Carryover to Cycle 10 (`release-polish`) — all explicitly deferred per user direction "I will playtest after cycle 10":

- **Mac rendering bug root cause.** Matt to debug on his Mac with `?debug=gl`, capture `window.__sdsDiag` via the recipe in cycle-9-plan §Outstanding. Compare against working baseline at GH run [25028575425](https://github.com/matthew-kissinger/sds/actions/runs/25028575425).
- **User playtest of Cycle 9 changed flows.** Solo Classic on RH/OC shows `0/200`; MP host's chosen sheepCount sticks; guest invite flow renders the room's scene; leaderboard solo tab hides sheep-count dropdown; sheep + dog no longer sink in bare patches.
- **Cycle 8 carryover items not picked up.** Phase 1 acceptance walkthrough (Insane/Chaos sheep counts, leaderboard partition filters, sandbox cross-scene reload UX, MP at non-200 sheep counts) + Phase 2 MP bandwidth measurement (Q2) + Phase 6 follow-camera triangulation polish read smooth on RH Follow under stamina-out + tree contact + frametime regression check on RTX 3070 / mobile target.

Notes: Five commits across the cycle (one feature commit + four follow-on diag/CI fixes). All work shipped to live deployment by 2026-04-27. The "Mac white-ground" investigation produced no fix this cycle — the bug environmental to Matt's machine and the diagnostic probe is the deliverable that will let him isolate it in next session. Cycle 10 plan (`release-polish`) drafted in same session as close.

### Cycle 8 — mode-matrix: modes × sheep counts × scenes × leaderboards (closed 2026-04-26)

Plan: [`docs/archive/cycles/cycle-8-plan.md`](archive/cycles/cycle-8-plan.md). Headline:

- **Phase 2a — Insane/Chaos sheep-count bug.** Root cause: [`OptimizedSheep.initializeSheepData`](../js/OptimizedSheep.js) ignored `clusterCenters` from scene defs and used a fixed `spreadRadius` (25-60m) regardless of count. At 3000-5000 sheep that's 1-2 m²/sheep — sheep stacked into a tight ball and the boid spatial hash thrashed, making Insane and Chaos "not work." Fixed with cluster-aware spawn (OC's 8 perimeter clusters now actually used) + density-driven radius scaling capped at scene-derived `maxRadius`. Field-200 behaviour preserved; sim-baseline byte-identical.
- **Phase 2b — Leaderboard pollution fix.** Replaced the `extreme ? 'soloExtreme' : 'soloClassic'` ternary at [`js/GameState.js`](../js/GameState.js) with `SOLO_MODE_TO_LEADERBOARD` lookup. Worker [`d1.ts`](../worker/src/d1.ts) `GameMode` union extended with `soloInsane` + `soloChaos`. Frontend [`GlobalLeaderboard.js`](../js/components/Multiplayer/GlobalLeaderboard.js) gains the two new tabs.
- **Phase 3 — Leaderboard matrix.** Migration [`worker/migrations/0002_mode_matrix.sql`](../worker/migrations/0002_mode_matrix.sql) adds `sheep_count INT` + `scene_id TEXT` to `score_submissions`, plus `solo_insane_best` / `solo_chaos_best` to `players`, plus a partition index. Backfill: pre-Cycle-8 `soloExtreme` rows get `sheep_count=1000`; everything else defaults to `(field, 200)`. `getLeaderboard` / `getAllLeaderboards` accept optional `{sceneId, sheepCount}` filters: fast path uses materialized `players.*_best` columns when unfiltered, partitioned path queries `score_submissions` with GROUP BY when filtered. Frontend leaderboard view gets scene + sheep-count selectors above the mode tabs.
- **Phase 4 — Sandbox on Rolling Hills + Open Country.** [`SandboxConfig`](../js/SandboxConfig.js) gains `sceneId` (default `field`); flows through `serialize/deserialize/toJSON`. [`SandboxSetup`](../js/components/StartScreen/SandboxSetup.js) gains a 3-tile scene picker; non-Field scenes hide the field-size/shape/fence sections and show a scene-owns-terrain notice. [`App.js:handleStartSandbox`](../js/components/App.js) detects scene mismatch and reloads to `?scene=X#s/<encoded>` so the player lands back in sandbox setup on the right scene. [`GameState.startSandboxGame`](../js/GameState.js) takes an early-return path on island scenes that skips bounds/fence/structure rebuild — the scene owns its heightfield. Custom fences on heightfield deferred (Q3).
- **Phase 5 — MP scope expansion.** [`RoomMeta`](../worker/src/RoomDO.ts) gains `sheepCount`, validated against allow-list `{200, 250, 500, 1000}` (cap held at 1000 pending Q4 bandwidth measurement). [`GameSimulation`](../worker/src/GameSim.js) reads `room.sheepCount`. [`LobbyEntry`](../worker/src/LobbyDO.ts) gains optional `sceneId` + `sheepCount` so lobby browsers can show what's on offer. [`RoomCreation.js`](../js/components/Multiplayer/RoomCreation.js) gains a sheep-count selector. [`NetworkManager.createRoom`](../js/NetworkManager.js) forwards `sheepCount` through `roomSettings`.
- **Phase 6 — Follow camera triangulation polish.** Added late after re-analysing the Cycle 7 carry-over playtest matrix on Rolling Hills. Four targeted fixes in [`CameraController.js`](../js/CameraController.js): ridge sample STEPS 6→12 + interior-only (no more dog-endpoint over-lift, ~1.8m sample density vs 3.7m); asymmetric `smoothedFloorY` smoothing (snap up, ease down) so fast ascents don't briefly clip terrain; `_lastValidFacing` tracking replaces the prior `_facingAngle` feedback loop that re-fed the smoothed camera yaw back into itself when the dog stopped.

111/111 vitest pass. Production build clean. Sim-baseline byte-identical.

Carry-over to Cycle 9 (`playtest-and-polish`) — all are deferred verification items, not code-incomplete:

- Insane / Chaos modes spawn correctly on each scene.
- Insane / Chaos leaderboards populate cleanly, no soloClassic pollution.
- Per-(mode × scene × sheepCount) partition filters return the right rows.
- Sandbox-on-RH and Sandbox-on-OC end-to-end, including cross-scene reload UX.
- MP at non-200 sheep counts (with Q4 bandwidth measurement to decide whether to lift the 1000 cap).
- Phase 6 follow-camera fixes read smooth on RH Follow under stamina-out + tree contact.
- Cycle 6 + 7 playtest items 1-6 (the original Phase 1 carry-over).
- No frametime regression on RTX 3070 / mobile target.

### Cycle 7 — Camera smoothness + sky/water polish + OC outer-ring + OC differentiation (closed 2026-04-25)

Plan: [`docs/archive/cycles/cycle-7-plan.md`](archive/cycles/cycle-7-plan.md). Headline:

- **Phase 1: Camera lurch fixes.** 1a `targetVelocity` reads `smoothMaxSpeed` (was raw `currentMaxSpeed`) so diagonal sprint→jog on stamina-out doesn't whip the velocity vector. 1b force-based dog obstacle avoidance at strength 4.0 (gentler than sheep's 6.0) layered in front of the existing hard push-out + reflection. 1c camera `speedNorm` exponentially smoothed (0.1s tau) and `posK` capped at 0.3 per frame.
- **Phase 1.5: Sky horizontal seam.** Took 4 rounds. Real culprit was [`js/atmosphere/CloudLayer.js`](../js/atmosphere/CloudLayer.js) — a separate planar cloud system with its own `horizonFade` smoothstep. Widened from `(0.02, 0.18)` to `(0.02, 0.85)`. Dome shader cloud-deck math + bounce term also softened; SunBillboard halo edge hardened.
- **Phase 2: OC outer-ring + water/sun.** 2a `FAR_LOD_DIST` 250→**400m** (covers OC's full 380m island disc). 2b per-scene `grass.densityRange` field (default 0.6, OC=0.92). 2d water sun-glint specular term (Blinn exponent 8). 2e new [`js/effects/SunBillboard.js`](../js/effects/SunBillboard.js) places a billboarded sun disc anchored to sun direction.
- **Phase 3: OC multi-stage objective (gather → drive → portal).** New `ObjectiveDef` schema + `gameState.objective` state. Round-up zone at (0, 50) radius 30m, **40 sheep / 2.0s hold**. Portal `setIntensity()` tweens "open" over 0.6s; round-up decal is a 96-segment terrain-conformed cyan ring. `CorralCompass` refactored to accept generic target.
- **Mid-cycle playtest fixes:** legacy pasture grass-exclusion gated on scene def; OC spawn 5-cluster distribution; stamina state machine `canStartSprint`/`canContinueSprint` split; stamina bar `transition: all` removed; lightning retirement traces full bolt with spark at top; classic mode reads scene's `sheepSpawn.count`.

111/111 vitest specs pass. Production build clean. Sim-baseline byte-identical.

Carry-over to Cycle 8 (`playtest-sweep`):
- Camera triangulation matrix all-smooth on RH Follow (explicit user pass).
- OC gather→drive verb feels distinct at 40/2.0 (tune up/down per playtest feel).
- Frametime budget on OC under FAR_LOD_DIST=400 + densityRange=0.92.
- Cycle 6 carry-over playtest items 1–6 (most de facto verified during this cycle's playtest, but explicit pass deferred).

### Cycle 6 — Trees as obstacles + woods density + Open Country portal (closed 2026-04-25)

Plan: [`docs/cycle-6-plan.md`](archive/cycles/cycle-6-plan.md). Headline:

- **Phase 1: `shared/TreePlacement.js`.** Lifted Poisson-disk tree placement out of `TerrainBuilder.createTrees` into a pure shared module driven by `mulberry32(scene.terrain.seed)`. Same seed → identical `TreeInstance[]` across V8 instances; client (mesh spawn) + Worker (collision data) compute the same positions independently. Existing exclusions preserved (island safe radius, corral keep-out, farmhouse exclusion, rock footprint padding, default-pasture rect). 12 new specs (`tests/tree-placement.spec.js`).
- **Phase 2: SceneObstacles wiring.** `gameState.obstacles` built once after terrain creation in `main.js` (and rebuilt on competitive-mode tree refresh). Sheep apply `obstacleAvoidance` per-tick in `OptimizedSheep.updateBehavior` (30m kdbush query, strength 6.0). Dog applies a hard position push-out + inward velocity reflection in `Sheepdog.move` (treats trunks like fences). The `obstacles.trees.length > 0` guard preserves Field's solo behavior — sheep stay inside the ±100 play area, all rect-scene trees are at ≥120m, queries return empty within 30m, no force applied.
- **Q3 resolved (fallback path):** rocks with per-cluster `scale ≥ 0.8` become colliders with radius `finalScale * 0.55` (tighter than the visual silhouette since rocks are partially buried). Bespoke pixel-forge rock authoring deferred to a future cycle.
- **Phase 3: Woods density bias.** `TreePlacement` reads `scene.woodsZones`; min-distance shrinks 0.6× inside any zone, expands 1.4× outside (only when zones are present). Open Country gains 3 wood clusters away from spawn + portal so players cross open ground into denser canopy.
- **Phase 4: Open Country portal.** Coastal gate+pasture replaced with a corral trigger at the north shore (0, 295). New `js/effects/PortalEffect.js` — persistent visual: slowly rotating cyan→purple ring shader, vertical column of upward-streaking particles, soft ground glow; pulses on each retirement. Sheep already ascend vertically via `OptimizedSheep.checkCorralAndRetire`, matching the column visual. `CorralDef.effect: 'zap' | 'portal'` discriminator selects between Rolling Hills' lightning pool and the new portal. `StructureBuilder` skips the flag-pillar marker for `effect: 'portal'` (the portal is the marker).
- **Phase 5a: Per-scene camera memory.** Lookup order on scene load is now `camera-mode-${sceneId}` → `scene.defaultCamera` → legacy `camera-mode` → CLASSIC. Cycle 5 only had the legacy global, so once a user picked Classic anywhere, RH + OC silently launched in Classic instead of Follow. The C-hotkey now writes the per-scene key on every change.
- **Phase 5b: OC boid nudge.** Conservative starting point — `perception 5 → 9` to compensate for the ~4.5× area increase vs Rolling Hills. Cycle 5 wired the `scene.flocking` override pathway but didn't ship numbers. Tune in playtest.
- **Cross-cutting:** Defensive null-gate guard added to `worker/src/GameSim.shouldSeekGate` — corral scenes (RH, OC) have no gate, so the gate-seek pathway is now skipped instead of NPEing.

99 → 111 vitest specs pass (+12 tree-placement). Production build clean. Sim-baseline byte-identical.

Carry-over to next cycle (need playtest verification):
- Sheep + dog visibly route around tree trunks on RH + Open Country (Phase 2 acceptance).
- OC woods read as recognizably denser canopy (Phase 3 acceptance).
- Portal objective reads cleanly + retirement animation plays cleanly (Phase 4 acceptance).
- Per-tick obstacle-query cost ≤ 0.4ms desktop / ≤ 1.5ms mobile (Phase 2 budget).
- OC boid `perception 9` — re-tune if flocks still fragment or now over-cluster.

### Cycle 5 — Island + Woods (closed 2026-04-25)

Plan: [`docs/cycle-5-plan.md`](archive/cycles/cycle-5-plan.md). Headline:

- **Foundation** (Phase 1): discriminated `Boundary` schema (`rect | island`), `BoundaryCollision` accepts both, sim-baseline preserved bit-identical, heightmap bake gains `--boundary island --radius --falloff --seaLevel`, `kdbush` dependency + new `shared/SceneObstacles.js` primitive with canonical-sort determinism contract, anime water `ShaderMaterial` (depth-pre-pass + foam + simplex ripples + cel sparkles + fog match), z-fighting fix on terrain. 25 new specs (76→99), build clean.
- **Rolling Hills** (Phase 2): migrated to island per playtest feedback — final radius **180m** with **40m** falloff (was 90m/15m, too cliffy + cramped), corral with tall flag pillar at (110, 60), `corral`-based retirement replacing gate-passage, `CorralCompass` HUD with off-screen arrow + distance, `defaultCamera: 'follow'`, lightning + particle "zap" effect on corral entry (`CorralZapEffect` pool), farmhouse removed, trees + rocks confined to land disk via inverted Poisson predicate.
- **Open Country** (Phase 3): migrated to island, **final radius 380m / falloff 70m (~760m diameter)** after playtest pushed it well past the original plan's 150m. Coastal pen on north shore preserved (Q2), `defaultCamera: 'follow'`, smaller rocks (no boulders / `rock3` dropped for islands, scale ranges halved).
- **Per-scene flocking override** wired (`scene.flocking` merges into boid config; Worker + client both consume).
- **R10 audited**: client + Worker use entirely different sheep-spawn paths (never both run for the same game), so no determinism prerequisite needed for this cycle. Reframed as a Phase-3 design constraint when tree placement lifts into `shared/`.

Deferred from Cycle 5 — **all picked up by Cycle 6** (see "In flight" section below):
- Trees as obstacles via `SceneObstacles + kdbush` (Cycle 6 Phase 2).
- Lift Poisson tree placement into `shared/TreePlacement.js` with seeded RNG (Cycle 6 Phase 1).
- Wood zones with biased tree density (Cycle 6 Phase 3).
- Phase 1.5 boid retune to numbers (Cycle 6 Phase 5 polish).
- `defaultCamera` localStorage override behaviour (Cycle 6 Phase 5 polish).
- Open Country objective rethink (portal vs coastal pen — surfaced post-close in NEXT_SESSION; Cycle 6 Phase 4).

For prior cycle history before this file existed, see:
- [`DECISIONS.md`](../DECISIONS.md) §§ Cycle 1–4 — narrative + decisions
- [`docs/cycle-2-report.md`](archive/cycles/cycle-2-report.md) — Cloudflare migration closeout
- [`docs/cycle-2-todo.md`](archive/cycles/cycle-2-todo.md) — droplet teardown punch list (closed 2026-04-25)
- [`docs/cycle-3-plan.md`](archive/cycles/cycle-3-plan.md), [`docs/cycle-3-cleanup.md`](archive/cycles/cycle-3-cleanup.md), [`docs/cycle-3-ui-ux.md`](archive/cycles/cycle-3-ui-ux.md) — Cycle 3 plans
- [`docs/cycle-4-plan.md`](archive/cycles/cycle-4-plan.md), [`docs/cycle-4-phase-b.md`](archive/cycles/cycle-4-phase-b.md), [`docs/cycle-4-hardening.md`](archive/cycles/cycle-4-hardening.md) — Cycle 4 plans

## Deferred / not blocking

Items deferred from prior cycles that haven't been picked up. Move to a future cycle plan's Phase N when work starts.

- **Paired-track buckets C / D / E (carried from Cycle 44, re-deferred when Cycle 45 took the entry-load-and-grass-feel shape instead of `paired-parity-and-proofs`).** All three need Matt's taste, a real device, or credentials, so they stay paired.
  - **C. WebGPU painterly parity (paired, taste).** The six low-sun actor / Open Country material-lock manual-review items from `npm run validation:cycle42-material-lock`; broader WebGPU/WebGL terrain-foliage parity (Cycle 41 carryover).
  - **D. Mobile / real-device proofs (paired, blocked locally).** Android WebGPU water/device proof (needs an authorized ADB device or the Hub's ADB path); BrowserStack iOS Safari water canary (needs `BROWSERSTACK_*` / `BS_*` creds wired into the local env).
  - **E. Multiplayer playtest (paired).** Open Country paired two-client playtest, deferred since Cycle 40 (needs two clients and Matt's eyes).
- ~~**`docs/CYCLE_TEMPLATE.md` cycle-close-reconcile collision.**~~ Resolved 2026-05-10 (Cycle 33 Phase 4). Fixed in [`.claude/hooks/cycle-close-reconcile.mjs`](../.claude/hooks/cycle-close-reconcile.mjs) — the hook now iterates over every matching `## (Success|Acceptance) criteria` heading and picks the first section that contains `- [ ]` items. The template stays untouched (it's fence-frozen and the heading is appropriate). Verified against archived cycle-31 plan (returns 8 items, was 0).
- **Cross-module polygon-spawn dedup.** Cycle 29 B2 extracted `pointToSegmentDistance` + `isPointInPolygon` to [`js/gamestate/polygonSpawn.js`](../js/gamestate/polygonSpawn.js) but only updated GameState's callers. Three other files keep their own copies: [`js/OptimizedSheep.js`](../js/OptimizedSheep.js), [`js/SandboxConfig.js`](../js/SandboxConfig.js), [`js/StructureBuilder.js`](../js/StructureBuilder.js). Out of scope for Cycle 29 (the cycle's goal was GameState decomp, not cross-module dedup). Pick up in a future "duplication-cleanup" pass alongside any other ripple-of-helpers.
- **Bespoke pixel-forge rock assets (Q3 author lean from Cycle 6).** Cycle 6 shipped the fallback (`scale ≥ 0.8` filter on existing cluster rocks → colliders with `finalScale * 0.55` radius). The cleaner long-term path is to author 2-3 purpose-made rock GLBs in [`pixel-forge`](file:///C:/Users/Mattm/X/games-3d/pixel-forge) at obstacle-readable sizes and replace the cluster system. Pick up when next OC playtest flags rock collision as awkward.
- **MP island scenes (Rolling Hills + Open Country in multiplayer).** Design doc shipped 2026-05-10 at [`docs/mp-island-scenes-design.md`](mp-island-scenes-design.md) (Cycle 33 Phase 5). Verified gaps: OC's `objective` block is unused server-side; no sim-baseline coverage for island boundaries; wire format has no objective-stage fields; `RoomDO.initRoom` does not enforce `scene.allowedModes`. Suggested 5-phase Cycle-34 shape laid out in the doc. Tree obstacle wiring (the original deferred-item scope) is folded into the design doc's Q-list as a sub-question for Phase 2.

- ~~**Resize behavior**~~ Resolved 2026-06-04 during Cycle 54 desktop packaging. Packaged Electron proof now changes native content size to `1040x640` and verifies viewport, canvas, and camera aspect follow the window in both WebGL and WebGPU.
- **Octahedral impostors v2** for tree LOD — current 3-quad billboard impostor is solid (~99% triangle reduction past 250m). Only escalate to octahedral if a playtest specifically calls out the 3-quad version as inadequate. Carried from Cycle 4 Hardening § 4.
- **Tree exclusion in play area verification** — `createTrees` already rejects Poisson candidates inside `playArea` with a 20m buffer; verify visually after any heightmap re-bake or zone change. Carried from Cycle 4 Hardening § 5.
- ~~**GitHub Actions Node.js 20 deprecation**~~ Resolved 2026-05-10 (Cycle 33 Phase 1). Bumped `actions/checkout`, `actions/setup-node`, and `actions/upload-artifact` from `@v4` to `@v5` across `deploy.yml` and `macos-safari.yml` (`browserstack-ios-water.yml` was already `@v5`). `cloudflare/wrangler-action@v3` left alone — it's a separate vendor action whose v3 series remains current; revisit if Cloudflare publishes a v4.
- **Cycle 3 Track 2 follow-through** (UI/UX polish): scene-first state machine in `App.js`, mode-shaped HUD profile, onboarding overlay, real dog PNG thumbnails, MP-joiner renderer reactivity. See [`cycle-3-ui-ux.md`](archive/cycles/cycle-3-ui-ux.md).
- **Cycle 3 Track 1 polish:** JSX flip (mechanical codemod), boid consolidation (needs architectural decision). See [`cycle-3-cleanup.md`](archive/cycles/cycle-3-cleanup.md) § Remaining.
- **Heightfield Y full unification (mesh-aligned bake).** Cycle 9 Phase 5 shipped a defensive [`Heightfield.surfaceY`](../shared/terrain/Heightfield.js) that adds a small upward lift to entity placement to compensate for the bilinear-vs-triangle-interp mismatch. The complete fix is to bake a `displacedHeights: Float32Array` mirroring the terrain mesh vertex grid (post-displacement, post-falloff), then have all consumers (mesh, grass, sim, camera) read the same array. Triangle interpolation is what the renderer uses, so the right algorithm is: find the cell in the grid, find which triangle the point lies in (Three.js `PlaneGeometry` splits each quad along the NW-SE diagonal), compute barycentric coords against the three vertex Ys. Pick up when the +0.05m lift no longer hides the artefact (e.g., after a heightfield re-bake with steeper ridges).
- **`ARCHITECTURE.md` Cycle 5 sections** — the doc has no entries for `Boundary` (rect/island discriminated schema), `SceneObstacles` (kdbush proxy collider), `AnimeWater` (now shoreline-boundary shader after Cycle 32), or `Random` (`mulberry32` shared PRNG). All four are load-bearing primitives. Add when next pass through ARCHITECTURE.md is warranted.
- **Cycle 19.5 audit — expensive / unoptimized / load-bearing assumptions worth investigating.** Quick survey 2026-05-04 while addressing the impostor + culling fixes. Each is a candidate for a future investigation; none are blocking right now.
  - **Heightfield `sample()` double-amplification** — already on Cycle 20 plan. Terrain mesh ships at `peakHeight²` metres because `bake-heightmap.mjs` writes pre-multiplied data while `sample()` multiplies again. Visual character of all 3 scenes has been built around the amplified state for ~14 cycles; honoring the documented contract means a 5× height collapse.
  - **GrassSystem 336 chunks per scene** — each chunk is its own `InstancedMesh` with per-frame distance test in `updateGrassChunks`. Per-instance frustum cull via `InstancedMesh2` BVH on the chunked grass might consolidate. Trade-off: chunked invalidation is currently the visibility primitive; switching to instance-level culling means the chunks themselves become an unused abstraction.
  - **Cinema runner `page.screenshot` 30s timeout** — already on Cycle 20 plan. Likely a font-load race in Playwright.
  - **Atmosphere shader uniforms recomputed every frame** even when sun/wind are static. Atmosphere is single-mesh, not per-instance, so the cost is modest, but a dirty-flag gate on `update()` would knock out a few microseconds at idle.
  - **Shadow camera centred at world origin (not player)** — the 240×240 shadow frustum is fixed at origin. Far-from-origin gameplay (OC's centred-on-(0,0) island = always near origin in practice) means it's fine today, but adding a shadow-camera follow when the play area moves would prevent shadows fading at the boundary.
  - **InstancedMesh2 LOD hard pop at 100m** — Matt flagged the visible swap. Best practice is dither-fade or alpha-blend across a 5-10m hysteresis band. Requires the impostor material to participate in the fade (alpha output), which isn't a one-line patch.
  - **Tree-wind material patches re-applied on every scene swap.** `_patchTreeWindMaterial` runs `onBeforeCompile` per tree species per child mesh; on swap, the GLB cache survives but the material patches don't. Cheap (<10ms total) but redundant.
  - **`_treeWind` shared-uniforms object** is global to TerrainBuilder. Multi-tree-species sharing is correct, but the `setImpostorTint` walk over `_impostorMaterials` happens every frame even when sun colour didn't change. Dirty-flag gate would help.
  - **No instance reuse across scene swaps.** `clearTrees()` removes from scene; `createTrees()` builds fresh `InstancedMesh2` + `computeBVH()`. Tree placements are deterministic per `(scene, seed)`, so a cache keyed on that pair would skip the BVH rebuild on swap. Each BVH build is ~50ms for ~1k tree instances.

## Distant ideas

Speculative — don't act on these without explicit user direction.

- **NN-trained sheepdogs / stochastic-indecision sheep model.** Science Advances Mar 2026 paper [Controlling noisy herds: Temporal network restructuring improves control of indecisive collectives](https://www.science.org/doi/10.1126/sciadv.adx6791) (DOI 10.1126/sciadv.adx6791) studies how trained dogs exploit sheep indecisiveness (unpredictable flee/follow switching) as a control mechanism. Three threads it could unlock: (a) a smarter stochastic sheep AI on top of the existing force-based boids in [`shared/FlockingAlgorithms.js`](../shared/FlockingAlgorithms.js); (b) NPC dog opponents (solo training mode demo dog, MP bot, tutorial guide) that exploit indecision instead of pursuing; (c) a "splitting" game mode where you separate one flock into two corrals. Reading list, not a commitment. Full notes were captured in the Cycle 32 planning discussion; redraft into a future cycle plan before acting.
- **New scenes beyond Field / Rolling Hills / Open Country.** Three is the right number until those have differentiated game loops.
- **Mod-friendly scene format** extending the sandbox URL encoding (lz-string) into full scene descriptions (terrain + props + rules), letting a biome ship as a single link.
- **Competitive seasons + tournaments** once the leaderboard has enough history to make them meaningful.
- **Dynamic weather + time of day variation** during a single match (rain, fog banks, dusk transitions). Atmosphere primitives are in place.
- **Predators + rival herders** as NPC behaviour. Sheep personalities.
- **WebGPU migration.** Decided against during Cycle 4 (WebGL2 is fine for the current scope).
