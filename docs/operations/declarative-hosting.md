# Declarative hosting: `sheepdogsim.com` as a Worker Custom Domain, the Pages project retired

**Steps 1, 2 and 4 ran as release 3.3.1 and steps 3 and 5 as release 3.3.2,
both on 2026-10-17 ("Production results" below; `docs/history/status-log.md`).
The sequence is complete.**
This is the Release 2 step after the `cf` cutover (`docs/operations/deployment.md`): the apex stops being a proxied
CNAME to the dormant `sds-frontend` Pages project with a Worker route on top,
and becomes a Custom Domain of `sds-worker` declared in
`app/cloudflare.config.ts`, so the deploy owns the DNS record and the
certificate. Every production step below is the owner's go, one at a time;
the reads and the rehearsal come first. The facts are dated 2026-10-16.

## What is there today

Read from the dashboard API on 2026-10-16 (GETs only, by a Sonnet agent in
Chrome; the full bodies are in the session, the ids here are what the steps
need):

| Thing | State |
| --- | --- |
| DNS `sheepdogsim.com` | CNAME `sds-frontend.pages.dev`, proxied, record `46ad7bd136d32247ae0e1a92e1e2745c` ("Cycle 2 cutover: point apex at sds-frontend Pages project") |
| DNS `www.sheepdogsim.com` | CNAME `sheepdogsim.com`, proxied, record `e5625f44ec434bc11fccfa6210c351d5` (Release 1 cutover; the redirect rule does the work) |
| DNS, the rest | four CAA records (`issue "pki.goog"`, `issue "letsencrypt.org"`, `issuewild ";"`, `iodef`), null MX, null SPF, DMARC reject, a Google site verification TXT |
| Workers route | one, `sheepdogsim.com/*` to `sds-worker`, id `697ab87107614e77b5bda54eb6111e97` |
| Workers Custom Domains on the account | none for sds (one unrelated, on another zone) |
| Pages project `sds-frontend` | custom domain `sheepdogsim.com` active (id `64c23303-17d9-414f-ae8b-4d2edaeb01f6`, certificate authority `google`, HTTP validation); production deployment `065f53da` (3.1.0); the immutable v2 deployment `7cea2cd2` (`docs/operations/v2-rollback.md`) |
| Redirect rule | "www to apex", phase `http_request_dynamic_redirect`, `(http.host eq "www.sheepdogsim.com")`, 301, path and query kept, rule `fc4e748d61db445ca41071b3e5e50b7f` |

The route takes precedence over the Pages custom domain on the same hostname,
which is why the Release 1 cutover needed no DNS change and rolls back by
deleting the route.

## What the sources say

Each fact names where it comes from; "measured" means run here.

1. **A Custom Domain is refused on a hostname with a CNAME, by default.**
   "You cannot create a Custom Domain on a hostname with an existing CNAME DNS
   record." The documented migration from a route deletes the CNAME first and
   then deploys to create the Custom Domain.
   (developers.cloudflare.com/workers/configuration/routing/custom-domains/,
   "Add a Custom Domain" and "Migrate from Routes".)
2. **The deploy tools override that refusal, and in CI they do it without
   asking.** wrangler 4.151.0 and `cf` 1.0.0-beta.18 share the code
   (`publishCustomDomains`, read in both packages' bundles): the deploy POSTs
   `.../domains/changeset?replace_state=true`, and when the changeset reports
   `conflicting` DNS records or domains used by another Worker, a TTY asks
   "You already have DNS records that conflict for these Custom Domains ...
   Update them to point to this script instead?"; **without a TTY both
   `override_existing_dns_record` and `override_existing_origin` are set to
   true and the PUT to `.../domains/records` goes ahead.** A `Deploy` run is
   not a TTY. So the first tag after `domains` reaches `main` replaces the
   apex CNAME with the Worker's record, with no prompt. That is the cutover,
   and it must be the tag the owner pushes for it. The flags are not in the
   public API docs for `PUT /accounts/{id}/workers/domains`, which lists only
   `hostname`, `service`, `enabled`, `previews_enabled`, `zone_id`,
   `zone_name`.
3. **What a Custom Domain creates and leaves behind.** Cloudflare "will create
   DNS records and issue necessary certificates on your behalf", an Advanced
   Certificate on the zone for the hostname; on removal the certificate "is
   not automatically deleted" and must be removed under SSL/TLS > Edge
   Certificates. What happens to the created DNS record on removal is not
   documented: the rehearsal below measures it. (Custom Domains page,
   "Background" and the certificate notes.)
4. **Routes win over Custom Domains on the same hostname.** "Routes can
   `fetch()` Custom Domains and take precedence if configured on the same
   hostname"; a Worker on a Custom Domain "is treated as an origin". So the
   route can stay through the DNS change and traffic does not move until the
   route is deleted; that is what makes the sequence below gapless.
   (routes/ and custom-domains/, "Interaction with Routes".)
5. **A deploy does not delete a route it no longer declares.** wrangler's and
   `cf`'s deploy warn "Previously deployed routes ... have not been deleted
   ... you can remove them in the dashboard" (same bundles). Deleting the
   route stays a dashboard or API step, as in
   `docs/operations/worker-cutover.md` (f).
6. **`www` should not be a Custom Domain.** For "Redirect between www and root
   domain" Cloudflare's own recommendation is the Custom Domain on the target
   hostname, a redirect rule, and for the hostname redirected *from* a
   placeholder proxied record (A `192.0.2.0` or AAAA `100::`): "requests
   never reach this address, Cloudflare intercepts them and applies your
   redirect rule." Whether a Custom Domain on `www` would interfere with the
   rule is not stated anywhere, and "a Worker attached to `example.com` will
   not receive requests sent to `www.example.com`, and vice versa". The
   current proxied CNAME to the apex is already such a placeholder and is
   verified by every deploy. **This amends the end state in `STATUS.md`:**
   the apex becomes a Custom Domain; `www` keeps its record and the rule as
   the two zone settings the repository verifies but does not own. The
   trade-off: one DNS record is still created by hand rather than by the
   deploy, in exchange for not putting the game behind a hostname whose only
   job is to redirect.
7. **`cf` declares it as `domains`.** The installed `@cloudflare/config`
   types `domains?: Array<string | { hostname, production, previews }>`:
   "Strings serve production traffic only ... Domain settings are applied
   when deploying the parent Worker. Preview uploads use the parent's
   existing hosting without applying domains." The public reference
   (developers.cloudflare.com/cf/projects/cloudflare-config/) still documents
   only `domains?: string[]`, "Use `domains` for custom domains. Use
   `triggers.fetch()` for routes", so the string form is the one to write.
   `cf workers versions create` for a pull request therefore never touches a
   domain, and `triggers` and `domains` are separate fields on one Worker.
   The docs also name `cf workers triggers deploy`, which "applies routes,
   custom domains, the `workers.dev` setting, cron schedules, Queue consumers,
   and Workflows" from the Build Output "without uploading a new version"
   (developers.cloudflare.com/cf/projects/, "Deploy triggers"): the hosting
   half of a deploy on its own, usable from this PC with the owner's
   credentials if a step ever needs it without a release. Measured: `cf
   deploy --dry-run --prebuilt --no-provision` and `cf workers triggers
   deploy --dry-run --prebuilt` against a Build Output with `domains` set
   both pass and print nothing about domains or routes (the first prints the
   bindings, the second only "Deploy triggers"); neither dry run is a check
   of either, and nothing short of a deploy shows what the changeset will do,
   which is what the rehearsal is for. The docs say nothing about conflicts,
   overrides, DNS or certificates for `cf`; fact 2 comes from its bundle.
8. **`--no-provision` is about bindings.** `cf deploy --help`: "Automatically
   provision resources for bindings that need them." Domains are published
   after the upload by the route code in fact 2, which `--no-provision` does
   not name; the rehearsal confirms a domain is created with the flag on.
9. **CAA.** The zone allows `pki.goog` and `letsencrypt.org` to issue and
   forbids wildcards. The Pages certificate is from `google`. The Advanced
   Certificate a Custom Domain requests must come from one of those two
   authorities or issuance fails; the rehearsal reads the `cert_id` and the
   certificate's authority before the apex is touched.
10. **The v2 rollback changes shape.** Today v2 is "delete the route, roll
    the Pages project back to `7cea2cd2`" (`docs/operations/v2-rollback.md`).
    Once the apex record points at the Worker and the Pages custom domain is
    gone, handing `sheepdogsim.com` to Pages again means removing the Worker
    Custom Domain and re-adding the Pages custom domain (its own HTTP
    validation), not deleting a route. The v2 deployment itself stays
    reachable on `https://7cea2cd2.sds-frontend.pages.dev`, and the Worker's
    own rollback (`wrangler rollback`, any version from Release 1 on) is
    unchanged. The Pages project is kept for that URL; it is not deleted.

## What cannot be rehearsed, and what can

The preview Worker has no zone, so the apex itself, the Pages interaction and
the live redirect cannot be rehearsed on it. Everything else can, on a
throwaway hostname of the same zone, because a Custom Domain's hostname "can
be either the zone apex or a subdomain of the zone" and the preview Worker is
a Worker on this account:

**Rehearsal: `stage.sheepdogsim.com` on `sds-worker-preview`.** Owner's go,
reversible, nothing on it is public.

1. Owner, dashboard: add DNS `stage.sheepdogsim.com` CNAME `sheepdogsim.com`,
   proxied. This recreates the production conflict (a CNAME in the way).
2. Branch: in the `preview` mode of `app/cloudflare.config.ts` add
   `domains: ['stage.sheepdogsim.com']`; in `verify-deploy-config.mjs` let the
   preview shape carry exactly that domain; pin it in
   `tests/worker/cloudflare-config.spec.ts`. Open the pull request. Its
   Preview run ends with `cf deploy --prebuilt --mode preview`, which is the
   non-TTY deploy of fact 2.
3. Read, through the dashboard API (GETs): the zone's DNS record for `stage`
   (type, content, proxied: did the override replace the CNAME, and with
   what), `accounts/.../workers/domains` (the new entry's `cert_id`,
   `enabled`), the certificate's authority under the zone's SSL/TLS
   certificate packs, and the Preview run's log for what `cf` printed about
   the domain. Then `node scripts/verify-worker-origin.mjs --url
   https://stage.sheepdogsim.com --sha <pr head sha>`.
4. Measure removal: take `domains` out again, push; after the Preview run,
   read whether the Custom Domain entry, the DNS record and the certificate
   are still there (fact 5 says the deploy will not remove them). Then remove
   the Custom Domain through the dashboard (Workers & Pages > sds-worker-preview
   > Settings > Domains & Routes), read the DNS record again, and delete what
   is left: the record and, under SSL/TLS > Edge Certificates, the
   certificate. Record each answer in `docs/history/status-log.md`.
5. Close the pull request unmerged; the rehearsal leaves nothing in `main`.

The rehearsal answers facts 2, 3, 8 and 9 for this account before the apex is
touched.

## Rehearsal results, 2026-10-17 (pull request 128, closed unmerged)

Run as written above, with the owner's go; the dashboard steps were done
through Claude in Chrome on the owner's session, each one approved. Times UTC.

1. **The CI override does not replace a record we made.** With the proxied
   CNAME `stage -> sheepdogsim.com` in place, the Preview run deployed the
   version and then failed at the domain step: `Trigger configuration for
   "sds-worker-preview" was only partially updated: Custom domains: ...
   Hostname 'stage.sheepdogsim.com' already has externally managed DNS
   records. Successful trigger changes were not rolled back.` Exit 1, the
   new version live on `workers.dev`, nothing else changed. So fact 2's
   override covers records Cloudflare itself manages, not ours, and the
   docs' rule (fact 1) holds for the apex CNAME: **it has to be deleted
   before the deploy.** A production `Deploy` would end red the same way
   with the release already live behind the route.
2. **The clean path, and the gap.** Record deleted 00:18:29; the failed job
   re-run 00:18:36 to 00:19:42; `cf` printed `stage.sheepdogsim.com (custom
   domain)` under `Deployed sds-worker-preview triggers`; the record it
   created is dated 00:19:35, so the hostname had no record for 66 s, the
   time the pipeline took to reach the trigger step. The record is a proxied
   `AAAA 100::`, `read_only: true`, with `meta.origin_worker_id` naming the
   Custom Domain: a placeholder exactly like the one Cloudflare recommends
   for a redirected hostname (fact 6), owned by the domain. Its public
   answer (`104.21.11.5`, `172.67.131.198`) is the same pair the CNAME had
   resolved to, so a resolver holding the old answer kept working through
   the gap; one that asked during it got an empty answer with the zone's
   negative TTL, `default TTL = 1800` in the SOA, 30 minutes. The first
   probe after the run, at 00:20:01, answered 200;
   `verify-worker-origin --url https://stage.sheepdogsim.com` and
   `verify-public-discovery --require-analytics` passed on it; the apex and
   `www` were unchanged throughout.
3. **The certificate.** The deploy requested an advanced certificate pack
   (`887fe855...`) from `google`, allowed by the CAA records, by TXT
   validation, `pending_validation` at 00:21 and `active` by 00:26. Its
   hosts were `sheepdogsim.com`, `stage.sheepdogsim.com` and
   `*.stage.sheepdogsim.com`: **a Custom Domain on a subdomain requests a
   pack that includes the zone apex.** TLS on `stage` was served by the
   Universal wildcard (`*.sheepdogsim.com`, Google WE1) the whole time, so
   issuance is not on the path to serving. The dashboard's Edge
   Certificates page never listed the advanced pack (ACM is not active on
   the zone); it is visible through the API only.
4. **An undeclared domain stays.** The config without `domains` deployed
   (version `d5028f5e...`) and `cf` printed nothing about the domain; the
   domain entry, the `AAAA` record and the certificate pack were all still
   there afterwards and `stage` still served the game. Fact 5 holds for
   Custom Domains as for routes.
5. **Removing the domain removes its record and its certificate.** Workers
   & Pages > `sds-worker-preview` > Domains > Remove (the dialog warns the
   DNS change "may take up to 24 hours"): the `AAAA` record was gone at
   once, the hostname stopped resolving within seconds, and the advanced
   pack and both of its certificates read `status: deleted`. The docs' "the
   certificate is not automatically deleted" (fact 3) did not hold here;
   nothing was left to clean up by hand. The zone is back to its ten
   records and the account to no sds Custom Domain.

**What this changes in the plan.** The sequence below is written for the
measured behaviour: the apex CNAME must go before the deploy that declares
the domain, so there is a gap, seconds long if the domain is published from
this PC with `cf workers triggers deploy --prebuilt` right after the
deletion, 66 s if a tag does it, with a 30-minute negative-cache tail for
any resolver that asks inside it. The route serves throughout for everyone
whose resolver already holds the answer. The rollback at every step is
simpler than planned, because removing the domain removes its record and
certificate.

**The alternative the results make available: retire Pages without a Custom
Domain.** The Custom Domain's own record is a proxied `100::` placeholder;
the game is served at the edge by the route either way. Editing the apex
CNAME in place to that same placeholder (`AAAA 100::`, proxied), keeping
the route, and then removing the Pages custom domain retires Pages with no
gap at all, because an edit of a proxied record changes nothing a client
sees. What it gives up is the deploy owning the apex record: the record
becomes one more zone setting the verifiers check and the repository does
not create, exactly as `www` already is. Which to take is the owner's call;
the sequence below is the Custom Domain path, and the placeholder path is
the three dashboard steps just named plus the Pages removal in step 4.

## The production sequence (Custom Domain path)

Preconditions: the rehearsal is recorded; `main` is green; the owner has read
this file and the amended end state in `STATUS.md`. Each numbered step is one
owner's go.

1. **Config, on a branch.** Production mode: add `domains: ['sheepdogsim.com']`
   and keep `triggers` (the route) as it is. `verify-deploy-config.mjs`
   requires exactly that domain in production and none in preview;
   `tests/worker/cloudflare-config.spec.ts` pins it; `wrangler.toml` is not
   changed (wrangler's `custom_domain` route form is a different thing and
   wrangler no longer deploys production). Merge only when the next tag is
   the one meant to do this: the merge arms it, the tag fires it (fact 2).
2. **The record and the domain, back to back.** Measured: the deploy
   refuses a hostname with our own record, so the apex CNAME
   `46ad7bd1...` is deleted first and the domain published right after.
   Smallest gap: at a quiet hour, with the merged config built locally
   (`npm run build`, `verify-deploy-config --cf`), the owner deletes the
   record in the dashboard and in the same minute runs, from `app/` with
   their own `cf` login, `cf workers triggers deploy --prebuilt`, the
   hosting half alone (fact 7). The alternative is to let the tag do both
   halves, which measured 66 s from the start of the run to the record.
   Either way `cf` creates the proxied `AAAA 100::` record owned by the
   domain, requests the advanced certificate (Google, TXT validation, a
   few minutes; the Universal certificate serves meanwhile) and re-publishes
   the route. Traffic does not move: the route still wins (fact 4), and
   resolvers holding the old answer never notice. A resolver that asks
   inside the gap caches an empty answer for up to 30 minutes.
   Read afterwards: the apex record (`AAAA 100::`, read-only, owned by the
   domain), the account's Workers Custom Domains (`sheepdogsim.com` to
   `sds-worker`, `enabled`, `cert_id`), the pack's authority and status, the
   live checks, and the Pages custom domain's status (expected to leave
   `active`, per the Pages page "Change DNS entry away from Pages").
   Rollback here: remove the Custom Domain in the dashboard, which takes
   its record and certificate with it (measured), recreate the apex CNAME
   to `sds-frontend.pages.dev` proxied, and revert the config commit before
   the next tag.
3. **Delete the route.** Dashboard: Workers & Pages > `sds-worker` > Settings >
   Domains & Routes > `sheepdogsim.com/*` > Remove, or the API as in
   `worker-cutover.md` (f). The Custom Domain now serves. Verify:
   `verify-release-manifest --url`, `verify-worker-origin --url
   https://sheepdogsim.com`, `verify-public-discovery --url ...
   --require-analytics` (the www redirect is part of it), and the `workers.dev`
   host. Rollback here: re-add the route (any deploy while `triggers` is
   still declared re-publishes it; or the dashboard), which wins again.
4. **Retire the Pages custom domain.** Dashboard: Workers & Pages >
   `sds-frontend` > Custom domains > `sheepdogsim.com` > Remove domain. Its
   CNAME is already gone (step 2). The project stays, with `sds-frontend.pages.dev`
   and `7cea2cd2.sds-frontend.pages.dev`. `docs/operations/v2-rollback.md`
   (fact 10) is updated with it. Done 2026-10-17, right after step 2's
   deploy; in hindsight it belongs before step 2 ("Production results", 3).
5. **Follow-up release: drop the route from the config.** Remove `triggers`
   from the production mode; the verifier requires `triggers` empty and
   `domains` `['sheepdogsim.com']`; the config test and the wrangler test
   change together (`wrangler.toml`'s `[[routes]]` goes, or the file goes, as
   `deployment.md` says). Update `deployment.md`: "Routes and hostnames",
   "Rolling back" (no route to delete; hosting rollback is the Worker's
   version rollback; v2 as in fact 10), "Zone configuration" (the www record
   and rule, the analytics mode, CAA and the mail records are the zone
   settings), the token table (Workers Routes edit is still needed while the
   route exists, and the Custom Domain changeset needs the zone's DNS edit
   through the Workers Scripts permission; read the first deploy's log for a
   permission error before the tag by running the rehearsal with the same
   token, which it does).

After step 5 the repository declares every hosting fact it owns, and the zone
holds exactly: the apex record and certificate the deploy created, the `www`
placeholder record, the redirect rule, the Web Analytics mode, and the
mail-hardening and CAA records from before.

## Production results, 2026-10-17 (release 3.3.1)

Order taken, to keep the gap off CI's clock: the owner's go, the apex CNAME
deleted in the dashboard, the Custom Domain added in the dashboard (Workers &
Pages > `sds-worker` > Domains > Add Domain > `sheepdogsim.com`, subdomain
empty, Production), then the tag. Times UTC.

1. **The gap was the dashboard navigation.** CNAME `46ad7bd1...` deleted
   about 00:48:15; record `AAAA 100::` (proxied, read-only, owned by the
   domain) and the advanced certificate pack created 00:49:34: about 80 s.
   Deleting and adding from two prepared tabs would make it seconds.
2. **The tag's deploy found the domain and said so.** `v3.3.1` pushed
   00:49:53; `Deploy` 38988161939 green 00:52:52. `cf deploy` printed the
   route and `sheepdogsim.com (custom domain)` under "Deployed sds-worker
   triggers"; the dashboard-created domain and the declared one are the same
   object, nothing duplicated. Version `588a8202`, `source: cf_cli`, live
   00:52:45; the live verifiers passed.
3. **Pages answered the apex for about two minutes, against fact 4.** From
   the domain's creation until some time before 00:51:13, requests to the
   apex returned the Pages project's 3.1.0 (ETag `06234d66...`, no
   `CF-Cache-Status`), not the Worker, with the route in place throughout.
   Then the Worker's 3.3.0, eight of eight requests, and the Pages custom
   domain read `status: deactivated` (`verification_data.status:
   deactivated`) without anyone touching it. Fact 4 held while the apex was
   a CNAME to Pages; it did not hold in the window when the Pages custom
   domain was still attached to a hostname whose record had just become
   the Worker's. The step order for any future hostname: remove it from
   Pages first (step 4 before step 2).
4. **The certificate.** Pack `google`, advanced, TXT validation, hosts
   `sheepdogsim.com` and `*.sheepdogsim.com`; `pending_validation` at 00:51,
   `active` by 00:53 with two Google Trust Services certificates valid to
   2027-01-15; the Universal certificate served meanwhile. The domain's
   `cert_id` field is still empty (the dashboard lists the pack by hosts).
5. **Retiring the Pages custom domain left the apex record alone.** "Remove
   domain" on `sds-frontend` warned it would remove "the CNAME record
   pointing to your project"; there was none, and the Worker's `AAAA` record
   was unchanged afterwards. The project lists no custom domain; both
   `pages.dev` hostnames still answer.
6. **Not measured:** whether `cf` uploads source maps (the log does not say).

Release 3.3.2, the same night (steps 3 and 5; `docs/history/status-log.md`):

7. **Deleting the route moved nothing.** Route removed in the dashboard
   01:11:04 with 3.3.1 deployed; the live verifiers passed on the apex and
   on `workers.dev` straight after, six of six requests the Worker's own
   `release.json`. With the Pages custom domain already gone, the Custom
   Domain and the route had pointed at the same Worker.
8. **A deploy without `triggers` leaves no route and re-publishes the
   domain.** `v3.3.2` (`14bdc70a`): `cf deploy` listed `workers.dev` and
   `sheepdogsim.com (custom domain)` and nothing else; the zone's route
   list stayed empty; version `55b517c1` live 01:14:44; the verifiers
   passed. The token's Workers Routes permission was not needed for it.

## Rollback summary

| After step | To undo |
| --- | --- |
| 1 | revert the commit; nothing deployed |
| 2 | remove the Custom Domain (its record and certificate go with it), recreate the apex CNAME to Pages (proxied), revert the config; the route served throughout |
| 3 | re-add the route (dashboard, or a deploy with `triggers` declared) |
| 4 | re-add the Pages custom domain, which needs the Worker Custom Domain removed first and re-validates; v2 stays at its pages.dev URL regardless |
| 5 | a Worker version rollback is the only hosting rollback left, and it is the same as before: `wrangler rollback <version> --name sds-worker` (reached 2026-10-17, release 3.3.2) |

## The owner's steps

Dashboard, each after the previous one is verified: the rehearsal's `stage`
record and its cleanup; deleting the route (step 3); removing the Pages custom
domain (step 4); any certificate cleanup. The deploys are CI's, on tags the
owner pushes. Every API read is a GET by the Sonnet agent in Chrome, as the
settings diffs have been.

## The patch, described and not applied

Applying `domains` to production is the cutover, so the lines live here until
the owner's step 1.

`app/cloudflare.config.ts`, production branch, beside `triggers`:

```ts
// Release 2 declarative hosting: the apex is a Custom Domain of this Worker.
// The deploy creates the DNS record and the certificate (docs/operations/
// declarative-hosting.md). www stays a placeholder record and a redirect rule.
domains: ['sheepdogsim.com'],
```

`scripts/verify-deploy-config.mjs`: `PRODUCTION` gains `domains:
['sheepdogsim.com']`, `PREVIEW` gains `domains: []`, and the Build Output check
replaces `expect('domains', worker.domains, undefined)` with
`expect('domains', worker.domains ?? [], expected.domains)`; a preview build
that declares a domain fails, as a preview route does. The rehearsal used the
same lines with `PREVIEW.domains = ['stage.sheepdogsim.com']` on its branch
(pull request 128, closed unmerged), and they passed the gate and both specs.

`tests/worker/cloudflare-config.spec.ts`, in "routes sheepdogsim.com to
production only": `expect(cf('production').domains).toEqual(['sheepdogsim.com'])`
and `expect(cf('preview').domains).toBeUndefined()`, replacing the current
`toBeUndefined()` on production. `tests/worker/verify-deploy-config.spec.ts`:
`cfWorker()` gains the domain in production and one case breaks it.
