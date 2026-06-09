# Multiplayer / Worker / Durable Object contract

Durable rules for the Cloudflare backend (Worker + DO + D1 + Pages) and the wire protocol. No cycle-specific content.

## Architecture

- **Frontend:** Cloudflare Pages, project `sds-frontend`. Built from this repo's `dist/`.
- **Backend:** Cloudflare Worker `sds-worker` with Durable Objects for room state and WebSocket termination.
- **Leaderboard storage:** Cloudflare D1 (`sds-db`). Migrations are **append-only** — see [`worker/migrations/`](../../worker/migrations/).
- **Auth:** server-minted `persistent_id` bound to a device-held `auth_secret` (trust-on-first-use; a returning client re-proves with both, a leaked id without the secret is rejected - P-SEC-1, migration `0007_player_auth_secret.sql`). The session token is a Worker-issued signed JWT (24h), signed with the `JWT_SECRET` Workers secret; WS upgrades additionally carry a short-lived admission ticket (P-SEC-2).
- **Tick rate:** 60Hz server-side inside the DO. Clients run the same shared sim and predict; the DO is authoritative.
- **Wire protocol:** MessagePack over WebSocket, `PROTOCOL_VERSION 3` with changed-sheep delta frames (next section). JSON exists only for the REST handshake.

## Wire protocol (v3)

Shipped 2026-06-09 (server `d20d775`, client `0e992f9`, backpressure `3f4f385`). Full spec including the measured Deviations section: [`docs/hardening/delta-protocol-design.md`](../../docs/hardening/delta-protocol-design.md). Constants live in [`shared/protocol.js`](../../shared/protocol.js); the delta builder is `getDeltaPathFrame` in [`worker/src/GameSim.js`](../../worker/src/GameSim.js); the broadcast loop is `broadcastGameFrame` in [`worker/src/RoomDO.ts`](../../worker/src/RoomDO.ts); client reconstruction lives entirely in [`js/NetworkManager.js`](../../js/NetworkManager.js) (downstream consumers still see full snapshots).

- **Delta frames:** v3 sessions get `gameStateDelta` carrying only the sheep whose quantized wire record changed since the previous broadcast frame, keyed by array index (`changed[j].i`, full record per changed sheep). Top-level scalars, the full `sheepdogs` array, and the conditional blocks ride every frame.
- **Keyframes:** a full `gameStateUpdate` (tick-stamped) every `KEYFRAME_INTERVAL_TICKS = 60` ticks, plus on game start, on socket bind mid-game, and on a client `requestKeyframe` (unicast, capped at 2 per second per client).
- **Degenerate rule:** past 85% of the flock changed, the DO sends a keyframe instead of a delta, so the delta path is never meaningfully worse than the old full-frame cost.
- **Per-client soft-degrade:** sessions that joined with `protocolVersion < 3` (or none) get full `gameStateUpdate` frames every broadcast interval, byte-compatible with v2 except the additive `tick` field. No refusal; `SURVIVAL_MIN_PROTOCOL_VERSION` stays 2.
- **Backpressure eviction:** a client whose socket backlog stays over 256 KB (or whose sends keep throwing) for ~4s of consecutive broadcast intervals is evicted (close 1013, routed through the normal disconnect/grace/host-migration path). While saturated its frames are skipped; a v3 client recovers via `requestKeyframe`, a legacy client just gets the next full frame.
- **Measured reality:** active flocks never settle below the 0.01 wire quantum, so delta savings scale with round progress (43.4% of baseline at the 140-of-200-retired gate scenario, 100% at round start with the degenerate rule holding the bound). See the design doc's Deviations section before reasoning about egress.

## The DO is authoritative; clients predict

The Worker's DO holds the canonical `gameState`. Clients run the **identical** [`shared/`](../../shared/) sim against the same input stream and predict locally so the dog feels responsive. The DO broadcasts state at 60Hz; clients reconcile.

**This is why [`shared/`](../../shared/) determinism matters.** Any divergence between Worker and client `shared/` builds desyncs the prediction. See [`shared-sim.md`](shared-sim.md) for the deterministic-sim contract.

## Lobby UX

- Shareable invite URLs.
- Public lobby list.
- Host starts the round.
- Host migration on disconnect.
- Public rooms cycle game modes.

These are decisions, not aspirations — see [`DECISIONS.md`](../../DECISIONS.md) item 7.

## Identity handshake

Identity rides the WebSocket URL: `wss://.../room/<code>?playerId=<sessionId>`. The REST `/api/rooms` join already stored the session in the DO, so the WS upgrade is a **lookup**, not a credential handshake. Simpler and one round-trip faster than a post-upgrade `hello` message.

## Append-only migrations

[`worker/migrations/*.sql`](../../worker/migrations/) is an ordered, append-only history. Once a migration has been applied to the remote D1, it is **immutable**.

- New migration = new file with the next sequence number (`0003_*.sql`, `0004_*.sql`).
- **Never edit** an existing migration once applied. The history is the contract.
- Apply locally with `npm run dev:setup` (runs `scripts/d1-local-setup.mjs`, which applies the full local migration set).
- Remote apply is automated by the deploy workflow's `migrate` job ([`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)): it applies any migration file **newly added** in the push (`git diff --diff-filter=A`) to remote `sds-db` via `wrangler d1 execute --remote`, before the Worker/Pages deploy. It deliberately does **not** use `wrangler d1 migrations apply` - the `d1_migrations` tracking table is out of sync from earlier manual applies, so that would try to re-run `0007`-`0009`.

## What stays out of the Worker

- **No DOM / Three.js / browser APIs in `worker/` source.** The Worker runs on V8 isolates without DOM.
- **No long-running compute on the request hot path.** The Worker's CPU budget is small; pre-bake heavy work at build time.
- **No client-only state in the DO.** Camera modes, UI prefs, controller bindings stay client-side.

## When wire-protocol changes

The protocol contract — MessagePack delta-encoding, channel structure, message shape — is fence-frozen. A cycle phase that legitimately needs a wire-format change:

1. Names the change in the phase scope.
2. Describes the migration story for **in-flight sessions** (clients on the old protocol joining a room on the new one): does the DO refuse the connection, soft-degrade, or version-tag?
3. Lists every consumer that needs updating: client `NetworkManager`, Worker DO message handler, any test that asserts payload shape.
4. Adds an explicit Acceptance line confirming the version-tag or migration story is implemented.

Without those four pieces, a wire-format change is a **fence violation**. Stop and surface to the user.

## What we deferred (deliberately)

- **20Hz tick rate.** The original plan was 20Hz; we ship 60Hz inside the active DO since it's a known-good pattern and the 20Hz rubber-banding regressed in testing. Reopen only if DO CPU cost becomes a real constraint.
- **Hibernation WebSocket API.** Standard WS works fine until idle-room cost matters.
- **SpacetimeDB.** Considered and deferred at the foundational decision pass. Revisit for a future persistent-world project, not this one.
- **Geckos / WebRTC.** Removed. The DigitalOcean droplet that hosted Geckos was destroyed; do not reintroduce a non-CF backend without a deliberate cycle for it.

These are listed in [`DECISIONS.md`](../../DECISIONS.md) and not up for casual revisit.
