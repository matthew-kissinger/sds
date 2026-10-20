# Local co-op

Undeployed multiplayer work under spec/03. No production hosting configuration
imports this service. No new asset or Cloudflare resource was created.

## Play on this PC

Run `npm run coop` from the repo, then open `http://localhost:5198`. Choose
**Play co-op locally**, create a public or invite-only room, and open its link
in a separate browser profile or another browser. Two tabs in the same profile
share identity; the newer session replaces the older one. Two to four players
must all select Ready, then the host chooses Start co-op. Keyboard, gamepad and
touch use the existing controls. Escape opens a local menu; the match continues.
Leave removes your dog; remaining players continue. The host returns the party
to the lobby after completion, everyone readies again, then starts a new round.

`npm run coop:built` serves the optimized client instead. The launcher binds
only loopback ports 5198 and 8799, starts local workerd with SQLite DOs and the
real identity REST API in a separate Worker, and uses ephemeral D1/storage and
a random local signing secret. Ctrl+C stops both services. Nothing is persisted
to a Cloudflare account. Restarting the launcher resets rooms and local test
identities; the existing browser identity flow can register again afterward.
The normal production build has no co-op entry. This is a separate Vite mode,
not a player URL flag or a change to production deployment.

## Implemented scope

Co-op uses the existing Home Field, one shared pen and 25/75/200 sheep. A
RoomDO owns the actual seeded simulation at 60 Hz. The browser predicts only
its dog, using shared movement code, and presents server sheep/dogs from a
bounded buffer. Input is sent at up to 30 Hz and full snapshots at about 20 Hz.
The local dog's slot is first in that client's presentation arrays, so the
camera, stamina and input follow the correct player. Every dog reuses the same
editable collie rig. DOM player numbers/icons follow the camera each frame.

The lifecycle is `waiting -> starting -> playing -> finished -> waiting`.
All players acknowledge loaded assets before stepping begins. Departures leave
collected sheep intact; a disconnected dog receives neutral input immediately
and disappears after 15 seconds if its seat is not reclaimed. New players join
only while waiting. Last-player departure closes the match. Live simulation
memory loss returns the persisted party to waiting with an interruption and no
result. Completed result metadata survives restart. Host rematch resets ready
state and the next start issues a fresh round ID. Co-op never submits solo
scores or personal bests.

Competitive configuration remains recognized for future contracts, but starts
return `mode_unavailable`. It is not selectable in this local UI. No new pen
layouts have been implemented.

## Local protocol 2 / storage schema 2

HTTP mutations and upgrades require the configured Origin. Admission verifies
the existing identity JWT via a private service binding; realtime never sees
the signing secret. Room handles include a region and 128 random bits.

| Endpoint | Behaviour |
| --- | --- |
| `GET /r/health` | Protocol 2, gameplay true |
| `GET /r/lobbies/{na,eu,apac}` | Up to 25 public waiting rooms; `after` cursor |
| `POST /r/rooms` | `{region,settings:{mode,flockSize,visibility}}`, Bearer token and 32-hex Idempotency-Key |
| `POST /r/<handle>/join` | Bearer token; reservation and single-use upgrade ticket |
| `GET /r/<handle>/status` | Availability only, no seat reservation |
| `GET /r/<handle>` | Local Vite serves invite shell; joining is explicit |
| `GET /r/<handle>/ws?ticket=…&v=2` | WebSocket upgrade |

Binary MessagePack commands are `[2,type,sequence,...args]`. Existing controls
are ready(boolean), settings(mode,count,visibility), start, loaded(round),
remove(slot), leave, again, ping and ack(roomRevision). Movement is
`input(round,x,z,sprint,barkId)`; directions must be finite with magnitude at
most one. Bark ID is monotonic per socket, independent of command sequence,
so movement coalescing cannot repeat a bark. `seen(round,tick)` acknowledges
snapshots separately from lobby revisions. Server frames are room, snapshot,
pong or error objects. `net/messages.ts` owns wire shapes; it imports no Worker
or identity code.

Every snapshot is currently a full keyframe (`basis:null`, rules `coop-1`),
with sheep x/z/heading/lifecycle, dog movement/stamina/input ACK, shared count,
and the last 32 accepted bark events. Seed and identity secrets never cross
this channel. Client history is capped at eight immutable snapshots and 30
prediction steps. It uses a fixed 100 ms buffer, holds on gaps, neutralizes
prediction after 500 ms of stale snapshots, and reconnects after five seconds
without server traffic. No full flock prediction or client-owned scoring.

## Bounds and current gaps

Four seats, 10-second admission ticket, 15-second disconnect grace, 10-second
start barrier, six-hour room lifetime and two-minute empty lobby expiry.
Waiting-only host removal retains at most 64 excluded identities. Per-region
capacity is configurable 0–50; this local launcher uses four per region.
Public listings lease for 60 seconds and refresh every 30 seconds.

Binary client frames cap at 1 KiB; transport allows a 100-message burst and
80 messages/second. Controls separately allow 20 burst and 10/second. More than
eight unacknowledged room revisions or 120 unacknowledged sim ticks closes a
socket. Stale movement neutralizes after 250 ms. Server catch-up is bounded
at 500 ms; overload interrupts rather than silently dropping gameplay time.
Ticks/snapshots do not write storage. Only membership/lifecycle changes and
directory refresh persist metadata. These are provisional defensive bounds,
not the still-unmeasured Q8 release acceptance limits.

Remaining: delta/quantized transport and adaptive interpolation, measured
correction/bandwidth limits, remote footstep/grass-trail presentation parity,
post-completion flock settling, competitive geometry/scoring, board filters and
pagination UI, host settings edits after creation, public discovery latency suggestions, interrupted mobile/network
qualification, physical phones, hub performance and a separate critical
presentation/audio review. Local tests do not close those gates. A local Vite
proxy is not a hosted routing solution; staging must explicitly route invite
shell navigation to the game assets before provisioning is approved.

## Repeatable checks

- `npm run typecheck`, `npm run test:realtime`: actual workerd, SQLite DOs,
  service binding, D1 identity and sockets; solo trace fixtures also run there.
- `npx vitest run`: existing Node suite plus remote-view and camera regression
  checks. No deterministic fixture has been regenerated.
- With `npm run coop:built` running: `node tools/coop-browser-probe.mjs` and
  `node tools/coop-browser-probe.mjs --webgl --mobile --four`. These drive normal
  controls in independent browser contexts and record ignored local receipts.
  Mobile viewport checks are composition checks, not phone performance.
- `node tools/coop-round-probe.mjs` drives two protocol clients, herds through
  ordinary input packets, checks agreed completion and starts a fresh rematch.
  It has a five-minute bound and cannot mutate authoritative state.

The [staging proposal](../docs/operations/multiplayer-staging.md) records the
approved $20 pilot budget and the required final setup review. No provisioning,
push or deployment is authorized by these local commands.

## Playable local candidate validation, 2026-10-20

Implementation commit `7bded51f99239033c9dde487baff04c75d92909c`, local only:

- Node: **912 tests in 111 files passed**. Workerd: **61 checks in five files
  passed**, including the ten unchanged solo trace checks repeated in that
  runtime. Added coverage includes multi-dog deterministic stepping at all
  flock sizes, stale input, departures, real socket snapshot agreement,
  reconnect, actual object eviction, completed-result persistence/rematch,
  local-player camera selection and isolation from solo submissions.
- Application/realtime and retained score-Worker typechecks passed. Lint has
  zero errors and six existing generated-declaration warnings. Clean `npm ci`
  reported zero vulnerabilities.
- The optimized local client passed two independent rendered contexts on genuine
  WebGPU at 1280 x 800 and four on forced WebGL2 at 390 x 844. Both runs exercised
  public creation, direct invite navigation, readiness/start, actual keyboard
  movement, two accepted barks, same-tick snapshot agreement, reload/reclaim,
  and continuing after departure. No uncaught browser errors. The four-player
  sequence also exercised the three-player state during departures. These are
  functional/layout checks on this PC, not physical-phone or timing receipts.
- Local ignored receipts: `captures/multiplayer/local-coop/webgpu-desktop-2/`
  and `webgl2-mobile-4/`, each with `receipt.json`, `waiting.png`, `playing.png`.
  The mobile waiting-room screenshot fits without horizontal overflow; player
  markers are DOM text sampled each frame. Separate visual/motion/audio
  acceptance is still open; these stills do not close it.
- A live local protocol run finished all **25 sheep in 12,576 ticks (209.6 s)**,
  with two players still present, identical results at both clients, and a
  fresh ready/start/rematch. It used normal inputs, no authoritative-state
  mutation or completion shortcut. `captures/multiplayer/local-coop/round.json`
  records it. An earlier randomized run exceeded the five-minute tool bound;
  a separate half-speed driver experiment reached 18/25 and also timed out.
  The committed tool retains the successful normal-input driver. This proves
  one real completion, not reliable automated completion for every seed or the
  required four-renderer/75-sheep release matrix.
- Production `npm run build` and discovery checks passed in the clean attached
  `gate-passage-fix` checkout, temporarily detached at the implementation SHA
  and restored afterward. The main checkout's existing output-lock issue was
  left alone. The release manifest names the implementation SHA and artifact
  digest `772c514389ca594189ae5f462a0d8fcbca9b8c99700a6a0280f2c233a62416d1`.
  Production client: **2,446.33 kB raw / 678.59 kB gzip**. Inspection confirms
  no CoopRoot chunk or co-op entry in that build. Hosting config is unchanged.
- Local co-op build: **2,448.30 kB / 679.49 kB gzip** main chunk, plus
  **38.03 kB / 12.05 kB gzip** co-op chunk. The local configuration removes
  the production analytics beacon. The dog source ledger was refreshed for
  the multi-dog renderer wrapper; geometry, skeleton and source asset are
  unchanged. No deterministic fixture was regenerated.

The camera originally passed all dogs to a single-dog buffer; the browser
check caught this before acceptance. The fix selects the local dog, with a
regression test. Native Escape handling and roster changes closing an open
co-op menu were also corrected and the browser flows rerun. A server-restart
review caught a missing party broadcast on a ping-only wake; eviction tests now
exercise that path. The unrelated lab edit was preserved byte-for-byte.

No push, provision, hosted test, production deployment, hub timing or physical
phone qualification occurred. Competitive, network optimization and the other
limits above remain explicit work; this does not close a release gate.

## Earlier foundation validation, 2026-10-20

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
