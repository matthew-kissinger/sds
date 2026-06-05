# Next Session - Cycle 57 `playthrough-repair` IN PROGRESS

> **Updated:** 2026-06-04
> **For:** Cycle 57 `playthrough-repair` (OPEN, in progress). Plan: [`docs/cycle-57-plan.md`](docs/cycle-57-plan.md).
> **Pickup priority:** Continue the Cycle 57 phases (start Phase 1 - leaderboard skew fix). Repairs the end-of-run loop: paused-run leaderboard hiding, menu-return overlay/freeze, username set/view, submit feedback. Single deploy at close.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-57-plan.md`](docs/cycle-57-plan.md) (scaffolded stub) -> the chosen focus's source docs.

## Where It Stands

**Cycle 56 `entity-collision` closed 2026-06-04.** Plan archived at [`docs/archive/cycles/cycle-56-plan.md`](docs/archive/cycles/cycle-56-plan.md); full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md). It gave the dog a hard body the sheep cannot occupy (the dog now plows a tight flock instead of ghosting through it) - the deferred physical half of the original collision notes that Cycle 55 began on the grass side.

- New pure deterministic resolver `shared/EntityCollision.js` (`resolveDogSheepCollision` / `resolveDogSheepCollisions`, body radii 1.1 dog / 0.6 sheep, 0.35m/tick cap), wired identically into the three sheep-integration paths the codebase keeps: the Worker tick (`worker/src/GameSim.js`), the client predictor/solo path (`js/OptimizedSheep.js`), and the sim-baseline harness.
- `harness-parity.spec.ts` proves the Worker tick is bit-identical to the harness with collision present; the committed sim-baseline fixtures stayed byte-identical (collision is a no-op on baseline scenarios), so no regeneration was needed.
- No fence-frozen algorithm file touched; no wire-format change. `npm run lint` clean, `npm test` 879 pass / 0 fail, `npm run build` clean.

**Cycle 55 `grass-interaction-tuning` closed 2026-06-04** (the cycle before). Render-only; narrowed the too-wide grass-parting footprint and unified the extents into `GrassSystem.config.interaction`. See [`docs/archive/cycles/cycle-55-plan.md`](docs/archive/cycles/cycle-55-plan.md).

## Open carryover (Matt review + deferred)

- **Dog-to-sheep collision feel** (Cycle 56) is Matt's in-browser review: confirm it reads as solid plowing, not jitter. Tune `DOG_BODY_RADIUS` / `MAX_DOG_SHEEP_PUSH_PER_TICK` in [`shared/EntityCollision.js`](shared/EntityCollision.js) if needed (one edit, one place; deterministic so it stays in sync across worker/client/harness).
- **Grass footprint feel** (Cycle 55) is Matt's in-browser review: dial `GrassSystem.config.interaction.*` if the swath wants tightening or loosening.
- **Sheep-to-sheep hard-body collision** (deferred from Cycle 56): its own future cycle. Needs visual jitter tuning + a spatial grid for 5,000-sheep perf (current flocking is brute-force O(n^2)).

## Recommended Next Cycle

Pick one (see [`docs/cycle-57-plan.md`](docs/cycle-57-plan.md) for detail):

1. **`steam-desktop-store-prep-1`** - queued since Cycle 54; mostly gated on Matt (signing, Steam account, store voice, release decisions).
2. **`sheep-collision`** - sheep-to-sheep hard-body separation; deterministic `shared/` change with the sim-baseline discipline + a spatial grid for perf.
3. **Feel-review follow-up** - short cycle to tune the Cycle 55 grass and/or Cycle 56 collision constants after Matt's review.

## Working Contract

- The deterministic-sim discipline applies to any `shared/` change ([`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md)): name files, migration story, consumer updates in the same commit, regenerate sim-baseline goldens only with recorded acceptance.
- Do not reopen Worker auth from the stale Cycle 53 security stub; [`docs/audit-roadmap-2026-05.md`](docs/audit-roadmap-2026-05.md) records P-SEC-1 through P-SEC-5 as shipped 2026-06-01.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | None open; next recommended in [`docs/cycle-57-plan.md`](docs/cycle-57-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-56-plan.md`](docs/archive/cycles/cycle-56-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Deterministic-sim rules | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Multiplayer contract | [`.claude/rules/multiplayer.md`](.claude/rules/multiplayer.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
