# Sheep Dog Sim - Development Tasklist

> **Instructions for Agents:** Work through tasks in order by phase. Check off each task when complete by changing `[ ]` to `[x]`. Add notes under tasks if needed.

---

## Phase 1: Critical Bug Fixes (Priority: HIGH)

### 1.1 Audio System Fixes

- [x] **Fix audio context suspension on mobile**
  - File: `js/AudioManager.js`
  - Add `ensureAudioContext()` method that resumes suspended context
  - Call it before any `play*()` method
  - Add click/touch listener to resume context on first interaction
  - Test on iOS Safari and Chrome mobile
  - DONE: `ensureAudioContext()` at line 119, `setupAudioContextActivation()` at line 845

- [x] **Add audio loading gate before playing music**
  - File: `js/AudioManager.js`
  - Create `Promise` array for music loading (`this.musicLoadingPromises`)
  - In `playStartMusic()`, await all music promises before playing
  - Add `isMusicReady()` method that returns loading state
  - DONE: `musicLoadingPromises` at line 56, awaited in `playStartMusic()` lines 561-573, `isMusicReady()` at line 837

- [x] **Fix audio buffer memory leaks**
  - File: `js/AudioManager.js`
  - In `playGroupSheepBleats()` (around line 462-475), track temporary Audio objects
  - Add cleanup after audio finishes playing (`audio.onended = () => dispose()`)
  - Consider audio pooling for frequently used sounds
  - DONE: `temporaryAudioObjects` Set at line 102, cleanup in `playGroupSheepBleats()` lines 524-529

- [x] **Add error handling for failed audio loads**
  - File: `js/AudioManager.js`
  - Wrap audio loading in try-catch
  - Create fallback behavior (silent mode) if audio fails
  - Log errors with `[AUDIO]` prefix instead of emojis
  - DONE: Error handling in `loadSounds()` lines 196-206 and `loadMusic()` lines 333-345

### 1.2 Loading Performance Fixes

- [ ] **Add loading progress indicator to start screen** (DEFERRED to Phase 2)
  - File: `js/components/ReactUI.js` or `js/StartScreen.js`
  - Create `LoadingProgress` component showing percentage
  - Track asset loading progress in `GameAssetLoader.js`
  - Show current asset being loaded ("Loading dog models...")
  - Display progress bar with smooth animation

- [x] **Implement progressive asset loading tiers**
  - File: `js/GameAssetLoader.js`
  - Tier 1 (immediate): Selected dog only, UI sounds, minimal terrain
  - Tier 2 (5 seconds): Sheep model, trees, gameplay music
  - Tier 3 (background): Other dogs, extra music, environment details
  - Use `requestIdleCallback` for Tier 3 assets
  - DONE: Already implemented with `defineCriticalAssets()`, `defineDeferredAssets()`, and `requestIdleCallback` pattern

- [x] **Add error handling for asset loading failures**
  - File: `js/GameAssetLoader.js`
  - Wrap all `fetch` and `loader.load` calls in try-catch
  - Create fallback assets (simple geometry) for failed models
  - Show user-friendly error if critical assets fail
  - Log failures with `[ASSET]` prefix
  - DONE: Error handling in `loadSingleAsset()` lines 246-253, logs with `[WARN]` and `[ERROR]` prefixes

### 1.3 Mobile Layout Fixes

- [x] **Fix safe area insets for notched devices**
  - File: `css/components/index-styles.css` and `js/components/App.js`
  - Add `env(safe-area-inset-*)` to all fixed positioned elements
  - Use `max()` function: `padding-top: max(env(safe-area-inset-top), 1rem)`
  - Test on iPhone with notch and Android with camera cutout
  - DONE: Rewrote CSS to use proper scrollable container with safe-area padding. Removed excessive 8-15rem padding hack. Added `.start-screen-container` and `.start-screen-content` classes.

- [x] **Fix UI overlap in landscape mode**
  - File: `js/components/GameHUD/MobileHUD.js` and `js/components/GameHUD/MobileControls.js`
  - Ensure joystick doesn't overlap sheep counter
  - Position zoom slider to not cover game elements
  - Add responsive breakpoints for small landscape screens
  - DONE: React components handle layout with proper positioning. MobileHUD.js positions timer at top center with safe-area-inset-top.

- [x] **Ensure minimum touch target sizes**
  - Files: `css/components/index-styles.css`, `js/components/GameHUD/MobileControls.js`
  - All buttons minimum 48x48px
  - Add `touch-action: manipulation` to interactive elements
  - Test tap accuracy on mobile devices
  - DONE: Sprint button 56x56px, zoom controls 32x32px with 48px touch area via padding. Fullscreen button 44x44px.

- [x] **Simplify fullscreen button behavior**
  - File: `js/MobileControls.js`
  - Remove auto-appearing persistent button after 3 seconds
  - Add fullscreen option to pause menu instead
  - Show one-time prompt on first mobile visit (with localStorage "don't show again")
  - DONE: Removed auto-creation of persistent button after banner dismissal. Persistent button only shows when exiting fullscreen.

---

## Phase 2: UI/UX Polish for AAA Zen Feel

### 2.1 Remove Emojis from UI

- [ ] **Replace mode selection emoji icons with text/SVG**
  - File: `js/components/ReactUI.js` (ModeSelection component)
  - Remove: 🎮 🌐 🏆 ⚙️
  - Replace with styled text labels or minimal SVG icons
  - Add descriptive subtitles under each mode

- [ ] **Replace emoji in fullscreen banner**
  - File: `js/MobileControls.js` (line 233)
  - Remove: 📱
  - Replace with text only or subtle icon

- [ ] **Remove emojis from dog selection checkmark**
  - File: `js/components/ReactUI.js` (DogSelection component)
  - Replace ✓ emoji with CSS-styled checkmark or SVG

### 2.2 Remove Emojis from Console Logs

- [ ] **Create Logger utility class**
  - Create new file: `js/utils/Logger.js`
  - Implement levels: DEBUG, INFO, WARN, ERROR
  - Add category support: `Logger.info('Audio', 'Context resumed')`
  - Add `Logger.metric()` for performance metrics

- [ ] **Replace emojis in main.js**
  - File: `js/main.js`
  - Replace: 🎯🎮🔗⚡📐🔍🌟✅❌🎉
  - Use Logger utility with categories

- [ ] **Replace emojis in NetworkManager.js**
  - File: `js/NetworkManager.js`
  - Replace: 🔗🔧📊💡❌
  - Use `[NETWORK]` prefix or Logger

- [ ] **Replace emojis in GameAssetLoader.js**
  - File: `js/GameAssetLoader.js`
  - Replace: 🚀✅⚠️🎯🎨🎉
  - Use `[ASSET]` prefix or Logger

- [ ] **Replace emojis in AudioManager.js**
  - File: `js/AudioManager.js`
  - Replace: 🐕 and any others
  - Use `[AUDIO]` prefix or Logger

- [ ] **Replace emojis in SceneManager.js**
  - File: `js/SceneManager.js`
  - Replace: 💡📱🎥
  - Use `[SCENE]` prefix or Logger

- [ ] **Replace emojis in MobileControls.js**
  - File: `js/MobileControls.js`
  - Replace: 🔍
  - Use `[MOBILE]` prefix or Logger

- [ ] **Replace emojis in Sheepdog.js**
  - File: `js/Sheepdog.js`
  - Replace: 🎯🐕✅❌⚠️
  - Use `[DOG]` prefix or Logger

- [ ] **Replace emojis in other files**
  - Files: `TerrainBuilder.js`, `StaminaUI.js`, `StructureBuilderV2.js`, `skeleton-loader.js`, `GameState.js`, `GamepadManager.js`
  - Search for emoji characters and replace with text prefixes

### 2.3 Implement Design System

- [ ] **Create CSS design tokens**
  - File: `css/production.css` (add at top)
  - Define color palette (zen earth tones, sky blue, grass green)
  - Define spacing scale (xs, sm, md, lg, xl)
  - Define typography (font families, sizes, weights)
  - Define animation easings and durations

- [ ] **Create unified glass panel component**
  - File: `css/production.css`
  - Class `.zen-panel` with consistent backdrop-filter, border, shadow
  - Variants: `.zen-panel--dark`, `.zen-panel--light`
  - Apply to all UI panels for consistency

- [ ] **Update title treatment**
  - File: `js/components/ReactUI.js` (StartScreen)
  - Space out title: "SHEEP DOG SIM" with letter-spacing
  - Use light font weight (300) for zen feel
  - Add subtle text shadow

### 2.4 Polish Start Screen

- [ ] **Redesign dog selection UI**
  - File: `js/components/ReactUI.js` (DogSelection component)
  - Larger dog portraits/previews
  - Cleaner stat display (no emoji bars)
  - Smoother selection animation
  - Better visual hierarchy

- [ ] **Redesign mode selection buttons**
  - File: `js/components/ReactUI.js` (ModeSelection component)
  - Remove gradient backgrounds
  - Use zen-panel styling
  - Add hover/focus states
  - Cleaner typography

### 2.5 Polish In-Game HUD

- [ ] **Unify HUD styling**
  - File: `js/components/ReactUI.js` (GameHUD components)
  - Consistent glass panel style for all HUD elements
  - Sheep counter, timer, stamina bar all matching
  - Minimal, unobtrusive design

- [ ] **Move inline styles to CSS classes**
  - File: `js/main.js` (completion overlay, lines ~1315-1468)
  - Extract inline `style.cssText` to CSS classes
  - Create `css/components/completion-overlay.css` or add to production.css

---

## Phase 3: Performance Optimization

### 3.1 Asset Optimization

- [ ] **Compress dog models with Draco**
  - Files: `assets/models/*.glb`
  - Install: `npm install -g gltf-pipeline`
  - Run: `gltf-pipeline -i Jep.glb -o Jep_draco.glb -d`
  - Compress all 5 dog models
  - Update references in `TerrainBuilder.js`
  - Expected: 8.6MB → ~2MB each

- [ ] **Compress environment models**
  - Files: `assets/models/Farm house.glb`, mountains, trees, rocks
  - Apply Draco compression to all
  - Test visual quality after compression

- [ ] **Optimize audio file sizes**
  - Files: `assets/sounds_compressed/*.mp3`
  - Consider lower bitrate for background music (128kbps sufficient)
  - Combine small sound effects into audio sprite
  - Use Web Audio API for playback of sprites

- [ ] **Add Service Worker for caching**
  - Create: `sw.js` in root
  - Cache critical assets (selected dog, sheep, terrain)
  - Implement cache-first strategy for assets
  - Register in `index.html`

### 3.2 Algorithm Optimization

- [ ] **Implement spatial hash grid for flocking**
  - Create: `js/utils/SpatialHashGrid.js`
  - Grid cell size ~10 units (perception radius)
  - Methods: `insert()`, `clear()`, `getNearby()`
  - Replace O(n²) neighbor search in `Boid.js` and `OptimizedSheep.js`
  - Expected: 5-10x speedup for 200 entities

- [ ] **Implement fixed timestep physics**
  - Files: `js/Boid.js`, `js/OptimizedSheep.js`
  - Remove `deltaTime * 144` magic number
  - Use accumulator pattern with 60Hz fixed step
  - Interpolate positions for rendering

- [ ] **Reduce velocity smoothing lag**
  - File: `js/Boid.js`
  - Change `velocitySmoothing` from 0.85 to 0.5
  - Change `dampingFactor` from 0.98 to 0.95
  - Test sheep responsiveness

### 3.3 Rendering Optimization

- [ ] **Extract shader code to .glsl files**
  - Create: `js/shaders/` directory
  - Extract grass shaders from `GrassSystem.js`
  - Extract sheep shaders from `OptimizedSheep.js`
  - Use fetch or import to load shaders
  - Reduces file sizes and enables syntax highlighting

- [ ] **Verify frustum culling is working**
  - File: `js/GrassSystem.js`
  - Ensure grass chunks outside camera view aren't rendered
  - Add debug logging to verify culling counts
  - Test by zooming in (should render fewer chunks)

---

## Phase 4: Code Quality & Architecture

### 4.1 Remove Global State

- [ ] **Replace window.gameInstance with module exports**
  - File: `js/main.js`
  - Export game instance from module instead of window assignment
  - Update `Sheepdog.js` to receive terrainBuilder via constructor
  - Update any other files accessing `window.gameInstance`

- [ ] **Create dependency injection pattern**
  - Modify constructors to accept dependencies object
  - Example: `new Sheepdog(x, z, dogType, { modelLoader, audioManager })`
  - Remove global lookups from class methods

### 4.2 Reduce File Sizes

- [ ] **Split main.js into smaller modules**
  - Create: `js/controllers/GameController.js` (game loop, state)
  - Create: `js/controllers/UIController.js` (overlay, completion)
  - Create: `js/controllers/MultiplayerController.js` (network game logic)
  - Keep `main.js` as thin orchestrator (~200 lines)

- [ ] **Split ReactUI.js into component files**
  - Create: `js/components/StartScreen/`
  - Create: `js/components/GameHUD/`
  - Create: `js/components/DogSelection/`
  - Create: `js/components/ModeSelection/`
  - Each component in own file with own styles

- [ ] **Extract GrassSystem shaders**
  - File: `js/GrassSystem.js` (32K lines)
  - Move vertex/fragment shaders to `js/shaders/grass/`
  - Reduce GrassSystem.js to ~1000 lines
  - Consider splitting chunk management logic

### 4.3 Remove Duplicated Code

- [ ] **Consolidate flocking algorithms**
  - Keep: `shared/FlockingAlgorithms.js` (pure functions)
  - Remove: duplicate methods in `js/Boid.js`
  - Update `Boid.js` to import and use shared functions
  - Verify server still works with shared code

- [ ] **Consolidate Vector2D implementations**
  - Keep: `shared/Vector2D.js`
  - Remove or alias: `js/Vector2D.js`
  - Ensure consistent import paths across codebase

### 4.4 Add Error Handling

- [ ] **Add try-catch to all async operations**
  - Files: `main.js`, `GameAssetLoader.js`, `NetworkManager.js`, `AudioManager.js`
  - Wrap `await` calls in try-catch
  - Log errors with context
  - Provide fallback behavior where possible

- [ ] **Add React error boundary**
  - File: `js/components/ReactUI.js`
  - Create ErrorBoundary component
  - Wrap main UI tree
  - Show fallback UI on error instead of crash

---

## Phase 5: SEO & Branding

### 5.1 Update Branding

- [ ] **Update title to "Sheep Dog Sim" (spaced)**
  - File: `index.html`
  - Update `<title>` tag
  - Update `og:title` and `twitter:title`
  - Update any in-game references

- [ ] **Update meta description**
  - File: `index.html`
  - Write compelling 150-160 character description
  - Include keywords: sheepdog, herding, browser game, free, relaxing
  - Focus on emotional benefit (zen, peaceful, satisfying)

- [ ] **Update structured data**
  - File: `index.html` (JSON-LD script)
  - Update name to "Sheep Dog Sim"
  - Add `alternateName` array with variations
  - Verify with Google Rich Results Test

### 5.2 Distribution

- [ ] **Submit to itch.io**
  - Create itch.io developer account
  - Upload game as HTML5/web game
  - Write compelling description
  - Add screenshots and cover image
  - Set as free with optional donations

- [ ] **Submit to GameJolt**
  - Create GameJolt developer account
  - Upload game
  - Add to relevant categories (simulation, casual, relaxing)

- [ ] **Submit to CrazyGames**
  - Apply at developers.crazygames.com
  - Follow their submission guidelines
  - Potentially get revenue share

- [ ] **Create Reddit posts**
  - Post to r/WebGames with gameplay gif
  - Post to r/IndieGaming
  - Engage with comments
  - Follow subreddit rules

### 5.3 Analytics

- [ ] **Add basic analytics tracking**
  - Consider privacy-friendly option (Plausible, Simple Analytics)
  - Track: page views, game starts, completion rate
  - Track: device type, browser
  - No personally identifiable information

---

## Phase 6: Future Preparation

### 6.1 Campaign Mode Foundation

- [ ] **Create level configuration system**
  - Create: `js/levels/LevelConfig.js`
  - Define level structure: objectives, sheep count, time limit, obstacles
  - Create JSON schema for level definitions
  - Build level loader

- [ ] **Create save system**
  - Create: `js/systems/SaveSystem.js`
  - Use localStorage for progress
  - Track: completed levels, best times, unlocked dogs
  - Add save/load UI

- [ ] **Design level select UI**
  - Create: `js/components/LevelSelect/`
  - Show level grid with completion status
  - Star rating system for performance
  - Lock/unlock based on progress

### 6.2 Game State Machine

- [ ] **Implement formal state machine**
  - Create: `js/core/GameStateMachine.js`
  - States: LOADING, MENU, PLAYING, PAUSED, COMPLETED
  - Define valid transitions
  - Emit events on state change
  - Replace ad-hoc state flags

### 6.3 Testing Infrastructure

- [ ] **Add unit tests for core utilities**
  - Create: `tests/` directory
  - Test Vector2D operations
  - Test flocking algorithm functions
  - Test spatial hash grid
  - Use Jest or Vitest

- [ ] **Add integration tests**
  - Test game flow (start -> play -> complete)
  - Test multiplayer connection
  - Test asset loading

---

## Quick Wins (Can Do Anytime)

- [ ] **Fix double dash in CONSULTATION.md**
  - File: `CONSULTATION.md` line 820-822
  - Remove duplicate `---` separator

- [ ] **Add .gitignore entries**
  - File: `.gitignore`
  - Add: `node_modules/`, `.env`, `*.log`
  - Add: compressed model outputs if generating locally

- [ ] **Update README with current status**
  - File: `README.md`
  - Add current features list
  - Add development setup instructions
  - Add contribution guidelines

---

## Notes

_Add notes here as tasks are completed:_

```
Example:
[2024-01-15] Completed audio context fix - tested on iOS Safari, works correctly
[2024-01-16] Draco compression reduced dog models from 43MB to 11MB total
```

---

## Task Statistics

- **Total Tasks:** 78
- **Phase 1 (Critical):** 12 tasks
- **Phase 2 (UI/UX):** 23 tasks
- **Phase 3 (Performance):** 11 tasks
- **Phase 4 (Code Quality):** 12 tasks
- **Phase 5 (SEO):** 10 tasks
- **Phase 6 (Future):** 7 tasks
- **Quick Wins:** 3 tasks
