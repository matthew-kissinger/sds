# Multiplayer staging proposal and cost review

## Live pilot receipt, October 20

Deployed and PC/hub smoke-tested. Source:
`cf15f61a0852051b2ae378b7cf17930344a82570` on `codex/multiplayer-foundations`.
The staging-only direct deployment is authorized in the conversation; no push,
merge, production tag or production deployment was performed.

| Resource | Live identifier |
| --- | --- |
| Game Worker version | `b440b8da-ed04-403e-af52-d7959461dcff` |
| Realtime Worker version | `d8def202-dcac-46cc-9e68-3796fbff7ebc` |
| Staging D1 | `0770de39-a50d-4340-8907-b61f8a4b297a` |
| Open window | 2026-10-21 01:42:55.815 to 02:42:55.815 UTC, October 20 9:42–10:42 p.m. EDT |
| Client bundle digest | `ae4365dcf7a19d6d4d27044f004755bc233a44a298415d4e59223569fc14f60a` |

Play at `https://staging.sheepdogsim.com`. The temporary passcode and instructions
are in ignored `.wrangler/staging/playtest.txt`, never committed. Choose North
America, create a room, open its invite on the other machine, both select Ready,
and the host selects Start co-op. Maximum one room/four players. The cutoff is
server enforced and opening a link does not renew it. No authentication action
was needed: the existing Wrangler OAuth authorized creation, secrets and deploys.

PC and hub independently rendered the hosted build, joined through a direct
invite, readied/started, moved, barked, received identical same-tick snapshots,
reloaded/reclaimed a seat and continued after one left. Zero uncaught browser
errors. PC backend was WebGPU; no timing/device certification is claimed. Receipt:
`captures/multiplayer/staging-coop/webgpu-desktop-2/receipt.json` (ignored), with
151 PC and 62 hub snapshots observed. Both test contexts and the owned hub Chrome
and SSH tunnel were closed. Final authenticated board read returned zero rooms;
unauthenticated root and realtime requests return 401. The initial closed
deployment returned 410; the local active-room cutoff test passed.

The real-browser check caught `Referrer-Policy: no-referrer` making the login
form's Origin null; changed to `same-origin` and repeated the hosted flow. Hub
headless Vulkan hit graphics recovery; the successful run used its normal
display session. Aborted smoke rooms respected the two-minute empty-lobby grace;
the probe can reuse an empty public room through normal UI. These failures were
not counted as passes.

The inherited migration set contained a committed historical player snapshot.
It briefly populated the new staging database during preparation, before any
Worker deployment. Those 207 player/discriminator rows and 15 derived scores
were removed, and zero players/scores/archived scores verified before exposure.
The config generator now excludes that seed migration. No production database
was queried or modified. Production `/release.json` still reports solo 3.6.1 at
`32e720a771d23f8c930cd0bd5e95707054b39b4b`.

The approved $20 envelope covers the existing bounded one-room estimate. No paid
add-on, load service or subscription upgrade was bought. Actual account billing
remains unverified; the estimate is not an invoice. Do not automatically reopen
the window or expand load. To disable early, regenerate closed configs (without
`--open`) and redeploy the pair; the existing deadline also bounds live rooms.
No multiplayer release gate is closed by this pilot smoke.

## Simplified pilot approved, October 20

The owner explicitly authorized provisioning and deployment after the review
below, with a $20 budget and a first real PC/hub playtest. This amendment
supersedes earlier approval gates and the Access proposal, retained below as
review history. Production is unchanged. No paid load platform, subscription
upgrade, geographic load or full release qualification precedes this playtest.

Deploy the same two isolated Workers and D1 described below. `staging/` contains
their wrappers. A random 128-bit staging passcode entered into a same-origin
form issues a Secure/HttpOnly/SameSite cookie tied to the pilot deadline. The
passcode is a staging-only secret in both Workers, separate from identity JWTs.
No passcode/cookie goes in invite URLs, source, logs or the client bundle. This
replaces Zero Trust setup for the private pilot. Both workers.dev and version
preview URLs are disabled; the gate also refuses other hostnames.

The game owns the Custom Domain and assets, checking access on every path.
Realtime owns only `staging.sheepdogsim.com/r/*`, checks the same cookie and
delegates invite navigation through `InviteShell`. Identity remains a private
`RoomAdmission` binding. D1 starts empty except for schema and test identities;
no production data/secret is copied.

`node tools/staging-config.mjs <new-staging-d1-uuid>` generates closed configs
under ignored `.wrangler/staging/`, refusing known production and preview IDs.
`--open` explicitly creates a one-hour UTC window; use only when ready to play.
Both configs use the same deadline and `{na:1,eu:0,apac:0}`. Room/directory
leases clamp to that deadline. The active tick checks expiry and stops the
simulation even if the runner disappears. Requests after cutoff fail closed.
There is no automatic renewal; reload/rematch cannot extend the window.

Use `node tools/staging-wrangler.mjs ...` for these two configs: it removes the
invalid token override only in its child process and uses working Wrangler
OAuth. This staging-only deployment path does not change production's cf
workflow. Build with `vite build --config vite.coop.config.ts --mode coop-staging`.
Apply existing identity migrations only to the new staging UUID. Deploy closed,
set fresh staging secrets, then deploy both with the open deadline. Keep secrets
ignored and never print them. Record candidate SHA, version IDs, D1 ID and cutoff.

Initial checks: access gate/cutoff, direct invite, two independent rendered
players on PC/hub, ready/start and movement. Add checks when failures or playtest
justify them. The 64-check workerd suite and both bundle dry runs passed before
provisioning. No broad performance/device gate is claimed. Use the one-room
estimate below, with $20 reserved and no additional fixed subscription.

### Original review (superseded where amended above)

2026-10-20. Setup pending review. The owner authorized playable local co-op
and approved a $20 incremental staging pilot budget. Final setup must still
be presented and approved before provisioning; the budget is not deployment
or resource-creation authorization. The owner confirmed an existing Workers Paid
subscription. The read-only review below verifies the account and working
Wrangler authentication; remaining shared allowances are not verified.
The owner offered to authenticate or validate access when needed. No resource,
route, secret, deployment, paid run or new asset was created for this work.

## Read-only access review, October 20

Account: `56adffd40534f7fe110fc661a40bbf53`. Zone: `sheepdogsim.com`,
`08f6aca2579390fc14be2cfa39bd99ce`. These identifiers were read from Cloudflare,
not inferred from the repository. API reads finished around 21:16 EDT.

| Check | Observed result |
| --- | --- |
| Default Wrangler and cf authentication | `CLOUDFLARE_API_TOKEN` is invalid and overrides saved authentication |
| Saved Wrangler OAuth, with that variable omitted only in a child process | Login works; advertised scopes include Workers, scripts, routes and D1 write. Read-only D1 and route requests succeeded. No writes were attempted to prove permissions |
| Operations credential | Active; account, Workers, domains, DO namespaces and Access application listing succeed |
| Existing SDS resources | Only `sds-worker`, `sds-worker-preview`, `sds-db` and `sds-db-preview`; no SDS DO namespaces |
| Proposed hostname | No exact DNS record for `staging.sheepdogsim.com`, no matching Worker Custom Domain, and no zone Worker routes. DNS read succeeded with the existing DNS credential |
| Access | Application listing is empty. Organization/settings read is denied; enrollment, plan and creation rights remain unverified |
| Billing | Subscription reads denied; Workers Paid remains owner-confirmed and allowance balance remains unknown |
| Hub | SSH alias `hub` works; Node 22.23.3 and Chrome 150.0.7871.128 are installed. This is reachability/prerequisite evidence, not renderer or timing qualification |

No new login is needed for the verified Workers/D1 reads. Do not replace or
delete workstation credentials globally: use process-scoped authentication.
The `cf` deployment CLI has separate saved authentication and reports an expired
saved session as well as the invalid environment override. If the hosted build
uses `cf`, refresh its login or supply a deliberately scoped valid credential
before deployment; Wrangler login alone does not refresh `cf`.

Before provisioning, the owner should confirm the account's current Workers/DO
allowance usage and whether Zero Trust Free is enrolled/available. An authorized
dashboard session or appropriate read access can supply those facts; do not send
tokens in chat. A fresh generic Wrangler login is not the missing step.

## Proposed isolated setup

| Component | Proposed name and role |
| --- | --- |
| Staging game/identity Worker | `sds-game-staging`: staging static client, isolated identity API and private admission entrypoint |
| Realtime Worker | `sds-realtime-staging`: `/r/*`, room routing and WebSockets |
| Room namespace | Staging-only SQLite-backed `RoomDO`, never bound to retained v2 rooms |
| Board namespace | Staging-only SQLite-backed `LobbyDO`, regional `na`, `eu`, `apac` directories |
| Identity database | `sds-identity-staging`, synthetic test identities, no copy of production player data |
| Identity secret | New staging-only secret, owned only by the staging identity Worker |
| Browser origin | `https://staging.sheepdogsim.com`; no current exact DNS/Worker-domain conflict found, recheck before creation |

Use one exact staging origin. Its `/r/*` route reaches the staging realtime
Worker; exact GET `/r/<handle>` requests must delegate the invite shell to the
staging game asset service through a binding. `/r/<handle>/status`, `/join` and
`/ws` remain realtime endpoints. Other paths reach the staging game Worker.
The local Vite proxy already separates shell and API, but that proxy is not a
Cloudflare route implementation and must not be mistaken for one. Bind realtime
to the named private admission entrypoint on the game Worker; do not expose that
entrypoint through its ordinary public fetch router. Export/configure that
entrypoint only in the staging implementation cycle. The current local tests
use a separate local identity Worker to exercise the same admission module.

Propose one self-hosted Access application, `sds-staging`, covering the entire
staging hostname. `sds-staging-owner` allows only the account owner's confirmed
email via an available identity provider or email OTP. Both browsers may use
that Access identity while keeping separate game identities in independent
profiles. `sds-staging-probes` is a Service Auth policy allowing only a new
short-lived `sds-staging-probes` service token. Node clients send its ID/secret
headers on HTTP requests and WebSocket upgrades; never embed it in the client
bundle or repository. No Bypass policy. Browser WebSockets use the authenticated
same-origin session. Verify both upgrade paths before gameplay tests.

Use Zero Trust Free only after confirming enrollment and available seats;
Cloudflare advertises Free for up to 50 users. No paid Access subscription is
part of this proposal. Disable both Workers' `workers.dev` and version-preview
URLs to prevent bypass. If Access is unavailable, return with a concrete
alternative for review rather than silently exposing the experiment. No paid
load platform is needed initially.
[Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/),
[Zero Trust plans](https://www.cloudflare.com/plans/).

Start with `ROOM_CAPS = {na: 1, eu: 0, apac: 0}`. The other board labels still
exist, but cannot allocate rooms. Enable one region at a time for later placement
experiments. Location hints `enam`, `weur`, `apac` are best effort, not residency
or latency guarantees. A PC and hub in one location cannot certify global play.

Store paired client/realtime full commit SHAs, protocol and storage-schema
versions in a staging release record. Serialize staging updates. Do not use
ordinary PR version aliases as independent DO environments. Disable creation,
drain rooms, deploy the reviewed pair, then reopen. Preserve a compatible prior
pair and rehearse rollback. Production deployment and its existing tag workflow
remain separate; extend the main deployment runbook before changing them.

The deployable staging pair does not exist yet. Local gameplay code is
`7bded51f99239033c9dde487baff04c75d92909c`; documentation HEAD at this review is
`7f7b574e`. Neither is a hosted-staging release receipt. Before creation, prepare
and locally test the staging-only build/export wrappers, bindings, invite-shell
delegation, Access-compatible clients and cutoff below, then record the full
candidate SHA and artifact digests. Room protocol and storage schema are both 2.
Cloudflare-assigned D1/DO/Access IDs remain **new** until approved creation.
There is no earlier staging pair to roll back to on the first deployment:
initial rollback means close staging and stop its objects; later releases retain
the previous compatible pair. Production is not a staging rollback target.

Proposed stop mechanism: one absolute UTC pilot deadline, at most 60 minutes
after opening admission, enforced by the staging server. At the deadline,
reject new create/join/start requests, close existing room sockets, clear the
simulation interval and remove public listings. Recheck the deadline on object
wake and every active simulation advance, with an alarm as a second path. The
test runner also stops after one hour, but its survival must not be required for
server shutdown. Afterward verify zero live matches, no ticking room and closed
admission; revoke the probe service token and retain only bounded diagnostics.
This deadline is proposed work, not an existing safeguard. Current room leases
and client shutdown alone do not enforce a global pilot spending window.

## Qualification sequence

1. Validate the local authoritative co-op host and rendered client. The local
   slice now plays the shared Home Field; competitive, delta transport and
   hosted acceptance remain open. Review local evidence before staging.
2. Verify account/resource isolation and access. Present the exact creation
   diff and agreed test duration/cap before provisioning.
3. Provision the isolated pair after approval. Run one-room protocol smoke:
   identity, link read without admission, four seats/fifth rejection, privacy,
   reconnect, host handoff, removal, expiry and interruption.
4. Use this PC and the hub as independent rendered players, then add two
   protocol clients. Record actual co-op completion, transport corrections,
   bandwidth, tick overruns, errors and cleanup for one bounded one-hour session.
   Hub frame/startup measurements require the existing quiet-machine preflight.
   Use independent game identities, an isolated hub browser profile and work
   directory, and the same hosted candidate on both machines. Begin with 25
   sheep, then 75 and 200 within the same time window. Exercise invite and public
   joins, ready/start, completion/rematch, reload/reconnect, leave/continue and
   server interruption. Two rendered plus two protocol clients exercise four
   seats, but do not certify four-renderer presentation or geographic latency.
   Preserve unrelated hub jobs. The existing presentation probe is not yet a
   multiplayer orchestration harness; prepare that runner before a hosted run.
5. Freeze numerical Q8 budgets from the pilot before qualification. Test the
   three region hints from real geographic clients before coverage claims.
   Approve separate one-hour 10/50-room runs only when useful; these are future
   sizing cases, not performance or spending approvals. Physical phone tests
   and reviewed competitive layouts remain their own gates.

## Cost model for the existing Paid account

No new Workers subscription is assumed. The account's included monthly
allocations are shared with its other workloads. Workers includes 10 million
requests and 30 million CPU-ms; excess rates are $0.30/million requests and
$0.02/million CPU-ms. Static asset delivery is free. Binding subrequests do not
add Worker request charges; DO usage is billed separately.
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

DO Paid includes one million request units and 400,000 GB-s. Excess costs
$0.15/million requests and $12.50/million GB-s, rounded up by billable unit.
Incoming WebSocket messages count 20:1; outgoing messages are uncharged.
Duration uses 128 MB per active object. SQLite allowances cover 25 billion
reads, 50 million writes and 5 GB-month; excess rates are $0.001/million reads,
$1/million writes and $0.20/GB-month. Alarm writes and KV operations also count.
[DO pricing, checked October 20](https://developers.cloudflare.com/durable-objects/platform/pricing/).

The following is our conservative workload calculation, not observed usage:
four players per room, one hour, candidate 30 input packets/second plus up to
20 separate snapshot acknowledgements/second per player. That produces 720,000
incoming messages, or 36,000 DO request units. Reserve another 1,000 units per
room-hour for control/directory/reconnect overhead. Assume each room and all
three directory objects stay active for the entire hour, even though waiting
objects should hibernate. This bounds duration at `(rooms + 3) * 0.128 * 3600`.
No per-frame storage or raw packet logging is proposed. Snapshot sizes and
real CPU cost must be measured; these counts cannot prove runtime capacity.

| One-hour experiment | DO request units | Conservative GB-s | DO compute if full allowances remain | Upper incremental DO compute if allowances exhausted |
| --- | ---: | ---: | ---: | ---: |
| 1 room / 4 players | 37,000 | 1,843.2 | $0 | $12.65 |
| 10 rooms / 40 players | 370,000 | 5,990.4 | $0 | $12.65 |
| 50 rooms / 200 players | 1,850,000 | 24,422.4 | $0.15 | $12.80 |

The exhausted column conservatively includes a new rounded billing unit in
each compute dimension. Actual incremental charges may be lower if an already
billed unit has spare capacity. Round monthly aggregate excess, not each room
or each test independently; do not add these columns as separate invoices.

These are compute subtotals. Allow for staging identity/D1, Worker CPU/requests,
storage, limited logs, failed attempts and cleanup. The owner approved a
**$20 incremental budget for the initial one-hour pilot**. It covers this small forecast and rounding with margin; it is not a
guaranteed invoice ceiling. No run may begin before the final setup review.
With available allowances and controlled traffic, incremental usage may
be $0. Billing allowance balance is the main outstanding cost input. Ordinary
existing production usage and the existing subscription are outside this estimate.

For this first pilot, use the one-room row only: $0 DO compute if at least
37,000 request units and 1,843.2 GB-s remain; otherwise reserve up to $12.65 for
incremental DO compute rounding, leaving $7.35 of the approved $20 for the other
meters. This is a conditional estimate, not a measured all-in total. D1 has its
own storage rate ($0.75/GB-month above 5 GB) and row allowances; do not apply the
DO SQLite storage rate to it. Keep logs sampled and never log per tick, packet,
token or player identifier. Recheck rates and billing-cycle usage immediately
before opening the pilot. No subscription upgrade, geographic load service or
10/50-room test is included.
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

Before a run, record account allowance usage, admit only the agreed identities,
set one total room, and give the runner a hard one-hour stop. At stop, disable
new allocation, close the test room and verify cleanup. Alerts alone cannot stop
spend; creation caps also do not cap malicious request volume or all billable
resources. The hosted access control and stop procedure must be working first.
Afterward compare metered usage with this forecast before requesting expansion.

## Review needed before setup

The $20 reserve is accepted. Account, current hostname vacancy, working
Wrangler OAuth and hub prerequisites are now verified. Remaining gates are
billing/Access confirmation, the locally tested hosted configuration and cutoff,
and owner approval of the concrete creation diff. The final creation record must name the exact
account, hostname, Access application/policy (including protocol-client access),
new D1 and DO bindings, staging-only secret ownership, paired commit SHAs,
room cap, one-hour stop/cleanup mechanism and rollback procedure. Resource IDs that
Cloudflare assigns on creation will be marked new, not invented. The invalid
default CLI token is not evidence that the owner's account lacks permissions.
Nothing in this review authorizes provisioning or a hosted run.
