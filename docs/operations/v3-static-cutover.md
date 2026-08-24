# Sheepdog Sim 3.0 static cutover

The v3 launch deploys one static Pages artifact. It does not deploy the SDS Worker or apply D1 migrations.

## Automation contract

- `Client CI` verifies the client on pushes and pull requests. It never deploys.
- `Pages Preview` builds and deploys a same-repository pull request to a non-production Pages branch. It never installs or invokes Wrangler in `worker/`.
- `Deploy Pages` is manual. It accepts only a full 40-character commit SHA already contained in `origin/main`, verifies the release is a bounded single-player 3.x build, archives the exact `dist/` artifact, deploys it to the existing `sds-frontend` Pages project, and verifies the live commit through `/release.json`.

The production workflow deliberately refuses the v2 client. It becomes usable only after the imported client has a `3.x` package version and a root `release-capabilities.json` such as:

```json
{
  "singlePlayer": true,
  "multiplayer": false,
  "leaderboards": "solo-times",
  "maxSheep": 200
}
```

Use `"leaderboards": "none"` if solo-time submission is not part of the approved launch. This field records product scope; it does not enable a feature.

## Build identity

`scripts/write-release-manifest.mjs` writes `dist/release.json` after the production build. It records:

- package version;
- exact source commit and ref;
- UTC build time;
- packaged capability declaration, when present;
- file count, byte count, and a SHA-256 digest over the complete static artifact except the manifest itself.

`scripts/verify-release-manifest.mjs` checks the local artifact before deployment and the custom-domain manifest after deployment. Preview and CI artifacts use the same format.

## Service-worker transition

The v2 Vite plugin still writes its active cache worker over `dist/sw.js`, so this branch does not alter the running v2 client. The committed `public/sw.js` is the v3 retirement worker that standard Vite public-file copying will ship after the client replacement removes the old custom worker plugin.

On install and activation, the retirement worker:

1. takes control immediately;
2. deletes caches whose names begin with `sheepdog-sim-`;
3. claims current clients;
4. unregisters itself;
5. registers no fetch handler, so v3 requests always use the network and normal browser cache.

Do not copy the old root `sw.js` or its Vite build plugin into the v3 client.

## Production release

1. Merge the approved candidate to `main`.
2. Copy the full commit SHA from the merged commit.
3. Confirm Client CI and the Pages preview are green.
4. Run `Deploy Pages` manually with that SHA.
5. Confirm the workflow's live identity check succeeds.
6. Verify `https://sheepdogsim.com/release.json` contains the same commit.

Repository environment protection and required status checks remain operator-owned GitHub settings. This change does not create or modify them.

## Backend boundary

The existing Worker, Durable Objects, D1 database, migrations, secrets, and custom routes are untouched. A later solo leaderboard can use a separately reviewed endpoint without coupling Worker deployment or database migration to the v3 Pages workflow.

