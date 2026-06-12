# Next Session - Cycle 93 intake (visual-queue-and-polish)

> **Updated:** 2026-06-12
> **For:** Cycle 93 (`docs/cycle-93-plan.md`, authored - run /cycle-start)
> **Pickup priority:** Matt reviews the visual queue (Cycle 91 tree remake / canopy shadows / ground noise / wolf gradient surveys, plus Cycle 92's impostor trunk-split A/B at `cycle92-validation/impostor-ab.png`), the Cycle 93 plan is authored (Phase 1 is that paired review session); run `/cycle-start` to begin.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-93-plan.md`](docs/cycle-93-plan.md) (scaffold) -> [`docs/BACKLOG.md`](docs/BACKLOG.md) Cycle 92 entry -> `git log --oneline -10`.

## Where It Stands

**Cycle 92 closed 2026-06-11** (plan archived at `docs/archive/cycles/cycle-92-plan.md`). Shipped autonomously end-to-end: the NSL frame floor was three r184's shadow pass re-keying every caster every frame (shared override material `alphaTest` version churn, 4.6-7.7 GB garbage per 30s run). One instance-level accessor fix dropped churn 92% and lifted NSL mean 1%-low from 70.9/54.8 to 133-137. The impostor trunk-split Matt reported was root-caused (kiln bakes center on the bbox, not the trunk) and fixed with a per-quad in-plane shift.

**Cycle 94 closed 2026-06-12** (plan archived at `docs/archive/cycles/cycle-94-plan.md`). This was a narrow bark hotfix from Matt's mobile/PC playtest feedback, shipped as `v2.3.1` with a `v2.3.2` cue-timing follow-up: bark now steers sheep through bounded acceleration, not direct velocity injection, and desktop play has a dismissible `Bark Space` cue after the loading handoff while mobile keeps the visible bark button. Cycle 93 still remains the next planned visual-queue cycle unless Matt retargets it.

**The Experimental (WIP) pill is OFF Newsheepdogland.** The bracketed gate (control/gate/control, controls must agree within 10%) passed in a valid window: controls 140.4/139.4 (0.7% drift), gate mean 1%-low 137.2, worst 20.9ms vs the 55/45ms bar. Rolling Hills remains the default entrance world - promoting NSL to default is a separate product decision for Matt.

**Numbers at close:** NSL driven survival mean 1%-low 133-140 (vsync median 143); hitch rate ~2 per 30s (was ~514); field rail PASS; 1525 vitest green; the >= 100ms stall class is environment-attributed (1006.8ms frame with zero longtasks and a healthy box - GPU/driver/compositor, not page JS).

**Verify after this close's push:** the deploy run on `main` (the close commit's GH Actions run) should be green - the cycle-92 Success criteria line for it was left to post-push verification.

## Cycle 93 intake candidates (from BACKLOG carryover)

1. Matt review queue first: Cycle 91 visual surveys + Cycle 92 trunk-split A/B, then the golden re-capture (stale since 2026-05-16).
2. P8 lighting items: keyframed hemisphere ambient (survey-gated), sky-dome render-order A/B.
3. Rock re-bake behind a collider-parity harness; KTX2 textures pending visual approval.
4. Optional NSL jitter rail budgeted near the new 120-140 floor (so a regression to 70 cannot ship silently).
5. NSL-as-default-world product decision (pill is off; default is still Rolling Hills).

## New playtest feedback captured 2026-06-12

Matt reported that bark feels incorrectly implemented on mobile and PC: it instantly pushes sheep instead of changing their direction and letting them accelerate under normal sheep movement limits. Desktop also lacks an in-game bark hint. Resolved by Cycle 94, archived at [`docs/archive/cycles/cycle-94-plan.md`](docs/archive/cycles/cycle-94-plan.md). Do not reopen this inside Cycle 93 unless Matt reports a new bark feel issue after playtesting `v2.3.2`.

## Owner intake captured 2026-06-12

`docs/BACKLOG.md` Distant ideas includes Matt's owner-interest note for NPC sheepdogs as a near-term cycle candidate. Do not remove it during cleanup, push, or deploy work; it requires an approach proposal for Matt's review before any dispatch.

## Matt review queue

- Impostor trunk-split fix: `cycle92-validation/impostor-ab.png` (pre-fix splayed trunks vs fixed converging trunk).
- New NSL look on the live site (pill now off): tree remake, canopy shadows, value-noise ground, wolf gradient. Surveys: `cycle91-validation/asset-survey/`, `cycle91-validation/lighting-survey/`; numbers: `cycle91-validation/REPORT.md` + `cycle92-validation/REPORT.md`.
- Launch posting from `docs/launch/` (drafts ready, Matt's voice).
- S24+ device pass (standing).
