# Cycle 3 Track 1 — Cleanup

> Prerequisite for Tracks 2 and 3. Nothing user-visible should change. Every item here is a measurable reduction in code, coupling, or runtime cost.

## Why this track is first

Adding a scene-picker UI on top of a state machine that still imports three hidden legacy DOM managers doubles the confusion. Delete first, build second.

## Work items

### 1. Legacy DOM UI — audit reclassified 2026-04-24

The original framing ("three dead files, delete them") did not survive first contact with the code. Real picture:

**`js/StaminaUI.js` (pre-delete) — truly dead.** Grepped 2026-04-24: zero callers, zero constructors, zero imports. Stamina is fully owned by the React HUD. **Deleted in this cycle.**

**`js/StartScreen.js` (370 lines, pre-rename) — misnamed, load-bearing.** Not a DOM class; it is the *game-start controller*. Owns:
- `NetworkManager` instantiation + all network event handlers
- Cinematic menu camera (`setupCinematicCamera`, `updateCinematicCamera`)
- Solo / local / MP entry flows (`selectSolo`, `selectLocal`, `createRoom`, `joinRoom`, `quickMatch`, `startMultiplayerGame`, `leaveRoom`)
- Dog persistence (`selectDog`, `loadDogSelection`, localStorage)
- The `onGameStart` callback that `main.js` wires to the game loop boot

React (`App.js:293, 664, 867`) calls its methods via `GameBridge.getStartScreen()`. Deleting it breaks the entire game.

**Action taken 2026-04-24:** renamed to [`js/MenuController.js`](../js/MenuController.js); class `StartScreen` → `MenuController`; method `isStartScreenActive()` → `isMenuActive()` (to avoid collision with `this.isActive` property). Accessor `getStartScreen()` → `getMenuController()`. Instance field `this.startScreen` → `this.menuController`. No behavior change. Build green.

**`js/MultiplayerUI.js` (501 lines, pre-rename) — half-dead.** DOM-mutation methods (`renderPlayerList`, `renderCompetitiveScoreboard`, `showCompetitiveCompletion`, `updateConnectionIndicator`, `updatePingDisplay`) write into elements hidden by CSS at [`css/main.css:95`](../css/main.css) — those writes are wasted. But the class is also a *state store* that React reads through `getMultiplayerUI()` in [`useGameState.js:30`](../js/components/hooks/useGameState.js): ping, connection state, player list, scores all live here.

**Action taken 2026-04-24:** renamed to [`js/MultiplayerState.js`](../js/MultiplayerState.js). Trimmed 501 → 95 lines. Kept: `setGameMode`, `updatePlayers`, `updateConnectionStatus`, `updatePing`, `updatePlayerScores`, `updateWinProgress`, `addPlayer`, `removePlayer`. Dropped: `showCompetitiveCompletion` (never called; React `CompletionScreen` handles this), `updatePlayerGameState` (never called), `getPlayers` / `getConnectionState` / `getCurrentPing` (never read), `startPingMeasurement` / `completePingMeasurement` (duplicated on `NetworkManager`), `renderPlayerList` / `renderCompetitiveScoreboard` / `updateConnectionIndicator` / `updatePingDisplay` (DOM writes to hidden elements). Kept `show()` / `hide()` as no-ops to avoid churn at main.js call sites. Accessor `getMultiplayerUI()` → `getMultiplayerState()`. Build green.

**Ordering:** StaminaUI delete (done), StartScreen rename (done), MultiplayerUI trim (done) — took these in one session since dead-code analysis let us trim confidently without waiting on the event-based `useGameState` refactor.

**Still pending:** remove `#start-screen, .game-ui, #multiplayer-hud { display: none !important }` rules from [`css/main.css:95-97`](../css/main.css) — confirm [`index.html`](../index.html) elements are truly orphan first (`#start-screen` is still referenced by `App.js` for a DOM overlay dismissal). Update `ARCHITECTURE.md` after.

### 2. Consolidate `GameBridge` accessors

[`GameBridge.js`](../js/GameBridge.js) is a 296-line façade over `window.gameInstance`. It's serviceable. After item 1, audit the remaining ~20 accessors and delete any that have exactly one caller — inline them. Target: under 150 lines. Do not replace the pattern; the façade is fine at its size.

### 3. HUD polling → events — done 2026-04-24

Previously: `useGameState.js` ran `setInterval(..., 16)` pulling from five managers through GameBridge.

Implemented shape (simpler than the original pitch): a single `EventTarget` in [`GameBridge.js`](../js/GameBridge.js). The animate loop (`main.js` → `animate()`) calls `emitGameEvent('frame')` after `sceneManager.render()`. `useGameState` calls `subscribeGameEvent('frame', readGameState)` and returns the unsubscribe fn from its `useEffect` cleanup. Same cadence (one read per render frame), but:

- HUD re-reads are driven by the render loop itself (rAF-aligned; auto-throttles when tab backgrounded).
- Clean unsubscribe on unmount instead of a lingering interval.
- Explicit coupling: `emitGameEvent('frame')` is the single integration point; easy to throttle or split by event type later.

Did *not* add per-object emitters on `GameState` / `GameTimer` / `Sheepdog` — the single frame-event is enough; per-object emitters would have required touching every mutation site for no current payoff. Revisit if we ever need finer-grained update signals (e.g. HUD-only vs. minimap-only).

### 4. Design tokens — retired 2026-04-24

Audit showed only one consumer: `js/components/ui/Button.js` pulled `buttonStyle`. The rest of the token surface (`glass`, `glassLight`, `menuOptionStyle`, `panelStyle`, responsive helpers) was unused.

**Action taken:** inlined the needed style values (literal rgba/rem) into [`js/components/ui/Button.js`](../js/components/ui/Button.js); deleted `js/styles/` entirely. Tailwind + the `.ui-panel` / `.mobile-control` classes in [`css/main.css`](../css/main.css) are the real system. Document in `ARCHITECTURE.md` when time permits.

### 5. Trim i18n locales

[`index.html`](../index.html) wires hreflang for 18 locales. [`js/locales/`](../js/locales/) ships translation JSON for all of them. For a project with no active userbase, maintaining 18 translations is a tax on every new UI string.

- Keep SEO hreflang tags in `index.html` (cheap, helps crawlers).
- Ship runtime UI in **en + es + pt + ja + zh-CN** only. Drop the other 13 locale files and their loader branches in [`js/i18n.js`](../js/i18n.js).
- Document in ARCHITECTURE.md: "SEO in 18 languages, UI in 5. Expand when a locale has measurable organic traffic."

### 6. Consolidate remaining boid classes

Audited 2026-04-24:

- `js/ExtremeBoid.js` — orphan duplicate of `Boid`, zero importers. **Deleted.**
- `js/Boid.js` — live, imported by [`js/OptimizedSheep.js:4`](../js/OptimizedSheep.js).
- `js/ExtremeBoidSystem.js` — live, imported by [`js/GameState.js:5`](../js/GameState.js) and `OptimizedSheep.js:9`.

The remaining consolidation — routing `Boid.js` + `ExtremeBoidSystem.js` behind `shared/FlockingAlgorithms.js` — is a runtime-path change that requires verifying flocking behavior byte-matches the Worker's copy. Defer to a dedicated PR; this is not a pure cleanup item. Open question: is the client's `ExtremeBoidSystem` an optimization the Worker doesn't need (GPU-adjacent batching), or is it drift that should be erased?

### 7. React — `createElement` or JSX (optional, standalone)

`ARCHITECTURE.md` commits to `React.createElement` with "no JSX" as an intentional choice. Re-evaluate:

- Pro of switching: UI iteration cost roughly halves. Scene picker work (Track 2) will be the first big UI expansion in months — good moment to reduce friction.
- Con: one extra Vite plugin, one codemod PR, diff noise.

Recommendation: flip to JSX as a standalone PR before Track 2 begins. Zero behavior change; the codemod is mechanical.

## Success criteria

- [x] `js/StaminaUI.js` deleted (zero callers, truly dead). 2026-04-24.
- [x] `js/StartScreen.js` → `js/MenuController.js`; `getStartScreen` → `getMenuController`; `isStartScreenActive()` → `isMenuActive()`. 2026-04-24.
- [x] `js/MultiplayerUI.js` → `js/MultiplayerState.js`; DOM-write methods deleted; class trimmed 501 → 95 lines. 2026-04-24.
- [ ] `#start-screen`, `.game-ui`, `#multiplayer-hud` `display:none` rules removed from [`css/main.css`](../css/main.css); corresponding dead DOM removed from [`index.html`](../index.html).
- [ ] `main.js` line count dropped by at least the size of the deleted DOM code + its usage sites.
- [x] `useGameState` has zero `setInterval`; subscribes to `frame` event from GameBridge. 2026-04-24.
- [x] `js/styles/` deleted; `buttonStyle` inlined into `js/components/ui/Button.js`. 2026-04-24.
- [x] `js/locales/` holds 5 language files (en, es, pt, ja, zh-CN). 2026-04-24.
- [x] `js/ExtremeBoid.js` deleted (orphan). 2026-04-24.
- [ ] `js/Boid.js` + `js/ExtremeBoidSystem.js` evaluated against `shared/FlockingAlgorithms.js` — decision recorded, code consolidated or drift explicitly justified.
- [ ] `npm run build` green. Playtest: solo classic + MP cooperative still work.
- [ ] `ARCHITECTURE.md` updated to match.

## Not in this track

- Adding new UI — that's Track 2.
- Scene refactor — that's Track 3.
- Changing wire protocol, worker code, or `shared/*.js` sim logic.

## DX work shipped alongside Track 1 (discovered 2026-04-24)

Not in the original plan but surfaced during playtest. Kept here so the next agent sees the full story.

- `npm run dev` now starts Vite (`:3000`) + wrangler (`:8787`) concurrently. `npm run dev:client` / `dev:worker` for granular control. `npm run dev:setup` applies the D1 migration to the local sqlite shadow of `sds-db`.
- [`worker/.dev.vars.example`](../worker/.dev.vars.example) committed. Fresh clones copy it to `.dev.vars` (gitignored) to populate `JWT_SECRET` for local HMAC signing. Prod secrets untouched.
- [`js/components/Multiplayer/Lobby.js`](../js/components/Multiplayer/Lobby.js) + [`js/components/StartScreen/SandboxSetup.js`](../js/components/StartScreen/SandboxSetup.js) invite/share URLs now use `${location.origin}` instead of `https://sheepdogsim.com`. Host on localhost + join on localhost now works without routing the client at production.
- [`NEXT_SESSION.md`](../NEXT_SESSION.md) has a "Running locally" section with the first-time setup flow so a cold-start agent is off in two commands.

## Remaining

Small polish, none blocking Tracks 2/3:

- [ ] Audit `#start-screen`, `.game-ui`, `#multiplayer-hud` DOM elements in [`index.html`](../index.html). `#start-screen` is still referenced by an overlay-dismissal in [`App.js`](../js/components/App.js) (search `startScreenEl`) — verify it's truly orphan (or decide to keep as React mount point) before deleting. Then remove the matching `display: none !important` rules in [`css/main.css:95`](../css/main.css).
- [ ] `GameBridge.js` accessor consolidation (cleanup § 2). Currently 296 lines; target < 150 lines by inlining single-caller accessors.
- [ ] Boid consolidation (cleanup § 6). Open architectural question: is client `ExtremeBoidSystem` batching for rendering (keep) or drift from the authoritative `shared/FlockingAlgorithms.js` (erase)? Needs a decision.
- [ ] Optional: JSX flip (cleanup § 7). Worth doing as a standalone PR *before* Track 2 menu work to reduce UI-iteration friction.
