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
- Multiplayer and the 5,000-sheep player path are absent from the version 3
  client. Solo-time boards use only the isolated `field-v3` partition.
- Solo times are reachable from the title screen and after a completed run.
  No name entry is required: the service assigns a random running name unless
  the player chooses Edit, and the board read path does not require identity.
- Version 3 is live at `https://sheepdogsim.com`. `release.json` is the
  authority for the exact deployed source commit and artifact digest; it
  currently reports `1dbd01507eec15eabf31486e2a8b78909a26abc5`, built
  2026-10-16, 34 files and 8,420,670 bytes - the same file count and size
  `npm run probe:release` measures locally.
- The production Worker was deployed first without a D1 migration. Health and
  all three `field-v3` leaderboard read paths returned HTTP 200 before Pages
  was cut over.
- Player-facing branding is `Sheepdog Sim`. The `3.1.0` number is retained only
  in package, migration and release records.
- One workflow deploys the client, to the `sds-frontend` Cloudflare Pages project
  that serves `sheepdogsim.com`. The project name, the undisableable
  `sds-frontend.pages.dev` hostname, the two stale GitHub environments and the
  separate Worker origin are explained in `docs/operations/deployment.md`.
- The owner selected the CC0 Fox Trees Pack Round and Spreading hybrid for the
  shipped treeline. The final field contains 139 trees outside the fence, no
  understory shrubs and no exposed root runs.

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

The sequence the owner chose, recorded so it is read rather than re-derived.
The decisions below were taken with the owner on 2026-10-16 and are not open.
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
  deleting the route. Configuration stays in `worker/wrangler.toml` for this
  release. The `cf` CLI's `cloudflare.config.ts` is Release 2 work: `cf` is a
  beta that rebuilds the project shape and does not run this repository's build
  script, and that must not land in the same change as a live hostname cutover.
- The v2 `RoomDO`, `LobbyDO`, `GameSim.js` and the `/r/:code/ws` upgrade leave
  `sds-worker` with a `deleted_classes` migration. `spec/03` builds rooms as a
  new Worker; the v2 code stays in history as reference for that rewrite.
- `PROD_SCORE_API_BASE` becomes same-origin and the CORS allow-list goes.
- The Web Analytics beacon moves into `app/index.html` with the token of the
  existing `sheepdogsim.com` site. `scripts/verify-public-discovery.mjs:105`
  requires it on the page, so it lands before the Pages toggle is turned off.
- One tag-triggered deploy ships client and API from one commit. Pull-request
  previews become version aliases on the preview Worker with its own D1, never
  version previews of production, which would share the production bindings.
- Dependencies go to latest stable on landing day, including the majors
  Dependabot never raised: ESLint 10, `@types/node` 26, wrangler and
  `@cloudflare/workers-types`. Batches per ecosystem, one commit each, taken
  locally rather than merged from Dependabot. The Three.js bump needs genuine
  WebGPU and forced-WebGL2 receipts. TypeScript 7 lands only if a supported
  linter pairing exists; otherwise the root aligns with the worker on 6.0.x and
  the TypeScript 7 pull requests close with that reason.
- The Kiln farmhouse is wired behind the shipped `Farmhouse` component and
  ships only if the hub receipt shows no load-time or frame-time regression on
  either backend. The desk figures - +2.07% bytes, +0.087% triangles, 6 draw
  calls against 40 - favour it and do not settle it. Not answered by
  performance: the procedural backdrop is keyed to `uv.x`/`uv.y`, which a baked
  mesh reconstructs only from world position, and
  `tests/treeline-assets.spec.ts:329` records the standing choice not to load
  GLBs at runtime, which shipping this reverses deliberately in its own commit.
- Hub timing runs once, at the end, before the tag: both backends, before and
  after, farmhouse in and out. Receipts go to `docs/history/status-log.md`.
- Cleanups: revoke the unused `BROWSERSTACK_*` repository secrets, delete the
  two stale GitHub environments, and turn off Web Analytics on the Pages
  project after the cutover is verified. Dashboard actions are done in the
  browser with the owner's approval at each one.

### Release 2 - one project, new score service, multiplayer foundations

- Adopt the `cf` CLI: `cloudflare.config.ts`, the Cloudflare Vite plugin, the
  Worker entrypoint imported into the one project, `worker/` as a separate
  package retired, the build and release-manifest steps re-homed.
- Rewrite the score service on `spec/03-multiplayer.md`'s one-table design,
  from migration 0001, with a data migration that preserves identities and
  `field-v3` times and is verified against production reads before cutover.
  `shared/` goes with it.
- Multiplayer foundations: the Durable Object placement decision recorded with
  its reasoning, room D1 migration 0001, and a CI-tested realtime skeleton on
  `/r/*`. Not deployed unless the owner says otherwise.

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
