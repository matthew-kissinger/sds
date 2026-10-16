# Deploying Sheepdog Sim

This is the single answer to "how does a change reach production". It describes
the shape the repository deploys, from Release 1 (3.2.0) on: one Worker serves
the game and its API on `sheepdogsim.com`. From 3.2.1 it is one package: the
Worker is built beside the client by the Cloudflare Vite plugin. From Release 2
Stage B the project is described by `app/cloudflare.config.ts`, the plugin
writes the Build Output Specification, and the `cf` CLI deploys it. The
one-time move from the Pages project is `docs/operations/worker-cutover.md`;
the measurements behind the `cf` move are in `docs/history/status-log.md`
(Release 2 Stage B).

## One production path

There is exactly one way the game reaches players.

`Deploy` (`.github/workflows/deploy.yml`) runs when an annotated `v*` tag is
pushed, and keeps a `workflow_dispatch` escape hatch that takes a full
40-character commit SHA for redeploying an older commit. Either way it:

1. refuses a commit not already contained in `origin/main`, and refuses a
   commit without `app/cloudflare.config.ts` - one built for wrangler (3.2.1
   to 3.3.0), which deploys with the workflow at its own tag, or one from
   before this Worker served the game (see Rolling back);
2. runs lint, both typechecks, the build with `SDS_RELEASE_SHA` and
   `SDS_RELEASE_REF`, the discovery check and the full test suite, which
   includes `tests/worker` and the two configuration tests;
3. verifies the `release.json` the build wrote into the Build Output's assets,
   with `--require-v3-static`, and the Build Output itself
   (`scripts/verify-deploy-config.mjs --cf`);
4. archives the Build Output as `release-<sha>` for 90 days;
5. runs `cf deploy --dry-run --prebuilt --no-provision` and then
   `cf deploy --prebuilt --no-provision` from `app/`, which uploads the game as
   the Worker's static assets and the API code as one version, makes it the
   active deployment and publishes the route - one commit, one deploy, both
   halves;
6. verifies the live `https://sheepdogsim.com/release.json` reports that SHA;
   that `sheepdogsim.com` serves `index.html` at `/` and JSON at
   `/api/healthz` (`scripts/verify-worker-origin.mjs`); that the `workers.dev`
   host still answers the same; and the discovery pages with exactly one
   analytics beacon. If any check fails the deploy fails.

Nothing else deploys production. `Client CI` verifies and never deploys.
`Preview` uploads pull requests to the preview Worker, never to production.

The `CF_API_TOKEN` repository secret is the Account API Token
`sds-github-deploy` (created 2026-10-16, expires 2027-10-16), and its policy
is exactly what the two workflows call, nothing more:

| Scope | Permission | Why |
| --- | --- | --- |
| Account | Workers Scripts, Edit | upload the Worker and its assets, create preview versions |
| Account | D1, Read | the `DB` binding is validated at deploy |
| Account | Account Settings, Read | account resolution |
| Zone `sheepdogsim.com` only | Workers Routes, Edit | every deploy re-publishes the route from `app/cloudflare.config.ts`; deleting it is the rollback |

`cf` keeps its own credentials and does not read wrangler's login; it takes the
same token from `CLOUDFLARE_API_TOKEN`, and the workflows pass the same two
secrets. The deploy runs with `--no-provision` because `cf deploy` would
otherwise create a resource for a binding that names none; every binding here
names an existing one by id.

Nothing for Pages: the dormant Pages project is never deployed to. The v3.2.0
tag deploy is the record of why the zone permission matters: the previous
token could upload the script and not the route, so wrangler stopped after
the upload and the workflow's live checks never ran. When the token is
rotated, the new one gets this table's policy and the old one is revoked the
same day.

## What the hostnames and names mean

| Name | What it is |
| --- | --- |
| `sheepdogsim.com` | The game. A proxied Cloudflare zone with a Worker **route** `sheepdogsim.com/*` to `sds-worker`. The only URL to publish. |
| `www.sheepdogsim.com` | A proxied DNS record and a zone redirect rule to the apex, 301 with path and query kept. Never served; see Zone configuration. |
| `sds-worker` | The production Worker. Serves the built game as static assets and the identity and score API under `/api/*`. Holds `JWT_SECRET` and the `DB` binding to D1 `sds-db`. |
| `sds-worker.matt-m-kissinger.workers.dev` | The same Worker on its own hostname. Kept on (`workers_dev = true`) because every client built before Release 1 calls the API here; it serves the game too, under its own origin and therefore its own `localStorage`. Not a URL to publish. |
| `sds-worker-preview` | The preview Worker (the `preview` mode of `app/cloudflare.config.ts`; `[env.preview]` in `wrangler.toml`), with its own D1 `sds-db-preview` and its own `JWT_SECRET`. Pull requests upload versions here and deploy to it. |
| `pr-<n>-sds-worker-preview.matt-m-kissinger.workers.dev` | Pull request `<n>`'s preview: a version alias of `sds-worker-preview`, game and API on one origin. |
| `sds-frontend` | The Cloudflare Pages project that served the game until Release 1. **Dormant**: nothing deploys to it, and it is not deleted, because it holds the immutable v2 deployment and is what answers `sheepdogsim.com` if the route is removed. |
| `sds-frontend.pages.dev` | The Pages project's own hostname. It cannot be disabled and keeps serving the last Pages deployment (3.1.0), which carries `<link rel="canonical">` to `sheepdogsim.com`. |
| `7cea2cd2.sds-frontend.pages.dev` | The immutable v2 deployment kept for rollback. See `docs/operations/v2-rollback.md`. |

The only GitHub environment is `production`, used by `Deploy`.

## Where the configuration lives

There is one package. The project is `app/cloudflare.config.ts`: a function of
the build mode that returns the production Worker (`sds-worker`, the route, D1
`sds-db`) for the default and the preview Worker (`sds-worker-preview`, no
route, D1 `sds-db-preview`) for `--mode preview`. Modes replace wrangler's
environments: each mode returns its whole Worker, nothing is inherited.
`worker/` is a plain directory of source (`worker/src`) and D1 migrations
(`worker/migrations`); it has no `package.json`. `vite build` runs the two
build environments through `@cloudflare/vite-plugin` 2.0 and writes the Build
Output Specification under the Vite root, `app/`:

| Path under `app/.cloudflare/output/v0/` | Contents |
| --- | --- |
| `config.json` | the mode the build was made in |
| `workers/default/worker.config.json` | the Worker as the config resolved for that mode: name, runtime, triggers, bindings, assets rules |
| `workers/default/bundle/` | `index.js` and its source map |
| `workers/default/assets/` | the game, `app/public` and `release.json`: the served artifact |

`scripts/build-output.mjs` is the one place that names these paths; the
verifiers, the probes and `vite.config.ts` import it. Four consequences:

- **The deploy ships exactly the Build Output the build produced.**
  `cf deploy --prebuilt` reads it as it stands and builds nothing; the
  workflows build with this repository's own `npm run build` (or
  `build:preview`), verify the output, then hand it to `cf`. There is no
  generated `wrangler.json` and no `--config`.
- **The paths are the plugin's, not ours.** The plugin reads
  `cloudflare.config.ts` from the Vite root and nowhere else, which is why the
  file lives in `app/` with `entrypoint: '../worker/src/index.ts'`, and `cf`
  runs from `app/` because it finds the file by walking up from its working
  directory. The plugin also forces every environment's `build.outDir` into the
  Build Output after Vite has merged the user config, so nothing is written to
  `dist/` and no Vite option can put it back. Measured with the plugin
  2.0.0-beta.v.1 and `cf` 1.0.0-beta.18 (status log, Release 2 Stage B).
- **No Durable Object export.** `cf` carries Durable Object classes in an
  `exports` map and has no migrations array; the applied v1/v2 history deleted
  every class, and the docs say not to copy applied deletions. The config
  declares no export, the verifier fails one, and the account keeps the
  `migration_tag` (`v2`) across `cf`'s uploads: measured by a wrangler deploy
  of an older commit and a rollback across a `cf` deploy on the preview
  Worker.
- **`wrangler.toml` stays while a rollback to the wrangler path is wanted.**
  It is the configuration the 3.2.1 to 3.3.0 tags deploy with, and local
  wrangler commands (`versions view`, `rollback`, `deployments list`) still read
  it. `tests/worker/cloudflare-config.spec.ts` holds every hosting fact in the
  two files equal, so they cannot drift while both exist; when the last
  wrangler-built release is no longer a rollback target, the file and that test
  go together, and `tests/worker/wrangler-config.spec.ts`'s facts move onto the
  cf declaration.

## One origin

`app/cloudflare.config.ts` declares `assets` with
`notFoundHandling: 'single-page-application'` and
`runWorkerFirst: ['/api/*']` (`wrangler.toml` says the same), over the built
game the Build Output supplies:

- `/api/*` always runs the Worker script. An unknown API path is a JSON 404
  from the script, never HTML.
- Every other path is answered by the asset layer without invoking the
  script: the file if it exists, otherwise `index.html` with a 200. The array
  form of `run_worker_first` also stops `Sec-Fetch-Mode: navigate` from
  changing that, so a browser and `curl` see the same thing.
- `_headers` and `_redirects` from `app/public` are honoured natively:
  `/release.json` and `/sw.js` carry `no-store`, `/about.html` 301s to
  `/about`, and `/about` serves `about.html`.
- Health is `GET /api/healthz` -> `{"ok":true,"worker":"sds-worker"}`.

**Assert content types, never status codes.** Every unmatched path answers 200
`text/html`, including the retired `/healthz` and, before the route existed,
`https://sheepdogsim.com/api/*` (the Pages fallback). A check on status alone
passes with the API down. Likewise a missing `release.json` is served as
`index.html`: build, then write the manifest, then deploy.

## Routes and hostnames

Four measured facts govern the hosting declaration (`workersDev`,
`triggers` and `previewUrls` in `app/cloudflare.config.ts`; `workers_dev`,
`routes` and `preview_urls` in `wrangler.toml`):

- **`workers_dev` is set explicitly.** Cloudflare infers it as false as soon
  as a config declares routes, which would take the `workers.dev` host off
  the air and break every pre-Release-1 client.
- **A route, not a Custom Domain.** A Worker route takes precedence over the
  Pages custom domain on the same hostname, so the takeover needed no
  downtime, and deleting the route hands `sheepdogsim.com` back to Pages. A
  Custom Domain would have forced the hostname off Pages first.
- **A deploy replaces the route set; a config without routes leaves it
  alone.** `wrangler deploy` and `wrangler triggers deploy` PUT exactly the
  configured routes when there are any, and do nothing to routes when there
  are none (Wrangler 4.151.1 source). So removing the `[[routes]]` block does
  not remove the route, and while the block is on `main` every deploy puts it
  back.
- **`routes` is inheritable in wrangler.** Without `routes = []` under
  `[env.preview]`, a preview deploy would try to claim `sheepdogsim.com/*` for
  the preview Worker. The cf modes inherit nothing, and the preview mode
  declares no trigger. `tests/worker/wrangler-config.spec.ts` and
  `tests/worker/cloudflare-config.spec.ts` pin this and the rest.

`/r/*` is left unclaimed on purpose. Routes match most-specific first, so a
realtime Worker can take `sheepdogsim.com/r/*` later
(`spec/03-multiplayer.md`) without touching this one. Until then `/r/*` is
just the single-page fallback.

## Durable Objects

`sds-worker` has none. The v2 `RoomDO` and `LobbyDO` classes were retired by
the `v2` migration (`deleted_classes`), which also deleted their stored room
state. Three platform facts follow, the first measured on the preview Worker:

- `wrangler versions upload` refuses a config with a pending class lifecycle
  change and uploads nothing ("This Worker has a pending Durable Object
  migration ... must be applied with `wrangler deploy`"). Once the migration
  has been applied by a deploy, the same config uploads normally.
- No `wrangler rollback` can cross a lifecycle change, so no rollback returns
  `sds-worker` to a version from before Release 1.
- Version preview URLs are not generated for a Worker with Durable Objects,
  which is why the preview Worker had to drop them before pull-request
  aliases could work.

## Shipping a change

1. Merge the approved candidate to `main`.
2. Confirm `Client CI` is green on the merge commit. A push to `main` cancels an
   in-flight run for the same ref, so check the run for the commit you intend to
   deploy, not an earlier one.
3. Bump `package.json` and add the `CHANGELOG.md` entry in the commit you intend
   to tag. `release.json` takes its `version` from `package.json`, so the tag,
   the package version and the live manifest will then agree.
4. If the change touches `worker/`, mint a check identity on production first
   (see "What a player keeps").
5. Tag that commit and push the tag. The owner's approval in conversation is
   the authorization; see `AGENTS.md`.
   `git tag -a vX.Y.Z <sha> -m "Sheepdog Sim X.Y.Z" && git push origin vX.Y.Z`
   The tag push triggers `Deploy`.
6. Confirm the workflow's live checks pass: release identity, one origin,
   the `workers.dev` host, discovery and analytics.
7. Confirm `https://sheepdogsim.com/release.json` reports that commit and
   version, and, if step 4 applied, that the check identity still resolves.

The tag is what makes a release nameable later: it names the commit, so a
rollback is dispatching the workflow with an older one.

## Rolling back

**A bad release on the Worker.** Dispatch `Deploy` with the previous good SHA.
Every deploy is a rebuild of a named commit, so a rollback is the same
operation with an older argument. The faster equivalent, for any version from
Release 1 on, is to make an earlier version the active deployment:
`npx wrangler rollback <version-id> --name sds-worker` from the repository
root with a logged-in wrangler, or `cf workers deployments create --worker
sds-worker --versions <version-id>`; `npx wrangler deployments list --name
sds-worker` names the versions. Neither can reach a commit or version from
before Release 1: the workflow refuses the commit, and the platform refuses to
cross the Durable Object deletion.

A dispatch runs the workflow file from `main` against the named commit's
tree, so a commit built for an earlier deploy path needs the workflow of its
own tag: `gh workflow run deploy.yml --ref <tag> -f commit_sha=<sha>`. That is
every commit before the `cf` move (3.2.1 to 3.3.0, which deploy with
wrangler from the generated `wrangler.json`; the current `Deploy` refuses
them for lack of `app/cloudflare.config.ts`) and 3.2.0, whose configuration
was in `worker/wrangler.toml`. The platform does not care which tool uploaded
a version: a wrangler deploy over a `cf` deployment and a rollback across it
were measured on the preview Worker to leave the bindings and the migration
tag as they were.

**The hosting itself.** Delete the `sheepdogsim.com/*` route (dashboard:
Workers & Pages > `sds-worker` > Settings > Domains & Routes; or the API, as in
`docs/operations/worker-cutover.md`). The Pages custom domain answers again
within moments with its last deployment, 3.1.0, which calls the API on the
`workers.dev` host cross-origin; the Worker still sends a `*` CORS header for
exactly that reason. Then revert the routes commit on `main` before the next
tag, or the next deploy will publish the route again.

Version 2 is recoverable separately through its immutable deployment, without
its multiplayer, which went with the Durable Objects.

## Build identity

The `release-manifest` plugin in `vite.config.ts` writes `release.json` into
the Build Output's assets (through `scripts/write-release-manifest.mjs`) at
the end of the client build,
in `writeBundle` with `order: 'post'` so it runs after `app/public` has been
copied in. It records the package version, the exact source
commit and ref (`SDS_RELEASE_SHA` and `SDS_RELEASE_REF`, else the checkout's
HEAD and branch), the UTC build time, the `release-capabilities.json`
declaration, and the file count, byte count and SHA-256 digest over the whole
artifact except the manifest itself. It is part of the build because a build
without it is served as the single-page fallback: at the Release 1 cutover a plain rebuild shipped once without the
manifest and the live `/release.json` answered with `index.html` for a few
minutes. There is no separate command to write it.

`scripts/verify-release-manifest.mjs` checks the local artifact before the
deploy and the live manifest after it. `scripts/verify-deploy-config.mjs --cf`
checks the Build Output (production, or `--preview` for a build made with
`--mode preview`): the mode in `config.json`, and in `worker.config.json` the
name, triggers, `workersDev`, `previewUrls`, compatibility date and flags,
observability, the bindings with the D1 id, no Durable Object export, the
assets settings, a bundle entry that exists, and an assets directory that holds
`release.json` and `index.html` and no configuration file. Without `--cf` the
same script checks a generated `wrangler.json`, which the 3.2.1 to 3.3.0 tags
still produce. `tests/worker/verify-deploy-config.spec.ts` breaks each fact in
both shapes and expects the check to fail naming it. `npm run probe:release` runs the same
measurement locally, so the file count and byte count can be compared against
the live site by hand.

The workflow refuses a release that is not a bounded single-player 3.x build: it
requires a `3.x` package version and a `release-capabilities.json` recording
product scope. That field records scope and enables nothing.

## What a player keeps

Player identity is a JWT held in `localStorage` under
`sheepdog.score-identity.v1`, written by `app/src/scores/storage.ts` together
with the `persistentId` and device `authSecret`, and sent as an
`Authorization: Bearer` header. There are no cookies anywhere in the Worker.
`localStorage` is keyed to the origin the game is served from -
`sheepdogsim.com` - and times live in D1 `sds-db`.

The move from Pages to the Worker kept the game's origin, the `JWT_SECRET`
(the same Worker, so nothing was copied) and the database, so it moved no name
and no time. What would lose them is changing the origin the game is served
from, rebinding `DB`, or a Worker verifying tokens with a different
`JWT_SECRET`. The last fails silently: `app/src/scores/controller.ts` treats a
401 as "re-register", so returning players get new random names and their
times are orphaned under the old `persistent_id`.

`scripts/verify-identity.mjs` is the check. `--save <file>` mints a throwaway
identity and keeps its token; `--check <file>` on the changed origin proves the
old token still verifies, re-registering returns the same name, and a wrong
secret is refused. The token step is what detects a secret mismatch:
re-registering alone passes under a different secret, because it checks the
stored secret hash, not the JWT. Keep the file outside the repository.

Two cache facts make a client rollout predictable: `index.html` is served
`public, max-age=0, must-revalidate` (the Workers asset default, measured, and
what Pages sent), and `app/public/sw.js` registers no fetch handler, so there
is no application-level cache. A returning player revalidates the HTML and
picks up the new bundle hash on their next load. Only an already-open tab keeps
running old code, which is one reason the `workers.dev` API stays up.

## Zone configuration

Settings that live on the `sheepdogsim.com` zone rather than in this
repository. Each one is verified by `scripts/verify-public-discovery.mjs` on
the production host, so a change in the dashboard that breaks one fails the
next deploy. Dashboard changes are owner-approved, one at a time.

- DNS: `sheepdogsim.com` is a proxied CNAME to `sds-frontend.pages.dev` from
  the Pages era; the Worker route sits on top of it. `www.sheepdogsim.com` is a
  proxied CNAME to `sheepdogsim.com`.
- Redirect rule "www to apex": a Single Redirect for requests whose hostname is
  `www.sheepdogsim.com`, dynamic target
  `concat("https://sheepdogsim.com", http.request.uri.path)`, status 301,
  query string preserved. It runs at the edge before static assets or the
  Worker, which is the only layer that can canonicalise a hostname here: for
  non-API paths the asset layer answers before any Worker code runs.
- Web Analytics site `sheepdogsim.com`, mode "JS Snippet installation".

End state, Release 2: once the Pages project is retired, both hostnames become
Worker custom domains in `app/cloudflare.config.ts` and the DNS records are
created by the deploy, leaving the redirect rule and the analytics mode as the
only zone settings. Until then the apex record must stay as it is, because a
custom domain would force the hostname off Pages.

## Analytics

Cloudflare Web Analytics loads from Cloudflare's own snippet in
`app/index.html` and in the three static pages under `app/public` (`about`,
`support`, `privacy`), with the token of the Web Analytics site named
`sheepdogsim.com` (site tag `7bf1aecd39d6485184c6a80f8f33639b`). Those four
files are the only copies of the token. `npm run check:discovery` and the
deploy require exactly one beacon on every HTML page, carrying that token, so a
second injector or the old token fails the check.

- The Pages project injected a different token,
  `b5895c76a5cb439ca880f29caf3e70bc`, which belongs to the site misnamed
  `sds-frontend.pages.dev +1` (tag `2a512ef5e27a4909a7915228adc31a63`). Never
  use it. That site goes quiet once Web Analytics is turned off on the Pages
  project.
- The zone's automatic injection does not reach responses served by a Worker:
  at the Release 1 cutover no page carried an injected beacon, which is why
  every page carries the snippet itself. The `sheepdogsim.com` site therefore
  runs in "JS Snippet installation" mode; automatic injection would do nothing.
- The token is spelled out in four HTML files. The verifier makes drift fail a
  deploy, but one source would be better: in Release 2 the three static pages
  become Vite entries and a single `transformIndexHtml` hook injects the
  snippet from one constant, alongside the cf CLI build change.
- `sheepdogsim.com` is a proxied zone, so the zone's own analytics count
  requests at the edge with no beacon at all.

## Service worker

`app/public/sw.js` is the retirement worker. On install and activation it takes
control immediately, deletes caches whose names begin with `sheepdog-sim-`,
claims current clients, unregisters itself, and registers no fetch handler, so
requests always use the network and the normal browser cache. Do not reintroduce
a caching service worker or a Vite plugin that writes one.

## Previews

`Preview` (`.github/workflows/preview.yml`) runs for pull requests from this
repository, skipping Dependabot, which receives no secrets. It builds with
`npm run build:preview` (`vite build --mode preview`) and no
`VITE_SCORE_API_BASE`, so the preview calls its own origin. The order matters:
it verifies the Build Output with `verify-deploy-config.mjs --cf --preview`,
migrates the preview D1 only (the script names `wrangler.toml` and `--env
preview` itself), dry-runs `cf`, uploads the aliased version with `cf workers
versions create --prebuilt --mode preview --preview-alias pr-<n>`, and then
deploys the same output to the preview Worker with `cf deploy --prebuilt
--mode preview`, so every pull request also exercises the deploy path
production uses. One pull request therefore creates two versions. The preview
D1 id (`6d5b0fce-952f-4d94-8936-b51fc559496c`) is committed in both
configuration files: a database id is an identifier, not a secret, and
`d1-migrate-remote.mjs` refuses to run a preview migration against the
production id. The upload leaves every other pull request's alias alone. It
then verifies the alias and the deployed root by content type and a register
round trip.

Previews never upload a version of `sds-worker`: a version preview of
production would answer on a throwaway hostname with production's D1 and
secrets. `preview_urls = false` on production makes that impossible.

A pull request that adds a Durable Object class declares it in the config's
`exports` map; `cf` has no migrations array, the map is the live set of
classes, and the docs call it one-way once deployed. Measure such a change on
the preview Worker first, as Release 2 Stage B measured the tag.

## Local development

```bash
cp .dev.vars.example .dev.vars   # local JWT_SECRET, gitignored; once
node scripts/d1-local-setup.mjs  # once, against a fresh local D1
npm run dev                      # http://localhost:5199
```

`vite dev` serves the game and the Worker together through the Cloudflare
plugin: the Worker runs from `app/cloudflare.config.ts` in the same process,
`/api/*` reaches it on the same origin with no proxy, and the local D1 lives in
`.wrangler/state` (`persistState` in `vite.config.ts`; the setup script and
`d1-migrate-remote.mjs` with `D1_LOCAL=1` write to the same place). Without
`.dev.vars` and the migrations the game runs and the online boards report
unavailable.

`npm run build` then `npm run preview` (`vite preview`) is the full stack on one
origin from the built artifact - the Worker bundle, the assets layer and the
local D1 - and `node scripts/verify-worker-origin.mjs --url http://localhost:4173`
checks it. The browser probes in `tools/` do not use it: `startPreviewServer`
serves the built game as plain files with a single-page fallback, the way the hub does,
and `tools/harness-stubs.mjs` stubs the API and the analytics beacon, so a
receipt measures the built client alone. `VITE_SCORE_API_BASE` still points a
build at any other API origin.

## Backend boundary

The client uses only the documented identity and score REST routes. Production
D1 migrations are not applied by `Deploy`; `scripts/d1-migrate-remote.mjs`
applies them deliberately, and the preview workflow applies them to the preview
database only. Score-service specifics are in `docs/operations/solo-times.md`.
