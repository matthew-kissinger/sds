# SDS Backlog

> Append-only log of closed cycles and deferred work. Most recent at the top. The `/cycle-close` slash command writes the "Recently Completed" section automatically; "Deferred" and "Distant ideas" are edited by hand as items surface.

## Recently Completed

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
- **`ARCHITECTURE.md` Cycle 5 sections** — the doc has no entries for `Boundary` (rect/island discriminated schema), `SceneObstacles` (kdbush proxy collider), `AnimeWater` (depth-pre-pass shader), or `Random` (`mulberry32` shared PRNG). All four are load-bearing primitives shipped Cycle 5. Add when next pass through ARCHITECTURE.md is warranted; not blocking Cycle 6.

## Distant ideas

Speculative — don't act on these without explicit user direction.

- **New scenes beyond Field / Rolling Hills / Open Country.** Three is the right number until those have differentiated game loops.
- **Mod-friendly scene format** extending the sandbox URL encoding (lz-string) into full scene descriptions (terrain + props + rules), letting a biome ship as a single link.
- **Competitive seasons + tournaments** once the leaderboard has enough history to make them meaningful.
- **Dynamic weather + time of day variation** during a single match (rain, fog banks, dusk transitions). Atmosphere primitives are in place.
- **Predators + rival herders** as NPC behaviour. Sheep personalities.
- **WebGPU migration.** Decided against during Cycle 4 (WebGL2 is fine for the current scope).
