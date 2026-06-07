# Cycle 70 - survival-feel-and-media

> Drafted 2026-06-07 after Cycle 69 (`grass-far-ring-and-api-hardening`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Mode: autonomous** (Matt: "author entire cycle the implement and complete and close and commit and deploy"). Same contract as Cycles 67-69: ship the autonomously-implementable items end-to-end, defer the irreducibly-paired items with evidence, Matt reviews after. This cycle is the Matt's-hands / paired track from the Cycle 69 carryover, so the deferrals are first-class outcomes, not gaps.

## Goal

Convert the Cycle 69 carryover into shipped work where it can be shipped autonomously, and into evidence where it cannot. Implement the measured grass far-ring Option A (the coastline meadow-quad LOD, behind a SceneDef opt-in) on Newsheepdogland so the survival island sheds 37.6% of its grass triangles with zero draw-call change and zero coast/relief regression. Produce a numbers-backed survival feel-pass readiness audit so Matt's live taste pass starts from cross-checked starting points rather than a blank page. Refresh the entrance hero capture against the post-grass scene so Matt's media pass judges the current look. The before/after for a player: the same Newsheepdogland coast, lighter on the GPU in the far ring. The before/after for Matt: a tuned-numbers audit and a current hero candidate to react to, not raw TODOs.

## Open questions (resolved - autonomous)

1. **Q1: far-ring `meadowFrom` distance?** Resolved: 600m from `grassCenter`. The Cycle 69 P2 spike (`cycle69-validation/grass/far-ring-spike.json`) marks 600m as the play-area-safe value: 37.6% triangle cut, zero coast coarsening, zero relief float. Smaller values (300/500m) cut more but risk meadow quads inside the player's near view. Conservative wins; Matt can lower it in review.
2. **Q2: change any survival feel constants autonomously?** Resolved: no. `shared/survival/tuning.js` documents in-file that the values are Matt's spec and the feel pass is his paired track ("feel needs a live wolf night to judge"). That durable file-level signal outranks the session directive for the taste call. P2 audits, it does not retune. Exception that did not fire: a hard playability bug (wolves outrunning every dog) would be objective, not taste - the audit confirms no such bug exists.
3. **Q3: ship the hero shot?** Resolved: produce candidate stills as artifacts, defer the FINAL blessing + publish to Matt (media-prep split: Claude writes the manifest and runs the capture, Matt drives the final beauty pass and any publish).

## Phase 1 - Grass far-ring Option A (coastline meadow-quad LOD) (~1.5hr)

**Independently testable.** The render-path change with the measured payoff. Render-only, so it cannot touch the deterministic sim or its baselines by construction.

1. **Add `farRing` to `GrassDef`** in [`shared/scenes/types.js`](../shared/scenes/types.js) - the cheap additive fence case (a new optional field with a default-absent meaning "no far ring"). JSDoc only; no runtime behavior in the typedef.
2. **Thread it in [`js/GrassSystem.js`](../js/GrassSystem.js)** - store `this._farRing` next to `_tallZones`/`_grassCenter`; in the chunk-build loop, after the coastline SDF cull, route coastline far chunks (distance from `grassCenter` beyond `farRing.meadowFrom`) through the existing `createMeadowQuadChunk`. This is the same desktop LOD Rolling Hills / Open Country already use, extended to the coastline grid behind the opt-in. Additive gated path, not a decomposition (per scene-and-render.md and DECISIONS.md). The existing non-coastline meadow branch is left byte-identical.
3. **Enable on Newsheepdogland** - add `grass.farRing: { meadowFrom: 600 }` to [`shared/scenes/newsheepdogland.js`](../shared/scenes/newsheepdogland.js). Every other scene omits `farRing` and is byte-identical.

**Acceptance (EARS):**

- When `grass.farRing.meadowFrom` is set on a coastline scene, the GrassSystem shall render that scene's far chunks (beyond `meadowFrom` from `grassCenter`, on land per the SDF cull) as terrain-following meadow quads instead of clump blades.
- While a scene omits `grass.farRing`, the GrassSystem chunk build shall be byte-identical to its pre-Cycle-70 output (Rolling Hills, Open Country, Home Field, and the non-far-ring coastline path unchanged).
- When `npm test` runs, the 10 sim-baseline fixtures (including `coastline-newsheepdogland-60hz.json`) and the refactor-baseline scatter/terrain fixtures shall be unchanged (render-only change, no sim or scatter impact).
- If the production `main-*.js` chunk exceeds the recorded `mainKB` ratchet, then the agent shall record the byte delta and the feature justification in this Acceptance section before bumping the fixture.

## Phase 2 - Survival feel-pass readiness audit (~1hr)

**Independently testable.** No code change to the spec. Produces a written audit artifact so Matt's live pass starts from numbers.

1. **Cross-check the three FEEL PASS NOTES concerns** in [`shared/survival/tuning.js`](../shared/survival/tuning.js) against the real constants:
   - Wolf-vs-dog speed: huntSpeed 11.5 / fleeSpeed 13 vs dog 15 walk / 25 sprint single-player (30 / 50 in co-op survival, the doubled `speedMultiplier`). Dog speed is uniform across the five dogs (per-dog Speed/Stamina/Control are cosmetic locale flavor, not wired to gameplay). Conclusion: the dog is strictly faster than the wolf on every dog in every mode; the shoulder-off mechanic is viable; no playability bug.
   - Day-1 lethality: base 2 wolves, killCooldown 1.2s, startFlock 10, lossThreshold 1/3 (run ends at ~4 night losses). The math and the suggested softening levers (raise killCooldown over cutting pack count).
   - Growth vs cap: growth 5 against maxFlock 200 (~38 surviving days to the ceiling).
2. **Write [`cycle70-validation/survival-feel/audit.md`](../cycle70-validation/survival-feel/audit.md)** with the numbers and the recommended live-tuning order, explicitly leaving the spec values unchanged.

**Acceptance (EARS):**

- When Phase 2 ships, then `cycle70-validation/survival-feel/audit.md` shall exist with the wolf-vs-dog speed cross-check, the day-1 lethality math, and the growth-vs-cap math.
- While the audit is authored, the agent shall change no value in `shared/survival/tuning.js` (the spec is Matt's paired track).
- When `npm test` runs, the survival specs shall be unchanged (no tuning drift).

## Phase 3 - Entrance hero capture refresh (~0.75hr)

**Depends on Phase 1.** Re-runs the existing capture tool against the post-grass scene so the far-ring is visible in the hero background, producing a current candidate for Matt's media pass.

1. **Run [`tools/hero-capture.mjs`](../tools/hero-capture.mjs)** against a local Vite preview (`SDS_SUPPRESS_BROWSER_OPEN=1`), producing the 1920x1080 + 1200x630 candidates.
2. **Copy the candidates to `cycle70-validation/hero/`** and note in a short README that the far-ring is now active in the background, FINAL blessing + publish deferred to Matt.
3. **Browser-probe hygiene** - close the Playwright browser, stop the Vite listener, confirm no stray `127.0.0.1:3000` process remains.

**Acceptance (EARS):**

- When Phase 3 ships, then `cycle70-validation/hero/` shall contain a current 1920x1080 hero candidate captured against the far-ring-enabled scene.
- If the capture tool cannot run cleanly headless, then the agent shall degrade to a documented media-note (flag the scene as changed for Matt's pass) rather than block the cycle.
- When the probe finishes, the agent shall leave no Vite listener or Chrome process running.

## Phase 4 - Validate + close + commit + deploy (~0.75hr)

**Depends on Phases 1-3.** The autonomous close.

1. `npm test` + `npm run build` + `npx eslint` + worker `tsc` all green.
2. Confirm sim-baselines + scatter/terrain refactor-baselines unchanged; main bundle within ratchet (or ratchet bumped with the P1 justification).
3. `/cycle-close` ritual: archive this plan, append BACKLOG, scaffold cycle-71, rewrite NEXT_SESSION, refresh memory.
4. Commit per-phase work, push to main, confirm the GH Actions deploy is green, verify prod.

**Acceptance (EARS):**

- When the cycle closes, then `npm test` and `npm run build` shall pass and the last `main` deploy shall be green.
- When the close lands, then `docs/cycle-70-plan.md` shall be archived and `docs/cycle-71-plan.md` scaffolded.

## Dependencies

```
P1 (grass) -> P3 (hero capture against post-grass scene)
P2 (audit) independent
(P1, P2, P3) -> P4 (validate + close + deploy)
```

## Frozen files (cycle-specific authorization)

- **`shared/scenes/types.js`** - AUTHORIZED for P1. Adds one optional `farRing` field to `GrassDef` (a `{ meadowFrom: number }` typedef). Migration story: optional + absent-means-off, so every existing scene is byte-identical; the only consumer is the client `GrassSystem` (render); the Worker sim never reads `grass`, so determinism is untouched. The cheap additive fence case, same shape as the Cycle 64 `tallZones` / `grassCenter` additions.
- **`.claude/rules/multiplayer.md`** - NOT authorized. The Cycle 68 P1 remote-migration lines are factually wrong, but editing a `.claude/rules/*.md` file is agent-config self-modification, blocked without Matt's explicit per-edit OK. "Do the whole cycle" is the same phrasing that did not authorize it in Cycle 69; held consistent. Deferred to Matt.

## Hard stops

Durable stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. If the grass far-ring change drifts any sim-baseline or scatter/terrain refactor-baseline fixture, stop - it means the change leaked out of the render path (it must not).
2. If the far-ring meadow quads read as obvious flat planes or tile over water in the hero capture, stop and revert the `meadowFrom` to a safer (larger) value or pull the opt-in; do not ship a visible coast regression to Matt's hero scene.

## What NOT to do during this cycle

- Do not retune `shared/survival/tuning.js` values (Matt's paired taste track).
- Do not edit `.claude/rules/multiplayer.md` (agent-config guardrail).
- Do not publish or bless a FINAL hero shot to any player-facing surface (media-prep split).
- Do not decompose `GrassSystem` / `OptimizedSheep`; the far-ring is an additive gated path.
- Do not bump the player-visible version.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean and the main bundle within (or with a documented bump of) the ratchet.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the cycle closes, the grass far-ring shall be live on Newsheepdogland and the survival feel audit + hero candidate shall exist as artifacts.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 69 carryover)
- [`docs/archive/cycles/cycle-69-plan.md`](archive/cycles/cycle-69-plan.md) - the cycle just closed
- [`cycle69-validation/grass/far-ring-spike.json`](../cycle69-validation/grass/far-ring-spike.json) - the Option A recipe + numbers
- [`cycle68-validation/hero/manifest.md`](../cycle68-validation/hero/manifest.md) - the hero-shot manifest
