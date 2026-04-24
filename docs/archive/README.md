# docs/archive/

Historical artifacts from the Cycle 1 rollback and Cycle 2 planning + execution. Kept for context and as a spec reference; none of these documents describe the current state of the codebase. For current architecture and status, start from the repo-root [README.md](../../README.md) and [docs/cycle-2-report.md](../cycle-2-report.md).

## Index

| File | What it is |
|------|-----------|
| [POSTMORTEM.md](POSTMORTEM.md) | Cycle 1 same-day rollback retrospective. The process rules from §5 are still in force. |
| [cycle-1-audit.md](cycle-1-audit.md) | Opus 4.7 audit of the seven launch-blocking bugs Cycle 1 shipped. |
| [AGENT_PLAN.md](AGENT_PLAN.md) | Long-form agent roadmap from before Cycle 2 execution. |
| [NEXT_SESSION.md](NEXT_SESSION.md) | Handoff note into the Cycle 2 overnight batch. |
| [2p-local-report.md](2p-local-report.md) | 2-player split-screen investigation + fix report. |
| [sandbox-punchlist.md](sandbox-punchlist.md) | Sandbox-mode punch list, now shipped. |
| [c-retry/](c-retry/) | Pre-Cycle-2 contract + protocol + runbook prep batch. `contract.md` and `protocol-v2.md` are still a useful single-sheet reference for the HTTP + WS shapes implemented by `worker/src/`. |

## When to read these

- **Onboarding as a contributor:** skip this directory; read `README.md`, `ARCHITECTURE.md`, and `DEVELOPMENT.md` at the repo root.
- **Debugging the multiplayer protocol:** `c-retry/contract.md` and `c-retry/protocol-v2.md` are grep-anchored references for the wire format.
- **Understanding "why did you do it this way":** `POSTMORTEM.md` §5 (process rules that shape the current cycle), `DECISIONS.md` at the repo root (actual decisions in force).
- **Reproducing the stack from scratch:** `c-retry/cf-recreate.md` documents the idempotent Cloudflare bootstrap.
