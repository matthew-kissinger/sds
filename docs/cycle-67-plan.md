# Cycle 67 — coop-survival

> Drafted 2026-06-07 after Cycle 66 (`newsheepdogland-survival`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB.** Cycle 66 shipped the solo survival game on Newsheepdogland (wolves, bark wolf-repel, pen objective, survival leaderboard, minimap). The biggest deferred item is co-op. Fill in the Goal + Phases below, then run `/cycle-start`.

## Goal

(Draft.) Promote the Newsheepdogland survival run from a solo client-only layer into the deterministic `shared/` sim so it can run in Worker-authoritative **co-op rooms** (2-4 dogs herding one flock against the night wolves). Today the survival run, the wolves, and the pen containment are all client-side controllers (the dayLoop precedent) - deliberately, to ship solo fast and keep the sim-baseline byte-identical. Co-op requires the survival phase clock, the wolf AI, and the pen barrier to become deterministic `shared/` modules the Worker DO and every client run byte-identically (the boid-sim contract). Before/after: before, survival is single-player only; after, you can share an invite link and survive the wolves together.

This is the cycle the Cycle 66 plan and `multiplayer.md` both name as "the co-op cycle." It is a real deterministic-sim + wire-protocol cycle, so it must respect the full `shared-sim.md` + `multiplayer.md` contracts (sim-baseline regen with explicit acceptance, a wire-format migration story, append-only D1).

## How to read this plan

This doc fixes the *shape* of the changes, not the implementation choices. Research current best practice, measure on the actual hardware targets, and pick the simplest thing that meets the budget. (See [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md).)

## Open questions to resolve before writing code

1. **Q1: How do wolves stay deterministic across Worker + clients?** Author lean: a seeded `shared/wolves.js` tick (mulberry32 from the room seed), no `Math.random`, no trig in the hot path - the same discipline as the sheep boids. The client `WolfPack` becomes a thin renderer over the shared wolf state, mirroring how `OptimizedSheep` renders the shared sheep sim.
2. **Q2: What is the survival wire-format migration story?** Author lean: additive - the state frame gains a wolves array + a phase/day clock; version-tag the protocol and refuse/soft-degrade old clients per `multiplayer.md`. Names every consumer (client `NetworkManager`, Worker DO handler, payload-shape tests).
3. **Q3: Does the survival leaderboard gain a `partySize` dimension for co-op runs?** Author lean: yes - a new append-only migration; solo (partySize 1) and co-op boards stay separate partitions.

## Architecture / shared changes

(Fill in: which client-only modules from Cycle 66 - `survivalRun.js`, `wolfPack.js`/`wolfBehavior.js`, `penContainment.js` - get promoted to `shared/`, and the determinism + wire contract for each.)

## Other deferred carryover (not necessarily this cycle)

- **Whole-island grass rearch.** Cycle 66 widened grass to the survival play surface (745 chunks); the literal alpine mountain-leg coverage is gated on a density/LOD perf spike (per the grass-discipline rule). Spike in `tools/` + a `cycleN-validation/` dir, measure desktop + mobile draw calls before committing.
- **Real Newsheepdogland entrance hero capture** to replace the dusk-gradient placeholder (Matt's media pass - a paired-track item, not autonomous).
- **Wolf / survival feel pass.** The named numbers (wolf counts/speeds, kill radius, bark repel range, growth +5, 33% loss threshold, maxFlock 200) are tunables awaiting Matt's taste pass.
- Prior open carryover (tablet draw-call perf, real mobile pass, counting naming/curve-feel, `/api/rename` no-body 500, `upload-artifact@v5` Node 20).

## Phase shape rules

A cycle has **≤ 8 phases**, each a single sharp goal and ≤ 4 hours, fully autonomous or fully paired (not mixed). See [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md).

## Phase 1 — <name> (~Xhr)

(Fill in.)

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, the sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — the template
- [`docs/archive/cycles/cycle-66-plan.md`](archive/cycles/cycle-66-plan.md) — the solo survival cycle this builds on
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) + [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) — the deterministic-sim + co-op contracts co-op must respect
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
