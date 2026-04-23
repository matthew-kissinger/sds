# SDS · Agent-Driven Development Cycle

> **Single source of truth for the current development cycle.**
> An agent spawned in this repo with only this file for context should be able to execute any track below without prior conversation history.

---

## 0 · How to use this file

If you are an agent reading this:

1. **Read Sections 1-6 fully before doing anything.** They define the codebase, the locked-in decisions, and the rules. Skipping them means you will re-litigate decisions the human already made.
2. **Pick the track the human told you to execute.** Do not pick one yourself. If no track was named, stop and ask which track.
3. **Execute only that track.** Do not start adjacent work. Track scopes are deliberate fences.
4. **Update Section 7 (Track Status) when you finish.** Mark the track `[x] DONE` and append a 1-2 line note of what shipped + the PR/commit hash. This lets the next session resume cleanly.
5. **If you hit a blocker**, stop and report. Do not pivot to a different track to stay busy.
6. **When the user asks to "continue" or gives no track**, read Section 7 and ask which unfinished track to pick up.

### House rules for agents (these override default Claude Code behavior)

- **Use `uv` for any Python, never `pip`.** (This repo is JS but the rule stands if Python tooling is ever touched.)
- **No emojis in code or commit messages.** Some existing server code has them; don't add more.
- **Hyphens, not em-dashes**, in any user-visible text you write.
- **Don't ask permission for local, reversible actions** — edit files, run builds, run tests freely. Do ask before: force-pushing, deleting branches, destroying the DigitalOcean droplet, running destructive SQL.
- **When a task says "under N words" on a report, respect it.** Long reports push the cost onto the human.
- **Before proposing "let me add a library to do X"**, check if there's already a primitive. This codebase is deliberately light on deps.
- **Don't refactor outside your track.** If you notice App.js is 934 lines while working on Track A, note it in your report and move on.

---

## 1 · Project primer

**Name:** Sheep Dog Simulator (SDS)
**Live:** sheepdogsim.com (GitHub Pages + Cloudflare CDN)
**API (today):** api.sheepdogsim.com → DigitalOcean droplet 147.182.185.185, Node 18 + Geckos.io + SQLite
**Repo:** github.com/matthew-kissinger/sds
**Local path:** `C:\Users\Mattm\X\games-3d\sds`

### What the game is

3D browser herding game. Player controls a sheepdog, herds sheep into a gate. Written for the web, runs on desktop + mobile. 6 game modes (classic, extreme, insane, chaos, timed, competitive), 5 dog breeds, sandbox editor, 18 localized languages, WebRTC multiplayer up to 4 players. 200-5000 sheep depending on mode, GPU-instanced with custom shaders.

### Stack (current)

- **Frontend:** Vite 7 + React 19 + Three.js 0.181 + Tailwind v4
- **UI:** React with `createElement` (no JSX), i18next, nipplejs (mobile joystick)
- **Networking (today):** @geckos.io/client (WebRTC/UDP) + @geckos.io/server on droplet
- **Backend (today):** Node 18, PM2, better-sqlite3, ~207 players in leaderboard
- **Hosting:** GitHub Pages frontend, Cloudflare DNS proxy, DigitalOcean $6/mo droplet for server
- **Build:** dual target — GitHub Pages (absolute paths) + itch.io (relative paths)

### Codebase map (read this before touching files)

```
sds/
├── index.html                     ← entry, heavy SEO meta + ld+json
├── about.html                     ← secondary page
├── sw.js                          ← service worker, cache-first
├── vite.config.js                 ← dual-target build config
├── package.json                   ← root deps + server deploy scripts
│
├── js/
│   ├── main.js                    ← 2103 lines, game orchestrator, god object
│   ├── GameState.js               ← sim config, mode switching, sandbox
│   ├── SceneManager.js            ← Three.js scene/camera/renderer setup
│   ├── GrassSystem.js             ← 800k+ blade instanced grass
│   ├── OptimizedSheep.js          ← 1761 lines, sheep InstancedMesh + shader
│   ├── ExtremeBoidSystem.js       ← spatial-hash flocking, SoA arrays, used for 1000+ sheep
│   ├── Sheepdog.js                ← player/NPC dog entity
│   ├── TerrainBuilder.js          ← terrain, trees, structures, farm house
│   ├── StructureBuilder.js        ← fences, gates, pastures
│   ├── NetworkManager.js          ← Geckos client wrapper
│   ├── AudioManager.js            ← SFX, bleats, chimes
│   ├── InputHandler.js            ← keyboard + gamepad
│   ├── GamepadManager.js          ← standard gamepad API
│   ├── MobileControls.js          ← nipplejs + touch buttons
│   ├── LocalInputHandler.js       ← 2P local input (MESS, see Track E)
│   ├── LocalMultiplayerManager.js ← 2P local orchestration (MESS, see Track E)
│   ├── TwoPlayerCamera.js         ← shared camera for 2P local
│   ├── SandboxConfig.js           ← sandbox mode config serialization
│   ├── FenceCollisionSystem.js    ← sandbox fence collision
│   ├── FencePresets.js            ← named fence layouts
│   ├── FieldConfig.js             ← field size presets
│   ├── GameTimer.js               ← wall-clock game timer with pause
│   ├── GameAssetLoader.js         ← progressive asset loader
│   ├── GameBridge.js              ← singleton getters, React↔Three.js boundary
│   ├── MultiplayerUI.js           ← legacy vanilla-JS multiplayer UI (partial)
│   ├── PerformanceMonitor.js      ← FPS + stats overlay
│   ├── StartScreen.js             ← legacy start screen (partial)
│   ├── Vector2D.js                ← 2D vector math (local copy; also in shared/)
│   ├── i18n.js                    ← eagerly loads all 18 locales
│   ├── skeleton-loader.js         ← pre-react HTML skeleton
│   ├── components/                ← React 19 UI, createElement throughout
│   │   ├── App.js                 ← 934 lines, god component
│   │   ├── GameHUD/               ← in-game HUD
│   │   ├── Multiplayer/           ← lobby, room join/create, leaderboard
│   │   ├── StartScreen/           ← mode select, dog select, sandbox setup
│   │   ├── hooks/                 ← useGameState polls every 16ms
│   │   ├── shared/                ← settings, player identity persistence
│   │   └── ui/                    ← Button, Panel, LanguageSelector
│   ├── locales/                   ← 18 language packs (eager, ~6400 lines total)
│   ├── shaders/
│   │   ├── ShaderLoader.js        ← async fetch + placeholder replacement
│   │   ├── grass/                 ← desktop-vertex, mobile-vertex, fragment
│   │   └── sheep/                 ← vertex, fragment (per-fragment FBM wool)
│   ├── styles/                    ← design tokens, CSS-in-JS snippets
│   └── utils/
│       ├── Logger.js
│       └── ScreenshotCapture.js
│
├── shared/                        ← client + server shared sim code
│   ├── Vector2D.js
│   ├── FlockingAlgorithms.js      ← O(n²) classic boids
│   ├── MovementPhysics.js
│   ├── BoundaryCollision.js
│   ├── GameStateValidation.js
│   ├── index.js                   ← barrel export
│   ├── package.json
│   └── test.js
│
├── server/                        ← Node server (moving to CF DO in Track C)
│   ├── index.js                   ← Geckos server, event handlers
│   ├── RoomManager.js             ← room codes, player tracking
│   ├── GameSimulation.js          ← 60Hz authoritative sim
│   ├── LeaderboardManager.js      ← SQLite leaderboard + persistent IDs
│   ├── package.json               ← better-sqlite3 + @geckos.io/server
│   └── deploy-to-droplet.sh       ← one-time provisioning
│
├── assets/                        ← GLB models, images, audio
├── css/                           ← Tailwind v4 source + custom layers
├── public/                        ← static passthrough
├── dist/                          ← Vite build output (gitignored)
│
├── CNAME                          ← GitHub Pages custom domain
├── sitemap.xml
├── robots.txt
├── sheepdogsim2025.txt            ← site verification
│
├── DECISIONS.md                   ← written during Track A; cycle decisions
└── AGENT_PLAN.md                  ← this file
```

### External systems

- **DigitalOcean droplet 147.182.185.185**, 1GB RAM, SSH alias `sds` (see `~/.ssh/config`). Runs `sds-multiplayer-server` under PM2.
- **Cloudflare zone sheepdogsim.com** (Free plan), DNS + CDN proxy. API token needed for Workers/Pages deploys — user will provide when asked.
- **GitHub Pages** at `matthew-kissinger.github.io/sds` mapped to sheepdogsim.com via CNAME.
- **itch.io page** for SDS (user handles upload manually via `build-itchio.ps1`).

### Windows/PowerShell gotchas (this is a Windows dev box)

- Default shell in Claude Code is Git Bash; it strips `$` from PowerShell variables. For PowerShell with variables, write a `.ps1` file first, then invoke with `powershell -ExecutionPolicy Bypass -File path.ps1`.
- Use forward slashes in Windows paths for cross-tool compatibility: `C:/Users/Mattm/X/games-3d/sds`.
- Line endings: repo uses LF; git autocrlf handles it. Don't fight it.

---

## 2 · Decisions — locked in, do not re-litigate

These were decided with the human during consultation. Agents executing tracks must treat them as constraints, not options.

1. **Backend migrates to Cloudflare Workers + Durable Objects + WebSockets.** SpacetimeDB was considered and deferred. Geckos/WebRTC and the droplet go away in Track C/G.
2. **Frontend moves to Cloudflare Pages.** GitHub Pages retires in Track F.
3. **Leaderboard moves to Cloudflare D1.** Not DO storage, not external SQLite. The 207-player SQLite dataset on the droplet gets migrated.
4. **Tick rate drops from 60Hz to 20Hz** server-side once on DO. Clients interpolate.
5. **Wire protocol becomes MessagePack over WebSocket** with delta-encoded sheep state. JSON-everywhere is out.
6. **Auth:** persistent_id (localStorage) + Worker-issued short-lived signed token. Signed with `JWT_SECRET` Workers secret.
7. **Lobby UX:** shareable invite URLs, public lobby list, host-starts, host-migration on disconnect, game-mode cycling in public rooms.
8. **Drop `framer-motion` and `stats.js`** — unused. Node engines pin to `>=22.0.0`.
9. **SpacetimeDB — not now.** Revisit for a future persistent-world project.
10. **Keep the droplet running in parallel for 30 days after DO cutover** as rollback. Track G destroys it.

---

## 3 · Out of scope this cycle

Don't do these even if tempted. They're all real work that will happen in a future cycle.

- React component refactor (App.js splitting, JSX conversion).
- WebGPU migration.
- Shader optimizations beyond what Track A touches.
- Full i18n lazy loading.
- Adding new game modes or dog breeds.
- Mobile perf rework beyond critical fixes.
- Any sandbox feature beyond Track D's shareable URLs + the D1 punch-list items.
- Anti-cheat beyond the `clientPosition` and score-bounds fixes in Track A.
- PWA install manifest.
- Gamepad rebinding UI.

If the human asks for one of these during track execution, say "out of scope for this cycle, flagging for next cycle" and do not start it.

---

## 4 · Known issues carried into this cycle (for reference during execution)

These come from the prior audit. Fixes are either in Track A (quick wins), folded into Track B/C (replaced by new architecture), or explicitly deferred (see Section 3).

**Confirmed bugs addressed in Track A:**
- `server/index.js:600-608` `handlePlayerDisconnect` double-decrements `connectionsActive` (prod counter currently -5).
- `server/index.js:309-349` `handleQuickMatch` throws if player already in a room (no pre-leave).
- `server/GameSimulation.js:293-301` accepts unbounded `clientPosition` → teleport exploit.
- `server/LeaderboardManager.js` accepts any score value, any persistent_id.
- `sw.js:6` hardcoded cache name never invalidates.
- `index.html:247-253` fake aggregateRating (Google SD policy violation).
- `index.html:212` FAQ says "6 players", actual max is 4.
- No `uncaughtException` / `unhandledRejection` handlers on server.

**Replaced by Track C (don't fix in place):**
- Full-state broadcast at 60Hz (→ 20Hz delta over MessagePack).
- Geckos transport on non-standard port.
- SQLite on droplet (→ D1).
- PM2 memory limit misconfigured.

**Out of scope this cycle (reference only):**
- Service worker cache invalidation gets fixed in Track A but SW itself isn't reworked.
- Component bloat, shader optimizations, i18n lazy loading.

---

## 5 · Sequencing

```
Track A  → Track B1 (design) → Track B2 (impl)
                                    ↓
                            Track C1 → Track C2 → Track C3 → Track C4
                                    ↓        (parallel with C2+)
                            Track D (sandbox polish)
                            Track E (2P local rewrite)
                                    ↓ (after C4 stable)
                            Track F (CF Pages) → Track G (cleanup)
```

Critical path is A→B→C. D, E, F can be dispatched in parallel with C. G is last.

Each track expects a fresh agent session. Don't try to chain tracks in one session.

---

## 6 · Dispatching agents

This repo's `.claude/` setup includes Explore, Plan, general-purpose, and orchestrator subagent types. Use them:

- **Track B1 design:** `orchestrator` — it specs without implementing.
- **Track D1 diagnosis, Track E1 investigation:** `Explore` — read-only, structured punch lists.
- **Everything else:** `general-purpose` or execute directly.

When dispatching sub-agents inside a track, include the relevant Section 1 context (codebase map + file paths) in the prompt — the sub-agent won't auto-read this file.

---

## 7 · Track status

Update this section as tracks complete. Format: `[x] Done — <commit-sha> — <1-line note>`.

```
[x] Track A · Foundations — 83beb3e — bug fixes, dep cleanup, build config, SW cache invalidation, DECISIONS.md
[x] Track B1 · Lobby UX design doc — done — docs/multiplayer-ux.md created
[ ] Track B2 · Lobby UX implementation
[ ] Track C1 · Workers scaffold + D1 schema
[ ] Track C2 · Simulation port to RoomDO
[ ] Track C3 · Client swap to native WebSocket
[ ] Track C4 · Cutover + data migration
[x] Track D1 · Sandbox diagnosis — done — docs/sandbox-punchlist.md created
[x] Track D2 · Sandbox share URLs — done — lz-string, serialize/deserialize on SandboxConfig, share button in SandboxSetup, hash detection in App.js
[ ] Track D3 · Sandbox punch-list fixes
[x] Track E1 · 2P local investigation — done — docs/2p-local-report.md created
[ ] Track E2 · 2P local execution
[ ] Track F  · CF Pages + CI
[ ] Track G  · Post-migration cleanup
```

---

## TRACK A · Foundations

**Dispatch:** single session, general-purpose agent or direct execution.
**Estimated effort:** 90 minutes.
**Blocks:** everything else.

### Goal

Land urgent small fixes, refresh dependencies, record decisions. Must ship before any larger track.

### Prompt for the agent

> You are executing Track A of `AGENT_PLAN.md` in the SDS repo. Read Sections 0-6 of that file first. Work in `C:/Users/Mattm/X/games-3d/sds`. Ship all the following in one PR/commit batch:
>
> **Urgent fixes:**
>
> 1. Delete the `aggregateRating` block at `index.html:247-253`. Keep the rest of the WebApplication ld+json intact.
> 2. At `index.html:212`, change "up to 6 players" to "up to 4 players".
> 3. In `server/index.js` at the top of `handlePlayerDisconnect` (line ~600), add: `if (!this.players.has(playerId)) return;` so the counter can't double-decrement.
> 4. In `server/index.js` `handleQuickMatch` (line ~294), before the `findQuickMatchRoom` call, add: `if (player.roomCode) this.handleLeaveRoom(playerId);` so the fallback `createRoom` can't throw "already in a room".
> 5. In `server/index.js`, before the final `server.start().catch(...)` call, register:
>    ```js
>    process.on('uncaughtException', (err) => { console.error('[UNCAUGHT]', err.stack || err); });
>    process.on('unhandledRejection', (reason) => { console.error('[UNHANDLED]', reason); });
>    ```
> 6. In `server/GameSimulation.js` `applyPlayerInput` (line ~270), before applying `clientPosition`, compute `dx = clientPosition.x - sheepdog.position.x`, `dz = clientPosition.z - sheepdog.position.z`. If `dx*dx + dz*dz > 25` (5 units squared), ignore `clientPosition` entirely — fall through to normal physics. Add a `console.warn` when ignoring so we can see abuse attempts.
> 7. In `server/LeaderboardManager.js` `submitScore` (line ~290), add bounds before the switch:
>    - `soloClassic`, `soloExtreme`, `cooperative`: `score >= 30 && score <= 3600`
>    - `timed`: `Number.isInteger(score) && score >= 0 && score <= 500`
>    - `competitive`: `score === 0 || score === 1`
>    On violation, `throw new Error('score out of bounds for mode ' + gameMode)`.
> 8. Remove the per-row `console.log` at `server/LeaderboardManager.js:409` (the `🔍 Score debug` line).
>
> **Service worker cache invalidation:**
>
> 9. In `vite.config.js`, add `define: { __BUILD_ID__: JSON.stringify(Date.now().toString()) }`. Rename `sw.js` → `sw.template.js` if needed, or add a small Vite plugin that substitutes `__BUILD_ID__` in `sw.js` during build. In `sw.js` line 6, replace the literal `'sheepdog-sim-v1'` with `` `sheepdog-sim-${__BUILD_ID__}` ``. Ensure the service worker file in `dist/` has the real build ID after `npm run build`.
>
> **Dependencies:**
>
> 10. In root `package.json`:
>     - Remove `framer-motion`, `stats.js`, `http-server` from deps/devDeps.
>     - Bump `three` to latest `^0.x` minor (check npm for current).
>     - Bump `react`, `react-dom` to latest `^19.x`.
>     - Bump `@gltf-transform/*` to latest.
>     - Run `npm update` for the remainder.
>     - Change `engines` to `{ "node": ">=22.0.0" }` (add if missing).
> 11. In `server/package.json`:
>     - Confirm `better-sqlite3` is bumped to latest `^12.x` (it should already be locally per the user's note).
>     - Set `engines.node` to `>=22.0.0`.
> 12. Run `npm install` in both root and server. Run `npm run build`. Fix any breaks.
>
> **Build config:**
>
> 13. In `vite.config.js`, add:
>     ```js
>     build: {
>       ...,
>       rollupOptions: {
>         ...,
>         output: {
>           manualChunks: {
>             react: ['react', 'react-dom'],
>             three: ['three'],
>             i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector']
>           }
>         }
>       }
>     }
>     ```
>     Preserve the existing `input: { main, about }` config.
>
> **Documentation:**
>
> 14. Create `DECISIONS.md` at repo root containing Section 2 of `AGENT_PLAN.md` verbatim (the 10 locked decisions). Add a timestamp and a one-line context block at the top.
>
> **Validation:**
>
> - `npm run build` must succeed cleanly in the root project.
> - Confirm `server/index.js` still parses (`node --check server/index.js`).
> - Record the bundle size before/after (rough: check `dist/assets/` size total).
>
> **Do not touch:**
> - Sheep shaders, grass shaders, component refactor, i18n loader. Those are future cycles.
> - The actual droplet — don't redeploy anything this track.
>
> **Report** (under 300 words): files changed, bundle size delta, anything that didn't land + why. Then update Track A's checkbox in Section 7 of `AGENT_PLAN.md` with the commit SHA and 1-line note.

### Acceptance criteria

- Clean `npm run build`.
- `server/index.js` parses without errors.
- `DECISIONS.md` exists at root.
- `framer-motion`, `stats.js`, `http-server` absent from `package.json`.
- Section 7 checklist shows `[x] Track A · Foundations`.

---

## TRACK B · Multiplayer lobby UX redesign

Two sub-tracks. B1 specs, B2 implements. Run B1 first, wait for human to confirm design, then run B2.

### TRACK B1 · Design doc

**Dispatch:** `orchestrator` subagent, single session.
**Estimated effort:** 60 minutes.
**Blocks:** B2.

### Goal

Produce a design doc the human reviews before implementation. No code changes.

### Prompt for the agent

> You are executing Track B1 of `AGENT_PLAN.md`. Read Sections 0-6 of that file first.
>
> Read these files in full in `C:/Users/Mattm/X/games-3d/sds`:
> - `js/components/Multiplayer/Lobby.js`
> - `js/components/Multiplayer/MultiplayerOptions.js`
> - `js/components/Multiplayer/RoomCreation.js`
> - `js/components/Multiplayer/RoomJoining.js`
> - `js/components/Multiplayer/GlobalLeaderboard.js`
> - `js/components/Multiplayer/MultiplayerScoreboard.js`
> - `js/components/StartScreen/PlayerIdentitySetup.js`
> - `js/NetworkManager.js`
> - `server/index.js` (event handlers section)
> - `server/RoomManager.js`
>
> Produce `docs/multiplayer-ux.md` with the following sections:
>
> 1. **Problem statement** (under 100 words): why current room flow is friction.
> 2. **URL schema.** Propose one of: (a) hash route `#/r/ABC123`, (b) path route `/r/ABC123`, (c) query `?room=ABC123`. Pick one with rationale. Hash avoids GH Pages 404s; path route will work once on CF Pages (Track F). Default: hash until Track F done, then migrate. Document both states.
> 3. **Flow diagrams** (ASCII art is fine) for:
>    - Main menu → public lobby list → join
>    - Invite URL → direct join (with race: what if I'm already in a lobby?)
>    - Quick Match (pick best public room, create if none)
>    - Host starts game; non-hosts see "waiting for host"
>    - Host disconnects mid-lobby → migrate to next player
>    - Completion → return to lobby → auto-cycle mode
> 4. **Component delta**: list components to keep as-is, components to modify (with specific changes), components to create (names + responsibilities), components to delete. Do NOT propose splitting App.js or other god components — that's out of scope this cycle.
> 5. **Server event surface.** Current events in `server/index.js` enumerated. For each: keep / modify / remove. New events needed (include payload shape). Keep in mind Track C replaces transport entirely, so design events to be transport-agnostic.
> 6. **Public lobby list.** Server-side: how does the list get assembled? (Options: iterate `publicRooms` set on demand, or a separate `LobbyRegistry` singleton. For DO migration in Track C, a separate singleton is natural. For current Geckos world, a new event `getPublicLobbies` returning `[{roomCode, hostName, playerCount, maxPlayers, gameMode, state}]` is enough.) Pick one, spec it.
> 7. **Game-mode cycling policy.** When a public room completes, it returns to lobby and cycles `cooperative → competitive → timed → cooperative`. Host can lock a mode (checkbox in lobby UI). Private rooms don't cycle.
> 8. **Out-of-scope for B2:** list everything we're consciously not doing (ready-up UI, chat, spectator mode, friends list, voice).
>
> Under 1500 words total. No code, design only. Save to `docs/multiplayer-ux.md`. Update Section 7 of `AGENT_PLAN.md` to mark Track B1 done.

### Acceptance criteria

- `docs/multiplayer-ux.md` exists, under 1500 words.
- Covers all 8 required subsections.
- Human reviewed and approved (user gate before B2).

### TRACK B2 · Implementation

**Dispatch:** general-purpose agent, 1-2 sessions.
**Blocks:** nothing downstream (C can run in parallel).
**Depends on:** B1 approved by human.

### Goal

Ship the design. Targets current Geckos backend — migration happens in Track C underneath.

### Prompt for the agent

> You are executing Track B2 of `AGENT_PLAN.md`. Read Sections 0-6 of that file first, then read `docs/multiplayer-ux.md` fully — it is the spec you are implementing. Work in `C:/Users/Mattm/X/games-3d/sds`.
>
> Ship in two PRs (or two commits if user prefers):
>
> **PR 1 — server + invite URL plumbing**
>
> - Add `getPublicLobbies` event handler in `server/index.js` returning the list per spec.
> - Add mode cycling in `server/RoomManager.js` / `server/GameSimulation.js`: when a public room completes, reset state to `waiting` and advance `gameMode` per spec. Lock gameMode if `room.modeLocked=true`. Private rooms don't cycle (just clean up after 30s idle).
> - Add host-migration hardening: when `leaveRoom` elects a new host, emit `hostChanged` to all players with the new hostId.
> - Add `joinRoomByInvite(roomCode, playerName, dogType)` client method in `js/NetworkManager.js` that auto-leaves current room first.
> - On page load in `js/main.js`, check `location.hash` for the invite URL pattern from B1's spec. If matched, auto-navigate to the join flow with the code pre-filled. Deep-link happens before the main menu renders.
>
> **PR 2 — UI flow**
>
> - `js/components/Multiplayer/PublicLobbyList.js` (new): fetches `getPublicLobbies` every 3s, renders list with join buttons. Show empty-state "No games open. Start one."
> - `js/components/Multiplayer/Lobby.js` modifications per B1 spec: show "Copy invite link" button that writes `sheepdogsim.com#/r/ABC123` to clipboard; show mode-cycling indicator; host-only "Start Game" button; mode-lock checkbox for host.
> - `js/components/Multiplayer/MultiplayerOptions.js` modifications: add "Public Lobbies" as a top-level option alongside "Create Room", "Join by Code", "Quick Match".
> - `js/components/Multiplayer/QuickMatch.js` (new, or merge into MultiplayerOptions): on click, server picks best public room (non-full, matching preferred mode, most players); if none exists, creates a public one in preferred mode.
> - Remove dead `setReady` UI if it exists — ready state is always `true` per server default; kill the UI entirely.
>
> **Testing:**
> - Two browser windows, one creates room, copies link, second window pastes link → both in lobby within 5s.
> - Quick Match from cold → creates public lobby.
> - Quick Match while public lobby exists → joins it.
> - Host leaves mid-lobby → second player becomes host.
> - Public lobby completes classic → cycles to competitive.
>
> **Do not:**
> - Migrate transport (that's Track C).
> - Refactor components beyond B1's component-delta section.
> - Add chat, ready-up, spectator, voice.
>
> **Report** (under 400 words): PRs, flows tested, flows skipped + why. Update Track B2 in Section 7.

### Acceptance criteria

- Invite URL works in same browser and cross-browser.
- Public lobby list populates within 3s.
- Mode cycling visible after a completed public match.
- Host migration works on disconnect.
- No regressions in solo/sandbox flows.

---

## TRACK C · Backend migration to Cloudflare Workers + Durable Objects

Four sub-tracks. Can run in parallel with D/E/F but must run in sequence internally.

Before starting C1, the human must set up a Cloudflare account (or confirm the existing one), install `wrangler`, and provide API credentials as env vars in `~/.config/mk-agent/env`:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

If these aren't present when an agent starts a C track, stop and ask.

### TRACK C1 · Workers scaffold + D1 schema

**Dispatch:** general-purpose agent, 1 session.
**Estimated effort:** 3-4 hours.

### Prompt for the agent

> You are executing Track C1 of `AGENT_PLAN.md`. Read Sections 0-6 first.
>
> Create `worker/` at repo root. You are scaffolding a Cloudflare Workers project; do not port the simulation yet (that's C2).
>
> **Tasks:**
>
> 1. `cd C:/Users/Mattm/X/games-3d/sds && mkdir worker && cd worker && wrangler init --yes`. Choose TypeScript, Durable Objects yes. Then edit.
>
> 2. Configure `worker/wrangler.toml`:
>    - `name = "sds-worker"`
>    - `main = "src/index.ts"`
>    - `compatibility_date = "2025-04-01"` (or current)
>    - `compatibility_flags = ["nodejs_compat"]`
>    - Two DO bindings: `ROOM_DO` → `RoomDO`, `LOBBY_DO` → `LobbyDO`
>    - One D1 binding: `DB` → database `sds-db`
>    - Secret placeholder: `JWT_SECRET` (document in README that user sets via `wrangler secret put JWT_SECRET`)
>    - Migrations block for DOs (initial `new_sqlite_classes = ["RoomDO", "LobbyDO"]`)
>
> 3. Create `worker/src/index.ts` — the Worker router:
>    - `GET /api/lobbies` → LobbyDO.fetch, returns JSON array
>    - `GET /r/:code/ws` → RoomDO WebSocket upgrade
>    - `POST /api/register` → issue signed token (HMAC-SHA256 of `{persistent_id, exp}` with `JWT_SECRET`, 24h exp). Validate display name server-side: strip HTML, cap at 20 chars.
>    - `POST /api/score` → validate token, insert into D1 `score_submissions`, update materialized best-per-mode.
>    - `GET /api/leaderboard?mode=X&limit=N` → read from D1.
>    - CORS allow `https://sheepdogsim.com` and `http://localhost:3000`.
>
> 4. Create `worker/src/RoomDO.ts` — stub with hibernation-ready WebSocket handling:
>    - Extend `DurableObject`, accept WS via `this.ctx.acceptWebSocket(server)`.
>    - `setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'))` in constructor.
>    - `webSocketMessage` handler that echoes for now (C2 replaces with real sim).
>    - `webSocketClose` handler that notifies LobbyDO if this was a public room.
>    - Storage: `roomCode`, `mode`, `state`, `hostId`, `players: {id, name, dogType}[]`, `modeLocked`.
>    - No simulation running yet.
>
> 5. Create `worker/src/LobbyDO.ts` — registry singleton:
>    - Single DO instance (key: "global").
>    - Storage: `Map<roomCode, {hostName, playerCount, maxPlayers, gameMode, state}>`.
>    - RPC methods (not WebSockets): `upsert(entry)`, `remove(roomCode)`, `list()`.
>    - RoomDOs call these on state change.
>
> 6. Port simulation primitives to TypeScript at `worker/src/shared/`:
>    - `Vector2D.ts` from `shared/Vector2D.js`
>    - `FlockingAlgorithms.ts` from `shared/FlockingAlgorithms.js`
>    - `MovementPhysics.ts` from `shared/MovementPhysics.js`
>    - `BoundaryCollision.ts` from `shared/BoundaryCollision.js`
>    - `GameStateValidation.ts` from `shared/GameStateValidation.js`
>    - Preserve exported function signatures. Don't fix bugs in-port; match behavior.
>    - Add a Vitest config and basic tests for Vector2D + flocking.
>
> 7. D1 schema at `worker/migrations/0001_init.sql`:
>    ```sql
>    CREATE TABLE players (
>      persistent_id TEXT PRIMARY KEY,
>      display_name TEXT NOT NULL,
>      discriminator TEXT NOT NULL,
>      full_name TEXT NOT NULL,
>      created_at INTEGER NOT NULL,
>      last_active INTEGER NOT NULL,
>      solo_classic_best REAL,
>      solo_extreme_best REAL,
>      timed_best INTEGER,
>      competitive_wins INTEGER DEFAULT 0,
>      cooperative_best REAL
>    );
>    CREATE TABLE discriminators (
>      display_name TEXT,
>      discriminator TEXT,
>      PRIMARY KEY (display_name, discriminator)
>    );
>    CREATE TABLE score_submissions (
>      id INTEGER PRIMARY KEY AUTOINCREMENT,
>      persistent_id TEXT NOT NULL,
>      game_mode TEXT NOT NULL,
>      score REAL NOT NULL,
>      submitted_at INTEGER NOT NULL,
>      ip_hash TEXT,
>      room_code TEXT,
>      validated INTEGER DEFAULT 1
>    );
>    CREATE INDEX idx_submissions_player ON score_submissions(persistent_id);
>    CREATE INDEX idx_submissions_mode_score ON score_submissions(game_mode, score);
>    -- Mirror existing leaderboard indexes
>    CREATE INDEX idx_players_display_name ON players(display_name);
>    CREATE INDEX idx_players_solo_classic ON players(solo_classic_best);
>    CREATE INDEX idx_players_solo_extreme ON players(solo_extreme_best);
>    CREATE INDEX idx_players_timed ON players(timed_best);
>    CREATE INDEX idx_players_competitive ON players(competitive_wins);
>    CREATE INDEX idx_players_cooperative ON players(cooperative_best);
>    ```
>
> 8. Write `worker/README.md` documenting:
>    - Local dev: `wrangler dev`
>    - Deploy: `wrangler deploy`
>    - D1 init: `wrangler d1 create sds-db` then `wrangler d1 execute sds-db --file migrations/0001_init.sql`
>    - Secret: `wrangler secret put JWT_SECRET`
>    - Env setup for `CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID`
>
> **Validation:**
> - `cd worker && npm install && npx wrangler types` succeeds.
> - `npx wrangler dev` starts without errors (Ctrl-C immediately; just smoke testing).
> - Vitest passes for shared primitive ports.
>
> **Do not:**
> - Touch the existing droplet or `server/` dir.
> - Deploy the worker yet (scaffold only).
> - Port `GameSimulation.js` — that's C2.
>
> **Report** (under 350 words): folder structure, verification steps, anything that failed. Update Track C1 in Section 7.

### Acceptance criteria

- `worker/` scaffolded with Wrangler config, RoomDO + LobbyDO stubs, TS primitive ports with passing tests, D1 migration SQL.
- `wrangler dev` starts locally without errors.
- Not deployed to production yet.

### TRACK C2 · Simulation port to RoomDO

**Dispatch:** general-purpose agent, 1-2 sessions.
**Depends on:** C1.

### Prompt for the agent

> You are executing Track C2 of `AGENT_PLAN.md`. Read Sections 0-6 first. C1 must be complete; verify `worker/` exists.
>
> **Goal:** port `server/GameSimulation.js` + `server/RoomManager.js` logic into `worker/src/RoomDO.ts`. Drop tick rate to 20Hz. Add delta encoding + MessagePack. Fix known bugs during port.
>
> **Tasks:**
>
> 1. Install deps in `worker/`: `@msgpack/msgpack`.
>
> 2. In `worker/src/RoomDO.ts`, implement the full room lifecycle as methods:
>    - `onPlayerJoin(ws, playerInfo)`
>    - `onPlayerLeave(ws)`
>    - `startGame()` — host-only, initializes simulation state, begins tick loop
>    - `tick()` — at 20Hz (every 50ms) via `setAlarm` or setInterval-in-DO pattern (use the standard DO alarm pattern for reliable scheduling)
>    - `onPlayerInput(ws, input)` — accept with `clientPosition` validation (5-unit max delta; reject silently otherwise)
>    - `onGameComplete()` — submit scores to D1 via Worker binding, broadcast completion, reset to lobby, apply mode cycling per Track B spec
>
> 3. Simulation port:
>    - Mirror `server/GameSimulation.js` logic but use the `worker/src/shared/` TS primitives.
>    - Authoritative state: sheep array, sheepdogs map, gates, pastures, scores.
>    - Track previous tick's broadcast state per-player; diff before broadcasting (only send sheep whose position moved >0.1u OR state changed since last sent).
>    - Dogs: always send full state (few of them, cheap).
>    - Encode payloads with MessagePack. Send as ArrayBuffer via WebSocket.
>
> 4. Message shapes (TypeScript interfaces in `worker/src/protocol.ts`):
>    - Client→Server: `{t: 'input', seq, dir: {x,z}, sprint, clientPos?}`, `{t: 'ready'}`, `{t: 'start'}`, `{t: 'leave'}`, `{t: 'modeLock', locked}`, `{t: 'setDog', dogType}`
>    - Server→Client: `{t: 'state', tick, sheepDeltas, dogs, scores?, time?}`, `{t: 'lobby', ...state}`, `{t: 'start'}`, `{t: 'complete', winner, scores}`, `{t: 'hostChanged', newHost}`, `{t: 'error', msg}`
>    - Version the protocol: include `v: 1` at top level.
>
> 5. Bug fixes during port (do NOT copy these bugs):
>    - Guard `clientPosition` with 5-unit max delta (from Track A, re-apply here).
>    - Score bounds validation on submission (from Track A).
>    - `handlePlayerDisconnect` idempotent — DO side, ensure `onPlayerLeave` is safe to call twice.
>
> 6. LobbyDO integration:
>    - When RoomDO state changes between `waiting`/`in-game`/`finished`, call LobbyDO.upsert if public.
>    - On last-player-leave, call LobbyDO.remove and `this.ctx.storage.deleteAll()`.
>
> 7. Unit tests at `worker/src/__tests__/room.test.ts`:
>    - 2 players join, start, 100 ticks, assert sheep positions evolve.
>    - Input validation rejects out-of-bounds clientPosition.
>    - Mode cycling advances cooperative → competitive on completion.
>    - Host migration on host disconnect.
>
> 8. Document the protocol at `worker/docs/protocol.md` (message table with t values + payload fields + direction).
>
> **Do not:**
> - Connect client yet (that's C3).
> - Deploy to prod yet (that's C4).
>
> **Report** (under 500 words): which server/GameSimulation.js behaviors shipped, which were intentionally changed (list every diff vs original), what tests cover. Update Track C2 in Section 7.

### Acceptance criteria

- `worker/` passes full test suite.
- `wrangler dev` + a hand-run WebSocket client (or Vitest integration test) can: create room, join, start, exchange 100 ticks, complete.
- Protocol documented.

### TRACK C3 · Client swap to native WebSocket

**Dispatch:** general-purpose agent, 1 session.
**Depends on:** C2.

### Prompt for the agent

> You are executing Track C3 of `AGENT_PLAN.md`. Read Sections 0-6 first.
>
> **Goal:** replace Geckos client with native WebSocket + MessagePack. Keep `js/NetworkManager.js` public API stable — callers should not need changes.
>
> **Tasks:**
>
> 1. Install `@msgpack/msgpack` in root `package.json`.
>
> 2. In `js/NetworkManager.js`, behind feature flag `import.meta.env.VITE_USE_DO_BACKEND === 'true'`, add a new code path:
>    - `connect()` opens WebSocket to `wss://sheepdogsim.com/r/${roomCode}/ws` (for room) or `wss://sheepdogsim.com/api/bootstrap/ws` (for pre-room leaderboard — or just use `fetch` for leaderboard and skip the WebSocket there).
>    - Pre-room flows (register, submit score, get leaderboard) via `fetch` to `/api/*` endpoints.
>    - Room flow via the `/r/:code/ws` connection.
>    - MessagePack encode outgoing, decode incoming.
>    - Map incoming message types back to the existing `notifyRoomUpdate`, `notifyGameStateUpdate`, `notifyPlayerUpdate`, `notifyError` callbacks.
>    - Reconnect with exponential backoff (copy from existing code). Store last `roomCode` + `playerName` + `dogType` for rejoin.
>    - Ping via `auto-response` on server side — client just sends `'ping'` string and ignores the reply (DO auto-responds without waking). Periodically measure RTT via a separate `{t: 'ping', id}` round-trip.
>
> 3. When `VITE_USE_DO_BACKEND` is falsy (default), preserve existing Geckos code path. Both must work via the same public API.
>
> 4. In client-side code that expects the old `{sheep: [{position: {x,z}}], dogs: {...}}` shape: unify on the new protocol in `worker/src/protocol.ts`. Where old shape is expected (e.g., `js/main.js` multiplayer update path), adapter-translate at the network boundary.
>
> 5. Remove `@geckos.io/client` from `package.json` — NOT YET, wait for Track G. For this track, both paths coexist behind the flag.
>
> 6. Test plan:
>    - Set `VITE_USE_DO_BACKEND=true` in a `.env.local`.
>    - Run `wrangler dev` in `worker/` to serve backend locally on a known port (say 8787).
>    - In this track, hardcode `wss://localhost:8787` when `isLocalDevelopment` is true.
>    - Run `npm run dev` in root, open two windows, create + join room, start a game, confirm positions sync.
>
> 7. Document the feature flag in `README.md`.
>
> **Do not:**
> - Delete Geckos code yet (Track G).
> - Deploy anything to production.
> - Change `VITE_USE_DO_BACKEND` default to true yet (C4 does that after production worker deploy).
>
> **Report** (under 400 words): what paths unified, what adapted, local test results. Update Track C3 in Section 7.

### Acceptance criteria

- Both transport paths coexist behind the flag.
- Local end-to-end test with `VITE_USE_DO_BACKEND=true` passes.
- `npm run build` succeeds in both flag states.

### TRACK C4 · Production cutover + data migration

**Dispatch:** general-purpose agent, 1 session. Requires human confirmation at two gate points.
**Depends on:** C3.

### Prompt for the agent

> You are executing Track C4 of `AGENT_PLAN.md`. Read Sections 0-6 first. This is a production cutover; pause for human confirmation at each gate.
>
> **Gate 1 — Pre-deploy checklist.** Before proceeding, confirm with the human that:
> - C1, C2, C3 are all marked done in Section 7.
> - `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are in env.
> - The droplet is expected to stay online for 30 days post-cutover as rollback.
> - `wrangler dev` end-to-end test has passed.
>
> **Tasks (once Gate 1 passes):**
>
> 1. Deploy Worker + DOs:
>    - `cd worker && wrangler deploy`
>    - Bind Worker to route `sheepdogsim.com/api/*`, `sheepdogsim.com/r/*/ws`. Use Cloudflare dashboard or `routes` in `wrangler.toml`.
>    - `wrangler secret put JWT_SECRET` with a securely generated 64-char hex string.
>
> 2. Initialize D1:
>    - `wrangler d1 create sds-db`
>    - `wrangler d1 execute sds-db --file worker/migrations/0001_init.sql --remote`
>
> 3. Data migration from droplet SQLite:
>    - `ssh sds "sqlite3 /opt/sds-server/leaderboard.db '.dump'" > /tmp/sds-dump.sql`
>    - Clean the dump: remove SQLite-specific pragmas that D1 rejects; convert any `AUTOINCREMENT` syntax if needed; keep only the `players` and `discriminators` tables (no `score_submissions` to migrate — didn't exist before).
>    - `wrangler d1 execute sds-db --file /tmp/sds-dump-clean.sql --remote`
>    - Verify: `wrangler d1 execute sds-db --command "SELECT COUNT(*) FROM players" --remote` should return 207 (or current live count).
>
> **Gate 2 — Smoke test.** Before flipping flag, manually verify via `curl`:
> - `curl https://sheepdogsim.com/api/lobbies` returns `[]` (empty but 200).
> - `curl -X POST https://sheepdogsim.com/api/register -H 'Content-Type: application/json' -d '{"persistentId":"test","displayName":"test","nameType":"custom"}'` returns a token.
> - `curl 'https://sheepdogsim.com/api/leaderboard?mode=soloClassic&limit=10'` returns real player data.
> - If all three work, proceed to client cutover. If not, stop and report.
>
> **Tasks (once Gate 2 passes):**
>
> 4. Flip the default:
>    - In `js/NetworkManager.js` or `.env`, change default to `VITE_USE_DO_BACKEND=true`.
>    - `npm run build`, commit, deploy (current frontend deploy flow — git push to main, GitHub Pages picks up).
>
> 5. Monitor for 1 hour:
>    - Open production site in two windows, complete a full multiplayer game.
>    - Check Cloudflare Workers dashboard for error rate, CPU time per request, DO duration.
>    - Check D1 for new score submissions.
>    - If error rate > 1% of requests, roll back by flipping `VITE_USE_DO_BACKEND=false` and redeploying frontend. Report the failure mode.
>
> 6. Document cutover:
>    - Update `DECISIONS.md` with cutover date and initial observations.
>    - Update `README.md` to point deploy docs at Workers, not droplet.
>
> **Do not:**
> - Destroy the droplet (Track G).
> - Delete Geckos code (Track G).
> - Modify the droplet's running server — leave it as-is as fallback.
>
> **Report** (under 500 words): deploy outcome, gate results, monitoring observations, any rollback triggered. Update Track C4 in Section 7.

### Acceptance criteria

- Production Worker serves `sheepdogsim.com/api/*` and `/r/*/ws` routes.
- D1 has all 207 player records intact.
- New frontend build uses Worker backend by default.
- Droplet still running, untouched.
- No error spike in first hour.

---

## TRACK D · Sandbox polish

Three sub-tracks. D1 diagnoses, D2 ships share URLs, D3 fixes punch-list items.

### TRACK D1 · Sandbox diagnosis

**Dispatch:** Explore subagent, single session.
**Estimated effort:** 45 minutes.

### Prompt for the agent

> You are executing Track D1 of `AGENT_PLAN.md`. Read Sections 0-6 first.
>
> Read in full:
> - `js/SandboxConfig.js`
> - `js/FenceCollisionSystem.js`
> - `js/FencePresets.js`
> - `js/FieldConfig.js`
> - `js/components/StartScreen/SandboxSetup.js`
> - `js/components/StartScreen/ShapeEditor.js`
> - `js/components/StartScreen/FenceEditor.js`
> - `js/GameState.js` (particularly `startSandboxGame` and polygon handling)
>
> Then play the sandbox mentally: create a polygon field, drop fences, set sheep count, pick win condition, start.
>
> Produce a punch list at `docs/sandbox-punchlist.md` with:
> 1. **Bugs** — what's broken. file:line where possible. One line per bug.
> 2. **UX pain** — what's awkward but technically works. Examples: polygon editor snapping is weird, fence placement has no undo, etc.
> 3. **Gaps** — missing features that users would reasonably expect. Examples: no preset library, no named saves.
> 4. **Polish wins** — small visual/sound/feedback improvements.
> 5. **Prioritization** — flag top 5 items that would most impact perceived quality.
>
> Under 600 words. Save to `docs/sandbox-punchlist.md`. Do NOT fix anything. Update Track D1 in Section 7.

### Acceptance criteria

- `docs/sandbox-punchlist.md` exists with all 5 sections.
- Top 5 prioritized items called out.

### TRACK D2 · Sandbox share URLs

**Dispatch:** general-purpose agent, 1 session.
**Independent of D1.**

### Prompt for the agent

> You are executing Track D2 of `AGENT_PLAN.md`. Read Sections 0-6 first.
>
> **Goal:** let users copy a URL that loads their exact sandbox config in someone else's browser.
>
> **Tasks:**
>
> 1. `npm install lz-string` (it's tiny, ~3KB).
>
> 2. In `js/SandboxConfig.js`, add two methods:
>    - `serialize()` — returns a compact JSON representation of everything needed to reconstruct: fieldShape, borderPoints, bounds, gate, pasture, sheepCount, params, customFences, rules, useExtremeBoids. Then `LZString.compressToEncodedURIComponent(json)`.
>    - `static deserialize(encoded)` — inverse. Returns a `SandboxConfig` instance. Handle malformed input with a sensible fallback + user-visible error.
>
> 3. In `js/components/StartScreen/SandboxSetup.js`, add a "Copy share link" button below the config panel. On click:
>    - Serialize current config.
>    - URL: `https://sheepdogsim.com/#s/${encoded}`.
>    - `navigator.clipboard.writeText(url)`.
>    - Show a toast "Link copied" for 2s.
>    - If the URL exceeds 1800 chars (IE/old browser safety), show a warning toast "Config too large to share via URL" and fall back to `console.log` for now — future cycle can add a POST endpoint.
>
> 4. In `js/main.js` at the top of initialization (before any UI), check `location.hash`:
>    - If it starts with `#s/`, decode with `SandboxConfig.deserialize`, navigate the UI flow to `SandboxSetup` with the config pre-loaded.
>    - If deserialize fails, show an error toast and fall through to normal start screen.
>    - After successful deserialize, `history.replaceState(null, '', location.pathname)` to clean the URL.
>
> 5. Test matrix:
>    - Build a rectangular sandbox, share, open in new incognito window → same config loads.
>    - Build a polygon sandbox with 6 custom fences, share, verify.
>    - Feed a malformed hash manually, verify graceful failure.
>    - Verify URL length stays <1800 chars for a reasonable config.
>
> **Do not:**
> - Add sandbox preset library (that could be Track D3).
> - Store configs server-side (future cycle).
>
> **Report** (under 250 words): features, URL length for typical config, test outcomes. Update Track D2 in Section 7.

### Acceptance criteria

- Share URL round-trips config correctly.
- Malformed hash fails gracefully.
- Typical config URL under 1800 chars.

### TRACK D3 · Sandbox punch-list fixes

**Dispatch:** general-purpose agent, 1 session.
**Depends on:** D1.

### Prompt for the agent

> You are executing Track D3 of `AGENT_PLAN.md`. Read Sections 0-6 first, then read `docs/sandbox-punchlist.md` from Track D1.
>
> Fix only the top-5 prioritized items from the punch list. Stop when those five are done. Do not drift into lower-priority items this cycle.
>
> For each fix:
> - Reference the punch-list item # in your commit message.
> - Add a 1-line comment in the code only if the fix reason is non-obvious.
> - Test manually.
>
> **Do not:**
> - Refactor sandbox components beyond what a fix requires.
> - Add new features not listed in the top 5.
>
> **Report** (under 300 words): which 5 items shipped, what you deliberately skipped + why. Update Track D3 in Section 7.

### Acceptance criteria

- Top 5 punch-list items resolved.
- Sandbox still fully functional.
- No regression in non-sandbox modes.

---

## TRACK E · Local 2-player rewrite

Two sub-tracks: investigate then execute.

### TRACK E1 · Investigation

**Dispatch:** Explore subagent, 1 session.
**Estimated effort:** 45 minutes.

### Prompt for the agent

> You are executing Track E1 of `AGENT_PLAN.md`. Read Sections 0-6 first.
>
> Read in full:
> - `js/LocalInputHandler.js`
> - `js/LocalMultiplayerManager.js`
> - `js/TwoPlayerCamera.js`
> - `js/components/StartScreen/LocalModeSetup.js`
> - The 2P local branch in `js/main.js` (search for `isLocalMultiplayer`, `startLocalGame`, `sheepdog2`)
> - `js/Sheepdog.js` (to understand dog instances)
> - `js/GameState.js` (relevant setSheepdog2 and pause handling)
>
> Manually trace: user selects 2P local → `startLocalGame(localConfig)` → input handler init → game tick → camera update → completion.
>
> Produce `docs/2p-local-report.md` with:
> 1. **Current architecture** — ASCII diagram, under 150 words of prose.
> 2. **What's broken** — specific bugs. file:line.
> 3. **What's awkward** — friction points that technically work.
> 4. **Keyboard conflict map** — does P2's keys (likely Arrow keys) collide with camera controls or anything else?
> 5. **Recommendation** — (A) targeted patches with a list of the 3-5 minimum changes, or (B) clean-slate rewrite with estimated scope and a minimal architecture sketch. Pick one, defend with 1 paragraph.
> 6. **Proposed P1/P2 defaults** — which keys, which dog breeds default, shared vs split camera.
> 7. **Out of scope for E2** — things noticed but deferred.
>
> Under 700 words. Do NOT fix anything. Update Track E1 in Section 7.

### Acceptance criteria

- `docs/2p-local-report.md` exists with all 7 sections.
- Clear recommendation A or B with rationale.

### TRACK E2 · Execution

**Dispatch:** general-purpose agent, 1 session.
**Depends on:** E1 approved by human.

### Prompt for the agent

> You are executing Track E2 of `AGENT_PLAN.md`. Read Sections 0-6, then read `docs/2p-local-report.md` fully.
>
> Execute the recommended path (A patches or B rewrite) from E1.
>
> If path A: ship the 3-5 minimum changes listed. No scope creep.
>
> If path B: rewrite per the minimal architecture sketch. Guidelines for a rewrite:
> - Prefer a single new file `js/Local2P.js` that wraps the single-player update loop rather than forking `main.js`.
> - Reuse existing `Sheepdog` instances; just instantiate two.
> - Shared camera that tracks both players (frame both; fall back to midpoint when apart).
> - P1 = WASD + Space (sprint), P2 = Arrow keys + RShift (sprint).
> - P1 = selected dog from menu, P2 = next dog breed from list (auto-pick).
> - Pause via Escape; affects both.
>
> Common to both paths:
> - Test matrix: both players can move simultaneously; sprint works for both; pause freezes both; completion screen shows both contributions; restart works.
> - Do NOT break single-player or multiplayer flows. Run a solo classic game to completion after your changes.
>
> **Do not:**
> - Add split-screen rendering (complex; deferred).
> - Add local-network 2P (that's multiplayer).
> - Add gamepad support for P2 (future cycle).
>
> **Report** (under 350 words): path chosen, changes, test results, solo/multiplayer smoke test confirmations. Update Track E2 in Section 7.

### Acceptance criteria

- Two humans can complete a classic game on one keyboard.
- No crashes, no stuck input states.
- Solo and online multiplayer still work.

---

## TRACK F · Cloudflare Pages + CI

**Dispatch:** general-purpose agent, 1 session.
**Estimated effort:** 2 hours.
**Depends on:** Track A complete. Can run before, during, or after C — but simpler if C is done first.

### Prompt for the agent

> You are executing Track F of `AGENT_PLAN.md`. Read Sections 0-6 first.
>
> **Goal:** retire GitHub Pages. Deploy frontend via CF Pages with GitHub Actions CI. Same custom domain, same content, different hoster.
>
> Before starting, confirm `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are in env.
>
> **Tasks:**
>
> 1. Create CF Pages project:
>    - Manually via dashboard or via `wrangler pages project create sds-frontend`.
>    - Set production branch to `main`, build command `npm run build`, output dir `dist`.
>    - Don't hook Pages directly to GitHub; we'll deploy via Actions to control build steps.
>
> 2. GitHub Actions workflow at `.github/workflows/deploy.yml`:
>    ```yaml
>    name: Deploy to CF Pages
>    on:
>      push:
>        branches: [main]
>    jobs:
>      deploy:
>        runs-on: ubuntu-latest
>        steps:
>          - uses: actions/checkout@v4
>          - uses: actions/setup-node@v4
>            with: { node-version: 22 }
>          - run: npm ci
>          - run: npm run build
>          - uses: cloudflare/pages-action@v1
>            with:
>              apiToken: ${{ secrets.CF_API_TOKEN }}
>              accountId: ${{ secrets.CF_ACCOUNT_ID }}
>              projectName: sds-frontend
>              directory: dist
>              gitHubToken: ${{ secrets.GITHUB_TOKEN }}
>    ```
>
> 3. itch.io build workflow at `.github/workflows/build-itchio.yml`:
>    - On manual `workflow_dispatch` + on tag push.
>    - `BUILD_TARGET=itchio npm run build`.
>    - Zip `dist/` and upload as a GitHub release asset named `sds-itchio-${tag}.zip`.
>    - User uploads to itch.io manually from the release page.
>
> 4. Domain migration:
>    - In CF dashboard, add `sheepdogsim.com` as custom domain on the Pages project.
>    - Remove the GitHub Pages CNAME pointing to `matthew-kissinger.github.io` — but do this AFTER verifying CF Pages is live.
>    - Delete `/CNAME` file from repo root.
>    - Update the DNS record in CF: `sheepdogsim.com` → CNAME to the Pages project (CF handles this automatically when you add custom domain; verify).
>
> 5. Tests:
>    - Push a trivial change, watch CI deploy, verify live site serves new build within 3 minutes.
>    - Open PR from a branch, verify preview deploy URL is commented on the PR.
>    - Run the itchio workflow manually, verify zip artifact exists.
>
> 6. Update docs:
>    - `README.md`: replace GH Pages deploy docs with CF Pages + Actions.
>    - Archive `seo-changelog.md` note about the migration.
>
> 7. Safety: leave GH Pages config branch/settings in place for 14 days. Document revert procedure in `DECISIONS.md`.
>
> **Do not:**
> - Touch the Worker/DO from Track C.
> - Destroy the droplet (Track G).
>
> **Report** (under 300 words): deploy URL, preview URL on a test PR, itchio artifact location, any issues. Update Track F in Section 7.

### Acceptance criteria

- Push to main → CF Pages serves new build within 3 min.
- PR preview deploys show up as PR comments.
- itchio workflow produces a working zip.
- `sheepdogsim.com` still resolves and serves the correct build.

---

## TRACK G · Post-migration cleanup

**Dispatch:** general-purpose agent, 1 session.
**Depends on:** Track C4 stable for at least 7 days in production.
**Needs:** human confirmation on droplet destroy.

### Prompt for the agent

> You are executing Track G of `AGENT_PLAN.md`. Read Sections 0-6 first.
>
> **Goal:** remove all residue of the old backend. Droplet, Geckos, old scripts.
>
> **Gate — Preconditions.** Do not proceed unless:
> - Track C4 marked done more than 7 days ago.
> - No rollback occurred since C4.
> - User explicitly confirms they're OK destroying the droplet (they can rebuild from `DROPLET_DEPLOYMENT.md` if ever needed, but that will become out-of-date fast).
>
> **Tasks:**
>
> 1. Delete `server/` directory entirely. Commit as "remove droplet server — migrated to CF Workers".
>
> 2. Remove from root `package.json`:
>    - Scripts: `server`, `server:dev`, `dev:full`, `dev:lan:full`, `server:status`, `server:logs`, `server:logs:live`, `server:deploy`, `server:ssh`.
>    - Dep: `@geckos.io/client`.
>    - Dep: `concurrently` (was only used for `dev:full`).
>
> 3. Remove from `js/NetworkManager.js`:
>    - Any Geckos import.
>    - Any code path behind `VITE_USE_DO_BACKEND=false`.
>    - Delete the feature flag entirely — DO backend is the only path.
>
> 4. Remove unused files:
>    - `upload-to-droplet.ps1`
>    - `start-multiplayer-servers.ps1`, `start-multiplayer-servers-react.ps1`, `start-game-server.ps1`, `start-local-network-test.ps1`, `start-client-server.ps1`
>    - `debug-client.html`, `debug-canvas.js`
>    - `DROPLET_DEPLOYMENT.md` — move to `docs/archive/DROPLET_DEPLOYMENT.md` for reference.
>
> 5. Clean up `index.html`:
>    - Remove `<link rel="dns-prefetch" href="https://api.sheepdogsim.com">` at line ~258.
>
> 6. Cloudflare DNS:
>    - Via CF dashboard or `wrangler`: remove `api.sheepdogsim.com` A record.
>    - Confirm `sheepdogsim.com` CNAME points at CF Pages (Track F).
>
> 7. Destroy droplet (ASK USER FIRST):
>    - `doctl compute droplet delete <droplet-id>` via DO CLI, or via DO dashboard.
>    - Verify droplet is gone.
>    - Remove `sds` SSH alias from user's `~/.ssh/config` if present.
>
> 8. Update docs:
>    - `README.md`: remove any server/droplet references.
>    - `DECISIONS.md`: append "Track G complete — droplet destroyed <date>, cycle closed".
>    - `ARCHITECTURE.md`: rewrite to reflect Workers+DO+D1+Pages.
>
> **Do not:**
> - Refactor anything not on this list.
> - Start a new cycle's work.
>
> **Report** (under 300 words): files deleted, DNS changes, droplet status, total project diff summary. Update Track G in Section 7 and close the cycle.

### Acceptance criteria

- No references to `api.sheepdogsim.com`, droplet IP, or Geckos in the codebase.
- `npm install && npm run build` clean in root (no more server subdir).
- Droplet destroyed.
- Documentation reflects final architecture.

---

## 8 · End-of-cycle debrief (after Track G)

After all tracks complete, run one final session:

> Read `AGENT_PLAN.md` Section 7 in full. For each completed track, produce a one-paragraph retrospective note covering: what shipped, what took longer than expected, what surprised you. Append to `docs/cycle-retrospective-<YYYY-MM-DD>.md`. Then update top of `AGENT_PLAN.md` with a note that this cycle is closed and link to the retrospective. Suggest 3 candidate tracks for the next cycle based on what you observed — but do not plan them; the human will lead next cycle's planning.

---

## 9 · Glossary for agents unfamiliar with this codebase

- **Boid** — an individual sheep or other flocking agent. From Craig Reynolds' flocking algorithm.
- **Gate** — the opening in the fence where sheep get "retired" (counted).
- **Pasture** — the area beyond the gate where retired sheep graze.
- **Retirement** — a sheep has passed through the gate and is no longer actively herded.
- **Grazing state** — state=2. Retired sheep chilling in the pasture. Client-side visual only.
- **Chaos mode** — 5000 sheep, hardest to cull, uses ExtremeBoidSystem.
- **Competitive mode** — 2-4 players, each owns a gate, race to 101 sheep (2P) or highest when all 200 retired (3-4P).
- **Timed mode** — 3-minute clock, sheep respawn 5s after retirement, highest count wins.
- **Cooperative mode** — multiplayer version of classic, all players share the one gate.
- **Sandbox** — free-form mode with user-configured field shape, fences, sheep count, win conditions.
- **DO** — Durable Object. Cloudflare's stateful actor primitive. One DO instance per roomCode.
- **D1** — Cloudflare's SQLite-compatible serverless database.
- **Persistent ID** — client-generated UUID stored in localStorage. Ties a player to their leaderboard entry across sessions.
- **Discriminator** — a 4-digit suffix on display names so two "Swift" players can coexist as Swift#0001 and Swift#0002.

---

*End of cycle plan. Next action: human dispatches an agent to execute Track A.*
