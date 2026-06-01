# Cycle 51 - frontend-loading-and-assets-redesign

> Drafted 2026-06-01 after Cycle 50 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

> **NOT AUTHORED YET. This cycle opens with an alignment check-in and a first-principles brainstorm, not phase execution.** The Goal and Open Questions below are seeded from Matt's brief at Cycle 50 close. Do not start writing phases or code until the brainstorm converges and this plan's Phases / Acceptance sections are filled in. Run the brainstorm, author the plan, then `/cycle-start`.

## Goal

A first-principles redesign of the frontend: the stack, the component structure, and how every UI component is instantiated and implemented, plus the loading sequence, the entrance, the visual style and icon system, and the non-scene art. This is a "step back and rethink the whole shell" cycle, not an incremental restyle. The user-visible target is a coherent, intentional entrance + loading + scene-switch experience that replaces the current drift, with a style and art direction we chose on purpose rather than accreted.

Concrete pain points to resolve (Matt's brief, 2026-06-01):

- **Vestigial skeleton loader.** Clicking Play shows a skeleton-loading "motor" before the game starts. It is an artifact from an earlier sequence where skeleton loading made sense; in the current flow it does not. Decide whether to remove it or replace it with a loading affordance that fits the actual sequence.
- **Degraded zen entrance.** We once had a nice zen-like entrance that loaded the full selected scene. It degraded: we no longer load the full selected scene at entrance because the scene plus its assets cost more and take longer (larger file sizes). Decide the entrance model given asset weight (lightweight preview, full-scene, a non-scene backdrop, or a new concept).
- **Void scene-switch backdrop.** Scene switching works now, but the background behind the picker is a basic "void" that serves no purpose. Decide what the picker/switch backdrop should be (art, a concept, a live preview).
- **Style drift and ugly icons.** The visual style has drifted and some icons are unattractive. Establish a coherent style and icon system.
- **Frontend stack and structure.** Open to reworking the stack, the component structure, and the instantiation/implementation patterns from first principles, not just reskinning.
- **Non-scene assets and art.** Likely introduce new concepts and art (non-scene assets) as part of the look.

## How to read this plan

This cycle is unusual: it begins **paired** (the brainstorm and alignment are Matt-on-keyboard), and only the autonomous implementation phases get authored afterward. See [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) for the standard structure once phases exist.

## Open questions to resolve in the brainstorm

The brainstorm exists to answer these. Author leans are deliberately left blank for the alignment session.

1. **Q1: Stack and structure.** Keep the current React + Vite + token/primitive stack, or rework it? What is the component instantiation/implementation model?
2. **Q2: Entrance model.** Given scene + asset weight, what does first paint show? Full selected scene, a lightweight preview, a non-scene art backdrop, or a new concept?
3. **Q3: Loading sequence.** What replaces the vestigial skeleton loader? What does the Play to in-game transition actually show, and is it driven by real load progress?
4. **Q4: Scene-switch backdrop.** What sits behind the scene picker instead of the void?
5. **Q5: Style and icon system.** What is the coherent style direction and icon set? How much of the Cycle 49 pastoral design language do we adopt vs revisit?
6. **Q6: Non-scene art.** What new art and concepts get introduced, and how are they sourced (in-repo primitive bakes per the asset-pipeline preference, or otherwise)?

## Inputs to the brainstorm

- The Pastoral UI/UX program already captured a vision for much of this: [`ui-design-language.md`](ui-design-language.md), [`entrance-loading-spec.md`](entrance-loading-spec.md), [`ui-migration-map.md`](ui-migration-map.md), and the standalone `/gallery` headless review route (sheepdogsim.com/gallery). Decide how much to adopt vs redo from first principles.
- Entrance history: the zen-boids attract entrance (Cycle 46) and its later degradation are relevant prior art.

## Architecture / shared changes

(To be decided in the brainstorm. Expected client-only / render-only; this cycle should not touch the deterministic sim, sim-baseline, SceneDef, or the Worker unless the brainstorm explicitly decides otherwise with a migration story.)

## Phase shape rules

Standard (see [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md)): <= 8 phases, each fully autonomous or fully paired, single sharp goal, <= 4 hours.

## Phases

(Unauthored. Fill in after the brainstorm converges. The brainstorm is the paired opener; implementation phases that follow are autonomous unless flagged paired.)

## Frozen files (cycle-specific additions)

(To be set when phases are authored. The durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) applies regardless.)

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). One standing stop for this cycle: do not start implementation phases before the brainstorm converges and this plan is authored. Cycle-specific stops get added with the phases.

## What NOT to do during this cycle

- Do not start coding before the alignment brainstorm. The whole point of this cycle is to rethink first, then build.
- Do not touch `shared/`, sim-baseline, SceneDef, or the Worker unless the brainstorm explicitly decides to, with a migration story.

## Success criteria (cycle close)

`/cycle-close` reads this section. Don't pre-check. Refine when phases are authored.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md), [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md), [`BACKLOG.md`](BACKLOG.md).
- Pastoral UI program: [`ui-design-language.md`](ui-design-language.md), [`entrance-loading-spec.md`](entrance-loading-spec.md), [`ui-migration-map.md`](ui-migration-map.md).
- [EARS notation](https://kiro.dev/docs/specs/) for the acceptance lines once phases are authored.
