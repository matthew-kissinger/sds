# Cycle 69 - grass-far-ring-and-api-hardening

> Drafted 2026-06-07 after Cycle 68 (`survival-polish`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> Authored + run autonomously (Matt: "author cycle 69 the complete and push and deploy"). The Matt's-hands carryover (the survival feel pass, the entrance hero FINAL framing, the `multiplayer.md` doc correction that the agent-config guardrail blocks Claude from making autonomously) is held for a future paired cycle. This cycle ships the autonomous-able Cycle 67/68 loose ends: the `/api/rename` prod-500, and the coastline grass far-ring (settled with numbers first, per the P5 NO-GO follow-up).

## Goal

Close two autonomous-able loose ends left by the co-op survival cycles. First, harden the Worker's HTTP body parsing so a missing or malformed JSON body on a POST route returns a clean client error (`400`/`401`) instead of a server `500` - the documented `/api/rename` no-body bug, which is one instance of a class shared by every body-parsing POST route. Second, settle the "coastline far-ring grass" question (the Cycle 68 P5 NO-GO follow-up) with a measure-first spike, then implement a far-ring only if the numbers show a contained, low-risk win; otherwise defer again with evidence and leave the cohesion-frozen `GrassSystem` untouched. Player-visible difference: rename failures degrade gracefully instead of 500ing, and (conditionally) the survival island gains cheap far grass coverage without a draw-call regression.

## Open questions to resolve before writing code

1. **Q1: Scope the body-parse fix to `/api/rename` only, or the whole POST-route class?** Author lean: the whole class. Every body-parsing POST route (`/api/register`, `/api/rename`, `/api/rooms`, room-join, quick-match, `/api/score`) does `await request.json()` outside a guard, so an absent/invalid body throws into the outer catch and 500s. `/api/event` already models the fix (`try { body = await request.json(); } catch {}`). One shared helper applied across the class is the elegant fix (memory: "no patchwork"); each route already null-guards its body fields, so a `{}` body flows to the correct downstream `400`/`401`.

2. **Q2: Which far-ring representation, if any?** Author lean: decide from the P2 spike. The existing 40m meadow-quad path (`createMeadowQuadChunk`) is 1 draw call per chunk - same chunk count as clump instancing - so simply enabling it for coastline trims triangles, NOT draw calls (the carryover's "trim draw calls" premise needs checking). A real draw-call win needs merged larger tiles or a single coarse annulus skirt. The spike quantifies each option's draw calls, triangles, coverage gained, and terrain-follow error before any frozen-adjacent file is touched.

## Phase 1 - API body-parse hardening (~1.5hr)

**Independently testable.** Pure Worker-router change with a route-level test; no sim, scene, or wire surface. Comes first because it is the definite ship and unblocks a clean deploy.

1. **Add a shared body reader.** `readJsonObject(request)` in `worker/src/index.ts`: `try { return await request.json(); } catch { return {}; }`, exported for unit + route tests. Returns `{}` (never throws) on an absent body, empty body, or invalid JSON.
2. **Route every body-parsing POST through it.** Replace the bare `await request.json<any>()` in `/api/register`, `/api/rename`, `/api/rooms`, room-join, quick-match, and `/api/score` with `readJsonObject`. Each route already reads body fields with `?.` / `?? default`, so a `{}` body produces the correct downstream result (missing token -> `401`; missing required field -> `400`).
3. **Test the contract.** `tests/worker/rename-route.spec.ts` drives the exported `fetch` handler: a valid Bearer token + no body -> `400`; invalid JSON + valid token -> `400`; no token + no body -> `401`. Mint the token with `signJwt` against a test `JWT_SECRET`; a stub `DB` suffices (the empty-name path throws `ValidationError` in `sanitizeDisplayName` before any DB hit).

**Acceptance (EARS):**

- When Phase 1 ships, then `worker/src/index.ts` shall expose `readJsonObject` and shall contain zero bare `await request.json` calls on the body-parsing POST routes (grep-checkable).
- When a POST `/api/rename` arrives with a valid Bearer token and no body, then the worker shall respond `400`, not `500`.
- When a POST `/api/rename` arrives with no token and no body, then the worker shall respond `401`.
- When `npm test` runs, then `tests/worker/rename-route.spec.ts` shall assert the `400`/`400`/`401` contract and pass.

## Phase 2 - Grass far-ring spike (measure-first) (~1.5hr)

**Independently testable.** Standalone Node benchmark, no frozen-file edits, mirrors the Cycle 68 P5 spike idiom. Settles Q2 with numbers.

1. **Build the spike.** `tools/grass-far-ring-spike.mjs`, sibling to `tools/grass-rearch-spike.mjs`. Import the real `newsheepdogland` scene def + the pure `shared/CoastlineField.js` SDF (no Three.js, no frozen sim core). Replay the exact chunk-cull + clumpScale math.
2. **Model the options** for Newsheepdogland at high-desktop tier, against the shipped 760m disc baseline (829 draw calls / 1.83M blades from P5):
   - **A - enable 40m meadow quads for coastline far chunks** (chunks beyond `meadowFrom` of grassCenter, SDF-culled): draw-call delta (expected ~0) + triangle/instance savings.
   - **B - merged NxN-chunk meadow tiles** in the far ring at tile spans {80, 120, 160}m: draw calls + coverage.
   - **C - coverage extension**: enlarge the grid window to reach the leg/treeline and measure A vs B draw calls for that window.
   - Sweep `meadowFrom` in {200, 300, 400}m.
3. **Emit a verdict.** Write `cycle69-validation/grass/far-ring-spike.json` with per-option draw calls / triangles / instances / coverage, plus a GO/NO-GO recommendation naming the winning approach + params, or NO-GO with the reason (as P5 did).

**Acceptance (EARS):**

- When Phase 2 ships, then `tools/grass-far-ring-spike.mjs` shall run under Node and import neither Three.js nor any [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) sim core.
- When the spike runs, then it shall write `cycle69-validation/grass/far-ring-spike.json` with per-option draw-call, triangle, and coverage numbers.
- When the spike completes, then its `recommendation` field shall state GO (with approach + `meadowFrom` + tile span) or NO-GO (with the reason).

**Outcome (2026-06-07):** Shipped `tools/grass-far-ring-spike.mjs` + `cycle69-validation/grass/far-ring-spike.json`. Baseline (current 760m window) = 829 draw calls / 7.31M triangles. Option A (40m meadow quads on far chunks) = zero draw-call change, 37.6% triangle cut at the play-area-safe `meadowFrom` 600m, coast- and relief-safe (40m quads stay SDF-culled + terrain-following). Option B (merged tiles, the only draw-call cut) = up to 34% fewer draw calls but over-tiles ~151 shore sub-cells (coast coarsening) and floats on leg relief, for no perf need (829 < the 1500 budget).

## Phase 3 - Grass far-ring implementation OR evidence-deferral (~2hr, gated on P2)

**Independently testable.** Render-only; gated on the P2 verdict. Either a contained, additive `GrassSystem` path or a documented defer - both are valid completions (the P5 -> P6 pattern).

1. **If P2 = GO:** implement the winning far-ring in `js/GrassSystem.js` as an **additive, SceneDef-gated** path (NOT a decomposition - the do-not-decompose rule stands; this adds one more gated branch, like the Cycle 64 coastline path). Gate on a new optional `grass.farRing` SceneDef field. Far chunks are SDF-culled (water already skipped) and terrain-following (the Cycle 51 displaced-quad fix). Wire the field on `newsheepdogland` only.
2. **If P2 = NO-GO:** leave `js/GrassSystem.js` unmodified; record the deferral with the spike numbers in the cycle close. No `types.js` touch.
3. **Validate (GO path).** A closed browser probe (`SDS_SUPPRESS_BROWSER_OPEN=1`, listener killed after) confirms the scene renders with the far-ring, reads `grass.stats` to confirm draw calls stay within the documented budget, and saves a screenshot to `cycle69-validation/grass/` for Matt's beauty pass.

**Acceptance (EARS):**

- If Phase 2's recommendation is GO, then `js/GrassSystem.js` shall gain an additive SceneDef-gated far-ring path and `shared/scenes/types.js` shall gain an optional `grass.farRing` field documented in this plan's Frozen-files section.
- If Phase 2's recommendation is NO-GO, then `js/GrassSystem.js` shall remain byte-unchanged and the deferral shall be recorded in [`BACKLOG.md`](BACKLOG.md) with the spike evidence.
- When Phase 3 ships an implementation, then a closed browser probe shall confirm the scene renders and the draw-call count stays within the documented budget, with a screenshot saved.
- While the far-ring change is render-only, then the 9 sheep sim-baselines shall stay byte-identical.

**Outcome (2026-06-07): DEFERRED with evidence (the P5 -> P6 pattern).** Option B is NO-GO (coarsens the coast, solves a non-problem). Option A is a viable, contained, one-flag triangle win (37.6%, coast/relief-safe, parity with the RH/OC desktop meadow-quad LOD) - but it is a VISUAL change to the exact scene Matt has a pending hero-capture + feel pass on (Cycle 68 P7 carryover), so per the media-prep split it bundles with his visual pass rather than shipping autonomously ahead of it. `js/GrassSystem.js` and `shared/scenes/types.js` left byte-unchanged (no fence touch this cycle); sim-baselines untouched (the change would have been render-only anyway). Carried to Cycle 70 with the Option-A recipe ready in the spike report.

## Phase 4 - Validate, ship, close (~1hr)

1. `/validate full`: `npm test`, `npm run build`, eslint, worker `tsc`.
2. Commit per-phase work, push to `main`, confirm the GH Actions deploy is green including the `Migrate D1 (remote)` job (a no-op this cycle - no new migration).
3. `/cycle-close` -> scaffold Cycle 70 (the Matt's-hands `survival-feel-and-media` track is the natural next slug).

**Acceptance (EARS):**

- When `npm test` runs at cycle close, then all vitest specs shall pass.
- When `npm run build` runs at cycle close, then the production build shall be clean within the bundle ratchet.
- When the close commit lands on `main`, then the GH Actions deploy shall succeed including the `Migrate D1 (remote)` job.

## Dependencies

```
Phase 1 (independent) ─┐
Phase 2 ─> Phase 3 ────┼─> Phase 4
```

## Frozen files (cycle-specific additions)

- **[`shared/scenes/types.js`](../shared/scenes/types.js)** - CONDITIONAL (Phase 3, GO path only). Adds an **optional** `grass.farRing` field (the cheap fence case per [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)). Migration story: optional with no default behavior change - scenes without `grass.farRing` keep today's chunk path byte-identical; only `newsheepdogland` opts in. Consumers updated in the same phase: the JSDoc typedef + `js/GrassSystem.js`. If P2 = NO-GO, this file is not touched.
- **`js/GrassSystem.js`** is NOT interface-fenced but is **do-not-decompose** (DECISIONS.md / scene-and-render.md). Phase 3's change is additive (one gated branch), explicitly not a decomposition. Cohesion-vs-size argument: the far-ring is one more build-time chunk-routing decision in the existing `buildChunks` loop, the same shape as the Cycle 64 coastline cull and the Cycle 23 meadow-quad path already living there.
- **`.claude/rules/multiplayer.md`** is NOT touched this cycle. Its now-inaccurate remote-migration lines stay carried over for Matt's explicit OK (the guardrail blocks an autonomous rules-file edit).

## Hard stops

Durable stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. **No `GrassSystem` decomposition.** If the GO-path implementation starts to require splitting the file, stop and defer to a dedicated cycle.
2. **No sim-baseline drift.** The far-ring is render-only; if any sheep sim-baseline changes, something is wrong - stop.
3. **No autonomous `.claude/rules/*.md` edit.** The `multiplayer.md` correction stays surfaced for Matt, not self-authorized.
4. **No new D1 migration** this cycle. If the work appears to need one, it has drifted scope - stop and surface.

## What NOT to do during this cycle

- Don't fold in the survival feel pass, the hero FINAL shot, or the two-client fun playtest - those are Matt's paired track (next cycle).
- Don't widen the body-parse fix into auth or validation behavior changes - it is purely "missing/invalid body -> clean client error", no other semantics move.
- Don't ship a far-ring that is a visual downgrade of the in-budget play disc just to claim a perf number. The disc already runs in budget; only ship coverage/perf the spike proves is a net win.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When a POST `/api/rename` arrives with no body, the worker shall respond `400`/`401`, not `500` (Phase 1).
- [ ] When the grass far-ring question is settled, the verdict shall be recorded with numbers and the implementation shipped or deferred with evidence (Phase 2/3).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 68 carryover)
- [`docs/archive/cycles/cycle-68-plan.md`](archive/cycles/cycle-68-plan.md) - the survival-polish cycle just closed
- [`tools/grass-rearch-spike.mjs`](../tools/grass-rearch-spike.mjs) - the Cycle 68 P5 spike this one extends
