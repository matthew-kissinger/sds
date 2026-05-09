# SDS Backlog

> Append-only log of closed cycles and deferred work. Most recent at the top. The `/cycle-close` slash command writes the "Recently Completed" section automatically; "Deferred" and "Distant ideas" are edited by hand as items surface.

## Recently Completed

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
- Mid-cycle alignment audit produced [`AGENTS.md`](../AGENTS.md), [`CLAUDE.md`](../CLAUDE.md), [`docs/cycle-28-plan.md`](cycle-28-plan.md), `.claude/settings.json` Stop hook, and `.gitignore` inversion as the foundation for Cycle 28's autonomous overnight run.

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
- **Modern techniques surveyed:** vertex-shader leaf cull (Procedural Instanced Forest, MIT, 2 draw calls for 2,800 trees), fluffy-trees view-space puffing (douges.dev), billboard cloud impostor (industry standard since 2010). Author lean for Cycle 16: A+B+E (lower per-leaf cost + proper `addLOD` + billboard impostor at distance) — the textbook game-dev answer.

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

- **`docs/CYCLE_TEMPLATE.md` cycle-close-reconcile collision.** The template ships a "## Acceptance criteria — EARS format" section as an explainer block; the reconcile hook's regex `^##+\s+(?:Success|Acceptance) criteria` matches that explainer first instead of the actual "## Success criteria (cycle close)" checklist. Cycle 29 close fixed this locally by renaming its explainer to "## EARS notation conventions". Roll the same rename into the template so future cycles don't hit it. Trivial — one Edit + a one-line note in CYCLE_TEMPLATE.md's commit message.
- **Cross-module polygon-spawn dedup.** Cycle 29 B2 extracted `pointToSegmentDistance` + `isPointInPolygon` to [`js/gamestate/polygonSpawn.js`](../js/gamestate/polygonSpawn.js) but only updated GameState's callers. Three other files keep their own copies: [`js/OptimizedSheep.js`](../js/OptimizedSheep.js), [`js/SandboxConfig.js`](../js/SandboxConfig.js), [`js/StructureBuilder.js`](../js/StructureBuilder.js). Out of scope for Cycle 29 (the cycle's goal was GameState decomp, not cross-module dedup). Pick up in a future "duplication-cleanup" pass alongside any other ripple-of-helpers.
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

- **New scenes beyond Field / Rolling Hills / Open Country.** Three is the right number until those have differentiated game loops.
- **Mod-friendly scene format** extending the sandbox URL encoding (lz-string) into full scene descriptions (terrain + props + rules), letting a biome ship as a single link.
- **Competitive seasons + tournaments** once the leaderboard has enough history to make them meaningful.
- **Dynamic weather + time of day variation** during a single match (rain, fog banks, dusk transitions). Atmosphere primitives are in place.
- **Predators + rival herders** as NPC behaviour. Sheep personalities.
- **WebGPU migration.** Decided against during Cycle 4 (WebGL2 is fine for the current scope).
