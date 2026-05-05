# Cycle 23 — overhead-polish-grass-LOD-and-mp-cap-fix

> Drafted 2026-05-05 after Cycle 22 closed as `v1.3.0` (stylized LOD pivot + grass auto-LOD + atmospheric desat). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md), then this plan top-to-bottom, then skim [`cycle-22-plan.md`](cycle-22-plan.md) for the LOD/desat context. Prior cycles: [`archive/cycles/`](archive/cycles/).

## Goal

Close the visual-polish gap surfaced in v1.3.0 playtest: distant trees from a high-pitch (Classic) camera read as washed-out fog-smear instead of zen silhouettes; stamina-sprint exit doesn't fire when stamina depletes; Open Country's camera-mode indicator overlaps the sheep-in-circle objective HUD. Earn perf headroom by extending grass LOD with a far-ring meadow-quad tier and hardware-aware tiering (low/med/high) so future scaling has room. Land cheap multiplayer cap + asset fixes uncovered in the v1.3.0 MP audit (full MP test-suite cycle deferred). Ship as `v1.4.0`.

User-visible difference: overhead Classic-camera Home Field reads as zen instead of grey; sprint stops when stamina runs out; OC HUD doesn't overlap; FPS holds or improves at OC-Extreme thanks to T4 meadow-quad LOD; MP guests can use Insane/Chaos modes (or have them deliberately disabled with a clear UX, not a silent cap).

## Why this cycle exists

Cycle 22 shipped the stylized LOD pivot end-to-end and hit the `v1.3.0` target. v1.3.0 playtest by Matt on 2026-05-05 surfaced six items that need their own bundled cycle:

1. **Classic-camera overhead trees feel ungainly.** From a high-pitch camera, every tree is "distant" so the atmospheric desat (start 100m, strength 0.6) hits all of them, not just the back ring. Compounds with the Cycle 19.5 carryover #2(b) — impostor pitch-tilt was specified but never landed. From Follow cam (low pitch) the same scene looks fine, confirming this is angle-coupled.
2. **Fog/desat together are doing too much at high pitch.** Initial fog color is `0xcccccc` (neutral grey); horizon-LUT updates per-frame but readers see the grey on transitions. Scene-level `fog: { color, near, far }` defs in `shared/scenes/*.js` are dead code — never consumed.
3. **Stamina-sprint exit broken.** Settled decision separates `canStartSprint` from `canContinueSprint` (Cycle 7), but the exit transition when stamina depletes mid-sprint isn't firing — sprint continues until input stops.
4. **OC HUD overlap.** Camera mode indicator (top-center per Cycle 17 fix) and the sheep-in-circle objective HUD collide on Open Country at both desktop and mobile breakpoints.
5. **Per-system triangle counter unwired for trees.** Stats panel reads `Trees: 0` at OC-Extreme overhead capture despite trees clearly rendering. Either folded into "Structures: 20,066" or just not summed.
6. **Cycle-22 MP carryovers.** v1.3.0 MP audit (deep-dive 2026-05-05) found: `RoomDO.ALLOWED_SHEEP_COUNTS = [200, 250, 500, 1000]` so Insane/Chaos solo modes are silently unavailable in MP; Cycle 22 pine removal may produce 404s for guests on stale-cache assets; cinematic-flag invite URLs would leak `preserveDrawingBuffer=true` to guests; zero MP test coverage. Full audit + test-suite cycle deferred to **Cycle 24**, but the cheap fixes land here.

Plus: grass dominates 94% of the triangle budget (~3.8M of ~4.3M tris on Field-Classic per stats panel; ~20M on OC-Extreme per estimate). Cycle 22 grass auto-LOD only scales `clumpsPerChunk`; it doesn't change blade count, render distance, or material complexity. The grass-rendering research synthesis (2026-05-05) identified **T4 meadow-quad LOD tier** beyond ~260m as the highest-ROI single change (~50–60% triangle reduction with no near-field regression) and **hardware-aware tiering** (`MAX_VERTEX_UNIFORM_VECTORS` + vendor string → low/med/high) as the second lever.

## How to read this plan

Each phase has **Build** + **Validation** + **Autonomous run markers** (exact commands, machine-checkable pass condition, hard-stop trigger, draft commit message). Phase A is the visual-polish core; B and C are surgical fixes; D is the perf headroom; E is the MP cheap-wins skim; F is ship. Iteration artifacts save under `cycle23-validation/<phase>/` per the standing "branch-back" pattern. Matt reviews end-to-end at Phase F.

## Open questions — RESOLVED 2026-05-05

1. **Q1: Pitch-aware desat — RESOLVED smoothstep falloff.** `uDesatStrength.value = configuredStrength * mix(1.0, 0.2, smoothstep(25, 50, abs(pitchDeg)))`. `getPitchDeg()` exposed on CameraController; uniform updated each frame in `TerrainBuilder._desat`.
2. **Q2: Scene fog — RESOLVED full replace.** Field/RH/OC each get explicit `fog: { color, near, far }` defs. Atmosphere reads `sceneDef.fog` at scene init via `THREE.Fog` (linear); FogExp2 fallback when scene omits.
3. **Q3: HardwareTier — RESOLVED.** `MAX_VERTEX_UNIFORM_VECTORS < 256` OR vendor regex `/Adreno [3-5]\d\d|Mali-[GT]\d\d|PowerVR/i` → Low. Discrete desktop (NVIDIA/AMD/Intel Arc/Intel UHD/Iris) → High. Otherwise Med. Set once at SceneManager init.
4. **Q4: T4 meadow-quad — RESOLVED pre-baked per scene.** New `tools/bake-meadow-quad.mjs` writes `assets/scenes/<scene>/meadow-quad.webp` (256×256). Runtime samples in T4 chunk path.
5. **Q5: MP sheep cap — RESOLVED extend + UI gate.** `ALLOWED_SHEEP_COUNTS = [200, 250, 500, 1000, 3000, 5000]`. Lobby UI shows "All guests must be on desktop" when host picks Insane/Chaos. RoomDO rejects mobile-UA WS upgrades when `room.sheepCount > 1000`.
6. **Q6: Classic camera — RESOLVED keep but demote + add occlusion-fade trick.** Default cam ships as Follow (the angle that already looks good). Classic stays selectable as third option. New camera-to-dog tree-occlusion fade (capsule cast → per-tree alphaHash density boost) restores line-of-sight when leaves block the dog. Phase A splits into A1 (atmospheric polish, plan-as-written) and A2 (default-cam swap + occlusion fade) for clean iteration tagging.

## Phase A2 — default-cam swap + camera-to-dog occlusion fade (~4–6hr)

**Independent of A1 mechanically; runs after A1 so Phase D doesn't trample tree material plumbing twice.**

### Build

1. **Default camera = Follow.** Wherever the initial CameraMode is set (likely `js/CameraController.js` constructor or a new-game init in `js/main.js`), default to `Follow`. Classic remains in the cycle order (Follow → Cinematic → Classic) so it's the third tap on the camera-cycle button. Persist the player's chosen mode across sessions only if it was already persisted; don't introduce new persistence.
2. **Camera-to-dog capsule cast.** Each frame, build a thin capsule (radius ~1.5m) from `camera.position` to `dog.position`. Walk all `treesGroup` instances; for each tree whose AABB-or-trunk-Y intersects the capsule, set per-instance `occluderFade` = 1.0 with smoothstep recovery toward 0 over ~0.25s when no longer intersecting.
3. **Tree alphaHash bias from occluder fade.** EZ-Tree leaf MeshStandardMaterial (already alphaHash=true from Cycle 22 Phase B) gets an `onBeforeCompile` hook adding `uOccluderFadeStrength` uniform AND a per-instance attribute (or instanceTexture) read. When `occluderFade > 0`, the alphaHash threshold lifts toward `1.0 - occluderFade * 0.85` so the leaf material renders only ~15% of pixels at peak fade — restoring line-of-sight without removing silhouette.
4. **Performance budget.** Capsule cast must be O(treesNearCamera). Use the existing tree spatial-hash (or grid query) so we cast only against trees within ~30m of the camera-dog line. Pre-allocate buffers, no per-frame allocation in hot path.

### Validation

Save to `cycle23-validation/phaseA2/`:
- `default-cam.txt` — confirm new game starts in Follow.
- `occlusion-fade-trace.txt` — frame-by-frame `{ frame, treesIntersected, peakFade }` over a 5sec walk through dense forest.
- 4 screenshots: Field-Follow with dog visible through dense tree cluster; same shot with occlusion-fade disabled; same on RH; same on OC.
- Acceptance: dog silhouette visible-through-leaves at all 4 captures; FPS does not drop more than 3% vs A1 baseline.

### Autonomous run markers

- Run: `npm test && npm run build && npm run perf:check`
- Pass: vitest 179+/179+, build delta < +5KB, perf:check `field-extreme` within ±5% of v1.3.0 baseline.
- HARD STOP: per-frame allocation in capsule cast (heap snapshot delta > 1MB / 1000 frames) — re-architect before commit.
- Commit: `feat(cycle-23-A2): default Follow cam + camera-to-dog occlusion fade`



## Architecture / shared changes

- **Camera pitch as a uniform.** New `_cameraPitchDeg` getter on [`js/CameraController.js`](../js/CameraController.js); fed each frame into `AtmosphericDesatPatch`'s shared `uDesatStrength` uniform via existing scene-init wiring in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) `_desat`.
- **Scene fog schema lives.** [`shared/scenes/types.js`](../shared/scenes/types.js) `FogDef` typedef stays; [`js/Atmosphere.js`](../js/Atmosphere.js) (line ~93) reads scene's `fog` object instead of hardcoded init. Default fallback for scenes without `fog`: warm-tinted derived from sky horizon at sun=0.4 (keeps Field looking right).
- **HardwareTier service.** New `js/HardwareTier.js` exports `getTier(): 'low'|'med'|'high'`. Called once in `SceneManager.init`; passed via constructor to GrassSystem, eventually TerrainBuilder. No per-frame cost.
- **Grass tier presets.** [`js/GrassSystem.js`](../js/GrassSystem.js) constructor accepts `{ tier }` and sets `clumpsPerChunk`/`bladesPerClump`/`grassFadeEnd` per-tier (existing `isMobile` path becomes a sub-case of Low).
- **T4 meadow-quad rendering path.** New per-chunk render branch in GrassSystem: chunks where `(chunk.center - cameraXZ).length() > 260m` skip clump instancing entirely and instead instance a single 40m × 40m textured quad per chunk into a separate `THREE.Mesh` (or InstancedMesh of N quads). Material samples `assets/scenes/<scene>/meadow-quad.webp` with the same fog + desat patches.

## Phase A — overhead atmospheric polish (~6hr)

**Independently testable.** Closes the playtest's most visible defect; everything else builds on a healthier baseline.

### Build

1. **Pitch-aware desat strength.** [`js/CameraController.js`](../js/CameraController.js): expose `getPitchDeg()` reading current camera euler.x mapped to degrees. [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) `_desat`: each frame, set `uDesatStrength.value = configuredStrength * smoothstep_inverse(50, 25, abs(pitchDeg))` so high-pitch desat falls toward 0.2× of base.
2. **Prime fog color from sky on first frame.** [`js/Atmosphere.js`](../js/Atmosphere.js) constructor: after sky is created, immediately call the same `applyFogColor()` path that runs per-frame instead of leaving `0xcccccc` initial. Eliminates startup flicker on quick scene loads.
3. **Wire scene-level fog defs.** [`shared/scenes/field.js`](../shared/scenes/field.js) already has `fog: { color: '#cfd9e8', near: 220, far: 700 }` — wire it. Add equivalent defs to [`shared/scenes/rolling-hills.js`](../shared/scenes/rolling-hills.js) (warmer dusk-tinted, e.g. `#d4c4a8` at sunset preset) and [`shared/scenes/open-country.js`](../shared/scenes/open-country.js) (cooler open horizon, e.g. `#b8c8d8`). [`js/Atmosphere.js`](../js/Atmosphere.js): if `sceneDef.fog` present, use `THREE.Fog(color, near, far)` (linear) instead of FogExp2. Keep FogExp2 fallback if scene omits.
4. **Land impostor pitch-tilt** (Cycle 19.5 carryover #2(b)). [`js/kiln-impostor-material.js`](../js/kiln-impostor-material.js) vertex shader: when `dirObj.y` (camera elevation in object space) > 0.2, smoothstep-blend `billUp` from world-Y toward `cross(viewDir, billRight)` so quad tilts toward camera. Pixel Forge atlas already has square hemi-y tiles (verified Cycle 20 Phase 0); ratio mismatch from Cycle 19.5 attempt no longer applies.

### Validation

Save 12 screenshots to `cycle23-validation/phaseA/`: 3 scenes × 2 cameras (Follow + Classic-overhead) × 2 times-of-day (noon + dusk). Compare against `cycle22-validation/` golden frames at same cam/scene/ToD. **Acceptance:** at Classic-overhead, distant tree mean RGB saturation must be ≥ 0.4 (vs current ≤ 0.15 grey-fog smear). Follow-cam frames must be byte-near-identical (no regression on the camera that already looked good).

### Autonomous run markers

- Run: `npm test && npm run build && npm run perf:check`
- Pass: vitest 179+/179+, build delta < +5KB, perf:check `field-extreme` within ±5% of v1.3.0 baseline.
- HARD STOP: any Follow-cam scene visibly degraded vs v1.3.0 — abort, surface diff to user.
- Commit: `feat(cycle-23-A): pitch-aware desat + scene-level fog + impostor pitch-tilt`

## Phase B — stamina sprint-exit fix (~2hr)

**Independent of Phase A.** Can run in parallel.

### Build

1. **Trace the broken transition.** [`js/Player.js`](../js/Player.js) (or wherever sprint logic lives — search for `isSprinting`, `stamina`, `canContinueSprint`). The Cycle 7 settled decision says `canStartSprint` and `canContinueSprint` are separate gates. Find where input is read each frame; verify `canContinueSprint` is checked, not just `canStartSprint`.
2. **Fix the gate.** When `stamina <= 0` mid-sprint, sprint should exit even if Shift is still held. Likely fix: in the per-frame sprint update, `if (isSprinting && !canContinueSprint(stamina)) { isSprinting = false; }` before applying speed multiplier.
3. **Test.** New vitest spec at `tests/stamina-sprint-exit.spec.js`: simulate sprint → stamina drains to 0 → assert sprint state flips false even with held input. Cover the boundary at `stamina === minStaminaToStartSprint - 1` to confirm we're not accidentally re-merging the two gates.

### Validation

Manual playtest: hold Shift on flat ground, watch stamina bar deplete to 0, verify dog drops to walk speed without releasing Shift. Save `cycle23-validation/phaseB/sprint-exit-trace.txt` capturing frame-by-frame `{ frame, stamina, isSprinting, canContinue }` over the deplete transition.

### Autonomous run markers

- Run: `npm test`
- Pass: new spec green, all existing 179 specs still green, sim-baseline byte-identical (sprint exit doesn't affect the boid-sim trace).
- HARD STOP: sim-baseline byte drift — abort, surface to user.
- Commit: `fix(cycle-23-B): stamina-sprint exits when stamina depletes mid-sprint`

## Phase C — OC HUD overlap fix (~1–2hr)

**Independent.** Can run in parallel with A or B.

### Build

1. **Identify the colliding components.** Likely [`js/components/CameraModeIndicator.tsx`](../js/components/CameraModeIndicator.tsx) (or `.jsx`) and [`js/components/ObjectiveHUD.tsx`](../js/components/ObjectiveHUD.tsx) (sheep-in-circle). Both top-center per Cycle 17 portrait-mobile fix.
2. **Resolve the collision.** Move camera mode indicator to top-left or below the objective HUD when `sceneId === 'open-country'`. Or: add a vertical-stack layout container at top-center so they don't overlap. Match Cycle 17 portrait-mobile pattern.

### Validation

Save 4 screenshots to `cycle23-validation/phaseC/`: OC desktop + OC mobile (320×568 viewport via Playwright), each with and without sheep-in-circle visible. Confirm no overlap at any breakpoint. Test all 3 scenes to ensure Field/RH HUD layouts haven't regressed.

### Autonomous run markers

- Run: `npm test && npm run build && npm run test:e2e -- hud`
- Pass: existing e2e specs green, no overlap in OC screenshots (visual diff threshold or manual confirm).
- Commit: `fix(cycle-23-C): OC camera-mode + objective HUD vertical stack`

## Phase D — grass T4 meadow-quad LOD + hardware tiering (~1–1.5 days)

**Depends on:** Phase A (so the desat fix doesn't get reverted by D's chunk path).

### Build

#### D1 — Hardware tier service

1. New [`js/HardwareTier.js`](../js/HardwareTier.js): exports `detectTier(renderer): 'low'|'med'|'high'`. Reads `gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)`, `gl.getParameter(gl.RENDERER)`, `isMobile`. Q3 heuristics applied.
2. Wire into [`js/SceneManager.js`](../js/SceneManager.js) `init`: call once, store on `this.tier`. Pass to GrassSystem constructor.
3. Update [`js/GrassSystem.js`](../js/GrassSystem.js) constructor: replace `isMobile`-binary with `tier` switch. Low ≈ current mobile values; Med = current desktop with reduced wind octaves; High = current desktop full.

#### D2 — T4 meadow-quad tier

1. New [`tools/bake-meadow-quad.mjs`](../tools/bake-meadow-quad.mjs): renders a top-down 256×256 RGBA texture per scene capturing the LOD0 grass appearance (mean color + procedural noise). Outputs `assets/scenes/<scene>/meadow-quad.webp`.
2. `npm run bake-meadow-quads` script.
3. [`js/GrassSystem.js`](../js/GrassSystem.js): in `_buildChunk`, if chunk distance from camera-spawn > 260m AND `tier !== 'low'`, render a single 40m square `PlaneGeometry` mesh with the meadow-quad texture instead of the InstancedMesh chunk. Material participates in the shared desat + fog patches so it tracks scene atmosphere.
4. Stochastic dither at the T3→T4 boundary (255–265m) to hide pop. Reuse the alphaHash pattern from Cycle 22 Phase B.

#### D3 — Auto-LOD extends to blade count

1. Existing `_autoLodFactor` (0.5..1.0) gets a second output: `bladeFactor = lerp(0.5, 1.0, smoothstep(0.5, 0.8, _autoLodFactor))`. When auto-LOD is at floor (0.5), blades drop from 7→4 on Med, 5→3 on Low. Applied at chunk-rebuild only (existing pattern).

### Validation

Save to `cycle23-validation/phaseD/`:
- `tier-detection.json` — capture detected tier on RTX 3070 (expect High), iPad Air 2 (expect Low if accessible), generic desktop Chrome headless (expect Med).
- `meadow-quad-bakes/` — screenshot the 3 baked textures + an in-scene capture of T4 chunks vs T1 chunks at boundary.
- `perf-delta.json` — re-run `npm run perf:check` baseline. Acceptance: OC-Extreme tri count drops ≥ 40% vs v1.3.0 baseline; Field-Extreme stays within ±10%.

### Autonomous run markers

- Run: `npm run bake-meadow-quads && npm test && npm run build && npm run perf:check`
- Pass: 3 meadow-quad WebPs exist (each < 50KB), vitest 179+/179+, build delta < +20KB, perf:check `field-extreme` within ±5%, OC-Extreme tri count < 12M.
- HARD STOP: visible band/seam at T3↔T4 transition ring (sample mid-fade frames; if RGB delta > 30% across 5px-wide band, dial up dither width). Surface to user.
- Commit: `feat(cycle-23-D): grass T4 meadow-quad + hardware-tier presets + auto-LOD blade scaling`

## Phase E — MP cheap wins (~3–4hr)

**Depends on:** none. Runs anytime.

Full MP test-suite + scene-swap-fix + reconnect grace deferred to **Cycle 24** (`mp-audit-and-test-coverage`). Cycle 23 lands only the cheap, low-risk fixes from the MP audit.

### Build

1. **Sheep cap extension.** [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts) line ~42: extend `ALLOWED_SHEEP_COUNTS` to `[200, 250, 500, 1000, 3000, 5000]`. Add comment referencing per-Q5 decision.
2. **Lobby UI gate.** [`js/components/MultiplayerOptions.tsx`](../js/components/MultiplayerOptions.tsx): when host selects Insane/Chaos count, show "All guests must be on desktop. Mobile guests will be rejected." Backend: RoomDO rejects mobile-UA WS upgrades when `room.sheepCount > 1000`.
3. **Cinematic-flag URL strip on join.** [`js/MultiplayerState.js`](../js/MultiplayerState.js) `joinRoomByInvite()`: parse incoming URL; if `?cinematic=1` present, strip before passing to scene init. Prevents `preserveDrawingBuffer` leak.
4. **Pine 404 sweep.** Grep `worker/`, `js/`, `shared/` for any remaining `pine` references. Verify they're all in archived plan docs or `cycle22-validation/phaseA/removed-pine/`. Run two-tab smoke (host + guest, all 3 scenes) and capture network tab for any 404s.

### Validation

Save to `cycle23-validation/phaseE/`:
- `sheep-cap-test.txt` — confirm RoomDO accepts 3000 + 5000 counts; 4-tab smoke runs at 3000 sheep without WS disconnect.
- `cinematic-strip.txt` — confirm `joinRoomByInvite` strips cinematic flag.
- `pine-grep.txt` — output of `grep -r pine js/ shared/ worker/` — should only match archive paths.
- `network-trace.har` — Playwright two-tab capture, confirm no 404s.

### Autonomous run markers

- Run: `npm test && npm run build && npm run dev:lan` (manual two-tab smoke) `&& npm run test:e2e`
- Pass: vitest green, two-tab smoke at 3000 sheep stable for ≥ 90sec without WS disconnect, network trace has zero 404s.
- HARD STOP: WS disconnect rate > 1/min at 3000 sheep — back out cap extension to `[..., 1000, 3000]` only (no 5000), document tomorrow.
- Commit: `feat(cycle-23-E): MP cap extension + cinematic-flag strip + pine 404 sweep`

## Phase F — misc + ship v1.4.0 (~3hr)

**Depends on:** Phases A–E green.

### Build

1. **Trees triangle counter.** [`js/PerfStatsPanel.tsx`](../js/PerfStatsPanel.tsx) (or wherever the in-game stats panel lives — search `Per-System Triangles`). Currently reads `Trees: 0` despite trees rendering. Likely the counter sums `treesGroup.children` but trees are now in InstancedMesh2 with addLOD chains; needs `traverse(obj => sum += obj.geometry?.attributes?.position?.count / 3 * obj.count)`.
2. **CHANGELOG update.** Document the 6 polish wins for players (overhead trees, sprint exit, HUD, MP modes, perf headroom).
3. **Version bumps.** Root + worker `package.json` 1.3.0 → 1.4.0. `npm version 1.4.0` in root, manual edit in worker.
4. **Tag.** `git tag v1.4.0 && git push origin main --tags`.

### Validation

- vitest 179+/179+ pass
- Build clean (`npm run build`); delta documented
- `npm run perf:check` → `field-extreme` within ±5%, OC-Extreme tri count drops ≥ 40%
- Sim-baseline byte-identical
- 12 screenshots saved to `cycle23-validation/phaseF/` covering 3 scenes × 2 cams × 2 ToD
- Live deploy green via GH Actions

### Autonomous run markers

- Run: `npm test && npm run build && npm run perf:check && git tag v1.4.0 && git push origin main --tags`
- Pass: all green, tag pushed.
- HARD STOP: deploy red on push — investigate before tagging.
- Commit: `release: v1.4.0 — overhead polish + grass T4 LOD + MP cap fix (cycle 23)`

## Dependencies

```
Phase A1 (atmospheric polish) ─→ Phase A2 (cam default + occlusion fade) ─┐
                                                                          ├─→ Phase D (grass T4 + tiering) ─→ Phase F (ship)
Phase B (stamina) ────────────────────────────────────────────────────────┤
Phase C (HUD) ────────────────────────────────────────────────────────────┤
Phase E (MP cheap wins) ──────────────────────────────────────────────────┘
```

A1 runs first; A2 runs after A1 so tree-material plumbing isn't trampled twice. B, C, E independent. D needs A1+A2 so its grass chunk path doesn't undo the desat fix or fight the occlusion-fade material patch. F is the close.

## Frozen files (cycle-specific additions)

All [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) entries apply. No cycle-specific additions.

## Hard stops

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline byte drift — Phase B sprint fix must not affect boid-sim trace.
3. Visual regression on Follow-cam (the angle that already looked good) — fix or revert before continuing.
4. T3→T4 grass band/seam visible in playtest — dial up dither width before commit.
5. MP WS disconnect rate > 1/min at 3000 sheep — back off Phase E cap extension.

## What NOT to do during this cycle

- **Don't fix the heightfield amplitude bug.** Standing carryover; visual character of the game depends on the amplified state. Cycle 24+ candidate, needs Matt's go-ahead before re-bake.
- **Don't migrate to BatchedMesh.** Cycle 22 Phase E recommendation: defer to Cycle 24+. Incompatible with Phase A's meshopt LOD1 pipeline.
- **Don't ship a full MP test suite.** Cycle 24 scope. Cycle 23 lands cheap MP wins only; the proper audit + Playwright two-tab harness gets its own cycle.
- **Don't reintroduce pine.** Cycle 22 Phase A removed it intentionally.
- **Don't re-enable the kiln impostor's color-match LUT path.** Cycle 22 Phase C unified the desat; LUT is dormant for a reason.
- **Don't touch the heightfield amplitude clamp** (`baseY > 50` in [`js/GrassSystem.js`](../js/GrassSystem.js)). Survives until Cycle 24+ root fix.
- **Don't add new clamps to GrassSystem.** Hard-Stop #8 from Cycle 19.
- **Don't merge `canStartSprint` and `canContinueSprint`.** Cycle 7 settled decision.
- **Don't remove Classic camera in this cycle.** Per Q6, fix trees first; re-evaluate at Phase F. Removal is always Cycle 24+ scope.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks Matt to confirm each item. Don't pre-check.

- [ ] All phases shipped or explicitly deferred to Cycle 24's BACKLOG carryover.
- [ ] All vitest specs pass (179+/179+).
- [ ] Production build clean.
- [ ] `npm run perf:check` green: `field-extreme` within ±5% of v1.3.0; OC-Extreme tri count down ≥ 40%.
- [ ] Sim-baseline byte-identical.
- [ ] Live on sheepdogsim.com via GH Actions, `v1.4.0` tag pushed.
- [ ] Matt confirms in playtest:
    - Classic-overhead Home Field reads as zen, not grey fog smear.
    - Sprint stops when stamina depletes mid-hold.
    - OC HUD has no camera-mode/objective overlap (desktop + mobile).
    - MP can host Insane/Chaos modes (or has a clear "all guests desktop" gate).
    - Stats panel shows correct triangle count for trees.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/cycle-22-plan.md`](cycle-22-plan.md) — predecessor (stylized LOD pivot)
- [`docs/cycle-22-batchedmesh-research.md`](cycle-22-batchedmesh-research.md) — BatchedMesh defer reasoning
- [`docs/research-grass-2026-05.md`](research-grass-2026-05.md) — grass technique research
- [`docs/archive/cycles/`](archive/cycles/) — cycles 2–19 plans
