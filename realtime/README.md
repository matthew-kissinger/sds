# Local realtime foundations

This is an undeployed lobby/admission slice of multiplayer Stage 1. It does
not expose multiplayer in the game. No production configuration imports it.
The private identity entrypoint is tested in another local Worker; it is not
exported by the production score router. No new runtime asset is required.

Run `npm run test:realtime` and `npm run typecheck:realtime`. The normal
`npm test` and `npm run typecheck` commands include these checks, so existing
CI picks them up without changing deployment workflows. Tests use real local
workerd, SQLite-backed Durable Objects, D1, service bindings and WebSockets.
`remoteBindings: false` prevents remote bindings. Tests close sockets and reset
storage between cases. The existing solo fixture suite runs in both Node and
workerd, using the same exported simulation and committed fixtures.

## Current boundary

Implemented: authenticated admission, four atomic seats, single-use upgrade
tickets, idempotent regional room allocation, private/public boards, readiness,
host handoff, waiting-room removal, session replacement, 15-second reconnect
reservation, durable party settings, start timeout and interruption on restart.

The state machine is `waiting -> starting -> waiting/closed`. Start locks the
roster and issues a round ID. All `loaded` acknowledgements currently return
`simulation_unavailable` and clear readiness. This is an explicit incomplete
boundary: there is no `playing` state, simulation host, movement protocol,
snapshot interpolation, active-match forfeit/scoring, rematch result, client
screen, rendered invite shell or staging deployment. Complete those in the
plan's sequence before calling this playable multiplayer or closing Stage 1.

## Local API

All responses are uncached. Mutations and upgrades require the exact configured
Origin. POST admission uses the existing identity JWT as a Bearer token; the
private identity service verifies it and resolves the player in its own D1.
The realtime service never receives the signing secret. Room handles contain
the region and 128 random bits. Persistent identities, sessions and tickets
are omitted from board and room snapshots.

| Request | Behaviour |
| --- | --- |
| `GET /r/health` | Protocol 1, `gameplay: false` |
| `GET /r/lobbies/{na,eu,apac}?after=<handle>` | At most 25 public waiting rooms, opaque continuation handle |
| `POST /r/rooms` | JSON `{region, settings: {mode, flockSize, visibility}}`; 32-hex `Idempotency-Key`; returns handle, slot, ticket and ticket expiry |
| `GET /r/<handle>` | Availability only; does not reserve a seat |
| `POST /r/<handle>/join` | Authenticated admission/reconnect; returns a fresh ticket |
| `GET /r/<handle>/ws?v=1&ticket=<ticket>` | Single-use WebSocket upgrade |

An invite's possession is not identity proof. Admission requires an explicit
authenticated POST. Treat tickets as secrets: never log the upgrade query.
`IDENTITY` is a private service binding, never a public URL supplied by clients.
`ROOMS` and `LOBBIES` must be independent SQLite namespaces in each environment.
`ROOM_CAPS` configures each region separately, including zero to disable new
allocations. Missing/invalid caps fail closed. A proposed one-room pilot uses
`{na: 1, eu: 0, apac: 0}`; this is not a claim of geographic placement.

## Lobby wire protocol 1

Client messages are MessagePack arrays `[1, command, sequence, ...arguments]`.
Sequences are non-negative safe integers, increasing within one connection.
Duplicates/older sequences are ignored. Supported commands:

| Command | Arguments |
| --- | --- |
| `ready` | Boolean |
| `settings` | `coop` or `competitive`, 25/75/200, `public` or `private` |
| `start`, `leave`, `ping` | None |
| `loaded` | Round ID, 32 hex characters |
| `remove` | Slot 0 through 3 |
| `ack` | Highest received room revision |

Server frames are MessagePack objects: `room` snapshots, `pong` with sequence,
or `error` with a code, each carrying protocol 1. Lobby revisions are not sim
ticks. An acknowledgement cannot exceed the last revision sent to that socket.
The later input/snapshot protocol needs a versioned extension and its own
limits; this control protocol deliberately rejects movement and positions.

## Bounds and failure behaviour

- Four seats; 10-second pending admission and single-use ticket lifetime;
  15-second disconnect grace; 10-second start barrier; six-hour room lifetime;
  empty-room idle cleanup after two minutes. A ticket retry cannot extend grace.
- Settings changes clear readiness. Two connected, ready players minimum;
  every present seat must be connected and ready. Host removal only in waiting,
  with up to 64 excluded identities retained until room closure.
- One live session per identity per room. An old socket's close cannot remove
  its replacement. The oldest connected member receives host authority.
- Per-region capacity is 0 to 50, at most two allocation leases per creator
  per region. Public listings expire after 60 seconds and refresh every 30;
  revisions prevent delayed publications from undoing privacy changes.
- JSON create bodies are at most 2 KiB; binary commands at most 1 KiB; decoder
  structure and command shapes are bounded. Control traffic allows a burst of
  20, replenishing at 10 messages/second including ACKs. A client more than
  eight revisions behind is closed. These are lobby limits, not Q8 gameplay
  acceptance budgets.
- HTTP uses a bounded per-isolate token bucket (60 burst, one/second per IP,
  4,096 tracked IPs). This is neither global abuse protection nor a billing cap.
  Hosted staging needs restricted access and a scheduled test stop before use.
- Closed rooms retain a tombstone until their allocation lease expires.
  Failed directory withdrawal retries after five seconds, not a tight alarm
  loop. Public stale listings expire independently. Final cleanup removes data
  and alarm. Live simulations will remain in memory; no per-tick storage writes.

The runtime tests include actual object eviction and hibernating WebSocket
resumption. Deadline tests also advance stored deadlines or pass a deterministic
clock to the lifecycle functions; these do not certify real network latency.
Local functional tests cannot establish geographic placement, phone support,
hub performance, fairness, or production deployment compatibility.

The proposed hosted setup and spending review are in
[the staging proposal](../docs/operations/multiplayer-staging.md).

## Local validation, 2026-10-20

Code candidate `382369ab0f3188636ebe87aacb36be21860c30a5`:

- `npm test`: 905 existing checks in Node plus 51 checks in workerd. The latter
  includes 41 new lobby/protocol/lifecycle checks and the 10 existing trace
  fixture checks repeated in the Worker runtime. No fixture changed.
- Application, realtime and retained Worker typechecks passed. Lint passed
  with six existing generated-declaration warnings, no errors.
- Clean `npm ci`: zero reported vulnerabilities. Production build, public
  discovery, exact-SHA release manifest and Build Output configuration checks
  passed in the attached isolated checkout. The main checkout's first build
  was stopped at output cleanup because an existing process held the directory
  open; it was not counted as a pass. That process was left running. The
  verified generated output was copied back for the existing local preview.
- Client bundle: 2,444.48 kB raw / 677.80 kB gzip, matching the recorded 3.6.1
  bundle size. The production configuration still exports no Durable Object
  classes. No app, simulation, asset or deployment-workflow source changed.

These are local functional/build receipts. No push, hosted test, provisioning,
geographic or physical-device qualification, or deployment was performed.
