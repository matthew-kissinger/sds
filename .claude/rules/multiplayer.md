# Multiplayer / Worker / Durable Object contract

Durable rules for the Cloudflare backend (Worker + DO + D1 + Pages) and the wire protocol. No cycle-specific content.

## Architecture

- **Frontend:** Cloudflare Pages, project `sds-frontend`. Built from this repo's `dist/`.
- **Backend:** Cloudflare Worker `sds-worker` with Durable Objects for room state and WebSocket termination.
- **Leaderboard storage:** Cloudflare D1 (`sds-db`). Migrations are **append-only** — see [`worker/migrations/`](../../worker/migrations/).
- **Auth:** `persistent_id` (localStorage) + Worker-issued short-lived signed token. Signed with the `JWT_SECRET` Workers secret.
- **Tick rate:** 60Hz server-side inside the DO. Clients run the same shared sim and predict; the DO is authoritative.
- **Wire protocol:** MessagePack over WebSocket with delta-encoded sheep state. JSON exists only for the REST handshake.

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
- Apply locally with `npm run dev:setup` (which runs the wrangler migration apply).
- Apply to remote with the standard wrangler CLI; CI does this on deploy.

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
