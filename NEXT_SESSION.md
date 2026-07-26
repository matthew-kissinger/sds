# Next Session - Cycle 118, water-rewrite

> **Updated:** 2026-07-26
> **For:** Cycle 118
> **Pickup priority:** Read the plan's "What the de-risking pass corrected" section before anything else. It supersedes six things in the phase text below it, including the entire (a)/(b) fork in Phase 4 and two of Phase 2's three acceptance criteria.

## Current State

Cycle 117 (`island-pasture`) closed 2026-07-26. Plan archived in [`docs/archive/cycles/`](docs/archive/cycles/); the close entry with full detail sits at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

Sheep Dog Island now has a destination you can see and drive into. A fenced pasture with one open gate at (50, -58), sheep retiring by entering the box because the fence blocks every other crossing, no lightning, no flag pillar, no floating diamond. The browser probe confirmed it on the production WebGPU path and found three more defects on the way, all fixed: gate leaves hanging up to 1.85 m over falling ground, the HUD chevron pinned on at any gate above y=4, and the cue column's taper collapsing its base to a needle exactly where terrain hides it.

`worker/migrations/0011_reset_island_solo_rows.sql` landed with the close, which is when it reaches production D1. Rows 16 and 21 archived into `score_submissions_archive` with every column, then deleted with the DELETE guarded on the archive holding the row. `id=23` untouched.

**All four remaining cycle plans are now authored** (118 corrected, 119, 120, 121, 122), so the program has no unplanned cycles left.

## The active cycle

[`docs/cycle-118-plan.md`](docs/cycle-118-plan.md). Six phases, Phase 1 already done.

**Start by reading "What the de-risking pass corrected".** A read-only pass ran against Phases 2 to 6 before any of them started, and it found six things that would have cost real time mid-phase:

- **Phase 4's central fork does not exist.** `material.toneMapped` is never read by `WebGPURenderer` (zero occurrences in the unminified `three.webgpu.js`), because tone mapping there is one full-screen pass over the finished frame. The water is already tone-mapped, `:128` is a dead line, and Phase 4 is a deletion that changes zero pixels.
- **Two of Phase 2's three acceptance criteria are broken.** The palette grep already returns exactly one file today and would keep passing if the phase shipped nothing. The `colorTint` grep cannot return nothing, because 22 of its 26 matches are live terrain and grass knobs. Both are rewritten in the plan.
- **`depthT` is pinned at its floor** until the seabed is 13.18 m down on Rolling Hills and 23.03 m on Open Country, so the near-shore band is a single flat colour with no gradient in it at all. One of its three uses is dead code, and Phase 4 deletes another, so it is a two-way split after Phase 4, not a three-way.
- **Every `js/main.js` line number in Phase 5 is wrong**, and the block the plan names is a different subsystem where `deltaTime` is also in scope, so a wrong-block edit compiles silently.

**The palette numbers Phase 3 starts from are measured and in the plan.** At the `depthT` the islands actually sit at, the tint takes a desaturated teal `#064e62` to a saturated navy `#002477`. That is the cobalt.

## What binds this cycle

- **No ratchet bump.** Cycle 119's basis fix freed 56 KiB in `other` for the whole remaining program, not for this cycle to spend. `other` has 57,529 B of headroom and is not close, but **`webgpuDiagnostic` has 747 bytes**, and Phase 2 item 3 touches that file. Moving the palette out shrinks it, which is the direction to push.
- **Every capture proves genuine WebGPU.** `assertWebGpuEngaged` throws before any frame is written. Headless Chrome has no `navigator.gpu` and the Cycle 103 lesson is that "WebGPU" goldens were silently WebGL for months.
- **Do not break the heightfield foam branch.** In production `hasHeightfield` is always 1, so the shipped foam is the heightfield-interface branch, not the boundary branch.
- **The `userData.webgpuWater*` keys are a contract.** So is the material's white birth sun, which `tests/webgpu-water-material-adapter.spec.js:142` pins. Fixing either is a consumer migration, not a rename.

## Carryover worth knowing before you start

From the Cycle 117 close entry. The one that touches every remaining cycle:

- **The golden harness's flock is not attributable.** It replaces `Math.random` globally with one seeded stream and `js/OptimizedSheep.js` draws from it 32 times for the flock's layout, on a later frame than the re-seed, after other async render systems have drawn from the same stream. Home Field's changed blocks were all in the flock on a scene Cycle 117 never touched. **Attribute golden deltas by block, not by score**, until this is fixed.

The rest are recorded in the close entry: the cue dead zone on Rolling Hills' northern approach, the gate assembly's 0.4 m cross-slope, the near-black island terrain (routed to Cycle 120), and the `competitive.json` fence-glob gap (reconciled in Cycle 122 Phase 1).

## What comes after, so nobody re-opens it

- **Cycle 119, bundle** ([plan](docs/cycle-119-plan.md)). Phase 1 already shipped out of order. Remaining: the ZSTD decoder, the GLSL comment strip, and five dev surfaces. `__sdsCinema.freeFly()` and its OrbitControls chunk need Matt's explicit answer and must not be taken without it.
- **Cycle 120, lighting** ([plan](docs/cycle-120-plan.md)). The roadmap's unverified claim is refuted: both lights are added to the scene. `Atmosphere` binds different objects entirely, and `1.1 * Math.PI` is 3.45575, which is D25's measured 3.456 to three decimals. Direction is frozen too, not just intensity.
- **Cycle 121, worn ground** ([plan](docs/cycle-121-plan.md)). Smaller than the roadmap implies, because Cycle 115 already built the shared mechanism. It found a live gap: the grass exclusion keys on `sceneDef.pasture`, so Rolling Hills' new pasture and Newsheepdogland's homestead both have grass growing inside them.
- **Cycle 122, N pastures** ([plan](docs/cycle-122-plan.md)). The riskiest, deliberately last. The only cycle in the program that can desync a live room.

## Reference

| What | Where |
|---|---|
| Active cycle plan | [`docs/cycle-118-plan.md`](docs/cycle-118-plan.md) |
| Remaining plans | [119](docs/cycle-119-plan.md), [120](docs/cycle-120-plan.md), [121](docs/cycle-121-plan.md), [122](docs/cycle-122-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Water before-capture | [`tools/validation/water-look.mjs`](tools/validation/water-look.mjs), `npm run validation:water` |
| Browser probe harness | [`tools/validation/homestead-probe.mjs`](tools/validation/homestead-probe.mjs) |
| Golden harness | `npm run validation:screenshots -- --diff`, then `--baseline` |
| Deterministic-sim contract | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Program shape | [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) |
