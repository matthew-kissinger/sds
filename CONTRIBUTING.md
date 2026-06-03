# Contributing

Thanks for considering a contribution. This repo is free to play and source-readable. Contributions are accepted under AGPL-3.0-or-later for code and CC BY-SA 4.0 for assets, so issues and PRs of any size are welcome.

## Getting set up

```bash
git clone https://github.com/matthew-kissinger/sds.git
cd sds
npm install
npm run dev               # Vite on :3000 — single-player works with no backend
```

For multiplayer testing add a second terminal:

```bash
cd worker && npx wrangler dev    # Local Cloudflare Worker on :8787
```

Full dev workflow, mobile testing, and troubleshooting are in [DEVELOPMENT.md](DEVELOPMENT.md). Architecture tour is in [ARCHITECTURE.md](ARCHITECTURE.md). The rationale behind non-obvious choices is in [DECISIONS.md](DECISIONS.md).

## Good first PRs

The [README "Places a PR would be genuinely useful" section](README.md#places-a-pr-would-be-genuinely-useful) is the curated list. Beyond that:

- Any of the content expansion items in the [Roadmap](README.md#roadmap--where-the-game-is-going) — new scenes, new modes, weather, predators.
- Any P3 item in [docs/cycle-2-todo.md](docs/cycle-2-todo.md).
- Any open [issue](https://github.com/matthew-kissinger/sds/issues) labeled `good-first-issue`.

## Ground rules

- **Keep the happy path working.** Run `npm run dev` and play through at least one solo round before opening a PR. For multiplayer changes, open two browsers and verify the two-client flow.
- **Test what you ship.** `npm test` runs Vitest; `npm run test:integration` runs the two-client WebSocket harness. Add coverage where it's missing; don't break existing tests.
- **Keep PRs narrow.** One logical change per PR; don't bundle refactors into feature work. Match the existing style in `js/` (2-space indent, no semicolons optional — just match the file).
- **Update docs from the code, not the plan.** If your change alters architecture, the README / ARCHITECTURE / relevant cycle doc comes with the code change, not in a follow-up.
- **No emojis in code, commits, or docs** unless a file already uses them.
- **i18n:** English copy lives in `js/i18n/en.json` and is the source of truth; translations under `js/i18n/<lang>.json` should stay in sync. Contributions for new languages are very welcome.

## Mods / forks

Shipping a mod or fork of the game? Open an issue and I'll link it from the README. Modified or hosted versions must publish corresponding source under AGPL-3.0 and preserve the attribution/source notices in reasonably visible locations. The sandbox format uses lz-string-encoded URL hashes, so a custom layout ships as a shareable link today; biome-level mods are a planned seam in the roadmap.

## Security

See [SECURITY.md](SECURITY.md) for responsible-disclosure contact.
