# SDS Backlog

> Append-only log of closed cycles and deferred work. Most recent at the top. The `/cycle-close` slash command writes the "Recently Completed" section automatically; "Deferred" and "Distant ideas" are edited by hand as items surface.

## Recently Completed

(First entry will land when Cycle 5 closes via `/cycle-close`.)

For prior cycle history before this file existed, see:
- [`DECISIONS.md`](../DECISIONS.md) §§ Cycle 1–4 — narrative + decisions
- [`docs/cycle-2-report.md`](cycle-2-report.md) — Cloudflare migration closeout
- [`docs/cycle-2-todo.md`](cycle-2-todo.md) — droplet teardown punch list (closed 2026-04-25)
- [`docs/cycle-3-plan.md`](cycle-3-plan.md), [`docs/cycle-3-cleanup.md`](cycle-3-cleanup.md), [`docs/cycle-3-ui-ux.md`](cycle-3-ui-ux.md) — Cycle 3 plans
- [`docs/cycle-4-plan.md`](cycle-4-plan.md), [`docs/cycle-4-phase-b.md`](cycle-4-phase-b.md), [`docs/cycle-4-hardening.md`](cycle-4-hardening.md) — Cycle 4 plans

## Deferred / not blocking

Items deferred from prior cycles that haven't been picked up. Move to a cycle plan's Phase N when work starts.

- **Resize behavior** — on hold pending user reproduction. Renderer's resize handler in [`SceneManager.onWindowResize`](../js/SceneManager.js) looks correct; need a specific viewport size or device to repro. Carried from Cycle 4 Hardening § 3.
- **Octahedral impostors v2** for tree LOD — current 3-quad billboard impostor is solid (~99% triangle reduction past 250m). Only escalate to octahedral if a playtest specifically calls out the 3-quad version as inadequate. Carried from Cycle 4 Hardening § 4.
- **Tree exclusion in play area verification** — `createTrees` already rejects Poisson candidates inside `playArea` with a 20m buffer; verify visually after any heightmap re-bake or zone change. Carried from Cycle 4 Hardening § 5.
- **GitHub Actions Node.js 20 deprecation** — `actions/checkout@v4`, `actions/setup-node@v4`, `cloudflare/wrangler-action@v3` will be forced to Node 24 by June 2nd, 2026. Non-blocking until then; bump the action versions when convenient.
- **Cycle 3 Track 2 follow-through** (UI/UX polish): scene-first state machine in `App.js`, mode-shaped HUD profile, onboarding overlay, real dog PNG thumbnails, MP-joiner renderer reactivity. See [`cycle-3-ui-ux.md`](cycle-3-ui-ux.md).
- **Cycle 3 Track 1 polish:** JSX flip (mechanical codemod), boid consolidation (needs architectural decision). See [`cycle-3-cleanup.md`](cycle-3-cleanup.md) § Remaining.

## Distant ideas

Speculative — don't act on these without explicit user direction.

- **New scenes beyond Field / Rolling Hills / Open Country.** Three is the right number until those have differentiated game loops.
- **Mod-friendly scene format** extending the sandbox URL encoding (lz-string) into full scene descriptions (terrain + props + rules), letting a biome ship as a single link.
- **Competitive seasons + tournaments** once the leaderboard has enough history to make them meaningful.
- **Dynamic weather + time of day variation** during a single match (rain, fog banks, dusk transitions). Atmosphere primitives are in place.
- **Predators + rival herders** as NPC behaviour. Sheep personalities.
- **WebGPU migration.** Decided against during Cycle 4 (WebGL2 is fine for the current scope).
