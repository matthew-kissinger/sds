# Cycle 25 — polish-mega-cycle (autonomous overnight, ships v2.0.0)

> Drafted 2026-05-06. **Collapses the original 5-cycle polish program (Cycles 25-30) into a single mega-cycle for autonomous overnight execution.** Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md), then [`polish-program.md`](polish-program.md) (umbrella thesis), then [`meta-cycle-execution.md`](meta-cycle-execution.md) (autonomous policy), then this doc top-to-bottom.

## Goal

Ship `v2.0.0` as a polished, coherent, art-directed game in a single autonomous run. **Collapse the 6-cycle polish program** (LOD truth → atmospheric truth → impostor parity → camera → UX → tree art) into 8 phases (A-H) of one cycle, ordered by dependency. Each phase commits to a dedicated branch on completion; failed phases park-and-log instead of halting; the cycle ships only if Phase H's full validation passes.

User-visible difference at v2.0.0: trees no longer pop at LOD seams or wash to fog-grey; aerial perspective reads correctly at every camera angle; impostor matches LOD0 pixel-for-pixel under all atmospheric conditions; camera feels intentional with FOV-driven pull-back and per-mode zoom; start screen flows Mode → Scene → Dog with a scripted background orbit per selected scene; trees feel like distinct species with hand-placed landmarks per scene.

## How to read this plan

This cycle is unusually large because it bundles polish-program scope. Phases A-H are designed to be **independently committable**. If any phase fails its acceptance criteria, the autonomous runner parks the work on a sub-branch (`cycle-25-phaseX-parked`) and continues with phases that don't depend on it. Final wake-state report enumerates what shipped vs parked.

The original Cycle 25 had 6 phases (A-F) covering only LOD truth + ship `v1.6.0`. Those are now **Phase B** of this cycle. Phases C-H absorb the original Cycles 26-30 scope. See the cross-reference table below.

| Mega-Cycle 25 Phase | Original cycle scope | Ships |
|---|---|---|
| A | Cycle 25 Phase A (validation infra) | foundational |
| B | Cycle 25 Phases B-E (LOD truth) | LOD seam gone |
| C | Cycle 26 (atmospheric truth) | aerial LUT |
| D | Cycle 27 (impostor parity) | 8×4 atlas |
| E | Cycle 28 (camera + game-feel) | one state machine |
| F | Cycle 29 (start screen UX) | new flow |
| G | Cycle 30 Phases 1-3 (tree art) | distinct scenes |
| H | Cycle 30 Phase 4 (ship `v2.0.0`) | tag + deploy |

## Autonomous execution policy

See [`meta-cycle-execution.md`](meta-cycle-execution.md) for the durable policy. Summary:

- **All work on branch `meta-cycle-overnight-2026-05-06`.** Never push to `main`. Final merge gated on Matt's review.
- **No release tag without Matt's review.** `v1.5.0` (Cycle 24 close) and `v2.0.0` (this cycle close) are tagged on the branch but not pushed to origin.
- **No production deploy.** GH Actions deploys via `git push origin main`; we don't touch main.
- **Hard stops park-and-log instead of halting.** A phase that hits a hard stop saves state to `cycle25-validation/<phase>/HARDSTOP.md` and the runner continues with the next independent phase.
- **Validation is the gate.** Phase A's `tools/validation/` harness runs after every code-changing phase. Regressions revert that phase's commit and log to `cycle25-validation/<phase>/SKIPPED.md`.
- **Each phase commits to its own sub-branch first**, then merges to the meta-cycle branch. Allows clean rollback per-phase.
- **Resource considerate.** Codex agent on different project shares device; cap Playwright concurrency at 2, throttle if total RAM > 24GB.

## Open questions — resolved with author leans (autonomous mode)

Autonomous resolves all Qs at start. Each phase notes which Qs apply.

1. **Q1: HardwareTier fallback for LOD1?** **`'low'` only.** Mid-tier desktop gets LOD0+impostor.
2. **Q2: AlphaHash crossfade band length?** **20m (180-200m)** desktop.
3. **Q3: Delete desat or retain at strength=0?** **Delete entirely** if Phase B validation shows < 0.02 SSIM diff.
4. **Q4: Validation harness — Vitest or Playwright?** **Both, separate tools.** Vitest for fast IoU, Playwright for screenshot golden.
5. **Q5: `?debug=lodmatch` — corner inset or full-screen?** **Corner inset 320×240 top-right.**
6. **Q6: Aerial-perspective LUT format?** **R11G11B10F 32×32×32** (~196 KB), regenerate when sun moves > 2°.
7. **Q7: Impostor atlas — 8×4 at what tile size?** **8×4 × 256px = 2048×1024**, half the byte cost of 4×4 × 512.
8. **Q8: Camera zoom ranges?** **Follow 12-40, Free 15-60, Classic 20-150.**
9. **Q9: Start screen flow order?** **Mode → Scene → Dog → Settings.** Solo doesn't need Scene before Dog.
10. **Q10: Tree variant count for autonomous run?** **6 variants** (3 deciduous size grades, 1 birch, 1 conifer reintro, 1 fall-color). Drop dead-leafless and second-birch from the 8-10 originally planned to fit overnight scope.

## Architecture / shared changes

### `tools/validation/` (new directory, ships Phase A)

Durable validation infrastructure. See Phase A for full spec.

```
tools/validation/
├── lod-compare.mjs           # LOD0/LOD1/LOD2 silhouette IoU + dE2000 + luma
├── screenshot-golden.mjs     # Playwright 108-capture matrix + SSIM diff
├── input-latency.mjs         # Synthetic input → frame-paint latency
├── frame-time-histogram.mjs  # p99/p99.9 frame-time recorder
├── golden/                   # Reference screenshots (committed)
└── README.md
```

### Aerial-perspective LUT (Phase C)

3D texture sampled by every patched material; replaces `THREE.Fog` + `<fog_fragment>`. Integrates Hillaire 2020 / Bruneton-style precomputed scattering.

### `js/HardwareTier.js` extensions (Phase B)

`usesLod1ForFoliage()` returns `true` only for `'low'` tier. `lod0CrossfadeBand()` returns `[180, 200]` desktop, `[80, 100]` mobile-low.

### Camera state machine (Phase E)

Single state object `{ targetDistance, targetHeight, yawSource, fov }` consumed by all 3 modes. Eliminates `_updateClassic / _updateFollow / _updateFree` divergence.

## Phase A — Validation infrastructure (~3hr autonomous, was Cycle 25 Phase A)

**Independently testable. Foundation for all subsequent phases.**

### Build

1. **`tools/validation/lod-compare.mjs`** — headless Three.js render of LOD0/LOD1/LOD2 at fixed offsets (50m, 80m, 120m, 180m, 250m). Compute silhouette IoU (alpha-channel intersection-over-union), dE2000 mean (CIE2000 color difference, Lab-space), luminance delta mean (BT.709). Output JSON + PNG triptych.
2. **`tools/validation/screenshot-golden.mjs`** — Playwright matrix: 3 scenes × 3 ToDs × 4 cam modes × 3 zooms = 108 captures. SSIM diff vs `tools/validation/golden/`. Fails on `< 0.95` mean.
3. **`tools/validation/input-latency.mjs`** — synthetic keypress → frame-paint p99 latency. Targets: < 33ms desktop, < 50ms phone.
4. **`tools/validation/frame-time-histogram.mjs`** — 600-frame histogram, p99/p99.9.
5. **`tools/validation/README.md`** — usage docs.
6. **NPM scripts** — `validation:lod`, `validation:screenshots`, `validation:latency`, `validation:perf`, `validation:all`.

### Validation
- All 4 tools functional on current main (sanity check the harness).
- Baseline JSON saved to `cycle25-validation/phaseA/baseline/`.
- 108 goldens captured to `cycle25-validation/phaseA/screenshots/` — **NOT yet copied to `tools/validation/golden/`** (Matt reviews + commits as durable golden).

### Acceptance
- 4 tools npm-scripted, exit-code'd, JSON-output'd.
- Baseline committed to `cycle25-validation/phaseA/baseline/`.

### Hard stop (autonomous: park + continue)
- Tool failures on baseline run → park; subsequent phases skip validation gates that depend on the parked tool.

## Phase B — LOD truth (~3hr, was Cycle 25 Phases B-E)

**Depends on:** Phase A.

### Build

1. **`js/HardwareTier.js`** gains `usesLod1ForFoliage()` + `lod0CrossfadeBand()`.
2. **[`js/TerrainBuilder.js`](../js/TerrainBuilder.js):1521-1568** branches: desktop drops `addLOD(lod1Child, 80)`; mobile-low keeps it. AlphaHash band raised in 180-200m via per-fragment uniform.
3. **Kiln impostor** crossfades in across 180-200m matching the LOD0 hash pattern.
4. **Set `uDesatStrength.value = 0`** at construction. Validate < 0.02 SSIM regression.
5. **Delete `AtmosphericDesatPatch.js`** + all plumbing (`_desat*` fields, pitch-aware desat, `setKilnImpostorDesat`, kiln desat uniforms + math). ~180 LOC out.
6. **Per-scene fog retune** — `near 220→350, far 700→900` in `shared/scenes/{field,rolling-hills,open-country}.js`.
7. **`?debug=lodmatch` overlay** — corner inset 320×240, live IoU/dE2000/luma between LOD0 and active LOD.

### Validation
- `validation:lod` IoU ≥ 0.90, dE2000 ≤ 4 in 100-250m band.
- `validation:screenshots` — expected deltas in 80-200m visible-tree zones; no unexpected changes.
- `validation:perf` — desktop p99 frame time delta ≤ +1ms.
- `?debug=lodmatch` overlay numbers match offline `lod-compare` ±1%.

### Acceptance
- ~180 LOC removed (desat patch + plumbing).
- All validation green.
- Build clean, vitest pass (post-desat-removal may need test updates).

### Hard stop (autonomous: park + continue)
- IoU regression > 0.05 vs Phase A baseline → park Phase B; subsequent phases (C, D, G) check parked state, skip if dependent.

## Phase C — Atmospheric truth (~4hr, was Cycle 26)

**Depends on:** Phase B (the LOD seam Phase B's desat was masking is gone; aerial perspective replaces fog cleanly).

### Build

1. **Aerial-perspective LUT generator** — `js/atmosphere/AerialPerspectiveLUT.js`. 32×32×32 R11G11B10F 3D texture. Inputs: sun direction, atmosphere parameters from existing sky shader. Encodes (in-scattering, transmittance) per (view-pitch, view-azimuth, distance) slot. Regenerated when sun moves > 2°.
2. **Height-fog density patch** — `js/shaders/HeightFogPatch.js`. Replaces `<fog_fragment>` chunk in `onBeforeCompile`. Density `ρ(y) = ρ₀ * exp(-(y - y₀) / H)`, integrated along view ray (closed-form for exponential height fog, no raymarching). H ≈ 40m. Reads aerial-perspective LUT for tint instead of static `fogColor`.
3. **Replace `THREE.Fog`** — `Atmosphere.js` no longer instantiates `THREE.Fog` / `FogExp2`. All world materials patch via `HeightFogPatch.patchMaterial(mat, lutTexture)`.
4. **Per-scene fog config simplifies** — `sceneDef.fog: { near, far, color }` collapses to `sceneDef.atmosphere: { groundAlbedo, horizonHue }`. Remaining 4 tunables are derived (height scale, density scale, sun-color blend, ambient-fill).
5. **Kiln impostor reads LUT** — replace inline `vFogDepth` desat math (already deleted Phase B) with LUT-sampled aerial perspective.

### Validation
- `validation:screenshots` — atmosphere captures show smooth horizon → ground gradient. No "hard fog edge."
- Sun moves through atmosphere correctly at golden-hour preset.
- Trees fade toward sky-tinted-up, ground-tinted-down (validated via the lodmatch overlay at 50/150/250m camera distances).
- `validation:perf` — LUT sample per fragment cost < 0.5ms per frame on Field-Extreme.

### Acceptance
- ~50 LOC removed (`THREE.Fog` plumbing + per-scene fog triples).
- Atmospheric coherence at every angle.

### Hard stop (autonomous: park + continue)
- LUT sample cost > 1ms per frame → park; fall back to per-vertex sampling in a follow-up.

## Phase D — Impostor parity (~4hr, was Cycle 27)

**Depends on:** Phase B (alphaHash crossfade band) and Phase C (aerial LUT).

### Build

1. **Re-bake atlases at 8×4 lat-lon × 256px tiles** — `tools/bake-tree-impostors.mjs` now passes `--azimuths=8 --elevations=4 --tileSize=256` to Pixel Forge. Output 2048×1024 atlas (half the byte cost of 4×4 × 512 = 2048×2048). Closes Cycle 20 Q2 escalation.
2. **Padded-atlas mipmaps** — bake with 16px tile padding, re-enable `generateMipmaps = true`. Halen 2022 / HPG technique. Kills distant shimmer.
3. **Hybrid trunk-mesh** — `addLOD` chain becomes LOD0 (0-180m) → LOD1-trunk-mesh + LOD2-impostor-canopy (180m+). Trunk inherits `MeshStandardMaterial` + height-fog patch automatically. Cycle 21 Phase 4 deferred work.
4. **Sky-LUT-coupled relighting** — `kiln-impostor-material.js` shader samples aerial-perspective LUT for sun + ambient + ground-bounce instead of the 3 separate uniforms (`uSunColor`, `uAmbientColor`, `uGroundBounceColor`). The setImpostorTint plumbing simplifies dramatically.
5. **Delete `tools/generate-impostor-lut.mjs`** + `uMatchBoost` uniform + `setImpostorMatchBoost` plumbing. ~190 LOC out.
6. **Update kiln shader vertex constants** — `TILES_X = 8.0, TILES_Y = 4.0`. Update cell-pick math (azimuth step `TWO_PI / 8.0`).

### Validation
- `validation:lod` — IoU ≥ 0.92 LOD0↔impostor at 200m (was ≥ 0.85 with 4×4 atlas).
- `validation:screenshots` — impostor warm-bias gone, color matches LOD0 across all ToD.
- Atlas size: < 4 MB per tree post-Draco compression (was ~3 MB at 4×4×512; 8×4×256 should be lower).
- Distant trees no longer shimmer (mipmap re-enable).

### Acceptance
- ~190 LOC removed (matchBoost plumbing).
- 8×4 atlas committed.
- Hybrid trunk renders at 180m without seam.

### Hard stop (autonomous: park + continue)
- Pixel Forge bake fails (Windows-specific install issue per Cycle 20 finding) → park Phase D; Phase G partial (uses existing 4×4 atlas).

## Phase E — Camera + game-feel (~3hr, was Cycle 28)

**Depends on:** none (parallel-safe with C, D, F).

### Build

1. **Single state machine** — `js/CameraController.js` collapses `_updateClassic / _updateFollow / _updateFree` into one update reading from `{ targetDistance, targetHeight, yawSource, fov }` per-mode-derived state. ~170 LOC condensed from ~250.
2. **Per-mode zoom** — Follow 12-40, Free 15-60, Classic 20-150. `handleWheel` routes by `this.mode`. Persist to localStorage `sds.cameraZoom.<mode>`.
3. **FOV-driven pull-back** — distance ∈ [12, 40] ramps FOV 50° → 38° (slight tele) on Follow zoom-out. Cinematic compression.
4. **Sprint dolly-zoom** — +2° FOV, 0.4s ease, on sprint state-enter; reverses on sprint-exit.
5. **Velocity-quadratic touch sensitivity** — Free cam `touchYawScale` becomes `0.012 * (1 + |delta|/200)` so slow swipes are precise, fast flicks are responsive. Default 2.4× faster than current 0.005.
6. **Optional gyro** — `DeviceOrientationEvent` gated on `?camera=gyro` URL param + permission prompt. Mobile-only.
7. **Mode UI: segmented control** — `js/components/GameHUD/CameraModeIndicator.js` becomes a 3-pill segmented control with sliding indicator (framer-motion `layoutId`) on long-press / hover. Collapses to chip when not interacting. Settings panel reuses the same component.
8. **Game-feel telemetry** — `tools/validation/input-latency.mjs` captures pre/post Phase E.

### Validation
- `validation:latency` — input-to-camera-response p99 ≤ Phase A baseline (no regression from refactor).
- Manual: sprint dolly-zoom feels intentional, not jarring.
- Touch sensitivity slider at 1.0× default = noticeably faster than current main.

### Acceptance
- ~170 LOC condensed.
- Per-mode zoom persists across reload.
- Segmented control matches ScenePicker visual language.

### Hard stop (autonomous: park + continue)
- Refactor breaks an existing camera test → park, fall back to per-mode constants.

## Phase F — Start screen + scene selection UX (~3hr, was Cycle 29)

**Depends on:** Phase E (camera state machine; scripted background orbits use it).

### Build

1. **Restructure flow** Mode → Scene → Dog → Settings (was Scene → Mode → Dog). New `js/components/StartScreen/index.js` flow controller with breadcrumb nav.
2. **Hero-art ScenePicker** — large card per scene (Field / Rolling Hills / Open Country) with ToD-cycler preview. Existing `ScenePicker.js` extends with hero card layout.
3. **Live WebGL DogSelection preview** — pannable inset rendering the selected dog mesh.
4. **Outcome-art ModeSelection** — cooperative/competitive/timed shown as illustrative art ("3 dogs working together" / "race to corral" / "stopwatch") rather than text labels.
5. **Skeleton loading states** — replace `null` paint during scene swap with shimmer skeleton.
6. **Scripted background-scene orbit per selected scene** — `MenuController.cinematicCamera` becomes per-scene scripted path. Field: low orbit around farmhouse. RH: dusk pull-back from valley. OC: golden-hour rise over portal. Replaces the static cinematic camera (Phase E's state machine consumes the path).
7. **First-time tutorial overlay** — 5-step pointer tour. Skip-able. localStorage `sds.tutorialSeen` gates re-show.
8. **Transitions + audio cues** — fade between screens, soft chime on select. Mobile haptic (`navigator.vibrate(10)`) on tap.

### Validation
- `validation:screenshots` — start-screen captures pinned as new goldens (the old cinematic-camera captures regenerate as no-longer-canonical).
- Manual: flow feels natural; no dead-end states; back button always works.

### Acceptance
- New flow shipped; old radio-button row gone.
- All 3 scenes have authored cinematic orbits.
- Tutorial gates correctly on first visit.

### Hard stop (autonomous: park + continue)
- React refactor breaks existing component tests → park; ship old flow with only the segmented-control update from Phase E.

## Phase G — Tree art direction (~4hr, was Cycle 30 Phases 1-3)

**Depends on:** Phase D (8×4 impostor pipeline) and Phase B (no-LOD1 desktop path).

### Build

1. **Bake 6 tree variants** — `tools/bake-trees.mjs` extends with new recipes:
   - `tree-deciduous-small` (sapling: leaves=18, branches[0]=4, baseSize=1.0)
   - `tree-deciduous-medium` (existing tree1 baseline, leaves=42 per Cycle 21 retune)
   - `tree-deciduous-large` (ancient: leaves=60, branches[0]=14, baseSize=2.4)
   - `tree-birch` (white-bark, slim, leaves=35, branches[0]=8, BARK_TINTS reuse)
   - `tree-conifer-reintro` (Cycle 22 pine removal reverses; LOD-truth means no LOD1 silhouette risk)
   - `tree-fall-color` (warm tint variant for Open Country autumn — leaves baseHue shifted toward orange)
2. **Re-bake impostors for all 6** via the new 8×4 pipeline (Phase D).
3. **Per-scene tree distribution profiles** — `shared/TreePlacement.js` reads `sceneDef.treeProfile`:
   - Field: `{ deciduous: 0.6, deciduous-large: 0.2, birch: 0.2 }` — English pasture
   - Rolling Hills: `{ deciduous-small: 0.4, deciduous: 0.4, deciduous-large: 0.2 }` — Mediterranean
   - Open Country: `{ deciduous: 0.3, conifer: 0.4, birch: 0.2, fall-color: 0.1 }` — Pacific Northwest
4. **Authored landmark trees per scene** — 4-6 per scene, marked `sceneDef.landmarks: [{ x, z, type, scale }]`. Skip Poisson placement around them. Field: ancient by farmhouse. RH: 2 cypress markers. OC: lookout pine on ridge.
5. **Embedded wind in impostor bake** — Pixel Forge `--frames=4 --windPhase=0..360` produces 4-frame impostor sequence. Runtime modulates by `sin(time * 0.5)`. Trees animate at all distances.

### Validation
- `validation:screenshots` — 3 scenes captured at all 3 ToDs read as visually distinct.
- Manual: each scene "feels like a place," not "Field with reskin."

### Acceptance
- 6 tree variants baked + committed.
- Per-scene profiles applied.
- Landmark trees visible at hero positions.
- Embedded wind animates LOD2 impostors.

### Hard stop (autonomous: park + continue)
- Bake of any variant fails → park that variant; ship with available subset.
- Pixel Forge animated-bake fails → park embedded wind; ship static impostors with new profiles.

## Phase H — Ship `v2.0.0` (~1hr)

**Depends on:** Phases A-G (E and F can be parked; A, B, C, D, G are critical path).

### Build

1. **CHANGELOG.md `[2.0.0]`** — describe the polish program landing as one cycle. Mention LOD truth, atmospheric truth, impostor parity, camera, UX, art direction in player-facing language.
2. **Version bumps** root + worker `package.json` 1.5.0 → 2.0.0.
3. **Tag `v2.0.0`** on the meta-cycle branch (do NOT push tag yet — gated on Matt review).
4. **Update [polish-program.md](polish-program.md)** — mark all 6 cycles shipped as one.
5. **Stub `docs/cycle-26-plan.md`** — empty next-cycle scaffold (`/cycle-close` style).
6. **Update [NEXT_SESSION.md](../NEXT_SESSION.md)** — meta-cycle close; Cycle 26 starts post-merge.
7. **Wake-state report** — final commit `chore(meta-cycle): wake-state report`. Single file `docs/wake-state-2026-05-06.md` summarizing what shipped, what parked, what needs Matt's review.

### Validation
- All `validation:*` harnesses green.
- Vitest pass.
- Production build clean. Byte delta documented.
- All committed to meta-cycle branch.

### Acceptance
- Branch is review-ready.
- Wake-state report enumerates everything for Matt's morning pass.

## Dependencies

```
Phase A (validation infra) ──→ Phase B (LOD truth) ──→ Phase C (atmospheric truth) ──→ Phase D (impostor parity) ──→ Phase G (tree art) ──→ Phase H (ship)
                                                                                  ├─→ Phase E (camera)         ────────────────────────┘
                                                                                  └─→ Phase F (start UX)        ────────────────────────┘
```

Critical path: A → B → C → D → G → H. E + F parallel after B.

## Frozen files (cycle-specific additions)

All [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) entries apply.

- **`tests/sim-baseline/__fixtures__/`** — don't regenerate (sim baseline must stay byte-stable).
- **`shared/MovementPhysics.js` `updateMovement`** — Cycle 25 doesn't touch movement.
- **`tools/validation/golden/`** — Phase A captures land in `cycle25-validation/phaseA/screenshots/`; copying to durable golden is gated on Matt review.
- **`main` branch** — never push during autonomous run.
- **GH origin tags** — never push tags during autonomous run.

## Hard stops (autonomous mode: park + log + continue)

In autonomous mode all hard stops trigger park-and-log instead of halt-and-surface. Every park writes:
- `cycle25-validation/<phase>/HARDSTOP.md` (what failed, why, what was reverted)
- `git revert` of the parked phase's commit
- Subsequent dependent phases skip with their own `SKIPPED.md`

Hard-stop triggers:

1. Frozen-file change without scope authorization.
2. Sim-baseline byte drift.
3. IoU regression > 0.05 vs Phase A baseline at any distance bucket.
4. SSIM regression > 0.05 unexpectedly (= Phase change had unintended visual impact).
5. p99 frame-time regression > 5%.
6. Build fail / vitest fail unrelated to expected deletions.
7. Pixel Forge bake fail (Phase D / G).

## What NOT to do during this cycle

- **Don't push to main, don't push tags.** Matt reviews + merges.
- **Don't deploy to production via GH Actions.** Same reason.
- **Don't fix the heightfield amplitude bug.** Standing carryover.
- **Don't touch sim-baseline fixtures.**
- **Don't rearchitect multiplayer** — Cycle 24 finished MP; this cycle doesn't touch it.
- **Don't run validation:all in parallel with the Codex agent on the other project** if device shows RAM > 24GB.
- **Don't suppress hard-stop logs** — every park needs a HARDSTOP.md so Matt can review what was skipped.

## Success criteria (cycle close)

`/cycle-close` reads this section. Auto-resolved at meta-cycle wake-state report.

- [ ] All phases A-H shipped or parked with documented HARDSTOP.md.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] **Branch `meta-cycle-overnight-2026-05-06` is review-ready** — Matt merges to main + pushes tag if approved.
- [ ] All `tools/validation/` harnesses green vs Phase A baseline (or skip per parked-phase chain).
- [ ] 108 screenshot goldens NOT auto-committed to `tools/validation/golden/` — review-gated.
- [ ] `docs/wake-state-2026-05-06.md` enumerates shipped/parked/needs-review.
- [ ] `cycle25-validation/phase{A-H}/` artifacts committed.

## References

- [`docs/polish-program.md`](polish-program.md) — umbrella thesis (6-cycle program collapsed here)
- [`docs/meta-cycle-execution.md`](meta-cycle-execution.md) — autonomous policy (this cycle)
- [`docs/cycle-24-plan.md`](cycle-24-plan.md) — predecessor (MP testing, `v1.5.0`)
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template source
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/tree-pipeline.md`](tree-pipeline.md) — to be updated Phase B + D + G
- Halen et al., HPG 2022 — padded-atlas mipmaps (Phase D)
- Hillaire 2020 / Bruneton — aerial-perspective LUT (Phase C)
- CIE2000 dE — used by Phase A `lod-compare`
- SSIM (Wang et al. 2004) — used by Phase A `screenshot-golden`
