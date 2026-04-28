# SDS Backlog

> Append-only log of closed cycles and deferred work. Most recent at the top. The `/cycle-close` slash command writes the "Recently Completed" section automatically; "Deferred" and "Distant ideas" are edited by hand as items surface.

## Recently Completed

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

Plan: [`docs/cycle-6-plan.md`](cycle-6-plan.md). Headline:

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

Plan: [`docs/cycle-5-plan.md`](cycle-5-plan.md). Headline:

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
- [`docs/cycle-2-report.md`](cycle-2-report.md) — Cloudflare migration closeout
- [`docs/cycle-2-todo.md`](cycle-2-todo.md) — droplet teardown punch list (closed 2026-04-25)
- [`docs/cycle-3-plan.md`](cycle-3-plan.md), [`docs/cycle-3-cleanup.md`](cycle-3-cleanup.md), [`docs/cycle-3-ui-ux.md`](cycle-3-ui-ux.md) — Cycle 3 plans
- [`docs/cycle-4-plan.md`](cycle-4-plan.md), [`docs/cycle-4-phase-b.md`](cycle-4-phase-b.md), [`docs/cycle-4-hardening.md`](cycle-4-hardening.md) — Cycle 4 plans

## Deferred / not blocking

Items deferred from prior cycles that haven't been picked up. Move to a future cycle plan's Phase N when work starts.

- **Bespoke pixel-forge rock assets (Q3 author lean from Cycle 6).** Cycle 6 shipped the fallback (`scale ≥ 0.8` filter on existing cluster rocks → colliders with `finalScale * 0.55` radius). The cleaner long-term path is to author 2-3 purpose-made rock GLBs in [`pixel-forge`](file:///C:/Users/Mattm/X/games-3d/pixel-forge) at obstacle-readable sizes and replace the cluster system. Pick up when next OC playtest flags rock collision as awkward.
- **MP island scenes (Rolling Hills + Open Country in multiplayer).** Cycle 6 Phase 1's `TreePlacement` lift means MP island scenes are now feasible — Worker can call `generateTrees(scene, mulberry32(seed))` and produce identical positions to the client. The remaining work is wiring the obstacle bundle into Worker GameSim init + applying `obstacleAvoidance` in the shared sheep/dog tick. Solo Phase 2 wiring is the template.

- **Resize behavior** — on hold pending user reproduction. Renderer's resize handler in [`SceneManager.onWindowResize`](../js/SceneManager.js) looks correct; need a specific viewport size or device to repro. Carried from Cycle 4 Hardening § 3.
- **Octahedral impostors v2** for tree LOD — current 3-quad billboard impostor is solid (~99% triangle reduction past 250m). Only escalate to octahedral if a playtest specifically calls out the 3-quad version as inadequate. Carried from Cycle 4 Hardening § 4.
- **Tree exclusion in play area verification** — `createTrees` already rejects Poisson candidates inside `playArea` with a 20m buffer; verify visually after any heightmap re-bake or zone change. Carried from Cycle 4 Hardening § 5.
- **GitHub Actions Node.js 20 deprecation** — `actions/checkout@v4`, `actions/setup-node@v4`, `cloudflare/wrangler-action@v3` will be forced to Node 24 by June 2nd, 2026. Non-blocking until then; bump the action versions when convenient.
- **Cycle 3 Track 2 follow-through** (UI/UX polish): scene-first state machine in `App.js`, mode-shaped HUD profile, onboarding overlay, real dog PNG thumbnails, MP-joiner renderer reactivity. See [`cycle-3-ui-ux.md`](cycle-3-ui-ux.md).
- **Cycle 3 Track 1 polish:** JSX flip (mechanical codemod), boid consolidation (needs architectural decision). See [`cycle-3-cleanup.md`](cycle-3-cleanup.md) § Remaining.
- **Heightfield Y full unification (mesh-aligned bake).** Cycle 9 Phase 5 shipped a defensive [`Heightfield.surfaceY`](../shared/terrain/Heightfield.js) that adds a small upward lift to entity placement to compensate for the bilinear-vs-triangle-interp mismatch. The complete fix is to bake a `displacedHeights: Float32Array` mirroring the terrain mesh vertex grid (post-displacement, post-falloff), then have all consumers (mesh, grass, sim, camera) read the same array. Triangle interpolation is what the renderer uses, so the right algorithm is: find the cell in the grid, find which triangle the point lies in (Three.js `PlaneGeometry` splits each quad along the NW-SE diagonal), compute barycentric coords against the three vertex Ys. Pick up when the +0.05m lift no longer hides the artefact (e.g., after a heightfield re-bake with steeper ridges).
- **`ARCHITECTURE.md` Cycle 5 sections** — the doc has no entries for `Boundary` (rect/island discriminated schema), `SceneObstacles` (kdbush proxy collider), `AnimeWater` (depth-pre-pass shader), or `Random` (`mulberry32` shared PRNG). All four are load-bearing primitives shipped Cycle 5. Add when next pass through ARCHITECTURE.md is warranted; not blocking Cycle 6.

## Distant ideas

Speculative — don't act on these without explicit user direction.

- **New scenes beyond Field / Rolling Hills / Open Country.** Three is the right number until those have differentiated game loops.
- **Mod-friendly scene format** extending the sandbox URL encoding (lz-string) into full scene descriptions (terrain + props + rules), letting a biome ship as a single link.
- **Competitive seasons + tournaments** once the leaderboard has enough history to make them meaningful.
- **Dynamic weather + time of day variation** during a single match (rain, fog banks, dusk transitions). Atmosphere primitives are in place.
- **Predators + rival herders** as NPC behaviour. Sheep personalities.
- **WebGPU migration.** Decided against during Cycle 4 (WebGL2 is fine for the current scope).
