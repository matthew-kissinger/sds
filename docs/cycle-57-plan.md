# Cycle 57 — {{slug}}

> Drafted 2026-06-04 after Cycle 56 closed. SCAFFOLDED STUB. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, confirm focus with Matt, author this plan from [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), then `/cycle-start`. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

UNWRITTEN. Confirm focus, then write one paragraph describing the user-visible before/after.

## Candidate focus (Matt picks)

1. **`steam-desktop-store-prep-1`** (queued since Cycle 54). Turn the green desktop distributor proof into a Steam release-candidate lane: signing/release-channel decision, installer/portable install-uninstall QA, Steam depot dry-run, store metadata draft, capsule/screenshot list, controller/cloud-save/multiplayer policy. Much of this needs Matt (signing certs, Steam account, store copy in his voice, release calls), so it ends in decisions, not a clean autonomous deploy. Sources: [`docs/archive/cycles/cycle-54-plan.md`](archive/cycles/cycle-54-plan.md), [`docs/native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md).
2. **`sheep-collision`** (deferred from Cycle 56). Add sheep-to-sheep hard-body separation so the flock stops interpenetrating. Needs in-browser tuning to avoid mutual-push jitter, and a spatial grid to stay performant at 5,000 sheep (the current flocking is brute-force O(n^2)). Deterministic `shared/` change like Cycle 56.
3. **Collision + grass feel review follow-ups** (Cycles 55-56 carryover). If Matt's in-browser review of the grass footprint or the dog-to-sheep collision wants tuning, a short cycle to dial `GrassSystem.config.interaction.*` and `shared/EntityCollision.js` constants.

## Phases

UNWRITTEN. <= 8 phases, each fully autonomous or fully paired, each with EARS acceptance.

## Frozen files (cycle-specific additions)

TBD once focus is set. Candidate 2 (`sheep-collision`) touches the deterministic `shared/` sim and needs the sim-baseline discipline (migration story + acceptance) per [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md).

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific stops TBD.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template to author from.
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items.
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files.
