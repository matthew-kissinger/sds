# The pasture site, and what dropping the corral actually touches

> Read-only reconnaissance, 2026-07-25, against the shipped bake. Probe:
> [`pasture-site-probe.mjs`](pasture-site-probe.mjs). Every line reference below was
> read directly rather than inferred.

Cycle 117's plan named three call sites and one fixture. Measurement found a bad
pasture site and ten consequences the plan does not list, one of which crashes a live
multiplayer room. This file is the record so no phase has to rediscover it.

## The plan's site is a hillside

The plan offered `{center:{x:110,z:60}, radius:20}` with a gate at `{x:90,z:60,width:12}`
as a known-good starting point, on the strength of the containment spike. But the spike
measured containment, which is pure geometry and true anywhere. It never looked at the
ground.

Sampled through `shared/terrain/Heightfield.js` against the shipped
`public/terrain/rolling-hills.bin` (1024 square, `worldSize` 500, `peakHeight` 6), which
is the sampler `TerrainBuilder._groundY` wraps:

| | Plan's site | Recommended site |
|---|---:|---:|
| Interior relief | 17.74 m | **4.94 m** |
| Worst slope | 36.3 deg | 23.0 deg |
| Relief across the 12 m gate opening | 5.28 m | **0.41 m** |
| Corner distance from origin | up to 153 m | 66 / 89 / 99 / 116 m |

One corner of the plan's site sits past the 140 m full-height radius, so it is already on
the beach ramp. That is a pasture on a hillside with a gate on a slope.

## The site to build

```js
pen:  { minX: 32, maxX: 68, minZ: -94, maxZ: -58 }   // 36 x 36, 1296 m2, centre (50, -76)
gate: { position: { x: 50, z: -58 }, width: 12 }     // exactly on the maxZ edge
```

Chosen by scanning 36x36 boxes at 2 m centres, constrained to 75-125 m from origin, whole
box inside the full-height radius, at least 85 m from the sheep spawn, gate centred on the
edge facing the island centre. Scored on interior relief plus three times the relief
across the opening.

- Ground runs 24.12 m to 29.06 m. The gate sits exactly on the edge line, which is what
  Phase 1's gap model requires.
- `onVertical` resolves false under both Phase 1's gap rule and the Cycle 66 offset rule.
  The box is square, so they agree.
- All four corners are inside the 140 m full-height radius and the 136 m tree-safe radius.
- 91 m from origin, 85 m from the sheep spawn at (-30, -30), 57 m from the default dog
  spawn at (0, -30). It stays a real traverse.
- The gate faces back toward the island centre and the spawn, which is the approach
  direction, and it is the flattest 12 m of ground on any candidate edge.
- 1296 m2 against Home Field's pasture at 60 x 28 = 1680 m2, which already absorbs a
  5,000-sheep Chaos flock. The top ladder rung is precedented.

## Ten things dropping `corral` touches

**a. The Worker crashes on a co-op Rolling Hills room.** `worker/src/GameSim.js:1049-1095`
dispatches competitive/timed, else `if (this.gameState.corral)`, else
`updateSheepRetirements(sheep, this.gameState.gate, this.gameState.pasture, this.rng)`.
With the corral gone and `gameState.gate` null (which hard stop 2 requires), that reaches
`shared/GameStateValidation.js:89` `gate.passageZone` and throws a TypeError every tick.
The client is null-safe here (`js/OptimizedSheep.js:2271` early-returns on a falsy gate);
the Worker is not. **A pen branch, or at minimum a null-gate guard, is mandatory in the
same edit that drops the corral.** This is exactly the "must not newly crash" constraint
in D23.

**b. `tests/sim-baseline/baseline.spec.ts:349-351` reads `state.corral.center.x`** and
throws the moment the field is gone. The plan assigns that rewrite to Phase 3, but it goes
red the instant Phase 2 drops the corral. Phases 2 and 3 cannot be separated across this
file.

**c. `tests/tree-placement.spec.js:75-84`** ("island scenes keep trees out of the corral
keep-out") reads `rollingHills.corral.center` and throws the same way.

**d. Tree and rock scatter silently lose their keep-out.** `shared/TreePlacement.js:203,
275-280` rejects candidates within `corral.radius + 5`; `js/world/rockPlacementPlan.js:114,
137-140` within `corral.radius + 8`. Both go inert when the corral is dropped, so trees and
rocks scatter into the new pasture and, once Phase 4 raises the fence, through it. Nothing
today excludes a `pen`, which is why Newsheepdogland's homestead pen has the same gap. The
Worker never imports `TreePlacement`, so this is render plus client-obstacle only, not a
desync risk. Generalising the keep-out from corral to enclosure would also shift
Newsheepdogland's tree layout, which needs its own call.

**e. The pen construction is inside the day-loop block, not beside it.**
`js/boot/initWorld.js:308-353` sits under
`if (game.currentScene.dayNight?.dayLoop && game.currentScene.gate)`, and that one block
builds DayLoop, the day/night chip, skipToDusk, the homestead gate, the survival run, the
minimap and the wolves. Widening that predicate hands Rolling Hills a day loop it must not
have. The barrier construction has to be hoisted out and above the block, because line 373
`createLazyWolfPack({ pen: game._penContainment })` and line 460
`home = game._penContainment.pennedCount` both read it. It has to stay behind a dynamic
import so `shared/PenBarrier.js` never lands in the eager chunk against the bundle ratchet.

**f. The Worker call site is inside `_initSurvival()`.** `worker/src/GameSim.js:2038` is
called only from :497 under `if (this.isSurvival && this.scene.survival)`, and ticked only
at :571 under `if (this.isSurvival && this._survival)` inside `_tickSurvival`. Widening
"the call site" means standing the barrier up and ticking it outside the survival subsystem
entirely: construct when the scene declares a pen, tick after `updateSheep` with
`gateOpen = true`, and run `containDog` per player dog against a per-dog memory. **That is
a new subsystem seam, not a predicate edit.**

**g. The Newsheepdogland fallback matters.** It declares
`pen: {center:{x:640,z:-1000}, radius:30}` and a **top-level**
`gate: {position:{x:610,z:-1000}, width:12, facingDeg:90}`. A nested-gate-only resolver
would silently drop its barrier. The resolver needs `pen.gate ?? scene.gate`, and the spec
should derive both the client and Worker sides from the real scene modules rather than
from a stub.

**h. Retirement counting largely falls out on the client already.**
`js/GameState.js:385-388` counts `hasPassedGate || isRetiring` into `sheepRetired`, and
`PenBarrier.update` sets `hasPassedGate = true` on box entry, so once the barrier ticks the
score follows. What does **not** fall out is the chime and the retire event: the `triggered`
branch at `js/GameState.js:360-361` calls `checkGatePassageAndRetire(null, null)` and
returns false. Phase 3 inherits feedback, not counting.

**i. Competitive and timed.** `shared/scenes/rolling-hills.js:109` advertises both. The
Worker's competitive branch runs first in the retirement dispatch, and
`shared/CompetitiveLayout.js` lays gates out on Home Field geometry regardless of scene, so
those modes are already broken on the island and dropping the corral does not make them
worse (D23). But a mid-island fence would sit across the competitive pastures, so the
barrier tick should be skipped in competitive and timed.

**j. The JSDoc correction owed at `shared/scenes/types.js:341-343` is bigger than the plan
says.** "corral replaces gate+pasture when present" is false in both directions: Open
Country (`shared/scenes/open-country.js:29-33`) has a corral and neither a gate nor a
pasture, so nothing is replaced; Newsheepdogland has a top-level gate and a pen and no
corral. The accurate statement is that a scene declares exactly one destination shape: a
corral disc, a gate-plus-pasture pair, or a fenced pen.

## Design note carried forward

For the nested descriptor, use the existing `GateDef` shape,
`pen.gate = { position: {x,z}, width }`, not a flat `{x,z,width}`. Every current call site
already flattens `scene.gate.position.x/z` at the point of use, so reusing `GateDef` keeps
one gate shape in the codebase instead of two.

## A pre-existing bug found on the way, out of scope

`scripts/bake-heightmap.mjs:202` writes `h` already scaled into `[0, peakHeight]` **metres**,
and `Heightfield.sample` multiplies by `peakHeight` a **second** time. Rolling Hills
therefore renders roughly 48 m of relief (sea -12 m to peak +35.7 m), not the 6 m its
`peakHeight` declares. Pre-existing and not this cycle's work, but it is why "flat enough"
is a real constraint on this island rather than a formality, and any future cycle that
touches terrain scaling needs to know the double-multiply is load-bearing for the current
look.
