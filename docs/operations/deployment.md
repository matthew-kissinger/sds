# Deploying Sheepdog Sim

This is the single answer to "how does a change reach production". It describes
what is live now, not a cutover that was once planned.

## One production path

There is exactly one way the game reaches players:

`Deploy Pages` (`.github/workflows/deploy.yml`) is manual. It takes a full
40-character commit SHA, refuses any SHA not already contained in `origin/main`,
rebuilds from that exact commit, archives the `dist/` artifact for 90 days, and
uploads it with
`wrangler pages deploy dist --project-name=sds-frontend --branch=main`. It then
verifies the live `/release.json` reports that same SHA and that the discovery
pages and the analytics beacon are present. If any check fails the deploy fails.

Nothing else deploys the client. `Client CI` verifies and never deploys.
`Pages Preview` deploys pull requests to a non-production Pages branch.

## What the hostnames and names mean

The naming reads like several deployment targets. It is one, and these are the
reasons the other names exist.

| Name | What it is |
| --- | --- |
| `sheepdogsim.com` | The game. A Cloudflare zone, proxied, custom domain on the Pages project below. The only URL to publish. |
| `sds-frontend` | The Cloudflare Pages **project** name. A v2-era name for the project that serves `sheepdogsim.com`. Cosmetic, and Cloudflare cannot rename a project. |
| `sds-frontend.pages.dev` | The hostname Cloudflare gives every Pages project. It cannot be disabled. It serves the same artifact and carries `<link rel="canonical">` to `sheepdogsim.com`, so search engines fold it in. It is not a second entrance anyone built. |
| `7cea2cd2.sds-frontend.pages.dev` | The immutable v2 deployment kept for rollback. See `docs/operations/v2-rollback.md`. |
| `sds-worker.matt-m-kissinger.workers.dev` | The score and identity API. A second origin - see "The API is on a second origin" below. |

## Not deployment targets

Two stale entries still appear under the repository's Deployments. Neither can
deploy anything, and neither should be read as a target:

- **`github-pages`** - last deployed 2025-12-11. GitHub Pages is disabled on
  this repository; only the historical records remain.
- **`sds-frontend (Production)`** - last deployed 2026-04-23 by
  `github-actions[bot]`. This is Cloudflare Pages' own Git integration from
  before the static cutover, when Cloudflare built from the repository itself.
  The current workflow uploads a pre-built artifact instead, which is what makes
  a deploy reproducible from a named SHA.

Deleting those two GitHub environments is an operator-owned settings change.
Until they are deleted, read `production` as the only live one.

## Shipping a change

1. Merge the approved candidate to `main`.
2. Confirm `Client CI` is green on the merge commit. A push to `main` cancels an
   in-flight run for the same ref, so check the run for the commit you intend to
   deploy, not an earlier one.
3. Copy that commit's full 40-character SHA.
4. Run `Deploy Pages` manually with that SHA. The owner's approval in
   conversation is the authorization; see `AGENTS.md`.
5. Confirm the workflow's live identity and discovery checks pass.
6. Confirm `https://sheepdogsim.com/release.json` reports that commit.
7. Tag the deployed commit and push the tag:
   `git tag -a vX.Y.Z <sha> -m "Sheepdog Sim X.Y.Z" && git push origin vX.Y.Z`.

Step 7 is what makes a release nameable later. `release.json` takes its
`version` from `package.json`, so bump `package.json` and add the `CHANGELOG.md`
entry in the commit you intend to tag, and the tag, the package version and the
live manifest will all agree.

## Rolling back

Dispatch `Deploy Pages` with the previous good SHA. Every deploy is a rebuild of
a named commit, so a rollback is the same operation with an older argument.
Version 2 is recoverable separately through its immutable deployment.

## Build identity

`scripts/write-release-manifest.mjs` writes `dist/release.json` after the
production build, recording the package version, the exact source commit and
ref, the UTC build time, the `release-capabilities.json` declaration, and the
file count, byte count and SHA-256 digest over the whole artifact except the
manifest itself.

`scripts/verify-release-manifest.mjs` checks the local artifact before the
deploy and the custom-domain manifest after it. `npm run probe:release` runs the
same measurement locally, so the file count and byte count can be compared
against the live site by hand.

The workflow refuses a release that is not a bounded single-player 3.x build: it
requires a `3.x` package version and a `release-capabilities.json` recording
product scope. That field records scope and enables nothing.

## The API is on a second origin

The client reaches scores and identity at
`sds-worker.matt-m-kissinger.workers.dev`, set by `PROD_SCORE_API_BASE` in
`app/src/scores/config.ts`. The game is on `sheepdogsim.com`, so every score
call is cross-origin, handled by the allow-list in `worker/src/index.ts`. The
allow-list also still names `.sheepdogsim.pages.dev`, a project name that does
not exist; it is harmless, and a candidate for the next Worker deploy rather
than a reason to make one.

`worker/wrangler.toml` carries commented-out routes for `sheepdogsim.com/api/*`
and `sheepdogsim.com/r/*`. Two measured facts govern how they get enabled.

**`sheepdogsim.com/api/*` already answers HTTP 200, and it is not the Worker.**
Pages serves the single-page-application fallback for every unmatched path, so
`https://sheepdogsim.com/api/leaderboard` returns `index.html` -
byte-identical, `Content-Type: text/html` - with a 200 status. So a relative API
base would appear to work while every response was HTML, and any health check
against that path passes unconditionally and proves nothing. Assert
`Content-Type: application/json`, never the status code alone.

**Uncommenting the routes would disable the `workers.dev` hostname.** Cloudflare
documents `workers_dev` as defaulting to true when the configuration declares no
routes and false otherwise, inferred on the next deploy. `workers_dev` is unset
here, so adding routes would take
`sds-worker.matt-m-kissinger.workers.dev` offline - the one origin every
deployed client is built to call, because `PROD_SCORE_API_BASE` is baked into
the bundle. Set `workers_dev = true` explicitly in the same change.

Nothing in `dist/` is served under `/api` or `/r`, so a Worker route on those
prefixes collides with nothing.

## What a player keeps

Player identity is a JWT held in `localStorage` under
`sheepdog.score-identity.v1`, written by `app/src/scores/storage.ts`, and sent
as an `Authorization: Bearer` header. There are no cookies anywhere in the
Worker. `localStorage` is keyed to the origin the game is served from -
`sheepdogsim.com` - and not to the origin the API answers on, and times live in
the D1 database `sds-db` bound to the Worker.

So moving the API between hostnames does not touch a name or a time. What would
lose them is changing the origin the game itself is served from, or rebinding
the Worker to a different database.

Two cache facts make a client-side rollout predictable: `index.html` is served
`public, max-age=0, must-revalidate`, and `app/public/sw.js` registers no fetch
handler, so there is no application-level cache. A returning player revalidates
the HTML and therefore picks up the new bundle hash on their next load. Only an
already-open tab keeps running old code.

## Target architecture

The present split - a Pages project for the game, a Worker on another hostname
for the API, and an analytics beacon injected by a dashboard toggle that
`scripts/verify-public-discovery.mjs` then asserts - has one structural problem:
the repository asserts invariants it does not own. A dashboard change it cannot
see can fail a deploy. A second, quieter one: `deploy.yml` and
`deploy-worker.yml` each take their own SHA, so nothing makes the client and the
API it talks to come from the same commit.

Cloudflare's current direction for this shape is one Worker serving static
assets and the API from one origin: an `assets` directory with
`not_found_handling` set to `single-page-application`, and `run_worker_first`
for the API prefix. Assets are served from the same edge CDN Pages uses and do
not invoke the Worker script, so this is not a performance change - it is a
packaging one. It would put the game and its API on `sheepdogsim.com` alone,
delete the CORS allow-list rather than maintain it, retire the `pages.dev`
hostname and the analytics site misnamed after it, move the beacon into
`app/index.html` where the repository can honestly assert it, and pin both
halves of a release to one commit in one deploy. `_headers` and `_redirects`
are supported natively, so those files carry over unchanged.

**This needs no downtime.** A Worker *Route* takes precedence over a Pages
Custom Domain on the same hostname, so a route on `sheepdogsim.com/*` takes over
while the Pages project sits untouched underneath. Verify in production, and
roll back by deleting the route. Only a Worker *Custom Domain* would force the
domain off Pages first, because a custom domain belongs to one project at a
time. Prefer the route for the cutover.

Do not delete the Pages project afterwards. It still serves the immutable v2
deployment named in `docs/operations/v2-rollback.md`. Left dormant with no
custom domain it costs nothing, and the misnamed analytics site stops receiving
traffic on its own once the Worker serves the domain.

**Leave `/r/*` unclaimed.** `spec/03-multiplayer.md` reserves that prefix for
multiplayer rooms, and whether the Durable Objects that back them share this
Worker or get their own is an open decision recorded there. Routes match
most-specific-first, so a realtime Worker can take `sheepdogsim.com/r/*` later
without disturbing this one.

Pages remains fully supported with no announced deadline, so this is a direction
and not a deadline. It also folds into the `cf` CLI migration: `cf` moves
configuration to `cloudflare.config.ts`, and that one file would describe the
assets, routes and bindings together, so the two are cheaper done once than
twice. `cf` is in open beta with known gaps, so changing one variable at a time
is the safer order.

**The hazard that outranks all of the above.** Any Worker that verifies an
identity JWT must carry the same `JWT_SECRET` as the one that minted it.
`app/src/scores/controller.ts` treats a 401 as "re-register", so a secret
mismatch does not error - it silently issues returning players new random names
and orphans their recorded times under the old `persistent_id`. Copy the secret
verbatim and verify an existing identity still resolves before sending traffic.

## Analytics

Cloudflare Web Analytics is enabled through the Pages project, so Cloudflare
injects the beacon and registers the analytics **site** under the project's
`pages.dev` hostname. Both `sheepdogsim.com` and `sds-frontend.pages.dev` report
to that one site with the same token, so no traffic is lost or split - it is
filed under a name that reads like the wrong site. The per-hostname breakdown is
inside that site.

For figures labelled by the real domain, `sheepdogsim.com` is a proxied
Cloudflare zone, so the zone's own analytics count requests at the edge with no
beacon at all.

`Deploy Pages` asserts the beacon is present on the deployed page, so removing
Web Analytics from the Pages project would fail the deploy until
`scripts/verify-public-discovery.mjs` is changed to match.

## Service worker

`app/public/sw.js` is the retirement worker. On install and activation it takes
control immediately, deletes caches whose names begin with `sheepdog-sim-`,
claims current clients, unregisters itself, and registers no fetch handler, so
requests always use the network and the normal browser cache. Do not reintroduce
a caching service worker or a Vite plugin that writes one.

## Backend boundary

The Worker is deployed separately by `Deploy Worker`
(`.github/workflows/deploy-worker.yml`), also manual and also pinned to an exact
SHA, and it deploys without migrations. The client uses only the documented
identity and score REST routes. Worker deployment, smoke proof and rollback are
documented in `docs/operations/solo-times.md`.
