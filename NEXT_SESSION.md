# Next Session - Cycle 65 wolf-coast-homestead-and-day (AUTHORED, autonomous execution in progress)

> **Updated:** 2026-06-06
> **For:** Cycle 65 `wolf-coast-homestead-and-day`. Plan: [`docs/cycle-65-plan.md`](docs/cycle-65-plan.md).
> **Pickup priority:** Cycle 65 is authored and being executed autonomously this session (Matt's call: "fold the next 2 cycles into 1 larger autonomous cycle"). If picking up cold, check `git log` for shipped phases, then continue the next unshipped phase from the plan. After all 8 ship + deploy, the pickup becomes Matt's prod playtest then `/cycle-close`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-65-plan.md`](docs/cycle-65-plan.md) -> the touched module source.

## Where It Stands

**Cycle 64 (`wolf-coast-foundation`) is CLOSED + deployed** (commit `907d6f8`, deploy run `27080491391` green; plan archived [`docs/archive/cycles/cycle-64-plan.md`](docs/archive/cycles/cycle-64-plan.md); full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md)). It shipped the `coastline` boundary primitive + the walkable Wolf Coast island, playable in Just Play / Solo.

**Cycle 65 (`wolf-coast-homestead-and-day`) is authored and executing.** Matt looked at the shipped Wolf Coast, called it "massive and featureless," and handed over the vision: start at a homestead (house + fenced pen + a gate that opens/closes by the day phase), give the island character (dense forest, open fields, tree lines, not one mountain), run a day/night cycle starting at first light with a HUD clock, herd the flock back into the pen before the sun sets, and add a skip affordance (mobile button + PC key) that cuts to a camera pan up to the sun arcing to dusk. He folded the originally-proposed two cycles ("the place" + "the day") into one larger autonomous cycle. It is **client-only** (one additive `shared/scenes/types.js` data field); no deterministic-sim change, no wire change, no D1, no sim-baseline regen. No wolves / survival economy / co-op / leaderboard - those are Cycles 66-68.

## The 8 Phases (see the plan for EARS acceptance)

1. **Homestead layout + alignment** - co-locate house + fenced pen + gate + dog spawn into one homestead in the foot; keep the toe corral for Solo.
2. **Animated gate** - open/close tween + `setGateState` API on the existing gate group.
3. **Biome character** - dense conifer pockets / open fields / tree-lines; ungrass forest floors.
4. **Day/night enabled + scheduled** - turn on the existing `DayNightCycle` for Wolf Coast, start at first light (additive `dayNight` SceneDef field).
5. **Day/night HUD** - a clock/phase chip + day counter + dusk warning, in the `HudLayout` + `useGameState` idiom.
6. **Gate-by-phase + herd-back dry loop** - gate opens at dawn / closes at night; count sheep home by dusk; soft outcome, no fail-death.
7. **Skip-to-dusk cutscene** - on-screen mobile button + PC F-key; `makeCameraPath` pan to the sun + fast-forward the clock to dusk.
8. **Polish + validation + browser smoke + ship** - npm test/lint/build, sim-baseline byte-identical, desktop+mobile smoke, deploy.

## What To Pick Up Next

1. **Continue the autonomous execution** - ship the remaining phases, validate, commit, push, deploy.
2. **Then Matt's prod playtest** of the Wolf Coast day loop, then `/cycle-close`.
3. **Reserved tunables (paired, not a phase)** - the day length (~240 s), first-light start (`initialT ~0.28`), skip key (F), homestead coords, biome density, and the soft-loop framing are a strawman for Matt's taste pass.

## Open Carryover

- **Wolf predator mode** - now Cycle 66 (the Cycle 61 wolf asset + the bark verb were built for it; resolve the bark-verb conflict there - the survival brief wants a radial repel, [`shared/BarkImpulse.js`](shared/BarkImpulse.js) is a forward cone).
- **Survival campaign sequencing** - 66 wolves + bark -> 67 co-op (promote the day loop to deterministic `shared/`) -> 68 survival leaderboard (a new D1 migration).
- **Real Wolf Coast entrance hero capture** to replace the dusk-gradient placeholder at `assets/scenes/entrance/wolf-coast.webp` (Matt's media pass).
- **Tablet draw-call perf** - Wolf Coast's foot grass is ~584 chunks; watch it on the Tab S9 FE.
- **No version bump** - a player-visible release is Matt's explicit call.
- Prior open carryover (collision prod feel, real mobile pass, counting naming/curve-feel, `/api/rename` no-body 500, `upload-artifact@v5` Node 20) remains deferred.

## Working Contract

- This cycle is client-only. If a phase starts needing a `shared/` sim change or a wire change, stop and surface - that is Cycle 67 scope, not this one.
- Keep all SceneDef additions optional with defaults; existing scenes stay byte-identical in behavior.
- Verify in the browser (preview, `SDS_SUPPRESS_BROWSER_OPEN=1`, close tabs/listeners after) before marking a phase done.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-65-plan.md`](docs/cycle-65-plan.md) |
| Day/night controller | [`js/atmosphere/DayNightCycle.js`](js/atmosphere/DayNightCycle.js) |
| Skip cutscene tooling | [`js/cinematic.js`](js/cinematic.js) |
| HUD idiom | [`js/components/GameHUD/HudLayout.tsx`](js/components/GameHUD/HudLayout.tsx) + [`js/components/hooks/useGameState.js`](js/components/hooks/useGameState.js) |
| Day-loop precedent | [`js/gamestate/countingMode.js`](js/gamestate/countingMode.js) |
| Fence + gate builders | [`js/FencePresets.js`](js/FencePresets.js) + [`js/StructureBuilder.js`](js/StructureBuilder.js) |
| Wolf Coast scene | [`shared/scenes/wolf-coast.js`](shared/scenes/wolf-coast.js) |
| Latest closed cycle | [`docs/archive/cycles/cycle-64-plan.md`](docs/archive/cycles/cycle-64-plan.md) |
| Scene/render rules | [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
