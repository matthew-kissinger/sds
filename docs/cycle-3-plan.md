# Cycle 3 Plan — Shell, Scene, Cleanup

> Master plan. Written 2026-04-24. Read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first. Track details in sibling `cycle-3-*.md` docs.

## Why this cycle exists

Cycle 2 shipped the backend and kept the client monolithic. Three pressures now point at the same refactor:

1. **Roadmap is content-heavy.** [`cycle-2-todo.md`](cycle-2-todo.md) § "Roadmap beyond Cycle 2" lists rolling hills, river crossings, moorland, canyon, forest, weather, time-of-day, predators, rival herders, mod-friendly scene format, seasons. Every one of those is currently a fork of `TerrainBuilder.js` + `GameState.js` + `main.js`. That's untenable past biome #2.
2. **UI shell is mode-agnostic but the content direction is scene-specific.** A biome has unique modes, props, weather, bounds. The current 2×3 mode grid has no place for that.
3. **The client has real deadwood and misnamed controllers.** `StaminaUI.js` is a true no-op (deleted 2026-04-24). `StartScreen.js` is a misnamed *game-start controller* that owns the NetworkManager and all menu entry flows — needs a rename, not a delete. `MultiplayerUI.js` is half-dead: its DOM-write methods target hidden elements but its state-tracking is read by React via `getMultiplayerUI()` — needs surgical trim + rename. HUD state polls every 16ms. Design tokens exist and aren't used. i18n was wired for 18 locales speculatively. Detail and revised plan in [`cycle-3-cleanup.md`](cycle-3-cleanup.md) § 1.

Cycle 3 addresses all three without a rewrite.

## Scope

**In:**
- Delete legacy DOM UI, consolidate duplicated managers, kill polling, adopt or retire design tokens, trim i18n.
- Game-identity decision → mode-shaped HUD.
- Scene-first menu structure (replacing mode-first).
- First-run onboarding tutorial (3 steps, once per player).
- In-game locator (minimap or compass chevron — Track 2 picks).
- Real dog thumbnails in `DogSelection` (render from in-game models).
- `shared/scenes/` scene-definition schema + registry.
- Refactor `TerrainBuilder` → biome-consuming `BiomeBuilder` that reads scene defs.
- Ship one additional biome (Rolling Hills) as proof the architecture holds.

**Out:**
- New ECS library. Current `shared/*.js` functional-physics-module style is adequate for this cycle.
- WebGPU migration. Three.js + WebGL2 is fine for the next 2-3 biomes.
- Predators, rival herders, sheep personalities, weather, time-of-day — these are downstream of the scene-arch work; they ship in Cycle 4+ against the new foundation.
- Native mobile apps, SpacetimeDB, `20 Hz` tick — out per [`DECISIONS.md`](../DECISIONS.md).

## Tracks

### Track 1 — Cleanup (blocks Track 2/3)
Dead-code removal, polling → events, design-token adoption, locale trim. Detail: [`cycle-3-cleanup.md`](cycle-3-cleanup.md).

### Track 2 — UI/UX Vision Pass
Mode-shaped HUD, scene-first menu, onboarding, locator, real dog thumbnails, menu hierarchy. Detail: [`cycle-3-ui-ux.md`](cycle-3-ui-ux.md).

### Track 3 — Scene / Biome Architecture
Scene-definition schema, `BiomeBuilder` refactor, scene registry, second biome (Rolling Hills). Detail: [`cycle-3-scene-arch.md`](cycle-3-scene-arch.md).

## Ordering

```
Track 1 (cleanup) ─┬─> Track 2 (UX)   ─┐
                   │                    ├─> Rolling Hills biome ships
                   └─> Track 3 (scene) ─┘
```

Track 1 is a hard prerequisite. It halves the maintenance surface before Tracks 2 and 3 add to it.

Tracks 2 and 3 can proceed in parallel once Track 1 lands. Track 2 owns the UI shell for the scene picker; Track 3 owns the first scene definition that the picker consumes. They converge on "Rolling Hills ships with its own picker tile and biome renderer."

## Success criteria

Cycle 3 closes when all of:

- [x] `npm run build` clean. (Ongoing — rerun at each track boundary.)
- [ ] `npx vitest run` green (no new skipped tests).
- [ ] `main.js` is < 1,500 lines (currently 2,249) — concrete proxy for "did we actually reduce coupling." Meaningful shrink lands with Track 2 (menu extraction) + Track 3 (scene extraction); Track 1 alone doesn't move this number much.
- [x] `js/StaminaUI.js` deleted. 2026-04-24.
- [x] `js/StartScreen.js` → `js/MenuController.js` (it was a controller, not DOM legacy). 2026-04-24.
- [x] `js/MultiplayerUI.js` → `js/MultiplayerState.js`; DOM-write methods gone; 501 → 95 lines. 2026-04-24.
- [ ] Dead `#start-screen` / `.game-ui` / `#multiplayer-hud` DOM elements removed from index.html; CSS rules that hide them removed. *(Needs audit — `#start-screen` still referenced by `App.js` DOM overlay.)*
- [x] `js/styles/` deleted; `buttonStyle` inlined into Button.js. 2026-04-24.
- [x] `js/locales/` trimmed to 5 runtime languages. 2026-04-24.
- [x] `useGameState` hook no longer polls on an interval; subscribes to `frame` event from `GameBridge`. 2026-04-24.
- [x] Game identity decided: **mode-shaped**. 2026-04-24.
- [x] Local dev DX: `npm run dev` starts Vite + wrangler together; `npm run dev:setup` applies D1 migrations; invite/share URLs use `location.origin` (no more prod-vs-dev mismatch); `worker/.dev.vars.example` committed. 2026-04-24.
- [ ] Main menu top-level choices are **scenes**, not modes. Settings/Leaderboard are corner icons.
- [ ] First-time visitor sees a 3-step tutorial overlay on first game.
- [ ] In-game locator exists and helps a new player find the flock.
- [ ] `DogSelection` shows real dog renders, not color-coded SVG placeholders.
- [ ] At least one additional biome ("Rolling Hills") is playable, shipped from a scene-definition file with no changes to core sim code.
- [ ] User has played the whole loop on live and confirmed it feels coherent.

## Risks

| Risk | Mitigation |
|---|---|
| Identity decision drifts — Track 2 stalls waiting for it | Land Track 1 first. By the time Track 2 is ready to start, the decision is forced. |
| Refactoring `TerrainBuilder` (1,697 lines) breaks the Home Field | New `BiomeBuilder` consumes a scene def; first def is `field` with existing behavior preserved. Home-Field parity is the first test, not the second biome. |
| Legacy deletion breaks an obscure code path | Each deletion is its own PR. `grep -r` before delete, `npm run build` after. |
| Scope creep into weather / predators / seasons | Explicitly out per § Scope. If the content tracks are tempting, remember: they ride on Cycle 3 infrastructure and will be cheap in Cycle 4. |

## How to hand off to the next agent

When you finish a track, update the success-criteria checklist at the bottom of the respective track doc and leave a short "what's next" note at the bottom of this file. Don't silently close work.

## Progress log

**2026-04-24 — Track 1 substantially complete, game identity decided.**

What shipped: StaminaUI/ExtremeBoid deletes; StartScreen→MenuController rename; MultiplayerUI→MultiplayerState trim (501→95 lines); `useGameState` polling→events refactor; `js/styles/` retired with `buttonStyle` inlined into Button.js; i18n trimmed 18→5 runtime locales. Vision: **mode-shaped** (Classic=zen register, Timed/Racing=arcade, Sandbox=playground; menu shell tonally neutral). DX: `npm run dev` now runs Vite + wrangler concurrently, `dev:setup` applies D1 migrations locally, invite/share URLs use `location.origin`, `.dev.vars.example` committed for fresh clones.

What was discovered mid-cycle and factored in: the cleanup doc's original assumption that `StartScreen.js` / `MultiplayerUI.js` were "dead DOM" was wrong — they were misnamed controllers / state stores. Docs corrected. Also discovered: local dev needed several hidden setup steps (wrangler, D1 migration, JWT secret, invite URL origin) — all addressed as explicit scripts + one-time setup docs.

What's next: **Track 2 + Track 3 can start in parallel.** Remaining Track 1 polish (dead-DOM audit in index.html, GameBridge accessor consolidation, optional JSX flip, boid consolidation decision) can slot in opportunistically but don't block the content tracks. See [`cycle-3-cleanup.md`](cycle-3-cleanup.md) § "Remaining".

**2026-04-24 — Track 3 Step 1 (scene data schema + sim wire-up) landed.**

What shipped: `shared/scenes/{types,field,index}.js` — JSDoc-typed scene definition schema, Home Field (renamed from "valley" — it's a flat fenced play area ringed by mountain props, not a true valley) captured as data, registry with `loadScene` / `listScenes` / `DEFAULT_SCENE_ID`. `shared/index.js createGameState` now sources defaults from the scene; explicit config fields still override. `worker/src/GameSim.js` loads the scene via `room.sceneId || DEFAULT_SCENE_ID` in the constructor and uses it for bounds + sheep spawn in both `createGameState` and `createCompetitiveGameState` paths. `npm run build` green. `npm test` 30/30 pass. Player-visible parity pending playtest confirmation.

What was decided: scene files use `.js` + JSDoc (not `.ts`) — shared/ is consumed by three contexts (Vite, wrangler/esbuild, Node tests) and all handle `.js` with zero build config; JSDoc gives IDE types without adding tooling. Scene id is `field` / "Home Field" (not "valley") — matches existing `FIELD_SIZES` / `FIELD_SHAPES` vocabulary in [`js/FieldConfig.js`](../js/FieldConfig.js).

What's next: **Track 3 Step 1b** — client renderer wire-up (`BiomeBuilder`, `TerrainBuilder` + `GrassSystem` parameterization). Not strictly needed until Step 2 (Rolling Hills), but easiest to land in the same Track 3 pass. See [`cycle-3-scene-arch.md`](cycle-3-scene-arch.md) § "Migration plan".
