# Cycle 32 - mp-island-scenes (placeholder)

> Drafted 2026-05-09 after Cycle 31 closed; **expanded same day** with carryover + research notes from the post-deploy work. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Status:** carryover + open questions populated; **Goal paragraph + phases still need to be filled in** before `/cycle-start`. Slug `mp-island-scenes` is the leading candidate but Matt re-confirms scope at start.
>
> **Slug rationale:** `mp-island-scenes` is the top BACKLOG candidate per Cycle 31 close notes (Rolling Hills + Open Country in multiplayer; sim-deterministic; needs sim-baseline regen story). Two alternative scopes worth flagging at start: (a) **modal-copy + visibility polish** if Cycle 31's Search Console signal arrives showing the snippet still leaks (1-7 days post-2026-05-09); (b) **`CYCLE_TEMPLATE.md` regex fix + small sim-perf wins** if MP island scenes feels too large to ship clean in one cycle.

## Goal

One paragraph. What's this cycle for? What's the **user-visible** difference between "before" and "after"? If you can't write this paragraph clearly, the cycle isn't ready to start.

**Leading candidate (mp-island-scenes):** Today, multiplayer rooms only run on Home Field. Players can pick Rolling Hills or Open Country in solo modes but multiplayer is locked to the flat starter pasture, which is the least cinematic and least interesting biome. This cycle would lift that restriction so multiplayer can run on any of the three biomes, while keeping the deterministic-sim contract intact (Worker DO + every connected client step the same shared sim against the same scene def, byte-identically).

**Alternative scope candidates (if mp-island-scenes is too large or gets blocked):** see "Carryover from Cycle 31" below.

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
