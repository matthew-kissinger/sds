# AGENTS.md

> Portable agent context for `sds` (Sheep Dog Simulator). Cross-tool: Claude Code, Codex, Cursor, Aider, Jules, Windsurf, etc. Claude Code overlay lives in [`CLAUDE.md`](CLAUDE.md). Humans should read [`README.md`](README.md) instead.

## Project summary

Production 3D web game shipped at [sheepdogsim.com](https://sheepdogsim.com). Three.js + React 19 (createElement, no JSX) + Vite 7 + Tailwind 4 client. Cloudflare Worker + Durable Objects + D1 backend. Shared deterministic boid + obstacle modules in [`shared/`](shared/) imported byte-identically by both runtimes. Vitest 4 (250+ specs) + Playwright e2e + sim-baseline goldens. MIT-licensed.

## Quick commands

```bash
npm install                # client deps
cd worker && npm install   # worker deps (one-time after clone)

npm run dev                # Vite (:3000) + wrangler (:8787) together
npm run dev:client         # Vite only (no multiplayer)
npm run dev:worker         # wrangler only
npm run dev:lan            # vite --host + wrangler (LAN, mobile testing)

npm test                   # vitest, ~1.5s full run
npm run test:integration   # WebSocket two-client harness
npm run test:e2e           # Playwright browser smoke

npm run build              # production output to dist/
BUILD_TARGET=itchio npm run build   # itch.io variant
```

## Code style + conventions

- **Vanilla JS, no JSX.** React UI uses `React.createElement`. Don't introduce JSX, codegen, or build-step transforms beyond Vite's defaults.
- **No new abstractions, no premature flexibility.** Three similar lines is better than a premature abstraction. If a feature ships unused, delete it.
- **No emojis in code or commit messages.** Hyphens over em dashes.
- **No comments unless the WHY is non-obvious.** Don't explain WHAT — well-named identifiers do that. Don't reference current task or callers; that belongs in the PR description.
- **No fallbacks or validation for impossible scenarios.** Trust internal code and framework guarantees. Validate only at system boundaries (user input, external APIs).
- **No backwards-compatibility shims for unshipped code.** When changing a contract, change all consumers in the same change. Don't leave `// removed` comments.

## Critical contracts

### The `shared/` deterministic boundary

[`shared/`](shared/) modules are imported byte-identically by:

- The browser client (single-player + prediction).
- The Cloudflare Worker (authoritative multiplayer sim).

**Hard rules:**

- **Never** import `three`, `window`, the DOM, or any module under `js/` from `shared/**`. Any divergence (a rounding change, a default-param tweak, a different iteration order) breaks multiplayer mid-game in ways that surface only after seconds of state drift.
- **Never** modify a `shared/` module without regenerating sim-baseline goldens *and* recording explicit acceptance in the active cycle plan.

Files under fence (write-locked without explicit cycle-plan authorization):
- [`shared/MovementPhysics.js`](shared/MovementPhysics.js)
- [`shared/BoundaryCollision.js`](shared/BoundaryCollision.js)
- [`shared/FlockingAlgorithms.js`](shared/FlockingAlgorithms.js)
- [`shared/GameStateValidation.js`](shared/GameStateValidation.js)
- [`shared/Vector2D.js`](shared/Vector2D.js)
- [`shared/scenes/types.js`](shared/scenes/types.js)
- [`shared/terrain/Heightfield.js`](shared/terrain/Heightfield.js)

### Sim-baseline goldens

[`tests/sim-baseline/*.json`](tests/sim-baseline/) are captured 60 Hz traces from the deterministic sim. Regenerating them without understanding the diff loses regression information.

- On baseline failure: read the diff. Decide whether the new behaviour is intentional. If yes, regenerate with the decision recorded in the cycle plan's Acceptance section. If no, fix the sim change.
- **Do not regenerate as a shortcut to make tests pass.**

### Migrations

[`worker/migrations/*.sql`](worker/migrations/) is append-only. New migration = new file with the next sequence number (`0003_*.sql`, `0004_*.sql`). **Never edit** an existing migration once applied to remote D1 — the history is the contract.

## Repo layout

```
js/                client (vanilla JS + React.createElement)
  components/      React UI
  boot/            module init (forthcoming, Cycle 28)
  world/           terrain, scatterers (forthcoming, Cycle 28)
  atmosphere/      Hosek-Wilkie sky
  effects/         portal, corral zap
  utils/           helpers, dailySeed, ReplayRecorder, telemetry
worker/            Cloudflare Worker
  src/             RoomDO, LobbyDO, GameSim, d1, jwt, index
  migrations/      D1 migrations (append-only)
shared/            deterministic sim, imported by both runtimes
  scenes/          scene-as-data registry
  terrain/         heightfield runtime module
tests/             vitest specs + sim-baseline goldens
  sim-baseline/    captured 60 Hz traces (do not regenerate casually)
  e2e/             Playwright smoke
  integration/     WebSocket two-client harness
docs/              cycle plans, decisions, backlog, architecture deep-dives
.claude/           agent-specific (commands, hooks, rules, skills)
```

## Testing posture

- **Run `npm test` before any commit that touches client code.** Specs run in ~1.5s; no excuse to skip.
- **Run `npm run build` before any commit that touches imports or affects the bundle.**
- **Run `npm run test:e2e` if a change could regress visual or interactive behavior.** Playwright captures golden screenshots; SSIM diff catches regressions.
- **Sim-baseline failure** = stop, read diff, decide intent. Never regenerate to make tests pass.

## PR + commit conventions

- **Conventional commits**: `[type](scope): summary`. Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `release`.
- **Squash merge.** First-line is the commit message; PR description has the why.
- **No `--no-verify`, no `--amend` of pushed commits, no force push to `main`.**
- **Player-visible changes** ship as `vN.N.N` tags with a [`CHANGELOG.md`](CHANGELOG.md) entry. Internal-only cycles don't need a version bump.

## Where to read for more

| Doc | Purpose |
|---|---|
| [`README.md`](README.md) | Public-facing overview, contributor pitch |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Module map, render pipeline, network protocol |
| [`DECISIONS.md`](DECISIONS.md) | Chronological decisions log (the "why") |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Closed cycles + deferred items |
| [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) | Frozen-file rules + authorization protocol |
| [`docs/cycle-N-plan.md`](docs/) | Active cycle plan (N changes per cycle) |
| [`NEXT_SESSION.md`](NEXT_SESSION.md) | Current pickup state — read first if you're picking up cold |
| [`CHANGELOG.md`](CHANGELOG.md) | Player-facing release log |

## Working style for autonomous runs

- **Pick the simplest thing that meets the budget.** If the simple version reads correctly, ship it. Escalate only on demonstrated need.
- **Measure on actual hardware.** Don't trust "should be fast" claims; profile.
- **One task in progress at a time.** Mark complete the moment it's done; don't batch.
- **Surface drift early.** If a change goes outside the active cycle plan's scope, stop and ask.

## What NOT to do

- Don't introduce new build steps, codegen, or transpilation beyond Vite's defaults.
- Don't add dependencies without checking bundle impact (`npm run build`, compare `dist/` sizes).
- Don't refactor outside the active cycle's stated scope.
- Don't regenerate sim-baseline goldens without explicit acceptance in the cycle plan.
- Don't touch frozen files without fence authorization (see [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md)).
- Don't write speculative abstractions for hypothetical future requirements.
