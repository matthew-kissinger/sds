# Next Session - Cycle 113, entrance-one-door

> **Updated:** 2026-07-25
> **For:** Cycle 113
> **Pickup priority:** The Cycle 113 plan is a scaffolded stub. Fill in Goal + Phases from the roadmap's 113 section, then run `/cycle-start`.

## Current State

Cycle 112 (`front-door-foundations`) closed 2026-07-25. All eight phases shipped and deployed. Plan archived at [`docs/archive/cycles/cycle-112-plan.md`](docs/archive/cycles/cycle-112-plan.md); the close entry with full detail is at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

What 113 inherits from it: a consistent wordmark, the display face actually shipping, a critical payload 646 KB lighter, no HUD overlaps, working scene deep links, a horizon that no longer seams, a cold-load gate reading **488ms** in production, and four re-shot entrance heroes.

Cycle 113 is the actual fix the whole program is for. Everything 112 did was to make it judgeable.

## Cycle 113 shape (from the roadmap)

Full context: [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md), "Cycle 113". Direction A with C's typographic restraint (D3). This sets the UI pattern the rest of the interface migrates onto.

- New entrance component in TypeScript, on a real stylesheet rather than inline style objects, on the pastoral tokens only (D16).
- One primary action. World, mode and dog collapse to a summary line that opens a picker in place.
- Three rungs plus "More" (D7). World switching moves to arrows on the image edges.
- Everything in D6 leaves the primary surface. Multiplayer keeps a text-weight line.
- The tutorial becomes an in-round soft overlay (D4), which is where the second primary button goes away.
- Phone case designed first, not adapted.
- Home Field is the first-visit default (D5), already live.

The old `Entrance.tsx` is 434 lines holding backdrop, corner nav, world switcher, mode family, rungs, dog picker, rename field, perf warning, tutorial offer and legal. **Most of this cycle is deletion.**

## Carryover from Cycle 112

1. **The hero review is open.** "All four entrance heroes shall satisfy the D8 brief per Matt's review" was deferred at close. Every measurable part of the brief is met (dog 3.9% to 5.5% of frame height against a 3% floor, no seam, no near occluder), but the line wants Matt's eye. Re-shoot with `node tools/hero-capture-cycle112.mjs` then `node tools/install-hero-candidates.mjs --write`. Poses and per-scene reasoning, including two framings already tried and rejected on Rolling Hills, are in [`docs/cycle-112-hero-manifest.md`](docs/cycle-112-hero-manifest.md).
2. **Check the hero against the new layout.** Today's entrance panel covers the lower-centre, which is exactly where D8 puts the dog, so the dog currently sits behind it. The heroes were framed to the brief rather than to a layout 113 deletes. If the collision survives the rewrite, the fix is `dogLateral` in the harness, not a new brief.
3. **A real horizon-seam gate.** `tools/validation/horizon-seam.mjs` ships as an A/B reporting tool that always exits 0, because its band detector scored Rolling Hills *worse* after the fix by locking onto unrelated terrain. A real gate needs a detector that knows where the horizon line is.
4. **The golden gate ran unattended for 8 cycles while failing.** It lives in `validation:all`, which is not in CI. Either run `validation:all` at every cycle close or move the golden diff into CI.

## Known repo hygiene issue

Several Cycle 112 commits flipped files from LF to CRLF as a side effect of the editing method, not of any intended change. `af9dc8a2` carries ~2,500 lines of pure line-ending flip and `03dfd9dc` ~1,940, across 16 files (`css/main.css`, `index.html`, `tests/atmosphere.spec.js`, `tests/webgpu-diagnostic.spec.js`, `js/components/GameHUD/CorralCompass.tsx` and others). Content in those commits is correct; only the terminators moved. The repo has no `.gitattributes` and already carries mixed endings across hundreds of files, so this is drift on top of existing drift rather than a new class of problem. Worth a deliberate `.gitattributes` pass if it starts causing diff noise; not worth rewriting pushed history for.

## Review Entry Points

1. [`docs/cycle-113-plan.md`](docs/cycle-113-plan.md) - the stub to fill in.
2. [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) - where this cycle sits in the seven-cycle program.
3. [`DECISIONS.md`](DECISIONS.md) - the 21-decision register, "Front door alignment". Constraints, not suggestions; cite by number.
4. [`docs/archive/cycles/cycle-112-plan.md`](docs/archive/cycles/cycle-112-plan.md) - what just shipped and why.

## Autonomy Rules

- Cycle 113 is not authored yet. Do not start writing entrance code before the plan has Goal + Phases and Matt has confirmed direction.
- Do not reset any leaderboard. Cycle 117 owns it, with its own re-verification step.
- Keep `shared/`, sim-baseline goldens, and frozen process files untouched unless the plan explicitly authorizes it.
- Do not store API keys in repo files, docs, memory notes, screenshots, or launch packets.
- Do not publish paid, irreversible, or public marketplace submissions without explicit approval.
- Do not bump the version. D20 says roll continuously.

## Reference Table

| Topic | Source |
|---|---|
| Active cycle plan | [`docs/cycle-113-plan.md`](docs/cycle-113-plan.md) |
| Portable agent rules | [`AGENTS.md`](AGENTS.md) |
| The seven-cycle program | [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) |
| Locked decisions | [`DECISIONS.md`](DECISIONS.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Pickup contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
| Closed cycles + deferred | [`docs/BACKLOG.md`](docs/BACKLOG.md) |

## Stop Conditions

Stop and surface before continuing if the entrance rewrite would touch `shared/` or the wire protocol, if validation discovers a gameplay regression, if a deploy target is red, or if any frozen-file edit is needed outside the active plan's authorization.
