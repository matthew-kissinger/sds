# Code-quality audit - 2026-06 (upkeep Phase G)

> **Produced:** 2026-06-09, post-launch upkeep program
> ([`2026-06-post-launch-upkeep.md`](2026-06-post-launch-upkeep.md) Phase G).
> Read-only multi-agent audit plus a scripted orphan-file sweep. Only the
> "Executed" section changed code; everything else is proposal-only for a
> paired planning session.
>
> The do-not-refactor list ([`.claude/rules/scene-and-render.md`](../../.claude/rules/scene-and-render.md))
> is binding and was excluded throughout: `OptimizedSheep.js`,
> `GrassSystem.js`, `main.js`'s per-frame loop and mode dispatch, the
> `?cinematic=1` flag. `shared/` is fence-frozen and untouched.

## Executed (zero-risk, proven dead)

| File | LOC | Proof of deadness |
|---|---|---|
| `js/ProceduralMountains.js` | 149 | Scripted sweep over every js/shared/worker/tests/tools/scripts/electron/html source: zero imports anywhere. Its only inbound reference was its own shader file (next row). Dormant since Cycle 4 ("standalone procedural mountain module", `9f0b88d`). |
| `js/shaders/proceduralMountainsShader.js` | 154 | Imported only by `ProceduralMountains.js` above; a mutually-referencing dead pair. |
| `js/utils/Logger.js` | 58 | Zero importers. The grep hits in `tests/scene-renderer-setup.spec.js` and `tests/ui/webglContextRecovery.spec.ts` are coincidental local `createSilentLogger`/`silentLogger` helpers, not imports of this module. Dates to the pre-cycle "Phase 4-5 code quality" commit. |

Post-deletion proof: `npm run lint` clean, `npm run build` green,
`npm test` 1456 passed / 11 skipped, sim-baselines untouched. None of the
three was in the bundle graph (dead code never shipped), so no chunk
family shrank and the ratchet is unchanged.

Also checked, nothing to do: no `eslint-disable` comments anywhere in
`js/`; the single `@ts-ignore` (RoomDO.ts line 6, untyped JS module
import) is legitimate; no commented-out code blocks of consequence
surfaced in the sweep.

## Deliberately NOT executed

- **`js/shaders/HeightFogPatch.js` (160 LOC, zero references).** Textually
  dead by the same sweep, but it is the Cycle 25-C "height-fog patch
  foundation (not yet activated)" (`a804a29`), a deliberate dormant
  foundation recorded in the v2.0.0 polish-program scope. Deleting it is a
  decision, not a cleanup. Precedent cuts both ways: v2.0.5 deleted the
  similar `AtmosphericDesatPatch` foundation once it was clearly never
  going to activate. Recommendation: decide in a paired session, either
  wire it into Atmosphere or delete it citing the v2.0.5 precedent.

## Complexity hotspots (proposal-only)

Measured by an independent read-only agent; line counts verified at audit
time. Files the agent judged well-segmented despite size (NetworkManager
809, GameState 900, RoomDO.ts 1,463, GameSim.js 2,254, index.ts 840,
FenceEditor 973) are listed here only for the record and carry no
proposal.

| File | LOC | Issue | Seam | Effort | Risk | Payoff |
|---|---|---|---|---|---|---|
| `js/main.js` | 3,377 | Boot + lifecycle + mode dispatch in one file | Extract boot sequence (constructor through `waitForInitialization`, roughly lines 98-850) to `js/boot/`; boot extraction is explicitly fair game per the do-not-refactor list | M | med | high |
| `js/TerrainBuilder.js` | 1,852 | Multi-stage asset load, six chained shader-patch imports | `patchWorldMaterials()` facade for the patch chain; skirt-geometry extraction | M | low | med |
| `js/Sheepdog.js` | 1,430 | Eight-state animation machine inline with movement and collision | Extract `ANIMATION_STATES` + playback if it grows again; acceptable today | M | med | low |
| `js/components/StartScreen/SettingsPanel.js` | 1,119 | Monolithic four-tab component, inline gamepad-capture state machine | One subcomponent per tab; `useGamepadCapture()` hook for lines ~378-441 | M | low | med |
| `js/StructureBuilder.js` | 1,044 | Three parallel fence/gate builders with repeated vertex assembly | `gateGeometry` extraction; shared FenceBuilder | M | med | med |

## Duplication candidates (proposal-only)

| Pattern | Where | Dup LOC | Extract? |
|---|---|---|---|
| Game-mode setup (setGameMode + timer + audio) | `main.js` `startGame()` vs `startLocalGame()` | ~80 | Maybe. The branches differ (countdown vs timer vs none); cohesion is lower than it looks. Pair-review before extracting. |
| Sheepdog creation + audio + scene add | `main.js` solo vs local (two dogs) | ~25 | Cheap win if main.js boot extraction happens anyway; not worth a standalone pass. |
| Panel/tab React boilerplate | SettingsPanel, AchievementsPanel, SandboxSetup | ~100 | No. The shared Panel component already deduplicates layout; the rest is content, not boilerplate. |
| Retry/fetch wrappers | `webgpuGlbMaterialProof.js`, `placementManifest.js` | ~10 | No. Two simple helpers with different cache semantics; extraction gains nothing. |
| Diagnostic harness setup | `webgpuDiagnostic.js`, `sceneManagerWebGpuProof.js` | ~100 | No. Intentionally isolated proof harnesses; sharing setup would blur what each proves. |

## Prioritized proposal table (for the next paired planning session)

| # | Proposal | Effort | Risk | Payoff |
|---|---|---|---|---|
| 1 | Extract main.js boot sequence to `js/boot/` (the loop and mode dispatch stay) | M | low | high |
| 2 | HeightFogPatch decision: activate or delete (160 LOC, v2.0.5 precedent) | S | low | med |
| 3 | TerrainBuilder `patchWorldMaterials()` facade | S | low | med |
| 4 | SettingsPanel split by tab + gamepad-capture hook | M | low | med |
| 5 | StructureBuilder gate-geometry extraction | M | med | med |
| 6 | main.js game-mode setup dedup (fold into #1 if taken) | S | med | low |
