# Konveyor Release Decision Checklist

Use this only after the branch review packet is accepted. It is intentionally
separate from the autonomous run docs because merging, deploying, and changing
the default renderer are release decisions.

Historical Cycle 37 review packet:

- Branch: `exp/konveyor-webgpu-migration`, since merged through PR
  [#52](https://github.com/matthew-kissinger/sds/pull/52)
- Completion audit:
  [`konveyor-completion-audit-2026-05-16.md`](konveyor-completion-audit-2026-05-16.md)
- Final local default-policy proof:
  `../cycle36-validation/runtime/progressive-webgpu-default-request-proof.json`
  and `../cycle36-validation/runtime/progressive-webgpu-default-perf-proof.json`

For the later mobile-readiness work, do not reuse the Cycle 37 merge checklist
as proof. Re-run validation from the current checkout, then add Cycle 38 mobile
matrix artifacts, visual screenshot gates, iOS/BrowserStack canaries, and
telemetry review before any release claim.

## Before Merge

1. Confirm the operator explicitly approved merging/deploying the WebGPU packet
   with progressive WebGPU as the web default. Matt approved this on
   2026-05-16.
2. Confirm PR #52 is still pointed at the intended head.
3. Confirm no unrelated `.agents/skills/*` files are staged or included.
4. Re-run the current fast gates if the branch moved after the last audit:

   ```bash
   npm test
   npm run lint
   npm run build
   npm run native:check
   ```

5. Re-run the explicit WebGPU proofs if renderer code changed after the last
   audit:

   ```bash
   node tools/konveyor-production-webgpu-request-proof.mjs --base-url=http://127.0.0.1:4173/ --scenes=field,rolling-hills,open-country --out=cycle36-validation/runtime/progressive-webgpu-default-request-proof.json --out-dir=cycle36-validation/runtime/progressive-webgpu-default-request-proof
   node tools/konveyor-production-webgpu-perf-proof.mjs --base-url=http://127.0.0.1:4173/ --scenes=field,rolling-hills,open-country --out=cycle36-validation/runtime/progressive-webgpu-default-perf-proof.json
   node tools/konveyor-production-webgpu-mp-proof.mjs --base-url=http://localhost:3000/
   ```

## Deploy Gate

The web default is progressive WebGPU after this release-policy update. The
deploy acceptance is:

1. GitHub Actions Deploy on `main` is green.
2. `https://sheepdogsim.com/` serves the new commit hash or asset manifest.
3. Default URL resolves production WebGPU on supported desktop Chrome/Edge.
4. Unsupported WebGPU or failed device creation falls back to WebGL.
5. `?renderer=webgl` remains a forced WebGL escape hatch.
6. Settings exposes the experimental WebGPU renderer toggle and persists the
   off state through `sds-settings.experimentalWebGpu=false`.

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
