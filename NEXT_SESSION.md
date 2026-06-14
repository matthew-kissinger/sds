# Next Session - Cycle 97 (visual-queue-and-polish, paired remainder)

> **Updated:** 2026-06-14
> **For:** Cycle 97 (`docs/cycle-97-plan.md`)
> **Pickup priority:** Run the paired Phase 1 visual review + decision gate (prep pack staged at `cycle96-validation/phase1-prep.md`); recording the decisions in `DECISIONS.md` unblocks goldens, rock re-bake, KTX2, and launch.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-97-plan.md`](docs/cycle-97-plan.md) -> the archived [`docs/archive/cycles/cycle-96-plan.md`](docs/archive/cycles/cycle-96-plan.md) (the authored visual-queue shape) -> `git log --oneline -10` -> [`docs/BACKLOG.md`](docs/BACKLOG.md). Cycle 96 just closed; its entry is at the top of BACKLOG.

## Where It Stands

**Cycle 96 closed and shipped its autonomous slice** (`a987105b` + close commit): the NSL jitter rail (`npm run perf:jitter:nsl`), the rock collider-parity harness, the three r185 readiness verdict (blocked upstream), and an ARCHITECTURE/AGENTS doc sweep. 1541 vitest / build / lint green. No version bump (still 2.3.4); nothing player-visible shipped.

**Cycle 97 is the paired remainder of the visual-queue-drain.** It needs Matt's hands. The gate is the paired Phase 1:

- Review the shipped look: `cycle91-validation/asset-survey/`, `lighting-survey/`, `cycle92-validation/impostor-ab.png`, and the live pill-less NSL on sheepdogsim.com.
- Fold in the open Cycle 95 prod validation (A/B/C/E/D/F on the live NSL build).
- Record in `DECISIONS.md`: look approval, NSL-as-default (Q1), rock re-bake direction + KTX2 go/no-go, `tools/trailer/` disposition, P8 lighting appetite.

Those decisions unblock golden re-capture (Phase 2), rock re-bake (Phase 5, behind the Cycle 96 collider-parity harness), KTX2 (Phase 6), and the launch + S24+ device pass (Phase 8). three r185 (Phase 3) stays blocked until it publishes (latest 0.184.0); checklist in `cycle96-validation/r185-readiness.md`.

## Standing carryover (do not drop during cleanup)

- **Matt's Cycle 95 prod validation** - A: streams to LOD0 on re-entry; B: foliage holds facing any direction; C: camera after a swap; E: no dusk leaf-white; D: bark cadence; F: Survival explainer. Any residual is a fast-follow (E can escalate to `MeshPhysicalNodeMaterial` + grazing-faded specular, perf-gated).
- **Owner intake (2026-06-12):** NPC sheepdogs as a near-term cycle candidate (needs an approach proposal before dispatch) - `docs/BACKLOG.md` Distant ideas.
- **Survival onboarding translation** (es/ja/pt/zh-CN) once the English copy is locked.
- **NSL-as-default-world** product decision still open (pill off; default still Rolling Hills).
