# Cycle 32 - apple-platform-validation (leading) | mp-island-scenes (alternative)

> Drafted 2026-05-09 after Cycle 31 closed; **expanded same day** with carryover + research notes; **re-prioritized 2026-05-09** when an iPhone water-render bug surfaced and the work pulled forward. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Status:** **Apple-platform validation elevated to leading candidate** for Cycle 32 (see "Priority elevation" section directly below). `mp-island-scenes` demoted to alternative-if-blocked. Goal paragraph + phases still need to be filled in before `/cycle-start`; the elevation section gives a concrete starting shape.
>
> **Slug rationale:** `apple-platform-validation` is the new leading slug. It addresses an active player-visible Apple-platform bug + a structural validation gap that has accumulated across Cycles 9, 12, 26, and post-cycle-31 hotfixes without being closed. Alternative slugs flagged at start: (a) **`mp-island-scenes`** (was leading; deferred unless Apple-validation phase 0 lands fast enough that there's bandwidth) | (b) **modal-copy + visibility polish** if Cycle 31's Search Console signal still shows snippet leak | (c) **`CYCLE_TEMPLATE.md` regex fix + small sim-perf wins** if anything else feels too large.

## Priority elevation (2026-05-09): Apple-platform validation harness

**Trigger:** the user shared an iPhone screenshot ([`../cycle32-validation/iphone-screenshots/iphone-rh-water-2026-05-09.jpg`](../cycle32-validation/iphone-screenshots/iphone-rh-water-2026-05-09.jpg)) showing the Rolling Hills water rendering as solid `#eaf6ff` off-white. Same bug class previously hit Mac Safari + iPhone Safari and has been narrowing across cycles via reactive single-device patches. Android + Windows render correctly.

**Full analysis:** [`apple-water-bug-research-2026-05-09.md`](apple-water-bug-research-2026-05-09.md). Companion to [`cross-platform-testing.md`](cross-platform-testing.md) (living tooling matrix, updated same day) and [`archive/research/mac-bug-research.md`](archive/research/mac-bug-research.md) (Cycle 12 prior chapter).

**Root-cause hypothesis (high confidence pending device capture):** [`js/water/DepthPrePass.js:75-83`](../js/water/DepthPrePass.js) silently swallows render failures on Apple Metal-ANGLE. When the depth-stencil texture sampling returns `1.0` (depth-far) on the failed frame, [`js/water/AnimeWater.js:127`](../js/water/AnimeWater.js) computes `foamMask = 1.0 - step(threshold, 0) = 1.0`, mixing the entire water surface to `uFoamColor = #eaf6ff`. Three external Three.js issues confirm WebKit ships WebGL regressions across major iOS releases, and Apple has stated 32-bit float render targets are not supported on any iOS device with no fix planned (three.js #25741, kkinnunen-apple confirmation June 2024).

**Why prior cycles didn't catch this:**

- Cycle 9 stood up macOS Safari smoke (no iOS coverage; VM-provisioned Mac hardware hides Apple Silicon Metal quirks)
- Cycle 12 fixed sky precision + dither (banding regression; orthogonal to depth-pre-pass)
- Cycle 26 swapped ACES → Neutral tonemap on Apple (white-hue regression on terrain; orthogonal to depth-pre-pass)
- v2.0.4 extended the Cycle 26 fix to iPhone/iPad
- None of the above add real-device iOS CI, shader-output unit tests, or per-frame health checks for the depth pre-pass

**Engineering direction (no patchwork):** the user explicitly called for proper engineering, not workaround. Two intertwined tracks:

- **Track A (architecture):** rearchitect water to remove the per-frame depth-pre-pass dependency. Lean toward A1 (replace per-frame scene-depth sampling with a scene-load shoreline distance field) over A2 (keep depth pre-pass + add startup capability check + graceful degradation). A1 deletes [`js/water/DepthPrePass.js`](../js/water/DepthPrePass.js), saves ~10-15% of mobile frame budget, removes the entire bug class. Trade-off: loses depth-aware foam against opaque-objects-in-water (no current consumer in SDS). A2 is the smaller change and keeps the option of depth-aware features.
- **Track B (validation):** real iOS Safari in CI via LambdaTest ($15/mo Lite, free 60min/mo trial), per-shader unit tests via `headless-gl` (free, open-source), frame-end pixel sampling gate extending the existing [`glProbe`](../js/diagnostics/glProbe.js), and a local iOS device for live debug (user is currently charging an old iPhone SE; if it boots, paired with [Inspect.dev](https://inspect.dev) at $50/yr it gives Windows-side Safari Web Inspector access).

**Phase shape (proposed, not finalized; Matt confirms at `/cycle-start`):**

1. **Phase 0 (~30m):** capture `__sdsDiag` from a real iPhone while the bug is live. Path A: iPhone SE boots → Inspect.dev → grab diag. Path B: SE doesn't boot → LambdaTest free 60min → connect Web Inspector → grab diag. Output to `cycle32-validation/iphone-screenshots/diag-<ts>.json`. **This phase decides what the rest of the cycle does** (Track A1 vs A2, and whether anything else needs to land in the same cycle).
2. **Phase 1 (~2hr):** add `headless-gl` per-shader unit tests. Includes the canary: AnimeWater fragment with `uDepthTex = solid 1.0` shall NOT output within ε of `uFoamColor`. Catches our exact failure mode in CI on every PR, no LambdaTest needed.
3. **Phase 2 (~half-day):** wire LambdaTest into CI for a real iOS Safari screenshot test. One scene, one camera, one assertion (water region pixel-mean is not within ε of `#eaf6ff`).
4. **Phase 3 (~1 day):** ship the Track A architecture change. A1 by default; A2 only if Phase 0 reveals A1 breaks something we haven't anticipated.
5. **Phase 4 (~1hr):** extend `glProbe` for runtime frame-end pixel sampling gate. Players become an opt-in test farm via Sentry-grade alarms.
6. **Phase 5 (~30m):** doc updates. New rule entry in [`scene-and-render.md`](../.claude/rules/scene-and-render.md) (or new `apple-platform.md`) codifying "no per-frame RTT in shader paths without a capability check." Update [`cross-platform-testing.md`](cross-platform-testing.md) with the shipped tooling.

**Open questions for `/cycle-start` (carry into Goal paragraph):**

1. Is `apple-platform-validation` Cycle 32's primary goal, or does it run alongside `mp-island-scenes`?
2. Did the iPhone SE boot? Routes Phase 0 to local-debug or LambdaTest-only.
3. LambdaTest plan: free tier first (60 min) for the spike, then Lite ($15/mo) for ongoing? User has signaled willingness to pay.
4. Track A1 vs A2: ship A1 (shoreline distance field, remove DepthPrePass) in Cycle 32, or scope it as a follow-up cycle and ship A2 (capability check + degrade) now?

## Goal

One paragraph. What's this cycle for? What's the **user-visible** difference between "before" and "after"? If you can't write this paragraph clearly, the cycle isn't ready to start.

**Leading candidate (apple-platform-validation):** Today, the SDS render pipeline ships an Apple-platform regression class roughly once per cycle, the user discovers it on his own iPhone or Mac, and we patch it reactively against a single device. After this cycle, real iOS Safari runs in CI on every PR (LambdaTest), every shader has an executable unit test in CI that catches NaN / saturation regressions deterministically (`headless-gl`), the water render path no longer depends on a fragile per-frame depth pre-pass that Apple Metal-ANGLE silently fails on, and a runtime pixel-sampling gate alarms when player frames go solid foam-white. The user-visible difference: water renders correctly on iPhone Safari (the immediate bug), AND the next Apple regression gets caught in CI before Matt sees it on his phone.

**Alternative candidate (mp-island-scenes):** previously leading; demoted on 2026-05-09. Today, multiplayer rooms only run on Home Field. Players can pick Rolling Hills or Open Country in solo modes but multiplayer is locked to the flat starter pasture, which is the least cinematic and least interesting biome. This cycle would lift that restriction so multiplayer can run on any of the three biomes, while keeping the deterministic-sim contract intact (Worker DO + every connected client step the same shared sim against the same scene def, byte-identically).

**Other alternative scope candidates:** see "Carryover from Cycle 31" below.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. The ecosystem evolves; what was "the" solution last cycle may not be optimal now.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique. Use `PerformanceMonitor` and the per-system triangle breakdown.
- **Pick the simplest thing that meets the budget** rather than the most impressive. If the simple version reads correctly, ship it; escalate only on demonstrated need.

## Carryover from Cycle 31 (research notes)

Items deferred at Cycle 31 close + items that surfaced post-deploy. Roughly priority-ordered. **Pick one of these as Cycle 32's goal - or pick something off [`BACKLOG.md`](BACKLOG.md) Deferred - at `/cycle-start`.**

1. **MP island scenes** *(leading candidate, ~1 cycle)*. Rolling Hills + Open Country in multiplayer. Sim-deterministic; needs sim-baseline regen story. Research entry points:
   - [`shared/scenes/`](../shared/scenes/) - scene defs already exist for all 3 biomes; the Worker reads them.
   - [`worker/`](../worker/) - DO loads scene def at room create. Today the Worker's tick loop only knows about Home Field's flat-pasture flow (no heightfield sample, no boundary, no objective).
   - [`shared/MovementPhysics.js`](../shared/MovementPhysics.js) + [`shared/BoundaryCollision.js`](../shared/BoundaryCollision.js) + [`shared/FlockingAlgorithms.js`](../shared/FlockingAlgorithms.js) - already byte-identical between Worker + client. Need to verify they handle the OC multi-stage objective (gather → drive → portal) and the RH lightning-zap corral correctly when running in the Worker context.
   - **Sim-baseline contract** ([`tests/sim-baseline/`](../tests/sim-baseline/)): if MP scene support changes deterministic behaviour for any fixed seed, fixtures regenerate **with the regenerate step explicitly recorded in the cycle plan's Acceptance section** (per [`shared-sim.md`](../.claude/rules/shared-sim.md) lockdown rules). Don't regenerate as a shortcut.
   - **Wire-format implications** ([`multiplayer.md`](../.claude/rules/multiplayer.md)): the per-frame state delta currently encodes one boundary type. RH + OC introduce different objective shapes (`roundup`, `drive`) - does the wire delta stay compact, or does the protocol need a version-tag? If the latter, an in-flight-session migration story is required.

2. **Modal-copy rewrite** *(small, ~30m)*. **Defer until Cycle 31's Google recrawl signal arrives** (1-7 days post-2026-05-09). If the snippet for `sheep dog sim` still substitutes the welcome modal text after Search Console reports the recrawl complete, rewrite [`js/locales/en/index.js:388-389`](../js/locales/en/index.js) (`identity.welcome` + `identity.chooseIdentity`) so they don't read as "page content." UX-touching, low-risk, single file.

3. **`CYCLE_TEMPLATE.md` regex-collision fix** *(small, ~15m, fence-touched)*. The `/cycle-close` reconcile hook ([`.claude/hooks/cycle-close-reconcile.mjs`](../.claude/hooks/cycle-close-reconcile.mjs)) hits the "## Acceptance criteria - EARS format" template explainer header before the actual `## Success criteria` block, so it can't parse acceptance lines. Cycle 29 + 30 + 31 all logged the manual workaround. Touches a fence file ([`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md)). Could attach as Phase 0 of any cycle - including this one. Fix options: (a) rename the explainer section to "## EARS notation conventions"; (b) tighten the hook regex to require `(cycle close)` in the matched header; (c) both.

4. **Bespoke pixel-forge rocks** *(medium, ~1 phase)*. Replace the icosa+noise primitive rocks ([`scripts/bake-rocks.mjs`](../scripts/bake-rocks.mjs)) with rocks baked via Pixel Forge (the local `C:\Users\Mattm\X\games-3d\pixel-forge\` tool also used for tree impostors in Cycle 20). Visual upgrade, no sim impact.

5. **Octahedral impostors v2** *(medium, ~1 phase)*. Current octahedral impostor at LOD2 (Cycle 18) uses a 4×4 lat/lon atlas with single-tile picker - the file's own comment admits "not actually octahedral." Industry-standard is 16×16 with bilinear blend between adjacent tiles. Visual upgrade for far foliage on desktop tier. **Mid-tier desktop perf re-validation required** before shipping (per [`scene-and-render.md`](../.claude/rules/scene-and-render.md) "no LOD1 desktop" rule).

6. **Cross-module polygon-spawn dedup** *(small refactor, ~1 phase)*. Cycle 29 extracted `calculatePolygonSpawnConfig` to `js/gamestate/polygonSpawn.js` but the Worker DO has a parallel implementation. If both run the same logic, this is a candidate for `shared/`. Verify no determinism drift before extracting.

7. **Build-time `displacedHeights` bake** *(small, ~1 phase)*. Cycle 30's `Heightfield.bakeMeshGrid` runs at scene-load time. Moving the bake to [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs) would let the Worker pre-load the mesh grid without recomputing. Speculative - only justified if MP island scenes (item 1) lands AND the Worker actually needs visual-Y for something. Consider together with #1.

8. **Inline / delete [`TerrainBuilder._groundY`](../js/TerrainBuilder.js)** *(tiny cleanup, ~10m)*. It's a one-liner since Cycle 30; [`scene-and-render.md`](../.claude/rules/scene-and-render.md) treats it as a named entry point. Inlining is a separate decision codifying that the entry-point semantic is no longer load-bearing.

9. **Research: stochastic indecisiveness as a control primitive** *(reading list, not a phase)*. Science Advances March 2026 paper [Controlling noisy herds: Temporal network restructuring improves control of indecisive collectives](https://www.science.org/doi/10.1126/sciadv.adx6791) (DOI 10.1126/sciadv.adx6791). Studies how trained sheepdogs **exploit** sheep indecisiveness (the unpredictable flee/follow switching) as a control mechanism rather than fighting it. Models sheep as a stochastic temporal network. Generalizes from shepherding to swarm robotics.

   Where it could inform SDS:
   - **Smarter sheep model.** Today [`shared/FlockingAlgorithms.js`](../shared/FlockingAlgorithms.js) uses pure force-based separation/cohesion/alignment with no indecisiveness term. A stochastic flee/follow switch with probability dependent on dog angle + relative speed (not just distance) could read as more realistic sheep behaviour. Sim-deterministic implementation needs a seeded PRNG branch (mulberry32 already in `shared/`).
   - **NPC dog AI.** A learned policy or heuristic dog that exploits the indecision pattern instead of pure pursuit. Useful for: a solo training mode that demos "good" herding lines, a multiplayer bot opponent, an in-game tutorial dog.
   - **Splitting mechanic.** The paper notes that exploiting indecision enables both herding AND splitting noisy groups. A future game mode where you separate one flock into two corrals would be a direct application.

   Adjacent reading already surfaced: "Automated Herding of Sheep Using Artificial Neural Networks" (academia), "Learning to Herd Agents Amongst Obstacles" ([arxiv 2005.09476](https://arxiv.org/abs/2005.09476)), "Solving the Shepherding Problem: Heuristics for Herding Autonomous, Interacting Agents" (researchgate).

   This is **inspiration / future direction**, not an actionable phase. Slack-time pickup: a 1-page summary doc in [`docs/research/`](research/) (new dir) noting takeaways + which game systems each finding could touch. Useful before any cycle that touches sheep-AI or adds NPC dogs.

## Open questions to resolve before writing code

If MP island scenes is picked:

1. **Q1: Does the Worker DO need to load the scene's heightmap binary (.r32f / .bin)?** The deterministic sim uses raw `Heightfield.sample(x, z)` for slope-modulated speed. Today the Worker only runs Home Field which has no heightfield. Author lean: **yes** - the DO needs to fetch the heightfield binary at room create, because slope-modulated speed is a real physics input on RH + OC. Implementation: store heightmap binaries in the Worker's static asset bundle OR have the DO fetch them from Pages on first room init (cached via DO storage).

2. **Q2: How does the Worker handle Open Country's multi-stage objective state machine (gather → drive → portal)?** Today [`shared/GameStateValidation.js`](../shared/GameStateValidation.js) handles win conditions but the OC objective state lives in client `js/gamestate/objective.js`. Author lean: **promote the objective state machine to `shared/` and have the DO consume it** - same module the client uses, byte-identical behaviour, sim-baseline regeneration once.

3. **Q3: Does the per-frame wire delta need a version tag or schema change?** Boundary shape, objective state, and corral state are scene-specific. Today the delta encodes one shape. Author lean: **no schema change for Cycle 32 if scenes can be encoded as discriminated unions on existing fields**; new fields default-to-omitted on older clients. Confirm with a payload-shape audit before phase 1.

4. **Q4: Sim-baseline regeneration - full regen or per-scene?** Author lean: **per-scene** - keep Home Field's existing fixture untouched (regression detection for MP today's behaviour), add new fixtures for RH + OC under fresh seeds. New tests live in [`tests/sim-baseline/`](../tests/sim-baseline/).

If modal-copy rewrite is picked:

1. **Q1: Wait for Google recrawl signal first?** Author lean: **yes** - running `site:sheepdogsim.com` in incognito + checking the snippet for `sheep dog sim` after the validate-fix email arrives will tell us whether the `<main id="seo-content">` block was sufficient. Don't rewrite modal copy if the snippet already moved.

If `CYCLE_TEMPLATE.md` fix is picked:

1. **Q1: Rename the section, tighten the hook regex, or both?** Author lean: **both** - rename "## Acceptance criteria - EARS format" → "## EARS notation conventions" (clearer; doesn't trigger the regex), and add a `(cycle close)` requirement to the hook regex (defensive against future template tweaks).

## Architecture / shared changes

(If the cycle introduces a primitive or schema change shared across phases, describe it here. Otherwise delete this section.)

## Phase shape rules

A cycle has **≤ 8 phases**. If you find yourself drafting a 9th, the work is two cycles, not one.

Each phase is either **fully autonomous** (the agent ships without Matt's pairing) or **fully paired** (Matt's hands on the keyboard for it). **Don't mix modes within a phase** - "I'll do steps 1–3 autonomously and pause for Matt at step 4" produces stale handoffs and partial commits. "Matt pickup" work (taste, real-device, design, marketing voice) scopes as a paired-track cycle, not appended to an autonomous cycle.

A phase has a **single sharp goal** (one new file, one extraction, one decision codified) and **≤ 4 hours** of work. Larger means split.

## Acceptance criteria - EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/) so the lines are testable by construction:

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

Each line should be **grep-testable** - the response should be something a script can verify (`wc -l`, `grep`, `npm test`, a build artifact's existence). The `/cycle-close` reconciliation hook walks every Acceptance line and tries to grep its predicate against shipped commits + test output.

Example: `When Stream B1 ships, then `wc -l js/main.js` shall return ≤ 2,200.`

## Phase 1 - <name> (~Xhr)

**Independently testable.** <Why this phase comes first.>

1. **Step.** Description + [`file path`](path).
2. **Step.** Description.

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.
- While `<precondition>`, the `<system>` shall `<response>`.

## Phase 2 - <name> (~Xhr)

**Depends on:** <Phase 1 / nothing / etc.>

1. ...

**Acceptance (EARS):** ...

## Phase N - Polish (optional, ~Xhr)

Nice-to-haves once Phases 1..N-1 land. Skip any that don't move the needle in playtest.

## Dependencies

Prose ordering. Mostly serial, occasional parallelism:

```
Phase 1 → Phase 1.5 → Phase 2 + Phase 3 (parallel) → Phase 4 (optional)
```

When two phases can run in parallel, say so. When one depends on another's specific output, say what.

## Frozen files (cycle-specific additions)

These files require explicit task-brief authorization to modify within this cycle. The durable fence list is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md); add cycle-specific freezes here only if the work pattern requires extra discipline.

- (Cycle-specific additions, if any. Often empty - the durable fence is enough.)

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). The list below adds **cycle-specific** stops that aren't covered by the durable list:

1. (Cycle-specific addition - e.g. "Phase A beacon shows zero pageviews after 1hr - pull the hook.")
2. (Cycle-specific addition.)

## What NOT to do during this cycle

(Cycle-specific list - things that look like next-cycle scope creep, refactors that should wait, ideas that have been decided against.)

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check. Each item should be EARS-form so the cycle-close reconciliation hook can grep its predicate against shipped commits + test output.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] (Cycle-specific qualitative criteria - e.g. "When Cycle 5 closes, Rolling Hills shall feel meaningfully different from Field per playtest.")

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) - pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
- [`docs/archive/cycles/`](archive/cycles/) - past cycle plans
- [EARS notation](https://kiro.dev/docs/specs/) - testable acceptance lines
