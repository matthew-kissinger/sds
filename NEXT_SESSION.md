# Next Session - Cycle 98 (launch-and-ktx2)

> **Updated:** 2026-06-14
> **For:** Cycle 98 (`docs/cycle-98-plan.md`)
> **Pickup priority:** Two concrete teed-up tracks: the greenlit KTX2 integration (spec ready at `cycle97-validation/ktx2-readiness.md`) and the paired product + launch session (NSL-as-default, version bump, posting, S24+ pass). Pick the cycle's coherent goal at `/cycle-start`, or pivot to the NPC-sheepdogs intake.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-98-plan.md`](docs/cycle-98-plan.md) -> [`docs/BACKLOG.md`](docs/BACKLOG.md) (Cycle 97 entry at the top) -> `git log --oneline -10`. The visual-queue (Cycles 96-97) is drained to its product, paired, and upstream-blocked remainder; Cycle 98 is where those land.

## Where It Stands

**Cycle 97 closed and shipped its autonomous slice** (`50ee362e`): the golden suite re-baselined to the current shipped look (with a `GrassSystem` capture-determinism fix so the suite no longer flakes), and a measured KTX2 go/no-go (GO on merits, integration spec ready). 1541 vitest / lint / build green. No version bump (still 2.3.4); nothing player-visible. Matt's directive was "complete autonomously and ship - I test in prod", which lifted the paired visual-review gate.

**Cycle 98 (`launch-and-ktx2`) is the drained remainder.** The scaffold lists the candidates; the two most concrete:

1. **KTX2 integration (greenlit).** Cycle 97 measured ~192 MB VRAM + ~10.6 MB net wire on the tree impostor atlases and wrote the integration spec (`cycle97-validation/ktx2-readiness.md`, local): UASTC-only encoder pass on `bake-tree-impostors`, KTX2Loader + vendored basis transcoder, per-texture format choice, gated on the golden suite + the 20Mbps cold-load delta + the NSL jitter rail. Bounded and prod-testable.
2. **Paired product + launch session (Matt's hands).** NSL-as-default-world (Q1, still Rolling Hills), the version bump, the launch posting (itch + devlog + social, Matt's voice), and the S24+ device pass.

Or pivot to a new theme: the **NPC-sheepdogs** owner-intake candidate (needs an approach proposal first).

## Standing carryover (do not drop during cleanup)

- **Matt's Cycle 95 prod validation** - A: streams to LOD0 on re-entry; B: foliage holds facing any direction; C: camera after a swap; E: no dusk leaf-white; D: bark cadence; F: Survival explainer. Any residual is a fast-follow (E can escalate to `MeshPhysicalNodeMaterial` + grazing-faded specular, perf-gated). This was the look-approval backstop for the Cycle 97 golden re-baseline; if prod shows a rejected element, re-capture the affected goldens against the corrected look.
- **three r185** stays blocked until it publishes (latest 0.184.0); checklist `cycle96-validation/r185-readiness.md`. The instance-level shadow-churn fix stays regardless.
- **Rock re-bake** behind the Cycle 96 collider-parity harness; needs a design direction.
- **Owner intake (2026-06-12):** NPC sheepdogs as a near-term cycle candidate (needs an approach proposal before dispatch) - `docs/BACKLOG.md` Distant ideas.
- **Survival onboarding translation** (es/ja/pt/zh-CN) once the English copy is locked.
- **NSL-as-default-world** product decision still open (pill off; default still Rolling Hills).
