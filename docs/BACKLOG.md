# SDS Backlog

> Append-only log of closed cycles and deferred work. Most recent at the top. The `/cycle-close` slash command writes the "Recently Completed" section automatically; "Deferred" and "Distant ideas" are edited by hand as items surface.

## Recently Completed

### Cycle 5 — Island + Woods (closed 2026-04-25)

Plan: [`docs/cycle-5-plan.md`](cycle-5-plan.md). Headline:

- **Foundation** (Phase 1): discriminated `Boundary` schema (`rect | island`), `BoundaryCollision` accepts both, sim-baseline preserved bit-identical, heightmap bake gains `--boundary island --radius --falloff --seaLevel`, `kdbush` dependency + new `shared/SceneObstacles.js` primitive with canonical-sort determinism contract, anime water `ShaderMaterial` (depth-pre-pass + foam + simplex ripples + cel sparkles + fog match), z-fighting fix on terrain. 25 new specs (76→99), build clean.
- **Rolling Hills** (Phase 2): migrated to island per playtest feedback — final radius **180m** with **40m** falloff (was 90m/15m, too cliffy + cramped), corral with tall flag pillar at (110, 60), `corral`-based retirement replacing gate-passage, `CorralCompass` HUD with off-screen arrow + distance, `defaultCamera: 'follow'`, lightning + particle "zap" effect on corral entry (`CorralZapEffect` pool), farmhouse removed, trees + rocks confined to land disk via inverted Poisson predicate.
- **Open Country** (Phase 3): migrated to island, larger 250m radius / 50m falloff (~500m diameter), coastal pen on north shore preserved, `defaultCamera: 'follow'`, smaller rocks (no boulders / `rock3` dropped for islands, scale ranges halved).
- **Per-scene flocking override** wired (`scene.flocking` merges into boid config; Worker + client both consume).
- **R10 audited**: client + Worker use entirely different sheep-spawn paths (never both run for the same game), so no determinism prerequisite needed for this cycle. Reframed as a Phase-3 design constraint when tree placement lifts into `shared/`.

Deferred from Cycle 5 (intentionally — see Deferred section below):
- Trees as obstacles via `SceneObstacles + kdbush` (sheep navigate around individual trunks). Foundation primitive landed; consumer wiring deferred.
- Lift Poisson tree placement into `shared/TreePlacement.js` with seeded RNG (R7 + R10). Today's implementation lives in client `TerrainBuilder.createTrees` and uses `Math.random` — fine for solo, will need lifting before MP island scenes.
- Wood zones with biased tree density (`woodsZones` schema field exists; consumer doesn't read it yet).
- Phase 1.5 boid retune to numbers — schema landed, scenes can override via `scene.flocking`, but actual tuning numbers were not measured. Defer to playtest after this cycle.
- `defaultCamera` localStorage override behaviour — saved user preference always wins; scene default only applies on first visit. Acceptable for v1.

For prior cycle history before this file existed, see:
- [`DECISIONS.md`](../DECISIONS.md) §§ Cycle 1–4 — narrative + decisions
- [`docs/cycle-2-report.md`](cycle-2-report.md) — Cloudflare migration closeout
- [`docs/cycle-2-todo.md`](cycle-2-todo.md) — droplet teardown punch list (closed 2026-04-25)
- [`docs/cycle-3-plan.md`](cycle-3-plan.md), [`docs/cycle-3-cleanup.md`](cycle-3-cleanup.md), [`docs/cycle-3-ui-ux.md`](cycle-3-ui-ux.md) — Cycle 3 plans
- [`docs/cycle-4-plan.md`](cycle-4-plan.md), [`docs/cycle-4-phase-b.md`](cycle-4-phase-b.md), [`docs/cycle-4-hardening.md`](cycle-4-hardening.md) — Cycle 4 plans

## Deferred / not blocking

Items deferred from prior cycles that haven't been picked up. Move to a cycle plan's Phase N when work starts.

- **Resize behavior** — on hold pending user reproduction. Renderer's resize handler in [`SceneManager.onWindowResize`](../js/SceneManager.js) looks correct; need a specific viewport size or device to repro. Carried from Cycle 4 Hardening § 3.
- **Octahedral impostors v2** for tree LOD — current 3-quad billboard impostor is solid (~99% triangle reduction past 250m). Only escalate to octahedral if a playtest specifically calls out the 3-quad version as inadequate. Carried from Cycle 4 Hardening § 4.
- **Tree exclusion in play area verification** — `createTrees` already rejects Poisson candidates inside `playArea` with a 20m buffer; verify visually after any heightmap re-bake or zone change. Carried from Cycle 4 Hardening § 5.
- **GitHub Actions Node.js 20 deprecation** — `actions/checkout@v4`, `actions/setup-node@v4`, `cloudflare/wrangler-action@v3` will be forced to Node 24 by June 2nd, 2026. Non-blocking until then; bump the action versions when convenient.
- **Cycle 3 Track 2 follow-through** (UI/UX polish): scene-first state machine in `App.js`, mode-shaped HUD profile, onboarding overlay, real dog PNG thumbnails, MP-joiner renderer reactivity. See [`cycle-3-ui-ux.md`](cycle-3-ui-ux.md).
- **Cycle 3 Track 1 polish:** JSX flip (mechanical codemod), boid consolidation (needs architectural decision). See [`cycle-3-cleanup.md`](cycle-3-cleanup.md) § Remaining.
- **Trees as obstacles** (Cycle 5 carry-over). `SceneObstacles + kdbush` primitive shipped; wiring `MovementPhysics` to consume it for tree-trunk repulsion is the remaining work. ~2 hr.
- **Shared `TreePlacement.js` with seeded RNG** (Cycle 5 carry-over, R7 + R10). Lift Poisson core out of `TerrainBuilder.createTrees` so client + Worker can share it bit-identically. Required before MP island scenes ship. ~1.5 hr.
- **Wood zones with biased density** (Cycle 5 carry-over). `woodsZones` schema field exists; `createTrees` ignores it. Once `TreePlacement` lifts, add density biasing inside woods clusters. ~1 hr.
- **Boid retune for island scale** (Cycle 5 Phase 1.5). `scene.flocking` override pathway is wired — actual tuning numbers need playtest. Open Country at 500m diameter is 6× Rolling Hills' meadow area.
- **`defaultCamera` override semantics** — currently localStorage always wins. If users want the scene default to apply on scene change, refactor `loadCameraMode` to track per-scene last-mode.

## Distant ideas

Speculative — don't act on these without explicit user direction.

- **New scenes beyond Field / Rolling Hills / Open Country.** Three is the right number until those have differentiated game loops.
- **Mod-friendly scene format** extending the sandbox URL encoding (lz-string) into full scene descriptions (terrain + props + rules), letting a biome ship as a single link.
- **Competitive seasons + tournaments** once the leaderboard has enough history to make them meaningful.
- **Dynamic weather + time of day variation** during a single match (rain, fog banks, dusk transitions). Atmosphere primitives are in place.
- **Predators + rival herders** as NPC behaviour. Sheep personalities.
- **WebGPU migration.** Decided against during Cycle 4 (WebGL2 is fine for the current scope).
