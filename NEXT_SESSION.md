# Next Session - Cycle 102 (impostor-ktx2-and-polish)

> **Updated:** 2026-06-15
> **For:** Cycle 102 (`docs/cycle-102-plan.md`)
> **Pickup priority:** The cycle-102 plan is a stub. Author Goal + Phases at `/cycle-start`. The thread is set: KTX2 wire-encode the new octahedral atlas (deferred from Cycle 101 Phase 4), fold in far-impostor polish, and run the carried-over GPU-bound Cycle 101 validation (SSIM A/B + jitter rails).

## First action: author the plan, then run the carried-over validation

Cycle 101 shipped the view-dependent relit far-tree impostor (octahedral, in-shader, relit) on the NSL consolidated cull path and extended the far band to Rolling Hills + Open Country, but two things are open and seed this cycle:

1. **KTX2 wire-encode the octahedral atlas** (the headline Cycle 102 goal). The octahedral atlas ships as lossless `.png` today; the UASTC encode was deferred from Phase 4 so it would not be conflated with the new material as an unvalidated variable. Extend `tools/encode-impostors-ktx2.mjs` past its `LIVE_LAYOUT` (latlon-only) constant, make `MAPS` aux-layer-aware (albedo + normal, no depth), and extend the dist `.png` dedup in `vite.config.js` into the `octahedral/` subdir. Mirror the Cycle 98/99 KTX2 pattern.
2. **The GPU-bound Cycle 101 validation** (paired/on-device, because this box has no headless WebGPU - measured, `cycle101-validation/webgpu-availability-check.mjs` reads `hasGpu: false`). Run the settled SSIM A/B (impostor vs LOD0 across a yaw sweep, on NSL + Rolling Hills + Open Country) and the warm jitter rails (`npm run perf:jitter:nsl -- --check=1` within the Cycle 96 budget, plus RH/OC). Full runbook + the cycle90 noise-floor method in `cycle101-validation/phase6-validation-notes.md`. A `?forceTreeLod0=1` reference toggle is the clean way to do the A/B (small render-code add).

## What Cycle 101 left in place (the new impostor path)

- **The material:** `createWebGpuConsolidatedTreeImpostorMaterial` in `js/webgpuKilnImpostorNodeMaterial.js` - in-shader octahedral (MeshBasicNodeMaterial + TSL), reads the instance matrix from the cull's compacted storage buffer by `instanceIndex` (a `vertexNode` bypassing InstanceNode's auto-transform), 4-tile bilinear blend over albedo + capture-view normal, relit via the existing `setImpostorTint` uniforms.
- **The wiring:** `treeComputeCull.js` takes a `materialFactory`; `TreePlacement.js` loads the octahedral atlas + builds a directions DataTexture + arms the band. NSL arms from `foliageStreaming` (cold-coverage continuation); the all-cold islands arm from `armAllColdFarImpostors` off the cold registry, gated on no `streamedZones` (no double-enable) and `hwTier !== 'low'` (low tier keeps meshopt LOD1).
- **The gate:** `usesConsolidatedTreeCull(sceneDef)` (coastline || island) - Home Field (rect) stays per-chunk. Gates on the structural boundary kind, not a scene id.
- **Latlon is NOT vestigial:** it still feeds the cold coverage + the canopy shadow caster. Far impostors never cast shadows.
- **The fold-seam note:** `selectOctahedralImpostorTiles` round-trips the baked directions 54/64 - exact for the upper hemisphere + equator (gameplay views), off-by-one only at the steep-down fold seam (10 bottom tiles), bounded to a neighbor shift inside the 4-tile blend. Confirm in the paired A/B.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-102-plan.md`](docs/cycle-102-plan.md) -> `cycle101-validation/phase6-validation-notes.md` (the carried validation runbook) -> `.claude/rules/scene-and-render.md` (foliage LOD, far-tree impostors, no-far-impostor-shadow, scene-def-flag rule) -> [`docs/BACKLOG.md`](docs/BACKLOG.md) (Cycle 101 + 100 + 99 entries) -> `git log --oneline -6`.

## Where it stands

**Cycle 101 (`impostor-bake-repass`) closed.** 5/7 phases shipped (Phases 1-5 + Phase 6 acceptance #3); the SSIM A/B + jitter rails + the paired visual close carry to Cycle 102. 1557 vitest / lint / build green; no version bump (still 2.3.4). The far-tree impostor is now view-dependent + relit on NSL and the islands, re-baked octahedral with pixel-forge v0.2.0 Kiln. Details in `docs/BACKLOG.md`.

## Standing carryover (do not drop)

- **itch/native terrain wire win** - Cycle 100 scoped the terrain compression win to Cloudflare Pages; an explicit-decode (`DecompressionStream`) path would cover itch/native if measured worth it.
- **Golden harness staleness (test-infra)** - `tools/validation/golden/` no longer reproduces against the current capture environment. Re-baseline under the canonical environment or gate the capture on a deterministic scene-settled signal. Not the impostor gate.
- **Paired launch session** - NSL-as-default-world (still Rolling Hills), version bump, itch/devlog/social posting (Matt's voice), S24+ device pass.
- **three r185** blocked until it publishes (latest 0.184.0); checklist `cycle96-validation/r185-readiness.md`.
- **Rock re-bake** behind the Cycle 96 collider-parity harness; needs a design direction.
- **Matt's Cycle 95 prod validation** (A/B/C/E/D/F) - if prod shows a rejected element, re-capture the affected goldens.
- **Survival onboarding translation** (es/ja/pt/zh-CN) once the English copy locks.
- **NPC-sheepdogs** owner intake - needs an approach proposal before dispatch.
