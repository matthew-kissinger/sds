# Phase 1 - Player-Facing Ship Blockers

> **Rationale:** This is the "is it a real game" phase. Tutorial is the long
> pole and has no deps, so it starts immediately and runs alongside everything
> else.

## DAG

```
P1-TUTORIAL ──────────────── (long pole, independent)
P1-L10N ──────────────────── (independent)
P1-MOBILE-WARN ─→ P1-MOBILE-FALLBACK
P1-SHARE ─────────────────── (independent)
P1-SETTINGS-REBIND ─┐
P1-SETTINGS-LANG ───┼─→ P1-SETTINGS-PANEL (integration)
P1-SETTINGS-A11Y ───┘
```

---

## [P1-TUTORIAL] Interactive first-run flow

- **Owner hint:** frontend + gameplay agent
- **Status:** done (2026-06-09). New `js/components/Tutorial/` (tutorialMachine.js pure state machine, startTutorial.js controller, TutorialOverlay.tsx prompts, TutorialOffer.tsx entrance card); minimal mounts in `Entrance.tsx` (offer card) and `PracticeHint.tsx` (stands down while a tutorial run is live). Persistence is the `sds:tutorialDone` localStorage key read/written defensively in tutorialMachine.js (no settings.js flag needed). The tutorial rides the standard Just Play start path (`menuController.selectSolo(dog, 'practice')` on `field`) with prompts layered on top; steps advance off real input per frame (InputHandler isMoving/isSprinting, camera-mode change, `gameState.sheepRetired >= 3`).
- **Deps:** none
- **Files:** new `js/components/Tutorial/`, `js/components/entrance/Entrance.tsx`, `js/components/GameHUD/PracticeHint.tsx`, `js/locales/en/index.js` (`tutorial.*`), `tests/ui/tutorialMachine.spec.ts`, `tests/ui/TutorialOffer.spec.tsx`, `tests/ui/locale.parity.spec.ts` (allowlist)
- **Risk:** medium. Scope to a single biome (Home Field); contextual prompts for move/sprint/camera/pen.

Acceptance:

- [x] When a player launches for the first time (no `sds:tutorialDone` flag), then an optional ~60s guided herd-3-sheep flow shall be offered. Evidence: Playwright preview smoke on a fresh profile showed the offer card at the entrance; "Show me" built Home Field, started Just Play, and walked move -> sprint -> camera -> herd prompts on real W / Shift / C input. Unit: `tests/ui/TutorialOffer.spec.tsx`, `tests/ui/tutorialMachine.spec.ts`.
- [x] When the player completes or skips it, then the flag shall persist. Evidence: browser smoke ("Skip tutorial" set the flag to '1', overlay root unmounted, reload showed no offer); machine spec covers complete-persists, skip-persists, and abandon-does-not.
- [x] While in Settings, the player shall be able to re-trigger the tutorial. Delivered as the exported hook `startTutorial()` from `js/components/Tutorial/index.js` (documented there); P1-SETTINGS-PANEL wired it 2026-06-09: the Settings General tab's "Replay tutorial" button leaves Settings (`onBack()`, back to the entrance) and calls `startTutorial()` with no arguments, so the standard scene swap + start-surface unmount take over.

Validation 2026-06-09: `npm run lint`, `npm run typecheck`, `npm test` (1216 passed, 8 skipped), `npm run build` all green.

---

## [P1-L10N] Localization truth-up

- **Owner hint:** frontend agent. The prose-and-voice rule applies to any copy touched.
- **Status:** done (2026-06-09, uncommitted working tree)
- **Deps:** none
- **Files:** `index.html` (hreflang + JSON-LD), `js/locales/`
- **Risk:** low. Default path: strip the 13 unimplemented hreflang/schema entries; flag any the user wants translated instead.

Acceptance:

- [x] When the site advertises a language via hreflang/schema, then `js/locales/` shall contain a real translation for it, OR the advertisement shall be removed.
- [x] After this task, the count of advertised languages shall equal the count of implemented locales.

Result:

- Implemented locales (key count vs en's 311): en 311, es 264, ja 264, zh-CN 264, pt 246. All four translations are real (79-85% coverage, missing only recent feature keys; i18next falls back to en). No stubs found.
- Removed from `index.html` (13 unimplemented languages: de, fr, ko, ru, it, tr, pl, nl, ar, id, hi, th, fil):
  - 13 `hreflang` link tags (kept en, es, pt, ja, zh-CN, x-default; comment updated).
  - 13 entries from both JSON-LD `inLanguage` arrays (VideoGame + WebApplication blocks).
  - 13 `availableLanguage` Language objects in the VideoGame JSON-LD.
  - 13 `og:locale:alternate` meta tags (kept es_ES, pt_BR, ja_JP, zh_CN).
- Kept as-is: `js/i18n.js` LANGUAGES list and the `resources` map (already exactly the 5 implemented locales; stale "18 hreflang locales" comment refreshed), `LanguageSelector.tsx` (enumerates from LANGUAGES, no hardcoded list), README.md / PRESSKIT.md (already claim 5 languages), sitemap / scenes pages / llms.txt (no language advertisements found).
- Validation: lint, typecheck, test (1178 passed, 8 skipped), build all green. No em-dashes or stale biome framing introduced.
- Note: a later re-run showed 4 failures in `tests/ui/locale.parity.spec.ts`, tripped by new `completion.share.*` en keys landed mid-flight by the parallel P1-SHARE session (its allowlist update is owed there). Not caused by this task; the P1-L10N change set touches no locale files.

---

## [P1-MOBILE-WARN] Sheep-count guard on mobile

- **Owner hint:** frontend agent
- **Status:** done (2026-06-09)
- **Deps:** none
- **Files:** `js/components/StartScreen/`, mode selection / RoomCreation

Acceptance:

- [x] When a mobile client selects Insane/Chaos (>1000 sheep), then a perf warning shall be shown before the round starts.

Result:

- Solo entry point (the world-first entrance, not StartScreen - the old mode-selection leaves retired in Cycle 51): Play in `js/components/entrance/Entrance.tsx` now routes through `shouldWarnMobileSheep()` (`js/utils/mobileSheepWarning.js`, threshold >1000, reuses `js/utils/isMobileClient.js` - no new UA sniffer). When it fires, `js/components/entrance/MobilePerfWarning.tsx` (new, entrance glass styling) names the sheep count and offers "Continue anyway" (commits the round - player choice wins, never a permanent block) or "Go back". Counting runs are exempt (5,000 ceiling but they start at one sheep). Survival (10) and all <=1000 rungs never trigger.
- Multiplayer entry point: verified the worker already rejects EVERY mobile client (host included, UA check) at the WS upgrade for rooms over 1000 sheep (`worker/src/RoomDO.ts` `MOBILE_GUEST_MAX_SHEEP_COUNT`), so a mobile client cannot actually start a >1000 round there. Per spec, noted instead of adding a dead continue-anyway dialog: `RoomCreation.js` now shows a mobile host picking Insane/Chaos a first-person notice (this device cannot join the room it creates) in place of the desktop-host guest notice.
- Strings localized in all 5 locales (`mobileWarning.*` + `multiplayer.mobileHostHighSheep` in en/es/ja/pt/zh-CN; real translations, parity ratchet untouched). Interpolation uses `{{sheep}}` because i18next reserves `count` for plurals.
- Spec: `tests/ui/MobilePerfWarning.spec.tsx` (8 tests: gate fires mobile+3000/5000, not at <=1000 / desktop / counting; dialog renders both choices; continue fires onContinue, go back fires onBack only).
- Validation: lint clean, typecheck clean, `npm test` 1199 passed / 8 skipped (includes parallel sessions' in-flight work), build green.

---

## [P1-MOBILE-FALLBACK] Surface the WebGPU to WebGL fallback

- **Owner hint:** frontend agent
- **Status:** done (2026-06-09, uncommitted working tree)
- **Deps:** P1-MOBILE-WARN (shares the same mobile-notice UI surface)
- **Files:** new `js/rendering/rendererFallbackNotice.js`, `js/main.js` (boot wiring), `js/locales/*/index.js` (`rendererFallback.*`), `tests/ui/rendererFallbackNotice.spec.ts`

Acceptance:

- [x] When the renderer falls back from WebGPU to WebGL, then a non-blocking "compatibility rendering" notice shall be shown and a telemetry event emitted.

Result:

- Detection point: the renderer decision is already centralized in `window.__sdsRendererMode` (written by the `index.html` boot shim ~365-418, the `js/main.js` production-WebGPU boot catch ~3393-3403, and `QualityGovernor._recordFallback`). New `js/rendering/rendererFallbackNotice.js` reads it once per page load from the `DOMContentLoaded` boot in `main.js`, right after `emitRendererModeTelemetry` (lazy import, nothing added to the critical boot chunk).
- Involuntary-only gate (pure function `decideRendererFallbackNotice`): notify iff `effective === 'webgl'` AND a fallback reason exists (`rendererMode.fallbackReason`, or `?fallbackReason=` from the QualityGovernor auto-fallback reload). Explicit `?renderer=webgl` and the experimentalWebGpu settings opt-out produce no reason, so they stay silent. Covered reasons: webgpu-unavailable, webgpu-adapter-unavailable, webgpu-device-unavailable, webgpu-device-request-failed, production-webgpu-boot-failed, webgpu-frame-budget.
- Notice surface: a self-dismissing 9s vanilla-DOM toast (top center, warm-glass styling via the pastoral CSS tokens, `role="status"`, `pointer-events: none` so it never blocks input). Vanilla on purpose: it fires from the main.js boot path independent of the lazy React overlay, and App.js was owned by another session. Once per session via the `sds:rendererFallbackNoticed` sessionStorage guard (defensive reads, private-mode safe), so scene swaps and soft reloads do not re-toast.
- Telemetry: one `renderer_fallback` event through the existing fire-and-forget `/api/event` path: `{ reason, requested, webgpuApiAvailable }` (build/ua context handled server-side, same as other events).
- Strings localized in all 5 locales (`rendererFallback.title` / `.body` in en/es/ja/pt/zh-CN, real translations; parity ratchet allowlists untouched). En copy: "Compatibility rendering" / "Running the WebGL renderer on this browser. The game plays the same; some visual detail is reduced."
- Spec: `tests/ui/rendererFallbackNotice.spec.ts` (13 tests: decision matrix incl. auto-fallback reload URL signal and reason precedence; orchestrator notifies+emits exactly once per session, explicit webgl never fires, throwing storage/toast/telemetry sinks never crash the boot).
- Validation 2026-06-09: `npm run lint`, `npm run typecheck`, `npm test` (1229 passed, 8 skipped), `npm run build` all green.

---

## [P1-SHARE] Share/virality surfaces

- **Owner hint:** frontend agent
- **Status:** done (2026-06-09)
- **Deps:** none
- **Files:** lobby UI, `js/components/GameHUD/CompletionScreen.tsx`

Acceptance:

- [x] When in a multiplayer lobby, then a copy-invite-link affordance shall be present.
- [x] When a run completes, then a Web Share API button shall be wired (with clipboard fallback).

Result:

- Already existed: `Lobby.js` had a copy-invite-link button building `${location.origin}#/r/<code>` (the hash `App.js:314` handles on boot), but with bare `navigator.clipboard.writeText` (no fallback) and hardcoded English strings ("Link copied!" violated the prose rule).
- Added: shared `js/components/shared/clipboard.js` (`copyTextToClipboard`: Clipboard API first, hidden-textarea `execCommand('copy')` fallback). Both lobby copy buttons (room code + invite link) now route through it; strings localized (`lobby.copyInviteLink` / `lobby.inviteLinkCopied`).
- Added: completion share button (`CompletionScreen.tsx`) using `navigator.share` (title + text + url) with the clipboard fallback writing text + `https://sheepdogsim.com`; a dismissed share sheet (AbortError) is a no-op. Share text comes from the pure builder `js/components/GameHUD/shareText.ts` (per-mode concrete results: single = sheep + mm:ss, counting = total + round, racing/timed = win/score with myScore, cooperative = team total; no em-dashes, no exclamation marks). New `share` glyph in `ui/Icon.tsx`.
- Localized: all 11 new keys translated into es / ja / pt / zh-CN (locale parity ratchet kept, allowlist untouched).
- Tests: `tests/ui/shareText.spec.ts` (8 tests, builder + prose-rule guard against real en strings) and `tests/ui/clipboard.spec.ts` (5 tests, both paths + failure modes, mocked navigator/execCommand).
- Validation: lint clean, typecheck clean (a mid-flight `MobilePerfWarning.tsx` error from the parallel P1-MOBILE-WARN session resolved before close), test 1199 passed / 8 skipped, build green.

---

## [P1-SETTINGS-REBIND] Finish key-rebinding UI

- **Owner hint:** frontend agent
- **Status:** done (2026-06-09, uncommitted working tree)
- **Deps:** none
- **Files:** `js/components/StartScreen/SettingsPanel.js`, `js/components/shared/settings.js`, `js/InputHandler.js`, `js/locales/*/index.js`, `tests/ui/keyBindings.spec.ts`

Acceptance:

- [x] When a player opens Settings, then each bindable action shall be remappable and persisted. Evidence: `tests/ui/keyBindings.spec.ts` (13 tests: full action set, persistence round-trip incl. stale-set merge, conflict detection, `keybindings-changed` dispatch, InputHandler camera-cycle + movement rebind consumption).

Result:

- What existed: a working click-to-capture rebinder in SettingsPanel.js (Controls tab) over `settings.keyBindings`, with conflict rejection (`isKeyAlreadyBound`, 2s feedback), reset-to-defaults, persistence via `saveSettings` + the `keybindings-changed` event InputHandler consumes. The gap: the bindable set in settings.js was only move x4 / sprint / pause, while the input layer also reads `bark` (Space, one-shot, Cycle 61 P3) and had the camera-cycle hotkey hardcoded to `KeyC`.
- Action list (now the full set the input layer reads from settings): moveUp, moveDown, moveLeft, moveRight, sprint, bark, cameraCycle, pause. Move keys were never hardcoded (InputHandler resolves every movement key through `codeToAction`), so no gap there.
- `settings.js`: DEFAULT_KEY_BINDINGS gained `bark: 'Space'` and `cameraCycle: 'KeyC'`; `isKeyAlreadyBound` accepts an explicit bindings object so the panel checks the live React state, not a stale persisted read. `loadSettings` already merges defaults, so pre-existing saved settings pick the two new actions up automatically.
- `js/InputHandler.js`: DEFAULT_BINDINGS gained `cameraCycle: 'KeyC'`; the camera-cycle keydown branch reads `this.keyBindings.cameraCycle` instead of the hardcoded `'KeyC'`. Bark was already binding-driven.
- Rebind capture hardening: the panel's capture listener moved to the capture phase with stopPropagation (so an armed rebinder's keypress cannot reach InputHandler and toggle pause or queue a bark), and Escape now cancels the capture instead of binding (Escape stays the hardwired pause fallback in InputHandler regardless of the pause binding - noted as intended).
- Conflict policy: reject-with-feedback kept (localized `settings.keyConflict`), not swap.
- Out of scope, noted: the `KeyP` performance-monitor toggle stays hardcoded (debug surface, not player-facing); `mouseSensitivity` remains a persisted-but-unconsumed settings field (no panel control, nothing reads it).

---

## [P1-SETTINGS-LANG] Integrate LanguageSelector into Settings

- **Owner hint:** frontend agent
- **Status:** done (2026-06-09, uncommitted working tree)
- **Deps:** none
- **Files:** `SettingsPanel.js` (`LanguageSelector.tsx` reused unchanged)

Acceptance:

- [x] When a player opens Settings, then they shall be able to select any implemented language. Evidence: the shared `LanguageSelector` (variant 'full', enumerates `LANGUAGES` from `js/i18n.js`, exactly the 5 implemented locales per P1-L10N) heads the new General tab.

Result:

- What existed: `LanguageSelector` was already mounted in the panel, but buried mid-way down the Audio tab (with the display-name field and profile reset, none of which are audio). No logic duplicated; the component moved to the top of the General tab under a localized "Language" section header, and the Audio tab now holds only audio controls.

---

## [P1-SETTINGS-A11Y] Colorblind / accessibility toggles

- **Owner hint:** frontend agent
- **Status:** done (2026-06-09, uncommitted working tree)
- **Deps:** none
- **Files:** `SettingsPanel.js`, new `js/components/shared/medalColors.ts`, `CompletionScreen.tsx`, `js/components/shared/settings.js` (`colorblindMode` default), `tests/ui/medalColors.spec.ts`

Acceptance:

- [x] When colorblind mode is enabled, then medal/rank colors shall use a daltonizer-safe palette. Evidence: `tests/ui/medalColors.spec.ts` (6 tests: palette switch, Okabe-Ito hues, silver neutrality, default palette unchanged).

Result:

- New setting `colorblindMode` (default false), toggled under Accessibility in the Settings General tab, persisted through the existing `sds-settings` path.
- New `js/components/shared/medalColors.ts`: the hardcoded `MEDAL_COLORS` moved out of `CompletionScreen.tsx:71-75` as `DEFAULT_MEDAL_COLORS` (byte-identical values), plus `COLORBLIND_MEDAL_COLORS` on the Okabe-Ito palette - gold -> #E69F00 orange, silver stays neutral grey (already safe), bronze -> #56B4E9 sky blue - and a `useColorblindMode()` hook (reads the persisted setting, tracks the `settings-changed` CustomEvent the panel dispatches, so an already-mounted screen updates live).
- `RankBadge` in CompletionScreen picks the palette per render. Shape/text differentiation was already present (the badge always renders the rank number), so color is never the only signal.
- Other hardcoded rank colors: a repo grep for the medal hexes (#FFD700 / #CD7F32 / #C0C0C0 / #FFA500 / #E8E8E8 / #B8B8B8) found only CompletionScreen. The remaining `#C0C0C0` there tints the runner-up medal/timer glyph - neutral silver, distinguishable as-is, left alone.

---

## [P1-SETTINGS-PANEL] Settings panel integration pass

- **Owner hint:** frontend agent
- **Status:** done (2026-06-09, uncommitted working tree)
- **Deps:** P1-SETTINGS-REBIND, P1-SETTINGS-LANG, P1-SETTINGS-A11Y
- **Files:** `SettingsPanel.js`, `js/locales/*/index.js`, `tests/ui/locale.parity.spec.ts` (allowlist shrink)

Acceptance:

- [x] When all settings sub-features land, then the panel shall expose rebinding, language, and accessibility in a single coherent layout with no dead controls.

Result:

- Layout: four tabs. Graphics (presets, WebGPU, shadows, stats - unchanged), Audio (audio toggle + volume only), Controls (camera-mode picker, full 8-action rebinder, gamepad note), General (Language / Accessibility / Tutorial / Player profile sections).
- Replay tutorial: General tab button wired to the P1-TUTORIAL `startTutorial()` hook. Per its contract (no arguments; it drives the Home Field swap + Just Play start itself, and the start surface unmounts when the run goes live), the button calls `onBack()` first so Settings closes to the entrance and the standard scene-swap overlay is what the player watches.
- Dead/misleading controls fixed: the "Reset & re-run onboarding" button referenced an onboarding flow removed in Cycle 51 (clearing `playerIdentity` just regenerates an auto identity on reload). Reworked as "Reset profile" with honest copy (new identity on reload; stats and bindings stay), localized confirm. Every other control was verified live against its consumer (renderer reload, shadow map, pixel ratio, stats monitor, audio manager, camera-mode event, bindings event).
- Hardcoded English removed: camera-mode picker labels/descs, the camera section header (now interpolates the live camera-cycle binding instead of claiming "press C"), profile section, and the "About this game" footer link are all localized.
- Localization: 21 new `settings.*` keys added to en and really translated in es/ja/pt/zh-CN; additionally the 23 previously-allowlisted `settings.*` keys (tabs, actions, rebinder strings, shadow strings, gamepad note) were translated in all four locales so the panel is fully localized, and the parity-ratchet allowlists shrank accordingly (`tests/ui/locale.parity.spec.ts`). No em-dashes, exclamation marks, or emoji in any new string.

Validation 2026-06-09 (all four P1-SETTINGS tasks): `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` - results recorded by the session close.

---

## Gate

- [x] `npm test` green
- [x] `npm run build` green
- [x] A new player is taught (tutorial complete and re-triggerable)
- [x] The game advertises only the languages it delivers
- [x] Mobile players are warned, not surprised
- [x] Sharing works (invite link + Web Share)

Gate result: PASSED 2026-06-09. npm test 1248 passed / 8 skipped (67 new
tests this phase), lint clean, typecheck clean, build green. Tutorial
verified in a Playwright browser smoke on a fresh profile (offer, guided
steps on real input, skip persistence). Wave 1 commit fdd820a (tutorial,
l10n, mobile warning, share); wave 2 commit (settings panel, fallback
notice). Deferred notes: non-en tutorial translations ride the parity
allowlist; mouseSensitivity is a dead settings field flagged in
[P1-SETTINGS-PANEL]; settings panel browser smoke recommended at next
paired session.
