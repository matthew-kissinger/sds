> **Archive.** Closed candidate reports and release evidence, moved out of
> `STATUS.md` so that file can hold the current state. Entries are in the order
> they were written, newest first; the archive was started on 2026-10-14. Nothing here is current direction:
> `STATUS.md` is the current state and `CHANGELOG.md` is the chronology.

# Status log

## Release 3.3.2 - 2026-10-17, the route deleted, the Custom Domain alone serves `sheepdogsim.com`

The owner: "Do this task here: Release after 3.3.1: delete the route, drop
triggers", then "Yes: when pull request 131 is green, delete the
sheepdogsim.com/* route in the dashboard, verify, merge, tag v3.3.2, verify
and record." Steps 3 and 5 of `docs/operations/declarative-hosting.md`,
which is now complete. Times UTC, 2026-10-17.

- Pull request 131 (`release: 3.3.2`, branch `release2/drop-route`):
  `triggers` out of `app/cloudflare.config.ts`, `[[routes]]` out of
  `wrangler.toml` (whose header now says what still reads it: the D1 scripts
  and the tags before the `cf` move), `verify-deploy-config.mjs` failing a
  route on either Worker, the three configuration specs pinning it,
  `deployment.md`, `v2-rollback.md`, the multiplayer spec's routing note and
  the deploy workflow's comments following. Locally: worker typecheck, 861
  tests, build, `verify-deploy-config.mjs --cf` reading `triggers [],
  domains ["sheepdogsim.com"]`. Client CI and Preview green.
- Route `sheepdogsim.com/*` removed in the dashboard (Workers & Pages >
  `sds-worker` > Domains > Remove) at 01:11:04, a click in the owner's
  Chrome session; the zone's route list read empty at once. Live right
  after, with 3.3.1 still deployed: six of six requests the Worker's 3.3.1,
  `verify-release-manifest --url`, `verify-worker-origin` on the apex and
  on `workers.dev`, and `verify-public-discovery --require-analytics` (the
  `www` redirect included) all passed. Deleting the route changed nothing a
  player sees, as the plan said it would once the Pages custom domain was
  gone.
- Merged `14bdc70a`; tag `v3.3.2` pushed 01:11:46; `Deploy` run 38989814766
  green at 01:14:53, every step. `cf deploy` listed `workers.dev` and
  `sheepdogsim.com (custom domain)` under the deployed triggers and no
  route; version `55b517c1` (`source: cf_cli`) live at 01:14:44; the four
  live verifiers passed; `release.json` reads 3.3.2, `14bdc70a`,
  `sourceRef v3.3.2`. Afterwards the zone still has no route, the Custom
  Domain is `enabled`, the apex `AAAA 100::` record and the active Google
  certificate pack are unchanged.
- Measured on the token: a deploy that declares no route passed with the
  `sds-github-deploy` policy unchanged, so the Workers Routes permission was
  not needed for the Custom Domain publish; the row stays in the table until
  the next rotation, when it goes.
- The zone now holds exactly what the plan's end state names: the apex
  record and certificate the deploy created, the `www` placeholder record,
  the redirect rule, the Web Analytics mode, and the CAA and mail-hardening
  records. The repository declares every hosting fact it owns.

## Release 3.3.1 - 2026-10-17, the apex is a Worker Custom Domain, the first `cf` production deploy, the Pages custom domain retired

The owner: "Yes: merge pull request 127, finish the 3.3.1 release branch,
open its pull request and merge on green, then tag v3.3.1 and delete the
apex CNAME at the deploy step as planned", then, when the session's own
permission layer refused the deletion click, "Can you do that for me?". Pull
request 127 (the plan) merged `4c7d7e6b`; pull request 129 (`release: 3.3.1`,
branch `release2/apex-custom-domain`) merged `de5fc53f` with Client CI and
Preview green; Client CI green on `main`. The dashboard steps were clicks in
the owner's Chrome session. Times UTC, 2026-10-17; the readings are in
`docs/operations/declarative-hosting.md`, "Production results".

- Order chosen to keep the gap off CI's clock: apex CNAME `46ad7bd1...`
  deleted about 00:48:15; `sheepdogsim.com` added as a Custom Domain of
  `sds-worker` (production) in the Worker's Domains tab; record `AAAA 100::`
  (proxied, read-only, owned by the domain) and its advanced certificate pack
  both created 00:49:34. About 80 s with no apex record, all of it the
  dashboard navigation. Resolvers that asked in that window hold an empty
  answer for up to 30 minutes (SOA default TTL).
- Tag `v3.3.1` on `de5fc53f` pushed 00:49:53; `Deploy` run 38988161939
  green at 00:52:52, every step. `cf deploy --prebuilt --no-provision`
  uploaded one changed asset (`release.json`), printed the route and
  `sheepdogsim.com (custom domain)` under the deployed triggers, and made
  version `588a8202` (`source: cf_cli`) the live deployment at 00:52:45. The
  four live verifiers passed; `release.json` reads 3.3.1, `de5fc53f`,
  `sourceRef v3.3.1`.
- Not as planned: for about two minutes after the domain was added the apex
  answered from the Pages project (3.1.0, ETag `06234d66...`, no
  `CF-Cache-Status`), not from the Worker, although the route was in place
  throughout. By 00:51:13 eight consecutive requests were the Worker's 3.3.0
  and the Pages custom domain read `deactivated`. The fact the plan relied on
  (routes win over a Pages custom domain on the same hostname) held while
  the apex was a CNAME to Pages and did not hold in the window when the
  Pages custom domain was still attached to a hostname whose record had just
  become the Worker's. A hostname should leave Pages before it is given to a
  Worker Custom Domain; recorded in the plan.
- Certificate pack: advanced, `google`, TXT validation, hosts
  `sheepdogsim.com` and `*.sheepdogsim.com`, `pending_validation` at 00:51,
  `active` by 00:53 with two Google Trust Services certificates valid to
  2027-01-15; the Universal certificate served meanwhile.
- The Pages custom domain `sheepdogsim.com` was removed from `sds-frontend`
  (dashboard, "Remove domain") after the deploy; the apex `AAAA` record was
  untouched by it; the project keeps `sds-frontend.pages.dev` (3.1.0) and
  `7cea2cd2.sds-frontend.pages.dev` (v2). `docs/operations/v2-rollback.md`
  rewritten for the new order of operations.
- Not measured: whether `cf` uploads source maps (the deploy log does not
  say). Left for the release after: delete the route (step 3) and drop
  `triggers` from the config (step 5), with `wrangler.toml`, the tests and
  `deployment.md` following.

## Release 2 declarative hosting rehearsal - 2026-10-17, done on `stage.sheepdogsim.com`, nothing left behind

The owner: "Yes: add the proxied CNAME stage.sheepdogsim.com -> sheepdogsim.com,
open the rehearsal pull request, read the results, then remove the record,
the Custom Domain and the certificate", and then "You do that for me through
the dashboard in Claude and Chrome." Pull request 128 (branch
`release2/stage-domain-rehearsal`, closed unmerged, branch deleted) declared
`domains: ['stage.sheepdogsim.com']` in the preview mode with the verifier
and both specs pinning it; the dashboard steps were clicks in the owner's
Chrome session, each approved; a subagent's attempt to create the record
through the dashboard API was refused by the session's own permission layer,
which blocks DNS, domain and certificate writes from an agent. Times UTC,
2026-10-17; the full readings are in `docs/operations/declarative-hosting.md`,
"Rehearsal results".

- With the proxied CNAME in place, the Preview run (38985501548) deployed
  the version and failed at the domain step: "Hostname 'stage.sheepdogsim.com'
  already has externally managed DNS records", "only partially updated",
  "Successful trigger changes were not rolled back", exit 1. The CI override
  the deploy tools set without a TTY does not cover a record we created.
- Record deleted 00:18:29; failed job re-run 00:18:36 to 00:19:42; `cf`
  printed the custom domain under the deployed triggers; record created
  00:19:35 (`AAAA 100::`, proxied, read-only, owned by the domain); first
  200 at 00:20:01; the origin and discovery verifiers passed on the
  hostname; apex and `www` unchanged. The zone SOA's default TTL is 1800 s.
- Certificate pack `887fe855...`: advanced, `google`, TXT validation, hosts
  `sheepdogsim.com`, `stage.sheepdogsim.com`, `*.stage.sheepdogsim.com`;
  pending at 00:21, active by 00:26; TLS served by the Universal wildcard
  throughout; not listed on the Edge Certificates page.
- Removal deploy (version `d5028f5e...`, config without `domains`): the
  domain, record and pack all stayed; `cf` said nothing.
- Dashboard removal of the Custom Domain: record gone at once, hostname no
  longer resolving, pack and both certificates `status: deleted`. Zone back
  to ten records; no sds Custom Domain on the account.
- Consequence for the plan: the apex CNAME must be deleted before the domain
  is published (a gap, seconds to 66 s, with a 30-minute negative-cache
  tail), or Pages is retired without a Custom Domain by editing the apex
  record in place to the same `AAAA 100::` placeholder and keeping the
  route, with no gap. The owner's call; STATUS names it.

## Release 2 declarative hosting - 2026-10-16, planned (draft pull request), nothing changed

The owner: "Do this task here: Release 2: declarative hosting and the Pages
retirement". The plan is `docs/operations/declarative-hosting.md`; this entry
records what was read and measured to write it. No DNS record, route, custom
domain, Pages setting or production setting was touched.

- Read from the dashboard API (Sonnet agent in Chrome, GETs): the zone's ten
  DNS records (apex CNAME to `sds-frontend.pages.dev` proxied, `www` CNAME to
  the apex proxied, four CAA records allowing `pki.goog` and
  `letsencrypt.org` only, null MX and SPF, DMARC reject, a site-verification
  TXT), the one route, no sds Custom Domain on the account, the Pages
  project's active `sheepdogsim.com` custom domain (certificate authority
  `google`, HTTP validation), and the `www to apex` redirect rule.
- Read in the docs (web-fetch agents, URLs in the runbook): a Custom Domain is
  refused on a hostname with an existing CNAME and the documented migration
  deletes the CNAME first; routes take precedence over Custom Domains on the
  same hostname; a Custom Domain creates the DNS record and an Advanced
  Certificate and leaves the certificate behind on removal; for a www
  redirect Cloudflare recommends a placeholder record and a rule, not a
  Custom Domain; the `cf` reference types `domains` as `string[]`, documents
  `cf workers triggers deploy` for the hosting half alone, and says nothing
  about conflicts, overrides or removal. The public API docs for the domains
  endpoint list no override flags.
- Read in the bundles of wrangler 4.151.0 and `cf` 1.0.0-beta.18, which
  share `publishCustomDomains`: the deploy asks for a changeset
  (`replace_state=true`), prompts in a TTY on conflicting DNS records or
  domains held by another Worker, and without a TTY sets
  `override_existing_dns_record` and `override_existing_origin` to true and
  PUTs the records. CI has no TTY. Both also warn that previously deployed
  routes are not deleted.
- Measured here, no credentials: `cf deploy --dry-run --prebuilt
  --no-provision` and `cf workers triggers deploy --dry-run --prebuilt`
  against a scratch copy of the Build Output with `domains:
  ["sheepdogsim.com"]` both pass and print nothing about domains or routes;
  the copy was restored and the gate re-verified.
- Decided in the plan, for the owner to confirm: the apex alone becomes a
  Custom Domain and `www` keeps its placeholder record and rule (amends the
  STATUS end state); a rehearsal on `stage.sheepdogsim.com` with the preview
  Worker over a deliberately conflicting CNAME comes first; the production
  sequence keeps the route through the DNS change (deploy with `domains` and
  `triggers` together, then delete the route, then remove the Pages custom
  domain, then drop `triggers` in a follow-up release), and the patch is
  written in the runbook, not applied, because merging it arms the next tag.

## Release 2 Stage B cutover - 2026-10-16, merged (pull request 126, `37154931`)

The owner: "Do this task here: Release 2 Stage B cutover: production Deploy
on cf", then "mark pull request 126 ready for review and merge it on green.
No tag yet." Same branch and pull request as the attempt below. Merged with a
merge commit, branch deleted, Client CI green on `37154931` (run
38982582508). Nothing deployed or tagged: the live Worker runs the
wrangler-deployed 3.3.0 until the next tag, which is the first `cf` deploy of
production and the place to read the source-map question below off the
dashboard.

- `deploy.yml` deploys the Build Output with `cf deploy --prebuilt
  --no-provision --message <sha>` from `app/`, after the unchanged gates
  (lint, typechecks, build, discovery, the suite, `--require-v3-static` on
  the output's `release.json`, `verify-deploy-config --cf`, the 90-day
  archive of `app/.cloudflare/output/v0`) and a `cf deploy --dry-run`. The
  source-commit guard now requires `app/cloudflare.config.ts` instead of an
  `[assets]` block in `wrangler.toml`. `--no-provision` because `cf deploy`
  provisions by default and every binding here names an existing resource.
- `scripts/build-output.mjs` is the one place that names the Build Output,
  the Worker directory and the built game; the verifiers' defaults,
  `write-release-manifest.mjs`, `vite.config.ts`, `tools/probe-lib.mjs`,
  `art-review`, the release-hardening, context-loss, touch-interruption and
  playtest-profile probes and the treeline test import it. The hub probe
  stays standalone (it is copied to the hub) and takes `--dist=`, defaulting
  to the hub-side name `dist`; `docs/art-review.md` and `AGENTS.md` say what
  to copy. The two record tools were left alone: the ledgers digest them, so
  a comment change there would have meant re-recording both ledgers.
- `docs/operations/deployment.md` describes the `cf` path (Build Output
  table, the plugin's two fixed paths, no Durable Object export,
  `wrangler.toml`'s remaining role) and the rollback that still works:
  `wrangler rollback <version> --name sds-worker` or `cf workers deployments
  create` for any version from Release 1 on, `gh workflow run deploy.yml
  --ref <tag>` for a commit built for an earlier deploy path (3.2.1 to 3.3.0
  and 3.2.0), because a dispatch takes the workflow file from `main`.
- Measured locally on the branch: `npm run build` writes the Build Output
  with the same artifact digest as 3.3.0 (`2b64a94f...`, 36 files);
  `verify-deploy-config --cf`, the manifest and discovery checks with their
  new defaults pass; `cf deploy --dry-run --prebuilt --no-provision` from
  `app/` reads 40 files and the two bindings for `sds-worker`; lint,
  typecheck and the suite pass.
- Not measured: whether `cf` uploads the bundle's source map as wrangler's
  `upload_source_maps = true` did. The Build Output carries `index.js.map`;
  the first production deploy is the place to read it off the dashboard.

## Release 2 Stage B - 2026-10-16, four checks passed on the preview Worker (pull request 126, draft)

The owner's task: "Release 2 Stage B: cf CLI on the preview Worker, four
checks". Branch `release2/stage-b-cf` off `main` at `909bcf2f`; nothing here
touched production, the Deploy workflow or any secret. `cf` 1.0.0-beta.18 and
`@cloudflare/vite-plugin` 2.0.0-beta.v.1, both pinned.

**The attempt.** `app/cloudflare.config.ts` declares the two Workers that
`wrangler.toml` declares, with a `preview` mode in place of `[env.preview]`
and no `exports` map (the applied v1/v2 history deleted every Durable Object
class, and the docs say not to copy applied deletions; `cf migrate` was tried
and refused the migrations with a `throw new Error("Migration incomplete")`
stub, so the file was written by hand). `tests/worker/cloudflare-config.spec.ts`
holds every hosting fact in it equal to `wrangler.toml` while both exist.
`scripts/verify-deploy-config.mjs --cf` is the same gate over the Build Output
(`config.json` mode, `worker.config.json` name, runtime, triggers, bindings,
assets rules, no exports, bundle entry, `release.json` present, no config in
the assets). The Preview workflow is the attempt: `npm run build:preview`,
the verifiers over the Build Output, `cf deploy --dry-run --prebuilt --mode
preview`, `cf workers versions create --prebuilt --mode preview
--preview-alias pr-<n>`, then `cf deploy --prebuilt --mode preview`, so the
checks read a live `cf`-made deployment. Baseline: the Stage A build of
`909bcf2f` uploaded from this PC with wrangler as alias `stageb-a`, version
`430169ee...`.

Preview run 38978481493 on `4bd61623` passed in 82 s: the dry run read 40
files and a 68.37 KiB script; the aliased version is `a48c3630...` (`pr-126`,
one new asset uploaded, `release.json`); the deployed version is
`755d9e11...` (`metadata.source` `cf_cli`); `verify-worker-origin` passed on
the alias and on the deployed root.

**Check 1, asset set and headers: passed.** `scripts/snapshot-served-assets.mjs`
(status, kept headers and body SHA-256 of every built file plus `/`,
`/index.html` and a missing path) against `stageb-a` and against `pr-126`:
37 files, three differences, all in `/release.json` (body digest, etag and
content-length: the commit, source ref and build time). Everything else,
including the root, the `/index.html` redirect and the single-page fallback,
is identical. The deployed root and the alias are identical on all 37.

**Check 2, bindings and route list: passed.** `wrangler versions view` of
`430169ee...` (Stage A), `a48c3630...` and `755d9e11...`: bindings
`assets:ASSETS`, `d1:DB` (preview id), `secret_text:JWT_SECRET`;
`compatibility_date` 2026-04-01, `nodejs_compat`; handler `fetch`;
`migration_tag` `v2` on all three. With ids, timestamps, etags and
annotations stripped, the JSON has no other difference. Read from the
dashboard API afterwards (a Sonnet agent in Chrome, GETs only): the zone's
Workers route list is still the one route, `sheepdogsim.com/*` to
`sds-worker`; `sds-worker-preview`'s settings carry the three bindings,
2026-04-01, `nodejs_compat`, observability on; its `workers.dev` subdomain is
enabled with previews enabled; the account's custom domains list has no sds
entry; and its deployment list shows the `cf_cli` deployment of `755d9e11...`
at 22:55:41 UTC followed by the two wrangler deployments of check 3.

**Check 3, the migration tag across a wrangler deploy of an older commit and a
rollback: passed.** The saved Stage A build (`909bcf2f`, its generated
`wrangler.json` naming `sds-worker-preview`, migrations v1 and v2) deployed
with `wrangler deploy` onto the `cf`-made deployment: version `6ac47137...`,
`metadata.source` `wrangler`, `migration_tag` `v2`, no migration re-sent, the
root serving `909bcf2f`. `wrangler rollback 755d9e11... --name
sds-worker-preview`: active version `755d9e11...`, `migration_tag` `v2`, root
serving `4bd61623`. No Durable Object class reappeared in either direction.

**Check 4, preview aliases: passed.** `pr-123` (`129520a5`), `pr-124`
(`1bf01bf6`), `pr-125` (`0adc5ce8`), `pr-126` (`4bd61623`) and `stageb-a`
(`909bcf2f`) each answer 200 with their own `release.json`.

**What the attempt cost, for the cutover decision.**

- The plugin reads `cloudflare.config.ts` from the Vite root and nowhere else
  (`path.resolve(root, 'cloudflare.config.ts')`, no walk-up, no option), and
  `cf` finds it by walking up from its working directory. This project's
  Vite root is `app/`, so the file lives there with `entrypoint:
  '../worker/src/index.ts'`, and `cf` runs from `app/`. A first attempt with
  the file at the repository root built an autoconfigured Worker named `app`
  with no script.
- The plugin forces the Build Output location (`forceBuildOutputDirs` runs
  after Vite's merge and overrides any `build.outDir`): the build is
  `app/.cloudflare/output/v0`, the game `workers/default/assets` inside it,
  and nothing is written to `dist/` or to `.wrangler/build/sds_worker/`. So
  the branch cannot deploy production with wrangler, and merging it is the
  cutover. Re-homed in the pull request: Client CI, the discovery and release
  manifest verifiers' defaults (one constant, `BUILT_CLIENT`), the treeline
  test's built-copy check. Still reading `dist/`: `deploy.yml`, the hub and
  release probes and `tools/art-review.mjs` (`tools/probe-lib.mjs`),
  `docs/operations/deployment.md`.
- `cf` keeps its own credentials and does not read wrangler's login; in CI the
  existing `CF_API_TOKEN` works for it (`author_email` empty on its versions).
  Local `cf` runs stayed at `--dry-run`.
- One pull request now uploads two versions, the aliased one and the deployed
  one, because `cf deploy` always creates its own version.
- `cf migrate` does not convert `[[migrations]]`; the Durable Object history
  is carried by the account, not the config, and check 3 is the measurement
  that `cf`'s uploads leave it alone.

**Verdict.** Stage B can proceed to production, as its own pull request on
the owner's go: `deploy.yml` to `cf deploy --prebuilt` in production mode
with the same verifiers, the `dist/` readers above moved to the Build Output,
the runbook updated, and `wrangler.toml` kept only while a rollback to Stage A
is wanted. Pull request 126 stays a draft until then.

## Release 3.3.0 - 2026-10-16, live (tag `v3.3.0`, the Kiln homestead)

The owner's go: "once main's CI is green on 6a605e16, push the v3.3.0 tag,
watch Deploy, run the live verifiers and record the result."

- Release commit `6a605e16` (`release: 3.3.0`: CHANGELOG, STATUS, the two hub
  receipts in this log, `package.json` 3.3.0) on `main` after pull requests
  124 (house flip) and 125 (barn flip, house window fix, derived ledgers).
  Client CI green on it (run 38975545133).
- Annotated tag `v3.3.0` on `6a605e16`, pushed 22:27 UTC. `Deploy` run
  38976103808 completed with every step green: lint, the typechecks, the
  build, discovery check, release identity, deploy configuration, artifact
  archive, `wrangler deploy`, and the four live checks.
- Live, read from this PC afterwards: `release.json` names 3.3.0 at
  `6a605e16`, 36 files, artifact `2b64a94f…`, built 22:31:03 UTC; the four
  verifiers (`verify-release-manifest --url`, `verify-worker-origin` on the
  apex and on `workers.dev`, `verify-public-discovery --require-analytics`)
  pass against the live site; the live artifact digest equals the deploy
  run's archived `release-6a605e16…` artifact; and the two GLBs served
  (`farmhouse-BmlYMey9.glb` 188,020 bytes, `barn-DmIE3qzV.glb` 162,772
  bytes) match their ledgers' recorded SHA-256 byte for byte.
- Seen live: the Kiln house and barn from the north fence in both cameras
  (`captures/stability/hub-receipts/live-3.3.0/framing/`, gitignored).
- Worker settings, read from the dashboard API after the deploy and diffed
  against the 3.2.1 snapshot field by field: bindings (`ASSETS`, D1 `DB`,
  `JWT_SECRET`), observability, placement, tail consumers, the one route
  `sheepdogsim.com/*`, the subdomain flags, compatibility date and flags and
  the migration tag all identical; only `modified_on` moved. The settings'
  `annotations["workers/message"]` names `6a605e16`, the deployed commit.

## Kiln barn hub receipt - 2026-10-16, passed; `BARN_SOURCE` flipped

The owner passed the Kiln barn, and the house with its window over the door
removed, on look review of the production build (`vite preview` of a `dist/`
built from the flip branch with both constants on `kiln`), and asked for the
flip, the merge on a clean receipt, and the release tag prepared.

Taken on `mk-os` as the house receipt was (same alias, viewport, Chrome,
Playwright, 200 sheep, `high` tier on every run; preflight idle under 2% CPU
and 0% GPU). "Before" is `main` at `32b3c96d` built for production: the Kiln
house shipped, the procedural barn. "After" is the barn branch at `129520a5`
built with `BARN_SOURCE = 'kiln'` and `assets/grass/` rebaked for it (36
files; two runtime GLBs, the house and the barn). The house in both arms is
the bake before the window fix below; that fix removes 132 triangles and adds
nothing, so the receipt bounds it. Receipts under
`captures/stability/hub-receipts/kiln-barn/`, gitignored.

**60 s runs, both backends; the default input and the homestead drive in
both cameras.**

| | frames | p50 | p95 | p99 | max | over 100 ms | ready | draws | triangles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Default WebGPU before | 7,176 | 8.3 | 8.4 | 8.4 | 25.0 | 0 | 2,637 ms | 40 | 3,958,224 |
| Default WebGPU after | 7,187 | 8.3 | 8.4 | 8.4 | 33.3 | 0 | 2,673 ms | 40 | 3,958,239 |
| Default WebGL2 before | 7,192 | 8.3 | 8.4 | 8.4 | 16.8 | 0 | 2,716 ms | 40 | 3,958,224 |
| Default WebGL2 after | 7,187 | 8.3 | 8.4 | 8.4 | 16.7 | 0 | 1,991 ms | 40 | 3,958,239 |
| Classic WebGPU before | 7,184 | 8.3 | 8.4 | 8.4 | 33.4 | 0 | 2,559 ms | 53 | 3,965,250 |
| Classic WebGPU after | 7,189 | 8.3 | 8.4 | 8.4 | 33.3 | 0 | 2,740 ms | 53 | 3,967,003 |
| Classic WebGL2 before | 7,195 | 8.3 | 8.4 | 8.4 | 16.7 | 0 | 2,201 ms | 53 | 3,965,250 |
| Classic WebGL2 after | 7,187 | 8.3 | 8.4 | 8.4 | 83.3 | 0 | 1,894 ms | 53 | 3,967,003 |
| Follow WebGPU before | 7,191 | 8.3 | 8.4 | 8.4 | 25.0 | 0 | 2,588 ms | 47 | 3,924,898 |
| Follow WebGPU after | 7,179 | 8.3 | 8.4 | 8.4 | 25.1 | 0 | 2,682 ms | 47 | 3,926,651 |
| Follow WebGL2 before | 7,194 | 8.3 | 8.4 | 8.4 | 16.8 | 0 | 2,741 ms | 47 | 3,924,898 |
| Follow WebGL2 after | 7,190 | 8.3 | 8.4 | 8.4 | 16.7 | 0 | 3,625 ms | 47 | 3,926,651 |

**Boot-only, three repetitions per arm and backend, medians of `readyMs`.**
WebGPU 2,661 before, 2,623 after; WebGL2 2,735 before, 2,642 after.

No frame-time regression: every percentile identical in all twelve runs, zero
frames over 100 ms, the same draw count per view (the barn's weld adds no
draws, 10 for the cluster, as its ledger says), and the Kiln barn costs about
1,750 triangles against 3.97 million with the homestead filling the frame and
15 with it out of frame. Two single frames stand out and neither is the
candidate's: the 83.3 ms maximum in one after run is one frame in 7,187, the
kind the before arm produced in the house receipt (75 ms), and the 3,625 ms
ready in one after run sits beside 1,894 and 1,991 ms from the same build,
with the boot-only medians of both arms within 100 ms of each other. The
WebGL2 ready times of the before arm, 2.2 to 2.7 s here against 1.8 to 1.9 s
for the same bytes in the house receipt, show how far that figure moves on
the hub between sessions; only within one session is it a comparison. The
probe's 2 s startup budget is missed by both arms alike, as every receipt
since Release 1 has shown.

Flipped on the strength of this: `BARN_SOURCE = 'kiln'`, with the grass
rebake the bake test requires (barn walls and plinth 8 tufts; the house's
cuts unchanged). Merged as pull request 125 (`e3642877`) with the window fix
and the derived ledgers (`tools/glb-ledger.mjs`, which read "as exported"
counts from the GLB after the rebake caught both ledgers stating typed-in
numbers). The whole homestead is now the owner's Kiln work.

Open, and the owner's call: the slate courses wave on both of the barn's
pitches, from the shared slate graph's course wander (`ROOF_COURSE_WANDER`
0.16, `farmhouse/surfaceMaterial.ts`), a world-space field about 11 m long
that every roof carries, the reviewed house included. Zero wander gives
straight courses (barn agent's diagnostic capture). Any change moves the
house too, so none was made for this release;
`docs/history/barn-kiln-2026-10-16.md` lays out the three options.

## Kiln house hub receipt - 2026-10-16, passed; `FARMHOUSE_SOURCE` flipped

The owner passed the Kiln house on look review of the production build
(`vite preview` of a `dist/` built from `e07303af` with the constant on
`kiln`) and asked for the hub receipt and then the flip with its grass rebake.

Taken on `mk-os` over the `hub` alias, native viewport 1440x900, Classic rig
unless stated, Chrome stable at `/opt/google/chrome/chrome`, Playwright 1.61.1
read-only, 200 sheep, `high` tier by measurement on every run. Preflight idle
samples under 2.5% CPU and 0% GPU; the probe's own quiet gate passed on every
run. "Before" is the exact live 3.2.1 artifact (`c5964ff2`, 34 files,
downloaded from the deploy run's archive). "After" is `e07303af` built with
`FARMHOUSE_SOURCE = 'kiln'` and `assets/grass/` rebaked for it (35 files; the
one runtime GLB is the Kiln house, 193,888 bytes). Receipts under
`captures/stability/hub-receipts/kiln-house/`, gitignored as every receipt in
this lane is, so the numbers here are the record.

**Like-for-like with every earlier receipt: 60 s, default input.** The dog
wanders around its spawn, 170 m from the homestead.

| | frames | p50 | p95 | p99 | max | over 100 ms | ready | draws | triangles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WebGPU before | 7,186 | 8.3 | 8.4 | 8.4 | 33.4 | 0 | 2,724 ms | 40 | 3,959,384 |
| WebGPU after | 7,191 | 8.3 | 8.4 | 8.4 | 25.0 | 0 | 2,634 ms | 40 | 3,958,224 |
| WebGL2 before | 7,183 | 8.3 | 8.4 | 8.4 | 75.0 | 0 | 1,880 ms | 33 | 3,916,714 |
| WebGL2 after | 7,197 | 8.3 | 8.4 | 8.4 | 16.7 | 0 | 2,682 ms | 40 | 3,958,224 |

**The homestead in frame, 60 s.** The owner pointed out mid-run that the
default input never shows the buildings, so a receipt for a building change
measured almost none of the building. `tools/hub-presentation-probe.mjs` gained
`--drive=homestead`: the dog walks to world x 30 and up to the north fence,
between the house and the barn, and holds there facing them, so both fill the
frame for the whole minute. Classic frames the pair from above with the flock
gathered below the fence; Follow looks at them from ground level. Framing was
checked on this PC first, from screenshots, before the hub ran it, and the
hub's own `active-play.png` on every run shows the same frame.

| | frames | p50 | p95 | p99 | max | over 100 ms | ready | draws | triangles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Classic WebGPU before | 7,188 | 8.3 | 8.4 | 8.4 | 41.6 | 0 | 2,592 ms | 53 | 3,964,064 |
| Classic WebGPU after | 7,192 | 8.3 | 8.4 | 8.4 | 24.9 | 0 | 2,566 ms | 53 | 3,965,250 |
| Classic WebGL2 before | 7,193 | 8.3 | 8.4 | 8.4 | 16.8 | 0 | 1,841 ms | 53 | 3,964,064 |
| Classic WebGL2 after | 7,195 | 8.3 | 8.4 | 8.4 | 16.7 | 0 | 1,837 ms | 53 | 3,965,250 |
| Follow WebGPU before | 7,183 | 8.3 | 8.4 | 8.4 | 33.3 | 0 | 2,609 ms | 47 | 3,923,712 |
| Follow WebGPU after | 7,185 | 8.3 | 8.4 | 8.4 | 25.0 | 0 | 2,625 ms | 47 | 3,924,898 |
| Follow WebGL2 before | 7,195 | 8.3 | 8.4 | 8.4 | 16.7 | 0 | 1,795 ms | 47 | 3,923,712 |
| Follow WebGL2 after | 7,194 | 8.3 | 8.4 | 8.4 | 16.8 | 0 | 1,924 ms | 47 | 3,924,898 |

**Boot-only, three repetitions per arm and backend, medians of `readyMs`.**
WebGPU 2,668 before, 2,700 after; WebGL2 1,918 before, 1,821 after. Every
`herd:boot:*` mark moves within the spread of the repetitions.

No frame-time regression: every percentile is identical on both backends, in
both cameras, with the homestead filling the frame and with it out of frame;
zero frames over 100 ms in twelve 60 s runs; the same draw count per view (the
weld adds no draws, as the loader's design said); the triangle readout moves
by about a thousand against 3.96 million either way, which is the Kiln house
against the procedural one at the 250 ms peak sample. The probe's own 2 s
startup budget (`startupPass`) is missed on WebGPU by both arms alike, at 2.6
to 2.7 s, exactly as the live 3.2.1 artifact and the Release 1 receipt
already showed; that is a known property of the WebGPU boot path, not this
change. The WebGL2 before run's 75 ms maximum is a single frame in the live
arm, not the candidate. The one limit from earlier receipts applies: a
vsync-locked distribution near 120 Hz shows the budget is met with headroom,
not how much.

Flipped on the strength of this: `FARMHOUSE_SOURCE = 'kiln'`, with the grass
rebake the bake test requires (house 30 tufts cut, porch 3, barn 7, barn
lean-to 2; field 81,736 and surround 16,555 tufts). The probe's new drive and
its documentation in `docs/art-review.md` ship in the same change.

## Surface atlas spike - 2026-10-16, concluded: procedural stays

The owner asked whether procedural textures and texture atlases would be
smarter for the barn, the house, the fence, the gate and the trees, on an
experimental branch. Done the same day as a measured spike with its win
condition written before the build: one barn wall three ways in the asset
lab, A the TSL surface per pixel, B the same surface (same arithmetic,
bundled into the bake) in one cell of a 2048 KTX2 atlas sampled through a
second UV set, B+ the atlas with painted knots and nail heads. Same picture at
90 m and 20 m (mean difference under one luminance level); at 3 m and 1.5 m
the atlas keeps a third and a sixth of the procedural panel's edge energy
(256 texels a metre against the screen's 440 and 880); no seam or bleed; no
draw call saved; one texture binding, 254 kB on the wire, 22 MB RGBA8 on the
GPU (5.6 MB with a UASTC encoder the repo lacks) and a boot decode added; the
painted detail invisible beyond 3 m; and the eave band, like every
geometry-dependent term of the farmhouse surfaces, has to stay in the shader.
Neither win condition met. Note, tools, captures and recommendation:
`docs/history/spike-surface-atlas-2026-10-16.md`, branch
`experiment/surface-atlas`, pull request 122 (draft, not for merge). The
lab's loop gate also gained the renderer-stage condition on `main`
(`3bce5760`): the game store outlives a hot reload of the lab tree.

## Lab WebGPU synchronisation error - 2026-10-16, fixed

Once per lab boot under WebGPU: `[Texture "output"] usage includes writable
usage and another usage in the same synchronization scope`, attributed to a
sky-dome pipeline. Bisected against `ccda34a1` (before the renderer staging):
10 of 10 boots on both, so it predates the renderer fixes, and `86fe175f` fixed
only the render-before-init errors it was meant to.

- The label was misattribution: three wraps each async pipeline compile in a
  validation error scope that stays open about 800 ms, and the stray error
  landed in whichever scope was open. The error text names the
  `renderContext_0` command encoder, a render pass.
- The mechanism, confirmed in the installed fiber 9.8.2 bundle (`loop.ts`):
  `setFrameloop('never')` changes the mode and the clock only; the frames that
  mounting the field requested through `invalidate()` stay in
  `internal.frames`, and `loop()` runs a root while that count is above zero.
  So `SceneReadySignal`'s pause let one or two frames draw into the scene
  target while `compileAsync` was mid-flight. three r186 has no pre-compile
  state guard (r187's #34506 adds one), so the frame shared the compiler's
  renderer state and WebGPU rejected the read and write of `output`.
- The game was never affected: `App.tsx` holds `frameloop="never"` until
  `sceneReady`, so `invalidate()` is a no-op during the mount and nothing is
  queued. The lab mounted with the loop running and relied on the imperative
  pause: that was the misimplementation, not the gate.
- Fix: the lab gates its loop on `sceneReady` as the game does and loses the
  intermediate stage the earlier comment justified with a mechanism that does
  not exist (fiber reapplies the prop only when its value changes).
  `SceneReadySignal` documents the host contract. No fiber internals touched.
- Verified: 5 fresh boots of the lab in headed Chromium with WebGPU
  (`--enable-unsafe-webgpu`), backend row `webgpu`, zero synchronisation
  errors at startup and after the "House (Kiln)" switch, zero page errors,
  29 draw calls after the switch.
- Checked against the trackers: no fiber report of the pending-frame gap (worth
  filing upstream); three #34681 (passes rendered inside a RenderPipeline
  precompile at the wrong call depth) does not apply, since the post chain
  renders the scene itself at depth 0 into its target; three #28549 is the
  general rule the error states.

## Release 2 Stage A - 2026-10-16, live as 3.2.1 (pull request 117, tag `v3.2.1`)

One root package on `@cloudflare/vite-plugin` 1.64.0 with wrangler 4.151.0 (the
version the plugin pins).

- Plugin behaviour measured: the client output defaults to `dist/client`, and
  `environments.client.build.outDir` keeps it at `dist/`; the Worker builds to
  `.wrangler/build/sds_worker` so it cannot be wiped by or uploaded with the
  client; `dist/.assetsignore` is always emitted; the deploy redirect is written
  to `<Vite root>/.wrangler/deploy/config.json`, which is `app/.wrangler/...`.
  From the repository root wrangler does not find it (`wrangler deploy` fails
  with "missing the required `directory` property"); from `app/` it refuses the
  mismatch with the root `wrangler.toml`. Both workflows therefore deploy the
  generated file with `--config .wrangler/build/sds_worker/wrangler.json`;
  `--env=""` is accepted with it.
- Artifact digest, both builds on the rebased tree (`08c595ae`, licensed audio
  present, `SDS_RELEASE_SHA` and `SDS_RELEASE_REF` identical): old build (the
  `worker/` package and `node scripts/write-release-manifest.mjs`) and new build
  (plugin) both give 34 files, 8,501,460 bytes, sha256
  `83db6d4457016684f23876d5fc60fd98e58cf1cdc1fb8e289def86f40adbcd12`. Live
  3.2.0 is 34 files, 8,501,487 bytes, sha256 `0f4585fc...`; the 27-byte
  difference is the two renderer fixes on `main` (`86fe175f`, `08c595ae`), which
  3.2.1 will ship. Before the rebase, without the licensed audio: 32 files,
  6,588,591 bytes, sha256 `25134c99fecb050cef627cdf0059bf364e4aa0c23d43c0e3b07873eefb1002f4`
  for both. Without the manifest skipping `.assetsignore` the new build had one
  extra file (33 files, 24 bytes more).
- Generated config against the old `worker/wrangler.toml`, field by field (name,
  compatibility, `workers_dev`, `preview_urls`, routes, D1 binding and id,
  migrations, Durable Object bindings, assets settings, observability):
  identical for production and for the `CLOUDFLARE_ENV=preview` build. The one
  addition is `upload_source_maps: true`, the plugin's default, now stated in
  `wrangler.toml` on purpose. `wrangler deploy --config ... --env="" --dry-run`
  and `versions upload --config ... --dry-run` read the same 37 asset files and
  the same bindings as the old config.
- Dev loop: `vite dev` with the local D1 answered `/api/healthz`, a register
  and a leaderboard read through the Worker with no proxy; `vite preview`
  passes `verify-worker-origin.mjs`.
- Release: merged as `58f2be74`, released as 3.2.1 on `c5964ff2`, tag `v3.2.1`
  pushed after Client CI, Deploy run 38957976689 green end to end (verifier,
  deploy from the generated config, live manifest, origin on the apex and on
  `workers.dev`, discovery and analytics). Live `release.json`: 3.2.1,
  `c5964ff2`, 34 files, 8,501,460 bytes, sha256 `83db6d44...`, the digest the
  new build gave before the tag. The four live verifiers re-run from the
  workstation pass, `www` redirects to the apex.
- Live Worker settings read through the dashboard API before (19:27Z) and
  after (19:57Z) the deploy, 27 fields: migration tag `v2`, bindings `ASSETS`,
  `DB` (same D1 id), `JWT_SECRET`, route `sheepdogsim.com/*`, `workers.dev`
  on with previews off, compatibility date and flag, observability, placement,
  tail consumers all identical; only `modified_on` moved. The generated config
  publishes the same Worker the old `worker/wrangler.toml` did. Stage B (the
  `cf` CLI and `cloudflare.config.ts`) is next, on preview only, behind its
  four checks.

## Release 1 production cutover - 2026-10-16, complete

Per `docs/operations/worker-cutover.md`, owner go for steps 1 and 2.

- Step 1: `sds-worker` deployed without a route from `58b247b5` (version
  `1a5d42f7`), replacing the 2026-09-22 version `f5c30a31`; the Durable Object
  `deleted_classes` migration applied. On `workers.dev`: manifest commit
  matched, `/api/healthz` JSON, `field-v3/25` board read, pre-change identity
  `Cutover Check#0001` resolved with its old token accepted and a wrong secret
  refused, discovery passed, cross-origin board read from the Pages client
  answered `access-control-allow-origin: *`.
- Step 2: `wrangler triggers deploy` attached `sheepdogsim.com/*`. On the apex:
  3.2.0 manifest at the deployed commit, JSON API, same identity checks,
  discovery passed. `sds-frontend.pages.dev` kept serving 3.1.0. No downtime.
- Finding: the zone's automatic analytics injection did not reach any
  Worker-served page, so `/about`, `/support` and `/privacy` had no beacon.
  Fixed in `ad37eaca`: the snippet in every page, the check requiring it.
- Finding: `www.sheepdogsim.com` had never had a DNS record. Fixed as zone
  configuration (proxied CNAME, redirect rule, 301 with path and query kept),
  not as a Worker route, because assets answer before Worker code runs.
- Incident, minutes long: the `ad37eaca` redeploy was built with a plain
  `npm run build`, which did not write `release.json`, so the live manifest
  answered with `index.html` until the manifest was written and redeployed
  (`b37a2a39`). The build now writes the manifest itself.
- Dashboard, owner-approved: Web Analytics off on the Pages project; the
  `sheepdogsim.com` analytics site switched to snippet mode, token unchanged.
- Preview D1: the two `Cutover Check` test players deleted. Production D1:
  the `Cutover Check#0001` and raw-API `Player` rows (no submissions) deleted
  on the owner's decision.
- Tag `v3.2.0` on `b2420f66` (CI green). The `Deploy` run deployed the exact
  commit - the live manifest names `b2420f66` with source ref `v3.2.0`, and
  every live check passes when run by hand - but the run itself failed: the
  `CF_API_TOKEN` could publish the script and not the route (`No access to the
  specified resource` on `/workers/scripts/sds-worker/routes`), so wrangler
  stopped after the upload and the workflow's live checks never ran. The
  route added by hand in step 2 is untouched. The token needs Workers Routes
  edit on the `sheepdogsim.com` zone, as `docs/operations/deployment.md` says;
  once it has it, the same commit is redeployed through `workflow_dispatch`
  so the workflow path is proven green. wrangler also warned that the deploy
  named no environment; the workflow now passes `--env=""`.
- Analytics: the misnamed Pages site disappeared on its own when the Pages
  toggle went off; nothing to delete.
- Token: the owner created the Account API Token `sds-github-deploy` with the
  policy now tabled in `docs/operations/deployment.md` and set it as
  `CF_API_TOKEN`. `Deploy` was dispatched for `b2420f66` from `main`
  (`8533a571`, with `--env=""`): it published the route itself, passed every
  live check, and the live manifest names `b2420f66`. **Release 1 is closed.**
  The old `sds-token`, `sds-ci`, `sds-bot`, `sds` and `claude-agent-sds`
  tokens are the owner's to revoke.
- Renderer boot architecture: the adversarial review the owner asked for in
  place of an upstream issue is in `docs/history/renderer-boot-review-2026-10-16.md`.
  Verdict (b): sound, with four defects queued for Release 2 (the asset lab
  renders before init, fiber overrides the tone mapping, the factory memo is
  now a liability, spec/01 is stale).

## Release 1 hub gate - 2026-10-16, passed

Taken on `mk-os` over the `hub` alias, native viewport, Classic camera,
adapter nvidia/turing, Chrome stable at `/opt/google/chrome/chrome`, Playwright
1.61.1 read-only. Preflight idle samples under 2% CPU and 0% GPU for every run.
"Before" is the exact 3.1.0 production artifact (`1dbd0150`, downloaded from
the deploy run's archive). "Candidate" is the 3.2.0 build at `10bd9be6`: the
Worker migration code, every dependency at latest stable, the farmhouse loader
on `procedural`, and the boot-path fix below. Receipts under
`captures/stability/hub-receipts/release1/`, gitignored as every receipt in this
lane is, so the numbers here are the record.

**60-second runs, one per backend and arm.**

| | frames | p50 | p95 | p99 | max | over 100 ms | ready | draws | triangles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WebGPU before | 7,188 | 8.30 | 8.40 | 8.40 | 41.6 | 0 | 2,757 ms | 40 | 3,959,384 |
| WebGPU candidate | 7,185 | 8.30 | 8.40 | 8.40 | 25.1 | 0 | 2,588 ms | 40 | 3,959,384 |
| WebGL2 before | 7,195 | 8.30 | 8.40 | 8.40 | 16.8 | 0 | 2,643 ms | 40 | 3,959,384 |
| WebGL2 candidate | 7,196 | 8.30 | 8.40 | 8.40 | 25.0 | 0 | 2,135 ms | 40 | 3,959,384 |

No frame-time regression: every percentile is identical on both backends, zero
frames over 100 ms, the same draw and triangle readout, the same `high` tier by
measurement. The same two limits as the asset polish receipt apply: a
vsync-locked distribution near 120 Hz shows the budget is met with headroom,
not how much; and the settled Classic screenshot has the farm out of frame.

**The startup regression that was found and removed.** The first candidate
build (before the boot fix) booted slower than 3.1.0: medians of three
boot-only runs put the renderer-to-capability window at 230 ms against 76 on
WebGPU and 399 against 98 on WebGL2, consistent every run, with every other
boot window unchanged. Single-revert variants on the hub cleared three 0.186.1,
react 19.3.1 and vite 8 of any part in it; only `@react-three/fiber` 9.7.0 in
place of 9.8.2 restored the baseline, and a `scheduler` 0.27 override produced a
byte-identical bundle, so it was fiber's own code. The cause, read in the
shipped fiber and react-dom code and confirmed against fiber's 9.8.0 release
notes (pmndrs/react-three-fiber#3925): a Canvas whose `gl` factory returns a
promise now waits on it through a Suspense gate, and React's fallback throttle
(`FALLBACK_THROTTLE_MS`, 300 ms) holds the resolved commit until 300 ms after
the fallback was shown. WebGL2 initialises almost instantly and paid the full
300; WebGPU's own init absorbed half.

The fix is in this repository's boot path, not a pin: `glFactory` returns the
renderer before `init()` resolves so fiber mounts synchronously, the capability
probe awaits `rendererReady()` before it measures, and the frame loop stays
paused until the scene is ready because three throws on a render before init.
Boot-only medians after the fix, three runs each, interleaved with the unfixed
build: renderer-to-capability 64 to 87 ms on both backends, inside the 3.1.0
band; ready 2,645 ms WebGPU and 2,639 ms WebGL2 against 2,662 and 1,833 to
2,702 before, with the shaders phase as noisy as it always is on WebGL2.

**Harness note.** Every candidate receipt lists one failed request,
`cloudflareinsights.com/cdn-cgi/rum`: the beacon now in `app/index.html`
cannot report from the probe's loopback origin, and `probe:boot` on this PC
also logs a 502 because the dev proxy for `/api` has no Worker behind it. Both
are artifacts of the new architecture meeting a static harness, not defects.
The probes now stub both paths through `tools/harness-stubs.mjs`, which also
replaced the version 2 `/api/lobbies` stub six probes still carried, so a
receipt's failed requests and console errors describe the game alone.

## Release 1, Phase 1 - 2026-10-16: dependencies and farmhouse wiring

Two parallel worktree passes, merged to `main` the same day. Desk lane only;
no hub timing.

**Dependencies, all to latest stable.** vitest 3.2.7 to 5.0.5 (tinypool gone,
js-yaml gone with ESLint 10's dropped eslintrc), eslint 9.39.5 to 10.13.0,
vite 7.3.6 to 8.3.4, @vitejs/plugin-react 5.2.0 to 6.1.2, three 0.185.1 to
0.186.1 with @types/three 0.186.0, react and react-dom 19.2.8 to 19.3.1,
@react-three/fiber 9.7.0 to 9.8.2, @types/node 24 to 26.6.5, wrangler 4.151.1,
@cloudflare/workers-types 5.20261016.1, playwright 1.64.1, typescript ~5.9.3 to
~6.0.3 with `"types": ["node"]` added to `tsconfig.json` because TypeScript 6
no longer auto-includes @types/node. 940 tests in 113 files after every batch.
Main chunk: 2,286.69 kB raw / 637.46 kB gzip before; 2,266.38 / 626.67 after
Vite 8; 2,368.43 / 653.18 after the Three and React batch.

TypeScript 7.0.2 was tried and is blocked: `require('typescript')` exposes only
`version` and `versionMajorMinor` (the 7.0 announcement defers the API to 7.1),
and @typescript-eslint/parser 8.71.2 throws "typescript-eslint does not support
TS 7.0", so lint exits 2 while typecheck, build and all 940 tests pass. The
documented workaround is a second TypeScript aliased into the tree, which this
repository does not accept.

**Three.js 0.186 receipts, desk lane.** No API change was needed; the r186
renames and removals were grepped against app/, lab/, sim/ and tools/ with no
hits. `tools/art-review.mjs` ran three scenarios on genuine WebGPU and three on
forced WebGL2 against both the old and new builds: identical draw calls and
triangles in every scenario, no console errors, same composition. The review's
boot-budget checks fail identically on both builds on this PC. Desktop boot
read about 2.7 s against 2.4 s before, single runs, not a measurement. Captures
under `captures/deps-three-0186/`.

**Kiln farmhouse wiring.** Loader moved from the lab into
`app/src/scene/farmhouse/kilnHouse.ts`; GLB emitted by Vite as
`assets/farmhouse-<hash>.glb` from a `new URL` literal, the same path the
terrain and grass bakes take; a Vite plugin drops the model from a build whose
chunks never name it. Welded into the cluster's own buffers, so zero added
draws. Artifact: main 34 files / 8,420,670 bytes; procedural arm 34 /
8,421,608; kiln arm 35 / 8,642,571 (+2.6%), main JS 2,334.01 kB raw / 652.94 kB
gzip on the kiln arm. 947 tests with the five new farmhouse tests.

Visual comparison, production build, desktop, WebGPU and forced WebGL2, matched
cameras at the pen's east end and the Follow rig: main slate courses and the
mullioned windows read well; the long limewash wall is flatter and paler than
the shipped one; the gable is baked in timber rather than limewash; the porch
roof, fascia and rake boards collapse to flat dark slabs because they sit below
the main eave and the reconstructed `uv.y` clamps to zero; and the house is a
single gabled box where the procedural one had a cross wing, lean-to and hip.
The interior is visible from neither production camera.

Owner's correction the same day: the procedural house is not the reference.
Its silhouette was not proper architecture and its painterly surface was
sloppy, with worn, wavy wall colour, so the flatter wall and the simpler
massing are not defects and the comparison against it was the wrong test. The
one real defect is the shader mapping: the bake carries no surface channels,
so every roof below the main eave collapses. Verdict: not shippable as baked;
the fix is in the Kiln recipe (write the surface channels in the bake) and in
grading the house's look in-game against spec/05 with the owner's review,
scheduled for Release 2. Captures and notes under
`captures/farmhouse-compare/`.

## Asset polish pass - 2026-10-14 to 2026-10-16, shipped

Owner-directed pass to take the shipped assets to hero quality: sheep, dog,
grass, farmhouse, barn, fence and gate, treeline and scatter, their animation
and inverse kinematics, their customization, and their cost. The plan and its
boundaries are `spec/13-asset-lab.md`.

Decisions taken at the start of the pass, so they are not relitigated:

- The lab is a separate Vite entry under `lab/`, outside the production build.
  No editor code reaches `dist/`.
- Movement work is presentation only. The dog's controller and the sheep
  simulation stay unchanged, so the trace fixtures hold and existing `field-v3`
  times stay comparable. Animation and IK are in scope; `sim/tuning.ts` is not.
- The hub is the timing lane and this PC is the functional lane. The rule
  already existed inside a closed investigation log and is now in `AGENTS.md`.
- Documentation was consolidated first: closed logs moved to `docs/history/`,
  durable rules lifted into `AGENTS.md` and `spec/`, and `CLAUDE.md` added as a
  pointer rather than a second copy of the guide.
- The lab typechecks under its own `tsconfig.lab.json` and has left the root
  `include`. `npm run build` is `tsc -b && vite build`, so while `lab` sat in
  that list a type error in a development tool could fail a production build.
  `npm run typecheck:lab` is a maintainer command and not a release gate; it
  needs the sibling grass checkout to pass. The gates in `AGENTS.md` are
  unchanged.

Nothing in this pass has reached a review gate yet. Documentation consolidation
verified on 2026-10-14: `npm run lint` and `npm run typecheck` clean, `npm test`
899 passed in 111 files. No production build or probe was run, because this
change touches no shipped code.

### Grass: the shipped field against `threejs-field-grass`, 2026-10-14

Both are mounted in the lab as the `Grass (shipped)` and `Grass (library)`
subjects, over the same `assets/grass/tufts.bin`, at one camera the panel holds
across the flip. The library is a sibling checkout aliased in
`vite.lab.config.ts`, absent from `package.json`, and cannot reach `dist/`.

Already the same, verified rather than assumed:

- Palette. The library's `DEFAULT_GRASS_PALETTE` is the game's five values
  exactly: `#87995f`, `#a7b76c`, `#8b9468`, `#c0a074`, `#ffc582`.
- Blade mesh. `tuftGeometry` differs only in an import path, and the two
  `mulberry32` agree over 20,000 draws on each of six seeds.
- Decode. One divisor differs: the library scales yaw by 65535 and the game by
  65536. The game's is correct for a wrapping angle; the error is 1e-4 rad.
- Cost. 21 draw calls and 3,165,230 triangles on both, high tier, same camera.
  The library holds 12 geometries and 16 textures against 13 and 18, which is
  the bark ring and the slot grid it does not have.

Why it is not a drop-in:

- Interaction is the opposite architecture. The game packs interactor records
  and a cell-to-slot index and evaluates four oriented footprint SDFs per vertex
  on the GPU. The library rasterises a deformation field on the CPU and samples
  one linearly-filtered texel. Over this field at a 1 m cell that is 213 x 213:
  45,369 cells cleared and finalised in full every frame whatever moved, and
  181 KB re-uploaded per frame. Its own default covers 100 m at 0.5 m, so that
  cost is sized for a demo field rather than this one.
- There is no bark wave and no reduced-motion path.
- The game damps the wind octaves and the flutter where a tuft is pressed. The
  library runs full wind through flattened grass.
- The wake is quantised to 8 bits and to the cell, so its edge is softer than a
  per-vertex footprint. Both wakes are visible at the paws at 11 m; only the
  shipped one has a crisp boundary.

What the library is ahead on, and worth lifting:

- `valueNoiseField`, lattice value noise with a quintic fade, against the
  game's `sineHashField`. No axis-aligned banding in the patch and the mottle.
- `GrassMaterialStyle` and `GrassPalette`. Every grading constant the game
  hardcodes is a named field, with a second preset already written against it.
  That is the tuning struct this pass was going to have to author anyway.
- `lateralSpread` and `bladeDirectionSpread`: a pressed tuft fans instead of
  every blade leaning one way.
- `generateScatter` and `encodeScatter`: a bake API the game's own recipe can
  sit on, leaving `tools/bake-grass.mjs` and the digest rule intact.

The whole visible difference is grading, not colour: identical palette,
different `ROOT_SHADE`, `ROOT_AO`, `TIP_GOLD`, tint range, `CLUMP_HUE` and noise
function. Screenshots are lab captures on this workstation and are not
acceptance evidence; no timing was taken, because timings come from the hub.

### The painted field and the grading struct, 2026-10-14

The first shipped-code change of the pass. The library's two liftable pieces
came across without it becoming a dependency.

A defect surfaced on the way. The painted breakup lived twice: `paintedField`
in `scene/Terrain.tsx` and `sineHashField` in `scene/grass/grassMaterial.ts`,
at the same frequencies, angles and phases, each with a comment saying the two
matched so a clump on a browner patch would be browner. The copies had drifted
to different inner constants - 1.31 against 1.37, 0.47 against 0.43, 0.63
against 0.61, 0.70 against 0.72 - so the ground and the grass were near
neighbours rather than one field, and a test in each file asserted its own copy.
That is the hazard `grassMaterial.ts` names three lines above its own copy of
the recovery spring.

What shipped:

- `app/src/tsl/paintedField.ts` is now the single `paintedBlend`, read by the
  ground and by the grass. It is lattice value noise with a quintic fade,
  lifted from the library, in place of the two drifted sine pairs. The authored
  scales are carried unchanged: ~14 m patches broken by ~4 m mottling.
- `GrassMaterialStyle` and `GrassPalette` name the grading - wind speed,
  octave weights, reach, flutter, tip gold, tint range, clump hue, and the five
  greens. Defaults are the values this material has always had, and the palette
  stays a lens onto `tsl/palette.ts` rather than a second set of colours, which
  a test enforces by rejecting any hex in the file.
- Wind keeps a sine form, now named `flowField` for what it owns. It has to
  evolve, and a lattice would need re-hashing per frame to move.

Evidence, all on this workstation, which is the functional lane:

- `npm run lint` clean. `npm run typecheck` and `npm run typecheck:lab` clean.
- Production build exit 0, 2,277.04 kB raw and 634.68 kB gzip, against 2,276.64
  and 634.52 before: 0.40 kB and 0.16 kB.
- Lab, high tier, one camera, WebGPU: 21 draw calls, 3,165,230 triangles, 13
  geometries, 18 textures - identical to the same shot before the change.
- Lab, forced WebGL2 via `?debug=webgl`: backend `webgl2`, 22 draw calls,
  3,168,206 triangles, ground and grass both correct.
- Three source-shape guards changed deliberately rather than deleted. The pair
  that asserted each file's own copy of the field now assert that neither file
  has one, and `tests/painted-field.spec.ts` owns the scales, the quintic fade
  and the single-copy rule.

Not done: no hub timing was taken.

One observation that is NOT a finding, written down so it is not rediscovered
as one. The sky came out blue in some lab captures and warm in others. It is
neither the backend nor this change: both appearances occurred on WebGPU and
both on pre-change and post-change builds. The lab takes about twenty seconds
to reach its first draw on this workstation, and a capture nine seconds after
a subject change can land either side of the post chain becoming active. That
is a capture-timing artefact of how these shots were taken, not a defect in the
sky. Lab captures of a graded surface should wait for a non-zero draw count
rather than a fixed delay.

### Grass regrade, 2026-10-14

Three gradings held against each other in the lab at one camera, judged
against `spec/05-art-direction.md`. Three iterations, closed at acceptance,
inside the five the guide allows.

1. **Previous.** Light and flat. At the Classic camera the flock reads as a
   pale cluster against pale green, which fails the hard rule that the flock
   parts into individual sheep and the dog is findable in under a second. The
   root was pale enough to read as washed out rather than as shadow.
2. **Library grade**, the extracted library's numbers on the shipped material.
   Past the bar in two places. Its root occlusion at 0.62 draws a dark pocket
   at every clump base, and `spec/05` puts grass explicitly outside the outline
   pass; its tint range of 0.86 to 1.16 reads as speckle rather than as the
   subtle breakup the spec asks for. At 11 m its spine darkening at 0.90 gives
   every blade its own shading, so the field reads as countable blades against
   a reference bar that says brushstroke masses.
3. **Candidate**, shipped. The library direction as far as the spec supports
   and no further.

What moved: root shade 0.72/0.80/0.90 to 0.62/0.72/0.86, blue still down least
so the shadow stays cool; tip gold 0.16 to 0.24; clump hue 0.28 to 0.38; tint
0.95-1.05 to 0.91-1.11. What was held: root occlusion moved only 0.82 to 0.76,
and spine edge did not move at all. Wind is untouched. The painted breakup is
untouched and was never a candidate, because the grass and the ground read one
field now and regrading its frequencies would pull the clumps off their
patches.

The lab mechanism is `GrassField` taking an optional `style`, with `lab/`
holding the presets. The game mounts it with no props and gets the shipped
grading, so nothing in `app/src` carries a field only the lab reads.

Evidence, this workstation, the functional lane:

- Lint, `typecheck` and `typecheck:lab` clean. 904 tests in 112 files.
- Build exit 0, 2,277.11 kB raw and 634.68 kB gzip, against 2,277.04 and
  634.68 before the regrade: 0.07 kB raw and nothing gzipped. Both changes
  together are 0.47 kB raw and 0.16 kB gzip over the pre-pass build.
- Whole field, high tier, WebGPU: 36 draw calls and 3,423,564 triangles,
  identical to the same shot before the regrade. A grading is literals in an
  unchanged graph, and the counters say so.
- Forced WebGL2 via `?debug=webgl`: backend `webgl2`, 37 draw calls, 3,462,348
  triangles, grading correct.

Not done at the time: no hub timing, and no phone-aspect capture. That gap was
closed on 2026-10-15, below.

### Grass regrade: acceptance, 2026-10-15

Accepted on colour. The captures `spec/05` asks for exist at both aspects, and
the three grading lines it names hold at every one of them.

Captures are listed in `captures/grass-regrade/README.md` (gitignored). Two
lanes, both on this workstation, which is the functional lane:

- **Lab**, dev server, WebGPU, high tier, flock 200, at 2560x1440, 390x844 and
  844x390. Shipped, Previous and Library grade flipped at a held camera, at the
  Whole field frame and the Grass frame.
- **Production build**, `tools/playtest-profile.mjs` against `dist/` at the
  three viewports `spec/13` names. `art-classic-webgpu` and `art-follow-webgpu`
  report backend `webgpu` at 2560x1440, 48 and 54 draw calls;
  `art-phone-high-webgpu` reports `webgpu` at 390x844 ratio 3, 49 draw calls;
  `art-phone-low-webgl2` and `art-landscape-low-webgl2` report backend `webgl2`
  at 390x844 and 844x390 ratio 3, 32 and 42 draw calls. Canvas non-blank on all
  five. **The forced-WebGL2 and phone-aspect pairing is therefore checked.**

The beauty angle is the lab's Whole field frame at bearing 2.43 rad. That is
not an approximation of `camera/beautyOrbit.ts`, it is the same pose:
`RADIUS 36` and `HEIGHT 9` against the subject's 36 m and 9 m, opening bearing
`atan2(0.45, -0.52) = 2.4279`, and the same `centre + sin(angle) * radius`
placement. Only the aim height differs, 2.2 m against the turntable's 2.25 m.

The angle cannot come from the production build. `CameraRig` reads debug flags
behind `import.meta.env.DEV`, so `?debug=beauty` is stripped from `dist` and
`grep beauty dist/assets/*.js` finds nothing. `playtest-profile.mjs` encodes
this already, as a `beautyCameraAvailable` check that fails whenever the beauty
camera is asked for. The beauty angle is a dev-server and lab frame by
construction, and `spec/13`'s "captures from the running production build"
cannot be met for that one camera.

Measured rather than judged, since "saturated shadows, hue-shifted cool, never
gray or black" is a claim about pixels. Grass-hued pixels only, darkest decile
against brightest, in the production captures:

| scenario | shadow hue shift | shadow saturation | shadow value |
| --- | --- | --- | --- |
| `art-classic-webgpu` | +18.7 deg | -0.025 | 0.564 |
| `art-follow-webgpu` | +30.3 deg | -0.036 | 0.527 |
| `art-phone-high-webgpu` | +17.8 deg | +0.009 | 0.576 |
| `art-phone-low-webgl2` | +10.2 deg | +0.108 | 0.606 |

Every shadow shifts toward cool, no saturation moves more than 0.04 against the
lit decile, and no value is within 0.35 of black. At the beauty frame the
shipped grading reads +7.1 deg and +0.094 on phone against +5.0 and +0.092 on
desktop: the grading does not change with aspect, which was the open question.

Against the other two gradings at the same frames, the shipped one is the
middle it was designed to be. Shadow saturation gain at the beauty frame:
Previous +0.076, Shipped +0.094, Library +0.131. At 11 m the ordering holds and
the reason the middle is right is visible: Library gives every blade its own
spine shading and the field reads as countable blades, Previous has no root
depth at all and reads washed, Shipped holds the mass. That judgement now
exists at phone aspect, where it previously did not.

Open, and not weakened to pass:

- **The flock-parting rule is not re-tested.** `spec/05` requires that at
  Classic camera height the flock parts into individual sheep and the dog is
  findable in under a second. Every capture here has the dog findable, but the
  probe's art workload drives real `W` input for the whole sample, so the dog
  outruns the flock and no production frame has sheep in it. The grading is
  accepted on colour and mass; that one line rests on the 2026-10-14 desktop
  pass. The lens is not the obstacle: `CameraRig` computes
  `baseFov = 45 + (view.fov - 45) * weight` and the Follow weight is zero in
  Classic, so Classic is a 45 degree lens at both aspects and the lab's fixed
  canvas lens is exact there.
- **No hub timing.** Unchanged. Every `checks.boot` in the probe run failed,
  and `art-phone-high-webgpu` also failed `frames` and `freezeFree`. Those are
  timing checks on the functional lane with other work on the machine, so by
  `spec/13` they are not reportable either as performance or as a regression.
  They are recorded here so the `pass: false` in
  `captures/profiling/grass-gate-receipts/report.json` is not read as a visual
  failure. The visual checks in the same run passed.

Two tooling defects found while taking these, neither caused by the regrade and
neither fixed here:

- `playtest-profile.mjs --flock-views` clicks a button named `Title` to restart
  a run. The pause menu offers `Resume`, `Settings` and `End run`; `Title`
  belongs to a different panel. The locator times out after 30 s and takes the
  whole scenario's `checks` down with it. This is the flag that would have
  produced the flock frames the open item above needs.
- `?debug=webgl` in the lab takes far longer than WebGPU to reach a first draw -
  more than two minutes at both 2560x1440 and 390x844, against about twenty
  seconds for WebGPU. It does arrive; a `WebGLTimestampQueryPool` warning
  confirms the backend initialises. A lab session wanting the WebGL2 grading
  should expect the wait or take the receipt from the production build.

### Sheep legs: a solved knee, and the answer on `math`, 2026-10-15

The sheep's mid-leg fold was the airborne swing arc times a hand-tuned half of
stride, gated to the recovery half of the cycle. It bent the joint on a
timetable rather than because anything had moved, so the three terms that
actually move an endpoint - terrain planting at +/-0.08 m, the body bob at
+/-0.016, the fore-aft swing at +/-stride - changed the shoulder-to-sole
distance with no knee response at all. The limb telescoped. A sheep standing
across a hummock stretched one leg by a seventh of its length and nothing in the
pose bent.

`sheepKneeBend` in `flockTuning.ts` is now the closed-form two-bone solve, and
`sheepParts.ts` measures each chain off the same rings the leg is lofted from,
so the solver and the mesh cannot drift apart. The solve lands back on the
modelled joint to a hundredth of a millimetre on both pairs - 0.050 m of carpus
in front, 0.053 of hock behind - which is the check that it reads the rig
correctly, and `tests/animal-presentation.spec.ts` holds it.

Three things had to change with it:

- **The front chain was authored dead straight**, 0.0001 m of slack on a 0.5605
  chain. A two-bone bend goes as the square root of how far the limb has
  shortened, so a straight chain sits on a cusp with infinite slope: the first
  frame of a hoof leaving the ground snapped the knee 76 mm. The carpus moved
  forward to `dz: 0.065`, which gives it the 2.0% slack the hock always had and
  brings that frame to 45 mm, in line with the hind leg beside it.
- **`KNEE_COMPLIANCE`, 0.035 m,** is a residual flexion under the square root.
  The authored hoof sweep over-reaches the chain by 12% at each handover - a
  0.6 m stride on 0.57 m of bone - so the pose crosses full extension twice a
  cycle whatever the rest pose is, and the exact solve answers each crossing
  with 50 mm of knee in one frame at a walk, in plain view, on a planted leg.
  The residual is a constant and cancels in the difference the shader displaces
  by, so it changes the shape of the response and not the rest pose. It costs
  5% of the fold at peak recovery, where the leg is airborne and tucked.
- **The body bob is deliberately not in the span.** It is the thorax riding over
  the scapula rather than the shoulder joint translating, and a chain this close
  to straight answers far too loudly: 4 mm of idle breath would come back as
  9 mm of knee, a new idle motion on the title screen for no gain. What it
  leaves behind is the 16 mm the shoulder ring rises at a dead run, already
  carried and already named as compliance.

What the pass bought, measured over every agitation, both terrain limits and a
full cycle walked in real frames:

- A standing sheep on a hummock folds the uphill knee 0.070 m and straightens
  the downhill one 0.026 toward its chord. Both were zero.
- An idle sheep on flat ground is bit-identical to the modelled mesh.
- Worst per-frame knee travel anywhere is 71.7 mm, at a dead run where the hoof
  is covering 153 mm in the same frame. The worst knee-to-hoof ratio is 2.60,
  and it is 16.1 mm against 6.2 at an agitation of 0.04.
- Each pair folds the way its own joint is modelled, carpus forward and hock
  back, with the direction read from the rings. Neither leg folds through its
  own rest pose anywhere in the envelope, and it cannot: `sqrt(a^2 + c^2) - c`
  is less than `a` for any compliance `c`.
- The fold rides a linear tent peaking at the bend ring instead of a sine.
  Bones are rigid, and the sine gave the `t = 0.2` ring 0.59 of full bend where
  the chain gives 0.36, bowing the radius outward. It is also one transcendental
  cheaper than what it replaces.

The hand-tuned constant was not the wrong size, only blind: at full run the
solve returns 0.140 m of bend on the front chain and 0.154 on the back, against
the authored 0.5 * 0.3 = 0.150. What it could not do was answer a hill, bend
during stance, or stop the hock over-folding by 30% at speed.

**`math` from pmndrs is not adopted, and the open question is closed.** The gate
in `spec/13-asset-lab.md` asks for the FABRIK result to be visibly better and
not merely equivalent. Every leg chain in this game is two bones - the dog's
`DOG_JOINTS` triples in `dogLegSolver.ts` and the sheep's shoulder-knee-sole
rings - and two bones have an exact answer in one step, the law of cosines with
the cosine cancelled. FABRIK is iterative because three or more links have no
closed form; on two links it converges toward the line that is already written
here. Adopting it would spend a dependency, a version pin and a loop to
approximate an exact answer, so it cannot clear its own gate. The package was
never installed and is not in `package.json`. Reopen it if a chain with three
bones is ever authored - a real scapula, or a stifle and hock modelled apart -
because that is the case the library exists for.

Not done, and not weakened to pass:

- **The hoof path still over-reaches the leg by 12% at speed**, 0.641 m of span
  against 0.572 of bone, which is what the compliance term is absorbing. The
  honest fix is a compass gait: the hip dips as the limb swings off vertical,
  which on a 0.56 m leg at 32 degrees is 0.085 m against the 0.016 the body bob
  carries. That is a five-fold change to a bounce the owner has just accepted,
  and it is coupled to the ballistic-bound receipt, so it is a change of its own
  and not a correction to this one.
- **No motion review.** The legs were checked functionally in the lab at 4 m and
  read as jointed limbs, with a hock behind and a flexing carpus in front and
  nothing inverted. Captures at both gameplay cameras and both aspects have not
  been taken, and the obstacle is the one already recorded above: the probe's
  art workload drives `W` for the whole sample, so the dog outruns the flock and
  the Classic capture from this very run has the sheep as a distant raft at the
  top edge with no leg visible at all. This is the same defect that holds the
  grass regrade's flock-parting line open, and it now blocks a second gate.

Hub timing, 2026-10-15, `mk-os`, GTX 1660 Ti, `performance` profile, 1440x900,
Classic camera, 60 s each. The candidate is `5332de35`; the baseline is the same
tree with `sheepMotion.ts`, `sheepParts.ts` and `flockTuning.ts` reverted one
commit, so the delta is this change alone. Preflight on every run was at or
under 2.5% CPU and 0% GPU, inside the 5%/15% requirement. Receipts in
`captures/stability/hub-receipts/`.

| build | backend | frames | p50 | p95 | p99 | max | >100 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | WebGPU | 7,192 | 8.30 | 8.40 | 8.40 | 25.0 | 0 |
| candidate | WebGPU | 7,191 | 8.30 | 8.40 | 8.40 | 25.0 | 0 |
| baseline | WebGL2 | 7,195 | 8.30 | 8.40 | 8.40 | 16.7 | 0 |
| candidate | WebGL2 | 7,194 | 8.30 | 8.40 | 8.40 | 16.7 | 0 |

Identical to the last digit the probe reports, on both backends, with 40 draw
calls and 3,959,384 triangles on all four runs. **Read it as a bound, not a
measurement**: the hub presents at 120 Hz and every percentile here is the
8.3 ms refresh interval, so what the run establishes is that the solve stays
inside the frame the display asks for with at least 8.3 ms of headroom against
the stated 16.7 ms budget - not that it costs nothing. A length, a divide and a
square root per vertex, against the sine it replaces, is too small for this lane
to resolve.

Bundle: the initial JS chunk goes from 631,341 to 631,697 gzipped bytes, +356
for the solve and its constants. The release probe passes at 635,615 gzip
against a 1,572,864 limit and 6,164,223 estimated first-load bytes against
8,388,608, with a clean client secret scan.

Startup still fails its 2,000 ms gate on every run - 2,698 and 3,478 ms on the
baseline, 3,835 and 5,332 on the candidate. That is one sample each with the
candidate run first into a cold shader cache, so it establishes nothing in
either direction and is recorded rather than read. The gate was already failing
before this change.

### Dog legs: a swing that starts where the limb can reach, 2026-10-15

Measured the same way the sheep were, but through the real rig rather than a
twin: a `DogRig` posed by the real `advanceDogMotion`, frame by frame, at ten
speeds from 1 to 25 m/s, reading the posed bone positions back out. Two defects,
both invisible to the existing guards because every one of them held.

| speed | hind reach | paw off its commanded target | worst joint travel in one frame |
| --- | --- | --- | --- |
| 4 m/s | 0.97 | 0 mm | 50 mm |
| 8 m/s | 1.0000 | 11 mm | 141 mm |
| 15 m/s | 1.0000 | 69 mm | 196 mm |
| 25 m/s | 1.0000 | 133 mm | 262 mm |

From 8 m/s the hind limb is at full extension for part of every cycle, 13% of it
at a sprint; the fore limb joins at 20. The gait's own planting was never the
problem - stance slip measures zero at every speed, because `dogStride` is
already derived from the stance share and the cadence, the same constraint the
sheep were given this week.

**The sub-frame one.** A swing's foot-drift offset is read on the first airborne
frame against that frame's nominal. But a frame almost never lands on the stance
handover: it lands some fraction past it, and over that fraction a world-locked
foot keeps travelling backward under the body while the swing curve already has
it standing still at `-stride`. The gap is speed times that fraction - 93 mm at
DOG_MAX_SPEED - and it was banked as drift and held into the swing by
`remaining`, at the one moment in the cycle when the hind limb is already at full
stretch. `sampleDogPaw` now also reports `stanceTravel`, the stance ramp carried
on past its own end, and the offset is measured against that instead. The two
curves meet exactly at the boundary, so a foot that is where the ramp says it is
has no drift to carry; a real turn's drift is untouched, and the two lift-off
tests that guard the turn case pass unchanged.

**The structural one.** The hind paw rests 0.08 m behind its hip, so at the end
of a 0.4 m drive it is 0.55 m aft of the hip and 0.76 below it: 0.94 m of demand
on 0.935 m of bone, with the body bob near its peak at exactly that moment.
`GALLOP_DROP` brings the chest down past a trot - 0.085 m, gated at 5 m/s,
leaving 0.29 m of belly clearance at the deepest rib. It is where a real dog
gets the same reach back, and it is already how this rig answers the same problem
under bank.

After both, over every speed, both pairs and a full cycle: the paw lands on its
commanded target to within a tenth of a millimetre, no limb exceeds 0.954 of its
chain, stance slip stays at zero, and the worst single-frame joint travel falls
from 262 mm to 114 - against a paw covering 417 mm in that same frame. Three
guards in `tests/dog-rig.spec.ts` hold all of it, and each was checked against
the old behaviour first: they fail at 91 mm and 0.99999.

The sheep's `KNEE_COMPLIANCE` was tried here and is not shipped. It removes the
square-root cusp at full extension, which is what it is for, but with the pose no
longer visiting full extension there is no cusp to remove and it cost 5 mm of paw
placement at every speed. A guard on reach is the right form of that protection,
and that is what the second test is.

Not done:

- **No lab verification at the time.** CORRECTED, 2026-10-15: this entry
  originally said the lab's treadmill did not latch on the Dog subject. It does
  latch. The claim came from reading `button.className` to decide whether a
  toggle had taken, and the lab's `Button` styles inline and sets no class, so an
  empty className was a false negative, not a dead control. The treadmill's real
  defects were different and are recorded below. Every number above still comes
  from the rig itself.
- **No hub receipt.** The change is two scalar expressions in a per-frame pose
  that already runs; there is no plausible cost, which is a reason to say so
  rather than a reason to claim it measured.

### The lab treadmill, and the snap at the end of a swing, 2026-10-15

Two findings, one in the lab's own tooling and one in the gait, found because
the first was blocking the second.

**The treadmill.** `Sprint` latched and did nothing: the module's only effect
returned early unless `walking` was also on, so a lit button drove no keys.
Sprinting is walking, faster, so the store now keeps the pair consistent from
either end. The larger problem was that it held `forward` and nothing else, and
`forward` under Classic's basis is the constant world +z - straight at the gate
standing open at z = 100. The lab mounts no `CameraRig`, so `cameraModeBlend`
stays 0 and that basis never changes. The dog left the field in about fourteen
seconds, parked in the pen at z = 107.5, and sat down, with the lab camera
following it out there. It now chooses which of the eight compass directions
four movement keys can describe from where the dog actually is: straight
shuttles through the flock and turns around at 50 m, a held turn orbits at 35 m.
Still only keys - the conditioner decides everything about how that direction is
taken up, which is the whole contract of the file.

Measured in the browser, at a sprint, over 66 seconds: the radius from the
flock's own ground stayed between 0.1 m and 60.2 m, against 80 m to the nearest
fence, with legs of about 100 m between turnarounds.

It also re-presses the held keys every 0.25 s rather than trusting its own cache
of them. `keyboard.ts` drops every held key on blur and on tab-hide, and a hot
update leaves the replaced instance's keyup to land after the new one has
recorded the key as held; either way the diff saw no change and never pressed
again. That was measured as a dog standing still with KeyD down for all 132
samples over 66 seconds, with the loop still rendering at 13.9 ms - which is
indistinguishable from the broken treadmill the file was opened to fix.

**The snap.** A planted paw stands still in the world, so its body-space travel
sweeps backward at exactly the body's ground speed. The swing was a smoothstep,
which leaves and arrives with zero body-space velocity - so the paw's world
velocity stepped by the whole of the dog's speed in the frame it lifted and again
in the frame it landed. Through the rig, at two thirds of DOG_MAX_SPEED, the paw
covered 98 mm on the frame it touched down and 0 mm on the next. `sin` for the
lift is worse than it looks for the same reason: it is steepest at exactly those
two frames, and threw the paw upward at 1.7 m/s in the one it lifted.

The swing is now a cubic whose end slopes are the stance sweep, and the lift is
`sin` squared. The two slopes are not equal, because their costs are not: the
rearward bulge lands just after lift-off where the hind limb is already at 0.95
of its bone, and the forward one lands where the limb is folding.

| | touchdown step, 2 / 8 m/s | lift-off step | reach, steady |
| --- | --- | --- | --- |
| before | 59 / 141 mm | 56 / 134 mm | 0.954 |
| after | 19 / 41 mm | 29 / 124 mm | 0.957 |

The foot is placed exactly, rather than slammed forward into the ground, up to
6.3 m/s; above that it takes what the bone allows, 82% of the match at two thirds
of DOG_MAX_SPEED and 43% at a sprint, where a paw covers 25 cm a frame.

**And a third thing, which was already there.** A stance is a distance - exactly
`2 * dogStride` - but `dogStanceShare` turns it into a share of the cycle at the
CURRENT speed. Change the speed under a foot the world has locked down and the
two stop agreeing: braking raises the stance share, the foot is held past the
stride it budgeted, the body walks away from it, and the limb is pulled straight.
On a 10 m/s^2 brake from DOG_MAX_SPEED - gentler than DOG_ACCELERATION, which is
what the player gets - the hind chain reached 1.0000 of its bone and the solver
clamped, leaving the paw 145.6 mm off the ground it was meant to be standing on.
Confirmed present with the shipped curve, so it is not something this week
introduced; the lab treadmill turns around constantly, which is why it surfaced
now. A contact now ends where its stride ends and slides forward past that, which
is what a braking dog's foot does on grass. Reach 1.0000 -> 0.9559, paw
145.6 mm -> 0.00 mm off target, and every steady speed untouched.

Open, and recorded in `tests/dog-rig.spec.ts` rather than left to be rediscovered:

- **The gallop transition drags a foot's phase.** `sampleDogPaw` offsets each
  foot by a share of `sprint` computed from the instantaneous speed, so foot 3
  moves 0.3 of a cycle between DOG_MAX_SPEED and DOG_SPRINT_SPEED. A dog surging
  across that band has that phase dragged by 0.22 of a cycle - about 1.4 whole
  stances at those speeds - so a foot is locked down mid-sweep, 196 mm behind
  where a contact belongs, and the limb reaches the solver's clamp. The sweep
  bound can only take back the part past the stride. The fix is a transition that
  re-times the swing instead of moving a foot's phase.
- ~~**The sit is still wrong.**~~ Done, below.
- **No hub receipt.** Curve evaluation in a per-frame pose that already runs,
  with one added `Math.hypot` per foot; there is no plausible cost, which is a
  reason to say so rather than to claim it measured.

### A dog that sits, and feet that stop without teleporting, 2026-10-15

**The sit.** It was authored by eye and it showed. A sitting dog rests on three
things - both fore paws, the point of buttock, and the hocks with the metatarsus
lying flat - and two of those are contacts this rig can be solved against.
`SPINE[0]` is the point of buttock, rest-space z -0.96 with its underside at
y 0.83; the ground is y 0.20 where the paws contact. So a sit has to bring that
point down 0.63 m. The pose that shipped brought it down 0.30 while the
`-0.17 * moving` ride height RAISED the root by 0.17 as the dog stopped.

| | shipped | now | wanted |
| --- | --- | --- | --- |
| point of buttock | 0.406 | 0.203 | 0.200, the ground |
| hock | 0.374 | 0.200 | 0.200, the ground |
| fore reach | 0.973 | 0.950 | near straight, off the cusp |
| hind reach | 0.692 | 0.564 | folded |

The four numbers were solved against those contacts on the real rig -
sensitivities measured one lever at a time, then a grid - rather than nudged
until it looked right. The hock is not placed on the ground by a rule of its
own: once the hip is low enough and the foot is under it rather than ahead of
it, the solver's existing backward pole puts the middle joint 0.41 m behind the
hip at ground level, which is the hock down with the metatarsus flat and the
foot forward of it. That is what `SIT_HIND_ADVANCE` is for, and why it is 0.22
rather than something that looks like a step.

**And the stop.** Found while measuring the sit, present with the shipped code:
`dogStride` collapses to zero with the speed, so on the frame a dog reaches a
standstill every paw's commanded travel becomes zero at once and four feet
caught anywhere in their cycles are moved to the standing stance in that one
frame. Measured at 471.9 mm of paw and 249.7 mm of knee in a single frame, with
the limb reaching 1.0000 of its bone on the way - the same thing again a few
seconds later when the sit dropped the locks. A foot now keeps where it was
drawn and the difference decays over 0.35 s, so it gathers rather than
teleports: 471.9 mm -> 53.4 mm.

What is left of that 53 mm is the last two frames of the speed ramp, over which
`dogStride` itself collapses from 0.4 m to nothing while the feet are still on
the swing curve. That is the same root cause one step upstream, and it is the
third place this week it has been paid for, after the braking stance and the
gallop transition: **gait geometry is a function of the instantaneous speed**.
Worth fixing once, properly, rather than a fourth time. Done, below.

### A contact belongs to the foot standing on it, 2026-10-15

The root cause the three sections above each paid for separately. A stance is a
DISTANCE - exactly `2 * dogStride`, the paw sweeping from +stride to -stride
while the body covers the same ground, which is why stance slip measures zero at
every steady speed. `dogStanceShare` is what turns that distance into a share of
the cycle at a given speed. Reading that share per frame means **the gate
deciding when a planted foot lifts moves while the foot is on the ground**, and
every symptom followed from it.

Worth writing down what the two curves actually are, because the shape of them
is why the fix is split the way it is. Substituting the share into the stride:

| speed | stance share | stride |
| --- | --- | --- |
| 0 | 0.62 | 0 |
| 1 | 0.62 | 0.205 |
| 2.112 | 0.62 | 0.400 |
| 4 | 0.370 | 0.400 |
| 12 | 0.183 | 0.400 |
| 25 | 0.134 | 0.400 |

Above 2.112 m/s the stance clamp is off and the two terms cancel exactly:
**stride is flat at `DOG_MAX_PAW_REACH` for the whole running range** and the
share carries all of the speed dependence. Below it the dog is taking shorter
steps at the gait rate's floor and the stride collapses with the speed - which
is the standstill, and nowhere else. So the share is a timing gate that the
whole contact is measured against, and the stride is geometry; they need
different rules, and giving them the same one is what made the earlier attempts
trade one defect for another.

**One rule.** A foot on the ground is world-locked and carrying weight, so the
contact it committed to at touchdown is what it gets. A foot in the air is only
choosing where to land, so it may be re-aimed and re-timed freely, and that is
where every change the speed asks for is now taken. In `DogMotion`:

- `footStance` is fixed at touchdown and held for the whole cycle.
- `footStride` is frozen while the foot carries weight and closes toward the
  live value across the swing, arriving at touchdown. Deliberately not
  rate-limited: a cap at a third of what a swing costs anyway made a foot LAND
  still owing 318 mm of stride, standing 302 mm in front of its own contact with
  the limb against the solver's clamp for a quarter of a second. Measured, the
  cap made the hard brake worse, not better - 1.0000 of the chain against
  0.9901. Paying it in the air is the whole point of doing it in the air.
- `footOffset` is the foot's place in the gait order, moved at `DOG_RETIME_RATE`
  and only while airborne. The trot-to-gallop separation drags foot 3 by 0.6 of
  a cycle, and doing that to a foot on the ground pulled it along its own stance
  ramp - the one case the `dogRig` sweep bound could never catch, because the
  body had not travelled any further than it should have.

Measured through the real rig, six speed profiles, counting every foot-frame
where a limb sits within 1% of straight - the cusp where a two-bone solve has
infinite slope and a millimetre of paw is tens of millimetres of knee:

| profile | shipped | now |
| --- | --- | --- |
| gallop surge, 8 to 20 m/s | 1.0000, 7 frames | **0.9525, none** |
| sprint surge, 12 to 25 m/s | 1.0000, 14 frames | **0.9537, none** |
| standing start to 15 m/s | 0.9983, 1 frame | **0.9710, none** |
| brake, 15 to 2 m/s | 0.9575, none | 0.9559, none |
| brake to a dead stop | 1.0000, 219 frames | **0.9901, 1 frame** |
| stop, then sit | 1.0000, 307 frames | **1.0000, 30 frames** |

2106 clamped foot-frames to 52. Steady-state reach is unchanged to four decimal
places at every speed, and stance slip is still zero.

**Two things it exposed.** Neither was a regression - both are in the shipped
code too - but both became visible once a stopped dog's feet really were at
rest rather than merely heading there:

- The sweep bound's allowance was `2 * footStride`, and a standing contact has
  no stride at all, so twice nothing is an allowance of nothing. A dog spawned
  at rest and accelerated had the bound collapse its feet onto the body root on
  the second frame: 547 mm of paw with all four limbs pinned straight. The
  allowance now has `DOG_MAX_PAW_REACH` as a floor, and the carry is along the
  body's own displacement by the excess rather than a lerp toward the root by
  the excess's share of the sweep - the two agree while the excess is small and
  part company as it grows, and the second is what had the singularity.
- `-0.17 * moving` lowers a moving dog and goes to nothing at a standstill, so a
  standing dog stood at its bind pose - where the hind chain is 0.17% from
  straight. `STAND_DROP` is a 0.045 m floor on it, which buys the fore limb back
  to 0.940 and the hind to 0.950, costs 4.5 cm of a 1.05 m standing height, and
  applies only below 0.4 m/s where the moving term is not already deeper.

**And one patch retired.** The 0.35 s settle decay that brought the standstill
teleport down from 471.9 mm to 53.4 mm is gone, along with its three arrays.
With a contact holding the stride it planted with, and the world lock no longer
given up below a walk, there is nothing left to gather from: removing the decay
entirely leaves the measured standstill step where it already was, at 56.0 mm.
The `dogRig` sweep bound stays as a backstop - what the share buys is a contact
of the right length in cycles, and the body's speed still decides what that is
worth in metres, so a foot that plants and then accelerates hard can still
outrun its stride. Nothing reaches it now, but the margin is a function of the
acceleration the movement layer happens to allow, and a limb snapping straight
is not an acceptable way to find out that has been raised.

Still open, and now the oldest thing here:

- **Both chains bind straight.** The hind limb is 0.17% short of straight in the
  bind pose and the fore 0.77%, so the bind pose is itself within a millimetre
  of the cusp. `STAND_DROP` above is a floor on the symptom, and `BANK_ROOT_DROP`,
  `GALLOP_DROP` and `CROUCH_DROP` all exist to buy bend back the same way. The
  sheep's front leg had the same problem this week and was fixed by authoring a
  real carpus into the rings; the dog wants an authored stifle angle, which moves
  the bind pose and so the skinning, and is a bigger change than anything above.
- **The dead stop still clamps, for 30 frames of a sit.** Down from 307, and the
  one frame at 1.0000 is the fore limb passing through near-straight as the sit
  ramp takes over. The sit itself is solved against its contacts and measures
  0.950; it is the transition into it that is unmeasured, and it is next.

### The homestead, and a walk-in house built with Kiln, 2026-10-15

Two separate pieces of work, kept separate on purpose.

**The shipped cluster was corrected in place.** The owner's reading - static
smoke, an uncanny wall, a barn that needed love - resolved into three measured
faults. The painted breakup in `farmhouse/surfaceMaterial.ts` was running at
5.4x its authored feature size, measured over a 16.5 m run: boards came out
6.6 m, wall patches 11 m, stone grain 16.5 m, so five different skins were flat
fills and the building had no surface at all. `STROKE = 5.4` scales the sample
point and the threshold edge together, so every step keeps its world width.
The wall patch was then only 3:1 stretched against the boards' 14:1 and 21:1,
which drew an arcade of arches along the foot of every wall; it is 9:1 now.
Nine openings sat on two faces of the house and two of the barn, leaving the
sunlit 18.6 x 5.8 m front and both 10.8 x 10.5 m barn gables blank - a roof says
cottage and a blank wall says warehouse, and the eye believes the wall. There
are 23 now, no two alike, for 44 triangles and no extra draw. `DRESS` was the
most saturated band in the cluster at 41% and read as pink skirting; it lost a
third of its chroma and kept its value ladder. The chimney smoke is a
vertex-stage plume on a 7.2 s cycle instead of a static cone.

**The walk-in house is a prototype, and it is lab-only.** `assets/house/` holds
an editable Kiln program and the GLB it bakes to; `lab/src/kilnHouseAsset.ts`
welds that GLB into one buffer per farmhouse band set and the shipped
`makeFarmhouseSurfaceMaterial` draws it. Nothing under `app/` imports any of it
and `dist/` contains no GLB. The point was to answer whether an outside asset
can arrive inside this game's painting, and it can: the look lives in
`bands.ts` and in the `uv.x`/`uv.y` channel convention, both of which the
importer reconstructs from material name and world position, so no new shader
and no texture were needed.

Measured, with the ground off and both subjects at one camera: the Kiln house
is 3,440 triangles in 6 draws; the whole shipped cluster - house, cross wing,
two lean-tos, porch, barn, cupola, outshot, hood, 23 openings and the plume -
is 4,874. One building with an interior costs two thirds of the homestead.

Verified 2026-10-15: `npm run typecheck` and `npm run typecheck:lab` clean,
`npm run lint` clean on every touched file (the 2 errors and 2 warnings it
reports are inside another worktree under `.claude/worktrees/`), `npm test`
940 passed in 113 files, `npm run build` exit 0 at 2,286.69 kB raw and
637.46 kB gzip against 2,277.14 and 634.68 before: 9.55 kB raw and 2.78 kB
gzipped, all of it the procedural pass, none of it the prototype.
`npm run probe:release` exit 0: initial JS 637,877 gzip against a 1,572,864
budget, first load 6,166,485 estimated transfer against 8,388,608, secret scan
clean, and - the line that matters for the prototype - `builtExternalModels: 0`,
which is the build's own evidence that no GLB reaches `dist/`.
`node tools/record-house-asset.mjs --check` re-bakes from a scratch directory
with no `.kiln/` cache and reproduces the recorded GLB byte for byte.

Four faults were then found on owner review, and all four are fixed. The gable
wall was not breaking through the roof, it was exactly coplanar with it: the
gable triangles took the roof's own span and rise, so their top edge and the
slate's top face both finished at y 10.72 and z-fought as a bright stripe down
the pitch. They are built 200 mm inside the slab now. The eaves overhang was
1.15 m, which on this pitch drops 1.23 m and put the eaves edge at 4.44 against
first-floor window heads at 5.05 - the roof hung down past the top of the
windows; at 450 mm it clears them by 338 mm. Every corner had a 275 mm square
full-height hole, because `createGableShell` builds walls on their centrelines
and the long walls stopped short of the end walls' outer face; four corner posts
close them flush. And there was no first floor: the deck and the stair were
right, but nothing made the deck a floor, so eight windows opened onto a lid
with a 4.9 m void over it. It now has a railed landing, three bedrooms, a
ceiling at the wall head and a loft hatch, and two first-floor windows are lit.
The asset went from 3,224 triangles to 3,440.

### Hub receipt for the asset polish pass, 2026-10-16

Taken on `mk-os` over the `hub` alias against a copied production `dist/` built
from ac3fe5fa, 60 s per backend, native viewport, Classic camera, adapter
nvidia/turing with `fallback: false`. Preflight: GPU 0%, load average 0.19, top
process 0.6%, well inside the 5%/15% gate. The receipts are at
`captures/stability/hub-receipts/asset-polish/` on this machine; that tree is
gitignored, as every receipt in this lane is, so the numbers below are the
record and the files are only their provenance.

| | frames | p50 | p95 | p99 | max | over 100 ms | ready |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WebGPU before | 7,191 | 8.30 | 8.40 | 8.40 | 25.0 | 0 | 3,835 ms |
| WebGPU after | 7,185 | 8.30 | 8.40 | 8.40 | 25.0 | 0 | 2,591 ms |
| WebGL2 before | 7,194 | 8.30 | 8.40 | 8.40 | 16.7 | 0 | 5,332 ms |
| WebGL2 after | 7,197 | 8.30 | 8.40 | 8.40 | 16.7 | 0 | 2,824 ms |

No frame-time regression: every percentile and the max are identical to the
previous candidate receipt, on both backends, with zero frames over 100 ms.
Startup came down 1,244 ms on WebGPU and 2,508 ms on WebGL2, which is the grass
and flock work in this branch and not the farmhouse pass. `startupPass` is still
false against the 2,000 ms budget, as it already was before this branch.

TWO LIMITS ON WHAT THIS RECEIPT SETTLES, because reading it as a clean sweep
would be reading it wrong. First, p50 8.30 against p95 8.40 is a vsync-locked
distribution near 120 Hz, so it establishes that the frame budget is met with
headroom and NOT how much headroom there is; a cost increase smaller than the
remaining 8.4 ms would not appear. Second, the draw readout is identical at 40
calls and 3,959,384 triangles, and that is not evidence about the farmhouse:
the probe's settled screenshot is a Classic camera over open grass with the farm
out of frame, so the readout never sampled the buildings. What the receipt does
cover is the whole-run distribution of a 60 s Classic run, which is the thing
the 16.7 ms budget is written against.

Not done: the barn has had no equivalent of the Kiln treatment, and no targeted
measurement of the farm cluster itself - the probe has no camera that frames it.

## Typography, label jitter and the screen-anchored cue, 2026-09-22

Owner playtesting on a phone reported text jitter on the gate label and the
sheep nameplates, and a Follow camera that shook while turning. Both were
measured before anything was changed, and neither cause was the one the
symptom suggested.

**Type.** The candidate fix was `@pmndrs/glyph`, a runtime text renderer. It
was in `package.json` and no shipped code read it, so the first question was
whether to adopt or drop it. Dropping it, because it would have made the
reported defect worse: `app/src/scene/autoTier.ts` caps the canvas device
pixel ratio between 0.8 and 1.5, while DOM composites at the device's own
ratio of 3 on the phone that complained, so moving these labels into the canvas
would render them at roughly a third of their current resolution. The interface
now runs on one self-hosted variable family, Piazzolla, subsetted from an
in-repository `fonttools` recipe to a 26 KB woff2 with provenance, licence and
digest recorded in `assets/fonts/README.md`. Reasoning in `spec/11-typography.md`.

**The jitter itself** was sampling and rounding, not rasterisation. The gate cue
projected at 20 Hz against a camera that moves every frame, rounded its
transform to whole pixels - three device pixels at a ratio of 3 - and carried a
150 ms CSS transition on a transform rewritten every frame, which trails the
camera and rubber-bands rather than ever landing. All three are fixed and the
rules are written down where the next label will find them.

**The gate cue** was rebuilt twice, and the second time from a screenshot. The
first pass replaced a "Gate / 161 m" pill placed from the gate's projected point
- which over a full turn on a phone sat on one of two x values at 29 of the 31
bearings it appeared at, and jumped 245 px for one degree of turn with the gate
behind - with a 44 px compass riding an ellipse inscribed in the safe area.
Owner review of that then caught the reading itself: the cue was placed from the
GROUND bearing, which is not the angle the opening subtends on screen. Follow
looks down 22.5 degrees and Classic 44.9, which foreshortens the forward axis in
the image and leaves the sideways one alone, so ten degrees of turn walks the
opening 26.7 degrees round the frame while the needle moved seven. Over 84,377
poses of the two rigs across the whole field the needle pointed up to 39.7
degrees away from the opening, and a full 180 degrees away inside five metres of
the gate, where the camera axis has already passed over it. Reading the same
direction in the camera's own basis is exact: 0.0000 degrees over those poses,
0.005 end to end in the running build, and no fov, aspect or pitch in the
function, which is why the two camera modes need no case between them.

Measuring that turned up a second reading of the same complaint, and it is worth
separating because the needle can be exact while the instrument still reads
wrong: a cue riding a perimeter at the target's angle overshoots a target inside
that perimeter, so with the opening in shot, sighting along the needle from the
dial missed. That was 32,734 of 391,539 bright on-screen poses across six
viewports, worst on wide ones whose ellipse is inset only 30 px. The ellipse is
now a ceiling on the reach rather than the reach, which takes it to 0 while
moving the worst visible step from 28.5 to 30.0 px per degree of turn against a
146.9 budget. What survives is bounded by construction - the clamp matches the
radius from the ring's centre, which sits up to 48 px off the frame's where the
insets are asymmetric - so the tests hold the rule rather than a number: either
the needle points at the opening or the dial is sitting on it.

**The camera** was a separate defect with the same reporter. `YAW_ENGAGE_SPEED`
was the only hard boolean in `followFraming.ts`, and one metre per second is
6.7% of commanded effort - 3.2 px on a 48 px stick, which is exactly the
settled trailing distance of the one-euro filter that exists because a thumb
cannot hold still. Measured on a steady turn with effort breathing +/-15% at 33
fps: 23.7% of frames reversed the camera's rotation direction, mean yaw
acceleration 23.9 deg/s^2 against 3.1 either side of the band, worst frame 965
against 180. A band alone relocates the chatter to its own lower edge - 0.0% at
0.90 m/s and 26.4% at 0.60 - so the acted-on share is also lagged. Both
constants are asserted by name in `tests/camera-follow-jitter.spec.ts`.

**Also in this candidate**, from the same round of owner feedback: the touch
stick gains a visible resting home that teaches once and retires on evidence of
real travel; the touch controls become sheer enough to see the field through
while keeping a full border so their extent stays legible; and "My times"
groups a player's runs by flock size with a rank against the public board for
each, described in `spec/12-my-times.md`.

### Evidence

- `npm test` 893 passed, 111 files. `npm run lint`, `npm run typecheck`,
  `npm run typecheck:worker`, `npm run check:discovery` clean.
- `npm run build` succeeds. First load 32 files, 6,497,688 raw bytes,
  4,250,613 estimated transfer against an 8,388,608 budget. Client bundle
  2,276.64 kB raw, 634.51 kB gzip.
- `npm run probe:release` passes: 23 character sources verified, 14 audio
  assets verified, 4 recipe manifests, 0 external models, client secret scan
  clean, page params still exactly `debug` and `seed`.
- Gate cue verified in the running dev build in both orientations. Landscape
  750x417 the token travels 316,80 to 198,116 and portrait 390x844 it travels
  171,146 to 99,187, both continuous, with opacity ramping 0.41 to 1 as the
  opening leaves the frame.

### Open

- The terrain-occlusion walk never fires on Home Field. Swept against the real
  baked heightfield over both rigs, both orientations and the whole 200 m
  field, `obscured` came back true in 0 of 800,790 poses: relief runs -2.16 to
  +2.02 m, the opening sits at -0.54 m, and a rig 14 to 17.5 m up looks over
  all of it. An earlier note here said the opposite - that it reported a block
  through the early approach - and that was wrong. The code is harmless and is
  left alone, but it is dead weight on this field and the cue's presence is
  entirely the fade's doing. Worth deleting or earning its keep on a field with
  real relief; not decided here.
- The client has one 2.3 MB chunk and Vite warns about it. Unchanged by this
  candidate and untouched by it.

## Camera and movement comfort — local candidate, 2026-09-18

Issue #90 reported motion sickness in the Follow camera. This change adds a
movement conditioning layer between the devices and the sim, rebuilds Follow on
a bearing rather than a separately smoothed aim, re-frames the rig higher and
further per orientation, moves the eye-and-aim pairs into polar form about the
aim - every one of them but the completion pull-back, which is bounded where it
stands instead - adds a Follow camera turning row to Settings and lets Reduce
motion reach the camera for the first time. Audio reference distances, sheep picking radii
and the grass preset's justification move with it because all three were derived
from the old rig, and the flock's displayed turn rate moves with it because 200
animals turning is much of the same optic flow. Reasoning and measurements are in
`docs/camera-and-movement-comfort.md`.

Owner playtesting then found two control defects downstream of that work, and
both are fixed here.

The first was turning. A held direction turned the dog roughly 90 degrees and
then ran it straight, because the movement basis was FROZEN for the length of a
hold. It now tracks the camera bearing on a 0.2 s time constant, and the settled
rate a held thumb produces is the Follow turning ceiling itself - measured at
24.974 deg/s on a 390x844 touch viewport against a 25 deg/s cap, so the loop is
bounded by the camera rather than by a second brake. The walk key moved from E
to V for the same round of feedback; saved layouts keep whatever they had.

The second was that the dog could not turn on a dime, in BOTH camera modes,
which ruled out the basis change and pointed at the conditioning law. The cause
was one constant and the way it had been justified. `A_LAT` was 28 m/s^2, giving
a turning radius of `v^2 / A_LAT` = 8.0 m at a full run, against a
`SHEEP_FLEE_RADIUS` of 8 m: the dog's turning circle was the sheep pressure zone
exactly, so no correction near a sheep could be made without leaving the zone
that was making it. The original note justified that number against the size of
the FIELD - an 8 m circle being 4% of it - which is the wrong yardstick, and
picking the wrong yardstick is how a number that unbalances the game survives
review. `A_LAT` is now 65, the most that can be spent while `A_LAT / v` still
governs at a full run, since the 270 deg/s ceiling takes over at 70.7. A run
turns in 3.46 m, inside the 5 m perception radius; a sprint turns in 9.62 m,
outside the flee radius, so sprint stays a travel gear rather than a way to
corner inside the flock. Both relationships are asserted against the sim
constants BY NAME in `tests/input-conditioning.spec.ts`.

Relaxing the conditioning that far is only available because the camera is now
bounded independently by its own bearing rate cap and view budget. The
conditioning had been paying twice for a protection the rig now provides for
itself, and the turning was the payment.

Banking was decoupled from the turn crossover on the way. It had been gated to
reach full lean where `A_LAT / v` takes over from the rate ceiling; at `A_LAT`
65 that moves to 13.79 m/s, and gating there would have suppressed the lean
through the middle of the speed range - exactly where the dog carries the most
lateral acceleration, 47 m/s^2 at 10 m/s against 36 at a full run.

THE SIMULATION IS NO LONGER UNTOUCHED, and that is a deliberate gameplay
decision rather than drift. Playtesting reported sheep banking off the gate
cheeks instead of funnelling in with the flock. The cause is that the gate is
purely permissive: the fence force is suppressed inside the passage slot, full
strength a metre outside it, and directed ALONG the fence, so nothing in the sim
ever pointed a sheep at the opening. sds had a gate attraction that v3's
clean-room rewrite dropped; it is restored here at sds's own numbers, a seek
toward the gate at 0.5 within 30 m, armed only while a dog is inside 1.5x the
flee radius AND on the far side of the sheep from the gate. That last condition
is a dot product and it is the whole design: push from the correct side and the
flock funnels, push from the wrong side and nothing helps, so it rewards a flank
the player already had to perform rather than replacing it.

Four of the five trace fixtures re-record BYTE-IDENTICAL - `flock-drift`,
`dog-rotation`, `stamina-curve` and `bark-scatter` - which is the evidence that
the force is inert away from the gate under pressure. `completion-run` moves,
from 14112 ticks to 3260, and was re-recorded under tripwire 9 as an accepted
gameplay change with the owner's approval on a local playtest, not to make a
test pass. One seed with one scripted dog is a direction, not a balance
measurement: the range sweep behind it is 30 m / 3260, 20 m / 3760, 15 m / 5086,
10 m / 8211 and 6 m / 6147, and that last non-monotonic row is the noise
showing.

This candidate is not a handoff. The AGENTS.md gate is not completed and no part
of this entry should be read as acceptance. Local `tsc --noEmit -p tsconfig.json`
is clean, as is `eslint`. Local vitest: 107 files / 850 tests, with
106 files / 849 tests passing and one failure.

That failure is `tests/audio-manifest.spec.ts`, which is pre-existing and has
nothing to do with this work. `assets/audio/licensed/` is gitignored at
`.gitignore:26` while `assets/audio/manifest.json` lists two files inside it,
`licensed/birds-loop.flac` and `licensed/pant-loop.flac`, so the ledger test
opens a path a clean checkout does not have and fails on ENOENT rather than on a
digest. It is the condition recorded further down this file. Every other file in
the suite passes, including the whole of `tests/camera-composed-view.spec.ts`.

The Reduce motion assertion that was red in the entry this replaces is resolved,
and how it resolved is worth recording because half of it was the test being
wrong rather than the rig. It compared two quantities, the view and the horizon,
and asserted both monotone under the setting.

The VIEW half was a real defect and is fixed in `composedRig`. The completion
pull-back's translation was zero under Reduce motion while the phase still ran,
so the camera held the pose it entered on for the phase's whole length as the
dog ran on, and paid the accumulated gap back in one transition at the exit -
a freeze followed by a lurch, on the commonest transition in the game, for the
one player who asked for less motion. It measured 109, 522 and 535 breaching
comparisons on the three turning profiles at up to +22.328 deg/s. The phase now
arms only when the move will actually be made, so under Reduce motion the rig
tracks the dog straight through the results screen and the exit has no step to
recover from. What is left of that mechanism on the view is 4 and 5 comparisons
out of 8,028 at 1.23e-4 and 1.74e-4 deg/s, with both runs' rates rounding to
0.000, which is the settling tail of a carry and is inside the documented slack.

The HORIZON half was not a defect and the assertion was wrong to ask for it.
Under yaw the right vector and the view turn about the same axis, so the horizon
is `view / sin(theta)` for a view `theta` off vertical - the view's rate and the
framing's elevation multiplied together. Reduce motion runs the rig at the `off`
end stop, which is a different framing rather than a slower one, so it may sit
steeper and carry a smaller view rotation further round. Measured at the
configuration that failed last, it turns the view SLOWER, 14.7704 against
14.8167 deg/s, and carries the horizon 0.406 deg/s faster, purely because it
sits 3.70 degrees steeper: 115.4976 degrees off world up against 111.8014. The
identity closes to four decimals on both runs. The comparison was charging the
setting for the pose it is supposed to choose, so the horizon now has its
absolute ceiling asserted over the Reduce motion sweep instead - which, while
the comparison lived there, it never had at all. Removing a failing comparison
is the move that most deserves suspicion in this file, so the arithmetic behind
it is in the test beside the assertion and in `feel.ts`.

One more test defect surfaced on the way and is fixed: the two quantities were
separate `expect` calls with the view first, so a view breach threw before the
horizon was ever evaluated, and a horizon breach sat unreported behind it for a
whole round.

The defect this entry used to name as red - a sim replaced part-way through a
Classic <-> Follow swap turning the composed view 130.3 and 142.9 deg/s - is
fixed. The budget assertion it belonged to now passes on all three turning
profiles, as does the assertion that Reduce motion lengthens every transition.

Lint passes. The production build succeeds: `dist/assets/index-pjfxWHRE.js`,
2,259.50 kB raw and 629.95 kB gzip, against the 2,245.92 kB / 624.22 kB gzip
recorded for the September 8 entry below - so the conditioning layer, the one
euro filter, the composed rig and the view budget cost 5.73 kB gzip between
them. No renderer receipt and no frame-time percentile is claimed here.

`npm run probe:release` does NOT pass, and it fails before it measures
anything: `audio source absent: licensed/birds-loop.flac`, the same
pre-existing condition as the ledger test. So no renderer receipt and no
frame-time percentile is claimed here either.

The shape of that condition, recorded once so it is not re-discovered as new.
`assets/audio/licensed/` does not exist in this working tree at all, while
`assets/audio/manifest.json` lists two files inside it,
`licensed/birds-loop.flac` (385,053 bytes) and `licensed/pant-loop.flac`
(1,527,871 bytes). The ledger test and the release probe both stop on it, which
is them working. The production build does not: it succeeds, and neither sound
appears in `dist/assets/`, so a build taken from a checkout in this state is
missing the bird ambience and the panting loop with a green build log. Nothing
in this candidate caused it and nothing in this candidate can fix it - the files
are gitignored at `.gitignore:26` and so were never in the repository.

**The owner reviewed this on 2026-09-18 and set it aside as not a concern for
this work.** It is therefore not a blocker on this candidate and is not a
question for the local pass. It is left written down because the asymmetry
behind it is durable and is not about audio: two gates catch a missing asset and
the build does not, so the build is the one that would carry it to players.

spec/09's rule that no phase closes with failing tests is not met, and that
accepted audio condition is the only thing holding it out.

No human has evaluated how any of this feels. It is a presentation and
interaction change, which AGENTS.md judges in motion on the running production
build, desktop and mobile, with genuine WebGPU and forced WebGL2 receipts. None
of those four receipts exists for this tree. The reporter on issue #90 has not
been offered a build and nothing was posted to the thread.
`docs/camera-comfort-local-test.md` is the procedure for the owner's local pass,
ordered by risk, and it carries the list of numbers in this change that are
arithmetic or judgement rather than tuned.

What does exist is that the production build of this tree runs. Built and served
with `npm run preview`, it reaches the title screen with no console errors, and
the Settings panel carries the new row as specified: Follow camera turning,
off / gentle / quick, defaulted to gentle, its helper line quoting the rate
ceiling - "turning at up to 25 degrees a second" - rather than a duration, with
Reduce motion reading "Steadier camera, softer effects. Following your system
setting." That is a boot and a UI receipt on this bundle. It is not a motion
review and does not stand in for one.

FIRST OWNER PLAY, 2026-09-18. The camera no longer makes the owner ill, which
is the result the whole change exists for and the first evidence for it from a
person rather than a sweep. Two findings came back with it and both are fixed
here.

The first is the one section 2 of the local test plan was written to catch, and
it is the risk this work created rather than the one it fixed: hold a turn and
the dog rounded roughly a right angle and then ran straight. That was the input
basis behaving exactly as designed - world-locked, sampled on the press and
frozen for the hold, so "left" kept meaning the compass direction left meant at
the moment it was pressed. The freeze was there to cut the feedback loop in
camera-relative steering, and it was the correct call against a camera that
could whip around: it took a held key from a widening spiral to a straight line
and 3,828 degrees of camera yaw over a run down to 542. It is not that camera
any more. The Follow bearing now turns at the profile's own ceiling behind a
dead zone, so the loop has a bounded gain, and freezing the basis on top of that
was a second brake on a loop that already had one - paid for entirely in
steering. The basis now TRACKS the bearing on a 0.2 s time constant, which makes
the ceiling on how fast a held direction curves the Follow turning rate itself
and nothing else: one number, and at the `off` end stop the camera does not turn
so a held key is world-locked exactly as before. The mode swap is the one motion
of the basis that is not the player's, so the sample is still held for the length
of that blend. spec/06's camera-basis bullet is amended to match.

The second is that hold-to-walk on E did not work well. The logic was sound; the
key was not. Walk is a hold used WHILE steering, so the finger on it cannot be
one WASD needs, and E takes the ring finger off W and D mid-corner. The default
moves to V, which is reachable without breaking the grip on the movement
cluster, and V is added to the remap options. Existing saved layouts keep
whatever they have - `restoreInputBindings` only fills an absent walk binding -
so a player who has already stored E keeps E and can change it in Settings.

Two tests were pinning the old defaults by spelling them out rather than by
asserting the property, and both were rewritten to key off
`DEFAULT_INPUT_BINDINGS.walk`. Suite after both changes: 848 of 849 passing, the
one failure being the accepted audio condition above. Lint clean, typecheck
clean, build succeeds at 630.05 kB gzip.

The scripted acceptance driver cannot stand in for that, and its report now
records why. `tests/helpers/herding-driver.ts` regulates the dog's speed by
cutting the stick back to centre, so against the probe's command rate the stick
is switched on and off rather than held at a deflection. The 25-sheep run in
`captures/stability/production-herding-touchfix/report.json` issued 986 commands
in about 121 s, 8.13 a second, 324 of them centred, with 487 transitions between
centred and deflected, 4.01 a second. No ramp in `app/src/input/conditioning.ts`
and no filter in `app/src/input/oneEuro.ts` reaches a steady state under that
input, so nothing in that receipt is a verdict on the controls.

The running-build evidence that does exist was captured mid-round from local
build `assets/index-DAZzo4i-.js` and predates camera and input edits that landed
after it, so it is not a receipt for this tree. On that build a 25-sheep
production run completed in 2:01.4 with zero page errors, submitted its score,
kept the personal best across a reload and reset the replay to 0 / 25; touch
pause and resume left position and stamina unchanged
(`captures/stability/touch-interruption/`); one portrait sprint frame from the
mobile controls probe is in `captures/mobile-controls/`. All three are desktop
Chromium with CDP touch emulation, not a physical phone.

Several shipped constants are arithmetic or judgement with no motion review
behind them, and are listed rather than presented as tuned. The 90 deg/s ceiling
on a camera-mode swap is chosen, not measured, and its own docblock says so. The
touch stick's 48 px radius is derived from panel pixel pitch; no thumb has been
measured against it, and only a deflection histogram from a live build settles
it. Its 0.06 dead zone is about 0.49 mm of travel against a general figure for
finger tremor. The conditioner's ramps, the turn-authority window and the
25 deg/s bearing ceiling were fitted against scripted routes and closed-form
rotation totals, not against a player. Gentle is the default turning value by
judgement: `off` measures 119 degrees of total rotation over a two-minute run
against 5,204 on the rig it replaces, and frames the dog better.

The turning row's helper line no longer quotes a time, and the reason is worth
recording because it is the same class of error as the false comments this round
keeps finding. It read "a quarter turn takes about four seconds" at gentle and
"about two" at quick, which is 90 degrees divided by the profile's rate cap: the
one term of the bearing law that is a duration, with the dead zone and the 1.0 s
lag ahead of it ignored. Driven through the shipped rig at 05:00 today, a dog at
a full run round a 90 degree corner turns the view's bearing 75.0 degrees at
gentle and 71.2 at quick rather than 90, because the bearing settles inside the
dead zone instead of closing it, and takes 4.17 s and 3.60 s to reach 95% of
that; a full 90 degrees of view needs a 135 degree course change and takes
3.87 s and 2.72 s. So the panel promised a quarter turn neither value performs
on a quarter-turn corner, and quoted two seconds for something nearer three. The
line now gives the rate ceiling, 25 and 40 degrees a second, which the same runs
measure at exactly 25.00 and 40.00 deg/s of bearing at 30, 60 and 144 Hz in both
orientations.

`spec/` was swept against the shipped modules between 04:51 and 05:02 and five
disagreements were corrected in it rather than in the code: the Settings
inventory, which had neither the run-timer toggle, the mute control nor the
`medium` quality tier and claimed "nothing else" (also corrected in spec/08); a
Studio blend ceiling of 150 deg/s that no longer exists, the composed budget
having replaced every per-stage ceiling; the claim that every eye-and-aim pair
moves in polar form, when the completion pull-back is deliberately still a pair
on straight lines made safe by bounding the term of its aim swing that closes on
the eye; a mode-swap pitch range given as 22.5 to 44.9 degrees when the `quick`
profile reaches 21.8; and a half-turn re-aim given as about 7 s against 6.5 s
measured. The flock and dog heading rates and the completion behaviour under
Reduce motion were absent and are now stated. Two further gaps are recorded and
not filled: the Customize panel is a shipped UI surface with no specification
beyond incidental mentions in the camera bullets, and
`docs/camera-and-movement-comfort.md:1484` still argues the settings row should
quote a quarter turn in seconds.

This supersedes the follow-camera framing claims in the September 7 stabilization
sections below, including that candidate's explicit interpretation of the 55 m/s
ceiling as a limit on Cartesian tracking translation applied to the pose. Each
blend now resolves its own weight against that ceiling, measured from the
camera's own position, before committing it. Not committed, not pushed, not
deployed, and no owner authorization is claimed.

## Walking, Studio selection and launch trailer — 2026-09-08

Owner approved commit, push and deployment of the performance/HUD work and
this presentation/input revision. E holds 30% keyboard effort; Shift remains
sprint, walk wins over keyboard sprint, and Settings/HUD expose the binding.
Existing saved E bindings survive migration by assigning a free walk key.
The simulation and deterministic fixtures are unchanged.

The rounder eyes use larger dark pupils, warm irises and a clear catchlight.
The TSL recipe remains the authority, with its procedural-manifest digests
updated. Separate critical review accepted the bounded eye/input changes;
saved-binding collision findings were fixed. Performance, controls/HUD and
eyes shipped in b14e11e1f529f249d4a9c67a564492f92c64d74c:
Client CI 34190473390 passed 101 files / 749 tests; Pages run 34190710807 and the
live manifest matched that SHA. This supersedes the pending stabilization
deployment described in the September 7 historical section below.

Studio selection fix d1f144988eff5615c688f3ff82b9ac3acd3ca6e5 derives picking
coordinates from the actual canvas-relative mouse/pen position. This fixes
stale hover beneath the Studio orbit overlay and dismisses names over controls.
Touch selection is preserved. Separate code/interaction review accepted the
change. Production-build checks selected multiple sheep names on desktop
WebGPU, touch-enabled phone emulation WebGPU and forced WebGL2, with zero
page errors. Run/walk/resume speeds: 15 / 4.5 / 15. Receipts:
captures/trailer/local-hover.json and local-hover-*.png.

Latest lint, client/worker typechecks, full tests, build and release probe pass.
Local tests: 102 files / 753 tests, including four unrelated uncommitted
discovery tests excluded from this release. Logs: captures/trailer/hover-*.log.
Runtime bundle: index-BtWN66w6.js, 2,245.92 kB / 624.22 kB gzip (existing size
warning). Estimated first transfer: 6,705,511 bytes, below the 8 MiB gate.
Release probe verified 23 character sources and 14 audio assets. Final exact
workflow/manifest evidence is retained in captures/trailer/deployment-final.json;
normal post-deploy input and renderer checks are in live-controls.json.

The 42.5-second v4 trailer replaces prior real-time captures with fixed 1/60
second frame capture of the normal app and normal analog input. It features a
200-sheep split, higher overhead details, multiple off-center names, Studio
color changes, and a real completed herding run. The run and replay matched
all 18,178 checked frames. No simulation positions or completion state are
injected. The nine sources all have decoded 16.667 ms frame spacing with no
timing gaps. Sampled gallery playback: 390 frames / zero dropped; phone layout
has no overflow. This is offline trailer filming, not a live FPS benchmark.

Separate final visual review accepted composition and full-frame consistency,
including reduced underside/leg emphasis. Names/Studio have no letterbox
bands or browser chrome. Music defaults to the owner's piano-bossa choice:
BossaBossa by Kevin MacLeod, CC BY 4.0. Recorded game ambience/effects from the
earlier live takes are restored beneath the retakes, fading from 37.5 to 39.5
seconds and excluded thereafter. The brief ending flyover is removed; the
completed herd leads straight to a five-second closing card. The selected
master/teaser's final 0.35 seconds decode to digital silence. Source identity
of the older crow-like sound was not established.
Owner listening and creative preference remain authoritative; phone emulation
is not a physical-device receipt.

Gallery: http://127.0.0.1:5488/?revision=4. Preview: port 5489. These two servers
remain intentionally available for owner review; capture browsers close.
Media, downloaded music and capture receipts remain ignored under
captures/trailer/. Recipes and provenance are in tools/trailer/ and
docs/launch/trailer-production.md. The original publishing drafts were found
outside X; captures/trailer/distribution-brief.md records their paths and the current
venue/format recommendations. No external posts or messages were sent.

## Bounded stabilization release candidate — 2026-09-07

Owner requested closeout, commit, push and exact-version deployment rather than
expanding the investigation. This section supersedes historical active-process
and broad acceptance requirements below. The candidate improves first-bark
warmup, High render-context reuse/disposal, follow-camera framing, desktop keycap
hints, keyboard/touch interruption handling and graphics-loss recovery. Auto
sampling resets reuse storage; the existing Auto-only policy is unchanged.

Independent final runtime review found no blocking regressions or unfinished
diagnostic hooks. Final local lint, client/worker typechecks, build and static
release probe passed. Full local suite: 102 files / 746 tests (includes four
unrelated discovery-verifier tests that are not part of these commits).
Logs: captures/stability/final-{lint,typecheck,worker-typecheck,build,tests,release}.log.
Runtime artifact remains index-V7kFoDsD.js, SHA256
4701b6b5d936e201c5fc7f2b40cda12527e65e4698817bcf5e46a71d78589ad8.
JS gzip 624385 bytes; estimated first transfer 6705256 bytes.

Final quiet-hub smoke: first-use-1788838025523, one High/200 run per backend,
unchanged artifact, zero page errors, both follow/classic and resize/return
rendered. First bark maximum gap 16.7 ms on both; sampled interaction p95
8.4 ms, largest movement gap 25.1 ms. This short smoke is regression evidence,
not a replacement for the earlier performance receipts. Follow screenshots
were visually reviewed; the dog is centered and keycaps remain distinct.
Hub browser/server cleanup completed; postflight GPU 0%, 89 MiB.

Known limitations carried forward: variable loading (including misses of the
2-second desktop budget), isolated unexplained frame outliers, physical mobile
and gamepad acceptance, real WebGPU-device-loss and slow-score-service coverage.
The empty public 75 leaderboard still needs production read access; local
completion/worker paths pass. Keep existing Auto adaptation while its spec/08
boot-only mismatch awaits a product decision. No unsupported shader-extension
override ships. These are visible limitations, not claims of full spec acceptance.

Remaining release steps: coherent commits, push/CI, owner approval of the full
commit SHA, manual Pages deployment and live identity/play verification. No
worker/infrastructure changes or public synthetic score submissions are included.

## Targeted 75/200 completion and scoring — 2026-09-07

Owner-approved one-sheep-left fixtures pass on unchanged index-V7kFoDsD.js:
75 success, 75 submission-503 after successful registration, and 200 success.
Each starts with N-1 penned, completed=false, last sheep at (0,99.5) outside
the pen and synthetic tick 6000. Normal simulation crosses the final gate and
triggers completion in under one second. No completion state is injected.
Captured requests carry soloClassic, field-v3 and the correct sheepCount.
All cases replay at 0/N and preserve the 100400 ms local best through actual
browser reload. Builds are stable, page errors absent, and all API traffic is
mocked. Synthetic time/fixtures are explicitly not full-run or public-score proof.

Receipts: captures/stability/completion-75-targeted/,
completion-75-submit-failure/ and completion-200-targeted/. Sessions 38906 and
59377 completed and cleanup ran. No long herding probes remain active.

The same minimal client payload passes real SQLite worker persistence, anomaly
filtering and count-specific leaderboard readback for 25/75/200, with isolation
between boards (v3-completion-score.spec.ts; focused worker tests 6 passed).
No count-specific bug found in current client/worker code. These tests do not
establish the deployed worker's write-path behavior or deployment identity.

An aggregate-only SELECT against production D1 was attempted to distinguish
missing submissions from hidden anomaly records. Cloudflare rejected it with
authentication error 10000; no database query result is available. Production
75 remains responsive/empty on public reads, but why it is empty is unresolved
until authorized Cloudflare access is restored. No public test score was written.

## Stop long herding probes; target the 75-sheep score path — 2026-09-07

Owner requested less probe ceremony and approved a tools-only one-sheep-left
forcing fixture for completion checks. The 75-sheep run (session 9596) was
intentionally interrupted by closing its verified child Chrome process; its
terminal exit is test cancellation, not a game crash. Do not restart it. Replace
long 75/200 automated herding with targeted final-gate/completion/score checks.

Fresh read-only production queries returned HTTP 200 for all field-v3 boards:
25 has 12 entries, 75 has 0, 200 has 2. Source explicitly permits [25,75,200].
Thus the 75 read endpoint is responsive and empty, but write-path correctness
is not yet established. No synthetic public score was submitted. Investigate
the final-gate -> completion -> request payload -> worker validation/persistence
path using local/mocked infrastructure and keep the result distinct from live
production acceptance.

## Completed run with score service unavailable — 2026-09-07

The normal-input 25-sheep run on index-V7kFoDsD.js completed at tick 15569,
259.434 seconds (display 4:19.4), with all 25 penned. The completion panel showed
New personal best and the local-time-safe/unavailable-board message; Play Again
returned to playing with 0/25. Source/build receipt hashes stayed stable and no
page errors or probe exceptions occurred. Screenshot completed.png was reviewed.
Receipt: captures/stability/production-herding-25-unavailable/report.json,
completed.png and replayed.png. Exec session 92396 is terminal and cleanup ran.

Both intercepted requests were POST /api/register with mock status 503; no
public request was sent. This proves normal completion/replay while identity
registration is unavailable, not a separate failure after successful score
submission. It is desktop touch emulation and functional evidence only.

Added offline-result-persistence.spec.ts verifies the best is stored before
completion notification, remains after API failure and reloads into a fresh
game store. This complements the browser flow; it does not claim a browser
reload persistence check. Focused score tests pass (9); full suite now passes
100 files / 740 tests. New-test lint passes; runtime artifact is unchanged from
the prior build/typecheck/release checks. Quality-policy owner answer remains
pending; 75/200 full completion and physical mobile acceptance remain open.

## Boot-time loss and unavailable-score playthrough — 2026-09-07

Current index-V7kFoDsD.js also passes forced loss during pending WebGL2 scene
compilation. The probe triggers only on an actual false parallel-completion
query after the scene boot mark, before shader readiness. Its receipt records
loss at 904.6 ms, data-ready=false, no shader-ready mark and sim tick 0.
Recovery stays paused with unchanged sim, zero canvases and closed audio;
focus/Tab/Escape checks and Reload -> ready title pass with no page errors and
stable hashes. No further runtime edit was needed. Receipt:
captures/stability/context-loss-boot/report.json. This narrows the boot gate to
the tested WebGL2 pending-pipeline case; physical/GPU-device-loss gates remain.

A normal-input 25-sheep production playthrough with every API request mocked
503 is active (exec session 92396, 600-second cap). It must complete through real
herding, show the local-time-safe message and allow Play Again before acceptance.
Do not infer completion or restart from this note: poll the live handle or
inspect the process. Evidence writes to captures/stability/
production-herding-25-unavailable/. Main dist must stay unchanged during it.

The owner has been asked to resolve Auto quality policy (runtime downward
adaptation versus boot-only selection). Current Auto behavior is retained while
that answer is pending; manual quality remains fixed.

## Graphics-loss recovery — 2026-09-07

Forced WebGL2 context loss reproduced a frozen field with a continuing run:
phase stayed playing and stamina drained 79 -> 55 -> 31 percent. The renderer's
public onDeviceLost callback now retains Three's bookkeeping and marks terminal
graphics loss in the store. The game pauses synchronously, removes rendering,
input and audio, and presents a focused reload dialog. Ready/resume/start actions
cannot restart the lost run. This is recovery to the title, not restoration of
an in-progress run.

Production index-V7kFoDsD.js passes desktop play, portrait touch emulation,
pre-gesture title and open-Settings loss scenarios. Live sim tick/stamina remain
unchanged after loss; Canvas is removed, AudioContexts close and remain closed
after Tab, focus stays on Reload, Escape cannot resume, and Reload returns to a
ready title. Receipts: captures/stability/context-loss*/report.json and lost.png,
reloaded.png. The prior failure is retained in context-loss-before.log.

Separate review caught and resolved an audio unlock edge and missing panel
wrapper, then accepted the current desktop/portrait dialog. Lint, production
build/client typecheck, 99 test files / 739 tests and static release probe pass.
Gzip JS totals 624,385 bytes; estimated first transfer 6,705,256 bytes.

Same-artifact hub WebGPU High/200 render smoke completed with stable hashes,
nonblank field/camera/resize captures and no page errors. Receipt:
captures/stability/hub-receipts/first-use-1788836222346/. This verifies ordinary
WebGPU rendering, not forced WebGPU device-loss recovery. Session 57630 is
terminal; hub cleaned to 0% GPU / 89 MiB. Physical phone loss, actual WebGPU
device failure and loss during pending boot compilation remain open.

## Parallel-compile diagnostic comparison — 2026-09-07

Five alternating pairs on the quiet hub used the identical index-D7vhFZIt.js
artifact with normal WebGL2 High/200 versus a tools-only unavailable
KHR_parallel_shader_compile extension. Normal ready times were 4662.9, 3067.6,
2780.1, 2002.1 and 2015.4 ms. Extension-unavailable times were 1634, 1508.1,
1480.3, 1475.3 and 1428.4 ms. All ten rendered nonblank fields, retained stable
hashes and recorded no page errors. First-bark maxima were 16.7–33.3 ms normal
and 16.7–25.1 ms extension-unavailable. A raw movement 33.400000000000546 ms
sample crosses the strict 33.4 comparison through floating-point rounding.

The alternate path replaces asynchronous polling with blocking LINK_STATUS
queries: cumulative measured calls rose from 65.8–72.8 ms to 275–295.2 ms,
with individual calls at most 40.2 ms. Recorded boot Long Task maxima were
305–459 ms normal versus 105–247 ms alternate. These are diagnostic timings,
not proof across devices. The first normal 4662.9 ms result is retained.

This strongly links the loading variability to the optional async compile path
on this browser/GPU. It does not establish the underlying browser/driver fault.
Three's installed backend stores a `parallel` field, but its published backend
parameters/types offer no parallel-compile policy setting. The game has not
been changed to mutate that field or override browser prototypes. A supported
solution and cross-device evidence are still required before closing loading.

Receipt: captures/stability/hub-receipts/first-use-1788835536473/.
tools/summarize-shader-completion.mjs produces
captures/stability/parallel-comparison-summary.jsonl. Session 94792 completed;
hub postflight 0% GPU / 89 MiB, probe browsers/servers closed. No runtime build
or production infrastructure changed in this comparison.

## Shader-completion wait reproduced — 2026-09-07

Five quiet-hub WebGL2 High/200 trials of unchanged index-D7vhFZIt.js now include
normal WebGL2 compile/link/completion-query tracing. Two slow boots (2975.1 and
2958.7 ms) each contain one program whose completion stays false until about
820 ms after linking: 820.5/819.4 ms, 100 polls each, individual query calls at
most 0.1 ms. The slow program differs (IDs 22 and 19; attached source lengths
1422/1972 versus 2875/1885), so this does not identify one expensive material.
The other three boots take 1960.6, 1890.3 and 1982.8 ms, with maximum individual
link-to-observed-completion waits 38.1, 23.8 and 26.4 ms.

Installed Three processes async compile work items sequentially and awaits
each pipeline before advancing. This trace confirms browser-reported program
completion waits extend that loading path. It does not establish whether shader
compilation, driver scheduling, cache activity or another browser condition
causes the wait. No renderer fork, forced synchronous query or runtime change
was made. First-bark maxima remained 16.7–25 ms; the earlier hitch stays open.

All five fields were nonblank, with stable build hashes and no page errors.
Per-trial CPU/GPU idle checks passed; final hub 0% GPU / 89 MiB and no probe
Chrome processes. Session 92632 is terminal. Receipt:
captures/stability/hub-receipts/first-use-1788835317817/report.json.
tools/shader-completion-trace.mjs records existing calls without extra GPU
queries; --shader-trace enables it in hub-first-use-probe.mjs. Tool lint passes.
Tracing overhead and retained OS/driver caches make this diagnostic evidence.

## Current first-use and readiness timing — 2026-09-07

Quiet-hub index-D7vhFZIt.js completed five CPU-profiled and five unprofiled
WebGL2 High/200 trials. Both sets retain stable artifacts, five nonblank fields,
zero page errors and per-trial two-sample CPU/GPU idle checks. First-bark maxima
were 16.7–25.1 ms; early movement maxima 16.7–33.3 ms. This does not explain or
erase the prior 66.7 ms outlier and is not the full backend/quality matrix.

The first-use tool previously timestamped readiness after automation polling.
It now observes the data-ready DOM change inside the browser and separately
retains automationObservedReady. In the unprofiled set, that polling delay was
109–331.7 ms. Actual readiness was 2963.8, 2013.8, 2793.6, 1895.3 and 2781.2 ms:
four of five still miss the 2-second budget. Prior hub-presentation receipts
already used a MutationObserver and are unaffected by this correction.

CPU profiles isolate slower scene-to-shader stages: 1570.9/1586.8 ms versus
743–771.6 ms. Sampled idle rises from 365–391 ms to 1155–1162 ms; additional
JavaScript execution does not explain most of this difference. Installed Three
WebGLBackend polls COMPLETION_STATUS_KHR via requestAnimationFrame in async
compilation. That is a lead for browser/driver completion tracing, not proof
of a specific driver fault. Final postprocess compile still consumes sampled
_completeCompile time. No speculative runtime optimization was applied.

Receipts: captures/stability/hub-receipts/first-use-1788834970631/ (profiles) and
first-use-1788835114878/ (unprofiled readiness). tools/summarize-cpu-boot.mjs
reproduces stage attribution; captures/stability/sprint-boot-cpu-summary.jsonl
contains the results. Sessions 42861 and 31019 are terminal; browsers/servers
closed, hub postflight 0% GPU / 89 MiB. Physical-device gates remain open.

## Sprint keyboard and pointer ownership — 2026-09-07

Focused touch Sprint now supports holding Space or Enter, releasing on keyup
or focus loss. Keyboard keys and the captured pointer contribute independently;
releasing one does not cancel another hold. Pointer release checks ownership,
so lifting a second finger over Sprint cannot cancel the original finger.

The production keyboard probe failed on index-D9FFqgY3.js and passes on
index-D7vhFZIt.js. It covers repeats, overlapping keys, focus loss, mixed pointer
and keyboard release in both orders, and secondary-finger release. Trusted CDP
pointer traces confirm which finger ended; an initial probe mistake ended the
owner finger and was corrected from that evidence. The touch pause/resume
regression also passes: settled position remains fixed, stamina recovers and
artifact hashes remain stable, with no page errors. This is desktop emulation,
not physical-mobile or assistive click-only validation.

Lint, build/client typecheck, 98 test files / 737 tests and release probe pass.
Total gzip JavaScript is 623,965 bytes. Receipts: captures/stability/
sprint-keyboard-before.log, sprint-keyboard-after.log, sprint-keyboard-tests.log,
sprint-keyboard-release.log and touch-interruption/report.json. Separate review
accepted the keyboard lifecycle; pointer ownership was added in response to its
multi-touch finding. Runtime performance and physical-device gates remain open.

## Touch interruption recovery — 2026-09-07

Holding touch movement and sprint through pause reproduced stuck movement after
resume: the dog kept advancing and stamina drained. Removed captured elements
can lose their React pointer-release handlers. TouchControls now releases its
touch state in a layout effect when controls leave active play or touch presence.
Keyboard and gamepad state are unaffected.

The same trusted two-touch production probe passes on isolated index-D9FFqgY3.js.
Paused and immediate-resume positions match; after normal stopping inertia,
two samples 800 ms apart remain at z=-42.041667 and stamina recovers to 1.
Build hashes stayed stable, with no page errors. Evidence is in
captures/stability/touch-interruption/ (before.json, report.json, resumed.png).
This uses desktop touch emulation and Escape pause, not physical-device proof.
Separate critical review accepted the narrow lifecycle change. Lint, client
production build/typecheck and 98 test files / 737 tests pass. The isolated
build was subsequently reproduced in main dist after the active playthrough
ended. Typecheck and the static release probe also pass on index-D9FFqgY3.js.

The bounded 75-sheep production robot run ended at its 30-minute cap with 70/75
penned, stable index-C3zxvAzp.js hashes, no page errors and no exception.
Session 63070 is terminal; its browser/server cleanup ran. This is incomplete
automation coverage, not proof of a gameplay defect or accepted completion.
Receipt: captures/stability/production-herding-75-wide/report.json.

Desktop hints use outlined keycaps, muted labels and distinct group spacing;
the hint strip is hidden for coarse pointers. Running desktop, remapped and
touch screenshots are in captures/stability/desktop-controls/ and passed
separate interaction review. Physical mobile review remains open.

## Startup profile attribution — 2026-09-07

One quiet-hub WebGL2 High profile of index-C3zxvAzp.js includes CPU-clock metrics
for alignment with boot marks. Scene compile ended at 2,057.4 ms and presented
readiness at 2,202 ms. Within that window, CPU samples attribute 61.4 ms to
_completeCompile beneath BloomNode.updateBefore and another 3.2 ms beneath the
final render path. This establishes first-frame postprocess compilation as a
loading cost; it does not explain the separate intermittent first-bark outlier.
The installed RenderPipeline exposes render but no public compile/prepare API.
No private-renderer workaround or deferred readiness change was introduced.

Receipt: captures/stability/hub-receipts/first-use-1788833579136/, including
report.json and webgl2-high-0-candidate.cpuprofile. Exec session 7237 completed;
the profile's first-bark maximum was 25.1 ms, so it did not reproduce the 66.7 ms
outlier. Startup timings here are instrumented diagnostics. Production 75-sheep
session 63070 remains active; latest observed progress was 1/75 at 813 s.

## Current-build 1440p frame-budget receipts — 2026-09-07

index-C3zxvAzp.js completed separate quiet-hub 60-second High/200-sheep Classic
routes on genuine WebGPU and forced WebGL2. Both verified a 2560x1440 drawing
buffer (1707x960 CSS, DPR 1.5) and a 1715x1045 browser window fitting the physical
1920x1080 display. Two consecutive CPU/GPU idle samples passed before each run;
builds stayed stable, fields were nonblank and no page errors were recorded.

Both p95/p99 frame times were 8.4 ms; maxima were 33.4 ms WebGPU and 25 ms WebGL2.
Both sampled 40 draws in the final 250 ms submission window; that is not proof
of the maximum draw count throughout the route. Ready times were 1,978.5 ms
WebGPU and 2,128.3 ms WebGL2. The WebGL2 aggregate correctly fails its startup
budget. These pass the sampled steady frame-budget checks, not all first-use,
loading, device, audio or long-session requirements. OS/driver caches retained.

Receipts: captures/stability/hub-receipts/webgpu-hidpi-1788833133146/ and
webgl2-hidpi-1788833260182/. Exec sessions 96363 and 94732 are terminal; probe
browsers/servers closed, hub postflight 0% GPU / 89 MiB. Production 75-sheep run
63070 is still active on the PC and is functional evidence only.

## Thirty-minute hub soak completed — 2026-09-07

The isolated index-CZ45C4un.js run finished in 1,802.7 s: 30 movement/bark/sprint,
camera and Low/High/remount cycles, six restarts and 37 nonblank checkpoints.
Build hashes stayed stable; no page errors were recorded. All sampled states
were visible and playing, and final restart framing was inspected. Session
5494 is terminal, browsers/server closed; postflight GPU was 0% / 107 MiB.

Per-checkpoint p95 peaked at 8.4 ms and p99 at 8.5 ms. Five raw frame gaps were
above 33.4 ms: three floating-point-edge 33.4 ms values, plus 49.9 ms in cycle 14
and 41.7 ms in cycle 22. Retain those two clear outliers; no flawless-frame claim.
Equivalent post-menu checkpoints ended at 821 DOM nodes / 215 listeners, matching
cycle 1. Heap was 28.6 MB in cycle 1, 42.9 in cycle 10, 31.3 in cycle 20 and
32.5 in cycle 30, with no sustained growth established by these observations.
This is one WebGPU High 1440x900 soak, not GPU/audio leak proof, physical mobile,
1440p acceptance or validation of the later allocation cleanup.

Final report and captures: captures/stability/hub-receipts/first-use-1788831175580/.
The current index-C3zxvAzp.js is now isolated separately for a 60-second 1440p
drawing-buffer test. The probe requires a 2560x1440 canvas, a window inside the
physical display, and two consecutive quiet CPU/GPU samples before launch.

## Larger-flock robot limitation isolated — 2026-09-07

The original robot failed the 75-sheep deterministic diagnostic at all three
tested input cadences (1/2/6 ticks), with 0 penned after 72,000 ticks. The browser
attempt in session 1252 was deliberately stopped by closing only its verified
child Chrome process; it exited through cleanup. Its Target closed failure is
an intentional test interruption, not a game crash. The receipt remains at
captures/stability/production-herding-75/ and does not count as a playthrough.

A test-only radius sweep (24/32/48 m collection cap and approach arc) improved
75-sheep diagnostic penning to 0/19/72 respectively, still incomplete at 72,000
ticks. Adaptive approach radius for the remaining flock is under investigation.
No sim tuning, production behavior or deterministic fixture was changed.
Meanwhile the live hub soak reached 23 minutes; p95 remains 8.4 ms, with a
retained 41.7 ms cycle-22 maximum. Session 5494 remains the active soak handle.

Follow-up: continuously shrinking the arc failed (2/75 and 0/75). Keeping the
wider approach until 25 sheep remain, then restoring the proven small-flock
settings, completed 75 at tick 70,806 with six-tick control cadence. Switching
only at 10 sheep remained failed (72/75). The successful test-only policy is now
in the production probe, while the original fixture driver stays unchanged.
A fresh 75-sheep browser attempt has started under production-herding-75-wide,
capped at 1,800 seconds (exec session 63070); no production completion acceptance
is claimed yet. Session 1252 is terminal and must not be resumed or restarted.
The hub soak passed restart 25 and reached cycle 26.

## Real 25-sheep production completion — 2026-09-07

The production herding route completed all 25 sheep at tick 19,323, about 322 s,
and showed the normal 5:22.0 completion screen with a new personal best. No page
errors were recorded. The driver read live sim state and used touch movement /
keyboard sprint; no completion state or simulation tick was injected. Score
requests were local mocks, so the displayed online status is not service proof.
Receipt and screenshot: captures/stability/production-herding/{report.json,completed.png}.
Exec session 70078 completed and its browser/server closed. This first receipt
predates build-hash collection in the tool, so it is functional evidence rather
than an exact-artifact release gate. It does not certify physical touch or audio.

The follow-up 75-sheep route is active in exec session 1252, capped at 1,200 s,
with build hashes and a normal Play again/reset check added. Receipt directory:
captures/stability/production-herding-75/. The hub soak continues separately in
session 5494; its fifteen-minute checkpoint and third restart passed.

## Production herding route started — 2026-09-07

tools/production-herding-probe.mjs bundles the existing test herding driver into
tools-only browser code. It reads the live CpuDeterministicSim through committed
React hooks and sends trusted CDP touch-stick input plus keyboard sprint. It
does not mutate simulation state, advance ticks or inject completion. All score
requests are intercepted locally. The local run uses the current production
build, 25 sheep and forced WebGL2; timings on this busy PC are not performance
evidence and touch emulation is not physical-mobile validation.

Active exec session 70078, capped at 600 seconds; receipt directory
captures/stability/production-herding/. The initial 60 seconds confirm live dog
movement and normal simulation ticks, with no sheep completed yet. Do not claim
a completed playthrough or restart the probe without inspecting the live handle.
The separate hub soak, session 5494, reached cycle 11 and passed restart 10.

Automation cadence check (tools/herding-cadence-check.mjs) reuses the unchanged
sim and driver: control updates every 1/2/6 ticks complete 25 sheep at ticks
14,112 / 26,422 / 33,156 respectively. Browser CDP updates approximately every
100 ms are therefore not expected to match the per-tick fixture's finish time.
The browser attempt is still incomplete at its latest observed 211 s; this is
not evidence of a game completion defect. The hub soak separately reached
cycle 13 with its process still live.

## Quality-monitor allocation cleanup — 2026-09-07

RuntimeQualityGovernor claimed allocation-free monitoring but replaced its
counter object on every manual-quality/Low/paused frame. Reset now mutates the
same four counters in place. Thresholds, warmup and quality policy are unchanged;
this removes an observed allocation source, not an established cause of the
first-bark hitch. The spec/runtime-governor policy discrepancy remains open.

Current local index-C3zxvAzp.js passes lint, build/client typecheck, 98 files /
737 tests and release probe. Initial JS gzip 623,846 bytes; estimated transfer
6,704,718 bytes. The ongoing hub soak deliberately retains isolated
index-CZ45C4un.js; it does not validate this later cleanup. First three soak
cycles report 8.4 ms p95, maxima 33.3–33.4 ms and 821–822 DOM nodes / 215–216
listeners after menu cycles. Heap values fluctuate; no leak conclusion follows.

## Extended-session test underway — 2026-09-07

The new tools/session-soak.mjs drives normal keyboard movement/sprint/bark,
camera switching, pause, Settings Low/High remount and resume. A 60-second
WebGPU production cycle passed on the hub (first-use-1788831053894). Its initial
and post-remount field captures were nonblank. This is route validation only.

A 1,800-second run is now active on index-CZ45C4un.js, WebGPU High, 200 sheep,
with a restart every five cycles. It records per-cycle frame percentiles and
heap/DOM/listener observations. Screenshot sampling is excluded from frame
collection; pauses reset the frame clock. Counters are observations, not proof
of a leak or release. Physical mobile, audio voice accounting and actual herding
completion still require separate evidence.

Active receipt on hub: /home/matthewk/perf/sds-keycap-20260907/receipts/
first-use-1788831175580/; local exec session 5494. Initial checkpoint was observed
live. Do not restart from this status note: poll the handle or inspect the hub
process and receipt first. Completion and cleanup have not yet been verified.

Latest live check: cycle 7 at 420 s, including restart 5. Restart returned to a
visible playing field; DOM nodes dropped from 821 to 247, then later menu-cycle
counts returned to 822–823. Active-cycle p95 stays 8.4 ms. Heap fluctuated
27–48 MB and fell again; these partial observations do not establish acceptance.
No Android device was attached when queried with adb; the newly started adb
daemon was closed. Owner physical-device availability question is pending.

Coverage audit: tools/scores-ui-probe.mjs injects completion state in a dev build.
It validates score-screen behavior, not actual herding completion. The 25-sheep
deterministic fixture likewise does not prove production 25/75/200 playthroughs.
Those session-completion requirements remain explicitly open.

## Current-build hub validation and remaining bark outlier — 2026-09-07

Ten fresh headed High trials on the quiet hub validate index-CZ45C4un.js,
five each genuine WebGPU and forced WebGL2. All 50 post-input/camera/resize
captures pass the central-field nonblank check, with visible/focused sampled
states; sampled Follow and Classic screenshots show the dog framed correctly.
Every trial passed two consecutive CPU <=15% / GPU <=5% preflight samples.
Build hashes remained stable, requested backends matched, and no page errors or
failed requests were recorded. These are normal Playwright focus settings, not
native focus-recovery proof, and do not establish first-frame or physical-mobile
rendering acceptance. Receipt: captures/stability/hub-receipts/first-use-1788829329168/.

The first WebGL2 trial reproduced a 66.7 ms first-bark frame; its four later
trials were 16.7 ms. WebGPU first bark was 16.6–25.1 ms. Early movement reached
33.4 ms. Ready time was 2,128–2,161 ms WebGPU and 2,063–2,098 ms WebGL2, still
above the 2 s desktop requirement. The bark gate is open despite prior gains.

Five subsequent WebGL2 CPU-profiled trials produced 16.7–33.3 ms first-bark
maxima and no bark-window Long Task; the 66.7 ms outlier did not recur. Startup
Long Tasks ranged 56–315 ms. These instrumented runs are diagnostic, not timing
acceptance or proof of the outlier's cause. Profiles and report are retained in
captures/stability/hub-receipts/first-use-1788830792531/. Both runs completed;
test Chrome processes closed and the hub returned to 1% GPU / 89 MiB.

## Desktop keycap readability — 2026-09-07

Owner review found insufficient distinction between control keys and labels.
The bottom-left strip now uses outlined, subtly raised keycaps with a separate
tokened sans-serif face, quieter serif action labels, and wider spacing between
action groups. It retains live remapping, menu hiding and coarse-pointer hiding.
Production desktop/default/remapped and portrait touch checks pass; independent
critical review accepts the sampled layouts. Physical mobile acceptance remains
open. Screenshots: captures/stability/desktop-controls/{desktop,desktop-remapped,touch}.png.

Current index-CZ45C4un.js: lint, build/client typecheck, 98 files / 737 tests and
release probe pass. Initial JS gzip 623,819 bytes; estimated transfer 6,704,690
bytes. This is a presentation correction, not a new performance result.

Native Windows startup diagnosis also progressed: all six first-run images were
nonblank, but later samples were hidden and camera transitions therefore cannot
be accepted. The tightened second run rendered its initial WebGPU field, then
correctly failed on lost visibility. The blank-rendering gate remains open;
future native validation needs an uninterrupted foreground lane. The second
run's temp-profile cleanup returned EPERM and was recorded without masking the
primary visibility failure (sds-render-YB3hwb).

## Keyboard focus and native recovery — 2026-09-07

Gameplay shortcuts now respect text inputs, selects and native Space/Enter
button activation. Escape still closes menus, keyup still releases held inputs,
and movement/camera shortcuts work after a persistent touch button has focus.
Touch Bark and Camera accept keyboard/assistive clicks without duplicating
pointer actions. Independent code review supports this bounded change. Sprint's
touch button remains pointer-only; full keyboard activation of that button is
an open interaction item (the normal Shift binding remains available).

The production recovery probe passes typing, Play/Pause/Resume, camera handoff
and a real tab switch with lost movement/sprint keyup. Its receipt records actual
blur and visibility events. Standard Playwright focus emulation hid those events;
a separately launched visible Chrome attached with noDefaults provides the
native test. Hidden-window failures are not game recovery failures. This finding
does not yet resolve the separate intermittent blank-rendering gate.

Evidence: captures/stability/keyboard-recovery/report.json and
captures/stability/desktop-controls/touch-keyboard-{camera,return}.png.
The latter show Follow and Classic visually on touch emulation, not physical
mobile or exact action-count proof. Current index-Cvb_JT-9.js passes 98 files /
737 tests, lint, build/client typecheck and release probe. Initial JS gzip is
623,700 bytes; estimated first transfer is 6,704,572 bytes. These functional PC
checks do not replace quiet-hub performance measurements or close release gates.

Automatic approval review blocked cleanup of the closed test profile
C:/Users/Mattm/AppData/Local/Temp/sds-recovery-7G7iqt with reason "blocked by
policy". That directory was left untouched; subsequent probe cleanup succeeded.

## Desktop controls and High first-use path — 2026-09-07

The requested desktop HUD reminder now shows the current movement, bark, sprint,
camera and pause bindings in one small bottom-left row. It subscribes to settings,
does not update per frame, hides during menus and hides on coarse-pointer touch
layouts. Production UI checks cover default labels, pause, Q/F remapping and
touch controls. Independent visual review supports the sampled presentation.
Screenshots: captures/stability/desktop-controls/.

High now renders its scene explicitly into the owned target before the unchanged
TSL bloom/grade chain. Compilation and scene rendering use the same top-level
context. This removes the traced first-bark bird-program rebuild without an
extra warmup draw; local WebGPU synchronous pipeline creations fall from 27 to
12. Both backend five-cycle resource checks remain flat and all captures in
those latest runs render. Independent code/visual review found no blocker.

The owner reported another PC Chrome game and concurrent agents. PC timing
results are diagnostic only. The hub comparison used two consecutive CPU <=15%
and GPU <=5% samples before every trial, with no competing Chrome process at
preflight. Twenty alternating High trials compare index-BIRd17K_.js against
index-BTo1IfeC.js: WebGL2 first bark 25–41.7 -> 16.7–25.1 ms; WebGPU stays about
16.7 ms. Startup still fails: candidate WebGPU ready 2,116–2,201 ms; WebGL2
2,074–4,294 ms, including a worse first candidate trial. No loading regression
clearance or whole-game acceptance is claimed. Receipt:
captures/stability/hub-receipts/first-use-1788826866432/.

Current validation: 97 files / 731 tests, lint, build/client typecheck and release
probe pass. Initial JS gzip 623,591 bytes; estimated transfer 6,704,463 bytes.
All completed probe browsers and servers are closed; hub returned to 0% GPU.
Startup, intermittent rendering, physical mobile, full sessions and owner review
remain open. Nothing was deployed or published.

## Quality-switch GPU resource cleanup — 2026-09-07

Confirmed recurring resource growth when High unmounted: each WebGL2 cycle
retained 13 textures, 13 framebuffers and two renderbuffers; WebGPU retained 14
textures per later cycle. High now disposes its owned bloom and scene passes
in addition to RenderPipeline's final material. Five production Settings cycles
after the fix return to identical Low counts on each backend. Independent code
and sampled WebGL2/WebGPU remount visual review support the bounded fix.

WebGPU's initial Low capture is blank both before and after, then all ten captures
after quality switches render visibly. Its aggregate probe remains failed;
this resource fix does not resolve the startup rendering gate. Evidence and
counter tables: docs/performance-stabilization.md, captures/stability/
quality-lifecycle-{before,after}-{gl,gpu}/. All probe browsers/servers closed.

Latest candidate index-BIRd17K_.js: 96 files / 729 tests, lint, client/worker
typechecks, build and release probe pass. Full initial JS gzip 623,267 bytes;
estimated first transfer 6,704,140 bytes. No full stabilization gate is closed.

## Loading keyboard fix and rejected warmup experiments — 2026-09-07

Loading title controls are inert until ready, closing a keyboard-accessible
Settings/quality-change race during compilation. A production browser probe
holds the real heightfield request and confirms Tab/Enter cannot activate title
controls, then Settings opens/closes after readiness. Readiness publication
also ignores an unmounted component.

An additional High loading-time render improved first bark in 20 paired hub
trials but repeatedly produced a blank Windows WebGPU field. It was removed.
The earlier target-only artifact rendered in one comparison, but the rebuilt
candidate after removing extra warmup also rendered blank on Windows WebGPU
(`restored-high-gpu`, `index-AFArC80o.js`). Therefore extra warmup is not an
established cause, and rollback is not a verified rendering fix. Waiting for a
frame and using R3F.advance did not cure blank rendering. Direct sync
startup also produced a 2-second WebGL2 task and was rejected; the camera-layout
initialization experiment was removed as well. Existing Follow framing and
target-correct async compilation remain. None of these results closes startup,
movement, physical-mobile or long-session gates. Full evidence and next leads:
docs/performance-stabilization.md.

Latest source checks pass: 96 files / 729 tests, lint, typecheck, production
build and release probe. JS is 2,240.73 kB (622.83 kB gzip). The visible-rendering
gate remains unresolved despite these checks; this candidate is not accepted.
Four later sequential headed Chrome controls rendered visibly, including current
and reference artifacts, GPU wrappers off/on, and current with probe GPU flags.
This does not isolate the intermittent blank failure. Current normal Chrome
screenshots show the field and normally framed dog; startup still contains large
post-readiness gaps. Detailed labels and limits are in the investigation report.

## High first-use follow-up — 2026-09-07

The 60-run alternating hub comparison confirms Low/Auto WebGL2 bark improvement
but exposes a remaining High first-bark gap up to 58.3 ms. The target-correct
warmup candidate (`index-CgW7aIpk.js`) passes 729 tests, lint, typecheck, build and
release probe; it reduces local WebGPU synchronous pipeline creations 47 -> 27.
It is not accepted: startup still exceeds budget and the instanced-bird program
still compiles at the first High bark. See docs/performance-stabilization.md for
shader evidence and the next diagnostic. The 20-run High-only comparison with
confirmed idle intervals completed: WebGPU 16.7–25 ms overlaps the prior build;
WebGL2 first bark changed from 25–41.7 ms to 24.9–33.4 ms. All idle checks and
build-stability checks passed. Receipt: captures/stability/hub-receipts/
first-use-1788823188181. Both compared artifacts remain isolated on the hub.

## Stabilization execution — camera candidate, 2026-09-07

The quiet hub (GTX 1660 Ti, physical 1920x1080 at 120 Hz) now uses a
1440x900 test viewport that fits its actual browser window. The earlier
2560x1440 window exceeded the display. Production WebGPU uses no debug flag.
Native Follow routes also reproduced a separate camera defect: sustained
camera-relative turns collapse horizontal chase distance from 20 m to 3.43 m.
Both backends show the oversized dog near a fence; it recovers after releasing
input for two seconds. This is a gameplay framing issue, not a performance pass.

A local camera candidate smooths the tracking center separately from its polar
orbit, retaining the spec yaw/position/aim constants and terrain clearance.
Independent design review supports this approach. Explicit interpretation:
55 m/s limits Cartesian tracking/reset translation, not total orbital eye speed;
spec/06 specifies smoothing constants but no total eye-speed ceiling. Running
motion review is still required. The deterministic route and existing framing
tests pass. Follow reset and live viewport-change tests were added as well.
Current validation: 96 files / 727 tests; lint, typecheck, production build and
release probe pass. The new 60-second simulation test uses a 20-second timeout
because parallel suite contention exceeded the default 5 seconds; its framing
assertions remain unchanged.

Camera candidate index-KZQW9FUY.js: native hub WebGPU/WebGL2 routes both p95
8.4 ms, maximum 25 ms; ready 2,028 / 2,282.5 ms (startup still fails).
Build hashes remained stable and browser windows fit the physical display.
Candidate active screenshots retain normal dog size and readable field framing;
independent WebGPU screenshot review supports the sampled correction. Receipts:
captures/stability/hub-receipts/webgpu-native-1788822173632 and
webgl2-native-1788822283569. Full motion, portrait/physical-mobile acceptance,
alternating first-use comparisons and extended recovery sessions remain open.

Hub pre-camera-fix 60-second native High routes: WebGPU p95 8.4 ms,
max 16.7 ms, ready 2,150.7 ms; WebGL2 p95 8.4 ms, max 25 ms,
ready 3,425.4 ms. Both miss the 2-second desktop startup gate. Captures and
receipts are under captures/stability/hub-receipts/. Screenshot-related gaps
are timestamped separately; sampled runtime excludes startup and captures.
Windows mobile-emulation blank rendering is intermittent and reproduced on the
original build; a later identical-context candidate run and raw WebGPU control
rendered visibly. Cause and physical-mobile acceptance remain open.

Probe hardening now checks physical window bounds, build stability, browser and
network failures. Automated color variation only checks nonblank content; it
does not approve framing or scene animation. All performance and publication
gates in docs/stabilization-plan.md remain open until their evidence is complete.

## Stabilization plan — 2026-09-07

Owner requested a plan to stabilize and polish the current game before public
posts. See [stabilization and public playtest plan](docs/stabilization-plan.md).
It sequences reliable rendering evidence, first-use/movement fixes, loading and
steady performance, complete-session recovery, presentation review and a reviewed
public build. Plan recorded; gates are not newly accepted. Future modes, larger
flocks and multiplayer remain outside scope. No publication authorization added.

## Performance stabilization investigation — local candidate, 2026-09-07

First-Space investigation reproduced a hidden-effect compilation hitch. BarkRing
and BirdLift now opt into startup compilation while the render loop is paused;
visibility restores even if compilation fails. No simulation or audio change.
Three fresh-browser trials per backend at 200 sheep measured Auto first-bark
maxima falling from 35–42 ms to 7.0–7.1 ms. High retains 14 ms WebGPU / 28 ms
WebGL2 first-use cost. Low portrait touch emulation measured 7.1 ms first-bark
maxima on both backends; input was scripted Space, not physical touch.

Three 60-second production runs pass p95/draw/error checks but NOT overall
performance acceptance: High 1440p WebGPU/WebGL2 and throttled landscape Low
WebGL2 readiness was 2,509 / 4,967 / 6,744 ms. Frame p95 was 7 / 7 / 14 ms;
maximum gaps were 83.4 / 76.2 / 76.3 ms. Peak API draws 53 / 54 / 42. The older
100 ms freeze gate is insufficient to call these runs hitch-free. Timings are
local desktop comparisons, not isolated physical-device certification.

Validation: 95 files / 724 tests, lint, typecheck, build and release probe pass.
Candidate index-s2uqeSsi.js; gzip JS 622,906 bytes, estimated transfer 6,703,776
bytes. Independent code review found no blocker; high-target pipeline warmup
remains a measured limitation. Running build screenshots and receipts:
captures/profiling/first-bark-warmup-mobile/ and stability-warmup/.
See docs/performance-stabilization.md for reproduction, limitations and follow-up
priorities. Spec/08's boot-only quality policy still conflicts with the shipped
runtime governor; preserved pending a product decision. Startup, residual
outliers, long-session memory/lifecycle and physical mobile acceptance remain
open. No commit, push or deployment in this investigation.
Follow-up: the 10-second gap trace reproduces 83.2 / 76.5 ms outliers around
sample frames 106 / 113, without reported Long Tasks. All eleven audio lifecycle
checks pass (captures/audio/stability-audio/). Independent screenshot review
rejects the initial mobile WebGPU capture: HUD appears but the field is blank.
Mobile WebGL2 and desktop scenes render. Mobile WebGPU visual acceptance remains
open; the bark probe now records and rejects blank initial/follow-up captures.

## Footsteps - owner approved for release, 2026-09-07

Owner found the generated footsteps too high pitched and requested correction
and another local review before deployment. Owner subsequently approved the
revised mix and explicitly requested commit, push and deployment. Retained
the two original sources and baked softened mono FLAC files with 65 Hz highpass,
1800 Hz lowpass and rounded boundaries. Runtime pitch is 0.82-0.86 with lower
gain; cadence and movement triggers are unchanged. Recipe and source hashes are
in tools/prepare-footsteps.mjs and assets/audio/manifest.json. Combined footsteps
are 49,079 bytes; complete audio is 2,186,181 bytes.
Independent review caught excessive attenuation in the initial lowpass pass;
static +12/+8 dB compensation restores the paw impact and balances the takes.
Owner listening accepted this candidate. Release checks and exact-SHA deployment
are authorized. Possible tail overlap during sprinting remains a known property.
Validation: lint, typecheck, 95 files / 722 tests, build and release probe pass.
Final JS index-BnAI9eCO.js; gzip JS 622,816 bytes; transfer estimate 6,703,688 bytes.
Desktop and mobile-emulation running captures pass with no browser/network errors:
captures/audio/footsteps-reviewed-desktop/ and footsteps-reviewed-mobile/
under captures/audio/, including running-field.png screenshots. No new renderer
or performance claim; mobile capture uses scripted keys, not physical input.

## Approved recordings - owner accepted for release, 2026-09-07

Approved Mixkit 17 birds and 58 dog panting replace the rejected generated files.
Crowd murmur and farmhouse wind chimes are removed; the existing three baa variants
and other twelve short effects are preserved. Native-rate lossless FLAC avoids a
lossy re-encode; birds have twelve-second rests and panting follows fatigue.
Two streaming voices, natural 1x playback, 0.8-second gain time constants.
See docs/audio-approved-integration.md for recipe, provenance and release limits.

Validation: lint, typecheck, 95 files / 722 tests, production build and release
probe pass. JS gzip 622,811 bytes; estimated transfer 6,673,183 bytes; 14 audio
files totaling 2,155,682 bytes. Final JS asset index-BcYn3DdT.js. The preparation
recipe reproduces both manifest hashes and rejects unapproved source hashes.
Production desktop and mobile-emulation captures pass with stable build receipts,
no browser/network errors and active playback. Desktop mix -34.2 LUFS / -15.4 dBTP;
mobile mix -34.4 LUFS / -15.5 dBTP. Eleven lifecycle checks pass, including unlock,
pause/resume, mute, restart and tab visibility with no duplicate voices.
Evidence: captures/audio/approved-recordings-desktop-final/,
approved-recordings-mobile/ and approved-recordings-lifecycle/ (each under
captures/audio/); running-field.png in both capture directories. Mobile is browser
emulation with scripted keyboard movement, not physical-device listening.
No renderer change; performance percentiles were not measured in this audio pass.

Independent critic found no lifecycle blocker; source-hash checks, source sizes
and dead flock-position state were corrected. Objective boundaries are smooth.
Owner approved the running mix as "much better" and requested commit, push and
deploy. Remaining limitations: panting is very quiet, birds repeat every 20.33 seconds, and
10-minute auditory fatigue acceptance has not been established. Numeric signal
checks do not certify sound quality. Mixkit permits the game end product but
prohibits redistribution with source files. All licensed originals and prepared
files remain git-ignored. CI/preview/deploy now acquire hash-verified originals
and prepare the licensed audio before building; only the game artifact is
archived and deployed. Bitexact container metadata reduces total audio to
2,155,622 bytes without changing approved PCM. Release validation follows.

## Leaf-rustle removal - local candidate, 2026-09-07

Owner identified the isolated leaves loop as the mechanical, wispy sound and
approved removal or replacement. Removed it from media, manifest, runtime,
filters and proximity state; other audio sources and mix settings are unchanged.
The dated spec/07 override records this departure from the original ambient bed.

Validation: lint, TypeScript, 95 files / 723 tests, build and release probe pass.
16 audio assets; 623,467 gzip JS bytes; estimated transfer 5,548,615 bytes.
Independent static audio review found no actionable issues. Production-preview
lifecycle passes all 11 checks with four loops, including unlock, pause/resume,
restart, visibility, volume/mute, positional bark and no duplicate playback.
Desktop and 390x844 touch-emulated mobile running mixes pass with stable build
hashes and no runtime/network errors: captures/audio/leaves-removed-desktop/
and leaves-removed-mobile/. Both are approximately 20 seconds at -37.2 LUFS;
true peaks -15.6/-15.5 dBFS. Mobile uses scripted keyboard movement in a touch
viewport, not a physical-device input or listening receipt. Lifecycle evidence:
captures/audio/leaves-removed-lifecycle/. Probe browsers and servers closed.
Owner listening to the resulting mix and physical-device review remain open;
no new performance or renderer gate is claimed. Not committed or deployed.

## Search indexing investigation — 2026-09-06

Authenticated Search Console confirms the HTTPS homepage is indexed, fetched
successfully September 6, and selected as canonical by Google. The four reported
redirects are the HTTP homepage and retired scene URLs; preserve those redirects.
Resubmitted the existing sitemap successfully; Google's refreshed read remains
pending. See `docs/search-indexing-audit.md` for exact URLs and Analytics findings.
Local discovery-verifier guardrails now reject canonical redirects, HTTP noindex
headers and sitemap aliases. These tooling changes are not committed or deployed.
Validation: lint, typecheck, all 95 test files / 723 tests, production build,
release probe and source/built/live discovery pass. Unchanged runtime bundle:
623,633 gzip JS bytes; estimated transfer 5,773,849 bytes.

## Studio release authorization — 2026-09-05

Owner approved the responsive Studio, requested an updated README and authorized
commit, push and deployment. The release includes the local Studio correction
below and documentation corrected against current input and asset sources.
The exact-commit Pages workflow verifies the published identity and discovery.

## Mobile Studio correction — local review, 2026-09-05

Owner-reported Customize overflow is corrected in local build `index-Bq-a9SiU.js`.
Compact portrait bottom panel/landscape sidebar and shared camera composition
keep the animal in clear space. Toolbar selection, naming grids, registry scroll,
safe-area spacing, visual-viewport keyboard handling and focus behavior revised.
See `docs/studio-mobile-review.md`. Full suite94 files/719 tests passed; focused
checks after adjustments, lint, TypeScript/build and release probe pass.
623,633 gzip JS bytes;5,773,849 estimated transfer bytes. Not deployed.
Six-size renderer receipts: `captures/studio-mobile-accepted-webgpu/` and
`captures/studio-mobile-accepted-webgl2/`, all tabs/presets, names, orientation,
Escape/focus and overflow checks pass with no errors. Final naming-first reorder
and landscape visual-keyboard adjustment have a focused final probe. Physical
keyboard/notch behavior remains device-unverified. Probe browsers close; local
preview remains available for owner review at port5330.

## Release authorization — 2026-09-05

Owner requested "commit push and deploy" after the combined local playtest
handoff. This authorizes publication of this reviewed candidate through the
exact-commit Pages workflow. Known startup, physical-device and aesthetic review
limitations below remain disclosed; authorization does not turn them into passed
tests. Deployment status and live identity are verified by the workflow receipts.

## Current owner playtest candidate — 2026-09-05

Local production preview is running at http://127.0.0.1:5330/, bundle
`index-Ca8RQxz9.js`. See `docs/presentation-playtest.md` for the concise included
changes, evidence, playtest steps and release limitations. The entries below
this section are historical checkpoints, not competing current-build claims.

- Owner direction: implement the current trees and stop repeated tree design
  iterations. Trees, atmosphere/light, dense grass, gate cues, farmer, dog,
  camera/input, calmer audio and SEO are integrated for playtest.
- Latest dog tail/hock and front attachment passed narrow independent regression
  review on both backends. Exhausted sprint requires a real release/new hold.
- Found and fixed exact 180-degree heading lock in normal reversal. A small
  deterministic tangent starts the turn; no snap or trig, no regenerated trace.
  All five pinned traces still pass.
- 93 files / 713 tests, lint, TypeScript/build and release probe pass. Initial
  gzip JS 622,264 bytes; estimated transfer 5,772,481 bytes. Discovery verifies
  four built routes and local HTTP metadata, canonicals and social image.
- Final reversal gate probe `captures/guidance/final-reversal-gate/` passes both
  backends with settled behind-camera cue, visible opening, resume and viewport
  clearance. Prior `owner-opening-highlight-02` behind receipt was overstated:
  a transient offscreen condition did not survive until its screenshot.
- No production deployment. Owner art/feel/audio review, physical device tests
  and desktop cold-start budget remain release gates; do not call these passed.
- Final quiet-hub WebGPU run: 200 sheep at 1440p for 60 seconds, p95 8.4 ms,
  max 25 ms, zero >100 ms frames, 40 sampled draws, no errors. Startup 2,023.5 ms
  still misses 2,000 ms. Receipt: `captures/final-hub-receipts/`.
- Prior combined-renderer runs: WebGL2 desktop p95 8.4 ms/max25 ms, 40 draws,
  cold start3.95 s; phone-emulated low tier p95 8.4 ms/max33.3 ms, 28 draws,
  cold start3.39 s. No physical-mobile acceptance follows from laptop emulation.
- Final title-only CSS fixes clipped information links at844x390. Actual built
  title probes pass1440x900,390x844 and844x390, including Play/link reachability
  and no runtime errors. Evidence: `captures/discovery/`. Gameplay receipts
  precede only this title layout adjustment. Preview is intentionally left running
  for owner playtest; probe browsers/servers and hub browser processes closed.

## Presentation and feel plan — 2026-09-05

- Front-leg attachment candidate is now built as `index-DYxsVRVM.js` on port5330.
  Buried upper roots follow the adjacent torso's chest/neck skin weights, with a
  tapered transition to the upper leg; forward paws and bone chains are retained.
  Geometry is 1,696 triangles. Actual skinned containment verifies 34 attachment
  vertices against torso triangles across 20 poses. Full suite: 90 files / 701
  tests; lint, TypeScript/build and release probe pass (621,846 gzip JS bytes,
  5,770,876 transfer bytes). An indexed-array type error in the first build was
  corrected without changing arithmetic; stale `front-attachment-after-webgpu`
  capture is explicitly marked INVALID and must not be used as after evidence.
- Correct after evidence: `captures/actors/front-attachment-fixed-webgpu/` has
  stable build hashes, no page errors, Studio front/profile/hero and normal held
  W+A/W+D movement. Independent narrow standing-view PASS: exposed upper caps
  gone, roots sit beneath chest, profile connection continuous. Remaining shoulder
  shading is faceted but does not read detached in those views. This does not
  establish broad character acceptance or continuous gait smoothness. Matching
  `front-attachment-fixed-webgl2` capture also passes with stable hashes and no
  page errors. Broader art remains paused per owner priority.
- ACTIVE PRIORITY, owner correction: dog front legs are not properly attached.
  Broader art work is paused while attachment is corrected and reviewed in idle
  and held W+A/W+D movement. The narrower torso plus forward-shifted legs exposed
  an upper-leg/body skinning transition problem; a separate chest paint-mask
  correction does not establish anatomical attachment. Current before-fix build
  is `index-BQVeZX8g.js` (90 files / 700 tests, lint and TypeScript build pass).
- Current owner-review build: `index-CD0FvYH3.js`, served at local port 5330.
  Includes dense meadow, narrower dog chest, foreleg chains moved forward 14 cm,
  open level eyes, turning paw lift-off continuity, zero Studio body bob, farmer
  shoulder/contact refinements, corrected below-zero boundary-tuft paint, audio
  fixes and the redesigned gate. Lint, TypeScript build, 90 files / 699 tests,
  release probe pass: 621,669 gzip JS bytes / 5,770,699 transfer bytes. Genuine
  WebGPU actor capture includes sustained W+A/W+D sequences, stable hashes and no
  page errors (`captures/actors/owner-dog-diagonals-webgpu/`). Runtime/owner
  acceptance and current dense-field hardware performance remain open.
- First redesigned gate probe reached visible opening and behind-camera views,
  then failed an obsolete resume assertion requiring the now-hidden badge to
  appear. Its data showed on-screen/unobscured with hidden badge, consistent with
  the redesign. The probe now checks projection-consistent resume behavior and
  deliberately returns to offscreen framing for unchanged mobile bounds checks.
  Retained failed evidence: `captures/guidance/owner-opening-highlight/`.
- Owner review corrections now take priority: evenly dense grass (scattered
  treatment rejected), a redesigned gate cue with actual entrance highlighting,
  and a slimmer/less round dog torso below the neck. Source grass correction
  removes strong density/height correlation: field 81,752 / surround 16,595 tufts,
  1,180,164 bytes, height scales 0.75–1.25. Twenty-nine grass checks pass. Greater
  density requires fresh runtime/performance evidence. These revisions are now
  in the current preview described above.
- Integrated pre-owner-correction build passes lint, TypeScript build, 88 files /
  691 tests and release probe (621,146 gzip JS bytes; 5,408,664 transfer bytes).
  Dog5 actor captures on genuine WebGPU and forced WebGL2 have stable hashes and
  no page errors. Final independent Studio verdict remains unaccepted at cap 5;
  owner torso correction is a new explicit revision, not retroactive acceptance.
- Farmer contact correction: actual skinned-boot test reproduced 4.89 cm of
  sole lift at a flat-ground stride endpoint. Lowering posed hips from 1.10 to
  1.04 m leaves knee reach for the stride; all five sampled stance phases now
  stay within 5 mm on both feet. Seven farmer tests pass, source digests updated. This does not
  prove all slope contact or replace motion review. The centered normal-approach
  farmer capture is complete but predates this source correction.
- Historical dog model pass 5: narrower sloping bib, eased
  shoulder transition, restrained eye aperture and reduced coat-band contrast.
  Geometry is 1,664 triangles (+24); bones, solvers, soles and draw count remain
  unchanged. Forty-seven focused tests and scoped lint passed. Final independent
  review remained unaccepted; subsequent owner-directed corrections are above.
- Current source adds distance-dependent crowd filtering (1,300 Hz near to 650 Hz
  far, smoothed over 250 ms) through the existing node. Ten audio graph/fatigue
  tests pass, including listener/flock movement and bounded graph size. This is
  now rebuilt but not yet captured; earlier audio recordings precede this change.
- Dog iteration 4 independent still-image review: ITERATE. Raised head and tuck
  improve the profile; broad rigid bib, shoulder join, bead-like eyes and slab-like
  torso shading remain. Final bounded model pass 5 is underway. Animation and
  two-camera gameplay acceptance are separate from Studio anatomy review.
- After-build interaction review closes the reproduced nameplate overlap and
  verifies sampled portrait steer+sprint+camera, release, gamepad disconnect and
  neutral reconnect, and reduced-motion switching. No runtime errors; build
  hashes stable. Evidence: `captures/profiling/interaction-after-review/review.md`.
  Physical-device feel and measured camera jerk remain unverified. Full regression
  suite at the dog4/nameplate checkpoint passed 88 files / 686 tests.
- Current source/build adds dog iteration 4 (raised/retracted skull, 0.30 m
  muzzle, lifted rib/waist underside and softer wrists) and fixes the interaction
  critic's Classic nameplate overlap by anchoring above the dog with a 20 px
  minimum screen gap. Rig remains 22 bones / 1,640 triangles. Dog's 47 focused
  tests, lint and client typecheck pass; build/release probe pass at 620,835 gzip
  JS bytes and 5,408,352 transfer bytes. After-build visual/interaction checks
  completed with the interaction result and dog iteration 4 critique above.
- Independent input review of frozen dog3/meadow5 verified normal keyboard
  release/reverse, pause-held-input handling and camera switching. Gamepad and
  touch half input moved roughly half full input distance; deadzone held still.
  Evidence and precise limitations are in
  `captures/profiling/interaction-frozen-review/review.md`. This is browser
  emulation, not physical-controller or phone latency acceptance.
- Hub startup diagnostic on dog3/meadow5: resources completed by about 285 ms,
  renderer around 647 ms, mounted scene 1,051 ms, shaders 1,876 ms and presented
  2,061 ms. The corrected in-browser ready observer measured 2,062.7 ms, still
  above the desktop 2,000 ms requirement. Earlier readiness numbers included
  locator polling delay (one run was 2,704 ms versus presented 2,180.5 ms).
  `tools/hub-presentation-probe.mjs` now retains wall observation separately and
  uses a browser MutationObserver timestamp for readiness; `--boot-only` records
  a diagnostic without claiming frame-budget coverage. Before-run GPU was 0%,
  no competing game process observed; receipts in `captures/hub-dog03-startup/`.
- Dog iteration 3 is built: muzzle stop-to-nose length 0.260 to 0.360 m,
  narrower cheeks, fuller lower chest, articulated wrists and five-ring paws.
  Geometry is 1,640 triangles; rig remains 22 bones with two body draws and one
  contact shadow. Forty-seven focused dog tests and scoped lint pass, including
  actual skinned-sole contact checks. Production build/release probe pass at
  620,722 gzip JS bytes and 5,408,239 estimated transfer bytes. This supersedes
  earlier size receipts; actual front/profile and motion review is in progress.
- Scene iteration 5, `meadow-massing-05`, closes the five-iteration scene loop
  without acceptance. Independent verdict: ESCALATE for art-direction review.
  Grass now uses correlated 28 m groups, shorter 0.42–1.25 tuft scales and
  stronger density variation. Field tufts fall from 64,946 to 55,495;
  surround 13,350 to 12,726. Asset size falls 939,552 to 818,652 bytes.
  This is an intentional authored scatter change, not a simulation-fixture update.
  Twenty-four focused bake/interaction checks pass unchanged, including byte
  reproduction, height ranges, ground contact, keep-outs and low-tier coverage.
  Production build and release probe pass: gzip JS 620,679 bytes; estimated
  transfer 5,408,196 bytes. Classic WebGPU, Follow WebGPU/WebGL2 and phone low
  captures have stable pages and correct backends; local timing gates still fail.
  Full regression suite passes 88 files / 686 tests at this grass checkpoint.
- Critic accepts the direction of grass massing, not the finished scene. Visible
  sheep are distinguishable, but the full flock is not framed. Remaining scene
  issues: flat olive clearings; mismatched grass/tree/cloud edge detail;
  repetitive horizon arrangement; padded crowns and graphic clouds. Scores:
  silhouette 7, ramp 6, cohesion 7, painterly conviction 5, screenshot test 6;
  visible-animal readability 7. Establish an approved in-scene target for ground,
  foliage and sky together before opening another scene art loop. Do not call
  the five-iteration cap an acceptance. Other character/input/audio evidence work
  can continue independently.
- Historical built candidate `cohesion-04-dog-02`: 88 files / 686 tests, lint,
  client typecheck, production build and corrected release probe pass. Initial
  gzip JS 620,678 bytes; transfer 5,529,095 bytes. Release verification now checks
  23 dog/farmer source digests. The art wrapper retained an initial checker failure
  because the dog ledger legitimately includes its authoring tool; its path
  allow-list is corrected and a separate release probe passed on the same build.
  Source/build capture hashes are stable. Local timing failures remain provisional.
- Independent scene iteration 4 and dog model iteration 2 both remain ITERATE.
  Dog face/contour and chest are visibly improved. Next work: grass height and
  grouped masses judged against a full-flock Classic/Follow composition; clearer
  dog shoulder/wrist/paw forms; less padded tree lighting. Clouds remain graphic.
  Scene scores: silhouette 7, ramp 6, cohesion 7, painterly conviction 5,
  screenshot test 6. Continuous movement and farmer anatomy remain unaccepted.
- Gate iteration 2 runtime checks now pass both genuine WebGPU and WebGL2:
  visible/behind cues, pause/resume, portrait/landscape bounds and explicit HUD/
  button overlap checks in `captures/guidance/gate-02-settled/`. A preceding
  fixed-delay probe failed before camera settling; condition-based waiting
  verifies the intended state without assuming a fast host. Physical touch and
  terrain/object-occlusion coverage remain separate open review items.
- Ten-minute idle audio recording completed at `captures/audio/calm-audio-fatigue-200/`:
  599.984 seconds, stable production hashes, one running context, no page/network
  errors, -42.2 LUFS and -22.9 dBFS true peak. This is a capture, not completed
  fatigue listening. `tools/audio-capture.mjs --layer=leaves-loop` (or crowd/birds/
  pant/chime) now supports tools-only isolation through the normal downstream mix;
  isolated recordings still need to be captured and judged.
- Next visual candidate: dog model iteration 2 refines face, chest, wrists,
  paws and outline at 1,272 triangles (+24), preserving the 22-bone rig.
  Atmosphere iteration 4 replaces uniform cloud bases with offset connected
  lobes and shape-following shade. Grass reduces compounded dark roots and
  per-clump brightness contrast. Forty-three focused tests pass across grass,
  sky and actor rigs; client typecheck passes. New production visual review
  remains pending while the previous build's ten-minute audio capture finishes.
- Hub hardware baseline (before the above visual candidate): 60-second runs,
  200 sheep, 2560x1440 high, NVIDIA GTX 1660 Ti Max-Q, performance power profile.
  Genuine WebGPU and native-GL WebGL2 both measured 8.4 ms p95; readiness was
  3,725 / 5,995 ms and maxima 141.6 / 191.6 ms. Startup and hitch gates fail.
  Phone viewport 390x844 DPR3 at low WebGL2 measured 8.4 ms p95, 58.3 ms max
  and 2,689 ms readiness on the laptop GPU: emulation, not physical-mobile proof.
  Before-run GPU was 0%; five-second process samples show probe Chrome and normal
  desktop services, with no observed competing game. Reports include build hashes,
  driver/adapter identity and samples in `captures/hub-presentation-latest/`.
  Draw receipts (40 desktop / 28 phone) cover the final 250 ms only, not a
  whole-run maximum. The failed WebGL2 Vulkan launch is retained separately;
  native GL succeeds. No clean overall performance acceptance is claimed.
- Goal execution has started. Gate guidance now has an initial store-driven
  on/off-screen cue, behind-camera projection and painted gate-post collars;
  client typecheck and four projection tests pass. Iteration 1 production smoke
  rendered on genuine WebGPU and forced WebGL2. `captures/guidance/gate-01-turn/`
  verifies visible/behind-camera cues, pause/resume and viewport bounds on both
  backends. Critic found phone counter overlap; iteration 2 source now reserves
  full badge bounds and HUD/control margins, avoids redundant subscription writes,
  and adds reduced-motion-aware transitions. Rebuilt visual validation of those
  fixes is pending. Terrain-only occlusion is not complete object occlusion.
- Dog now has a 22-bone skinned rig with terrain-aware paws; farmer has a
  13-joint rig and bounded homestead route. Integrated production captures in
  `captures/actors/integrated-01-webgpu/` and `integrated-01-webgl2/` verify both
  backends with stable build hashes and no page errors. Continuous recordings
  exist, but have not received playback acceptance. Dog model iteration 2 is
  addressing the critic's blunt face, chest plate, peg feet and heavy contour.
  Farmer remains too distant/obscured in captures for anatomy or gait acceptance.
- Integration checkpoint: lint, client typecheck, 88 files / 686 tests,
  production build and release probe passed. Initial gzip JS is 620,533 bytes;
  first transfer is 5,528,951 bytes. These receipts precede dog model iteration 2.
- Camera now follows the same interpolated subject as dog rendering and clamps
  intermediate camera transitions above terrain; focused camera tests pass.
  Combined input/motion review remains open.
- Controller: partial analog intent now scales target walking speed, preserving
  the existing full/digital normalization path. This is an intentional gameplay
  improvement for precise positioning, not just animation polish. Thirty focused
  control/input/sim tests and twelve determinism/trace checks pass; all existing
  fixtures remain unchanged. Running touch/gamepad feel review is pending.
- Owner added lane 9 for calmer audio: wind-like whooshing and excessive sheep
  noise. The [audio audit](docs/audio-balance-audit.md) records current sources,
  scheduling and listening tasks. Dedicated wind is absent from runtime; the
  actual whoosh source remains unisolated. The baseline permitted a baa start
  every 0.467 s over continuous crowd ambience. Candidate source now adds longer,
  varied call spacing, crowd rests, quieter leaves and fixed spectral filtering.
  Layer isolation and listening acceptance remain pending; this extends rather
  than replaces the original eight-lane goal.
- Audio candidate production capture `captures/audio/calm-audio-candidate-200/`
  has stable build hashes, no page/network errors, -37.2 LUFS and -15.5 dBFS
  true peak. The baseline was -31.7 LUFS / -14.7 dBFS. These short captures do
  not establish subjective improvement; source isolation and fatigue listening
  are still required. A quieter result alone does not satisfy the calm pillar.
- The owner requested a documented eight-lane goal before starting the expanded
  work. See [presentation and feel plan](docs/presentation-and-feel-plan.md) for
  scope, file ownership, sequencing, review criteria and the copy-ready goal.
- It includes continued tree/atmosphere work, gate guidance, dog asset/rig/motion,
  controller/camera polish, an ambient farmer, scene cohesion and validation.
  The planning checkpoint originally had dog work at audit-only; implementation
  has since started as recorded above. No future mode implementation is included.
- All earlier local performance isolation claims are provisional: other agents
  may have been running games. The hub is reachable, but clean CPU/GPU conditions
  must be checked again before and during any replacement performance run.

## Art iteration reopened — 2026-09-05

- Owner authorized a local implementation for review after the concept sheets.
  Main was freshly checked against `origin/main` at `50757dae` before this work.
  The candidate now includes an owned sculpted-oak recipe plus coordinated sky,
  cloud, sun, haze and lighting changes. Nothing has been deployed.
- `tools/bake-sculpted-trees.mjs` deterministically generates the committed
  geometry with source/output digests and AGPL provenance. Seven unequal crown
  masses and connected tapered wood use 560 + 364 triangles per tree: 128,436
  triangles across the unchanged 139-tree placement, still three treeline draws.
  There are no alpha leaves, external models or new tree textures. Tree and bark
  colors now use the master palette. Whole-crown normals soften isolated lobe
  lighting; normalized shader coordinates use `positionGeometry`, avoiding the
  first iteration's instance-space crown/trunk separation.
- Atmosphere: six authored cloud masses in the existing opaque sky draw; warm
  highlights and restrained cool undersides; horizon-matched haze; defined sun
  disc with local glow. Fog now spans 210–580 m. High-tier bloom is 0.18 with
  threshold 1.05; vignette depth is 0.12. Low tier retains the sky/cloud shading
  without postprocessing. Sun direction remains the shared eight-degree light.
- Independent critique: iteration 1 required warmer, less evenly rounded crowns
  and less slab-like clouds; iteration 2 fixed the detached foliage but retained
  padded oval shading; iteration 3 improved connected masses and cloud volume.
  Iteration 3 is suitable for owner review, with verdict ITERATE, not AAA visual
  acceptance. Scores: silhouette 7, ramp 6, cohesion 7, painterly conviction 5,
  tree readability 7, screenshot test 6. Remaining issues are padded canopy
  patches, uniform Y-shaped forks, dense sharp grass versus smooth trees, and
  graphic cloud bases. Continuous motion and physical mobile remain unaccepted.
- Current validation: lint and client TypeScript passed; 83 files / 656 tests
  passed. Production build and release probe passed: 613,245 gzip initial JS
  bytes and estimated first transfer 5,521,662 bytes across 37 files. Current
  60-second renderer evidence is under
  `captures/profiling/sculpted-oak-03-final/`. All six views pass actual backend,
  nonblank screenshot, page stability and draw limits. P95 in matrix order is
  7.1 / 7 / 7 / 48.6 / 34.7 / 20.9 ms; peak draws 49 / 50 / 50 / 50 / 33 / 38.
  Every startup and maximum-gap check failed; portrait high and low also fail
  p95. Crucially, the owner then reported other agents running games on this
  machine: these timings are POTENTIALLY CONTAMINATED and cannot establish
  performance acceptance or a regression. Check hub availability and quietness
  before collecting replacement timing evidence. Art review awaits owner feedback,
  with three of the maximum five critique iterations documented.

### Earlier tooling baseline (before runtime art changes)

- The owner reopened trees, atmosphere, clouds, sun and lighting for a stronger
  art direction. Historical foliage acceptance below is not acceptance of this
  new review. This change adds offline production-build review tooling only;
  it does not change runtime art or deploy anything.
- `npm run review:art` rebuilds, checks the release surface and captures the
  normal game at desktop and emulated phone sizes on WebGPU and forced WebGL2.
  `docs/art-review.md` documents baseline/candidate comparisons, source hashes,
  comparable settings, explicit failed gates and separate human art acceptance.
- Validation: lint and client TypeScript passed; 83 test files / 655 tests
  passed. Production build and release probe passed: 627,957 gzip initial JS
  bytes; estimated first transfer 5,536,374 bytes over 37 files.
- Final isolated tools-only smoke receipt:
  `captures/profiling/art-baseline-tools-20260905/index.html` (four views plus
  three motion stills each). Genuine WebGPU Classic/Follow, forced WebGL2 Follow
  and emulated phone landscape low all pass backend, frame p95, maximum gap,
  stable-page, nonblank canvas and draw-count checks. Five-second p95 values:
  7 / 7 / 7 / 27.8 ms; peak API draw counts: 44 / 50 / 50 / 38. These instrumented
  API counts include browser-probe overhead and are not native renderer GPU
  timings. Camera labels describe scripted controls, not measured transforms.
- Boot remains FAILED on every view: 2,601 / 2,570 / 3,786 / 5,731 ms against
  2,000 ms desktop and 5,000 ms mobile limits. The wrapper correctly exits 1.
  Source and build hashes remained stable; release-surface probe passed with
  no runtime diagnostics added. Earlier exploratory receipts are superseded;
  overlapping browser activity makes their timings unsuitable as a baseline.
- Generated baseline HTML loaded all 16 images with no page errors; a local
  same-receipt comparison smoke loaded all 20 side-by-side/motion images.
  Beauty-camera and grounding acceptance remain unavailable in production;
  they are not silently treated as passed by this art tool.
- Open specification questions (pre-existing, no silent runtime correction):
  `spec/08-performance.md` forbids a per-frame quality governor, while
  `app/src/quality/RuntimeQualityGovernor.tsx` exists; `spec/05-art-direction.md`
  requires the master palette to own colors, while treeline `foliage.ts` and
  `farmhouse/palette.ts` contain authored colors; `spec/04-world-and-assets.md`
  requests an in-field hero tree, while the current treeline README describes
  139 trees outside the fence and no shrubs. Keep the current behavior for this
  tooling change; resolve intent before changing those systems.
- Art verdict remains UNREVIEWED. Physical mobile remains NOT_TESTED. Five-second
  iteration receipts do not satisfy the specified 60-second performance gate.

Updated 2026-08-24 with the approved loading, launch-media and audio-restoration
follow-up. The deployed `release.json` remains the authority for production
commit identity.


## Passed evidence before public import

- 51 test files and 327 tests passed in the clean-room candidate.
- Lint, TypeScript, production build and release-surface probe passed.
- The 17 runtime audio files are pinned by size and SHA-256 in a source ledger.
- WebGPU and forced WebGL2 foliage captures matched with four foliage draws,
  276,110 submitted triangles, no textures and no external models.
- Standalone grass WebGL2 motion evidence found no sharp seam, rhythmic
  stationary annulus or snapping wake trail after the distance-sampled wake
  fix. The integrated game still needs the same running-build probe.

## Clean SDS candidate evidence

- Lint passed. Client and Worker TypeScript checks passed.
- 77 test files and 613 tests passed after the Fox hybrid import.
- Root and Worker dependency audits report zero vulnerabilities.
- Gitleaks 8.30.1 scanned 12.50 MB with no findings. Direct runtime and build
  dependencies report MIT, ISC, Apache-2.0 or dual MIT/Apache licensing.
- The production build contains 231 modules. Initial JavaScript is 612,634
  gzip bytes. Estimated first transfer is 5,768,165 bytes across 35 files,
  below the 8 MiB release limit.
- The procedural replacement passed deterministic bake checks but was not
  owner-accepted for sound character. Treat its inclusion in the public
  cutover as a release regression, not an approved audio decision.
- The deterministic simulation produced 23,563 identical bytes through the
  independent esbuild and Vite bundles.
- Actual WebGPU and forced WebGL2 running-game captures passed at 1,600 by
  1,000 with four foliage draws and no runtime errors.
- The selected Fox hybrid passed its final running-game capture with three
  foliage geometry draws, 94,798 submitted triangles before shadows and a
  WebGPU p95 frame time of about 7 ms.
- Desktop, tablet, phone portrait, phone landscape and reduced-motion UI probes
  passed with no clipped content or controls below 44 CSS pixels. This is
  Chromium touch emulation, not a physical-device receipt.
- The title-screen times dialog passed those same layouts with keyboard focus,
  Escape-to-close and focus restoration. The local probe data is mocked so
  repeated layout checks cannot create identities or write public scores.
- The isolated Pages and Worker preview passed a real mobile interaction: a
  random running name was assigned, renamed to `Preview Shepherd`, and the 25,
  75 and 200 boards each returned HTTP 200. No staging scores were submitted.
- The integrated grass motion critic passed native WebGPU and forced WebGL2 at
  automatic Low and player-forced High settings. It could not reproduce the
  rhythmic annulus, wake snapping or diagonal dark lane.
- The 1,200 by 630 site card and 1,280 by 640 GitHub social preview were
  regenerated from the production bundle on actual WebGPU without score writes.
  The GitHub JPEG is 273,355 bytes.
- Canonical pages, JSON-LD, Open Graph, Twitter cards, robots, sitemap, legacy
  redirects and social-image dimensions pass the discovery gate. Production
  verification also requires the existing Cloudflare Web Analytics beacon.
- Pull request 86 passed Client CI, the isolated score-service preview and the
  Pages preview before merge. The owner then requested the production cutover.

## Post-release follow-up evidence

### Approved follow-up release

- The 17 actual ElevenLabs-generated MP3 assets from commit `6380fe64` are
  restored without changing the audio graph, buses or scheduler. This
  is the earlier 1,255,526-byte set the owner preferred, with the rejected
  insects and wind loops still absent.

- The blank post-React paper wash is replaced by an immediate loading card.
  Its percentage is derived from observed terrain, grass, treeline and scatter
  bytes plus renderer initialization, capability measurement, mounted scene,
  shader compilation and the first presented frame. It cannot publish 100%
  before the field has drawn.
- `npm run probe:boot` now measures the public DOM contract and records named
  `herd:boot:*` performance marks without relying on the retired debug readout.
- Two final cold probes reached Play-ready in 2,299 to 2,371 ms on desktop and
  5,009 to 5,175 ms under 4x CPU plus 9 Mbps mobile emulation. The honest
  progress card reached `Field ready` without page, request or response errors,
  but both results miss the 2,000 ms desktop target and the mobile result is 9
  to 175 ms over its 5,000 ms target. This remains a measured post-release
  optimization risk rather than an unreported pass.
- The candidate passes lint, client and Worker TypeScript, dependency audits,
  production build and 78 test files with 627 tests. The build contains 234
  modules and 614,466 gzip bytes of initial JavaScript. Its estimated first
  transfer is 4,009,011 bytes after restoring the smaller MP3 source set.
- The Open Graph image and GitHub social preview now use a reproducible
  200-sheep Follow-camera gameplay capture. The GitHub JPEG is 221,312 bytes.
  The capture forces the real WebGL2 fallback because first-context headless
  WebGPU screenshots can return a clear canvas; gameplay uses the same TSL
  material path on both backends.
- React Three Fiber is now named in the README and package keywords. The
  repository topic remains a separate metadata follow-up.
- The loading card and title state share the same boot-grid cell, keeping the
  loading card vertically and horizontally centered. Desktop 1,440 by 900 and
  mobile 390 by 844 screenshots passed owner review.
- Portrait Follow uses a wider lens, higher seat and shorter look-ahead. The
  packaged 390 by 844, 200-sheep probe kept the dog framed, held the joystick
  and dedicated Sprint button together, drained stamina from 100 to 76 and fit
  `200 / 200` inside the progress circle. Desktop movement, bark, pause and
  resume also completed without console, page, request or response errors.
- Dog markings now remain attached through vertex deformation; farmhouse dirt
  remains only inside the pen; sheep cheek wool and upper-leg widths are
  balanced; and the asymmetric gait plants backward, recovers forward and
  folds the airborne leg rearward without the rejected body stomp. Matt
  approved the local candidate and authorized commit, push and deployment.
- The restored MP3 runtime passed the production-preview audio lifecycle probe:
  one graph, gesture unlock, five non-duplicated loops, pause/resume, restart,
  visibility, mute/volume and positional bark all passed with no media errors.

### Customizer Studio, Screen-Space Heritage Nameplates and Working Dog Naming

- Added Customizer Studio to personalize working collie coat presets, dog naming, and flock breed variety.
- Working collie can be named by the player, defaulting to "Pip" with 20 authentic British working sheepdog names in a roll ledger. Persisted to `localStorage` under `herd.customization.v1`.
- Implemented unified Screen-Space Heritage Nameplates with 100% native vector Retina typography (Alice serif font, walnut border `#282016`, gold rosettes `◆`, and downward chevron pin) anchored via 3D camera projection. Resolves mobile DPR downsampling blur without Three.js texture upload overhead.
- Features dual-envelope tracking hysteresis (0.055 NDC acquisition, 0.110 NDC retention, 250ms dropout grace window), harmonic spring arrival (\(k=260, c=18\)), organic pasture bobbing, and full mobile touch parity (tap-to-pin for 4s, tap-to-dismiss).
- Flock breeds supported: Suffolk, Cheviot, Herdwick, Kerry Hill, Badger Face, Moorit, and Balwen.
- 81 test files and 649 unit tests pass. Lint, client TypeScript, Worker TypeScript, and production build pass with zero errors and zero warnings. Initial JavaScript bundle is 627.54 kB gzip.


- Complete the desktop, mobile, offline-score and service-worker transition
  matrix in `docs/launch/v3-launch-pack.md`.
- Complete a physical iOS or Android playtest. Browser touch emulation already
  covers portrait and landscape layout, joystick, bark, camera and pause.
- Capture the remaining final launch screenshot set from the accepted commit.
- Update the stale GitHub description/topics,
  redirect `www.sheepdogsim.com` and `sds-frontend.pages.dev` to the apex, and
  submit the sitemap in Google Search Console and Bing Webmaster Tools.

