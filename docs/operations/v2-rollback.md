# Sheepdog Sim v2 rollback

Keep this receipt until v3 has completed its rollback observation window.

## Preserved production source

- Release: `v2.6.4`
- Commit: `d5c38469f9f63cb8884bfe10d334804faa7823be`
- Successful deploy run: `30228931222`
- Immutable Pages deployment: `https://7cea2cd2.sds-frontend.pages.dev`
- GitHub release: `https://github.com/matthew-kissinger/sds/releases/tag/v2.6.4`

The v3 static cutover does not change the Worker or D1. A Pages rollback therefore restores the v2 client against the backend it shipped with, without a Worker rollback or reverse migration.

## Rollback procedure

1. In Cloudflare Pages, open the `sds-frontend` project.
2. Select deployment `7cea2cd2` for commit `d5c38469f9f63cb8884bfe10d334804faa7823be`.
3. Use the Pages rollback control to make it production.
4. Verify the custom domain serves the v2.6.4 asset set.
5. Verify the Worker health endpoint independently.
6. Record the rollback time and reason before attempting a new v3 deploy.

Do not run a D1 down migration. Do not redeploy the Worker as part of a client-only rollback.
