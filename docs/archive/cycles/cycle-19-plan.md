# Cycle 19 — visual-verification-and-octahedral-polish-and-v1.1.0

> Drafted 2026-05-04 after Cycle 18 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Cycle 18 shipped three independent code-level fixes (per-scene `grassRadius`, scene-swap state hygiene, octahedral impostors) end-to-end autonomous overnight. None of them have been visually verified on real WebGL hardware yet — code review and headless CI greens give partial confidence, but the acceptance criteria for Phase 1 (RH grass to slopes / OC grass to shore) and Phase 3 (octahedral impostor brightness parity across 4 sun positions) require human eyes. This cycle is the verification pass + Phase 4 polish from Cycle 18 + the long-pending v1.1.0 hero cards (Cycle 16 carryover). Hardening gates `v1.1.0` — don't tag until visual verification on Cycle 18 phases passes.

User-visible difference between "before" and "after":

- Cycle 18 octahedral impostors playtested across all three scenes + four sun positions; either confirmed at brightness parity OR rolled back to cross-billboard with the documented reason.
- RH grass coverage visually confirmed to extend to the slopes/shoreline (was the original Cycle 18 Phase 1 goal).
- OC grass coverage visually confirmed to extend to within ~10m of the safe radius.
- 3 OG cards + 4 cinematic videos shipped at v1.1.0 quality, post-octahedral.
- Site tagged `v1.1.0` on a deployment whose visuals have been verified.

## How to read this plan

This doc fixes the *shape* of the verification + polish work, **not the implementation choices**. Each phase is a tight loop with an explicit "if it doesn't look right, do X" branch.

Each agent picking up a phase should:

- **Reproduce the visual on actual hardware** before committing to a technique. The acceptance criteria here are perceptual, not numeric.
- **Pick the simplest thing that meets the budget** rather than the most impressive.
- **If a Cycle 18 fix doesn't visually verify, ROLL BACK to the cross-billboard / pre-Cycle-18 path and document why** — the fallback paths exist for this reason.

## Open questions to resolve before writing code

1. **Q1 — Octahedral impostor visual quality.** Does the Cycle 18 single-tile picker produce visible step at oblique camera moves (Free-fly mode circling a tree at 100m+)? **Author lean: probably yes — escalate to 3-tile blend (Q5(a) from Cycle 18 plan) only if step is unacceptable.** Single-tile picker stays the default.
2. **Q2 — OC grass perf budget.** Phase 1 of Cycle 18 expanded OC's chunk grid from 252m → 412m, multiplying total clumps by ~2x with the per-area rescale. **Author lean: confirm OC-Extreme on RTX 3070 stays > 60fps on classic camera at zoom-max.** If not, drop OC `clumpsPerChunk` from 2400 → 1800 (one-line edit in `shared/scenes/open-country.js`).
3. **Q3 — `v1.1.0` cinematic palette.** Which sun positions for the 4 cinematic videos? **Author lean: same as Cycle 16 plan — `dog-into-sunset` (sun 0.15), `lightning-strike` (sun 0.4), `chaos-5000` (sun 0.6), `oc-portal` (sun 0.85).**
4. **Q4 — Octahedral fallback policy.** If octahedral atlas bake fails on any production scene/device, the Cycle 18 code already falls back to cross-billboard. Should we add telemetry to track bake-failure rate? **Author lean: defer until v1.2 — current code already logs a console warn on failure, that's enough to diagnose if a user reports "trees look bad."**

## Architecture / shared changes

None this cycle. Pure visual verification + polish + hero-card capture.

## Phase 1 — Visual verification of Cycle 18 (~2-3hr, foundation)

**Independently testable.** Gate for everything else in this cycle.

1. **Boot each scene + each mode + each camera** on the dev workstation (RTX 3070):
   - Field × Classic, Field × Extreme.
   - Rolling Hills × Classic, Rolling Hills × Cooperative.
   - Open Country × Classic, Open Country × Cooperative.
   - Camera modes: Classic top-down, Follow chase, Free-fly.
2. **For Phase 1 (grass radius):**
   - RH zoom-max: confirm grass extends from centre to within ~10m of the island edge, climbing slopes. The pre-cycle-18 bug was thin grass on slopes; post-fix should be coherent meadow.
   - OC zoom-max: confirm grass extends past the woodszone clusters to the outer ring. Pre-fix was bare terrain past ~250m radius; post-fix should reach within ~10m of safe radius.
   - Field zoom-max: confirm byte-identical to pre-cycle-18 (sanity check).
3. **For Phase 3 (octahedral impostors):**
   - Free-fly to 100m+ from any tree. Octahedral kicks in at LOD2 (≥100m).
   - Test 4 sun positions: `?sun=0.0` (dawn), `?sun=0.25` (morning), `?sun=0.5` (noon), `?sun=0.75` (afternoon), `?sun=1.0` (dusk). Run each in a fresh tab.
   - For each sun position, compare live tree (close) vs impostor (far) brightness. Should be within ~10% perceptual delta. If significantly darker / brighter, document and consider tweaks to bake lighting.
   - Free-fly circle around a tree at 100m. Watch for visible azimuth-quadrant step (Q1). If very visible at typical camera moves, flag for Phase 4 escalation.
4. **For Phase 2 (state hygiene):**
   - Drive Field → RH → OC → Field swap matrix manually (URL-bar swap or in-game scene picker).
   - After each swap, look for floating/sunken rocks or mushrooms. Pre-fix: stale heightfield Y; post-fix: should sit on terrain.
   - Start Classic, finish/quit, start Extreme, quit, start Classic again. Confirm sheep respawn within boundary (no leftover positions outside the playArea).

**Acceptance:**
- All three Cycle 18 phases visually verified at acceptance per the plan's success criteria.
- OR a phase rolled back with a documented reason (in this cycle's close BACKLOG entry).
- Q1 + Q2 settled with concrete numbers.

## Phase 2 — Octahedral polish (optional, ~2-3hr)

**Depends on:** Phase 1 (only triggers if Phase 1 surfaces visible step or brightness parity miss).

Skip any sub-step that doesn't move the needle in Phase 1's playtest.

1. **3-tile blend** (Q5(a) from Cycle 18 plan). If single-tile picker shows visible step:
   - Modify [`js/octahedral-impostor-material.js`](../js/octahedral-impostor-material.js) vertex shader to compute 3 nearest tiles (current + ±1 col, or current + 1-tile-up + 1-tile-right) with barycentric weights based on within-tile fractional offset.
   - Pass 3 atlas UVs + 3 weights to fragment.
   - Fragment samples 3 tiles, blends weighted by alpha-aware mix.
   - Cost: 3× texture samples vs 1×. Budget allowance: ~3% perf hit on impostor-heavy scenes.
2. **Auxiliary normal-map atlas.** If brightness parity fails on oblique sun angles:
   - Extend `_bakeOctahedralImpostor` to render a second pass into a separate atlas with `MeshNormalMaterial` per tile (encodes view-space normal in RGB).
   - Pass normal atlas as `uNormalAtlas` uniform.
   - Fragment computes simple Lambert light with `uSunDirection` + decoded normal — gives per-pixel sun response on the impostor instead of a flat baked tint.
3. **32-angle bake** (8 azimuth × 4 elevation). If 16 angles still steps too much:
   - Bump `COLS = 8` in `_bakeOctahedralImpostor`.
   - Atlas grows to 2048×1024 (4 MB GPU per species, 12 MB total).
   - Verify perf-check stays green.

**Acceptance:** Visible step / brightness mismatch resolved, OR documented as not-worth-the-cost and reverted.

## Phase 3 — `v1.1.0` hero cards + tag (~3-4hr, keyboard session)

**Depends on:** Phase 1 (no point shooting cinematic videos on a build with broken impostors).

Carryover from Cycle 16 Phase 6. Playbook in [`cycle-16-phase-6-prep.md`](cycle-16-phase-6-prep.md).

1. **3 OG cards** (`og-rh-sunset`, `og-field`, `og-open-country`):
   - Open `https://sheepdogsim.com/?cinematic=1&scene=<id>&shot=og-<id>` in a real browser (Chrome).
   - Click Solo → Confirm Dog → Extreme Mode (so the impostor LOD2 ring is visible).
   - In DevTools: `await __sdsCinema.freeFly()` → fly to a hero pose → `__sdsCinema.snapshotPose()` → copy to clipboard.
   - Paste into [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs).
   - Run `npm run cinema -- --shot=og-rh-sunset` (etc.) to render the still.
   - Result: `assets/marketing/og/og-<scene>.webp` (1200×630).
2. **4 cinematic videos** per Q3 sun positions:
   - `dog-into-sunset`: ?sun=0.15
   - `lightning-strike`: ?sun=0.4 (RH cooperative)
   - `chaos-5000`: ?sun=0.6 (OC sandbox at 5000-sheep cap)
   - `oc-portal`: ?sun=0.85 (OC, end-game portal sequence)
   - Each: `npm run cinema -- --shot=<id>` after pose capture.
3. **Tag `v1.1.0`:**
   ```bash
   npm version 1.1.0 -m "Cycle 18 visual verification: octahedral impostors + RH/OC full-island grass"
   # Bump worker/package.json version field manually to match.
   # Append CHANGELOG.md entry.
   git push origin main --tags
   ```

**Hard stop on tagging:** confirm no LOD pop visible at typical play distances during the cinematic-video shoot. If popping shows, raise distances to 110m / 180m (one-line edit in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) `addLOD(billboardGeo, billboardMat, 100)` distance). Re-shoot if the change moved.

## Dependencies

```
Phase 1 (verification) → Phase 2 (polish, optional) → Phase 3 (v1.1.0)
```

Phase 1 gates everything. Phase 2 only triggers if Phase 1 surfaces visible defects. Phase 3 happens after Phase 1 + 2 land.

## Frozen files (cycle-specific additions)

- (None new this cycle — pure visual verification + polish on existing surfaces.)

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure that you don't understand — don't regenerate fixtures, escalate.
3. Visual regression on a previously-passing scene — fix or revert before adding new scope.
4. Frametime regression > 5% on `perf-check` — diagnose before adding new scope.
5. Phase 1 surfaces a Cycle 18 phase that doesn't visually verify → roll back the offending Cycle 18 commit (or revert to cross-billboard for Phase 3) and document why. **DO NOT** ship a `v1.1.0` tag on a build with known visual regressions.
6. `v1.1.0` tag on a deployment that hasn't passed Phase 1's visual verification.

## What NOT to do during this cycle

- **Don't try to "improve" Cycle 18's octahedral pipeline beyond Phase 4 polish list.** Build-time bake / alternative impostor schemes (TSL/WebGPU port) are their own future cycles.
- **Don't re-bake tree GLBs.** The bake is good per Cycle 16's gallery review. New visual issues on impostors should be solved at the runtime atlas layer, not by re-baking trees.
- **Don't reintroduce LOD1 mid-tier.** Cycle 17 followup `bb922fb` reverted it for cause (visible quality cliff per Matt's gallery review). LOD0 → octahedral at 100m is the durable shape.
- **Don't migrate to TSL/WebGPU.** Still its own cycle.
- **Don't rebuild perf baseline as a casual one-liner.** The Cycle 16 baseline is the pin; if perf-check fires, diagnose before re-baselining.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] Phase 1 — Cycle 18 phases visually verified on RTX 3070 across all three scenes + four sun positions, OR rolled back with documented reason.
- [ ] Phase 2 — octahedral polish landed if Phase 1 surfaced visible defects, OR explicitly skipped because Phase 1 looked good.
- [ ] Phase 3 — 3 OG cards + 4 cinematic videos + `v1.1.0` tag pushed.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] `perf-check` CI job green vs the committed Linux baseline.
- [ ] Live on sheepdogsim.com via GH Actions at the cycle-close push commit.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/cycle-16-phase-6-prep.md`](cycle-16-phase-6-prep.md) — `v1.1.0` hero cards + cinematic playbook
- [`docs/archive/cycles/cycle-18-plan.md`](archive/cycles/cycle-18-plan.md) — Cycle 18 plan being verified
- [Brucks octahedral impostors](https://shaderbits.com/blog/octahedral-impostors) — reference for Phase 2 polish
