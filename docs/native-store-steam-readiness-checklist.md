# Native Store and Steam Readiness Checklist

Status: updated in Cycle 109 on 2026-06-26. This is documentation and release-prep evidence only. No Steam submission, App Store submission, Google Play submission, signing, Steamworks feature integration, paid fee, public unsigned release, or default-renderer policy change is authorized.

## Current Recommendation

`wait-for-signing-and-assets`

The v2.4.0 Windows package is technically credible: `npm run desktop:dist`, packaged WebGL proof, and packaged WebGPU proof are green. Steam publication is still blocked by human/account/store work: Steam Direct fee, Steam app setup, signing decision, approved capsule art/screenshots/trailer status, privacy URL, support URL, install/uninstall review, pricing/free-to-play decision, and final store page review.

## Universal Gates

| Gate | Status | Evidence or Next Action |
|---|---|---|
| Native shell boots built `dist/` without source-server coupling | Green | Cycle 109 packaged proofs boot `sds://app` from `cycle109-validation/desktop-electron/artifacts/win-unpacked/resources/dist`. |
| Default launch remains WebGL | Green | Current app defaults to WebGL unless renderer query/env requests WebGPU. |
| Explicit WebGPU launch proof | Green | `npm --prefix native/desktop-electron run proof:webgpu` passed on v2.4.0. |
| WebGL launch proof | Green | `npm --prefix native/desktop-electron run proof:webgl` passed on v2.4.0. |
| Native resize/fullscreen/input/audio/storage | Green | Both packaged proof JSON reports pass resize, fullscreen, pointer lock, keyboard/mouse diff, audio unlock, virtual gamepad API, and localStorage persistence. |
| Worker health and multiplayer socket | Green | Both packaged proof JSON reports include Worker health 200 and authenticated SDS room WebSocket open. |
| Crash/log capture path | Green | Proof writes logs and crash dump directories under proof-specific Electron `userData`. |
| Windows signing | Human-required | Artifacts are `NotSigned`. Decide certificate/signing path or explicit unsigned distribution. |
| Privacy policy URL | Human-required | Must match telemetry, multiplayer, leaderboard, crash log, and third-party data practices. |
| Support URL/email | Human-required | Needed before store submission and public native distribution. |
| Offline/online behavior | Yellow | Solo boot works; multiplayer/leaderboard unavailable copy should be explicitly reviewed before desktop store release. |
| Versioning and changelog | Green | Root and native package metadata are `2.4.0`; changelog has v2.4.0 RC notes. |

## Steam

| Steam Gate | Status | Evidence or Next Action |
|---|---|---|
| Steam Direct fee and app creation | Human-required | Official Steam Direct fee is $100 per product. Matt must pay and create/redeem the app. |
| Store Presence checklist | Human-required | Requires store copy, pricing/free choice, tags, mature content survey, supported OS, language, screenshots, and graphical assets. |
| Store review timing | Human-required | Store page review usually takes 3-5 business days; plan at least 7 business days. |
| Build review timing | Human-required | Build review usually takes 3-5 business days; plan at least 7 business days and submit store presence before build review. |
| Coming Soon timing | Human-required | Steam release docs say the approved store page must be Coming Soon for at least 2 weeks before release. |
| Windows build artifact | Green for private proof | `SheepDogSimulator-2.4.0-setup-x64.exe`, `SheepDogSimulator-2.4.0-portable-x64.exe`, and `win-unpacked/Sheep Dog Simulator.exe` exist locally. |
| Depot/build upload | Human-required | Requires Steam app ID, depot ID, Steamworks SDK/SteamPipe access, and a private upload test. |
| Signing policy | Human-required | Current Windows artifacts are unsigned. |
| Install/uninstall pass | Human-required | NSIS installer exists, but install/uninstall has not been manually exercised in this cycle. |
| Capsule art | Blocked | Current scene captures can inform art, but final Steam capsules are not approved. |
| Screenshots | Yellow | Proof screenshots are technical evidence, not final Steam marketing screenshots. Need five or more approved gameplay screenshots with no marketing overlays. |
| Trailer | Human-required | Decide whether to launch Coming Soon without trailer or capture a short gameplay trailer. |
| Controller notes | Human-required | Gamepad support exists, but Steam input/controller claims need a tested store statement. |
| Cloud saves | Human-required | Current saves/settings are local/browser storage. Decide whether to make no Steam Cloud claim or integrate later. |
| Steamworks SDK features | Deferred | Achievements, Steam Cloud, overlay, rich presence, Steam leaderboards, and Steam networking are not required for first private depot proof. |
| Multiplayer backend | Yellow | Current Cloudflare Worker/Durable Object route works in packaged proof. Store copy should not imply Steam networking. |

## Current Cycle 109 Artifacts

- `cycle109-validation/desktop-electron/artifacts/SheepDogSimulator-2.4.0-setup-x64.exe` - 134,038,407 bytes - `NotSigned`
- `cycle109-validation/desktop-electron/artifacts/SheepDogSimulator-2.4.0-portable-x64.exe` - 133,710,734 bytes - `NotSigned`
- `cycle109-validation/desktop-electron/artifacts/win-unpacked/Sheep Dog Simulator.exe` - `NotSigned`
- `cycle109-validation/desktop-electron/reports/desktop-electron-proof-webgl.json` - `ok: true`
- `cycle109-validation/desktop-electron/reports/desktop-electron-proof-webgpu.json` - `ok: true`

## Non-Steam Stores

Apple App Store, Google Play, Microsoft Store, PWA/TWA, and mobile native wrappers remain future work. Cycle 109 does not authorize those paths. For the immediate launch program, web remains canonical, itch is the first secondary channel, and Steam is a human-reviewed follow-up.

## Handoff

Go for a private Steam app/depot setup only after Matt approves the cost and account actions. No-go for public Steam submission until signing, assets, support/privacy URLs, install/uninstall, pricing, and store page review are complete.
