---
description: Orient on the active development cycle — read NEXT_SESSION.md, load the cycle plan, summarize state, ask where to start.
---

You are starting work on the active development cycle. **Don't write code yet** — orient first, then ask the user where to start.

## Steps

1. **Find the active plan.** Read [`NEXT_SESSION.md`](NEXT_SESSION.md) and extract the path to the active cycle plan (the link near the top, typically `docs/cycle-N-plan.md`).

   **Freshness check (Cycle 28 Stream D3).** Parse NEXT_SESSION.md's `Updated:` line. Compute days-since today. **If `Updated:` is older than 7 days, surface a warning** to the user before continuing: "NEXT_SESSION is N days old. The pickup priority may be stale — confirm direction before starting work." Don't block; just surface.

2. **Load the plan.** Read the full active-plan doc.

   **Phase-shape check (Cycle 28 Stream C3).** Count the `## Phase ` and `## Phase N — ` headings in the active plan (excluding the `## Phase shape rules` template section if present). **If the count exceeds 8, surface a warning** to the user: "This plan has N phases (rule says ≤ 8). Likely two cycles, not one. Confirm scope before starting." Don't block; just surface.

3. **Repo state — run in parallel** (single message, multiple tool calls):
   - `git status --short` + `git log --oneline -5`
   - `gh run list --limit 3` (recent deploys)
   - `git ls-remote --heads origin | wc -l` (remote branch count, sanity check)

4. **Summarize to the user** in plain text. Cover, in this order:
   - **Cycle name** and one-line goal
   - **Phases** with hour estimates and dependency ordering (e.g. `Phase 1 → 1.5 → 2 + 3 (parallel) → 4`)
   - **Open questions** still pending — just the prompts, not the author leans
   - **Frozen files** to be aware of (see [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md))
   - **Hard stops** declared in the plan + the durable stops in [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md)
   - **Repo state** in one line: clean/dirty, ahead/behind, last deploy result, test status if relevant
   - Any **freshness or phase-shape warnings** raised in steps 1–2.

5. **Ask the user where to start.** Phrase it as a choice: a phase number, an open question to resolve first, a research spike, or "something else." Don't pick for them.

## Don't

- Don't start writing code until the user confirms direction.
- Don't recap the entire plan verbatim — extract the load-bearing bits.
- Don't delegate the orient step to a subagent. The main session needs the cycle context loaded for the rest of the session.
- Don't skip step 4 even if the user invoked you mid-session and "obviously" knows the plan. The summary forces alignment on what's pending.
