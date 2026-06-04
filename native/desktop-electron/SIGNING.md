# Windows Signing Posture

Status: signing-ready scaffold, not a signed release.

The desktop package uses electron-builder with `win.signAndEditExecutable=true` and `forceCodeSigning=false`. Local scripts set `CSC_IDENTITY_AUTO_DISCOVERY=false` so unsigned proof builds are reproducible and do not silently consume a developer-machine certificate.

For a signed Windows release, provide explicit signing credentials in CI before running `npm run desktop:dist`:

```bash
set CSC_LINK=<secure certificate url or base64 pfx>
set CSC_KEY_PASSWORD=<certificate password>
npm run desktop:dist
```

The release handoff must verify Authenticode signatures on both outputs:

```bash
powershell -NoProfile -Command "Get-AuthenticodeSignature cycle54-validation/desktop-electron/artifacts/SheepDogSimulator-2.2.0-setup-x64.exe"
powershell -NoProfile -Command "Get-AuthenticodeSignature cycle54-validation/desktop-electron/artifacts/SheepDogSimulator-2.2.0-portable-x64.exe"
```

Current go/no-go: local unsigned artifacts are acceptable for proof and Steam depot dry-run only. Public Windows distribution should wait for a code-signing certificate or an explicit unsigned-release decision.

Current local Authenticode result: `NotSigned` for the setup executable, portable executable, and unpacked app executable.
