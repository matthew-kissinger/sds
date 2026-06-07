# Cycle 65 — wolf-coast-homestead-and-day

> Drafted 2026-06-06 after Cycle 64 (`wolf-coast-foundation`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a folded cycle.** It combines what was originally proposed as two cycles - "the place" (homestead + biome character) and "the day" (day/night loop + skip cutscene) - into one larger autonomous cycle, on Matt's explicit direction (2026-06-06: "fold the next 2 cycles into 1 larger autonomous cycle"). It therefore runs the full 8-phase budget. The campaign shifts down by one: wolves + the survival bark become Cycle 66, co-op Cycle 67, the survival leaderboard Cycle 68.

## Goal

Turn the walkable Wolf Coast foundation into a **place with a daily rhythm**. Today Wolf Coast is a large, mostly-empty boot with one mountain, the dog spawns nowhere in particular, and the sky is a static dusk. After this cycle: the dog starts at a **homestead** (a house with a fenced pen and a gate) on the morning of day one; the 3.2 km^2 island has **character** (dense conifer pockets, open fields, tree-line strips, not one mountain on empty ground); a **day/night cycle** arcs the sun from morning to dusk to night with a **HUD clock**; the **gate opens at dawn and closes at night** by the phase clock; the player can **herd the flock back into the pen before the sun sets** (a soft daily loop, no fail-death yet); and a **skip affordance** (an on-screen button on mobile, a key prompt on PC) triggers a quick **camera cutscene** that pans up to the sun and arcs it forward to the dusk crunch so you can skip the slow grazing and get to the herding. No wolves, no survival economy, no co-op, no leaderboard - those are Cycles 66-68.

Before: a big readable island, static dusk, no rhythm, the dog drops in mid-lowland. After: you wake at the homestead at first light, the day runs, and you race the sunset to get every sheep back through the gate.

## How to read this plan

This doc fixes the *shape* of the changes, not the implementation choices. Where it names a coordinate, a duration, or a key, treat it as a **strawman for Matt's taste pass** (like the Cycle 58 ladder counts and the Cycle 61 bark constants), not a locked value. Each phase agent should:

- **Build the simplest thing that meets the goal**, measure on the desktop + mobile target, and reuse the engines that already exist (the grounding map below) rather than building new systems.
- **Stay client-only** unless a phase explicitly authorizes a `shared/scenes/types.js` additive field. This cycle does not touch the deterministic sim, the wire protocol, or D1.
- **Verify in the browser** (preview, `SDS_SUPPRESS_BROWSER_OPEN=1`, close every tab/listener after) before marking a phase done.

## What already exists (grounding map - do not rebuild these)

Verified against the codebase 2026-06-06. This cycle is **wiring + authoring on top of these**, not new systems:

- **Day/night:** [`js/atmosphere/DayNightCycle.js`](../js/atmosphere/DayNightCycle.js) is a complete 9-keyframe sun-arc controller (`setT(t)`, `setRunning`, `setSecondsPerDay`, `update(dt)`). Scenes opt in via the `Atmosphere` `enableDayNight` flag + `atmosphere.startDayNightCycle({ secondsPerDay, initialT })` / `stopDayNightCycle()`. Wolf Coast currently uses a static `sky.preset: 'dusk'` and does **not** enable it. Enabling + scheduling is wiring.
- **House:** GLB-loaded + cloned in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) `loadFarmHouse` from the SceneDef `farmHouse.position`. Wolf Coast already declares `farmHouse` at (650, -1080).
- **Fence + gate:** built by [`js/FencePresets.js`](../js/FencePresets.js) (`createGateStructure`, `FenceConfigBuilder.buildSinglePlayerFences`) via [`js/StructureBuilder.js`](../js/StructureBuilder.js). The gate exists as a static `THREE.Group` (posts + arch). **There is no open/close animation today** - adding a swing/slide tween is genuinely new (Phase 2).
- **HUD:** slot-based [`js/components/GameHUD/HudLayout.tsx`](../js/components/GameHUD/HudLayout.tsx) (regions `topLeft`/`topCenter`/`topRight`/`edge`/`bottomSafe`/`mobileControls`) fed by the [`useGameState`](../js/components/hooks/useGameState.js) snapshot hook. Examples to mirror: `SheepCounter.tsx`, `CountingBankButton.tsx`.
- **Cutscene:** [`js/cinematic.js`](../js/cinematic.js) `makeCameraPath()` is a keyframed camera-pose interpolator with smooth-step easing; `?cinematic=1` exposes `window.__sdsCinema` (camera/atmosphere/sun refs). [`js/CameraController.js`](../js/CameraController.js) owns the Classic/Follow/Free modes. The skip cutscene takes over the camera with a path, drives the sun via the day/night clock, and restores the saved mode on hand-back.
- **Client round controller precedent:** [`js/gamestate/countingMode.js`](../js/gamestate/countingMode.js) is a **client-only** round controller (not a `shared/` deterministic module). The herd-back day loop follows this pattern - client-side, no sim-baseline regen, no desync risk.

## Open questions (strawman answers - Matt's taste pass confirms)

1. **Q1: Day length?** Author lean: a full day arc of **~240 s** real-time (`secondsPerDay`), with the skip cutscene jumping straight to the dusk window. Long enough to graze + herd, short enough to not drag. Tunable on the SceneDef `dayNight` field.
2. **Q2: Where does day one start?** Author lean: **first light / mid-morning** (`initialT ~= 0.28`, just after the dawn keyframe, gate swinging open). Reads as "you wake at the homestead, the day begins."
3. **Q3: Soft loop or hard fail?** Author lean: **soft** this cycle - the loop tracks how many sheep are inside the pen by nightfall and advances the day; it does not end the run or kill sheep. Predator stakes arrive with wolves (Cycle 66). Keeps Wolf Coast playable and pleasant before the survival economy exists.
4. **Q4: Skip control binding?** Author lean: a dedicated **on-screen "Skip to dusk" button** (visible on mobile, and on desktop with the key shown, e.g. "Press F"), plus the **F key** on PC. Distinct from pause (Esc) and bark (Space). The button lives in the HUD and is only shown during the grazing window.
5. **Q5: Does the day/night config live on the SceneDef?** Author lean: **yes** - an additive optional `dayNight: { enabled, secondsPerDay, initialT, dayLoop }` on the frozen `shared/scenes/types.js`, consistent with the scene-as-data rule ("scene-specific knobs live on the SceneDef, not as branches in render code"). Additive optional field with a default; existing scenes unaffected. This is the cycle's only fence touch.

## Architecture / what changes where

This cycle is **client-only** except one additive SceneDef field. No deterministic-sim change, no wire-protocol change, no D1 migration, no sim-baseline regeneration.

- **New client modules** (not frozen): a day-loop controller (the homestead/pen/gate/phase state machine, counting-mode-style), a gate-animation helper, a day/night HUD component, the skip cutscene.
- **Frozen-file touch (additive only):** [`shared/scenes/types.js`](../shared/scenes/types.js) gains the optional `dayNight` config typedef (Q5) and, if needed, an optional `homestead`/`gate` descriptor. Optional fields with defaults; no rename/removal; the Worker ignores them (they are render/client config). This keeps the sim-baseline byte-identical and needs no consumer migration.
- **Scene data:** [`shared/scenes/wolf-coast.js`](../shared/scenes/wolf-coast.js) is re-authored for the homestead layout, richer `woodsZones` / tree-lines, and the `dayNight` block. (Scene data, not frozen code.)
- **Render/loop wiring:** `Atmosphere`, `TerrainBuilder`/`StructureBuilder` (homestead placement + gate handle), `GrassSystem` (ungrass forest floors / open-field variation), the HUD layout, `main.js` update loop (drive the day clock + gate + loop + skip), `InputHandler` (the skip key), `MobileControls` (the skip button).

## Phase 1 — Homestead layout + alignment (~4hr)

**Independently testable. Scene data + structure placement.** Consolidate the scattered house / pen / corral / dog-spawn into one coherent homestead the dog starts at.

1. Re-author the homestead block of [`shared/scenes/wolf-coast.js`](../shared/scenes/wolf-coast.js): co-locate `farmHouse`, a fenced `pen` with a gate, and `dogSpawn` into one homestead in the foot lowland (the dog starts just outside the gate). Keep the toe `corral` as the Solo-mode herding destination. Keep the flock grazing west of the homestead so there is a real drive.
2. Place the pen fence + gate for a coastline scene via [`js/StructureBuilder.js`](../js/StructureBuilder.js) / [`js/FencePresets.js`](../js/FencePresets.js) (today's perimeter-fence path assumes rect bounds; the pen here is a local enclosure, not the island perimeter). Confirm the house, pen, fence, and gate sit on the ground via `_groundY` and read as aligned (no floating, no clipping).
3. Verify every homestead landmark is inside the coastline polygon and on land (SDF signed distance > a safe margin).

**Acceptance (EARS):**

- When Wolf Coast loads, then `dogSpawn`, `farmHouse.position`, the pen center, and the gate position shall all lie inside the coastline polygon and within ~80 m of each other.
- When the dog spawns, then it shall stand on the ground just outside the pen gate (within ~30 m), not mid-lowland.
- When the homestead renders, then the house, pen fence, and gate shall sit flush on the terrain (each placed via `_groundY`) with no floating or interpenetration in the browser smoke.
- While Solo modes are played, the toe `corral` shall remain the wired herding destination (unchanged behavior).

## Phase 2 — Animated gate (~3hr)

**Depends on Phase 1 (gate placed).** Give the gate an open/close animation and a small state API a clock can drive.

1. Add a gate-animation helper that tweens the gate group between closed and open (a swing about the hinge post, or a slide) over a short duration, with an idempotent `setGateState('open'|'closed')` and an `isAnimating` read. Reuse the existing gate `THREE.Group`; do not rebuild the mesh.
2. Expose the gate handle from the structure build so the day loop (Phase 6) can command it. Default state openable on demand; not yet bound to the phase clock in this phase.
3. Respect reduced-motion: if `prefers-reduced-motion`, snap instead of tween.

**Acceptance (EARS):**

- When `setGateState('open')` is called on a closed gate, then the gate shall animate to open over its duration and end fully open.
- When `setGateState` is called again with the same state, then it shall be a no-op (idempotent, no re-trigger).
- While `prefers-reduced-motion` is set, the gate shall snap to the target state without a tween.
- When the gate animates, then no console error shall occur and the gate group shall remain on the ground.

## Phase 3 — Biome character (~4hr)

**Depends on Phase 1 (shares the scene file); can run parallel to Phase 4.** Make the island feel intentional instead of "one mountain on empty ground."

1. Author richer biomes in [`shared/scenes/wolf-coast.js`](../shared/scenes/wolf-coast.js): distinct **dense conifer pockets**, **open fields** (deliberately sparse), and **tree-line strips / hedgerows** separating fields, using `woodsZones` density variation (and a tree-line placement helper if a strip reads better than a circular zone).
2. In [`js/GrassSystem.js`](../js/GrassSystem.js): ungrass the dense-forest floors (low/zero grass under the canopy) and keep the open fields grassed, so forest vs field reads as a real difference, not uniform meadow. Reuse the SDF density path from Cycle 64; do not decompose the grass system.
3. Keep draw calls in budget (the foot grass is already ~584 chunks; do not balloon it). Forest floors being ungrassed should help, not hurt.

**Acceptance (EARS):**

- When Wolf Coast renders, then there shall be visibly distinct dense-forest, open-field, and tree-line regions (confirmed in the browser smoke), not a uniform tree scatter.
- While the camera is over a dense-forest pocket, grass density under the canopy shall be reduced or zero versus an open field in the same scene.
- When the scene loads, then the grass chunk count shall stay within ~10% of the Cycle 64 baseline (no draw-call blowup) and there shall be no console error.
- If `woodsZones` / tree-lines push any tree into the water, then the water-aware tree cull (Cycle 64 SDF) shall keep it on land.

## Phase 4 — Day/night enabled + scheduled (~3hr)

**Can run parallel to Phases 1-3.** Turn on the existing day/night cycle for Wolf Coast and start it at first light.

1. Add the additive optional `dayNight: { enabled, secondsPerDay, initialT, dayLoop }` typedef to [`shared/scenes/types.js`](../shared/scenes/types.js) (Q5). Optional, defaulted, Worker-ignored.
2. Set the `dayNight` block on [`shared/scenes/wolf-coast.js`](../shared/scenes/wolf-coast.js) (Q1 `secondsPerDay`, Q2 `initialT`); replace the static `sky.preset: 'dusk'` reliance with the dynamic cycle (keep `dusk` as a fallback if `dayNight` is absent).
3. Wire boot/`Atmosphere` to honor `scene.dayNight`: construct `Atmosphere` with `enableDayNight` and call `startDayNightCycle({ secondsPerDay, initialT })` for Wolf Coast; other scenes are unchanged (no `dayNight` → static preset as today). Fog/sky follow the sun via the existing keyframe blend.

**Acceptance (EARS):**

- When Wolf Coast loads, then the day/night cycle shall be running and the sun shall start at first light (`initialT` from the scene), not static dusk.
- While the day advances, the sky, sun position, and fog shall move through the keyframe arc (morning → noon → dusk → night) via `DayNightCycle`.
- If a scene has no `dayNight` field, then it shall keep its static `sky.preset` with byte-identical behavior (Home Field / Rolling Hills / Open Country unaffected).
- When `npm run lint` runs over `shared/**`, then the `dayNight` typedef addition shall pass the deterministic-import rule (it is type-only data).

## Phase 5 — Day/night HUD (~3hr)

**Depends on Phase 4 (needs the clock to display).** Show the day/night state to the player.

1. Add a day/night HUD component in the [`HudLayout`](../js/components/GameHUD/HudLayout.tsx) idiom (mirror `SheepCounter.tsx`), reading live time-of-day from the [`useGameState`](../js/components/hooks/useGameState.js) snapshot (extend the snapshot with the current phase / normalized time / day number).
2. Display: the day number, a phase label or clock (morning / noon / dusk / night) with a sun-arc indicator, and a **dusk warning** state as nightfall approaches.
3. Pastoral styling (warm glass, the shared `Icon` set); only shown on Wolf Coast's day loop, hidden on scenes without `dayNight`.

**Acceptance (EARS):**

- While Wolf Coast's day loop runs, the HUD shall show the current day number and time-of-day phase, updated live as the sun arcs.
- When dusk approaches, then the HUD clock shall enter a warning state (visually distinct) prompting the player to herd back.
- If a scene has no day loop, then the day/night HUD component shall not render.
- When the HUD renders, then it shall use the existing `useGameState` snapshot (no new per-frame render churn beyond the shared subscription) with no console error.

## Phase 6 — Gate-by-phase + herd-back dry loop (~4hr)

**Depends on Phase 2 (gate API) + Phase 4 (phase clock).** The core daily loop, client-side, soft outcome.

1. Add a client-only day-loop controller (counting-mode-style, not a `shared/` module): track the day number, the phase, how many sheep are inside the pen, and drive the gate.
2. Gate-by-phase: the gate **opens at dawn** (sheep can graze out across the foot) and **closes at night**. As dusk approaches, the HUD warns; the loop counts how many sheep made it back inside the pen by nightfall, then advances to the next day (gate reopens at the next dawn).
3. Soft outcome (Q3): no fail-death, no sheep loss this cycle - the loop records "N of M home by dusk" and rolls the day. A pleasant rhythm, not a punishing survival run.

**Acceptance (EARS):**

- When dawn arrives, then the gate shall open and sheep shall be able to graze out of the pen.
- When night falls, then the gate shall close and the loop shall record how many sheep are inside the pen and advance the day counter.
- While the loop runs, herding a sheep into the pen before nightfall shall count it as home (reflected in the HUD).
- If the player herds all sheep back before dusk, then the loop shall acknowledge a clean day (HUD state) without ending the run.
- When the loop advances a day, then no sheep shall be killed or removed (soft outcome this cycle).

## Phase 7 — Skip-to-dusk cutscene (~4hr)

**Depends on Phase 4 (clock) + the camera.** The time-skip that pans to the sun and arcs it forward.

1. Add a **skip affordance**: an on-screen "Skip to dusk" button in the HUD (visible on mobile, shown with the key hint on desktop) + the **F key** (Q4) via [`js/InputHandler.js`](../js/InputHandler.js) + a mobile button in [`MobileControls`](../js/components/GameHUD/MobileControls.tsx). Only shown during the grazing window (before dusk).
2. On skip: take over the camera with a [`makeCameraPath()`](../js/cinematic.js) move that **pans up to the sun**, fast-forward the day/night clock (`setSecondsPerDay` boost or `setT` ramp) so the sun visibly **arcs to the dusk window**, then hand the camera back to the saved mode at the dusk crunch.
3. Robustness: skipping is safe mid-graze (no broken state), re-entrant-guarded (one skip at a time), and reduced-motion does a quick fade instead of the full pan.

**Acceptance (EARS):**

- While the grazing window is open, the "Skip to dusk" affordance shall be visible (on-screen on mobile; with the F-key hint on desktop) and hidden otherwise.
- When the player triggers skip, then the camera shall pan to the sun, the sun shall arc forward to dusk, and control shall return to the prior camera mode at the dusk crunch.
- If skip is triggered while a skip is already running, then the second trigger shall be ignored (no double-takeover).
- While `prefers-reduced-motion` is set, the skip shall fast-forward to dusk with a quick fade instead of the full camera pan.
- When the cutscene ends, then the day loop shall be in the dusk phase with the gate logic intact and no console error.

## Phase 8 — Polish + validation + browser smoke + ship (~3hr)

**Depends on all prior phases.**

1. Full validation: `npm test`, `npm run lint`, worker `tsc`, `npm run build` (accept + record any bundle ratchet in [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json)). Confirm the sim-baseline is **byte-identical** (this cycle is client-only; any sim-baseline diff is a bug - stop and find the leak).
2. Browser smoke (preview, `SDS_SUPPRESS_BROWSER_OPEN=1`, close every tab/listener after): load Wolf Coast, start at the homestead at first light, watch the gate open, graze out, trigger skip-to-dusk, herd back, gate closes, day advances. Desktop + mobile 390 px, zero console errors. Save proof under `cycle65-validation/`.
3. Ship: commit the phases, push to `main`, confirm the GH Actions deploy is green, verify Wolf Coast on prod.

**Acceptance (EARS):**

- When `npm test`, `npm run lint`, worker `tsc`, and `npm run build` run at cycle close, then all shall pass.
- When the sim-baseline suite runs, then all fixtures shall be byte-identical to Cycle 64 (no deterministic-sim change this cycle).
- When the browser smoke completes, then the homestead start, day arc, gate open/close, herd-back, and skip cutscene shall all be verified desktop + mobile with no console error, and proof saved under `cycle65-validation/`.
- When the close commit lands on `main`, then the sheepdogsim.com deploy shall succeed via GH Actions and Wolf Coast shall be live with the day loop.

## Dependencies

```
Phase 1 (homestead) ─┬─ Phase 2 (gate anim) ──────────────┐
                     └─ Phase 3 (biome character)          │
Phase 4 (day/night) ─┬─ Phase 5 (HUD) ───────────────────┐ │
                     ├─ Phase 6 (gate-by-phase + loop) ◄──┴─┘
                     └─ Phase 7 (skip cutscene)
                                                  all ──► Phase 8 (validate + ship)
```

Phase 4 can run parallel to Phases 1-3 (it only touches `Atmosphere` + the scene `dayNight` block). Phase 6 needs both the gate API (P2) and the clock (P4). Phases 5 and 7 need the clock (P4). Phase 8 is last.

## Frozen files (cycle-specific authorization)

The durable fence is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). This cycle is **authorized** to touch only:

- [`shared/scenes/types.js`](../shared/scenes/types.js) - **additive only**: the optional `dayNight` config typedef (P4/Q5) and, if needed, an optional `gate`/`homestead` descriptor (P1). Optional fields with defaults; no rename/removal; the Worker ignores them. No consumer migration, no sim-baseline regen.

Everything else this cycle (`js/` render, HUD, loop, cutscene, gate, the Wolf Coast scene *data*) is outside the fence.

## Hard stops

Durable stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. **Do not pull survival scope forward.** No wolves, no predator AI, no survival economy, no bankruptcy, no fail-death run-ender, no co-op, no survival leaderboard. Those are Cycles 66-68. The day loop is a **soft** rhythm this cycle.
2. **Stay client-only.** No deterministic-sim (`shared/` movement/boundary/collision) change, no wire-protocol change, no D1 migration. The day loop is a client controller (counting-mode precedent). The only fence touch is additive `shared/scenes/types.js` data fields. If the work starts needing a `shared/` sim change, stop - that is the Cycle 67 co-op promotion, not this cycle.
3. **If any sim-baseline fixture changes, stop.** This cycle does not touch the deterministic sim; a fixture diff means something leaked into a shared code path. Find the leak, do not regenerate.
4. **Do not break existing scenes.** All SceneDef additions are optional with defaults; Home Field / Rolling Hills / Open Country / Wolf Coast's existing Solo modes must be byte-identical in behavior.
5. **Do not auto-bump the version.** Wolf Coast's day loop becoming a player-visible release is Matt's explicit call.

## What NOT to do during this cycle

- Don't add wolves, predator AI, the survival economy/bankruptcy, a hard fail state, co-op, the survival leaderboard, or any wire/D1 change (Cycles 66-68).
- Don't promote the day loop into deterministic `shared/` now - that is premature; it is Cycle 67's co-op job.
- Don't reach for Blender / external 3D tools for the terrain character; author via `woodsZones` / scene data + the procedural baker (per [`feedback_asset_pipeline.md`](file:///c/Users/Mattm/.claude/projects/C--Users-Mattm-X-games-3d-sds/memory/feedback_asset_pipeline.md)).
- Don't decompose `GrassSystem` or `OptimizedSheep` (cohesive by design - see `DECISIONS.md`).
- Don't auto-bump the version or auto-post devlog/marketing.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each. Don't pre-check.

- [ ] When the cycle closes, all 8 phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [ ] When Wolf Coast loads, then the dog shall start at the homestead (house + fenced pen + gate, aligned) on the morning of day one.
- [ ] When the day runs, then the sun shall arc morning → dusk → night with a live HUD clock, and the gate shall open at dawn and close at night.
- [ ] When the player herds sheep into the pen before dusk, then the day loop shall count them home and advance the day (soft outcome, no fail-death).
- [ ] When the player triggers the skip affordance, then a camera cutscene shall pan to the sun and arc it to dusk, then return control.
- [ ] When Wolf Coast renders, then it shall have distinct dense-forest / open-field / tree-line character, not one mountain on empty ground.
- [ ] When the sim-baseline suite runs, then all fixtures shall be byte-identical to Cycle 64 (client-only cycle).
- [ ] When `npm test`, `npm run lint`, and `npm run build` run at cycle close, then all shall pass.
- [ ] When the close commit lands on `main`, then the sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`docs/archive/cycles/cycle-64-plan.md`](archive/cycles/cycle-64-plan.md) - the foundation this builds on (the coastline primitive + Wolf Coast scene)
- [`js/atmosphere/DayNightCycle.js`](../js/atmosphere/DayNightCycle.js) - the sun-arc controller to enable + schedule
- [`js/cinematic.js`](../js/cinematic.js) - `makeCameraPath()` for the skip cutscene
- [`js/components/GameHUD/HudLayout.tsx`](../js/components/GameHUD/HudLayout.tsx) + [`js/components/hooks/useGameState.js`](../js/components/hooks/useGameState.js) - the HUD idiom
- [`js/gamestate/countingMode.js`](../js/gamestate/countingMode.js) - the client-only round-controller precedent for the day loop
- [`js/FencePresets.js`](../js/FencePresets.js) + [`js/StructureBuilder.js`](../js/StructureBuilder.js) - the fence + gate builders
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - scene-as-data, atmosphere/fog, grass, heightfield rules
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - the deterministic boundary this cycle stays outside of
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files + authorization protocol
