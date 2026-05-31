# Proposed Cycle (DRAFT) — identity-authn-rebuild

> **DRAFT PROPOSAL**, drafted 2026-05-31 from the security audit ([`audit-roadmap-2026-05.md`](audit-roadmap-2026-05.md), phase P-SEC-1). This is **not** the active cycle. Cycle 50 (`object-impostor-plumbing`) is active and must not be interrupted. Queue this as a security cycle after Cycle 50 closes, or pull it forward if the live identity-takeover warrants. When promoted, rename to `docs/cycle-N-plan.md` per the cycle-close scaffold. Follows [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md).

## Goal

Stop treating the client-supplied `persistent_id` as an authenticated principal. Today `/api/register` mints a valid 24h JWT for any id a client sends ([`worker/src/index.ts:127`](../worker/src/index.ts)), and that id is published verbatim on the public leaderboard, so anyone can harvest a victim id and obtain a token that authenticates as them (overwrite scores, inflate competitive wins, forge daily times, impersonate in rooms). After this cycle, identity is server-established: the server mints the durable id, the JWT is bound to a server-chosen opaque subject, and re-issuing a token for an existing identity requires proof the caller already owns it. The user-visible difference is that leaderboard and multiplayer identity can no longer be spoofed from a harvested id, and existing players keep their identity and history through a one-time migration.

## How to read this plan

Fixes the shape (the auth model and its contracts), not the exact mechanism. Research current best practice for the proof-of-possession credential (an opaque client-held `auth_secret` verified server-side vs a signed challenge) before writing code. The whole cycle is `worker/src/*` + a D1 migration; no client render or sim change.

## Open questions to resolve before writing code

1. **Q1: PoP mechanism — stored `auth_secret` or signed challenge?** Author lean: a long random `auth_secret` generated server-side at first register, returned once, stored in client localStorage alongside the id, and verified (hashed) on re-issue. Simplest that closes the hole; no asymmetric crypto.
2. **Q2: Existing-player migration — grandfather or re-key?** Author lean: grandfather. On first authenticated call from an existing localStorage id with no `auth_secret`, bind the current id to a freshly minted secret (trust-on-first-use) so existing players are not locked out, and log the migration. Accept the small TOFU window as the cost of not invalidating every existing identity. Resolve before Phase 3.
3. **Q3: Is `persistent_id` still the leaderboard display key?** Author lean: yes — it becomes a server-generated opaque id used as both subject and display key; the public leaderboard keeps showing it, which is fine once knowing it grants nothing without the secret.

## Architecture / shared changes

A new `auth` contract in the Worker: register returns `{ persistent_id (server-generated), auth_secret (once) }`; subsequent token issuance requires the secret. A shared `subjectOf(verifiedPayload)` helper centralizes reading the JWT subject so sign-side and verify-side cannot drift (this also fixes the `/api/event` `claims.sub` bug). One new append-only D1 migration adds the `auth_secret` hash column.

## Phase 1 — Server-established identity + proof-of-possession (~4hr)

**Independently testable.** The linchpin; everything else depends on a real authenticated principal existing.

1. **Generate the id server-side.** On first `/api/register`, mint `persistent_id` via `crypto.randomUUID()` (ignore any client-supplied id for new registrations). [`worker/src/index.ts`](../worker/src/index.ts), [`worker/src/d1.ts`](../worker/src/d1.ts).
2. **Mint and store a PoP secret.** Generate a high-entropy `auth_secret`, return it once in the register response, store only its hash. New append-only migration `worker/migrations/000N_auth_secret.sql`.
3. **Bind the JWT to a server-chosen subject.** `signJwt` emits the opaque subject; re-issuing a token for an existing id requires the matching `auth_secret`. [`worker/src/jwt.ts`](../worker/src/jwt.ts).
4. **Register-for-existing-id is a no-op for unproven callers** — it does not return a token to a caller who cannot prove prior ownership.

**Acceptance (EARS):**

- When a fresh client calls `/api/register`, then the server shall generate `persistent_id` itself and the response shall include a one-time `auth_secret`.
- If a caller POSTs `/api/register` with an existing id and no valid `auth_secret`, then the server shall not issue a token authenticating as that id.
- When a token is verified, then its subject shall be a server-generated value, never a client-chosen string.
- When `npm test` runs, then a new `worker/migrations/000N_auth_secret.sql` shall exist and the migration sequence shall remain append-only (no edits to applied migrations).

## Phase 2 — Lock the auth core (~3hr)

**Depends on:** Phase 1.

1. **`jwt.ts` unit spec.** Round-trip; tampered signature → null; flipped payload → null; 2-segment token → null; expired (`exp`) → null; wrong secret → null; truncated sig → null. [`tests/worker/jwt.spec.ts`](../tests/worker) (new).
2. **Shared subject helper.** Add `subjectOf(payload)` and route every reader through it (`index.ts:155/224/275/375/472`), folding the `/api/event` `claims.sub`-vs-`persistent_id` bug into one place. (The standalone one-line `/api/event` fix already shipped as a quick win; this phase generalizes it so the two sides cannot drift again.)

**Acceptance (EARS):**

- When `npm test` runs, then `tests/worker/jwt.spec.ts` shall assert reject paths for tampered, malformed, expired, and wrong-secret tokens.
- When an authenticated `/api/event` is recorded, then `events.player_id` shall be the verified subject, asserted by a test.
- While any route reads the JWT subject, the code shall call the shared `subjectOf` helper rather than reading a claim field directly.

## Phase 3 — Existing-player migration (TOFU grandfather) (~3hr)

**Depends on:** Phase 1. Resolve **Q2** first.

1. **Trust-on-first-use bind.** On the first authenticated call from an existing localStorage id that has no stored `auth_secret`, bind it to a freshly minted secret and return it, so existing players migrate transparently.
2. **Client persistence.** Client stores `auth_secret` next to `persistent_id`; sends it on token requests. [`js/`] client identity module (client-only, non-fence).
3. **Telemetry on the migration window** so the TOFU exposure can be measured and later closed.

**Acceptance (EARS):**

- When an existing player with no `auth_secret` first authenticates, then the server shall bind a new secret and the player shall retain their `persistent_id` and history.
- While the migration window is open, the server shall emit a telemetry event per TOFU bind so exposure is measurable.
- If a client presents a wrong `auth_secret` for an existing id, then the server shall refuse to issue a token.

## Dependencies

```
Phase 1 → Phase 2 (lock) → Phase 3 (migration)   [Phase 2 and Phase 3 both depend only on Phase 1; can run in parallel after it]
```

## Frozen files (cycle-specific additions)

None beyond the durable fence. **Critical constraint:** the fix must NOT add or change a MessagePack message type or alter the wire shape — that would cross the wire-protocol fence ([`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md)) and require the four-piece authorization. The WS-identity binding (a sibling phase, P-SEC-2) rides the upgrade handshake (`Sec-WebSocket-Protocol` or a `/join`-issued ticket), not a new in-band message.

## Hard stops

1. If the migration path would lock existing players out of their identity/history, stop and redesign — grandfathering is a hard requirement, not an option.
2. If a fix requires a new MessagePack message type or a wire-shape change, stop and surface it as a fence touch before proceeding.
3. Do not deploy the worker until the existing-player migration (Phase 3) is in place; shipping Phase 1 alone would invalidate every current identity.

## What NOT to do during this cycle

- Don't fold in the broader DoS / rate-limit work (that is P-SEC-4) or score-authority work (P-SEC-5); keep this cycle to the identity model so it stays a sharp, reviewable change.
- Don't touch `shared/` or sim-baseline; this is a backend-auth cycle.
- Don't auto-deploy or bump the version; the worker deploy is an explicit reviewed step.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass (including the new `jwt.spec.ts`).
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When a client-chosen `persistent_id` is POSTed to `/api/register` for an existing identity without proof, then no authenticating token shall be issued (the closed exploit, asserted by a test).
- [ ] When an existing player authenticates post-migration, then their identity and leaderboard history shall be preserved.
- [ ] When the cycle closes, the MessagePack wire shape shall be unchanged from v2.1.10 (no fence crossing).

## References

- [`audit-roadmap-2026-05.md`](audit-roadmap-2026-05.md) — the full audit + roadmap this plan came from
- [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template
- [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) — Worker/DO/wire contract (append-only migrations, wire fence)
- [`worker/migrations/`](../worker/migrations/) — append-only migration history
