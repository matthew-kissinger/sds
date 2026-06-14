# Next Session - Cycle 96 open (visual-queue-and-polish)

> **Updated:** 2026-06-14
> **For:** Cycle 96 (`docs/cycle-96-plan.md`)
> **Pickup priority:** Run the paired Phase 1 (review the shipped NSL look, folding in your open Cycle 95 prod validation, then record the gating decisions in `DECISIONS.md`). The autonomous slice already landed; Phase 1 unblocks the rest.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-96-plan.md`](docs/cycle-96-plan.md) -> `git log --oneline -10` -> [`docs/BACKLOG.md`](docs/BACKLOG.md). Cycle 95 (`newsheepdogland-fixes`) just closed and shipped to prod; its entry is at the top of BACKLOG.

## Where It Stands

**Cycle 95 closed and deployed** (`5f4d357c`, deploy green). Six NSL playtest bugs fixed: impostor stall on re-entry (A), foliage blanking facing one way (B), bark audio/visual sync (D), leaf grazing white (E, roughness-first), and a first-run Survival explainer (F). 1535 vitest / build / lint green. No version bump (still 2.3.4); cut a release explicitly if the prod look is good.

**Matt's prod validation is the open loop on Cycle 95.** On the live NSL build, confirm:
- A: refresh NSL and cycle scenes - trees stream to LOD0, no permanent-impostor stall.
- B: face all four directions at the homestead - foliage holds (no whole-mesh blank).
- C: after a scene swap into gameplay - camera is seated on the dog (only a concern if it looks stale; no code change shipped for C).
- E: dusk canopy - leaves read as colored foliage, not white. If white persists, escalate to `MeshPhysicalNodeMaterial` + grazing-faded specular (perf-gated) per the archived plan Phase 4.
- D: bark animation + sound fire together; passive herding bark animates.
- F: first Survival run on NSL shows the loop explainer once; the copy in `js/components/GameHUD/SurvivalIntro.js` is inline for easy editing.

## Cycle 96 pickup

`docs/cycle-96-plan.md` now holds the adopted `visual-queue-and-polish` content (the authored cycle-93 draft folded in at this number; the dead "93" file was removed). The autonomous slice ran ahead of the paired gate: NSL jitter rail, rock collider-parity harness, ARCHITECTURE/AGENTS freshness sweep, and the three r185 readiness verdict (r185 is not on npm yet - latest 0.184.0, so Phase 3 is blocked upstream).

**The gate is the paired Phase 1** (see the plan): review the shipped NSL look (folding in your open Cycle 95 prod validation), then record in `DECISIONS.md` the look-approval, NSL-as-default verdict (Q1), rock/KTX2 verdicts, and trailer disposition. Those unblock golden re-capture (Phase 2), rock re-bake (Phase 5), KTX2 (Phase 6), and the trailer (Phase 7). The prep pack is in `cycle96-validation/phase1-prep.md`.

## Standing carryover (do not drop during cleanup)

- **Owner intake (2026-06-12):** `docs/BACKLOG.md` Distant ideas holds Matt's owner-interest note for NPC sheepdogs as a near-term cycle candidate. It needs an approach proposal for Matt before any dispatch.
- **Matt review queue:** impostor trunk-split A/B (`cycle92-validation/impostor-ab.png`); new NSL look on the live site (Cycle 91/92 surveys); launch posting from `docs/launch/` (Matt's voice); S24+ device pass (standing).
- **NSL-as-default-world** product decision is still open (pill is off; default is still Rolling Hills).
- **Survival onboarding translation** (es/ja/pt/zh-CN) once the English copy is locked.
