# Next Session - Cycle 105 (golden-determinism-and-launch-prep)

> **Updated:** 2026-06-16
> **For:** Cycle 105 (`docs/cycle-105-plan.md`)
> **Pickup priority:** Cycle 104 is CLOSED and shipped. Cycle 105 is scaffolded but NOT authored - run `/cycle-start` to fill the Goal + phases with Matt. Two threads seed it: **golden determinism** (a deterministic fixed-dt sim-step affordance to restore the dropped follow-cell goldens) and **launch prep** (the NSL re-enable burn-down, then NSL-as-default, version bump, itch/devlog/social in Matt's voice, S24+ device pass). NSL stays entrance-off until its re-enable bar (`docs/nsl-burndown.md`) clears on-device.

## First action

**Run `/cycle-start`** to author Cycle 105. The plan ([`docs/cycle-105-plan.md`](docs/cycle-105-plan.md)) is a template stub with seeded Open Questions (Q1 sim-step shape, Q2 launch-prep staging) and a carryover-fed Goal placeholder - it needs the one-paragraph Goal + EARS phases before any code. Don't start phases until that's done with Matt.

## What Cycle 104 shipped (just closed, 2026-06-16)

`impostor-and-nsl-burndown`, 5/5 phases, all deployed on `main`:

- **Home Field far impostors (P2).** A new optional `consolidatedTrees` SceneDef flag (Option B) gives Home Field the islands' consolidated cull + far-impostor band. On-device confirmed: boots `webgpu-production`, 268 far instances. Stops the per-chunk LOD0 draw thrash on the distant treeline.
- **Principled impostor sun (P3).** `brightness=6` retired to `LEAF_SUN_INTENSITY (1.1*PI) × IMPOSTOR_CANOPY_RESIDUAL (1.74)`, the intensity sourced from the same production bridge directional the LOD0 leaf gets. Look preserved within ~0.2%; parity spec green.
- **Harness runtime layer (P1).** `scene-render-path-map.mjs --runtime` confirms on-device that the predicted render path materialized (boot-gate + impostor presence; structural-only, no timing). `SDS_RUNTIME_SCENES` scopes it; the ship probe skips NSL.
- **NSL diagnosis (P4).** `docs/nsl-burndown.md` - four regression classes + an EARS re-enable bar. No NSL code touched (Q3 = diagnose only).
- **On-device sign-off (P5).** field/rolling-hills/open-country all bootGate=pass with far impostors (268/61/204). Hard stops 1+2 cleared.

1584 vitest / build green; no version bump (still 2.3.4). Full entry: [`docs/BACKLOG.md`](docs/BACKLOG.md) Cycle 104.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-105-plan.md`](docs/cycle-105-plan.md) (after `/cycle-start` authoring) -> [`docs/BACKLOG.md`](docs/BACKLOG.md) (Cycle 104 + prior) -> `git log --oneline -8` -> [`AGENTS.md`](AGENTS.md) + [`CLAUDE.md`](CLAUDE.md).

## Standing carryover (do not drop)

- **NSL regression fix + re-enable** - the live-symptom capture against the four `docs/nsl-burndown.md` classes is the first task; the entrance re-enable restores `comingSoon` + multiplayer `SCENE_ORDER` + the skipped player-flow E2E in one change, gated on the re-enable bar. Likely its own pass before launch-as-default.
- **Subjective impostor look A/B** - the carried Cycle 101 impostor-vs-LOD0 SSIM A/B across a yaw sweep (now tractable with the WebGPU harness) + Matt's eyeball of Home Field's new far trees and the islands post-sun-fix. Paired, de-risked (islands preserved, Home Field net-new).
- **Deterministic fixed-dt sim-step affordance** - restore the follow-cell goldens (Cycle 103 P5; the golden gate is classic-only / 6 cells without it). Seeds Q1.
- **tree1 256px octahedral bake fix** in pixel-forge (ortho/scale bug at 256px tiles) if 256 is ever wanted.
- **Paired launch session** - NSL-as-default-world (still Rolling Hills today), version bump, itch/devlog/social posting (Matt's voice), S24+ device pass.
- **itch/native terrain wire win** - Cycle 100 scoped terrain compression to Cloudflare Pages; an explicit-decode (`DecompressionStream`) path would cover itch/native if measured worth it.
- **three r185** blocked until it publishes (latest 0.184.0); checklist `cycle96-validation/r185-readiness.md`.
- **Rock re-bake** behind the Cycle 96 collider-parity harness; needs a design direction.
- **Matt's Cycle 95 prod validation** (A/B/C/E/D/F) - if prod shows a rejected element, re-capture the affected goldens.
- **Survival onboarding translation** (es/ja/pt/zh-CN) once the English copy locks.
- **NPC-sheepdogs** owner intake - needs an approach proposal before dispatch.
