# Next Session - Cycle 112, front-door-foundations

> **Updated:** 2026-07-25
> **For:** Cycle 112
> **Pickup priority:** Cycle 112 is complete. All eight phases shipped and deployed, new heroes installed. Ready for `/cycle-close`, then Cycle 113 (entrance-one-door).

## Where the cycle stands

All eight phases shipped on 2026-07-25, in two pushes: phases 1 to 7 first, then Phase 8's heroes once Matt settled the sun-in-frame question and directed the plan through to completion.

| Phase | Result |
|---|---|
| 1 Fraunces | 37 KB variable woff2 at `css/fonts/`, Fredoka request deleted. Titles were rendering in Georgia before this |
| 2 Jep | 1,331,856 to 669,360 bytes, 647 KB off the critical set. Bake-script change only, no runtime code |
| 3 HUD | Reserve now measured, not hardcoded; one `Space` prompt; license off gameplay. Plus a fourth defect the sweep found on its own (compass through the camera chip at 390x844) |
| 4 Wordmark | "Sheep Dog Sim" everywhere live |
| 5 Cold load | **488ms on sheepdogsim.com** against a 2,500ms budget. New `validation:coldload` gate. Quote the production number, not the dev-server one |
| 6 Seam | **Pulled in from Cycle 114.** Fog reads the colour the sky paints at the horizon. Was blocking Phase 8 |
| 7 Deep links | `?scene=<id>` arms, commits and survives; unknown and gated ids fall back |
| 8 Heroes | **Shipped.** All four re-shot to the D8 brief and installed. Manifest at [`docs/cycle-112-hero-manifest.md`](docs/cycle-112-hero-manifest.md) |

Gate at the end of the pass: `npm run lint` clean, 1,664 vitest passing, `npm run build` clean, and `validation:lod` / `latency` / `perf` / `coldload` / `screenshots --diff` all passing.

### Re-shooting a hero

`node tools/hero-capture-cycle112.mjs` captures against a dev server on :3000; `node tools/install-hero-candidates.mjs --write` installs. Separate steps on purpose: capture only writes to the gitignored validation dir, install overwrites `assets/scenes/`. [`docs/cycle-112-hero-manifest.md`](docs/cycle-112-hero-manifest.md) carries the solved poses and the reasoning per scene, including two framings that were tried and rejected on Rolling Hills.

One thing to re-check when Cycle 113's entrance lands: the current panel covers the lower-centre of the frame, which is exactly where the D8 brief puts the dog. The heroes were framed to the brief rather than to a layout 113 is about to delete, so on today's entrance the dog sits behind the panel. If it still does after 113, the fix is `dogLateral` in the harness, not a new brief.

Two things a cold reader should know before touching anything:

1. **The screenshot goldens were re-baselined**, and they had been stale since Cycle 103 (40 commits, including the Kiln tree pipeline). The re-baseline banks 8 cycles of unrelated foliage drift. Do not read the new goldens as evidence that Cycle 112 moved the trees. The isolated seam delta was measured separately at 0.977 to 0.996 SSIM, top-band weighted. Detail in the plan's Phase 6 section.
2. **The `main` bundle budget was bumped 639 to 645 KiB** with the accounting recorded in the plan. `UPDATE_FIXTURES` was not used, so the heightfield and tree-scatter goldens in that fixture directory are untouched.

## Current State

A front-end review of the shipping v2.6.2 build produced a 21-decision alignment pass, answered in full on 2026-07-24. The decisions are locked in [`DECISIONS.md`](DECISIONS.md) under "Front door alignment". They are constraints, not suggestions; cite them by number (D1 to D20, D-W) rather than re-deriving them.

The finding in one sentence: the entrance asked a first-time player to make seven decisions before they had seen the game move, on top of a hero image where the dog was four pixels wide.

That produced a seven-cycle program, [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md), running 112 through 118. Cycle 112 is the foundations pass: clear the noise and re-shoot the art so Cycle 113's new entrance can be judged on its own merits.

The decisions most likely to surprise an agent picking this up cold:

1. **The first session's promise is "a calm place to spend ten minutes"** (D2), not the mechanic and not the ladder. The hero brief was revised because of it: calm, not tense.
2. **The entrance becomes Direction A, "One Door"** (D3), with one primary action and everything else behind a summary line or a menu.
3. **The tutorial moves inside the first round** (D4). Home Field is the first-visit default (D5), which closes the question that had been open since Cycle 111.
4. **The art target is stylised painterly** (D9), and the fence and farmhouse are authored in-repo (D10) rather than commissioned.
5. **The water gets rewritten, not retuned** (D-W). Cycle 118.
6. **Sheep Dog Island's zap becomes a fenced pasture with one gate** (D15), and its solo board resets (D12) after a re-verification step.
7. **Everything rolls continuously** (D20). No version gate on this program.

## Cycle 112 Phases

Full plan with EARS acceptance: [`docs/cycle-112-plan.md`](docs/cycle-112-plan.md).

| Phase | Goal | Mode | Status |
|---|---|---|---|
| 1 | Ship Fraunces, delete the dead Fredoka request | Autonomous | Shipped |
| 2 | Take Jep off the critical path | Autonomous | Shipped |
| 3 | HUD defect sweep, and demote the license off gameplay | Autonomous | Shipped |
| 4 | One wordmark: "Sheep Dog Sim" everywhere | Autonomous | Shipped |
| 5 | Instrument first-interactive against the 2.5s / 5s budget | Autonomous | Shipped |
| 6 | Horizon seam (pulled in from Cycle 114) | Autonomous | Shipped |
| 7 | Make `?scene=<id>` deep links actually commit that scene | Autonomous | Shipped |
| 8 | Hero capture session, all four scenes to the D8 brief | Paired, run autonomously on Matt's direction | Shipped |

Q1, Q2 and Q3 are resolved inline in the plan. Three corrections the scaffold needed once the code was measured, all recorded there: Phase 2's 400 KB target was arithmetically impossible against a 206 KB mesh floor (Matt chose 654 KB, keeping three idles); the font belongs in `css/fonts/` rather than `public/fonts/` because `base: './'` on the itch and native targets breaks a root-absolute url; and the capture phase was pre-blocked by its own hard stop, which is why the seam fix moved into this cycle.

## Review Entry Points

1. [`docs/cycle-112-plan.md`](docs/cycle-112-plan.md) - phases, EARS acceptance, hard stops.
2. [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) - where this cycle sits in the seven-cycle program.
3. [`DECISIONS.md`](DECISIONS.md) - the decision register and the measured findings behind it.
4. [`docs/launch/leaderboard-season-plan.md`](docs/launch/leaderboard-season-plan.md) - the no-reset guardrail D12 is measured against. Relevant in Cycle 117, not here.

## Autonomy Rules

- All eight phases are done. The cycle is ready for `/cycle-close`.
- **Phase 8 was scoped paired and was run autonomously on Matt's explicit direction**, after he resolved its one open taste question. The default for future capture work is still the media-prep preference: agent writes the manifest, Matt drives the browser.
- Do not start the entrance rewrite yet. That is Cycle 113, and it now has Phase 8's heroes to be judged against.
- Do not reset any leaderboard in this cycle. Cycle 117 owns it, with its own re-verification.
- Keep `shared/`, sim-baseline goldens, and frozen process files untouched. This cycle needs none of them.
- Do not store API keys in repo files, docs, memory notes, screenshots, or launch packets.
- Do not publish paid, irreversible, or public marketplace submissions without explicit approval.

## Reference Table

| Topic | Source |
|---|---|
| Portable agent rules | [`AGENTS.md`](AGENTS.md) |
| The seven-cycle program | [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) |
| Locked decisions | [`DECISIONS.md`](DECISIONS.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Pickup contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
| Closed cycles + deferred | [`docs/BACKLOG.md`](docs/BACKLOG.md) |

## Stop Conditions

Stop and surface before continuing if the Jep clip split changes visible dog animation in any camera mode, if a Phase 8 capture still shows the horizon skirt seam (which reopens Phase 6 rather than deferring to 114), if validation discovers a gameplay regression, if a deploy target is red, or if any frozen-file edit is needed outside this plan's authorization.

The Fraunces stop is cleared: 37 KB shipped and desktop first-interactive measured at 593ms against a 2,500ms budget.
