# Next Session - Cycle 117, island-pasture

> **Updated:** 2026-07-25
> **For:** Cycle 117
> **Pickup priority:** Phase 1 is a pure `shared/` generalisation that cannot regress anything, so start there. Every open question was decided 2026-07-25; read the D22 to D32 section before touching the leaderboard or the corral delete.

## Current State

Cycle 116 (`gate-legibility`) closed 2026-07-25. Plan archived in [`docs/archive/cycles/`](docs/archive/cycles/); the close entry with full detail sits at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

The game now tells you where the sheep go. A warm column stands over the destination from across the island, a ground arc draws at the mouth inside 85 metres, the arc brightens as the flock funnels in, and each crossing gives one pulse. One module, one descriptor, four states, all four scenes.

**The browser probe finally ran**, and it is now a repeatable tool at [`tools/validation/homestead-probe.mjs`](tools/validation/homestead-probe.mjs) rather than a one-off. It confirmed seven claims from Cycles 114 and 115, found six defects, and verified Cycle 116's own visual acceptance by eye. Full record: [`cycle116-validation/PROBE_FINDINGS.md`](cycle116-validation/PROBE_FINDINGS.md).

Cycle 118's before-capture also landed early, because it is worthless once rewrite code exists. 24 frames on proven WebGPU via [`tools/validation/water-look.mjs`](tools/validation/water-look.mjs), findings in [`cycle118-validation/WATER_BEFORE.md`](cycle118-validation/WATER_BEFORE.md).

## The active cycle

[`docs/cycle-117-plan.md`](docs/cycle-117-plan.md). Eight phases. It was rewritten after a four-agent read-only spike and is materially smaller than the first draft, because the spike answered the gating question with measurements rather than argument.

**The gating question is answered.** A bare pasture rect on Rolling Hills holds nothing: driving the real `shared/` sim, 60 sheep started inside and 60 leaked; 60 pushed at a wall and 57 got in. The same run with `shared/survival/pen.js`'s `PenContainment` placed verbatim at Rolling Hills coordinates held 60/60, admitted 0/60 at the wall, and took 34/40 driven through the gate. Cost to generalise it to a rect is roughly 8 lines in one constructor.

**Two findings shrink the cycle.** The gate-predicate fix the draft planned is not needed at all, because the recommended design detects entry by box-inside test rather than by passage-zone crossing. And only one of eleven sim-baseline fixtures moves: `island-boundary-rh-60hz.json` was proven byte-identical with the corral removed by replaying the spec's exact construction both ways.

**One design constraint carries the whole multiplayer risk.** Do not add a top-level `gate:` to `shared/scenes/rolling-hills.js`. `createGameState` derives `gameState.gate` from `scene.gate`, and a non-null gate switches on Worker gate-attraction the island has never had. Declare the gate nested inside the pasture descriptor, where `createGameState` does not read it.

## Decided 2026-07-25, round two - D22 to D32

Matt answered every open question in one sitting across three rounds. Full text in [`DECISIONS.md`](DECISIONS.md), "Front door alignment, round two"; program shape in [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md).

What binds this cycle:

- **D22, the leaderboard resets by explicit row id.** Matt chose reset with the facts stated: `id=16` is a real 12.6-minute human playthrough and Cycle 58 shaped the ladder around it. Scope is **ids 16 and 21 only**, never `scene_id`. `id=23` (`Pakrohk#0001`, an outside player) is untouched. **Procedure is archive first, then migrate:** export the rows to a committed artifact so the data is recoverable, then a new append-only `worker/migrations/0011_*.sql` applied by the deploy workflow. No raw DELETE against production. Phase 7 does the archive; the migration is the step after.
- **D23, competitive stays as it is.** Do not narrow `allowedModes` and do not expand the cycle. The one thing to protect: deleting `corral` removes what competitive currently falls back to, so it must stay **broken as before, not newly crashing**. It lands on a layout, never on a null. Verify this explicitly.
- **D28, the floating diamond retires.** Phase 5.
- **D29, tune the column on Rolling Hills.** Phase 6. It reads thin and pale at 190m and this is the scene that sells itself on distance.

What comes after, so nobody re-opens it:

- **Cycle 118** is the full water rewrite per D-W and D30, not a palette pass.
- **Cycle 119 is a bundle cycle** (D31). `main-*.js` survived Cycle 116 by 14 bytes. Do not raise the ratchets.
- **Cycles 120, 121, 122** are lighting, worn ground, and N pastures (D25, D26, D27, D24, D32). Lighting first because it is the root cause under the dusk lamp and the only measured defect of the three.

## Carryover worth knowing before you start

Eight items are recorded in the Cycle 116 close entry. The two that touch this cycle:

- **The floating white diamond over the gate** is still shipping and now competes with the column. Rolling Hills gets the same treatment in Phase 5, so decide the diamond's fate there rather than twice.
- **The column reads thin and pale at 190m.** Rolling Hills is where that matters most, since it is the scene that sells itself on distance. Phase 6 is the place to tune it.

## Reference

| What | Where |
|---|---|
| Active cycle plan | [`docs/cycle-117-plan.md`](docs/cycle-117-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Browser probe harness | [`tools/validation/homestead-probe.mjs`](tools/validation/homestead-probe.mjs) |
| Water before-capture | [`tools/validation/water-look.mjs`](tools/validation/water-look.mjs), `npm run validation:water` |
| Deterministic-sim contract | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
