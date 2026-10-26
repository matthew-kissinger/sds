# Sheepdog Sim 3 release status

This file is the current state: what is live, what the last candidate changed,
and what is still open. The chronology is in `CHANGELOG.md`. Closed candidate
reports and release evidence are in `docs/history/status-log.md`, and closed
investigations are in `docs/history/`.

## Production state

- Version 3 client source, deterministic simulation, procedural assets, tests
  and public documentation have been curated into the SDS release branch.
- Version 2 remains recoverable from the annotated `v2.6.4` tag, the pushed
  `release/2.x` branch at `d5c38469`, and immutable Pages deployment
  `https://7cea2cd2.sds-frontend.pages.dev`.
- Co-op, competitive and persistent multiplayer stats are live in 3.9.2. The 5,000-sheep player path remains
  absent from the shipped version 3 client. Solo-time boards use only the isolated `field-v3` partition.
- Solo times are reachable from the title screen and after a completed run.
  No name entry is required: the service assigns a random running name unless
  the player chooses Edit, and the board read path does not require identity.
- Version 3.9.2 (`6b2420f8`, tag `v3.9.2`; favicon fix, no gameplay change) is
  live at `https://sheepdogsim.com` since 2026-10-26 19:22 UTC (`Deploy` run
  40385417951; `release.json` is the authority for the exact deployed commit),
  served by the `sds-worker`
  Worker. Every finished change is merged and deployed for the owner to test
  in production (owner's rule, 2026-10-17).
  `sheepdogsim.com` is that Worker's Custom Domain since 00:49 UTC on
  2026-10-17, declared in `app/cloudflare.config.ts`, and serves the game/API. Since 3.7.0, `sds-realtime` serves `/r/*`; the `sheepdogsim.com/*` route from the
  2026-10-16 cutover is deleted. `release.json` is the authority for the
  exact deployed source commit and artifact digest. `www.sheepdogsim.com`
  redirects to the apex at the zone edge.
- The `sds-frontend` Pages project is dormant and off the zone: its
  `sheepdogsim.com` custom domain was removed 2026-10-17, it serves 3.1.0 on
  `sds-frontend.pages.dev` only, and it is kept for the immutable v2
  deployment (`docs/operations/v2-rollback.md`).
- The Web Analytics site `sheepdogsim.com` is in snippet mode and is fed by the
  beacon every HTML page carries; Web Analytics on the Pages project is off.
- Player-facing branding is `Sheepdog Sim`.
- One `Deploy` workflow, on an annotated `v*` tag, builds the client, deploys
  the `sds-worker` Worker with the game as its static assets, and verifies the
  live manifest, origin and analytics (`docs/operations/deployment.md`). The
  dormant Pages project and its `sds-frontend.pages.dev` hostname are
  explained there too.
- The treeline is the Kiln oak since 3.4.0 (`TREE_SOURCE = 'kiln'`): one
  spreading oak authored in Kiln, instanced in 137 stands outside the fence,
  three draws, no understory shrubs and no exposed root runs.

## Last candidate - the asset polish pass, shipped 2026-10-16

The owner-directed pass that took the shipped assets to hero quality: the asset
lab, the grass regrade, the flock's wool and gait, the dog's contacts and sit,
the run clock, and the homestead's surface, fenestration and smoke. It also
added a walk-in farmhouse built with Kiln, which lives in the lab only and
reaches no production build.

Merged as PR #98 (27 commits, 101 files, +9,545 / -2,181) and deployed to
production the same day. Evidence at the merge: 940 tests in 113 files, build
2,286.69 kB raw and 637.46 kB gzip, `npm run probe:release` exit 0, and a hub
receipt showing no frame-time regression on either backend with startup down
1,244 ms on WebGPU and 2,508 ms on WebGL2.

The full report, its measurements and the two limits on what the hub receipt
settles are in `docs/history/status-log.md`.

## Master plan - agreed 2026-10-16, decisions settled the same day

### Owner-directed multiplayer history and stats - 2026-10-21

The owner authorized persistent match history, player stats and an owner
dashboard, separate from solo scores. This release adds lifecycle records
in RoomDO storage, retry-safe export to a new multiplayer-only D1, private
player history and a read-only owner dashboard at `/r/owner`. No leaderboard,
new asset, simulation change or solo migration is included.

Local implementation, production-build browser flow and separate UI review
passed; [candidate evidence](docs/history/status-log.md#multiplayer-history-and-owner-dashboard---2026-10-21-local-candidate)
records the checks. [PR #145](https://github.com/matthew-kissinger/sds/pull/145)
tracks the candidate and CI result. The owner explicitly authorized database
and key setup, merge and deployment on 2026-10-21. OAuth refresh restored actual
D1 access. The separate `sds-multiplayer` database is created and its `MATCH_DB`
binding is committed for the 3.9.0 candidate. The migration is applied and the
owner secret is configured, with a Windows-encrypted local backup.
Shipped as 3.9.0 through PR #145. The exact-commit workflow, returning identity,
live two-player history and owner dashboard passed;
[release evidence](docs/history/status-log.md#release-390---2026-10-21-multiplayer-history-live).
Setup is described in
[the operations note](docs/operations/multiplayer-history.md).
Retention is initially indefinite, with
no automatic deletion; records begin at enablement and cannot backfill old
rooms. This reversible initial policy is flagged for owner review.

### Owner-directed gate fix - 2026-10-20

Shipped as 3.6.1 through PR #142. The simulation pen threshold now aligns with
the visible opening, preserving fence/floor appearance and existing `field-v3`
records. This intentional gameplay correction limits comparison with older
times. Exact-commit CI, live identity, both renderer smoke checks, full-run
functional evidence and hub measurements are recorded in
[Release 3.6.1](docs/history/status-log.md#release-361---2026-10-20-gate-passage-live).
Startup still misses the two-second target; physical-device evidence remains
open. Local multiplayer foundations are now open as described below.

### Owner-directed competitive implementation - 2026-10-20

The owner authorized implementing the accepted layouts and rules after 3.7.0.
The candidate adds 2/3/4-player square/hexagon/square fields, per-pen banked
scores, forfeit-and-continue, shared ties, and explicit no-winner closure.
Competitive terrain is level with symmetric grass and distant reused oaks;
Classic camera/input bearing is fixed toward each player's pen. Solo retains
its original field, input basis and deterministic traces. No new asset is needed.
Shipped as 3.8.0 after explicit owner deployment approval. Both Workers use
protocol/storage 3 and the same tagged SHA; no player rooms were occupied
during cutover. Release evidence and remaining human fairness/device review:
[Release 3.8.0](docs/history/status-log.md#release-380---2026-10-21-competitive-live).

### Owner-directed co-op release - 2026-10-20

Shipped as 3.7.0 through PR #143, with the live PC/hub flow and identity
continuity verified. The initial workflow check ran before the new route
propagated; all skipped live checks subsequently passed. Receipt:
[Release 3.7.0](docs/history/status-log.md#release-370---2026-10-21-co-op-live).

3.7.0 promotes the tested co-op slice to the main site, with one room per region
(NA/EU/APAC), up to four players, public/private invites and the existing solo
service. The tagged workflow deploys the game and separate `sds-realtime`
service from the same SHA. Production has no staging passcode or hourly cutoff.
Keep the existing identity database and signing secret. Competitive and broader
latency/device qualification remain follow-up work; a short live co-op check
and identity continuity check close this release.

### Multiplayer planning amendment - 2026-10-20

The owner initially authorized documentation only, then local foundations,
and subsequently the simplified isolated staging deployment after setup/cost
review. This cycle uses the approved $20 pilot budget. Production multiplayer
deployment is now explicitly authorized after the hosted PC/hub smoke passed.
[The multiplayer plan](docs/architecture/multiplayer-plan.md) and
[spec/03](spec/03-multiplayer.md) now cover regional public boards, private
invites, up to four people, host-controlled starts/rematches, co-op and
shared-flock competitive play with one pen per player. The planned service is
a separate realtime Worker, RoomDO per room and LobbyDO per region. Identity
and solo results stay with the existing Worker; staging is isolated.

This supersedes earlier placement ambiguity, the mandatory room-D1 foundation,
the single global lobby and the combined solo/co-op leaderboard proposal. The
solo score-service migration remains separate and must preserve newer shipped
history/card consumers. The owner authorized production promotion, its separate realtime Worker and
release workflow on 2026-10-20. No new asset is required. Spec/09 holds the future acceptance matrix; plan
D1-D7 tracks policy, measurement and setup decisions. The owner settled
competitive departure later on 2026-10-20: forfeit and continue, with a win by
forfeit when one competitor remains. The plan's "Settled decisions" records
dog removal, unchanged pens, retained banked sheep and later unclaimed entries.
Competitive scoring was also settled: finish the flock, highest eligible count
wins, shared ties. Q1-Q12 are answered in the plan: two ready players to start,
15-second reconnect grace, continuing co-op, reviewed symmetric layouts,
colour/labels/player icons, three regional boards, interruption after server
restart, measured transport tuning, PC/hub staging before geographic load,
estimate before provisioning/paid tests, waiting-only host removal, and neutral
gate guidance based on geometry regardless of dog or pen ownership.
Layout validation, measured budgets and geographic coverage
remain gates. The local service now runs authoritative co-op and the normal
client renders the shared field with up to four dogs. Invite/public lobbies,
ready/start, prediction/interpolation, reconnect, continue-on-leave, shared
completion and rematch are implemented locally. Run `npm run coop`; see
[scope, instructions and evidence](realtime/README.md). The production build
exposes both co-op and competitive as of release 3.8.0 above.
The owner approved the simplified [staging setup](docs/operations/multiplayer-staging.md)
and its $20 one-room pilot. Workers Paid is owner-confirmed. The October 20 read-only review
verified working Wrangler OAuth, the account, staging hostname vacancy and hub
reachability; billing allowances and Access enrollment remain unverified.
Hosted wrappers, passcode-cookie access and the server-enforced cutoff passed
local typechecks, bundle dry runs and 64 workerd checks. Staging source `cf15f61a`
is deployed at `staging.sheepdogsim.com`; the real PC/hub smoke passed invite,
start, movement/barks, snapshot agreement, reload and leave/continue. The window
closes October 20 at 10:42 p.m. EDT; [live receipt](docs/operations/multiplayer-staging.md#live-pilot-receipt-october-20)
records versions, access instructions, cleanup and limitations. No production change.
Full snapshots and fixed 100 ms buffering are local
pilot choices; delta/adaptive transport and all hosted/device/performance and
separate presentation-review gates remain open. No multiplayer release gate
is closed by local functional tests. Local implementation `7bded51f` passed
912 Node tests, 61 workerd checks, two/four-player browser flows and a live
25-sheep protocol completion/rematch. Full limits and build receipts are in
[the local validation note](realtime/README.md#playable-local-candidate-validation-2026-10-20).
The owner accepted the [layout review](docs/architecture/multiplayer-layouts.md)
direction on 2026-10-20: square / equal-area hexagon / square for two / three /
four players, with dogs starting 45 m from the centre opposite their own pens.
This selects the prototype direction and does not change the shipped game.
The history below retains its dates.

The sequence the owner chose, recorded so it is read rather than re-derived.
The decisions below were taken with the owner on 2026-10-16; the dated
multiplayer amendment above supersedes only the items it names.
Measured facts behind them are in `docs/operations/deployment.md`.

### End state

One Worker on `sheepdogsim.com` serves the game and `/api/*`, deployed by one
tag from one commit. The score service is a small identity-and-score Worker on
the one-table schema in `spec/03-multiplayer.md`, carrying every player's
`persistent_id`, secret, name and `field-v3` times across. The repository is
one project described by `cloudflare.config.ts` and built by the Cloudflare
Vite plugin. The v2 Durable Object code, the v2 `shared/` simulation, the
cross-origin API and its CORS list, the `pages.dev` hostname and the misnamed
analytics site are gone. The `sds-frontend` Pages project stays, dormant, for
the immutable v2 rollback deployment. Multiplayer has a recorded Durable Object
placement decision and a CI-tested skeleton on `/r/*`, with nothing live.

### Release 1 - 3.2.0: hosting, dependencies, farmhouse gate

- Hosting moves from the `sds-frontend` Pages project onto the existing
  `sds-worker`, which already holds `JWT_SECRET` and the `sds-db` binding, so
  no secret is copied and the silent re-register trap in
  `app/src/scores/controller.ts:39-41` cannot fire. Static assets from `dist/`
  with single-page-application fallback, `run_worker_first` on `/api/*`,
  `workers_dev = true` set explicitly, and a Worker route on
  `sheepdogsim.com/*`. Cutover by route, never custom domain; rollback is
  deleting the route. Configuration stayed in `worker/wrangler.toml` for this
  release and moved to the root in Release 2 Stage A. The `cf` CLI's `cloudflare.config.ts` is Release 2 work: `cf` is a
  beta that rebuilds the project shape and does not run this repository's build
  script, and that must not land in the same change as a live hostname cutover.
  Code merged 2026-10-16: assets block, route, `workers_dev = true`,
  same-origin client, beacon in `app/index.html`, one `Deploy` workflow,
  previews as version aliases on the preview Worker, and the runbook
  `docs/operations/worker-cutover.md`. Verified on the preview Worker with its
  own D1; production is untouched until the runbook runs. Two measured facts
  that shaped it: `wrangler versions upload` refuses a pending Durable Object
  migration, so step 1 is a `wrangler deploy`; and removing `[[routes]]` from
  the config does not remove a live route, so rollback is deleting the route.
  The CORS allow-list became a fixed `*` rather than nothing, because the
  already-built 3.1.0 client calls `workers.dev` cross-origin until the route
  lands and again on rollback; it goes in Release 2.
- The v2 `RoomDO`, `LobbyDO`, `GameSim.js` and the `/r/:code/ws` upgrade leave
  `sds-worker` with a `deleted_classes` migration. `spec/03` builds rooms as a
  new Worker; the v2 code stays in history as reference for that rewrite.
  Done 2026-10-16: 155 tests that covered the removed code went with it and 9
  were added, so the suite is 801 tests in 101 files.
- `PROD_SCORE_API_BASE` becomes same-origin and the CORS allow-list goes.
- The Web Analytics beacon moves into `app/index.html` with the token of the
  existing `sheepdogsim.com` site. `scripts/verify-public-discovery.mjs:105`
  requires it on the page, so it lands before the Pages toggle is turned off.
- One tag-triggered deploy ships client and API from one commit. Pull-request
  previews become version aliases on the preview Worker with its own D1, never
  version previews of production, which would share the production bindings.
- Dependencies: done 2026-10-16, all to latest stable, five batches plus the
  TypeScript alignment. TypeScript 7 did not land: the 7.0 package ships no
  compiler API and typescript-eslint 8.71.2 refuses it, so the root sits on
  6.0.3 with the worker and PRs #111 and #106 are closed with that reason.
  Three 0.186.1 needed no code change; WebGPU and forced-WebGL2 desk receipts
  match the previous build in draw calls and triangles. Desktop boot read
  about 300 ms slower on the desk, which only the hub can confirm or dismiss.
  Evidence in `docs/history/status-log.md`.
- The Kiln farmhouse loader is merged behind one build constant,
  `FARMHOUSE_SOURCE` in `app/src/scene/farmhouse/source.ts`, shipped as
  `procedural`. The weld adds zero draw calls, so the earlier "6 against 40"
  figure no longer applies. The visual comparison on the production build
  settled the open question against shipping it as baked: the bake carries
  none of the two surface channels the backdrop shader needs, so the loader
  guesses them from world height, and every roof below the main eave - the
  porch roof, fascia and rake boards - collapses to a flat slab. That is the
  defect. The standard is the house's own look in the game's grade against
  `spec/05`, judged by the owner on the production build; the procedural
  house is not the reference, its silhouette and worn, wavy wall surface were
  never the target, so losing its wing and lean-to is not a defect. The fix
  belongs in the Kiln recipe and the surface grade, not the loader, and is
  Release 2 work. Release 1 ships the code-built house.
  `tests/treeline-assets.spec.ts` now permits exactly one runtime GLB, the
  farmhouse, digest-checked against `assets/house/asset-manifest.json`.
- Hub gate passed 2026-10-16 on both backends: frame percentiles identical to
  3.1.0, zero frames over 100 ms, same tier, draws and triangles. It also found
  and removed a startup regression from `@react-three/fiber` 9.8's Suspense
  gating of async renderer factories, fixed in this repository's boot path
  rather than by pinning. The receipt and the bisect are in
  `docs/history/status-log.md`.
- Cleanups: revoke the unused `BROWSERSTACK_*` repository secrets, delete the
  two stale GitHub environments, and turn off Web Analytics on the Pages
  project after the cutover is verified. Dashboard actions are done in the
  browser with the owner's approval at each one.
- Cutover findings, 2026-10-16: the zone's automatic analytics injection does
  not run on Worker-served pages, so the snippet now sits in every HTML page
  and the discovery check requires it there; `www.sheepdogsim.com` had never
  had a DNS record, so it gets a proxied CNAME and a zone redirect rule to the
  apex, both verified by the deploy. Zone configuration is listed in
  `docs/operations/deployment.md`; the Release 2 end state is both hostnames
  as Worker custom domains, and the beacon injected once at build from one
  constant instead of spelled out in four pages.

- Release 1 close-out, decided 2026-10-16: tag `v3.2.0` on `b2420f66` after
  CI (done; the tag run could not publish the route because the old token
  lacked Workers Routes edit, so the owner created the scoped
  `sds-github-deploy` token and a dispatch re-run of the same commit went
  green end to end - Release 1 closed 2026-10-16); the two production test players from the identity checks deleted (both
  had no submissions); the misnamed Pages analytics site was removed by
  Cloudflare itself when the Pages toggle went off; the deploy API token's
  scopes stay as they are. No upstream issue is filed for the fiber 9.8
  startup cost: the owner would rather have the renderer boot architecture
  reviewed adversarially from first principles than spend time proving a
  library bug, and that review's result is recorded in `docs/history/`.

### Release 2 - one project, new score service, multiplayer foundations

Order as decided 2026-10-16, then amended the same evening when the owner
asked for the Kiln work to start in parallel with the `cf` step: Stage A of
the `cf` step (done, 3.2.1), the Kiln farmhouse and barn (in flight, each
its own pull request, each gated by the owner's look review and a hub
receipt before its constant flips), a release carrying the homestead, then
Stage B of `cf`, declarative hosting with the Pages retirement, the score
service, and the multiplayer foundations. Orchestrated in the same session as
Release 1.

**Where it stands, 2026-10-16 evening.** Done: Release 1; Stage A live as
3.2.1 with the live settings diffed; the lab's WebGPU boot error fixed at its
cause (the lab now gates its loop on renderer stage and `sceneReady` as the
game does; `docs/history/status-log.md`); the surface atlas spike concluded
(below). Merged: pull request 121 (Kiln farmhouse channel contract, floor one step
above the pad, grass hard-cut under the footprints that ship, the outline
hull fitted to the Kiln eave; merge `00fdc295`, 2026-10-16). The Kiln house
then passed the owner's look review on the production build and the hub
receipt (twelve 60 s runs, both backends, both cameras, the homestead in and
out of frame: identical percentiles, zero frames over 100 ms, no added draws;
`docs/history/status-log.md`), and `FARMHOUSE_SOURCE` is flipped to `kiln`
with its grass rebake. The Kiln barn followed the same evening: merged behind
`BARN_SOURCE` (pull request 123), the owner's look review passed on the
production build together with a house fix (no window over the door), its
hub receipt passed (twelve runs, same shape), and the flip merged (pull
request 125, `e3642877`). The whole homestead is Kiln and live as 3.3.0
(`6a605e16`, tag `v3.3.0`). Open from the barn review: the slate course
wander (owner's call, see the status log). Stage B was then attempted on the
preview Worker and its four checks passed, and the same pull request carried
the production cutover, which the owner approved and which is merged (pull
request 126, merge `37154931`, Client CI green on it; below). Declarative
hosting was then planned, rehearsed on `stage.sheepdogsim.com` and, on the
owner's choice of the Custom Domain path, shipped as 3.3.1 on 2026-10-17:
the apex is a Custom Domain of `sds-worker`, the tag was the first `cf`
production deploy, the Pages custom domain is gone. 3.3.2, the same night,
deleted the Release 1 route and dropped `triggers` from the config, so the
repository now declares every hosting fact it owns
(`docs/operations/declarative-hosting.md`, "Production results";
`docs/history/status-log.md`). Next: the score service.

The `cf` step is two stages, decided 2026-10-16 on the planning review.
Stage A: one root package on the stable Cloudflare Vite plugin, `worker/` a
plain directory, one `wrangler.toml` at the root with the preview D1 id
committed, the release manifest written by a Vite plugin into the uploaded
directory, the client kept at `dist/`, `vite dev` serving game and API with a
local D1 and no proxy, the workflows deploying with wrangler from the root.
Stage A ships alone as 3.2.1, whose only client change is the two renderer
fixes.

**Stage A is merged and live** (pull request 117, merge `58f2be74`; tag
`v3.2.1` on `c5964ff2`, Deploy run 38957976689 green, 2026-10-16). The plugin forces the client to `dist/client`, always emits
`dist/.assetsignore`, and writes its deploy redirect under the Vite root
`app/`, where wrangler will not follow it; the measurements, the artifact
digest comparison and the decisions that followed are in
`docs/history/status-log.md` (Release 2 Stage A). 3.2.1 carries the build
restructure and the two renderer fixes, so its artifact differs from 3.2.0's
by those fixes alone (34 files, 8,501,460 bytes, sha256 `83db6d44...`, the
digest measured before the tag). The first production deploy from the
generated file was the check that wrangler publishes the same route, bindings
and migrations: the live Worker settings read before and after differ only in
`modified_on`. Rolling back to the 3.2.0 commit dispatches `Deploy` at the
`v3.2.0` ref.

Stage B: `cf` and
`cloudflare.config.ts`, attempted on the preview Worker only, and cut to
production only if four checks pass (identical asset set and headers, identical
bindings and route list, the Durable Object migration tag untouched by a
wrangler deploy of an older commit and a rollback across the change, preview
aliases still working); any failure, or a change in either beta between the
preview and production steps, keeps production on Stage A. The planning
review's reasons: `cf` is beta and only accepts the Vite plugin's v2 beta;
its `exports` map replaces the migrations array and is documented as one-way
once deployed; and `cf deploy` provisions missing resources by default.

**Stage B's four checks passed on the preview Worker, 2026-10-16, and the
cutover is merged** (pull request 126, merge `37154931`, the owner's go the
same evening; the measurements are in `docs/history/status-log.md`, Release 2
Stage B). `cf` 1.0.0-beta.18 and the
Vite plugin 2.0.0-beta.v.1 built the same artifact as Stage A (digest
`2b64a94f...`), and the pull request's own Preview run uploaded the `pr-126`
alias and deployed to `sds-worker-preview` with `cf`: the served asset set,
headers and bodies are identical to the Stage A baseline except
`release.json`'s commit; the versions' bindings, runtime and `migration_tag`
(`v2`) are identical and the zone's route list is unchanged; a wrangler
deploy of the older Stage A build and a wrangler rollback across the `cf`
deploy both left the tag at `v2`; and every earlier alias still answers. Two
costs the attempt measured, both in the status log: the plugin reads
`cloudflare.config.ts` from the Vite root only, so the file lives in `app/`
and `cf` runs from there; and the plugin forces the build to
`app/.cloudflare/output/v0`, so `dist/` and the generated `wrangler.json` are
no longer written, which means the branch cannot deploy production with
wrangler. Merging it is therefore the cutover, and the pull request is now
that cutover, prepared the same evening: `deploy.yml` deploys the Build
Output with `cf deploy --prebuilt --no-provision` from `app/` after the same
gates as before plus a dry run, and refuses a commit without
`app/cloudflare.config.ts`; every reader of `dist/` (the verifiers' defaults,
the probes, `vite.config.ts`, the hub copy step) takes the path from
`scripts/build-output.mjs`; `docs/operations/deployment.md` describes the
`cf` path, and its Rolling back section says what still reaches an older
release: `wrangler rollback <version> --name sds-worker` (or `cf workers
deployments create`) for any version from Release 1 on, and `gh workflow run
deploy.yml --ref <tag>` for a commit built for an earlier deploy path, since a
dispatch takes the workflow file from `main`. `wrangler.toml` stays while a
rollback to a wrangler-built release (3.2.1 to 3.3.0) is wanted, held equal
to the cf declaration by `tests/worker/cloudflare-config.spec.ts`; it and
that test go together when that is no longer true. The production dry run
passed locally with the same artifact digest as 3.3.0. Merged `37154931`:
the next tag deploys with `cf`, and nothing changes on the live Worker until
then. A change in either beta before that tag reopens the checks.

From the renderer boot review
(`docs/history/renderer-boot-review-2026-10-16.md`), done 2026-10-16: the
asset lab mounts its scene on `rendererReady()` and holds its loop paused
until the scene is ready, exactly as the game does (the bisect of the lab's
WebGPU error, same day, found the imperative pause alone insufficient:
fiber's `setFrameloop('never')` leaves queued frames to run), the factory
memo is gone, and spec/01's stack table and renderer section state the
shipped contract. Tone mapping: fiber's first configure has set
`ACESFilmicToneMapping` over the factory's `NeutralToneMapping` since 3.1.0,
so the approved look was always ACES; the owner kept it and the factory no
longer claims Neutral.


- Adopt the `cf` CLI: `cloudflare.config.ts`, the Cloudflare Vite plugin, the
  Worker entrypoint imported into the one project, `worker/` as a separate
  package retired, the build and release-manifest steps re-homed.
- Rewrite the score service on `spec/03-multiplayer.md`'s one-table design,
  from migration 0001, with a data migration that preserves identities and
  `field-v3` times and is verified against production reads before cutover.
  `shared/` goes with it.
- Kiln farmhouse: `assets/house/farmhouse.kiln.js` is the owner's own authored
  walk-in design (2026-10-15: door on hinges, porch, deep reveals, hall,
  fireplace and stair), deliberately not a match for the old procedural house,
  and it stands as authored. The work is the contract, not the design: amend
  the recipe so the bake writes the backdrop shader's two per-vertex surface
  channels from its own authoring data, make the loader read them and fail
  loudly without them, and fix only defects in how surfaces map onto the
  authored geometry. The collapsed porch roof and fascia seen in Release 1
  were that design rendered wrong by the missing channels. Grading is the
  owner's review of the correctly rendered house in-game against `spec/05`,
  never parity with the old house. Re-bake, flip `FARMHOUSE_SOURCE`, and gate
  on the hub. Kiln friction is logged as classified dogfood feedback.
  **Shipped** (pull request 121 merged 2026-10-16, look review passed, hub
  receipt passed, constant flipped to `kiln` with the grass rebake the same
  day): the recipe writes the two
  channels into `TEXCOORD_0` and records it in the root node's extras, the
  loader reads them and refuses a bake without them, the hall floor stands
  0.15 m above the pad with step, thresholds and a new back-door sill moved
  with it, and `tools/bake-grass.mjs` reads the plan and the source constant
  to hard-cut the footprints of the buildings that ship (a flip now requires
  a grass rebake, enforced by `tests/grass-bake.spec.ts`). The outline hull
  fix is in: `RoofSpec` takes an eave depth and a bow, and `KILN_ROOF` (a
  hand copy of the recipe's roof that had drifted) now lands its eave on the
  slab's lower outer corner, so no ledge hangs under the eaves; a test holds
  the envelope inside the baked slab. Follow-up: the recipe writes the slab's
  eave and verge corners into the GLB extras beside `surfaceChannels` and the
  envelope is derived from them rather than copied. The hub probe gained
  `--drive=homestead` for this receipt, because the default input never has
  the buildings in frame; `docs/art-review.md` says when to use it.
- Kiln barn, right after the farmhouse (added 2026-10-16; the status log had
  recorded "the barn has had no equivalent of the Kiln treatment" and the plan
  had left it out): a second recipe under `assets/barn/`, baked with the same
  per-vertex surface channels the farmhouse fix establishes, welded into the
  same board, roof and opening buffers so the draw count does not move, graded
  in-game by the same standard, Kiln feedback logged the same way. **Shipped**
  (pull request 123 merged, look review and hub receipt passed, `BARN_SOURCE`
  flipped to `kiln` in pull request 125, all 2026-10-16): a three-bay
  threshing barn under a gambrel, its cart doors open onto a dark interior, a
  hay door under a hood, a lit loft window and a cupola; 2,350 triangles, no
  added draws, no textures, standing in `BARN`'s box on `BARN_AT`. The bake
  also writes its outline envelope and ground footprint into the GLB extras,
  and the game derives the barn's outline from them. The grass bake reads
  `BARN_SOURCE` and cuts the barn's footprint. Its floor takes the same step
  above the pad. `docs/history/barn-kiln-2026-10-16.md` has the design, the
  numbers and the Kiln feedback. Open: the slate course wander on its long
  pitches (owner's call; it is the shared slate graph's), and folding the two
  Kiln loaders into one with the house's envelope written by its bake.
- Kiln oak for the treeline (added 2026-10-17 at the owner's request: a
  performant, painterly oak, one tree type and one variant for now).
  **Live in 3.4.0** since 2026-10-17 14:38 UTC: merged as pull request 133, then flipped in its own
  commit on the owner's go after the look review ("I think we should commit,
  push, and deploy and have the kiln oak as its default"):
  `assets/treeline/kiln/` bakes one spreading oak that the treeline instances
  in all 139 stands, `TREE_SOURCE` (`app/src/scene/treeline/source.ts`) is
  `kiln`, and the procedural oak stays behind it. Still three draws; 10,249
  triangles a tree and 1,424,611 across the field against the procedural 924
  and 128,436; no textures, transparency or added passes; the painting is in
  the two materials (`treeline/kilnTreeMaterials.ts`). A separate critic's
  verdict on the production captures was ITERATE, escalated to the owner, who
  adopted its first note (the crown lit as one mass) and had the far crown
  warm toward the haze, both the same day (open questions). The hub receipt
  on both builds, both backends, at the desktop viewport and the phone
  viewport's low tier, found no frame-time regression and the same draws:
  the GPU busy about 3 to 4 points more at the high tier and 0 to 2 at the
  low, warm boots unchanged, and a cold WebGL2 boot at the high tier about
  0.4 s slower. **Cost trim in review** (2026-10-17, branch
  `release2/oak-cost-trim`, not deployed): the bake leaves out the faces no
  viewer can see, 9,885 triangles a tree from 10,249 (the 364 left out are
  wood inside the crown), with no visible change, the same frame times and
  still three draws. The two materials already compiled during loading, in
  the scene-ready gate. The brief's 5,000 to 6,000 needs coarser crown
  clusters, whose facets show on the outline (open questions). Open: the
  owner's test on a physical phone in production, and a low-tier bake if a
  phone needs one. The status log entries "Kiln oak cost trim -
  2026-10-17", "Kiln oak hub receipt - 2026-10-17" and "Kiln oak -
  2026-10-17" have the numbers, the decisions, the critic's notes and the
  Kiln feedback; `assets/treeline/kiln/README.md` documents the asset.
- Surfaces stay procedural (decided 2026-10-16 on a measured spike,
  `docs/history/spike-surface-atlas-2026-10-16.md`, branch
  `experiment/surface-atlas`, pull request 122, not for merge). The owner
  asked whether procedural textures and atlases would be smarter for the
  barn, house, fence, gate and trees. One barn wall was built three ways in
  the lab: TSL per pixel, the same surface from a KTX2 atlas, and the atlas
  with painted extras. Same picture at 90 m and 20 m; a third to a sixth of
  the edge energy at 3 m and 1.5 m; no draw call saved; one texture binding,
  5.6 to 22 MB of GPU memory and a boot decode added; the painted detail
  invisible beyond 3 m; and every geometry-dependent term (eave band, damp
  course, slate courses) has to stay in the shader anyway. Richer surfaces
  come from the TSL materials, which the barn work extends.
- Multiplayer foundations: superseded by the 2026-10-20 planning amendment and
  `docs/architecture/multiplayer-plan.md`. RoomDO storage serves rooms; D1 is
  introduced only with an approved multiplayer result-query consumer. No
  skeleton implementation or deployment is currently authorized.
- Hosting made fully declarative: with Pages retired, `sheepdogsim.com`
  becomes a Worker Custom Domain declared in `app/cloudflare.config.ts`, so
  the deploy creates its DNS record and certificate; the route goes in the
  release after. **Amended 2026-10-16 in the plan
  (`docs/operations/declarative-hosting.md`): `www.sheepdogsim.com` stays a
  proxied placeholder record with the zone redirect rule, which is
  Cloudflare's own recommendation for a redirected hostname, rather than a
  second Custom Domain.** The plan's sources: a Custom Domain is refused on
  a hostname with a CNAME by default, but wrangler's and `cf`'s deploy code
  set the override flags themselves when there is no TTY, so the first tag
  after `domains` reaches `main` replaces the apex CNAME without asking; the
  route keeps precedence until it is deleted, so the sequence is gapless;
  deploys do not delete undeclared routes; a Custom Domain's certificate is
  not deleted with it; and the v2 rollback changes shape (the Pages custom
  domain goes; v2 stays at `7cea2cd2.sds-frontend.pages.dev`). The owner
  accepted the amended end state for `www` and approved the rehearsal, run
  2026-10-17 on `stage.sheepdogsim.com` with the preview Worker (results in
  the runbook): the deploy **refuses** a hostname with a record of ours, so
  the apex CNAME must be deleted before the domain is published and there
  is a gap, seconds if the domain is published from this PC right after the
  deletion, 66 s if the tag does it, with a 30-minute negative-cache tail;
  the record `cf` creates is a proxied `AAAA 100::` placeholder owned by
  the domain; the certificate is Google's, allowed by CAA, and its pack
  includes the apex; an undeclared domain stays; removing the domain removes
  its record and certificate. **The owner's remaining decision:** the
  Custom Domain path as planned (the deploy owns the apex record, a gap of
  seconds), or the placeholder path the results opened (edit the apex CNAME
  in place to `AAAA 100::` proxied, keep the route, remove the Pages custom
  domain: no gap, the record stays a zone setting like `www`'s). The owner
  chose the Custom Domain, 2026-10-17: it was the plan's end state, the
  route was Release 1's cutover device, and a placeholder would be a stopgap
  replaced later at the same cost. Release 3.3.1 shipped it 2026-10-17: the
  apex CNAME deleted by hand, the Custom Domain added in the dashboard 80 s
  later, the tag the first `cf` production deploy, the Pages custom domain
  removed after it (`docs/history/status-log.md`). One finding against the
  plan: for about two minutes the apex answered from Pages, not the Worker,
  while the Pages custom domain was still attached; a hostname should leave
  Pages first. 3.3.2 deleted the route the same night.
  The three static pages becoming Vite entries with the analytics snippet
  injected from one constant stays a separate item.

### Standing rule

A v2 remnant or a stale pattern found along the way is re-architected to the
current standard in service of the version 3 build, not patched. Scope changes
and deploys remain the owner's call and are surfaced before they are made.

## Direction changes

Owner-ordered changes that override an earlier specification line. Four files
cite this section by name: `sim/BarkImpulse.ts`, `sim/tuning.ts`,
`tests/bark.spec.ts` and `tests/helpers/traces.ts`. The section did not survive
the clean-room import into this repository and was restored on 2026-10-14 from
the record those files carry.

- **Sheep grass footprint, 2026-10-15.** The owner's observation was that a
  sheep's impact on the grass reaches too far forward and back for how long a
  sheep is. It did, by a factor of two. The footprint rect ran 1.68 m of
  half-length against an animal `sheepGeometry.ts` states at 1.67 m nose to
  tail, so with `INTERACTION_RADIUS` and `falloff` the pressed region reached
  2.40 m fore and aft of a body that ends at 0.78 m: more flattened grass past
  the nose than the whole sheep is long.

  The dog is the thing that shows what the rule was meant to be. Its footprint
  IS its body's half-extents - 1.16 against the 1.173 that `dogParts.ts` SPINE
  lofts, 0.48 against its widest 0.45 - with `falloff` as the soft edge
  outside. The sheep missed that rule because `SHEEP_SCALE` was authored above
  one, on the written premise that "a sheep is wider and longer through the
  wool than a collie is through the ribs". This game's meshes say otherwise:
  the collie is 2.35 m by 0.90 m and the sheep 1.67 m by 0.84 m, so the dog is
  the bigger animal and the scale belonged below one. The old comment hid the
  error by comparing unlike things, a half-width against a collision radius
  but a half-length against a full body length.

  `SHEEP_SCALE` is now x0.93 / z0.71, which lands the sheep on the dog's two
  ratios: 0.824 against 0.835 along, 0.446 against 0.42 across. `spec/06` is
  amended in the same change. Presentation only - `interactionField.ts` is in
  `app/src`, `sim/` cannot import it, so no trace fixture moves and no
  `field-v3` time becomes incomparable. The reach a body files into the lookup
  grid falls from 2.40 m to 1.52 m, which is strictly less work.

  The test that should have caught this asserted the premise instead of
  measuring it: "a sheep is wider and longer than a collie, or the scale is
  upside down". It was upside down, and the assertion held the error in place.
  It now derives the dog's half-extents from the SPINE table and requires each
  footprint to sit within a tenth of its own animal.

  Evidence, this workstation, the functional lane: lint, `typecheck` and
  `typecheck:lab` clean. 905 tests in 112 files, all passing - 904 before, plus
  the one added here. Build exit 0, 2,277.14 kB raw and 634.68 kB gzip against
  2,277.11 and 634.68 before: 0.03 kB raw and nothing gzipped. Release
  hardening probe exit 0, player page params still exactly `debug` and `seed`,
  client secret scan clean. Before and after at the Sheep frame are in
  `captures/sheep-footprint/`. No hub timing.

  A worktree note, since it cost a false failure here: `assets/audio/licensed/`
  is gitignored, so a fresh worktree has none of it, and both
  `audio-manifest.spec.ts` and `tools/release-hardening-probe.mjs` fail on the
  missing `birds-loop.flac` until the directory is copied across from a
  checkout that has it. Neither failure is a code defect.

- **Bark redesign, 2026-08-21.** sds's bark reached 24 m through a 100 degree
  cone and expired in 36 ticks, which made it a nudge rather than a verb: a
  player could bark into a spread flock and watch four sheep drift a metre. The
  geometry, magnitude, duration and cooldown were all retuned and a startle
  ripple was added. The shipped values and the reason each one moved are in the
  table in `sim/tuning.ts`; `spec/02-sim.md` carries them as the contract. The
  bark-scatter trace fixture was regenerated as part of that decision, which is
  the one sanctioned reason to regenerate a fixture. The implementation is
  current and is not under review in the asset polish pass.

## Open questions

- Multiplayer phase 7 has an approved design and local foundations in progress;
  staging and production are authorized (see the amendment above).
  Competitive forfeit-and-continue and finish-the-flock/highest-eligible/shared-
  ties scoring and Q1-Q12 policies are settled in the plan. Remaining gates:
  validation of accepted competitive layouts under neutral guidance, measured region coverage, numerical
  network/server budgets, staging estimate and any new asset proposal.
  Reversible local defaults awaiting staging evidence: 10-second admission and
  start deadlines, two-minute empty-room cleanup, six-hour room lifetime,
  30/60-second directory refresh/lease, and lobby traffic/ACK limits documented
  in `realtime/README.md`. These are not the final gameplay transport budgets.
  Hub SSH was reachable on 2026-10-20 during gate-fix validation; this does not
  qualify multiplayer latency, physical devices or hosted capacity.
  Grow your flock stays deferred phase 9 in `spec/10-roadmap.md`; opening it
  amends its own `spec/00` cut-list items. NPC fill is outside multiplayer scope.
  Score cards shipped as 3.6.0. The contract is `spec/14-score-cards.md`.
  Evidence is `docs/history/status-log.md`, "Release 3.6.0".

- Kiln fence/homestead release 3.5.0: owner approved shipping on 2026-10-17.
  Shipped in pull request 140, live at 6e8b4ff5. Captures confirm three fence draws; real herding
  completion/replay passes; quiet-hub frame percentiles match 3.4.1 on both
  backends. Owner-approved material look retained; physical-device, cold-start
  and recorded-motion art limits remain open. Full preflight evidence:
  `docs/history/status-log.md`, "Release 3.5.0 preflight".

- The Kiln oak's remaining notes (2026-10-17; the owner approved the look and
  shipped it as 3.4.0, so these are refinements, not gates). A separate critic scored the production captures
  ITERATE and, past the fifth iteration, escalated: the crown was a pile of
  spheres, each lobe lit as its own, where the reference paints a few big
  masses lit as one shape. The owner adopted its first fix the same day, the
  crown lit as one mass (`CROWN_WEIGHT` 0.75 in
  `treeline/kilnTreeMaterials.ts`), and had the far crown warm toward the
  haze; both are in, recaptured, and the critic has not re-scored them. Its
  other notes are open: a middle and a deep palette stop, crisper dabs, a
  stronger glow into the sun and three lobe sizes in the recipe. The lobe
  sizes and the crown's proportions (about 1.45:1 against the reference's
  1.9:1) change the silhouettes the iteration-3 review kept, so they are the
  owner's call. Also open: where the first reference image came from, and
  how a physical phone takes the low tier, whose GPU draws three fifths more
  triangles and which, on WebGL2, compiles the two materials cold on a first
  visit; the hub receipt ran the phone viewport's low tier on desktop
  hardware. The first reference image is the owner's, attached in the
  session that commissioned the oak. Art: owner approved. Physical phones:
  the owner tests in production. The cost trim (pull request 136, merged
  untagged, released as 3.4.1) took the oak to 9,885 triangles a tree
  with no visible change. The owner kept the full crown (2026-10-17) and held
  the coarser bake as a phone low-tier option only: `DETAIL.frequency`
  starting at 2 and a 0.6 m edge give 5,730 triangles a tree, whose outline
  turns faceted from 12 to 34 m (status log, "Kiln oak cost trim -
  2026-10-17"). It would ship as a second, low-tier bake, still three draws,
  only if a physical phone shows the treeline too heavy.
- Whether to collapse the Pages project and the score Worker into one Worker
  serving static assets and `/api/*` on `sheepdogsim.com` alone. The present
  split works, but the repository asserts invariants it does not own - the
  analytics beacon is injected by a Pages dashboard toggle and then required by
  `scripts/verify-public-discovery.mjs`, so flipping that toggle fails a deploy
  for a reason no file records - and `deploy.yml` and `deploy-worker.yml` each
  take their own SHA, so nothing makes the client and its API one release.
  Measured during the 2026-10-16 alignment pass: the cutover needs no downtime,
  because a Worker route takes precedence over a Pages custom domain and rolls
  back by deleting the route; `_headers` and `_redirects` are supported
  natively; a player's name is a JWT in `localStorage` on the game's origin and
  their times are in D1, so neither moves. Not urgent, and nothing is broken.
  The reasoning, the staging and the three traps found while measuring are in
  `docs/operations/deployment.md`.
- Whether to build the grass on `threejs-field-grass`. The owner's condition is
  that it be at least as performant as what ships. It is not, yet, and the
  reason is narrow: only the interaction field differs, and it trades GPU work
  for a constant CPU and upload cost sized for a 100 m demo field. Everything
  else is equal or better. The gate and the one-way direction of adoption are
  in `spec/13-asset-lab.md`; the deciding measurement is a hub run, not a
  desktop reading.
- ~~Whether to adopt `math` from pmndrs for leg IK.~~ Closed on 2026-10-15, not
  adopted. Every leg chain here is two bones, where the closed form is exact in
  one step and an iterative solver can at best converge toward it, so FABRIK
  cannot be "visibly better, not merely equivalent" as its own gate in
  `spec/13-asset-lab.md` requires. The reasoning and the sheep's new solver are
  in the asset polish pass above. Reopen it if a three-bone chain is ever
  authored.
