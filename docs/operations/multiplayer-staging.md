# Multiplayer staging proposal and cost review

2026-10-20. Setup pending review. The owner authorized playable local co-op
and approved a $20 incremental staging pilot budget. Final setup must still
be presented and approved before provisioning; the budget is not deployment
or resource-creation authorization. The owner confirmed an existing Workers Paid subscription. A read-only CLI account check
returned Cloudflare error 9109, Invalid access token; account ID, remaining
shared allowances and deploy permissions are not independently verified.
The owner offered to authenticate or validate access when needed. No resource,
route, secret, deployment, paid run or new asset was created for this work.

## Proposed isolated setup

| Component | Proposed name and role |
| --- | --- |
| Staging game/identity Worker | `sds-game-staging`: staging static client, isolated identity API and private admission entrypoint |
| Realtime Worker | `sds-realtime-staging`: `/r/*`, room routing and WebSockets |
| Room namespace | Staging-only SQLite-backed `RoomDO`, never bound to retained v2 rooms |
| Board namespace | Staging-only SQLite-backed `LobbyDO`, regional `na`, `eu`, `apac` directories |
| Identity database | `sds-identity-staging`, synthetic test identities, no copy of production player data |
| Identity secret | New staging-only secret, owned only by the staging identity Worker |
| Browser origin | Proposed `https://staging.sheepdogsim.com`; hostname availability and routing still to verify |

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

Restrict staging to the owner/test team with Cloudflare Access if the account
already supports it. Before choosing that setup, verify browser WebSocket and
protocol-client authentication together; do not assume a browser session grants
the Node runners access. Evaluate any extra Access subscription separately.
Disable bypassing `workers.dev` endpoints. Restrict creation to test identities
if Access is unsuitable; the local rate limiter alone is insufficient to expose
an unpaid-budget public experiment. Do not add a paid load platform initially.

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

Before a run, record account allowance usage, admit only the agreed identities,
set one total room, and give the runner a hard one-hour stop. At stop, disable
new allocation, close the test room and verify cleanup. Alerts alone cannot stop
spend; creation caps also do not cap malicious request volume or all billable
resources. The hosted access control and stop procedure must be working first.
Afterward compare metered usage with this forecast before requesting expansion.

## Review needed before setup

The $20 reserve is accepted. Before provisioning, verify or refresh read-only
Cloudflare access if necessary, resolve the actual account, check existing
allowance usage and hostname availability, and present one concrete resource
diff for the isolated staging pair. The final review must name the exact
account, hostname, Access application/policy (including protocol-client access),
new D1 and DO bindings, staging-only secret ownership, paired commit SHAs,
room cap, one-hour stop/cleanup mechanism and rollback pair. Resource IDs that
Cloudflare assigns on creation will be marked new, not invented. The invalid
CLI token is not evidence that the owner's account lacks permissions. No auth action is
required to continue local development.
