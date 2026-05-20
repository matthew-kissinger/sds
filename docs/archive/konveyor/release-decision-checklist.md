# Konveyor Release Decision Checklist

Use this only after the current branch review packet is accepted. It is
intentionally separate from the autonomous run docs because merging, deploying,
and changing default renderer policy are release decisions.

Current Cycle 38 review packet:

- Branch: `main`
- Release version: `2.1.6`
- Core code packet: Cycle 38 tree-impostor packet plus the accepted tree
  placement readability patch.
- Completion context:
  [`konveyor-completion-audit-2026-05-16.md`](konveyor-completion-audit-2026-05-16.md)
- Active cycle plan:
  [`cycle-38-plan.md`](cycle-38-plan.md)

This packet may be deployed as a WebGPU/tree-impostor branch release. It does
not make SDS mobile-ready. The Android WebGPU matrix remains budget-red, and
the opt-in tree path is a lat/lon-hemi compatibility stage rather than true
octahedral impostoring.

## Before Merge

1. Confirm the operator explicitly approved merging/deploying the WebGPU packet
   with progressive WebGPU and WebGL fallback. Matt approved docs alignment,
   commit, push, and deploy on 2026-05-16.
2. Confirm the branch is pointed at the intended Cycle 38 head and includes the
   README/CHANGELOG/version alignment for `2.1.6`.
3. Confirm no unrelated `.agents/skills/*` files are newly staged or included
   relative to `main`.
4. Re-run the current fast gates if the branch moved after the last audit:

   ```bash
   npm test
   npm run lint
   npm run build
   ```

   Current `2.1.6` tree-placement patch passed these gates on 2026-05-16 with
   `472` tests passing / `7` skipped and the main bundle ratchet intentionally
   accepted at `591 KiB`.

5. Re-run the explicit WebGPU proofs if renderer code changed after the current
   Cycle 38 tree packet. A docs-only release-alignment commit does not require
   recapturing the Android matrix:

   ```bash
   npm run probe:webgpu-impostor-lab
   npm run perf:cycle38-desktop
   npm run perf:cycle38-android
   ```

## Deploy Gate

The web default remains progressive WebGPU after this packet. The deploy
acceptance is:

1. The Cycle 38 release packet is merged to `main` (either directly on `main`
   or via a scoped working branch + PR).
2. GitHub Actions Deploy on `main` is green.
3. `https://sheepdogsim.com/` serves the deployed commit hash or matching asset
   manifest.
4. Default URL resolves production WebGPU on supported desktop Chrome/Edge.
5. Unsupported WebGPU or failed device creation falls back to WebGL.
6. `?renderer=webgl` remains a forced WebGL escape hatch.
7. Settings exposes the experimental WebGPU renderer toggle and persists the
   off state through `sds-settings.experimentalWebGpu=false`.
8. Release notes and docs do not call the Android path mobile-ready.

If the only remaining change is docs-only and the `push` deploy trigger is
skipped by `paths-ignore`, run the same deploy workflow manually on `main`
through `workflow_dispatch`.

## Post-Deploy Required Checks

Run the real iOS Safari water canary against the deployed site:

```powershell
$env:IOS_WATER_BASE_URL='https://sheepdogsim.com'
npm run test:ios-water
```

Hard stop: if `nearFoamWhite: true`, turn the web default back to WebGL or
hotfix the water path before continuing.

After some deployed traffic or explicit probe traffic exists, summarize renderer
telemetry:

```bash
npm run konveyor:renderer-telemetry -- --days=7
```

Use this to review requested/effective renderer, fallback reasons, device
preflight success, production WebGPU success, and scene distribution after the
progressive default reaches real traffic.

## Rollback Decision

Do not remove the WebGL path during this release. If live proof shows trouble,
the fastest rollback is to restore WebGL as the default while leaving explicit
`?renderer=webgpu` available for continued testing.
