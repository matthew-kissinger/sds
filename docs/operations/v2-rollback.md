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

Since 3.3.1 (2026-10-17), `sheepdogsim.com` is a Custom Domain of the
`sds-worker` Worker, which owns the apex DNS record and its certificate, and
the Pages project has no custom domain. A Pages rollback therefore first
hands the hostname back to Pages (`docs/operations/declarative-hosting.md`,
"Rollback summary"); each dashboard step is one owner's go.

1. Remove the Custom Domain `sheepdogsim.com` from `sds-worker` (dashboard:
   Workers & Pages > `sds-worker` > Domains). This deletes the apex `AAAA`
   record and the certificate pack with it (measured). Revert `domains` in
   `app/cloudflare.config.ts` on `main` so no later deploy publishes it again.
   (There is no route to delete since 3.3.2.)
2. In Cloudflare Pages, open the `sds-frontend` project and add
   `sheepdogsim.com` as its custom domain again. Pages creates the proxied
   CNAME to `sds-frontend.pages.dev` and validates the hostname (minutes).
3. Select deployment `7cea2cd2` for commit `d5c38469f9f63cb8884bfe10d334804faa7823be`.
4. Use the Pages rollback control to make it production.
5. Verify the custom domain serves the v2.6.4 asset set.
6. Verify the Worker independently:
   `node scripts/verify-worker-origin.mjs --url https://sds-worker.matt-m-kissinger.workers.dev`
7. Record the rollback time and reason before attempting a new v3 deploy.

Do not run a D1 down migration. Do not redeploy the Worker as part of a client-only rollback.
