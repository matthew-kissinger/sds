# Shared deterministic-sim boundary

Rules for the `shared/` workspace and the sim-baseline regression harness. Durable; no cycle-specific content.

## The deterministic-sim contract

Code under `shared/` runs **identically** on the Cloudflare Worker (inside the Durable Object) and on every connected client. Any divergence (a rounding tweak, a default-param change, a different iteration order) desynchronizes the Worker authoritative sim from the client predictor mid-game. Symptoms surface several seconds after the divergence — sheep teleport, scores diverge across clients — and only at scale.

The boundary is enforced by import discipline, not by language tooling alone:

- **No DOM, no window, no Three.js, no browser-only APIs in `shared/`.** Pure JS + `Vector2D.js`.
- **No imports from `js/`** (the client renderer pulls Three.js transitively).
- **No imports from `worker/`** beyond what `shared/` already exposes.
- ESLint will enforce this once Stream B5 lands the `no-restricted-imports` rule scoped to `shared/**`.

## Files in the deterministic core

- [`shared/MovementPhysics.js`](../../shared/MovementPhysics.js) — sheep + dog movement, boundary forces, slope-modulated speed.
- [`shared/BoundaryCollision.js`](../../shared/BoundaryCollision.js) — boundary avoidance.
- [`shared/FlockingAlgorithms.js`](../../shared/FlockingAlgorithms.js) — boid separation/cohesion/alignment.
- [`shared/GameStateValidation.js`](../../shared/GameStateValidation.js) — win-condition logic.
- [`shared/Vector2D.js`](../../shared/Vector2D.js) — primitive math, depended on by everything above.

Each is listed in [`docs/INTERFACE_FENCE.md`](../../docs/INTERFACE_FENCE.md) with the same lockdown discipline.

## Sim-baseline test ratchets

[`tests/sim-baseline/*.json`](../../tests/sim-baseline/) capture 60Hz traces from the deterministic sim under fixed seeds. They serve two purposes:

1. **Regression detection.** A change to any sim core that produces a different trace for the same seed is by definition a behavior change.
2. **MP desync prevention.** If the trace differs between Worker and client builds for the same input, multiplayer will desync. The fixture catches this offline before it ships.

Discipline:

- **Don't regenerate as a shortcut to make tests pass.** Read the diff. Decide whether the new behavior is intentional.
- If intentional: regenerate with the decision **explicitly recorded** in the active cycle plan's Acceptance section ("yes, this is the new intended behavior because X").
- If unintentional: fix the sim change first.
- Fixture regeneration and the sim change must be in the **same PR** as the explicit acceptance, never a follow-up.

## Float determinism gotchas

The Worker (V8) and the client (V8 in Chrome, JavaScriptCore in Safari, SpiderMonkey in Firefox) all converge on IEEE-754 semantics for `+`, `-`, `*`, `/`, `Math.sqrt`, `Math.fround`, etc. Trig and transcendentals (`Math.sin`, `Math.cos`, `Math.atan2`, `Math.log`, `Math.exp`, `Math.pow`) are **not** spec-pinned across engines. The sim avoids them in hot paths; if you need them, use lookup tables or pre-compute on one side.

`Math.random()` is not deterministic. The sim uses seeded PRNGs (mulberry32 / xorshift). Don't introduce `Math.random()` into a sim path.

`for...in` ordering is not spec-pinned for non-integer keys. Use `for...of` over `Object.entries(...)` or `Object.keys(...).sort()`.

## When sim-baseline regeneration is appropriate

A cycle phase that legitimately needs a behavior change to the sim:

1. Names the file explicitly in the phase scope.
2. Describes the migration story (does this break MP for in-flight sessions? what happens to existing replays?).
3. Lists the consumer updates in the same phase (any client code that observed the old behavior).
4. Adds a `regenerate sim-baseline fixtures` step to the phase's Acceptance.
5. The cycle plan's Hard stops list becomes stricter for that phase: any unexplained ULP drift outside the regenerated zone aborts the phase.

Without those four pieces, a sim change is a **fence violation**. Stop and surface to the user.
