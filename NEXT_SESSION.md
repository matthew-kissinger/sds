# Next Session - Cycle 114, grounding-pass

> **Updated:** 2026-07-25
> **For:** Cycle 114
> **Pickup priority:** The Cycle 114 plan is a scaffolded stub. Fill in Goal + Phases from the roadmap's 114 section, then run `/cycle-start`.

## Current State

Cycle 113 (`entrance-one-door`) closed 2026-07-25. All seven phases shipped and deployed. Plan archived at [`docs/archive/cycles/cycle-113-plan.md`](docs/archive/cycles/cycle-113-plan.md); the close entry with full detail is at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

The front door is fixed. A first-time visitor now meets a hero with a readable dog in it, the world's name on the photograph, one summary line and one Play. `Entrance.tsx` went from 449 lines and 47 inline style objects to 253 and none; the tutorial moved inside the first round, which is what removed the second primary button; the loading screen became the same room rather than a second one. Production build reads first-interactive at 214ms.

That was the last of the three cycles about the door itself. 114 turns to what is behind it.

## Cycle 114 shape (from the roadmap)

Full context: [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md), "Cycle 114". All shader and placement work, no new models per D11. It buys most of the perceived asset quality before any modelling starts in 115.

- Grass falloff at exclusion edges instead of a hard rectangular cut. The Home Field pen and the farmhouse yard both sit on bald patches today.
- Per-instance rotation and height jitter on fence posts.
- Split the farmhouse's single flat material into roof, wall and trim.
- Lower grass blade contrast, per-clump hue variation, and a low-frequency ground albedo underneath, so grass reads as a surface rather than as static.
- Ground contact darkening under the dog so it separates from the field at any camera distance.
- **Re-inspect the horizon skirt before spending a phase on it.** The colour half shipped in Cycle 112 Phase 6 (fog reads the painted sky horizon). What remains is the geometric rim at the terrain plane's 2000m edge, which stopped being visible once the colours converged. It may already be done.

## The pattern Cycle 113 set

Anything this cycle touches in the UI migrates onto [`css/entrance.css`](css/entrance.css)'s shape, not onto more inline style objects. The rules are written down in [`DECISIONS.md`](DECISIONS.md) under "The entrance stylesheet is the D16 reference pattern", and [`tests/ui/entranceStylesheet.spec.ts`](tests/ui/entranceStylesheet.spec.ts) is the template for enforcing them on a new surface. D16 still applies: new code only, others migrate when touched for their own reasons.

## Carryover from Cycle 113

1. **The hero review is Matt's, and still open** (inherited from 112). Every measurable part of the D8 brief is met and now gated by [`tools/validation/entrance-hero-clearance.mjs`](tools/validation/entrance-hero-clearance.mjs), but the taste call has not been made. Re-shoot with `node tools/hero-capture-cycle112.mjs` then `node tools/install-hero-candidates.mjs --write`; poses and the two framings already tried and rejected are in [`docs/cycle-112-hero-manifest.md`](docs/cycle-112-hero-manifest.md). **If a hero is re-shot, re-derive its `objectPosition` in [`js/components/entrance/worlds.ts`](js/components/entrance/worlds.ts)** - `tests/ui/heroCrop.spec.ts` will fail until you do, which is the point.
2. **The name field has no new home.** D6 took it off the entrance and said it belongs at first score submission. That surface is unbuilt, so a player who never opens Settings submits as "Shepherd".
3. **Loading-to-live camera framing.** Deliberately out of scope in 113 Phase 5. It needs a camera-pose handshake from the engine and is a cycle of its own, not a phase.
4. **A real horizon-seam gate.** `tools/validation/horizon-seam.mjs` ships as an A/B reporting tool that always exits 0, because its band detector scored Rolling Hills *worse* after the fix by locking onto unrelated terrain. A real gate needs a detector that knows where the horizon line is.
5. **The golden gate ran unattended for 8 cycles while failing.** It lives in `validation:all`, which is not in CI. Either run `validation:all` at every cycle close or move the golden diff into CI. Untouched by 113, which changed no render path.
6. **[`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) carries 19 em-dashes** that every scaffolded plan inherits, against [`.claude/rules/prose-and-voice.md`](.claude/rules/prose-and-voice.md). Stripped from the 114 scaffold by hand; the template itself was left alone rather than edited without a phase authorizing it.
7. **~~Unarchived cycle plans.~~ Resolved.** Seven closed plans were sitting in `docs/`; all are archived now, and the five that never got `BACKLOG` entries (106 to 110) are backfilled from their own close reports. Worth knowing why they looked unrun: they had no ticked acceptance boxes, no commits naming them and no backlog entry, yet every deliverable exists and `CHANGELOG.md` records the program shipping as `v2.4.0`. Closed in substance, never in ceremony. `docs/` now holds only the active plan, which is also what the close hook expects.

## A note for the close ritual

This file cites other cycles by path in the carryover section above, and that used to break the close. `/cycle-close`'s reconciliation hook resolved the active cycle by taking the first `docs/cycle-N-plan.md` string anywhere in this document, so those citations made it reconcile Cycle 110 rather than the active one, and report an already-closed cycle's acceptance items as live. It now reads the required `**For:**` header instead, per [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md), with the Reference Table row as a fallback. Pinned by [`tests/cycle-close-reconcile.spec.ts`](tests/cycle-close-reconcile.spec.ts).

Keep that header accurate. It is the declaration everything else follows, and citing other plans by path in the body is now safe.

## Known repo hygiene issue

Several Cycle 112 commits flipped files from LF to CRLF as a side effect of the editing method, not of any intended change. `af9dc8a2` carries ~2,500 lines of pure line-ending flip and `03dfd9dc` ~1,940, across 16 files. Content in those commits is correct; only the terminators moved. Cycle 113 caught two further flips before they landed (`sceneComponents.tsx`, `.gitignore`) by diffing `--numstat` against `--numstat --ignore-cr-at-eol` on every staged set, which is worth keeping as a habit. The repo has no `.gitattributes` and already carries mixed endings across hundreds of files, so this is drift on top of existing drift. Worth a deliberate `.gitattributes` pass if it starts causing diff noise; not worth rewriting pushed history for.

## Review Entry Points

1. [`docs/cycle-114-plan.md`](docs/cycle-114-plan.md) - the stub to fill in.
2. [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) - where this cycle sits in the seven-cycle program.
3. [`DECISIONS.md`](DECISIONS.md) - the 21-decision register, "Front door alignment", plus the new D16 reference-pattern entry. Constraints, not suggestions; cite by number.
4. [`docs/archive/cycles/cycle-113-plan.md`](docs/archive/cycles/cycle-113-plan.md) - what just shipped and why.

## Autonomy Rules

- Cycle 114 is not authored yet. Do not start writing shader or placement code before the plan has Goal + Phases and Matt has confirmed direction.
- D11 is explicit: **no new geometry this cycle.** The fence kit and the farmhouse kit-bash are Cycle 115. If a grounding fix seems to need a new model, that is the signal to stop and surface it.
- Do not reset any leaderboard. Cycle 117 owns it, with its own re-verification step.
- Keep `shared/`, sim-baseline goldens, and frozen process files untouched unless the plan explicitly authorizes it.
- Do not store API keys in repo files, docs, memory notes, screenshots, or launch packets.
- Do not publish paid, irreversible, or public marketplace submissions without explicit approval.
- Do not bump the version. D20 says roll continuously.

## Reference Table

| Topic | Source |
|---|---|
| Active cycle plan | [`docs/cycle-114-plan.md`](docs/cycle-114-plan.md) |
| Portable agent rules | [`AGENTS.md`](AGENTS.md) |
| The seven-cycle program | [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) |
| Locked decisions | [`DECISIONS.md`](DECISIONS.md) |
| UI pattern for new surfaces | [`css/entrance.css`](css/entrance.css) + [`tests/ui/entranceStylesheet.spec.ts`](tests/ui/entranceStylesheet.spec.ts) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Pickup contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
| Closed cycles + deferred | [`docs/BACKLOG.md`](docs/BACKLOG.md) |

## Stop Conditions

Stop and surface before continuing if the grounding pass would touch `shared/` or the wire protocol, if it would need a new model (that is Cycle 115, per D11), if validation discovers a gameplay regression, if a deploy target is red, or if any frozen-file edit is needed outside the active plan's authorization.
