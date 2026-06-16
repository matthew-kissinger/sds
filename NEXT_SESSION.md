# Next Session - Cycle 104 (impostor-and-nsl-burndown)

> **Updated:** 2026-06-16
> **For:** Cycle 104 (`docs/cycle-104-plan.md`)
> **Pickup priority:** Cycle 104 (impostor-and-nsl-burndown) is mid-flight; Phases 1-4 are CODE COMPLETE and only Phase 5 (paired, on-device) remains. P1 (harness runtime-confirmation layer) + P4 (NSL diagnosis doc) shipped + DEPLOYED tonight (inert). P2 (Home Field gets far impostors via the `consolidatedTrees` flag, Option B) + P3 (retire `brightness=6` -> leaf-sun-intensity x residual) are CODE COMPLETE but committed LOCAL (unpushed) and HELD off prod: they flip live render and need the P5 on-device boot-gate + look sign-off (hard stops 1+2), which needs Matt + the RTX 3070 (the concurrent perf effort owns it). Do not push the held P2+P3 commits until P5 verifies on-device.

## First action

**Phase 5 (paired, on-device).** With the GPU free, run `node tools/validation/scene-render-path-map.mjs --runtime` against a dev server: confirm Home Field boots `webgpu-production` (no `production-webgpu-gates-failed`) with far impostors present. Then the impostor-vs-LOD0 SSIM A/B on field/rolling-hills/open-country (dial `IMPOSTOR_CANOPY_RESIDUAL` via `__tuneImpostor` if the islands read off after the sun change), sign off the look, and `git push` the held P2+P3 commits to deploy. P5 acceptance + hard stops are in `docs/cycle-104-plan.md`.

## What Cycle 104 has shipped (P1-P4)

- **P1 (deployed):** the render-path map's on-device runtime-confirmation layer (`scene-render-path-map.mjs --runtime`) - boot-gate + impostor-presence, structural-only, no timing. `deriveRuntimeRow` unit-tested 5 ways.
- **P2 (held local, unpushed):** the `consolidatedTrees` SceneDef flag (Option B) gives Home Field the islands' consolidated cull + far-impostor band. Spike confirmed the all-cold arm path (`TreePlacement.js:887`) already supports it; the static map now shows `field` cull=Y farImp=Y. Flips live render -> held for P5.
- **P3 (held local, unpushed):** `brightness=6` retired to `LEAF_SUN_INTENSITY (1.1*PI) x IMPOSTOR_CANOPY_RESIDUAL (1.74)`, the intensity sourced from the bridge directional. Look preserved (product ~= 6); held for P5 dial-in.
- **P4 (deployed):** `docs/nsl-burndown.md` - NSL diagnosis + EARS re-enable bar, no NSL code touched (Q3).

1584 vitest green, build clean. The P2 + P3 commits are unpushed local on `main`; everything else is deployed.

## Cycle 105 (next): golden-determinism-and-launch-prep

The 104 stub's original theme slid here. Carryover candidates: the deterministic fixed-dt sim-step affordance (restore the follow-cell goldens), the paired launch session (NSL-as-default once the burn-down clears, version bump, itch/devlog/social, S24+ device pass), tree1 256px bake fix.

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
