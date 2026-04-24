# Next Session — Cycle 3 Entry Point

> Written 2026-04-24 after Cycle 2 shipped. If you are a cold-start agent, read this page, then [`docs/cycle-3-plan.md`](docs/cycle-3-plan.md), then the track doc for whatever the user asks you to work on.

## Running locally

First time on a fresh clone:

```
npm install
cp worker/.dev.vars.example worker/.dev.vars   # sets JWT_SECRET for local
npm run dev:setup                              # applies D1 migrations to local sqlite
```

Every session after that:

```
npm run dev    # starts Vite (:3000) + wrangler (:8787) together
```

Granular alternatives: `npm run dev:client` (just Vite), `npm run dev:worker` (just wrangler), `npm run dev:lan` (Vite with `--host` + wrangler).

Open `http://localhost:3000` (or `:3001` if :3000 is taken — Vite auto-increments). Invite links built from the lobby now use `location.origin`, so host and join can both be on localhost without collision with production.

## Where the project stands

- `sheepdogsim.com` is live on Cloudflare Pages + Worker + DO + D1 (see [`docs/cycle-2-report.md`](docs/cycle-2-report.md)).
- Gameplay loop (solo, sandbox, local 2P, online 2-4P, three modes) is stable. Playtest completed 2026-04-24.
- Droplet still online as rollback safety; scheduled destroy ~2026-05-01 (see [`docs/cycle-2-todo.md`](docs/cycle-2-todo.md)).
- **Cycle 3 Track 1 is substantially done (2026-04-24).** Legacy cleanup, rename to `MenuController` / `MultiplayerState`, polling→events HUD, i18n trim, design-token retirement, and local-dev DX all landed. Solo + MP playtested through local dev. Remaining Track 1 items are polish, not blockers. Detail: [`docs/cycle-3-plan.md`](docs/cycle-3-plan.md) § Progress log.
- **Game identity: mode-shaped.** Classic = zen register, Timed/Racing = arcade, Sandbox = playground. Menu shell stays tonally neutral. Detail: [`docs/cycle-3-ui-ux.md`](docs/cycle-3-ui-ux.md) § Vision.

## What Cycle 3 is about

Cycle 2 got the *platform* right. Cycle 3 gets the *shell* right so the roadmap in [`docs/cycle-2-todo.md`](docs/cycle-2-todo.md) § "Roadmap beyond Cycle 2" (biomes, weather, NPCs, mod scenes, seasons) ships in days, not weeks. It's three tracks:

1. **Cleanup** — delete what's dead, consolidate what's duplicated, replace polling with events. [`docs/cycle-3-cleanup.md`](docs/cycle-3-cleanup.md)
2. **UI/UX vision pass** — commit to a game identity, restructure the menu around scenes (not modes), add onboarding + a locator, demote settings/leaderboard. [`docs/cycle-3-ui-ux.md`](docs/cycle-3-ui-ux.md)
3. **Scene/biome architecture** — make adding a new biome a data change, not a code fork. [`docs/cycle-3-scene-arch.md`](docs/cycle-3-scene-arch.md)

## What to pick up next

Tracks 2 and 3 can start in parallel. Neither blocks the other; they converge on "Rolling Hills ships as a scene-definition file with its own picker tile."

- **Track 2** — scene-first menu shell, mode-shaped HUD, onboarding, locator, real dog thumbnails. [`docs/cycle-3-ui-ux.md`](docs/cycle-3-ui-ux.md).
- **Track 3** — `shared/scenes/` schema, `BiomeBuilder` refactor, Rolling Hills biome. [`docs/cycle-3-scene-arch.md`](docs/cycle-3-scene-arch.md).

If the next session is short or interstitial, pick off a Track 1 polish item instead: dead-DOM audit in `index.html`, `GameBridge` accessor consolidation, or the JSX flip. See [`docs/cycle-3-cleanup.md`](docs/cycle-3-cleanup.md) § Remaining.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| What shipped this cycle | [`docs/cycle-2-report.md`](docs/cycle-2-report.md) |
| What's still on the Cycle 2 punch list | [`docs/cycle-2-todo.md`](docs/cycle-2-todo.md) |
| Architecture (as of 2026-04-24) | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Prior postmortem | [`docs/archive/POSTMORTEM.md`](docs/archive/POSTMORTEM.md) |
| Pre-Cycle-2 planning (mostly historical) | [`docs/archive/`](docs/archive/) |

## What NOT to do

- Don't rearchitect multiplayer. It works. The Worker + DO + D1 + `shared/` shape is settled.
- Don't introduce a new ECS library, game engine, physics engine, or UI framework this cycle. Keep the bet small: cleanup + shell + scene definitions.
- Don't write speculative abstractions for features that aren't in the roadmap (no predator-AI hooks "for later", no weather hooks "for later" — build them when the content track arrives).
- Don't blow up `main.js` in one PR. Shrink it one responsibility at a time.
- Don't commit files you can't test. The cleanup track includes real file deletions; each deletion must be verified against `grep` and a clean `npm run build`.
