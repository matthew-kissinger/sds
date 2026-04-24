# 60Hz simulation baseline traces

Reference traces of the current server simulation, captured at 60Hz with fixed
inputs, so the Cycle-2 Cloudflare Workers / DO retry can verify that its 20Hz
port reproduces the same continuous behavior.

## Why this exists

`docs/archive/cycle-1-audit.md` "Significant" #1 documents that Cycle 1 dropped the
server tick rate from 60Hz to 20Hz with **no playtest**. At 20Hz per-tick
deltas are 3x larger than at 60Hz. In particular:

- Rotation smoothing is `rotDiff * 8 * DELTA_TIME` - jumps from 0.1333/tick to
  0.4/tick. Dogs visibly snap to target heading at 20Hz.
- Client-reconciliation interpolation factor is `min(8 * DELTA_TIME, 0.8)` -
  jumps from 0.1333 to 0.4. Reconciliation becomes aggressive on every dog
  stop.
- Stamina drain/regen and boid separation run at 3x position step, which
  should be fine mathematically but no one checked.

These traces are the pre-change reference. The retry must be able to assert
that when sampled at matching wall-clock times (every 3rd 60Hz tick = every
1st 20Hz tick), its behavior stays within a configurable tolerance of this
reference.

## What is captured

Four fixtures under `__fixtures__/`, each produced by stepping a minimal tick
harness at 60Hz against the real `shared/` simulation primitives:

| Fixture | Contents | Ticks |
|---|---|---|
| `sheep-60hz-20s.json` | 20-sheep flock, stationary dog at (-15, -20), full (id, x, z, state) per tick | 61 (tick 0..60 = 1s) |
| `dog-rotation-60hz.json` | Dog from rotation 0 to target +pi/2, per-tick rotation until converged (< 0.01 rad) | up to 180 |
| `stamina-curve-60hz.json` | Dog sprints 3s then rests 3s, stamina + isSprinting every tick | 361 |
| `reconcile-interp-60hz.json` | Dog server-side interpolating toward clientPosition (1.5, 1.0), per-tick factor + position | up to 120 |

The spec asserts each trace matches what the harness produces today. This is a
regression test against self - the fixtures are committed, so any change to
`shared/` or the harness shows up immediately.

## How to run

```bash
# Assert committed fixtures match current code.
npx vitest run tests/sim-baseline

# Regenerate fixtures (after an intentional change).
UPDATE_FIXTURES=true npx vitest run tests/sim-baseline
```

Both from the repo root.

## How the retry consumes these

During the 20Hz port work (Cycle 2 Tracks C1-C4), add a sibling test file
(e.g. `tests/sim-20hz-parity/parity.spec.ts`) that:

1. Imports the JSON fixtures from `tests/sim-baseline/__fixtures__/`.
2. Stands up the 20Hz version of the sim (probably `worker/src/RoomDO.ts`
   logic extracted into a harness, mirroring this directory's `harness.js`).
3. Drives it with the **same** inputs as the 60Hz trace and produces a 20Hz
   trace of its own.
4. Samples the 60Hz trace at matching wall-clock times (tick 0, 3, 6, ... =
   every 3rd 60Hz tick corresponds to tick 0, 1, 2, ... at 20Hz) and asserts
   position / rotation / stamina / interp-factor are within a tolerance that
   the test file itself owns and documents.

Suggested starting tolerances (tune during development):

- Sheep position: 0.5 m (flock drift over 1s is tiny; anything beyond this
  means dynamics diverged).
- Dog rotation: 0.2 rad (the 20Hz port **is** expected to take larger per-step
  turns; the question is whether the steady-state angle matches).
- Stamina: 1 unit (drain/regen is linear in deltaTime; exact match expected).
- Client-interp position: 0.3 m (this is where 20Hz will diverge most; budget
  accordingly).

If 20Hz cannot match these tolerances at default settings, the retry's job is
either to tune the per-tick factors (divide the `8` constants by 3?) or to
formally decide that the 20Hz dynamics are "different but acceptable," and
document that decision with a playtest.

## Known limitations

### Determinism of the harness

`shared/GameStateValidation.js` `generateInitialSheepPositions` and
`generateCompetitiveBalancedSpawns` use `Math.random()`. Node has no built-in
seedable RNG.

Rather than add a `seedrandom` dependency, the sheep baseline uses
`makeDeterministicFlock()`, which places sheep on a regular grid - no
randomness required. This avoids the need for a shared PRNG shim between the
60Hz baseline and the 20Hz retry.

The harness **does** ship `mulberry32(seed)` and `withSeededRandom(seed, fn)`
helpers for future traces that need real spawn randomness. If the retry needs
to consume those, it must use the same `mulberry32` implementation - the
constants in `harness.js` are the canonical public-domain version; do not
retype them.

`shared/Vector2D.js` `Vector2D.random()` is called nowhere on the server tick
path (only in grass shaders and visual effects), so it does not affect these
traces.

### Harness drift

`harness.js` inlines three routines from `server/GameSimulation.js`:

- `tickSheepCoop` mirrors `updateSheep` (coop mode only, ignores competitive
  gate logic and retirement bookkeeping).
- `tickSheepdog` mirrors `updateSheepdogs` + `updateSheepdogMovementTimeStyle`
  (non-interpolating branch).
- `tickSheepdogClientInterp` mirrors the interpolation branch of
  `updateSheepdogMovementTimeStyle`.

If `server/GameSimulation.js` or `shared/` changes, these will drift and the
fixtures will need regenerating. There is no automated check that the harness
stays in sync with the server; reviewers of PRs touching those files should
diff the harness and the spec against the fixtures.

### Scope

- Competitive and timed modes are not captured. Cooperative is the broadest
  code path and exercises the same primitives.
- Retirement / grazing states (sheep.state = 1 or 2) are not exercised.
- Large flocks (200 sheep, as shipped) are not captured at this layer. If the
  retry regresses boid behavior at scale, small-flock traces should still
  surface it.

### Tolerance vs. bit-exact

Fixture values are rounded to 4 decimals before writing, so cross-platform
double-precision drift does not cause spurious diffs. 4 decimals at 200x200m
game field is ~0.1mm resolution - well below any perceptible gameplay effect.
If a retry wants bit-exact comparison it should round to the same 4 decimals.
