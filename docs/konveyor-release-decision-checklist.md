# Konveyor Release Decision Checklist

Use this only after the branch review packet is accepted. It is intentionally
separate from the autonomous run docs because merging, deploying, and changing
the default renderer are release decisions.

Current review packet:

- Branch: `exp/konveyor-webgpu-migration`
- Draft PR: [#52](https://github.com/matthew-kissinger/sds/pull/52)
- Completion audit:
  [`konveyor-completion-audit-2026-05-16.md`](konveyor-completion-audit-2026-05-16.md)

## Before Merge

1. Confirm the operator explicitly approved merging/deploying the WebGPU packet.
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
   node tools/konveyor-production-webgpu-request-proof.mjs
   node tools/konveyor-production-webgpu-perf-proof.mjs
   node tools/konveyor-production-webgpu-mp-proof.mjs --base-url=http://localhost:3000/
   ```

## Deploy Gate

WebGL remains the default after merge. The deploy acceptance is:

1. GitHub Actions Deploy on `main` is green.
2. `https://sheepdogsim.com/` serves the new commit hash or asset manifest.
3. Default URL still resolves WebGL.
4. `?renderer=webgpu` still resolves production WebGPU on supported desktop
   Chrome and falls back to WebGL on unsupported/device-failure paths.

## Post-Deploy Required Checks

Run the real iOS Safari water canary against the deployed site:

```powershell
$env:IOS_WATER_BASE_URL='https://sheepdogsim.com'
npm run test:ios-water
```

Hard stop: if `nearFoamWhite: true`, do not promote default-renderer policy.
Revert or hotfix the water path before continuing.

After some deployed traffic or explicit probe traffic exists, summarize renderer
telemetry:

```bash
npm run konveyor:renderer-telemetry -- --days=7
```

Use this to review requested/effective renderer, fallback reasons, device
preflight success, production WebGPU success, and scene distribution before any
default policy change.

## Default Renderer Decision

Do not switch the web default from WebGL inside the merge/deploy step. A later
decision can choose one of these policies:

1. Keep WebGL default and leave WebGPU as explicit `?renderer=webgpu`.
2. Add a progressive WebGPU-first default for a narrow supported-browser cohort
   with fail-closed WebGL fallback.
3. Keep web WebGL-default but use the WebGPU route for native or controlled
   capture builds.

The decision must cite the post-deploy iOS canary and renderer telemetry readout.
