# Authority of prep artifacts when they disagree

The Cycle 2 prep batch landed 11 artifacts across parallel worktrees. Three
cross-artifact contradictions are known. This doc names the canonical answer
for each so the retry agent does not have to choose.

## 1. Wire protocol (URL base, identity, ping/pong)

`docs/c-retry/protocol-v2.md` is authoritative on everything that travels over
the WebSocket or appears in a URL:

- **WS upgrade URL:** `wss://sheepdogsim.com/r/{roomCode}/ws` (apex). Staging
  uses `wss://staging.sheepdogsim.com/r/{roomCode}/ws`. The `api.` subdomain
  is the legacy droplet host and does not appear in the v2 contract.
- **Identity handshake:** no identity in the URL. Client sends
  `{v:2, t:'hello', playerId, persistentId, name, dogType, token, ...}` as the
  first WS message after upgrade. Server validates and replies with `welcome`.
- **Heartbeat vs RTT:** server sets `setWebSocketAutoResponse('\x01ping',
  '\x01pong')` for hibernation-safe liveness. RTT measurement is a separate
  MessagePack `{t:'rtt', id, clientTs}` round-trip rate-limited to 5s.

Where `contract.md` describes identity in the URL query string or uses the
`api.` subdomain, treat it as archeology — it documents what the Cycle 1 client
code expected, not what the retry will ship.

## 2. HTTP endpoint field shapes

`docs/c-retry/contract.md` is authoritative on HTTP request and response
shapes (every `fetch()` body and response, every client consumer by
file:line). Sections 1 and 6 of that doc are the grep-anchored source of
truth. `protocol-v2.md` restates the endpoint list for completeness but is
less exhaustive on consumer file:line.

## 3. Message-type rename

`ready` (in `contract.md` Section 2) and `hello` (in `protocol-v2.md` Section
5) are the same post-upgrade identity message. **v2 uses `hello`.** The
retry server implements `case 'hello'`; the client sends `{t:'hello', ...}`.
`contract.md`'s `ready` entry is kept as archeology and will not appear in
the v2 wire.

## 4. Staging vs production data

`docs/c-retry/staging.md` rejects porting the 207 prod players into
`sds-db-staging` (fixtures only). `docs/c-retry/cf-recreate.md` documents a
207-row migration from the droplet dump. These are not in conflict:

- `sds-db-staging` gets fixtures during the 7-day soak (staging.md).
- `sds-db` (production) gets the 207-row migration at cutover time
  (cf-recreate.md §3.2 step 4), after staging soak has passed.

## 5. When this doc should change

If a future prep artifact introduces a fourth wire-protocol opinion or
contradicts an answer here, update this doc first, then the conflicting
artifact. Do not let the retry roadmap reference authoritative behavior
that only lives inline in one of 11 files.
