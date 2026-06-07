# Next Session - Cycle 65 wolf-coast-homestead-and-day (SHIPPED, pending prod playtest + close)

> **Updated:** 2026-06-06
> **For:** Cycle 65 `wolf-coast-homestead-and-day`. Plan: [`docs/cycle-65-plan.md`](docs/cycle-65-plan.md).
> **Pickup priority:** Matt's prod playtest of the Wolf Coast day loop, then `/cycle-close`. All 8 phases are implemented, validated, and pushed to main. The reserved tunables (day length, first-light start, homestead layout, biome density, the soft-loop framing) are a strawman for Matt's in-browser pass.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-65-plan.md`](docs/cycle-65-plan.md) -> the touched module source.

## Where It Stands

**Cycle 64 (`wolf-coast-foundation`) is CLOSED + deployed** (the coastline boundary primitive + the walkable Wolf Coast island; archived [`docs/archive/cycles/cycle-64-plan.md`](docs/archive/cycles/cycle-64-plan.md)).

**Cycle 65 (`wolf-coast-homestead-and-day`) is IMPLEMENTED + VALIDATED.** Matt called the shipped Wolf Coast "massive and featureless" and folded the originally-proposed two cycles into one larger autonomous cycle. It turns Wolf Coast into a place with a daily rhythm. Client-only: the one fence touch is additive `shared/scenes/types.js` data fields (`dayNight`, `GateDef.facingDeg`); no deterministic-sim change, no wire change, no D1, sim-baseline byte-identical. No wolves / survival economy / co-op / leaderboard (those are Cycles 66-68).

### What shipped (all 8 phases)

- **P3 - biome character.** [`shared/scenes/wolf-coast.js`](shared/scenes/wolf-coast.js) woods re-authored into dense conifer pockets on the leg, a north-foot tree-line windbreak, and a deliberately open foot pasture. Pure scene data; the coastline SDF culls trees at the shore.
- **P4 - day/night.** Additive optional `dayNight` SceneDef field turns on the existing [`js/atmosphere/DayNightCycle.js`](js/atmosphere/DayNightCycle.js); both `main.js` Atmosphere sites honor it. Wolf Coast starts just after sunrise (`initialT 0.28`) and arcs over a 240s day. Verified: the sun rose 8deg -> 51deg, presets blended dusk -> noon.
- **P1 - homestead.** The pen relocated beside the farmhouse (the herd-back home zone); a wooden swing gate ([`js/StructureBuilder.js`](js/StructureBuilder.js) `buildHomesteadGate`) flanked by fence wings, grounded flush on the terrain (delta 0); `dogSpawn` moved to the gate (on land, ground 3.4m). The toe corral stays the Solo objective.
- **P2 - animated gate.** A hinged door panel + `updateGate` tween, driven each frame by the day-loop runner (StructureBuilder.update is not on the main loop, so the tween runs via the runner).
- **P5 - day/night HUD.** A dependency-free chip ([`js/components/GameHUD/DayNightChip.js`](js/components/GameHUD/DayNightChip.js), the StatsChip precedent): day number, phase, a sun-progress track, the home count, and an amber dusk "herd them in" warning.
- **P6 - the day loop.** A pure client-only controller ([`js/gamestate/dayLoop.js`](js/gamestate/dayLoop.js), the counting-mode precedent, 9 unit tests): tracks day, phase, gate state, dusk warning, and a nightly home tally. The gate opens at dawn and swings shut at night; soft outcome (no fail-death). Wired in [`js/boot/initWorld.js`](js/boot/initWorld.js) (the per-frame runner) + [`js/main.js`](js/main.js) (the call).
- **P7 - skip-to-dusk cutscene.** [`js/effects/skipToDusk.js`](js/effects/skipToDusk.js): an on-screen button (tappable on mobile, F-key hint on desktop) + the F key, shown only during grazing. Fast-forwards the clock to dusk while the camera pans up to the sun and back; reduced-motion gets an instant jump. The main loop suspends the follow-camera (`_cutsceneActive`) during the takeover.
- **P8 - validation.** npm test 1042 pass / 7 skip, lint clean, worker tsc clean, build clean (main ratchet 573 -> 577 KiB), sim-baseline byte-identical.

### Browser smoke (preview, SDS_SUPPRESS_BROWSER_OPEN=1) - PASSED

Autostart play on Wolf Coast: clean boot (no console errors), bright midday sky over a green foot pasture with scattered trees + the distant mountain, the dog wakes at the homestead gate (open at dawn), the day/night clock advances in play, the gate swings shut at night (door -104deg -> 0) and the day rolls to Day 2 past midnight, the HUD chip is live, and the skip cutscene drives the clock morning -> dusk with the camera pitch rising from -0.33 (on the dog) to +0.85 (up at the sun) then returning.

## What To Pick Up Next

1. **Matt's prod playtest** of the Wolf Coast day loop on sheepdogsim.com (entrance -> Wolf Coast -> a Solo run; wake at the homestead, watch the gate, herd back before dusk, try the skip).
2. **Reserved tunables (paired, not a phase)** - a strawman for Matt's taste pass: the day length (`secondsPerDay 240`), the first-light start (`initialT 0.28`), the homestead layout (pen (640,-1000) r30, gate (610,-1000) facing 90, dogSpawn (585,-1000)), the biome density, the soft-loop framing, and the dusk-crunch target (`DUSK_T 0.70` in skipToDusk).
3. **A real Wolf Coast entrance hero capture** to replace the dusk-gradient placeholder (Matt's media pass).
4. **`/cycle-close`** once the playtest confirms - archive the plan, append BACKLOG, scaffold Cycle 66.

## Open Carryover

- **Wolf predator mode** - Cycle 66 (the Cycle 61 wolf asset + the bark verb were built for it; resolve the bark-verb conflict there - the survival brief wants a radial repel, [`shared/BarkImpulse.js`](shared/BarkImpulse.js) is a forward cone).
- **Survival campaign sequencing** - 66 wolves + bark -> 67 co-op (promote the day loop to deterministic `shared/`) -> 68 survival leaderboard (a new D1 migration).
- **Tablet draw-call perf** - Wolf Coast's foot grass is ~584 chunks; watch it on the Tab S9 FE.
- **No version bump** - a player-visible release is Matt's explicit call.
- Prior open carryover (collision prod feel, real mobile pass, counting naming/curve-feel, `/api/rename` no-body 500, `upload-artifact@v5` Node 20) remains deferred.

## Working Contract

- This cycle was client-only. Cycle 67 co-op is where the day clock gets promoted to deterministic `shared/`; until then it stays a client controller (the counting-mode precedent).
- Keep SceneDef additions optional with defaults; existing scenes stay byte-identical in behavior.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-65-plan.md`](docs/cycle-65-plan.md) |
| Day loop controller | [`js/gamestate/dayLoop.js`](js/gamestate/dayLoop.js) |
| Homestead gate | [`js/StructureBuilder.js`](js/StructureBuilder.js) (`buildHomesteadGate`) |
| Day/night HUD chip | [`js/components/GameHUD/DayNightChip.js`](js/components/GameHUD/DayNightChip.js) |
| Skip cutscene | [`js/effects/skipToDusk.js`](js/effects/skipToDusk.js) |
| Day-loop wiring | [`js/boot/initWorld.js`](js/boot/initWorld.js) + [`js/main.js`](js/main.js) |
| Wolf Coast scene | [`shared/scenes/wolf-coast.js`](shared/scenes/wolf-coast.js) |
| Latest closed cycle | [`docs/archive/cycles/cycle-64-plan.md`](docs/archive/cycles/cycle-64-plan.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
