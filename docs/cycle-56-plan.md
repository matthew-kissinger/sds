# Cycle 56 — {{slug}}

> Drafted 2026-06-04 after Cycle 55 closed. SCAFFOLDED STUB. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then confirm the cycle focus with Matt, author this plan from [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), then `/cycle-start`. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

UNWRITTEN. Confirm focus, then write one paragraph describing the user-visible before/after.

## Candidate focus (Matt picks)

1. **`steam-desktop-store-prep-1`** (queued since Cycle 54). Turn the green Cycle 54 desktop distributor proof into a Steam-ready release-candidate lane without pressing public release controls: signing/release-channel decision, installer/portable install-uninstall QA, Steam depot dry-run, store metadata draft, capsule/screenshot list, controller/cloud-save/multiplayer policy. Sources: [`docs/archive/cycles/cycle-54-plan.md`](archive/cycles/cycle-54-plan.md), [`docs/native-desktop-package-cycle-54.md`](native-desktop-package-cycle-54.md), [`docs/native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md).
2. **`entity-collision`** (newly teed up by Cycle 55). Add hard-body collision so the dog physically displaces sheep and sheep stop interpenetrating, extending the existing dog-to-obstacle push-out ([`js/Sheepdog.js`](../js/Sheepdog.js) `DOG_RADIUS` pattern) into the deterministic sim ([`shared/MovementPhysics.js`](../shared/MovementPhysics.js)). This is a frozen-`shared/` change: it needs a multiplayer in-flight migration story, sim-baseline regeneration in the same PR, and explicit acceptance per [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md). Scope it as its own cycle, not a phase append.
3. **Grass-interaction visual finish** (Cycle 55 carryover, small). If the narrowed footprint needs tuning after Matt's in-browser review, a short follow-up to dial `GrassSystem.config.interaction.*` across WebGL desktop, WebGL mobile, and WebGPU.

## Phases

UNWRITTEN. ≤ 8 phases, each fully autonomous or fully paired, each with EARS acceptance.

## Frozen files (cycle-specific additions)

TBD once focus is set. Note: candidate 2 (`entity-collision`) requires authorizing a `shared/` deterministic-sim edit with a migration story.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific stops TBD.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template to author from.
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items.
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files.
