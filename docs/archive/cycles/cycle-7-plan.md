# Cycle 7 — Camera smoothness + sky/water polish + OC outer-ring + OC differentiation

> Drafted 2026-04-25 after Cycle 6 (Trees as obstacles + woods density + portal) closed. **All phases shipped 2026-04-25 + several mid-cycle playtest fixes layered on top — see [Shipped status](#shipped-status-2026-04-25) below.** Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycles: [`cycle-6-plan.md`](cycle-6-plan.md), [`cycle-5-plan.md`](cycle-5-plan.md), [`cycle-4-hardening.md`](cycle-4-hardening.md).

## Shipped status (2026-04-25)

All 4 phases (1, 1.5, 2, 3) shipped. Phase 4 validation pending user confirmation. Tests 111/111 pass; production build clean; sim-baseline byte-identical.

### Phases as planned

- **Phase 1a — `targetVelocity` uses `smoothMaxSpeed`.** [js/Sheepdog.js:619-626](../js/Sheepdog.js). Snap-up preserved; ease-down 0.2s tau gates the diagonal stamina-exhaust whip.
- **Phase 1b — force-based dog obstacle avoidance.** [js/Sheepdog.js:636-667](../js/Sheepdog.js) at strength 4.0, 30m broad-phase. Hard push-out + reflection retained as fallback.
- **Phase 1c — camera `speedNorm` smoothing + `posK` cap.** [js/CameraController.js:325-343,356](../js/CameraController.js). 0.1s tau on speedNorm; posK capped at 0.3 per frame.
- **Phase 1.5 — sky horizontal seam.** Took 4 rounds. The actual culprit was **`CloudLayer.js`'s `horizonFade` smoothstep** at [js/atmosphere/cloudShader.glsl.js:103](../js/atmosphere/cloudShader.glsl.js) — a separate planar cloud system from the dome's integrated cloud math. Widened `(0.02, 0.18) → (0.02, 0.85)`. Also widened the dome shader's `horizonFeather` and softened the bounce term as defense-in-depth, and hardened the SunBillboard halo edge.
- **Phase 2a — `FAR_LOD_DIST` raised 250 → 400m** ([js/TerrainBuilder.js:660](../js/TerrainBuilder.js)). 280 was insufficient because the threshold is distance-from-origin, not distance-from-camera; OC's 380m island still showed billboards in the outer disc. 400 covers the whole island.
- **Phase 2b — per-scene `grass.densityRange`.** [js/GrassSystem.js:88,844](../js/GrassSystem.js) reads it; default 0.6 preserves RH/Field. **OC sets 0.92** (raised from initial 0.75 mid-playtest after grass still didn't reach the shore).
- **Phase 2c — woods-outside bias** — skipped per plan.
- **Phase 2d — water sun-glint specular term.** [js/water/AnimeWater.js:128-141](../js/water/AnimeWater.js) — exponent-8 Blinn term added alongside cel sparkles, scaled by `uSunSpecularIntensity` (default 0.6).
- **Phase 2e — billboard sun in sky.** New [js/effects/SunBillboard.js](../js/effects/SunBillboard.js) — quad at `cameraPosition + sunDir × 3000`, additive blending, halo color from atmosphere sun light. Wired in [js/main.js](../js/main.js).
- **Phase 3 — OC multi-stage objective (gather → drive → portal).**
  - Schema added: `ObjectiveDef` in [shared/scenes/types.js](../shared/scenes/types.js); state in [js/GameState.js](../js/GameState.js) with `setObjective()`.
  - Round-up zone at (0, 50) radius 30m. **Tuned from `120 sheep / 3.0s` → `40 sheep / 2.0s`** mid-playtest (120 was unachievable on first run). [shared/scenes/open-country.js](../shared/scenes/open-country.js).
  - Per-tick zone count + `holdTimer` increment in [GameState.updateSheepBehaviors](../js/GameState.js); transitions stage `roundup → drive` and dispatches `objective-stage-changed` event.
  - Portal "closed" visual: `uIntensity` uniform on ring shader + `speedFactor` on particles + ring rotation. `setIntensity(0..1)` tween-to-full on transition. [js/effects/PortalEffect.js](../js/effects/PortalEffect.js).
  - Round-up zone ground decal: terrain-conformed cyan ring, 96-segment per-vertex Y sample to follow ground contour. Hidden on stage transition. [js/main.js](../js/main.js).
  - `CorralCompass` refactored to accept generic target — points at round-up zone during gather, retargets to portal on transition. [js/components/GameHUD/CorralCompass.js](../js/components/GameHUD/CorralCompass.js).
- **Phase 4 — validation** — tests + build pass. User playtest confirms in progress; lightning retirement, stamina, and sky seam all confirmed fixed.

### Mid-cycle playtest-driven additions

Surfaced during the 2026-04-25 playtest session and fixed in-cycle:

- **Legacy pasture exclusion zone fix.** [js/TerrainBuilder.js:584-600](../js/TerrainBuilder.js) hardcoded a Field-pasture grass-exclusion rect at `(-35..35, 98..138)` for *every* scene, leaving a bare 70×40m patch on RH and on OC's spawn→portal corridor. Now gated on `sceneDef?.farmHouse` and `sceneDef?.pasture` — only Field gets it.
- **OC spawn distribution.** Was a single tight cluster at (0, -150) radius 160m. Replaced with 5 cluster centers across the southern + central island (`-150,-180`, `150,-180`, `-100,-40`, `100,-40`, `0,-120`) per-cluster spread 90m. New `setSheepSpawn()` on GameState; new spawn def code path in `createSheepFlock()`. Gives the player a real "find them" gather phase.
- **Stamina state machine fix.** Original logic gated *both* starting and continuing a sprint on `stamina >= minStaminaToSprint(10)`, so stamina oscillated around 10 (drain when above, regen when below) and never hit 0 — the exhaustion lock was unreachable. Phase 1a smoothing made the bug visible. Now `canStartSprint` (≥10) and `canContinueSprint` (>0) are separate; sprint drains all the way to 0 then locks until release. [js/Sheepdog.js:923-953](../js/Sheepdog.js).
- **Stamina bar visual lag fix.** Both [CompactStaminaBar](../js/components/GameHUD/CompactStaminaBar.js) and [MobileHUD](../js/components/GameHUD/MobileHUD.js) used `transition: all 0.3s` which animated **width** as well as color, lagging the bar 300ms behind the percentage text. Now only `background` and `box-shadow` transition; width is instant.
- **Lightning retirement (RH zap).** Sheep ascend was 22m / soft late-shrink, looked like sideways drift relative to the 60m bolt. Now: **60m ascend matching bolt height, smoothstep ease, scale shrinks continuously across the rise (≈50% at midpoint, near-zero at top), position locked to ascend-start coords** so no residual physics drift. New event `corral-ascend-top` fires a particle-only spark at the bolt's tip via [CorralZapEffectPool.fireSpark()](../js/effects/CorralZapEffect.js). [js/OptimizedSheep.js](../js/OptimizedSheep.js).
- **Round-up decal terrain conformance.** Initial flat-Y `RingGeometry` got clipped by the terrain rise in the middle of the 30m radius zone — only half the ring was visible. Replaced with a 96-segment custom mesh that samples heightfield Y per vertex.
- **Sheep count from scene def in classic mode.** `gameState.startGame` previously hardcoded `totalSheep = 200` for solo classic regardless of scene. Now reads `sceneSpawnDef.count` (RH=250, Field/OC=200) when classic; boost modes (extreme/insane/chaos = 1000/3000/5000) unchanged.
- **Multi-round sky shader fixes** (see Phase 1.5 above). The dome cloud math was widened, then the **CloudLayer planar mesh** was found to be a separate system entirely — its `horizonFade` smoothstep at line 103 was the actual seam.

## Goal

Land the issues that surfaced in the post-Cycle-6 playtest. (1) The Follow camera lurches on Rolling Hills under stamina-exhaustion-while-holding-sprint and again on tree contact — fix both root causes so the camera reads smoothly without sacrificing Cycle 6's tree routing. (1.5) A horizontal seam shows in the sky in Follow mode — soften the cloud-deck horizon-feather. (2) Open Country's outer ring (250–306m from origin) renders as bare terrain with billboard-only trees — restore grass + mesh-tree coverage out to the play boundary, and resolve the ambiguous water shimmer with a coherent sun glint + visible sun disc. (3) Open Country plays mechanically identically to Rolling Hills despite a 4.2× larger island and different visual end-state — give it a multi-stage objective (gather → drive → portal) so the loop is meaningfully distinct, not just "RH with a bigger map and a different retirement effect."

User-visible difference between before and after: sprint→jog transitions on diagonals don't whip the camera; tree contact doesn't punch the camera forward; the upper sky reads as continuous gradient; OC's outer ring reads as continuous grass + woodland; the water glint anchors to a visible sun in the sky; OC requires the player to consciously round up before driving north, instead of just herding a blob in a straight line.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots in, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point — research and measure before committing.

Each phase agent should:

- **Research current best practice** for the specific sub-problem (camera smoothing taus, force-based steering radii, multi-stage objective UX) before writing code.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) using `PerformanceMonitor`. Phase 2 raises mesh tree count on OC — verify the per-tick obstacle-query budget (≤ 0.4ms desktop / ≤ 1.5ms mobile) still holds.
- **Pick the simplest thing that meets the budget.** If smoothing one variable fixes 90% of the lurch, ship that and skip the more invasive sim change. Escalate only on demonstrated need.

## Decisions (locked at draft time + 2026-04-25 review pass)

| # | Question | Decision | Rationale |
|---|---|---|---|
| Q1 | Phase 1 scope — fix lurch in sim, camera, or both? | **Both — all three of 1a/1b/1c** | Stamina easing (1a) is the root cause; force-based dog avoidance (1b) eliminates the contact-reflection class; camera smoothing (1c) is defense-in-depth and helps Classic mode too. |
| Q2 | Phase 3 scope — reposition woodsZones (Lite) or add multi-stage objective (Full)? | **Full — multi-stage objective** | Cheap zone-reposition tests density only; full objective tests loop shape, which the diagnostic identified as the load-bearing differentiator. |
| Q3 | Phase 2 grass-falloff threshold — global or per-scene override? | **Per-scene override.** Add `grass.densityRange` (multiplier, default 0.6) to scene def; OC sets 0.75. | Only OC has the symptom: RH safe radius ~161m and Field has a perimeter fence — both under the existing 252m falloff. Global tune risks RH/Field regression for no benefit. |
| Q4 | Sim-baseline fixture impact of Phase 1b force-based dog avoidance? | **Safe — Phase 1b can land without fixture regeneration.** | Audited [`tests/sim-baseline/__fixtures__/`](../tests/sim-baseline/__fixtures__/) — `sheep-60hz-20s.json` captures sheep only; `dog-rotation-60hz.json` captures rotation only (no kinematics); `stamina-curve-60hz.json` captures stamina only and runs on Field where obstacle list is empty; `reconcile-interp-60hz.json` runs with zero direction input (dog stationary). Phase 1b's force-based avoidance won't activate in any fixture. |
| Q5 | Portal-closed visual feedback during multi-stage roundup? | **Dimmed emissive + slower particle column + slower ring rotation, tween-to-full on transition.** Add `uIntensity` uniform to ring shader (multiplier on existing intensity expression at [`js/effects/PortalEffect.js:69`](../js/effects/PortalEffect.js)) plus a `speedFactor` for particle rise speed and ring rotation. Expose `setIntensity(0..1)` method. | Author lean confirmed correct — shader already has the right shape; one uniform + two factor multipliers. No new effect class. No new audio. |
| Q6 | Round-up zone visualization — dashed cyan decal + retargeted compass? | **Solid cyan `RingGeometry` for the ground decal (reuse existing pattern from [`js/StructureBuilder.js:290-303`](../js/StructureBuilder.js)) + refactor [`js/components/GameHUD/CorralCompass.js`](../js/components/GameHUD/CorralCompass.js) to accept a generic `targetPoint` prop (~20 lines). Dashed styling deferred to post-playtest polish.** | CorralCompass currently reads `gameState.corral` directly and doesn't accept retargeting; the refactor is small and unblocks reuse. No existing dashed-ring primitive in the codebase, and a solid ring is already proven for the corral — defer the dashed variant unless playtest specifically requests it. |
| Q7 | Add water/sun glint enhancement to address post-Cycle-6 playtest "shimmering on the water — maybe that is the sun?" | **Yes — Phase 2d sun-direction specular enhancement + Phase 2e billboard sun in sky.** | Diagnostic confirmed the existing shimmer ([`js/water/AnimeWater.js:128-134`](../js/water/AnimeWater.js)) is a quantized Blinn specular driven by `uSunDirection` already fed from atmosphere. The user is correctly identifying the sun but the glint reads as ambiguous because there's no visible sun disc and no coherent glint path. Both fixes are mobile-safe (one dot product per pixel + one billboard quad) and resolve the ambiguity. Godrays (option d) and sky cubemap reflection (option e) rejected as too expensive on mobile. |
| Q8 | Sky line-break near top of screen in Follow mode (user playtest 2026-04-25). | **Initial diagnosis (dome `horizonFeather`) was wrong.** Real cause was [`CloudLayer.js`](../js/atmosphere/CloudLayer.js) — a separate planar cloud system with its own `horizonFade = smoothstep(0.02, 0.18, abs(viewDir.y))` at [`js/atmosphere/cloudShader.glsl.js:103`](../js/atmosphere/cloudShader.glsl.js). Saturating at 10.4° elevation. Widened to `(0.02, 0.85)` so opacity grows continuously to near-zenith. SunBillboard halo edge also hardened. |
| Q9 (mid-cycle) | OC spawn distribution — single tight cluster vs spread across the play area? | **Spread across 5 clusters** covering southern + central island so the player has a real "find them" gather phase. Added `setSheepSpawn()` + sceneSpawnDef code path. |
| Q10 (mid-cycle) | OC roundup objective tuning — 120 sheep / 3.0s vs simpler? | **40 sheep / 2.0s** after first-run playtest showed 120 was unachievable. Tune up if too easy. |
| Q11 (mid-cycle) | Classic mode sheep count — hardcoded 200 vs scene-def's count? | **Read from scene's `sheepSpawn.count`.** RH says 250, Field/OC say 200. Boost modes (extreme/insane/chaos) still apply uniformly. |
| Q12 (mid-cycle) | Solo lightning retirement visual — vertical 22m float vs trace the bolt? | **Trace the bolt (60m, smoothstep ease, continuous shrink, spark at top).** Position locked at zap moment so no drift. |

## Architecture / shared changes

Two small shared additions:

1. **`grass.densityRange` field on scene def** (Phase 2). Optional; default 0.6 preserves current behavior for RH/Field. Read in `GrassSystem.js` and used as the falloff multiplier instead of the hardcoded 0.6. No breaking change.
2. **Multi-stage corral state** (Phase 3). Add `gameState.objective` with `{ stage: 'roundup' | 'drive', roundupZone?: { x, z, radius }, requiredSheep: number, sheepInZone: number, holdTimer: number, holdRequired: number }`. Field stays optional (single-stage scenes leave it null). HUD reads it; retirement logic gates portal activation on `stage === 'drive'`. RH and Field unaffected — they don't set `objective`.

## Phase 1 — Camera lurch fix (~4hr)

**Independently testable.** Active regression on RH; blocks confident playtest of Phases 2–3.

### 1a. Smooth `currentMaxSpeed` for `targetVelocity` (sim) — ~1hr

The existing `smoothMaxSpeed` easing in [`js/Sheepdog.js:604-609`](../js/Sheepdog.js) gates the *velocity clamp* but `targetVelocity = direction.normalize() * currentMaxSpeed` (line ~618) reads the raw value. On stamina exhaustion mid-diagonal-sprint, `currentMaxSpeed` halves in one frame (sprintSpeed 25 → maxSpeed 15), `targetVelocity` magnitude steps, and the camera's `speedNorm`-derived look-ahead snaps.

1. **Compute `targetVelocity` against `smoothMaxSpeed`** (or apply the same exponential ease to `currentMaxSpeed` as a separate variable feeding both clamp + target). Tau ~0.2s matches the existing safety-clamp tau.
2. **Verify**: drain stamina mid-W+D-sprint on flat RH ground. Velocity-magnitude curve eases over ~200ms instead of stepping. Confirm cardinal sprint→jog still feels responsive (no unresponsive lag).

**Acceptance:** With camera in Follow mode, draining stamina while holding W+D produces no perceptible camera whip. Sprint→jog input latency feels unchanged in cardinal cases.

### 1b. Force-based dog obstacle avoidance (sim) — ~2hr

Sheep query at 30m / strength 6.0 ([`js/OptimizedSheep.js:1364-1373`](../js/OptimizedSheep.js)) and never hit trunks. Dog has 0m hard contact + 0.85 velocity reflection ([`js/Sheepdog.js:638-680`](../js/Sheepdog.js)) — the reflection on diagonal contact whips the camera. Eliminate by giving the dog the same pre-contact steering.

1. **Add force-based avoidance to `Sheepdog.move`** at the same call site as the existing hard push-out. Suggested starting values: query radius 12m (smaller than sheep's 30m — dog is player-controlled, doesn't need long lookahead), strength 4.0 (gentler than sheep's 6.0 — don't fight the player's input too hard). Tune in playtest.
2. **Keep the hard push-out + reflection as fallback** for the case where the player drives the dog directly into a trunk despite the avoidance force. Existing reflection coefficient unchanged.
3. **Resolve Q4 first** — confirm sim-baseline fixtures don't assert dog trajectory.
4. **Verify**: walk dog at trees on RH/OC. The dog now visibly slows + sidesteps before contact instead of bouncing off. Camera stays smooth through tree-adjacent paths.

**Acceptance:** Walking dog into a tree at full sprint produces a visible deceleration + nudge-around, not a hard bounce. Tree contact in Follow mode no longer whips the camera. Sim-baseline tests still pass.

### 1c. Camera `speedNorm` + look-ahead smoothing (camera) — ~1hr

Defense-in-depth; also helps Classic mode if it shares any of these derivations. The Follow path's position lerp `posK = expSmooth(dt, 0.15)` is uncapped, and `speedNorm = min(1, speed / 30)` reads instantaneous speed. Even with 1a + 1b, smoothing these protects against any future sim-side discontinuity.

1. **Exponentially smooth `speedNorm`** with tau ~0.1s before it feeds look-ahead distance.
2. **Cap `posK` per-frame** so the camera can't move more than ~30% of remaining distance to target in one frame (rate limit).
3. **Verify**: triangulation matrix from [`NEXT_SESSION.md:133-141`](../NEXT_SESSION.md) all show "smooth" in both Follow and Classic.

**Acceptance:** Triangulation matrix all-smooth. No new perceptible latency in normal play.

## Phase 1.5 — Sky seam fix (~0.5hr)

**Depends on:** nothing (independent of Phase 1's camera changes; could run first or parallel). Sized as a single sub-task because the diagnosis is already in hand and the fix is one shader-line tweak.

User playtest 2026-04-25: "In the sky when looking out I do see a line break near the top of the screen sometimes when in third person Follow camera." Diagnosed as the cloud-deck horizon-feather smoothstep being too narrow (0.175 angular units) for Follow's ~26.6° upward viewing pitch.

1. **Widen `horizonFeather` smoothstep** in [`js/atmosphere/skyShader.glsl.js:192`](../js/atmosphere/skyShader.glsl.js) from `smoothstep(-0.015, 0.16, direction.y)` to `smoothstep(-0.05, 0.25, direction.y)`. Feathers the cloud-deck edge over a wider angular range (~6–14° vs 1–9°) so the seam dissolves into the gradient at all camera pitches.
2. **Verify in dev:** Open Country in Follow mode, pitch upward, walk dog around. Seam should be gone or significantly diffused. Also verify Classic and Free still look correct (the change affects all modes; expectation is "softer cloud edge" not "broken sky").
3. **Escalation path** if seam persists: clamp Follow's upward pitch limit so the cloud-deck edge falls below screen edge (~30 min). Don't pre-emptively do this — try the smoothstep widen first.
4. **Don't touch** cloud coverage, deck altitude, or the Hosek-Wilkie analytic terms. The diagnosis isolates the seam to the smoothstep range; broader changes risk regressing zenith/horizon balance on all scenes.

**Acceptance:** Sky reads as continuous in Follow mode at all pitch angles. No new visible artifact in Classic or Free. Tests pass; build clean.

## Phase 2 — OC outer-ring rendering + water/sun glint (~5.5hr)

**Depends on:** nothing (independent of Phase 1; could run parallel).

Phase 2 bundles three rendering issues from the post-Cycle-6 playtest: bare outer ring (2a, 2b, 2c), ambiguous water shimmer (2d), and unanchored sun glint (2e). All are visual fidelity work on Open Country (RH and Field unaffected by 2a-c, neutral or slightly improved by 2d-e). Sub-phases are independent; can interleave.

### 2a. Raise `FAR_LOD_DIST` 250→280m (~0.5hr)

Three thresholds interact to produce the 54m bare-billboard ring on OC: grass density-falloff at `worldSize × 0.6 = 252m`, `FAR_LOD_DIST = 250m`, and woods-bias clustering trees inward.

Raise `FAR_LOD_DIST` from 250 → 280m in [`js/TerrainBuilder.js:660`](../js/TerrainBuilder.js). Recovers mesh-tree rendering in OC's outer ring (~50–100 additional mesh trees). Measure desktop frametime + mobile budget — Cycle 6 carry-over acceptance #4 (≤ 0.4ms desktop / ≤ 1.5ms mobile per-tick obstacle query) still applies; this raises the LOD cost not the obstacle cost, but verify total frametime hasn't regressed.

### 2b. Per-scene `grass.densityRange` field (~0.75hr)

Add `grass.densityRange` (default 0.6) to scene def, read in [`js/GrassSystem.js:838`](../js/GrassSystem.js) instead of hardcoded `0.6`. OC sets 0.75 → grass extends to ~315m, covering the safe radius. RH/Field omit the field; behavior unchanged.

### 2c. (Optional) Soften woods-outside bias 1.4→1.2 (~0.75hr)

After playtest of 2a + 2b: if the outer ring still reads thin, soften `WOODS_OUTSIDE_FACTOR` from 1.4 → 1.2 in [`shared/TreePlacement.js`](../shared/TreePlacement.js). Skip if 2a + 2b read correctly. **Note:** this change affects tree placement determinism — check sim-baseline fixtures before committing. Author lean: skip unless playtest demands; FAR_LOD_DIST raise should be sufficient.

### 2d. Water sun-direction specular enhancement (~1.5hr)

User playtest 2026-04-25: "Shimmering on the water — maybe that is the sun? Maybe we can get a better reflection and rays."

The existing shimmer in [`js/water/AnimeWater.js:128-134`](../js/water/AnimeWater.js) is a quantized Blinn specular driven by `uSunDirection` (already fed every frame from `atmosphere.getSunDirection()` in [`js/main.js:1874`](../js/main.js)). It reads as ambiguous because the glint is hard-edged and not aimed at a coherent sun direction in screen space.

1. **Add a sun-direction-dependent specular term** alongside the existing Blinn sparkle. Suggested shape (tune in playtest):
   ```glsl
   float sunDot = max(0.0, dot(viewDir, -uSunDirection));
   float sunGlint = pow(sunDot, 3.0) * uSunSpecularIntensity;
   color += vec3(sunGlint) * sunColor;
   ```
2. **Add `uSunSpecularIntensity` uniform** (line ~62-63), default ~0.6 (tune in playtest). Pass `sunColor` from atmosphere if available; otherwise warm-white default.
3. **Verify on all three scenes.** RH and Field also have water; the change must read correctly there too. No mobile cost concern (one extra dot + pow per pixel).

**Files touched:** [`js/water/AnimeWater.js`](../js/water/AnimeWater.js), [`js/main.js`](../js/main.js) (uniform default).

### 2e. Billboard sun in the sky (~2hr)

Resolves the user's "maybe that is the sun?" uncertainty by making the glint source visible. With the sun disc rendered in the sky, the 2d glint becomes legible as a sun reflection rather than ambient shimmer.

1. **Add a sun mesh/billboard** at the position derived from `atmosphere.getSunDirection()`. Sphere or billboarded quad — pick whichever costs less. Place at a distance large enough to clear the play area but inside far-clip. Color: warm-white core + soft halo.
2. **Match atmosphere lighting model.** The sun direction is already used by Hosek-Wilkie sky, water, and per-frame lighting; the billboard must align so the visible disc is *exactly* where the lighting model says the sun is. Otherwise the glint and the disc mismatch and the bug gets worse.
3. **Verify on all three scenes** — sky is shared.
4. **Mobile cost:** +1 mesh draw call, low triangle count. Acceptable.

**Files touched:** new [`js/effects/SunBillboard.js`](../js/effects/SunBillboard.js) (~80–150 lines), [`js/main.js`](../js/main.js) (scene wiring).

**Acceptance for Phase 2 as a whole:** Walking from spawn (0, -150) toward portal (0, 295) on OC produces no perceptual cliff in tree/grass rendering. Walking to the shore and looking inward, grass still reads at the boundary. Sun is visibly anchored in the sky and the water glint points to the sun's screen position. Frametime unchanged or within noise on RTX 3070 desktop and mobile target. Sim-baseline tests still pass.

## Phase 3 — OC multi-stage objective (~6hr)

**Depends on:** Phase 2 only loosely (Phase 3 is design work; visual baseline cleaner if Phase 2 lands first).

Cycle 6's portal made OC visually distinct but mechanically identical to RH: herd flock to a trigger zone, retire. Diagnostic confirmed: woodsZones B and A are pure scenery (>150m off the spawn→portal corridor); Zone C clips the corridor edge but doesn't force traversal. Differentiation must come from loop *shape*, not density tuning.

Add a round-up stage between spawn and portal: the player must hold N sheep within a "round-up zone" for M seconds before the portal will accept retirement.

1. **Add `gameState.objective` schema** (see Architecture section). Initialize from scene def. RH/Field leave it null.
2. **Round-up zone definition on OC scene def.** Suggested location: `(0, 50)` — on the spawn→portal corridor, between the spawn area at z=-150 and the dense-woods Zone C at z=170, so the player must gather *before* the woods. Suggested radius: 30m. Suggested `requiredSheep: 120` (60% of OC's 200), `holdRequired: 3.0` seconds. **Tune in playtest** — these are starting points, not commitments.
3. **Update OC `objective` per-tick in sim**: count sheep within `roundupZone` radius, increment `holdTimer` when count ≥ `requiredSheep`, transition `stage: 'roundup' → 'drive'` when `holdTimer ≥ holdRequired`. While `stage === 'roundup'`, portal trigger is gated off (sheep can enter portal radius but won't retire).
4. **Visual: round-up zone ground decal.** Dashed cyan circle at `(0, 50)`, radius 30m. Renders during `stage === 'roundup'`, fades out on transition.
5. **Visual: portal "closed" state during roundup.** Lower emissive intensity / slower particle column on `PortalEffect` while `stage === 'roundup'`. On transition, pulse to full activation. Reuse existing `PortalEffect.js` parameters; add an `intensity` uniform if needed.
6. **HUD: re-target `CorralCompass`** to `roundupZone.center` while `stage === 'roundup'`, then to portal on transition. Existing component is generic over a target point per [`NEXT_SESSION.md:36-37`](../NEXT_SESSION.md), so this is a state read, not a new component.
7. **Resolve Q5 + Q6 before code.** Decide round-up zone visualization shape and portal-closed feedback.
8. **Verify in playtest:** the player consciously gathers sheep at the round-up zone, then drives north as a coherent group. The verb is "gather → drive," not "herd a blob." OC feels distinct from RH.

**Acceptance:** Multi-stage works on OC. RH and Field unaffected (no `objective` field set). Round-up zone is visible and the compass guides to it. Portal visibly transitions from closed to open. Sim-baseline tests still pass (OC isn't in baseline; RH/Field unaffected).

## Phase 4 — Validation + Cycle 6 carry-over playtest (~1hr)

**Depends on:** Phases 1, 2, 3 all landed.

Walk the six Cycle 6 carry-over items from [`NEXT_SESSION.md:42-51`](../NEXT_SESSION.md) on the post-Cycle-7 build. Items 4 (perf budget) and 5 (OC `perception: 9`) interact with Phase 2's mesh-tree count change — verify on Open Country specifically. Items 1, 2, 3, 6 are visual/behavioral.

Run `/validate` and confirm 111+/111+ vitest specs, clean production build.

**Acceptance:** All 6 Cycle 6 carry-over items confirmed (or explicitly punted with rationale). `/validate` PASS. Sim-baseline byte-identical (or justified diff documented).

## Dependencies

```
Phase 1 → Phase 1.5 → Phase 2 + Phase 3 (parallel) → Phase 4
```

Phase 1 lands first because the camera lurch is the active regression and confidence in playtest of Phases 2–3 depends on it. Phase 1.5 (sky seam) is technically independent but slots after Phase 1 so the camera-mode triangulation matrix gets verified against the *fixed* sky — and so the same playtest pass covers both. Phase 2 (rendering) and Phase 3 (game loop) touch disjoint files and can interleave or run parallel. Phase 4 is the validation gate.

Within Phase 1: 1a → 1b → 1c (each builds on the prior; if 1a alone fixes the stamina case in Follow, 1b+1c may need less aggressive tuning).

Within Phase 2: 2a + 2b first; 2c gated on 2a/2b playtest; 2d + 2e independent of 2a-c (water/sky work). 2e (billboard sun) should land after 2d (water glint) so the playtest pass sees both together — the visible sun anchors the glint perceptually.

**Cycle hour budget:** 4 (P1) + 0.5 (P1.5) + 5.5 (P2) + 6 (P3) + 1 (P4) = **~17h**. Phase 3 is the highest-uncertainty estimate (multi-stage objective UX likely needs +2-4h tuning past the build); plan for ~19-21h realistic.

## Frozen files (cycle-specific additions)

The durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) applies. Cycle-7-specific additions:

- **`shared/MovementPhysics.js` `updateMovement`** — Cycle 6 deliberately moved obstacle composition out; Phase 1b adds dog avoidance at the call site, not here. (This is already implied by Cycle 6's frozen list; restating for emphasis.)

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure that you don't understand — don't regenerate fixtures, escalate. Phase 1b and Phase 2.3 specifically risk this if they affect sheep/tree placement determinism.
3. Visual regression on RH or Field. Phase 2 changes are gated on per-scene fields; if RH or Field grass coverage changes, you've wired something globally. Revert.
4. Phase 3 multi-stage logic activating on RH or Field. `gameState.objective` must be null on those scenes.
5. Camera changes that introduce input-to-camera latency. If 1c's smoothing makes Follow feel laggy in normal play, dial back the tau.

## What NOT to do during this cycle

- **Don't touch sheep count or island radius on OC.** Density is part of the open-country identity. Phase 3 reshapes the loop, not the scale.
- **Don't add a fourth scene.** Three is the right number (per Cycle 6 hard stop).
- **Don't refactor `Sheepdog.move()` end-to-end.** Phase 1 adds two narrowly-scoped changes (smoothing + force-based avoidance); leave the rest of the method shape intact.
- **Don't add new audio assets.** Phase 3's portal-closed state is visual only.
- **Don't generalize the multi-stage objective system beyond OC.** RH and Field don't need it; the schema is opt-in via scene def.
- **Don't escalate Phase 2.3 (woods-bias tuning) without playtest justification.** It's a risk to sim-baseline determinism — only pull this lever if 2.1 + 2.2 demonstrably aren't enough.
- **Don't reintroduce procedural mountains** (per durable hard stop).
- **Don't blow up `main.js`** (per durable hard stop) — Phase 3's objective state lives in `gameState`, not new top-level wiring.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Updated 2026-04-25 with shipped status.

- [x] All phases shipped (Phase 1 / 1.5 / 2 / 3) plus mid-cycle additions; Phase 4 validation in progress.
- [x] All vitest specs pass (111/111).
- [x] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions — not yet committed/pushed.
- [x] Sky seam in Follow mode is gone (Phase 1.5 round 4) — user-confirmed in playtest.
- [x] OC outer ring no longer reads as bare-terrain-with-billboards (FAR_LOD_DIST 250→400, densityRange 0.6→0.92) — user-confirmed.
- [x] Water glint reads as a coherent sun reflection (Phase 2d) and the sun is visibly anchored in the sky (Phase 2e).
- [ ] OC plays measurably differently from RH per playtest — user confirmation of gather→drive verb still pending after the 40/2.0 retune.
- [ ] Camera triangulation matrix all-smooth on RH Follow — Phase 1a/1b/1c shipped; user playtest of stamina + tree contact pending.
- [ ] All six Cycle 6 carry-over playtest items confirmed (or explicitly punted with rationale).
- [x] Sim-baseline byte-identical — Q4 audit confirmed Phase 1b doesn't activate in any fixture.
- [ ] No frametime regression on RTX 3070 desktop or mobile target after Phase 2 — user playtest pending; FAR_LOD_DIST 400 raises OC mesh tree count substantially.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/cycle-6-plan.md`](cycle-6-plan.md) — prior cycle (trees + portal); load-bearing context for Phase 1b's call-site obstacle composition
- [`docs/cycle-5-plan.md`](cycle-5-plan.md) — original OC intent ("drive sheep through forest to coastal pen") that Cycle 7 Phase 3 finally delivers
- [`../NEXT_SESSION.md`](../NEXT_SESSION.md) — Cycle 7 candidate-themes section §§ 1–3 with diagnostic detail
