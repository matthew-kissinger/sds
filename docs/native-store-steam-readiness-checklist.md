# Native Store and Steam Readiness Checklist

Status: Cycle 37 checklist draft, 2026-05-16. This is documentation only. No
Steam submission, App Store submission, Google Play submission, signing,
Steamworks feature integration, paid fee, deploy, or default-renderer policy
change is authorized by this cycle.

## Universal Gates

- Native shell proof boots the built SDS `dist/` without source-server coupling.
- Default app launch remains WebGL unless a later explicit renderer policy
  decision changes it.
- Explicit WebGPU launch records device preflight, success/fallback reason, and
  frame-time evidence.
- Field, Rolling Hills, and Open Country all have nonblank screenshots and
  passing frame-time proof.
- Fullscreen, pointer lock, keyboard/mouse, gamepad, audio unlock, storage, and
  WebSocket multiplayer are tested in the shell.
- Crash/log capture path exists and does not require a developer console.
- Privacy policy URL and support URL exist and match actual telemetry,
  multiplayer, and data practices.
- Icons, screenshots, capsule art, and app metadata reflect real gameplay.
- Offline/online behavior is defined: solo boot, multiplayer unavailable state,
  leaderboard unavailable state, and reconnect behavior.
- Versioning and changelog policy are documented for native builds.

## Steam

- Steam Direct / app admin work is not started by this cycle.
- Pick desktop shell first; Steam is not the shell decision.
- Prepare Store Presence checklist inputs: short description, long description,
  genres/tags, capsule art, screenshots, trailer if used, controller notes,
  languages, OS requirements, privacy/support links, and age/content fields.
- Prepare Game Build checklist inputs: Windows build package, launch command,
  depot layout, default branch, build description, save/config directories, and
  install/uninstall behavior.
- Test build outside Steam before any SteamPipe upload.
- Defer Steamworks SDK features until after plain packaged play works:
  achievements, cloud saves, overlay, rich presence, leaderboards, and
  controller API.
- Record whether WebSocket multiplayer needs Steam networking later or can keep
  the Cloudflare Worker/Durable Object route.
- Do not use the Steam release controls without explicit approval.

## Apple App Store

- App Store submission is not started by this cycle.
- Capacitor or another mobile shell must boot SDS on real iOS before metadata
  work becomes meaningful.
- Bundle identifier, signing certificates, provisioning profiles, Xcode build,
  and TestFlight flow are future work.
- App metadata must accurately reflect gameplay, screenshots, previews, input,
  multiplayer, and any network requirement.
- Privacy Nutrition Label answers must match SDS telemetry, leaderboard,
  multiplayer, third-party SDK, crash log, and analytics behavior.
- Support URL and privacy policy URL are required before submission work.
- Safe areas, orientation, touch latency, audio unlock, storage, and WebSocket
  behavior must be tested on current iOS hardware.
- Do not add in-app purchases, subscriptions, Game Center, Sign in with Apple,
  or tracking prompts without a separate approved plan.

## Google Play

- Google Play submission is not started by this cycle.
- Capacitor Android or TWA proof must boot SDS on real Android before store prep
  becomes meaningful.
- Package name, signed release artifact, Play App Signing, keystore handling,
  AAB output, and release track choice are future work.
- Data Safety answers must match SDS telemetry, leaderboard, multiplayer,
  third-party SDK, crash log, and analytics behavior.
- High-risk or sensitive permissions should stay out of scope unless a later
  native feature requires them and is approved.
- Store listing needs icon, feature graphic, screenshots, descriptions, content
  rating, target audience, privacy policy, support contact, and testing notes.
- Test at least one mid-range and one high-end Android device for touch latency,
  audio unlock, storage, WebSocket multiplayer, and renderer fallback.

## PWA / TWA / Store Wrapper

- PWA/TWA packaging is optional and secondary to a real app-shell proof.
- Web manifest needs app name, short name, icons, screenshots, theme/background
  colors, display mode, start URL, and scope aligned to `sheepdogsim.com`.
- Service-worker behavior must be explicit for web/PWA versus native package
  builds.
- Android TWA requires Digital Asset Links from the package to the web origin.
- Microsoft Store PWA packaging requires PWABuilder-style package validation and
  Microsoft Partner Center metadata if pursued.
- PWA updates are web-origin updates; manifest/package metadata changes can
  require package resubmission depending on store.

## Native Shell Handoff

The next implementation cycle should start with one isolated Windows Electron
proof folder, then run the same built `dist/` in a Tauri WebView2 proof folder.
Only after that comparison should the repo pick a primary desktop shell or move
to Capacitor mobile proof.
