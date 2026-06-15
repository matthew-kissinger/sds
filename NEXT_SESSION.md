# Next Session - Cycle 103 (golden-harness-rebaseline)

> **Updated:** 2026-06-15
> **For:** Cycle 103 (`docs/cycle-103-plan.md`)
> **Pickup priority:** The cycle-103 plan is a stub. Author Goal + Phases at `/cycle-start`. The thread is set: re-baseline the stale golden suite so it is a trustworthy render gate again, and fold in the paired impostor validation carried from Cycles 101-102 (the settled SSIM A/Bs + the warm jitter rails on Matt's WebGPU box).

## First action: author the plan, then run the carried impostor validation

Cycle 102 shipped the octahedral KTX2 wire-encode (Phases 1-3, autonomous). Two threads seed Cycle 103:

1. **Re-baseline the golden harness** (the headline). `tools/validation/golden/` is stale - it diffs near-zero SSIM against the current capture environment (Cycle 91 reframed the follow camera, Cycles 92/101 changed the impostors), so it no longer reproduces and cannot gate a render change. Cycles 99 and 101 both fell back to seeded same-build A/Bs because the committed goldens add a confound, not a signal. Re-pin the 12-cell suite under the canonical environment (or gate capture on a deterministic scene-settled signal so a single headless frame is reproducible). Add NSL to the matrix only if its streamed foliage can be settled deterministically (Cycle 97 left it out for exactly this reason).
2. **The paired impostor validation** (carried from Cycles 101-102, paired/on-device - this box has no headless WebGPU, measured `cycle101-validation/webgpu-availability-check.mjs` reads `hasGpu:false`). On Matt's box: (a) the octahedral **ktx2-vs-png** SSIM A/B (force-png arm = move the octahedral `.ktx2` aside in dist so `loadImpostorTexture` falls back; bar = the Cycle 99 latlon ~0.99); (b) the carried Cycle 101 **impostor-vs-LOD0** A/B across a yaw sweep on NSL + Rolling Hills + Open Country (add a `?forceTreeLod0=1` reference toggle first - a small render-code add); (c) the **warm jitter rails** (`npm run perf:jitter:nsl -- --check=1` within the Cycle 96 budget, plus RH/OC via `perf:jitter --scene=`); (d) confirm the 54/64 octahedral fold-seam reads clean. Runbook + the cycle90 noise-floor method: `cycle101-validation/phase6-validation-notes.md`.

## What Cycle 102 left in place (the octahedral KTX2 path)

- **The encode:** `tools/encode-impostors-ktx2.mjs` transcodes every impostor-enabled target (no more latlon-only filter), deriving the map set from each layout's `auxLayers` (latlon: albedo + normal + depth; octahedral: albedo + normal, no depth). Re-running it is byte-stable on the latlon set.
- **The wire:** `vite.config.js` drops each impostor `.png` whose `.ktx2` sibling exists, now in both the latlon dir and the `octahedral/` subdir. Dist ships the octahedral `.ktx2` + sidecar `.json`, 0 octahedral `.png`. -1.10 MiB off the wire (ktx2 at 36% of png) + the VRAM win.
- **The guard:** `tests/impostor-ktx2-parity.spec.js` fails if any enabled target is missing its full `.ktx2` set (albedo + each `auxLayers` layer) - shares the preset-derived layer list with `objects-impostor-parity.spec.js` so they can't drift.
- **The runtime needed no change:** `loadOctahedralImpostorAtlas` already loads via `loadImpostorTexture` (prefers `.ktx2`, falls back to `.png`). Revert path if the paired A/B ever regresses: revert the `vite.config.js` octahedral-drop hunk (PNGs back in dist).

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-103-plan.md`](docs/cycle-103-plan.md) -> `cycle101-validation/phase6-validation-notes.md` (the carried impostor-validation runbook) -> `tools/validation/golden/MANIFEST.md` (the golden suite's last re-pin, Cycle 97) -> [`docs/BACKLOG.md`](docs/BACKLOG.md) (Cycle 102 + 101 + 99 entries) -> `git log --oneline -6`.

## Where it stands

**Cycle 102 (`impostor-ktx2-and-polish`) closed.** Phases 1-3 shipped (octahedral KTX2 encode + dist drop + parity guard); Phase 4 (the paired SSIM A/B + jitter rails) carries forward, GPU-bound. 1562 vitest / lint / build green; no version bump (still 2.3.4). The octahedral far-impostor atlas now ships as UASTC `.ktx2`, -1.10 MiB off the wire. Details in `docs/BACKLOG.md`.

## Standing carryover (do not drop)

- **The paired impostor validation** - the headline carryover above. It has been open since Cycle 101 because this box has no headless WebGPU.
- **itch/native terrain wire win** - Cycle 100 scoped the terrain compression win to Cloudflare Pages; an explicit-decode (`DecompressionStream`) path would cover itch/native if measured worth it.
- **Paired launch session** - NSL-as-default-world (still Rolling Hills), version bump, itch/devlog/social posting (Matt's voice), S24+ device pass.
- **three r185** blocked until it publishes (latest 0.184.0); checklist `cycle96-validation/r185-readiness.md`.
- **Rock re-bake** behind the Cycle 96 collider-parity harness; needs a design direction.
- **Matt's Cycle 95 prod validation** (A/B/C/E/D/F) - if prod shows a rejected element, re-capture the affected goldens.
- **Survival onboarding translation** (es/ja/pt/zh-CN) once the English copy locks.
- **NPC-sheepdogs** owner intake - needs an approach proposal before dispatch.
