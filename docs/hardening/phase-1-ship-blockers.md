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
- [ ] While in Settings, the player shall be able to re-trigger the tutorial. Delivered as the exported hook `startTutorial()` from `js/components/Tutorial/index.js` (documented there); P1-SETTINGS-PANEL wires the SettingsPanel.js control (SettingsPanel.js is owned by that task).

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
- **Status:** pending
- **Deps:** P1-MOBILE-WARN (shares the same mobile-notice UI surface)
- **Files:** `index.html:404-457`, renderer boot, a HUD toast component

Acceptance:

- [ ] When the renderer falls back from WebGPU to WebGL, then a non-blocking "compatibility rendering" notice shall be shown and a telemetry event emitted.

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
- **Status:** pending
- **Deps:** none
- **Files:** `js/components/StartScreen/SettingsPanel.js`, `js/components/shared/settings.js:265-277`

Acceptance:

- [ ] When a player opens Settings, then each bindable action shall be remappable and persisted.

---

## [P1-SETTINGS-LANG] Integrate LanguageSelector into Settings

- **Owner hint:** frontend agent
- **Status:** pending
- **Deps:** none
- **Files:** `SettingsPanel.js`, `LanguageSelector.tsx`

Acceptance:

- [ ] When a player opens Settings, then they shall be able to select any implemented language.

---

## [P1-SETTINGS-A11Y] Colorblind / accessibility toggles

- **Owner hint:** frontend agent
- **Status:** pending
- **Deps:** none
- **Files:** `SettingsPanel.js`, `CompletionScreen.tsx:70-73` (hardcoded medal colors)

Acceptance:

- [ ] When colorblind mode is enabled, then medal/rank colors shall use a daltonizer-safe palette.

---

## [P1-SETTINGS-PANEL] Settings panel integration pass

- **Owner hint:** frontend agent
- **Status:** pending
- **Deps:** P1-SETTINGS-REBIND, P1-SETTINGS-LANG, P1-SETTINGS-A11Y
- **Files:** `SettingsPanel.js`

Acceptance:

- [ ] When all settings sub-features land, then the panel shall expose rebinding, language, and accessibility in a single coherent layout with no dead controls.

---

## Gate

- [ ] `npm test` green
- [ ] `npm run build` green
- [ ] A new player is taught (tutorial complete and re-triggerable)
- [ ] The game advertises only the languages it delivers
- [ ] Mobile players are warned, not surprised
- [ ] Sharing works (invite link + Web Share)

Gate result: (record date, commit, and evidence here)
