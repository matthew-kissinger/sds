# docs/c-retry/

> **Cycle 2 shipped 2026-04-23.** See [../cycle-2-report.md](../cycle-2-report.md) for what actually landed (and where the shipped implementation deviates from the plans in this directory). The files here remain useful as a grep-anchored reference for client/server contract shapes and as the runbook if CF resources ever need to be recreated from scratch. Treat any specific process or timeline references as historical.

Prep artifacts for Cycle 2 of the Cloudflare Workers + Durable Objects + D1 + Pages migration. Cycle 1 attempted this on 2026-04-23 and was rolled back the same day. This directory exists so Cycle 2 does not reinvent the reference material.

## Status key

- **Live** - use this doc as reference during execution.
- **Scaled back** - retained for reference; the overnight execution plan uses a lighter variant. See `NEXT_SESSION.md` for what you actually do.
- **Superseded** - written under Cycle-1-rollback crisis mode; no longer reflects the plan.

## Files

| File | Status | Use |
|------|--------|-----|
| `contract.md` | Live | Every client-side `fetch()` + WS message paired with the server endpoint signature. Your worker must match this. Update it inline with any code change. |
| `protocol-v2.md` | Live | WebSocket wire format (MessagePack). Authoritative on wire; `contract.md` is authoritative on HTTP shapes. See `authority.md` when they disagree. |
| `authority.md` | Live | Three resolved contradictions from the prep batch: WS URL base, identity handshake, ping/pong. |
| `cf-recreate.md` | Live | Idempotent wrangler + dashboard steps to recreate worker / D1 / Pages / tokens / GitHub secrets. Run in Phase 1 of `NEXT_SESSION.md`. |
| `b2-audit.md` | Live | Which Track B2 lobby UX handlers assume DO-only server behavior. Wire those into RoomDO.ts. |
| `preflight.md` | Live | Session-start tool inventory. Optional - skip if you already know wrangler + node + gh are fine. |
| `verification-protocol.md` | Scaled back | Full protocol was written for a soak window. The short version in `NEXT_SESSION.md` Phase 5 is enough. |
| `rollback.md` | Superseded | Pragmatic rollback is `git revert && git push` + optional DNS swap. Side project - no runbook needed. |
| `staging.md` | Superseded | Staging was dropped. Ship direct to prod. |

## Entry point

Start with [`NEXT_SESSION.md`](../../NEXT_SESSION.md) at repo root. It is the single source of truth for what to execute. Everything in this directory is reference material that `NEXT_SESSION.md` links into when relevant.

The Cycle-1 postmortem is at [`POSTMORTEM.md`](../../POSTMORTEM.md) and the bug enumeration is at [`docs/cycle-1-audit.md`](../cycle-1-audit.md) - both still required reading for context on what not to repeat, even though their operational gates were scaled back.
