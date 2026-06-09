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
- **Status:** pending
- **Deps:** none
- **Files:** new `js/components/Tutorial/`, `js/components/entrance/Entrance.tsx`, `js/components/GameHUD/PracticeHint.tsx`, settings flag in `js/components/shared/settings.js`
- **Risk:** medium. Scope to a single biome (Home Field); contextual prompts for move/sprint/camera/pen.

Acceptance:

- [ ] When a player launches for the first time (no `sds:tutorialDone` flag), then an optional ~60s guided herd-3-sheep flow shall be offered.
- [ ] When the player completes or skips it, then the flag shall persist.
- [ ] While in Settings, the player shall be able to re-trigger the tutorial.

---

## [P1-L10N] Localization truth-up

- **Owner hint:** frontend agent. The prose-and-voice rule applies to any copy touched.
- **Status:** pending
- **Deps:** none
- **Files:** `index.html` (hreflang + JSON-LD), `js/locales/`
- **Risk:** low. Default path: strip the 13 unimplemented hreflang/schema entries; flag any the user wants translated instead.

Acceptance:

- [ ] When the site advertises a language via hreflang/schema, then `js/locales/` shall contain a real translation for it, OR the advertisement shall be removed.
- [ ] After this task, the count of advertised languages shall equal the count of implemented locales.

---

## [P1-MOBILE-WARN] Sheep-count guard on mobile

- **Owner hint:** frontend agent
- **Status:** pending
- **Deps:** none
- **Files:** `js/components/StartScreen/`, mode selection / RoomCreation

Acceptance:

- [ ] When a mobile client selects Insane/Chaos (>1000 sheep), then a perf warning shall be shown before the round starts.

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
- **Status:** pending
- **Deps:** none
- **Files:** lobby UI, `js/components/GameHUD/CompletionScreen.tsx`

Acceptance:

- [ ] When in a multiplayer lobby, then a copy-invite-link affordance shall be present.
- [ ] When a run completes, then a Web Share API button shall be wired (with clipboard fallback).

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
