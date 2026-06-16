# Next Session - Cycle 104 (impostor-and-nsl-burndown)

> **Updated:** 2026-06-16
> **For:** Cycle 104 (`docs/cycle-104-plan.md`)
> **Pickup priority:** Cycle 104 is authored as the burn-down (re-scoped from the golden-determinism stub, which slid to Cycle 105). DRAFT pending Matt's react to `docs/cycle-104-plan.md`. Scope: Home Field far-impostor fix (Q1 = Option A vs B), retire the `brightness=6` impostor-sun magic (Q2), diagnose + bound the NSL regression (Q3, no fixes), build the harness on-device runtime-confirmation layer. Phases 1-4 are autonomous + GPU-free; Phase 5 is paired + GPU-gated (waits for the concurrent perf effort to free the RTX 3070). Do not add perf/timing to the harness.

## First action

React to `docs/cycle-104-plan.md` (Q1/Q2/Q3 + phase shape). Once confirmed, start Phase 1 (harness runtime-confirmation layer, autonomous). Do not start the impostor enable/look work until the Phase 5 paired on-device gate.

## What Cycle 103 shipped (just closed)

Proper impostors + a WebGPU-capturing golden harness. Five phases landed autonomously:

- **P3 fold-seam:** `selectOctahedralImpostorTiles` + its in-shader mirror fixed from vertex- to cell-centering; 64/64 round-trip (was 54/64). Gate: `tests/impostor-octahedral-roundtrip.spec.js`.
- **P2 shared lighting rig:** `js/world/foliageLightingRig.js` is the single foliage-lighting authority; the impostor is calibrated to the LOD0 PBR leaf (wrap/fresnel/subsurface/floor magic retired); both impostor relight paths collapse to one builder; the LOD0 leaf look is unchanged. Gate: `tests/foliage-lighting-rig-parity.spec.js` (1e-9 parity). The one reserved canopy knob is `FOLIAGE_RIG.directWrap` (0 = PBR match).
- **P1 WebGPU harness:** `tools/validation/screenshot-golden.mjs` now captures the real WebGPU path (installed Chrome, headed) and fails closed on WebGL demotion (`assertWebGpuEngaged`). The prior "WebGPU" goldens were silently WebGL.
- **P4 resolution:** keep 128px - the 256px re-bake breaks (tree1 bakes blank, a pixel-forge bug).
- **P5 rebaseline:** genuine-WebGPU classic-only deterministic gate, `--diff` 6/6 (mean 0.988); follow cells dropped (non-deterministic - see carryover #1).

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-104-plan.md`](docs/cycle-104-plan.md) (once its Goal is filled) -> [`docs/BACKLOG.md`](docs/BACKLOG.md) (Cycle 103 + prior entries) -> `git log --oneline -6` -> [`AGENTS.md`](AGENTS.md) + [`CLAUDE.md`](CLAUDE.md).

## Standing carryover (do not drop)

- **Deterministic fixed-dt sim-step affordance** - restore the follow-cell goldens (Cycle 103 P5; the gate is classic-only without it).
- **tree1 256px octahedral bake fix** in pixel-forge (ortho/scale at 256px tiles) if 256 is ever wanted.
- **Paired impostor validation** (carried Cycle 101/102) - impostor-vs-LOD0 SSIM A/B across a yaw sweep on NSL/RH/OC + warm jitter rails within the Cycle 96 budget; now tractable on-device with the WebGPU harness.
- **Paired launch session** - NSL-as-default-world (still Rolling Hills), version bump, itch/devlog/social posting (Matt's voice), S24+ device pass.
- **itch/native terrain wire win** - Cycle 100 scoped the terrain compression to Cloudflare Pages; an explicit-decode (`DecompressionStream`) path would cover itch/native if measured worth it.
- **three r185** blocked until it publishes (latest 0.184.0); checklist `cycle96-validation/r185-readiness.md`.
- **Rock re-bake** behind the Cycle 96 collider-parity harness; needs a design direction.
- **Matt's Cycle 95 prod validation** (A/B/C/E/D/F) - if prod shows a rejected element, re-capture the affected goldens.
- **Survival onboarding translation** (es/ja/pt/zh-CN) once the English copy locks.
- **NPC-sheepdogs** owner intake - needs an approach proposal before dispatch.
