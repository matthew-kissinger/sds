# Cycle 113 - entrance-one-door

> Authored 2026-07-25 from [`front-door-roadmap.md`](front-door-roadmap.md) "Cycle 113" and the locked register in [`../DECISIONS.md`](../DECISIONS.md) "Front door alignment". Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

The entrance asks exactly one question. Today it asks seven: world, mode family, difficulty rung, dog, name, tutorial, and which of three secondary ways to play, across 449 lines of inline style objects with no hover, focus or active states. Cycle 112 cleared the noise around it and fixed the art that sells it; this cycle replaces the door itself with Direction A (D3), phone case first, in TypeScript on a real stylesheet against the pastoral tokens only (D16). After this cycle a first-time visitor sees a hero, a world name, one summary line, and Play. Everything else either collapses into a picker that opens in place, moves off the primary surface (D6), or moves inside the first round (D4). This is the reference UI pattern the rest of the interface migrates onto as each surface is touched.

## How to read this plan

This doc fixes the *shape* of the changes. Where it names a technique, that is a starting point, not a mandate. Measure before choosing.

The cycle runs **fully autonomously** at Matt's direction ("complete cycle fully autonomously, I trust your judgement", 2026-07-25). The open questions below are resolved inline with the reasoning recorded, rather than surfaced for a decision.

## Resolved questions

**Q1: what does the picker do with the mode family?** Home Field and Rolling Hills carry two families (Solo, Counting Sheep); Open Country carries one (Objective); Newsheepdogland carries one (Survival). D7 governs rungs, not families.

**Resolved: families stay a row of chips inside the picker, rungs sit under them, and a single-family world renders no family row at all.** The alternative, folding families into the rung list as a flat set of seven, loses the fact that a counting curve and a sheep count are different kinds of thing. A single-family world currently renders its family as an uppercase label; that label is pure decoration once the picker is a deliberate act, so it goes.

**Q2: which three rungs are visible under D7, and what is behind More?** The Home Field ladder is Just Play 30, Classic 200, Extreme 1000, Insane 3000, Chaos 5000.

**Resolved: the first three ladder entries are visible, the rest sit behind More, and an armed rung is always visible regardless of position.** First-three is the rule rather than a hand-picked set, because the two islands run their own ladders and a hardcoded id list would silently show the wrong three there. The armed-rung exception matters on a return visit: a player whose last run was Chaos must not open the entrance to three rungs, none of them theirs. `More` expands in place and does not collapse again for the session.

**Q3: the entrance panel covers the lower-centre, which is where D8 puts the dog. Re-shoot the heroes, or move the panel?** Measured from `cycle112-validation/heroes/measurements.json`, all four heroes put the dog in a tight vertical band: 73.5%, 76.0%, 75.0% and 74.0% down the frame, at 3.9% to 5.5% of frame height. Horizontally they are spread (36.0%, 63.0%, 60.0%, 37.5%), so no single side is clear on all four.

**Resolved: move the panel, do not re-shoot.** The vertical band is the opening. A collapsed one-door panel is roughly 150px tall against today's 362px, so keeping its top edge low enough clears every dog on every scene, and that is a number a test can hold. Re-shooting to dodge a panel would trade a brief the D8 register locked for a layout this cycle is still moving. Phase 6 measures rather than assumes, and carries an escape hatch if the measurement disagrees.

> **Corrected in flight (Phase 3).** The threshold above was first written as 72%, which was wrong: it compared the panel against the dog's **centre** band (73.5% to 76%) and forgot the dog's own height. Counting it, the dogs span 70.8% to 78.0% of frame height, so the real floor is 78.0%. Measured live, a panel still carrying the world name and tagline settled at 70.1% and went through all four dogs. The fix was to move the world name, the tagline and the carousel dots onto the photograph, which cost the panel 59px and put its top edge at 79.3%. The resolution held; only the number was wrong. Phase 6's gate uses the measured figure.
>
> **A second thing the measurement found (Phase 6).** The vertical band was never the whole problem. A 1920x1080 hero in a 390x844 portrait viewport under `object-fit: cover` shows only the middle 26% of the image width, and centred that put Home Field's dog at -3.9% of the viewport and Rolling Hills' at 100%. Two heroes with no dog in them, on a phone, which is the case the cycle was told to design first. Fixed with a per-world `objectPosition` (step 3 below), not by re-shooting.

**Q4: does the tutorial keep an accept step when it moves in-round (D4)?** Today it is an offer card on the entrance with a meadow-green "Show me" that is the second primary button on first paint, which D4 names as the worst thing about that paint.

**Resolved: no accept step. The prompts simply appear in the first round and retire themselves as the player does each thing.** An in-round card with two buttons would move the second primary button rather than remove it. The existing machine already advances on observed movement, sprint, camera and penned count, so it needs no consent to be useful and it costs a player who ignores it nothing. `startTutorial()` keeps its swap-then-attach shape for the Settings replay control.

## Architecture

Two new files carry the cycle, and one existing file loses most of its body.

- **[`../css/entrance.css`](../css/entrance.css)** (new). The entrance's own stylesheet in `@layer components`, imported from [`../css/main.css`](../css/main.css). Class prefix `sds-ent-`. Pastoral custom properties only, no raw hex, per D16. Phone case is the base rule set; desktop is a `min-width: 721px` upgrade, matching `useViewport`'s existing `compact` breakpoint so JS and CSS agree on one number.
- **[`../js/components/entrance/EntrancePicker.tsx`](../js/components/entrance/EntrancePicker.tsx)** (new). Family chips, rungs plus More, dog row. Presentational over the existing `BootFlow`; owns no persistence.
- **[`../js/components/entrance/Entrance.tsx`](../js/components/entrance/Entrance.tsx)** shrinks to the shell: hero, wordmark, corner nav, world arrows, world name, summary line, Play, one multiplayer line.

`BootFlow` (in [`../js/components/entrance/useBootFlow.ts`](../js/components/entrance/useBootFlow.ts)) is **not** reshaped. Its surface already carries everything the new entrance needs and it is consumed by `LoadingScreen` and `App.js` as well. A picker rewrite that also rewrites the flow hook would put two unrelated diffs in one review.

### The contracts the rewrite must not break

Four Playwright specs drive the live entrance. They are not frozen, but each is a real contract and a change to one belongs in the same commit as the code that moved it:

| Selector | Specs | Disposition |
|---|---|---|
| `button` named exactly `Play` | smoke, oc-perf, scene-swap-stability, mobile-asset-visibility, foliage-streaming, overlay-collision | **Preserved.** One primary action is the whole point of D3. |
| `button` named `/Next world/i` and `Previous world` | smoke, oc-perf, mobile-asset-visibility | **Preserved.** D3 moves the arrows to the image edges; the accessible names stay. |
| `button` named `/Classic\s+\d/i` | oc-perf, mobile-asset-visibility | **Changes.** The rung lives inside the picker now, so the specs open it first. Update in Phase 3. |
| `#react-overlay` scoped world-name text | smoke | **Preserved.** The world name stays a text node in the overlay. |

## Phase 1 - `css/entrance.css`, a real stylesheet (~2hr)

**Independently testable, and nothing consumes it yet.** Landing the sheet before the markup means Phase 3 is a markup diff rather than a markup-and-styling diff.

1. **New [`../css/entrance.css`](../css/entrance.css)**, `@import`ed from [`../css/main.css`](../css/main.css) after the Tailwind import so `@layer components` resolves. Namespace every class `sds-ent-`.
2. **Phone first.** Base rules are the 390x844 case. One `@media (min-width: 721px)` block upgrades to desktop, matching `useViewport`'s `compact` boundary.
3. **Real interaction states.** Every interactive class carries `:hover`, `:focus-visible` and `:active`. The review's finding was that 47 inline style objects in one component is why the entrance has none of these. `[data-navfocus]` (the controller focus ring) already wins on `!important`, so the new `:focus-visible` styles must not fight it.
4. **Motion is opt-out.** Every transition sits behind `@media (prefers-reduced-motion: no-preference)`, so the reduced-motion case is the default rather than a prop-threaded exception.
5. **Tokens only.** Colour, radius and easing come from the pastoral custom properties. No hex literal enters this file.

**Acceptance (EARS):**

- When Phase 1 ships, `grep -cE "#[0-9a-fA-F]{3,8}\b" css/entrance.css` shall return 0.
- When Phase 1 ships, then every `sds-ent-` class carrying `cursor: pointer` shall also declare a `:focus-visible` rule.
- When `npm run build` runs, then the built CSS shall contain at least one `sds-ent-` rule.
- While the visitor prefers reduced motion, the entrance stylesheet shall declare no `transition` or `animation` that applies to them.

## Phase 2 - `EntrancePicker.tsx`, the picker that opens in place (~3hr)

**Depends on:** Phase 1 (consumes its classes). Mounted nowhere until Phase 3, so it ships behind its own unit spec.

1. **New [`../js/components/entrance/EntrancePicker.tsx`](../js/components/entrance/EntrancePicker.tsx).** Props: the `BootFlow` and an `onClose`. No local persistence; every write goes through `flow.setFamily` / `flow.setMode` / `flow.setDog`, which already own the localStorage slots.
2. **Family row** renders only when `flow.families.length > 1` (Q1). A single-family world renders nothing where the uppercase family label used to sit.
3. **Rungs under D7 (Q2).** Visible set is the first three ladder entries plus the armed rung if it falls outside them. A `More` control reveals the rest in place and stays open for the session.
4. **Dog row** is the five portraits with the completed-run badge already carried by `dogBadges`, inline rather than behind a toggle. Selecting a dog closes the picker; selecting a family or a rung does not, because a player changing difficulty often changes family in the same breath.
5. **Keyboard and controller.** The picker is inside the entrance's existing `useMenuNavigation` root, and `Escape` closes it.

**Acceptance (EARS):**

- When a world offers one mode family, the picker shall render no family selector.
- When a world's ladder has more than three rungs, the picker shall render exactly three rungs plus a `More` control until `More` is pressed.
- While a rung outside the first three is armed, the picker shall render that rung without `More` being pressed.
- When the player selects a dog, the picker shall call `flow.setDog` and then `onClose`.
- When `npm test` runs, `tests/ui/EntrancePicker.spec.tsx` shall pass.

## Phase 3 - `Entrance.tsx` is one door (~4hr)

**Depends on:** Phases 1 and 2. This is the phase where the front door visibly changes.

1. **Rewrite [`../js/components/entrance/Entrance.tsx`](../js/components/entrance/Entrance.tsx)** to the shell: hero backdrop, wordmark, corner nav, edge-hugging world arrows, world name and tagline, one summary line, one Play, one multiplayer text line.
2. **The summary line** reads the armed selection as one sentence ("Classic, 200 sheep, with Jep") and toggles the Phase 2 picker in place. It is the only route to mode and dog.
3. **D6 removals.** `PlayingAsField` unmounts and the component deletes (the name field moves to first score submission, which is not this cycle's scope, so it simply leaves the entrance). The sandbox and 2-player buttons leave the primary surface into the corner info menu next to the existing links. Multiplayer keeps a text-weight line, per D6's explicit exception.
4. **Layout against the hero (Q3).** The collapsed panel's top edge sits below 72% of viewport height so it clears the dog in all four heroes. Phase 6 verifies this against the shipped images rather than against arithmetic.
5. **Delete on the way out:** the inline `glass` / `chipRound` / `wayBtn` style objects, the rung and family rows, the dog pill and swap row, and the `TutorialOffer` mount (Phase 4 rehomes it).
6. **Update the two e2e specs** that click a rung chip directly ([`../tests/e2e/oc-perf.spec.ts`](../tests/e2e/oc-perf.spec.ts), [`../tests/e2e/mobile-asset-visibility.spec.ts`](../tests/e2e/mobile-asset-visibility.spec.ts)) so they open the picker first. Same commit as the markup that moved.

**Acceptance (EARS):**

- When the entrance renders, then `wc -l js/components/entrance/Entrance.tsx` shall return under 260.
- When the entrance renders, then exactly one button named `Play` shall be present and no second button shall carry the primary accent.
- When the entrance renders on a first paint, then no name field, license line, sandbox button or 2-player button shall be present on the primary surface.
- If the player presses the summary line, then the picker shall open without navigating away from the entrance.
- When `grep -c "style={{" js/components/entrance/Entrance.tsx` runs, it shall return 0.
- When `npm test` runs, all vitest specs shall pass.

## Phase 4 - The tutorial moves inside the first round (~3hr)

**Depends on:** Phase 3 (which removes the mount). D4.

1. **Split [`../js/components/Tutorial/startTutorial.js`](../js/components/Tutorial/startTutorial.js)** into `attachTutorial()` (mount the overlay, pump the machine against the live round, tear down on finish or menu return) and `startTutorial()` (swap to Home Field, start practice, then `attachTutorial`). The Settings replay control keeps calling `startTutorial` unchanged.
2. **Arm it from the round, not from the entrance.** A first-time player (`shouldOfferTutorial()` true) gets `attachTutorial()` on their first round start, whatever world and rung they picked. The flag persists on first attach so it never fires twice.
3. **Delete [`../js/components/Tutorial/TutorialOffer.tsx`](../js/components/Tutorial/TutorialOffer.tsx)** and its export, and retire the offer telemetry events with it. `tests/ui/TutorialOffer.spec.tsx` goes with the component.
4. **The overlay stays soft.** No dialog role, no buttons, no blocking. It is the existing `TutorialOverlay` prompt language on the existing tutorial z-band.

**Acceptance (EARS):**

- When Phase 4 ships, then `js/components/Tutorial/TutorialOffer.tsx` shall not exist.
- When a first-time player starts any round, then the tutorial overlay shall mount without the player having accepted an offer.
- ~~While the tutorial overlay is mounted, it shall present no button.~~ **Revised at implementation:** while the tutorial overlay is mounted, it shall present no primary action and no accept step. The overlay carries a small Skip pill, which is the only way out of prompts that now appear unbidden. Deleting it would have satisfied the letter of the original line against its intent, which was to remove the second primary button from first paint.
- When a returning player who has completed or dismissed the tutorial starts a round, then the tutorial overlay shall not mount.
- When `npm test` runs, `tests/ui/tutorialMachine.spec.ts` shall pass unchanged.

## Phase 5 - Loading reads as the same room (~2hr)

**Depends on:** Phase 1. Deferred here explicitly by Cycle 112 Phase 5, which shipped the blur removal and left the continuity work for the rewrite.

1. **[`../js/components/entrance/LoadingScreen.tsx`](../js/components/entrance/LoadingScreen.tsx) moves onto `css/entrance.css`.** Same glass, same type scale, same corner radii as the entrance panel, so the cut from entrance to loading is one surface changing state rather than two surfaces swapping.
2. **The panel holds its position.** The loading panel sits where the entrance panel sat rather than centring, which removes the jump.
3. **One quiet caption.** The stage captions in [`../js/components/entrance/loadStages.ts`](../js/components/entrance/loadStages.ts) already reduced in Cycle 112; confirm the bar and its label are the only moving parts.
4. **Out of scope, deliberately:** matching the loading backdrop's framing to the live scene camera. That needs a camera-pose handshake from the engine and it is a cycle of its own, not a phase.

**Acceptance (EARS):**

- When the loading surface renders, then it shall carry no inline `style={{` object.
- When the loading surface renders, then its panel shall use the same `sds-ent-` glass class as the entrance panel.
- When `npm test` runs, `tests/ui/LoadingScreen.spec.tsx` shall pass, including its existing no-blur and no-license assertions.

## Phase 6 - The hero clears the panel (~2hr)

**Depends on:** Phase 3. Closes Cycle 112 carryover item 2.

1. **Measure, do not assume.** A browser probe loads the live entrance at 1440x900, 1920x1080 and 390x844, reads the collapsed panel's bounding rect, and compares it against each hero's measured dog position from `cycle112-validation/heroes/measurements.json`.
2. **Report per world.** The probe writes `cycle113-validation/hero-panel-clearance.json` with the panel rect, the projected dog rect and the overlap for all four worlds at all three viewports.
3. **Phone crop is the real risk.** A 1920x1080 hero in a 390x844 portrait box under `object-fit: cover` shows only the centre 26% of the image width. Two of the four dogs sit at 36% and 63% horizontally, right at that window's edge. If the probe finds a dog cropped out, add an optional `objectPosition` to the `World` type and set it per world, which is the project's own idiom of scene-specific knobs as data rather than branches in code.
4. **Escape hatch.** If the collapsed panel cannot clear a dog without hurting the layout, re-shoot that scene with a different `dogLateral` per [`cycle-112-hero-manifest.md`](cycle-112-hero-manifest.md) rather than widening the brief. Record which lever was pulled.
5. **Browser hygiene** per [`../.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md): every page, context and browser closed, every probe-only Vite listener stopped, `SDS_SUPPRESS_BROWSER_OPEN=1` set.

**Acceptance (EARS):**

- While the picker is collapsed at 1440x900, the entrance panel's top edge shall sit below the lowest dog's bottom edge across all four heroes (**measured at 78.0%**, not the 72% first written here; see the Q3 correction).
- When the clearance probe runs, then it shall report zero overlap between the collapsed panel and the dog for all four worlds at 1440x900 and 1920x1080.
- If a dog is cropped out of frame at 390x844, then the world shall carry an `objectPosition` that brings it back, or the report shall record why it cannot.
- When Phase 6 ships, then `cycle113-validation/hero-panel-clearance.json` shall exist.
- When `npm test` runs, `tests/ui/heroCrop.spec.ts` shall recompute the crop invariant offline and pass.

## Phase 7 - Gate, docs, close (~2hr)

**Depends on:** everything above.

1. `npm run lint && npm test && npm run build`.
2. A live probe of the built entrance at 1440x900 and 390x844: one Play button, no overlapping text, the picker opens and commits, deep links still arm, and the first round still mounts the tutorial for a fresh profile.
3. Update [`front-door-roadmap.md`](front-door-roadmap.md) so Cycle 113 records what actually shipped, and note in [`../DECISIONS.md`](../DECISIONS.md) that the entrance stylesheet is the D16 reference pattern.
4. Run `/cycle-close`.

**Acceptance (EARS):**

- When Phase 7 ships, `npm run lint`, `npm test` and `npm run build` shall all pass.
- When the close commit lands on `main`, then the sheepdogsim.com deploy shall succeed via GH Actions.

## Dependencies

```
Phase 1 ──┬── Phase 2 ── Phase 3 ──┬── Phase 4
          │                        └── Phase 6
          └── Phase 5                        ╲
                                              Phase 7
```

Phase 5 needs only the stylesheet, so it can run any time after Phase 1. Phases 4 and 6 both need the new shell and are independent of each other.

## Frozen files (cycle-specific additions)

The durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) stands. This cycle adds no new freezes and requests no exemptions: nothing here touches `shared/`, the wire protocol, the sim core, or the sim-baseline fixtures.

`shared/difficulty.js` is **read** by the picker through the existing `modesForWorld` helper and is not modified. Leaderboard identity stays `(scene_id, count)` per D7, so no score moves.

## Hard stops

Durable stops in [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) apply. Cycle-specific:

1. **If the rewrite needs a `shared/` change, stop.** A front-door layout that requires a sim or scene-schema change has misunderstood its own scope.
2. **If a rung, family or dog stops committing the selection it names, revert the phase.** The entrance's one job is that Play starts what the panel says. A prettier door that arms the wrong world is worse than the current one.
3. **If `Play` stops resolving as an accessible button with that exact name, stop.** Six e2e specs and every controller path depend on it, and a rename would be a silent break that only surfaces in CI.
4. **No blind golden re-baseline.** The goldens have been stale since Cycle 103 (Cycle 112 carryover item 4). This cycle does not touch the render path, so a golden diff that moves is evidence of something unintended, not of this cycle's work.

## What NOT to do during this cycle

- **Do not migrate the rest of the UI onto the new stylesheet.** D16 is explicit: new code uses pastoral tokens, everything else migrates when touched for its own reasons. Settings, Pause and Completion are not touched here.
- **Do not reshape `useBootFlow`.** The picker is presentational; the flow hook's surface is already right.
- **Do not build the loading-to-live camera framing match.** Named out of scope in Phase 5 for a reason.
- **Do not ungate Newsheepdogland.** D19 keeps it coming-soon until the front door ships, and it has not shipped until this cycle closes.
- **Do not move the name field to score submission.** D6 says it leaves the entrance; where it lands is its own scope.
- **Do not bump the version.** D20 rolls continuously.
- **Do not re-shoot heroes as the first response to a layout collision.** Q3 resolved that the panel moves; a re-shoot is the escape hatch, not the plan.

## Success criteria (cycle close)

- [x] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover. **All seven shipped.**
- [x] When `npm test` runs at cycle close, all vitest specs shall pass. **1,731 passed, 11 skipped, 178 files.**
- [x] When `npm run build` runs at cycle close, production build shall be clean. **Built in 8.66s, no errors; only the pre-existing >500KB chunk advisory.**
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [x] When the entrance first paints, then it shall present exactly one primary action and no more than one question. **Live probe: one button named Play, one summary line, two corner controls, picker collapsed.**
- [x] When `grep -c "style={{" js/components/entrance/Entrance.tsx js/components/entrance/LoadingScreen.tsx` runs, it shall return 0 for both files. **Both 0; pinned by `Entrance.spec.tsx` and `LoadingScreen.spec.tsx`.**
- [x] When Phase 4 ships, then no tutorial offer shall appear on the entrance and the tutorial shall arm inside the first round. **Live probe: fresh profile gets `[data-testid="tutorial-overlay"]` mid-round with no offer card; a profile with `sds:tutorialDone` gets neither.**
- [x] While the picker is collapsed, the entrance panel shall not occlude the dog in any of the four heroes at desktop viewports. **12 of 12 gated cases clear across 1440x900, 1920x1080 and 390x844; `cycle113-validation/hero-panel-clearance.json`.**

Live probe (dev server, 18 of 18): picker opens and closes, rung selection updates the summary, Escape closes, Play builds the armed world, deep links still arm (`rolling-hills` arms Rolling Hills; `nonsense` and the gated `newsheepdogland` fall back to Home Field), no overlapping entrance text and nothing outside the viewport at either 1440x900 or 390x844, Play reachable with the picker open.

Production build probe (`vite preview`): first-interactive 214ms, panel top at 79.3%, Fraunces resolving on the world name, `object-position: 31% 50%` applied, no console errors.

## References

- [`../DECISIONS.md`](../DECISIONS.md) - the 21-decision register, "Front door alignment". D3, D4, D5, D6, D7, D16, D19, D20 govern this cycle.
- [`front-door-roadmap.md`](front-door-roadmap.md) - where this cycle sits in the seven-cycle program
- [`cycle-112-hero-manifest.md`](cycle-112-hero-manifest.md) - the shipped hero poses and the two framings already rejected
- [`archive/cycles/cycle-112-plan.md`](archive/cycles/cycle-112-plan.md) - what just shipped
- [`../.claude/rules/prose-and-voice.md`](../.claude/rules/prose-and-voice.md) - player-facing copy rules
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [EARS notation](https://kiro.dev/docs/specs/) - testable acceptance lines
