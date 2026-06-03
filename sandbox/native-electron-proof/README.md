# SDS Electron Native Proof

This proof shell is intentionally isolated from the main SDS package. It serves the built `../../dist` artifact through the privileged `sds://app` protocol and does not change the web game runtime.

Commands:

```bash
npm install
cd ../..
npm run build:native
cd sandbox/native-electron-proof
npm run package:win
npm run proof
npm run proof:packaged
npm run proof:packaged -- --renderer=webgl
npm run proof:packaged -- --renderer=webgpu
```

The default proof uses explicit WebGL for deterministic packaged gameplay acceptance. The `--renderer=webgpu` run requires a host/Electron build that can acquire a WebGPU adapter and should resolve to `webgpu-production`.

Proof output is written to `../../cycle53-validation/native/electron/`.
