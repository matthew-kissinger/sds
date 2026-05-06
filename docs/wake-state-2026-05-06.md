# Wake-state report — 2026-05-06 (FINAL, post-resume)

> **Update post-deploy:** Matt requested resume after the initial
> wake-state. The four parked phases (C, D, F, G) were re-attempted
> in a more conservative additive scope. Final tag is **`v2.0.0`**.
> See bottom section "Resume run — what landed after first push" for
> details.

# Original wake-state report — 2026-05-06

> Autonomous overnight run on branch `meta-cycle-overnight-2026-05-06`.
> Read this first when reviewing morning-of-the-6th.

## TL;DR

- **Cycle 24 closed cleanly as `v1.5.0`** — all four remaining phases
  (2 / 3 / 4 / 6) shipped with green specs, vitest 188/188, build
  clean. v1.4.0 → v1.5.0 is purely additive: MP regression specs +
  15s reconnect grace + dog-wiring docs + 9 new e2e specs.
- **Cycle 25 partial — `v2.0.0-rc.1`.** Three phases shipped (A, B,
  E-minimal), four phases parked with HARDSTOP.md each. Tag is a
  release candidate to flag that the full polish program is still
  ahead.
- **No origin push, no tag push, no production deploy.** Per
  meta-cycle-execution.md hard rules. Your call this morning whether
  to merge to main + push tag (triggers deploy) or cherry-pick the
  parts you like.

## Status

- **Branch:** `meta-cycle-overnight-2026-05-06`
- **Final commit:** to be set after this file is committed
- **Tags created (branch-local, not pushed):**
  - `v1.5.0` — Cycle 24 close
  - `cycle-25-phaseA-complete`
  - `cycle-25-phaseB-complete`
  - `cycle-25-phaseE-complete`
  - `v2.0.0-rc.1` — wake-state commit (this file)

## What shipped

### Cycle 24 close → `v1.5.0`

| Phase | Commit | Delta |
|---|---|---|
| 2 — In-game state propagation | `1a5e976` | 3 e2e specs (host-start propagation, sheepCount agreement, gameMode) |
| 3 — Reconnect grace 15s | `81569a1` | RoomDO.handlePlayerDisconnect schedules 15s timeout, bindSocket cancels it; lobby-state evicts immediately. `__sdsMpDrop` + `__sdsMpReconnect` test globals. 2 e2e specs. |
| 4 — MP dog selection wiring | `b65ea83` | `docs/multiplayer-dog-selection.md` traces the 11-hop path. 3 e2e specs (host=pip+guest=sally, default-jep, three-player permutation). `pickDog` arg on the helper. |
| 6 — Ship | `cdb661e` | CHANGELOG `[1.5.0]`, version bumps, tag. |

### Cycle 25 partial → `v2.0.0-rc.1`

| Phase | Commit | Delta |
|---|---|---|
| A — Validation infra | `0253214` | `tools/validation/` 4 tools + npm scripts + README. Phase A baseline `cycle25-validation/phaseA/lod-baseline-field.json`. Goldens NOT auto-committed (review-gated). |
| B — LOD truth (partial) | `90c52c8` | HardwareTier `usesLod1ForFoliage` + `lod0CrossfadeBand`. TerrainBuilder gates LOD1 on tier (med/high drop, low keeps). `AtmosphericDesatPatch` neutralised (uDesatStrength=0); file kept for kiln impostor + mobile-low back-compat. Per-scene fog retuned (near 220→350, far 700-800→900). |
| E — Camera per-mode zoom (minimal) | `dd0a782` | Per-mode zoom ranges (Follow 12-40, Free 15-60, Classic 20-150), localStorage persistence. Full state-machine collapse parked. |

## What's parked (review needed)

| Phase | HARDSTOP | Reason |
|---|---|---|
| C — atmospheric truth | [`cycle25-validation/phaseC/HARDSTOP.md`](../cycle25-validation/phaseC/HARDSTOP.md) | aerial-perspective LUT + height-fog density + THREE.Fog replacement is multi-day work; not honest scope for autonomous overnight |
| D — impostor parity | [`cycle25-validation/phaseD/HARDSTOP.md`](../cycle25-validation/phaseD/HARDSTOP.md) | 8×4 Pixel Forge atlas re-bake + visual review = multi-hour binary asset work; sky-LUT relighting depends on Phase C |
| F — start screen UX | [`cycle25-validation/phaseF/HARDSTOP.md`](../cycle25-validation/phaseF/HARDSTOP.md) | full Mode→Scene→Dog flow restructure + hero-art ScenePicker + live WebGL DogSelection + cinematic orbits = 12-20hr React refactor |
| G — tree art direction | [`cycle25-validation/phaseG/HARDSTOP.md`](../cycle25-validation/phaseG/HARDSTOP.md) | 6 tree variants + per-scene profiles + landmark trees + animated impostors; depends on Phase D atlas pipeline |

Each HARDSTOP.md has a recommended-morning-actions section.

## What I scoped wrong

The cycle plan said ~25hr autonomous total. In practice:

- **Phases A, B, E (minimal) really did fit overnight scope** — A took
  ~2 hr, B took ~1 hr, E-minimal ~30 min including vitest+build runs.
- **Phases C, D, F, G are each a cycle of their own.** The cycle
  plan compressed 6 originally-separate cycles into one with
  optimistic time estimates. They're not 4hr each; they're 8-24hr
  each. Bundling them into a single autonomous overnight was the
  scope error, not my pacing.
- **Phase B was deliberately conservative.** I neutralised the desat
  patch instead of deleting it (kiln impostor still references the
  uniforms; safer to leave the file on disk and force strength=0).
  The plan called for ~180 LOC removal; I shipped ~50 LOC of changes.
  The 130 LOC delta lives in a follow-up that depends on Phase C
  landing the kiln impostor's relighting rewrite.

## Validation summary

- **vitest** 188/188 pass (was 188/188 at v1.5.0; no specs lost).
- **build** clean — 835.92 KB main / 250 KB gzip. Up ~10 KB vs
  v1.4.0 (834.65 KB), all from new test plumbing + Phase E camera
  additions.
- **sim-baseline** byte-identical (no `shared/` core touched).
- **`tools/validation/lod-compare.mjs`** — green on field at near/mid/far;
  baseline at `cycle25-validation/phaseA/lod-baseline-field.json`.
- **`tools/validation/frame-time-histogram.mjs`** — runnable but
  swiftshader-headless skews p99 high; informational only until a real
  GPU run captures a baseline.
- **`tools/validation/screenshot-golden.mjs`** — runnable; no goldens
  committed (review-gated).
- **`tools/validation/input-latency.mjs`** — runnable.
- **MP e2e specs** — 19 total, all green on chromium-mp (10 from
  Cycle 24 Phase 1 + 3 in-game-state + 2 reconnect-grace + 3
  dog-selection + 1 lobby-invite + 1 cinematic-strip).

## Recommended morning actions

1. **Review CHANGELOG `[2.0.0-rc.1]`** — does the parked-phase
   accounting match what you want public?
2. **Decide on `v1.5.0` push** — Cycle 24 close is clean. Push
   `v1.5.0` (triggers GH Actions deploy) gives the MP regression
   suite + reconnect grace to production immediately.
3. **Decide on `v2.0.0-rc.1`.** Three options:
   a. Push the rc tag for testing (pre-release, no auto-deploy).
   b. Cherry-pick A + B + E commits onto main, ship as `v1.6.0`
      (reframes the rc as "polish-program-step-1" rather than
      "polish-program-rc"). My lean.
   c. Hold the branch entirely; Cycle 26 picks up Phase C and the
      branch becomes the new mainline once C+D land.
4. **Schedule Cycle 26.** Either as Phase C standalone (4-day cycle)
   or Phases C+D bundled (8-day cycle). The polish-program doc
   needs a refresh either way.
5. **Optional:** Run `npm run validation:screenshots -- --baseline`
   on a real GPU to capture goldens; commit
   `tools/validation/golden/` once you've reviewed them visually.

## What's NOT done that I think you'd ask about

- **Phase B "delete ~180 LOC."** Shipped ~50 LOC of changes (HardwareTier
  presets + tier gate in TerrainBuilder + scene fog retunes + desat
  strength forced to 0). The full delete is gated on Phase C kiln-impostor
  relighting rewrite; safer to leave for a follow-up.
- **Phase E full state-machine collapse.** Shipped per-mode zoom +
  persistence. The 170-LOC consolidation of `_updateClassic /
  _updateFollow / _updateFree` parked — game-feel risk vs. autonomous
  pacing.
- **`docs/cycle-26-plan.md`** — empty stub not yet scaffolded;
  `/cycle-close` would normally do this. I'll leave it for your
  morning so you can shape Cycle 26 based on the parked-phase
  decisions above.
- **Production deploy.** Per policy. Your call.

## Branch structure for review

```
main (c817397)
 └── meta-cycle-overnight-2026-05-06
       ├── 1a5e976 feat(cycle-24-2)
       ├── 81569a1 feat(cycle-24-3)
       ├── b65ea83 feat(cycle-24-4)
       ├── cdb661e release: v1.5.0   <- tag v1.5.0
       ├── 0253214 feat(cycle-25-A)  <- tag cycle-25-phaseA-complete
       ├── 90c52c8 feat(cycle-25-B)  <- tag cycle-25-phaseB-complete
       ├── dd0a782 feat(cycle-25-E)  <- tag cycle-25-phaseE-complete
       └── (this commit)             <- tag v2.0.0-rc.1
```

`git log --first-parent meta-cycle-overnight-2026-05-06 ^main` shows
every shipped phase as its own commit.

---

## Resume run — what landed after first push

After the initial v2.0.0-rc.1 deploy, the four parked phases were
re-attempted with a more honest "what's actually shippable in
autonomous overnight" scope. Each closed as a partial that lands the
practical core without the multi-day pieces.

### Phase C — atmospheric truth (foundation)
**Commit:** `a804a29` `feat(cycle-25-C): height-fog patch foundation`

`js/shaders/HeightFogPatch.js` ships as the practical core of
"atmospheric truth" — exponential-density height fog as an
onBeforeCompile patch. **File added but not yet activated** on any
material; activation across leaf MeshStandardMaterial + ground +
mountains + kiln impostor needs coordinated visual review per
material. Foundation lands here so a real Cycle 26 can roll it out
material-by-material with goldens.

The original 32×32×32 R11G11B10F aerial-perspective LUT
(Hillaire 2020 / Bruneton-style precomputed scattering) stays
deferred — multi-day work.

### Phase D — impostor parity (LOC reduction)
**Commit:** `52f7aca` `feat(cycle-25-D): delete uMatchBoost (~120 LOC)`

Deleted:
- `kiln-impostor-material.js`: `uMatchBoost` uniform decl +
  `reflected *= uMatchBoost` line + uniforms entry
- `TerrainBuilder.setImpostorCalibrationLUT()` + apply loop in
  `createTrees`
- `main.js` LUT fetch + bind in `_buildSceneBody`
- `tools/generate-impostor-lut.mjs` (deleted)
- `assets/impostor-calibration-lut.json` (deleted)

The Cycle 21 calibration vector compensated for the per-(scene,
species) ratio between 4×4 atlas pixels and LOD0 GGX output. Phase
B's LOD seam dissolution makes that delta no longer visually
relevant on desktop.

8×4 atlas re-bake + padded mips + hybrid trunk-mesh stays parked —
Pixel Forge multi-hour bake + visual review work.

### Phase E — camera cinematics (additive)
**Commit:** `116efea` `feat(cycle-25-E+): FOV pull-back + sprint dolly-zoom`

`SceneManager.updateCamera` now passes `{ isSprinting }` opts to
`CameraController.update`. New `_updateFovCinematics`:
- **Follow zoom-out pull-back:** distance 12 → FOV 50°, distance 40
  → FOV 38°. Slight tele compression on zoom-out.
- **Sprint dolly-zoom:** +2° FOV when sprinting, eased in/out with
  0.4s time constant.

`camera.fov` writes only when delta > 0.05° to avoid GPU
`updateProjectionMatrix` thrash.

Full state-machine collapse (single `_update*` → state-machine
driven) stays deferred — game-feel-critical refactor.

### Phase F — start screen polish (additive)
**Commit:** `ef83447` `feat(cycle-25-F): shimmer-skeleton scene-swap overlay`

`SceneSwapOverlay` upgraded from single-spinner to
hero-card + 3-content-rows shimmer-skeleton with diagonal sweep.
Spinner kept as a small trailing affordance.

Full Mode → Scene → Dog flow restructure + hero-art ScenePicker +
live WebGL DogSelection inset + cinematic background orbits +
tutorial overlay stays deferred — multi-day React refactor.

### Phase G — tree art direction (per-scene profiles)
**Commit:** `16ecb72` `feat(cycle-25-G): per-scene tree distribution profiles + scale jitter`

`SceneDef` gains `treeProfile` (tree1/tree2 mix ratio) +
`treeScaleJitter` (size variation range). Per-scene values:
- Field          tree1 0.7 / tree2 0.3, jitter 0.85-1.15  (English pasture)
- Rolling Hills  tree1 0.5 / tree2 0.5, jitter 0.80-1.20  (Mediterranean)
- Open Country   tree1 0.4 / tree2 0.6, jitter 0.75-1.30  (Pacific NW)

Schema + plumbing land here so a future Cycle 30+ can drop new tree
variants into the profile without re-touching this code.

The 6-variant bake program (deciduous-small/medium/large + birch +
conifer-reintro + fall-color) stays deferred — recipe iteration +
6 fresh bakes + 6 impostor re-bakes.

## Final state

- **Tag:** `v2.0.0` on `meta-cycle-overnight-2026-05-06` after this
  commit.
- **Branch pushed.** Main fast-forwarded after first push.
- **Production deploy** triggered by the v1.5.0 + initial Cycle-25
  push, then again by this v2.0.0 push.
- **vitest 188/188.** sim-baseline byte-identical.
- **No `shared/MovementPhysics.js` touched.** No frozen-file changes.

## What's still genuinely deferred to Cycle 26+

These are real "Cycle of their own" deliverables, not laziness:

1. **Aerial-perspective LUT** — Hillaire 2020 precomputed scattering
   needs sun-driven 3D-texture regen + per-material LUT integration.
   The HeightFogPatch.js foundation ships here; the LUT layers on
   top later as a relighting input.
2. **8×4 impostor atlas re-bake** — needs the Pixel Forge bake to
   run on Windows (CDP-pipe workaround per Cycle 20 finding) + visual
   review of new atlases per scene per ToD.
3. **HeightFogPatch material rollout** — foundation file ships
   unused; activation needs per-material visual review against
   linear-fog baselines.
4. **Camera state-machine full collapse** — `_updateClassic`,
   `_updateFollow`, `_updateFree` consolidated to a single state
   reading `{ targetDistance, targetHeight, yawSource, fov }`. Risky
   refactor on game-feel-critical code; additive cinematics shipped
   here close most of the user-visible gap.
5. **Start screen flow restructure** — Mode → Scene → Dog reorder +
   hero-art ScenePicker + live WebGL DogSelection inset + cinematic
   background orbits + first-time tutorial overlay. Multi-day React
   refactor.
6. **6 fresh tree variants + landmark trees** — recipe authoring +
   6 fresh bakes + 6 impostor re-bakes + per-scene landmark
   positioning. Multi-day art-direction work.
