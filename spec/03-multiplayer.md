# 03 - Multiplayer

Updated 2026-10-20 from the owner's multiplayer planning discussion.
**Local foundations authorized; staging provisioning and deployment remain
unapproved.** The shipped version 3 client remains solo. The execution sequence, research,
historical evidence and unresolved decisions are in
[the multiplayer plan](../docs/architecture/multiplayer-plan.md).

The local slice now runs authoritative co-op on the Home Field: one shared
flock and pen, 25/75/200 sheep, two to four starting players, live snapshots,
client dog prediction, reconnect, departures, shared completion and rematch.
`npm run coop` enables the local-only client entry; the production build still
has no online entry. Competitive starts are explicitly unavailable. Full
snapshots and a fixed 100 ms presentation buffer are reversible pilot choices;
delta transport, adaptive delay and numerical acceptance budgets remain open.
[The local contract](../realtime/README.md) records implementation limits.
The $20 staging budget is approved; [final setup review](../docs/operations/multiplayer-staging.md)
remains required before any provisioning.
The remainder of this specification is the target contract, not a claim that
all described behaviour is implemented.

## Existing solo contract

- `app/src/scores/` owns the identity/score client, store and controller.
  Registration runs behind the title; Play never waits for a backend.
- The service mints `persistentId`, `authSecret`, JWT and friendly display name.
  The device retains its identity proof and profile. Existing identity refresh
  behaviour stays isolated from new room errors.
- Solo completion submits `soloClassic` seconds to `field-v3`, for exactly
  25, 75 or 200 sheep. Personal bests remain local and available offline.
- Existing times, weekly boards, My times and score cards retain their contracts
  in spec/12 and spec/14. Multiplayer cannot write into those solo results.
- No v2 room data or `shared/` simulation is imported into the v3 client.

The earlier master plan also records a future score-service simplification:
best completion time by `(persistent_id, flockSize)` with monotonic upsert and
display name. That is a separate migration project, not a multiplayer
prerequisite. It must preserve identity, historical submissions and the shipped
My times/weekly/card consumers before cutover. The previous proposal to put
solo and co-op times into that same ranking is superseded by this spec.

## Agreed product scope

- Up to four human players, with a one-person waiting room. Two minimum to
  start, everyone present ready, host chooses Start. No NPC fill.
- Co-op: one shared flock, one shared pen, shared completion.
- Competitive: one shared flock, one pen per player. Not separate racing flocks.
- Private invite rooms and regional public lobby boards. The host can wait or
  start an eligible ready group; reaching four never starts automatically.
- Region selection, suggested connection quality, optional cross-region
  browsing/joining, and parties retained between rounds.
- 25/75/200 sheep remain configuration, not separate modes or queues.
- Existing animal/fence assets are the starting point. Tell the owner before
  authoring new assets. Mockups do not close production-build visual gates.

Excluded: skill matchmaking, ranked seasons, chat/voice, spectators, mid-round
backfill, NPCs, new biomes, 5,000 sheep, and grow-your-flock gameplay. A person
arriving during a match can see that it is in progress and retry after it ends;
this does not create a fifth seat or a hidden spectator connection.

## Service ownership

| Owner | Responsibility |
| --- | --- |
| Existing game Worker | Static client, identity, solo score API and cards |
| Separate realtime Worker, proposed source `realtime/` | `/r/*` routing, admission, room/public-board API, WebSocket upgrade |
| One SQLite-backed RoomDO per room | Membership, settings, authoritative sim, input acceptance, snapshots and round results |
| One SQLite-backed LobbyDO per enabled region | Public waiting-room directory, bounded creation leases and stale-entry cleanup |
| Optional new multiplayer D1 | Only durable multiplayer result queries if approved; migrations begin at 0001 |

Room state belongs in Durable Object storage; D1 is not required to list or
play rooms. No per-tick database query, cross-region lobby call or identity
verification belongs in the simulation loop. The lobby is a directory, not
the authority on whether a room has a free seat.

Separate deployment is the chosen architecture: site/score changes should not
restart rooms. This replaces the old spec's infrequent-release assumption.
The realtime Worker still hosts Durable Objects; it is not a peer-hosted game.
Cloudflare code deploys can disconnect sockets, so independent deployment does
not remove realtime recovery obligations. Sources R1/R2 are in the plan.

Use the WebSocket Hibernation API as the planned transport lifecycle. Persist
membership and serializable connection attachments so waiting rooms can sleep.
Active matches run a fixed-step timer and cannot hibernate. No periodic lobby
timer just to keep an object resident; use bounded refresh and cleanup alarms.
This supersedes the previous blanket rejection of hibernation. Verify the
chosen runtime/tool versions in staging before treating this as proven.

## Regional boards and placement

Initial boards are North America, Europe and Asia-Pacific. Their final
labels and placement hints are pending measured coverage, not promised data
centres. A single regional board contains both modes and all flock sizes with
filters; do not create nine small queues. An empty board can show counts of
waiting rooms elsewhere, clearly marked as directory data.

The regional LobbyDO holds only public room summaries: room handle, display
names, rules, flock size, occupancy, joinability, protocol version, update time
and revision. Private rooms never appear in boards or regional activity counts.
Use bounded pages, expiry leases, lazy expiry on reads and alarm cleanup.
Ignore stale/out-of-order revisions. Room transitions publish idempotent
updates; missed updates heal on bounded refresh/reconciliation. Joining always
rechecks the RoomDO atomically, including simultaneous fourth/fifth joins and
start/join races. An unavailable directory must not break an established match.

Creation validates a region allow-list and generates an opaque, unguessable room
handle containing the validated routing region. Apply the intended location
hint on the FIRST RoomDO lookup, including retries and probes; do not let a
global allocator or CI pre-create rooms in its own geography. Regional lobby
creation receives its own hint. Cloudflare hints are best effort, honoured on
initial placement, and do not move an existing room (R3).

Recommend regions from a few bounded RTT samples to region-placed application
endpoints, not the nearest CDN edge or IP location alone. Label this an estimate;
once joined, measure RTT/jitter to the actual room. A directory probe does not
prove every room in its region has identical latency. Manual selection always
works if probing fails. Region stays fixed through host handoff and rematches;
changing it requires a new room. Cross-region invitations work with a clear
connection warning, not a geography lock. Probe rates and quality thresholds
are measured choices (D3/D4), not hard-coded assumptions here.

## Admission and trust boundary

- Identity stays in the existing Worker. A private service-binding entrypoint
  verifies its JWT during create/join/rejoin. It accepts no browser-supplied
  identity header as proof and exposes no public bypass. No copy of the
  production identity signing secret goes to the realtime Worker (R5).
- Room service unavailable, wrong deployment/protocol, expired admission or
  room-full errors must not invoke the solo controller's fresh-identity path.
  Only a verified identity-auth failure can initiate the existing refresh flow.
- A room atomically reserves a seat and issues a short-lived, single-use opaque
  WebSocket ticket bound to room, identity, session and protocol. Unbound
  reservations expire. Ticket consumption and session replacement are atomic.
- Invite handles locate a party; they are not identity credentials. The invite
  URL contains no JWT, device secret or admission ticket. A link GET renders a
  join screen; an explicit Join action reserves a seat, so link crawlers do not.
- WebSocket upgrades use the ticket, validate Origin, and redact ticket-bearing
  URLs from logs. Same-origin checks supplement authentication. Reconnect
  replaces the previous socket for that seat.
- Apply bounded parsing, finite/ranged inputs and safe-integer sequences,
  room/identity/IP rate limits, ticket expiry, replay rejection and bounded
  response sizes. A region-local creation cap is not an account-global cap;
  explicitly bound total exposure across the finite region set.

## URL and routing contract

The planned player URL is `/r/<room-handle>`. Room API and upgrade paths also
live below `/r/*`, with distinct reserved path segments. No `?room=`, no new
player-page query parameters and no v2 hash compatibility alias. `seed` and
`debug` remain the only player-page query parameters; `seed` cannot override an
online room. `/play/25`, `/play/75`, `/play/200` and `/c/*` retain their purpose.

The realtime `/r/*` route takes precedence over the game's apex Custom Domain
(R4). Therefore it must explicitly serve the invite shell through a narrow
service binding to the game asset owner, without recursive public fetches, as
well as routing room APIs/upgrades. Root-relative assets still reach the game
Worker. Do not assume SPA fallback will run after the realtime route wins.
Pin that binding contract and test direct invite loads, reloads, invalid links,
mobile browsers and the stage/production split before publishing the route.

## Lobby and round lifecycle

State progression: waiting -> starting -> playing -> finished -> waiting;
interrupted is an explicit outcome, never successful completion. Closing the
last session starts bounded cleanup, not an indefinitely running empty match.

The host controls visibility, mode and count only while waiting. Settings
changes clear readiness. Start validates connected/ready membership and locks
the round roster, player/pen slots, settings and rules version atomically.
Clients acknowledge asset readiness before a bounded synchronized start;
failure returns the party to waiting instead of giving a loaded player a lead.

Host authority is tied to verified persistent identity. Before start, a
disconnected host yields to the oldest connected member with stable slot-order
tie-breaking. During play, server simulation continues independently of host
presence. A 15-second grace reserves a disconnected player's seat.
Neutralize stale input much sooner; grace is not
permission to keep moving or barking. A returning player reclaims the seat,
not automatic control from a newly appointed host.

**Owner decision, 2026-10-20: competitive forfeits and continues.** A transport
disconnect reserves the seat until grace expires; explicit Leave forfeits
immediately. With two or more eligible competitors left, the match continues.
With exactly one, finish with a win by forfeit; with none, close without a
winner. A forfeited player is ineligible to win regardless of their count.

Remove the departed dog from play. Keep their pen/opening physically unchanged
and keep previously collected sheep and counts assigned there. Subsequent
entries retire normally as unclaimed sheep, with no player score increment.
Do not redistribute sheep, close gates, reassign pens or introduce an NPC.
All retired/penned sheep count toward clearing the field, including unclaimed
sheep and those banked by a forfeited player. Track that total separately from
eligible scores. Results distinguish normal completion, forfeit victory and
no-winner closure, and identify forfeits/unclaimed counts.

A forfeit is final for the round: late reconnection cannot restore eligibility
or backfill the seat. Rejoining the party is possible once it returns to
waiting. Serialize departure and completion in the room; a departure after a
completed result does not alter it. This replaces the earlier cancellation
proposal. Co-op continues with remaining players, including one; remove departed
dogs after grace, retain collected sheep and admit no replacements until the
next round. Close when nobody remains after grace.

The host may remove a player only while waiting. Exclude that verified identity
from rejoining the same room for its remaining lifetime, with bounded metadata
and expiry. Host removal never operates during starting/playing and cannot
force an active opponent to forfeit. This is a room safeguard, not a global ban
or protection against someone obtaining a new identity.

Finished parties retain their room and host-selected settings, clear readiness
and use a fresh server seed/round id. No automatic public-room mode rotation.

## Simulation and results

The room is the sole authority for sheep, dogs, gates, score and completion.
Clients send intent, never a trusted position, timestamp, score or win claim.
Use the current deterministic `sim/` rules. Generalize player construction,
pen geometry and presentation deliberately; multi-dog loops alone are not a
finished multiplayer implementation. Preserve solo traces and `field-v3` times.

Co-op keeps the existing single-pen completion rule and equal response to every
dog. Competitive records one terminal destination on valid entry, with one
lifecycle (`active | retiring | penned`) and calm settling. Entry awards one
point to the pen's eligible player, or becomes unclaimed if they have forfeited;
existing allocations never transfer. **Owner decision, 2026-10-20 (D2): finish
the flock, highest eligible count wins, shared ties.** Apply this to all
two/three/four-player rounds. No early majority victory, sudden death,
mandatory countdown or winner by player ID. The forfeit outcomes above are
separate from ordinary completion. Q12 selects neutral gate guidance: the same
gentle help toward the nearest qualifying opening only while a dog pushes from
behind the sheep, independent of dog or pen ownership. Forfeited pens retain
identical physics and collect later entries as unclaimed. Avoid overlapping
guidance zones; select at most one opening per sheep per tick, with deterministic
geometry-based handling of equidistant cases reviewed for positional bias.
Geometry and three-player fairness require owner-reviewed layout evidence
before gameplay implementation.

Layout review decision, 2026-10-20: square with opposite pens for two players,
equal-area regular hexagon with alternating pen sides for three, and square
with one pen per side for four. Dogs start 45 m from the centre opposite their
own pen. See the [reviewed diagrams](../docs/architecture/multiplayer-layouts.md).
This accepts the prototype direction, not implementation or passed fairness,
camera, collision and device gates.

Rules are selected at session construction and owned by small domain modules.
Do not scatter mode flags through rendering, networking and movement. A match
records its immutable rules/layout version and starting party size. Initial
scope is a shared post-round result, not a new ranked ladder. Any future
multiplayer leaderboard needs an approved separate schema and eligibility
rules; it cannot combine solo/co-op or differing party sizes into one ranking.

## Timing, protocol and client presentation

Keep 60 Hz fixed simulation steps. Candidate transport rates are 30 input
messages/s and 20 snapshots/s, measured independently of rendering. The server
uses a bounded accumulator; overload is observable, not silently scored as a
normal slower round. Client time cannot advance the room clock. Include tick,
round id, protocol version, acknowledged input sequence and snapshot basis.

One versioned MessagePack protocol, with clean mismatch refusal. Full snapshots
on bind/start/resync and periodically; deltas reference a precise broadcast
basis. Use a full frame when a delta would be larger. Encode shared data once
per interval; never let a unicast keyframe advance the shared delta basis.
After a missing basis, discard deltas until a valid full snapshot arrives and
rate-limit resync requests. Reconstructed snapshots remain stable for readers.
Measure current data rather than inheriting the v2 size/rate thresholds.

Movement holds the newest valid intent for bounded time. Bark is an edge event
with a deduplicated sequence, not a boolean a newest-wins queue can erase or
replay. Snapshot/event state must preserve simultaneous barks from several dogs;
the current single latest-bark record is insufficient. Snapshot acknowledgments
and bounded send queues must identify slow consumers. Verify runtime support
before relying on `bufferedAmount`; absence is not proof of zero backlog.

Predict the local dog's movement using shared deterministic movement rules,
then reconcile authoritative state and replay unacknowledged intent. Interpolate
remote dogs and sheep from a bounded adaptive snapshot buffer (R9). Do not
predict the entire flock from a secret server seed or compare a deliberately
delayed render position with the current server tick as a desync test. Bound
extrapolation and visibly reconnect rather than letting stale simulation run.
React receives discrete lobby/results/status events, not per-frame snapshots.

## Recovery and deployment

Persisted membership is not persisted simulation. The v2 constructor explicitly
lost an active match on restart. Accepted initial policy D5 is to preserve the
party, report interruption and return to waiting with no result. The owner
accepted this limit in Q7; qualification must prove it. Do not promise seamless
mid-match recovery from the existing code.

If resumable matches are required instead, gate them on a versioned checkpoint
of all authoritative state, RNG cursor, tick, accepted input/event sequences,
pen ownership, results and deadlines, plus a measured loss/replay policy.
Atomic storage and idempotent result writes must survive retries. A seed alone
cannot restore the current RNG closure. Never resume a partial checkpoint as a
ranked match. Recovery acceptance is in spec/09 and plan D5.

Before a realtime rollout, stop new starts and drain rooms within a bounded
window; report any forced interruption. A separate web deploy must preserve
established sockets and admission compatibility. Incompatible protocol releases
require a coordinated client/server transition and explicit reload UX, not an
unbounded legacy protocol cohort. An exact release manifest identifies both
Worker revisions, protocol, rules and storage schema. Rehearse rollback;
rolling back code does not roll back stored data. No workflow edits or deploys
are authorized by this document.

## Acceptance

The staged proof matrix is in [spec/09](09-testing.md#multiplayer-acceptance-planned)
and the [plan](../docs/architecture/multiplayer-plan.md#staging-and-test-plan).
It covers regional boards, invitations, race-safe four-seat admission, actual
herding, both rulesets, reconnect/host handoff, restart outcomes, slow clients,
geographic latency and data isolation. Running production-build desktop/mobile
motion and audio evidence is required. A lobby-only test, synthetic load result,
or asset-lab still cannot close the multiplayer gate.
