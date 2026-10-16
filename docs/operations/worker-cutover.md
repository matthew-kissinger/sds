# Release 1 cutover: sheepdogsim.com from Pages to sds-worker

The one-time production procedure that moves `sheepdogsim.com` from the
`sds-frontend` Pages project onto the existing `sds-worker` Worker. After it,
`docs/operations/deployment.md` is the procedure for every release.

Run the steps in order. Each production step needs the owner's approval in
conversation. Every check asserts a content type or a body, never a status
alone: before the route exists, `https://sheepdogsim.com/api/anything` answers
200 `text/html` from the Pages fallback.

Commands are PowerShell 7, run from the repository root unless a step says
`worker/`. `$sha` is the full commit being cut over.

## What changes, and the one irreversible part

- Step 1 deploys the new Worker without a route. The game appears on the
  `workers.dev` host, the API there keeps its routes, and `sheepdogsim.com`
  is still Pages. It also applies the `v2` migration that **deletes the
  RoomDO and LobbyDO classes and their stored state**. From that moment
  `wrangler rollback` can no longer return `sds-worker` to any earlier
  version (`f5c30a31-548d-4b92-9a49-2fedceaade02` was live on 2026-10-16);
  recovery from a bad step 1 is a forward fix. Live players are exposed to
  step 1 only through the API on `workers.dev`, whose REST routes are
  unchanged.
- Step 2 adds the route. It changes routing only, and deleting the route
  undoes it within moments.

## 0. Preconditions

1. The cutover branch is merged and `Client CI` is green on the merge commit.
   Prefer a commit that already carries the 3.2.0 bump and `CHANGELOG.md`
   entry, so the commit cut over is the one tagged afterwards.
2. A clean checkout of exactly that commit:

   ```powershell
   git fetch origin
   git switch --detach <merge-commit>
   git status --short          # must print nothing
   $sha = git rev-parse HEAD
   ```

3. Dependencies, licensed audio and a build. The build writes `release.json`
   itself, so any `npm run build` of the commit is a complete artifact.

   ```powershell
   npm ci
   npm ci --prefix worker
   # assets/audio/licensed/ is gitignored: copy it from a checkout that has it,
   # or run: node tools/prepare-approved-audio.mjs --download   (needs ffmpeg)
   $env:SDS_RELEASE_SHA = $sha
   $env:SDS_RELEASE_REF = 'main'
   npm run build
   node scripts/verify-release-manifest.mjs --path dist/release.json --sha $sha --require-v3-static
   npm run check:discovery
   ```

4. Wrangler is signed in to the right account, and production is where the
   repository expects it:

   ```powershell
   Push-Location worker
   npx wrangler whoami
   npx wrangler deployments status     # record the current version id
   Pop-Location
   ```

## (a) Verify on the preview Worker first

`sds-worker-preview` already carries the `v2` migration: it was applied there
by `wrangler deploy --env preview` on 2026-10-16 (version
`891388fa-f086-4d1e-98a1-8f935b09f090`), so a version upload works. Upload this
exact build under an alias. The preview has its own D1 and `JWT_SECRET`.

```powershell
Push-Location worker
(Get-Content wrangler.toml -Raw) -replace '00000000-0000-0000-0000-000000000000', '6d5b0fce-952f-4d94-8936-b51fc559496c' | Set-Content wrangler.preview-cutover.toml -NoNewline
npx wrangler versions upload --env preview -c wrangler.preview-cutover.toml --preview-alias cutover --message $sha
Remove-Item wrangler.preview-cutover.toml
Pop-Location

$preview = 'https://cutover-sds-worker-preview.matt-m-kissinger.workers.dev'
node scripts/verify-worker-origin.mjs --url $preview --sha $sha --retries 12
node scripts/verify-identity.mjs --url $preview --save "$env:TEMP\sds-preview-identity.json"
node scripts/verify-identity.mjs --url $preview --check "$env:TEMP\sds-preview-identity.json"
node scripts/verify-public-discovery.mjs --url $preview --require-analytics
```

`verify-worker-origin` requires: `/` is `text/html` and the game page; an
unmatched path is the same `index.html`; `/about.html` 301s to `/about`;
`/release.json` is JSON with `no-store` and reports `$sha`; `/api/healthz` is
`application/json` `{"ok":true,"worker":"sds-worker"}`; an unknown `/api` path
is a JSON 404; the `field-v3` 25-sheep board is a JSON array. Then open
`$preview` in a browser, open Times, and finish one 25-sheep run.

Stop here if anything fails.

## (b) Mint the production check identities

Within 24 hours of step 1 (the stored token expires then), on the Worker that
is live now:

```powershell
$wd = 'https://sds-worker.matt-m-kissinger.workers.dev'
node scripts/verify-identity.mjs --url $wd --save "$env:TEMP\sds-prod-identity.json"
node scripts/verify-identity.mjs --url $wd --check "$env:TEMP\sds-prod-identity.json"   # baseline: must pass now
```

This registers one public player named `Cutover Check` and stores its
`persistentId`, `authSecret` and a token minted by the current Worker. Keep the
file out of the repository and delete it after (e).

Second identity, the owner's own: on `https://sheepdogsim.com` in the owner's
browser, DevTools console, run
`copy(localStorage.getItem('sheepdog.score-identity.v1'))`, paste the result
into `$env:TEMP\sds-owner-identity.json`, and note the name the game shows. It
holds the owner's device secret: keep it out of the repository and chat, and
delete it after (e). Baseline it the same way:

```powershell
node scripts/verify-identity.mjs --url $wd --check "$env:TEMP\sds-owner-identity.json"
```

It has no token, so `--check` runs the re-register and wrong-secret steps.

## (c) Production step 1: new Worker, no route

From `worker/`, derive a config without the route, prove it, dry-run it, deploy
it. `wrangler deploy` is required: only a deploy applies the class deletion,
and `wrangler versions upload` refuses a pending one (measured on the preview
Worker: "This Worker has a pending Durable Object migration, which cannot be
applied by `wrangler versions upload`", and nothing is uploaded).

```powershell
Push-Location worker
(Get-Content wrangler.toml -Raw) -replace '(?ms)^\[\[routes\]\]\r?\npattern = "sheepdogsim\.com/\*"\r?\nzone_name = "sheepdogsim\.com"\r?\n', '' | Set-Content wrangler.step1.toml -NoNewline
node -e "const c=require('wrangler').unstable_readConfig({config:'wrangler.step1.toml'},{hideWarnings:true});if((c.routes??[]).length||c.route||c.workers_dev!==true||!c.assets||c.d1_databases[0].database_name!=='sds-db')throw new Error('step-1 config is wrong; do not deploy it');console.log('step-1 config ok:',JSON.stringify({name:c.name,routes:c.routes??[],workers_dev:c.workers_dev,assets:c.assets.directory,d1:c.d1_databases[0].database_name}))"
npx wrangler deploy -c wrangler.step1.toml --dry-run
npx wrangler deploy -c wrangler.step1.toml --message "Release 1 step 1 $sha"
Remove-Item wrangler.step1.toml
Pop-Location
```

The check must print `routes:[]`, `workers_dev:true`, `assets:"../dist"` and
`d1:"sds-db"`. Wrangler warns that no environment was named; the top-level
(production) configuration is the intended target. The deploy output must list
`env.DB (sds-db)` and `env.ASSETS`, no Durable Object, and only the
`workers.dev` trigger.

### Smoke on workers.dev

```powershell
$wd = 'https://sds-worker.matt-m-kissinger.workers.dev'
node scripts/verify-worker-origin.mjs --url $wd --sha $sha --retries 12
node scripts/verify-identity.mjs --url $wd --check "$env:TEMP\sds-prod-identity.json"
node scripts/verify-identity.mjs --url $wd --check "$env:TEMP\sds-owner-identity.json"
node scripts/verify-public-discovery.mjs --url $wd --require-analytics
```

- `verify-worker-origin`: `/` is now `index.html` (it was the health JSON),
  `/api/healthz` is `application/json`, `/release.json` reports `$sha`.
- `sds-prod-identity`: `preChangeToken: accepted` proves `JWT_SECRET` is
  unchanged, and the same `Cutover Check#NNNN` name proves the same D1 row. If
  the token is refused, stop: do not add the route.
- `sds-owner-identity`: the owner's name, unchanged.

The live site is still Pages, calling this API cross-origin. Confirm that
still works:

```powershell
node -e "fetch('https://sds-worker.matt-m-kissinger.workers.dev/api/leaderboard?mode=solo&scene=field-v3&sheepCount=25&limit=1',{headers:{origin:'https://sheepdogsim.com'}}).then(r=>{const t=r.headers.get('content-type')||'',a=r.headers.get('access-control-allow-origin');if(r.status!==200||!t.startsWith('application/json')||a!=='*')throw new Error([r.status,t,a].join(' '));console.log('cross-origin ok',r.status,t,a)})"
node -e "fetch('https://sheepdogsim.com/api/healthz').then(r=>{const t=r.headers.get('content-type')||'';if(!t.startsWith('text/html'))throw new Error('expected the Pages fallback before the route, got '+t);console.log('baseline: sheepdogsim.com/api is still Pages',t)})"
```

Then load `https://sheepdogsim.com` in the owner's browser, open Times, and
confirm the owner's name and the board appear.

## (d) Production step 2: add the route

From `worker/`, with the real `wrangler.toml`. `triggers deploy` applies only
triggers - the route, `workers_dev` and `preview_urls` - and leaves the version
deployed in step 1 alone:

```powershell
Push-Location worker
npx wrangler triggers deploy
Pop-Location
```

Its output must name `sheepdogsim.com/*` (zone `sheepdogsim.com`) and still the
`workers.dev` host. If `triggers deploy` (experimental) misbehaves,
`npx wrangler deploy --message "Release 1 step 2 $sha"` from `worker/` does the
same with a fresh upload of identical code and assets.

## (e) Verify sheepdogsim.com

```powershell
$site = 'https://sheepdogsim.com'
node scripts/verify-worker-origin.mjs --url $site --sha $sha --retries 12
node scripts/verify-release-manifest.mjs --url "$site/release.json" --sha $sha --retries 12
node scripts/verify-public-discovery.mjs --url $site --require-analytics --retries 12
node scripts/verify-identity.mjs --url $site --check "$env:TEMP\sds-prod-identity.json"
node scripts/verify-identity.mjs --url $site --check "$env:TEMP\sds-owner-identity.json"
node scripts/verify-worker-origin.mjs --url https://sds-worker.matt-m-kissinger.workers.dev --sha $sha
```

- `/api/healthz` on `sheepdogsim.com` must be `application/json`. If it is
  still `text/html`, the route has not taken effect: wait and rerun; do not
  read a 200 as success.
- Discovery must report `one beacon, source token`: exactly one beacon,
  carrying the `sheepdogsim.com` site token from `app/index.html`, not the
  Pages token.
- Both identities resolve to the same names.

Record whether the zone's automatic Web Analytics injection reaches the pages
that carry no snippet; this decides (g):

```powershell
node -e "for (const p of ['/','/about','/support','/privacy']) fetch('https://sheepdogsim.com'+p).then(r=>r.text()).then(t=>console.log(p,'beacons:',(t.match(/beacon\.min\.js/g)||[]).length,'token:',(t.match(/token.: ?.([0-9a-f]{32})/)||[])[1]||'-'))"
```

Finally, in the owner's browser, reload `https://sheepdogsim.com`, confirm the
name the game shows is unchanged, open Times, and finish one run. DevTools
Network shows `/api/register` and `/api/leaderboard` on `sheepdogsim.com`
itself, as `application/json`.

Then tag the cutover commit and push the tag. `Deploy` redeploys the same
commit through the workflow and runs the same live checks, which also proves
`CF_API_TOKEN` can publish the route (it needs Workers Routes edit on the
`sheepdogsim.com` zone). Delete the two identity files.

## (f) Rollback: delete the route

Deleting the route hands `sheepdogsim.com` back to the Pages project, whose last
production deployment is 3.1.0 at `1dbd01507eec15eabf31486e2a8b78909a26abc5`.
That client calls the API on `workers.dev` cross-origin, which the Worker still
allows. Removing `[[routes]]` from `wrangler.toml` and deploying does **not**
remove a route: Wrangler leaves routes alone when the config declares none.

Dashboard: Workers & Pages > `sds-worker` > Settings > Domains & Routes >
`sheepdogsim.com/*` > Remove. Or the API, with Wrangler's own sign-in:

```powershell
Push-Location worker
$token = (npx wrangler auth token --json | ConvertFrom-Json).token
Pop-Location
$h = @{ Authorization = "Bearer $token" }
$zone = '08f6aca2579390fc14be2cfa39bd99ce'   # sheepdogsim.com
$route = (Invoke-RestMethod -Headers $h -Uri "https://api.cloudflare.com/client/v4/zones/$zone/workers/routes").result | Where-Object { $_.pattern -eq 'sheepdogsim.com/*' }
$route | Format-Table id, pattern, script   # must be exactly one row, script sds-worker
Invoke-RestMethod -Method Delete -Headers $h -Uri "https://api.cloudflare.com/client/v4/zones/$zone/workers/routes/$($route.id)"
```

Verify Pages answers again:

```powershell
node scripts/verify-release-manifest.mjs --url https://sheepdogsim.com/release.json --sha 1dbd01507eec15eabf31486e2a8b78909a26abc5 --retries 12
node -e "fetch('https://sheepdogsim.com/api/healthz').then(r=>console.log('sheepdogsim.com/api now',r.status,r.headers.get('content-type')))"   # text/html again: the Pages fallback
```

Then revert the routes commit on `main` before any tag: while `[[routes]]` is
in `wrangler.toml`, every deploy publishes the route again. The Worker itself
stays at step 1; it cannot roll back past the class deletion and does not need
to.

## (g) Only after (e): retire the Pages analytics

Owner-approved dashboard actions, in this order, each after the one before is
verified:

1. Turn off Web Analytics on the `sds-frontend` Pages project. Its token
   (`b5895c76a5cb439ca880f29caf3e70bc`, site `sds-frontend.pages.dev +1`)
   then stops being injected anywhere; `sds-frontend.pages.dev` keeps serving
   3.1.0 without a beacon.
2. Switch the `sheepdogsim.com` Web Analytics site to "Enable with JS Snippet
   installation". (e) showed the zone injecting nothing on Worker-served
   pages, so every HTML page now carries the snippet itself and automatic
   injection has no work left.
3. Rerun the discovery check:
   `node scripts/verify-public-discovery.mjs --url https://sheepdogsim.com --require-analytics`
   It must still report exactly one beacon with the source token.

Do not delete the Pages project. It holds the immutable v2 deployment
(`docs/operations/v2-rollback.md`) and is the rollback target in (f).
