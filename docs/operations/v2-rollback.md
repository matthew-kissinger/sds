# Sheepdog Sim v2 rollback

Keep this receipt until v3 has completed its rollback observation window.

## Preserved production source

- Release: `v2.6.4`
- Commit: `d5c38469f9f63cb8884bfe10d334804faa7823be`
- Successful deploy run: `30228931222`
- Immutable Pages deployment: `https://7cea2cd2.sds-frontend.pages.dev`
- GitHub release: `https://github.com/matthew-kissinger/sds/releases/tag/v2.6.4`

The `field-v3` score partition is backward-compatible with all version 2 score
routes and adds no migration, so the version 2 client still reads and writes
solo times against `sds-worker`.

Since Release 1 that is all it gets back. The `v2` Durable Object migration
deleted the `RoomDO` and `LobbyDO` classes and the `/api/rooms*`,
`/api/lobbies` and `/r/:code/ws` routes went with them, so a restored version 2
client has no multiplayer: room creation, joining and quick match fail. No
Worker rollback can restore them, because no rollback crosses a Durable Object
lifecycle change.

## Rollback procedure

Since Release 1, `sheepdogsim.com` is served by a Worker route that takes
precedence over the Pages custom domain, so a Pages rollback is invisible until
the route is gone.

1. Delete the `sheepdogsim.com/*` Worker route, as in "Rolling back" in
   `docs/operations/deployment.md`, and revert the routes commit on `main` so
   no later deploy publishes it again.
2. In Cloudflare Pages, open the `sds-frontend` project.
3. Select deployment `7cea2cd2` for commit `d5c38469f9f63cb8884bfe10d334804faa7823be`.
4. Use the Pages rollback control to make it production.
5. Verify the custom domain serves the v2.6.4 asset set.
6. Verify the Worker independently:
   `node scripts/verify-worker-origin.mjs --url https://sds-worker.matt-m-kissinger.workers.dev`
7. Record the rollback time and reason before attempting a new v3 deploy.

Do not run a D1 down migration. Do not redeploy the Worker as part of a client-only rollback.
