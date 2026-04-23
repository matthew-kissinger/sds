# Sandbox Mode Punch List

## 1. Bugs

- `GameState.js:78-79` — `borderPoints` assignment lacks fallback if custom polygon is invalid (concave L-shape may fail `isPointInPolygon` during dog spawn, silently using centroid)
- `SandboxConfig.js:47-56` — custom shape editor passes border points but `getBorderPoints` always recomputes from shape config, discarding user-drawn polygon on preset change
- `FenceEditor.js:55-75` — border point computation for custom shapes uses preset shape config instead of stored `customBorderPoints`, breaking visual parity with actual game
- `SandboxSetup.js:227-234` — clicking custom shape button doesn't visually indicate shape-editor mode is about to open; no transition feedback
- `ShapeEditor.js` — gate placement on custom polygon doesn't validate if gate position snaps to the polygon edge; placing gate inside the polygon is allowed
- `FenceCollisionSystem.js:148-153` — gate passage zone rotation for angled edges uses raw `edgeAngle` but doesn't validate if zone actually encloses the edge (can miss collisions on certain angles)

## 2. UX Pain

- Polygon editor snapping is aggressive (10-unit grid); fine adjustments require manual coordinate input which UI doesn't expose
- Fence undo/redo doesn't exist; deleting a fence requires redoing entire custom preset or reverting to preset
- Pasture offset (2 units) is hardcoded in SandboxConfig; users can't adjust or visualize it before starting
- Custom field shapes reset all fences when switching back from preset; warning dialog missing
- Fence editor shows no real-time collision preview—dropped fences may clip through pasture or field edges without feedback
- No visual feedback when hovering over edges to select gate position; requires precise clicking
- Sheep count slider jumps by 10; no "reset to default (200)" quick-button

## 3. Gaps

- No preset fence library (can't save/load named fence layouts beyond open/corridor/funnel/maze/obstacles)
- No named sandbox saves (config ID is random hash; users can't retrieve "my L-shaped arena with funnel")
- No sandbox import/export (can't load a friend's config from a file)
- Extreme/insane difficulty not selectable in sandbox; always uses default behavior params
- No tutorial or help overlay explaining gate/pasture zones in the editor
- Win condition "percentage" shows slider but no live count of how many sheep that is
- Dog type not selectable in sandbox (uses default or previously selected dog)
- No preview of final gate/pasture placement before game starts

## 4. Polish Wins

- Canvas grid opacity scales with zoom (currently fixed at 0.1); hard to see at high zoom
- Snap-to-grid visual indicator (highlight the snapped cell momentarily on placement)
- "Paste" fence pattern button (copy/paste a fence segment, scale it)
- Color-code fences by preset type (open-fences in blue, corridor in green, etc.)
- Sound effect on fence place/delete (subtle click)
- Toast notification "Config saved to clipboard" when share URL is copied
- Pasture boundary visualization in editor (light overlay showing the retirement area)
- Keyboard shortcut for delete (Del key on selected fence) and undo (Ctrl+Z)
- "Quick reset" button in editor that clears all custom fences in one click
- Real-time gate/pasture preview on the canvas when adjusting gate position

## 5. Prioritization — Top 5 Impact Items

1. **Custom shape editor visual parity bug** (`FenceEditor.js:59-75`) — users draw a polygon but the collision system uses preset shape, creating gameplay mismatch. High impact: breaks trust in sandbox.

2. **Fence undo/lack of incremental editing** — UX pain, high friction. Users abandon sandbox after 1-2 fence placements due to no correction path. Add simple undo stack (last 10 fences).

3. **Preset library for fences** — users want to save "my spiral layout" and reuse it. Adds 15 mins to setup, diminishes exploration appeal. Store 5 user presets in localStorage.

4. **Gate placement validation** (`SandboxConfig.js:82-152`) — gate can be placed inside polygon or off-edge; gate passage zone calculation may fail silently on certain angles. Validate and snap gate to nearest edge, show error if invalid.

5. **Real-time pasture visualization** — pasture offset is invisible; users surprise-discover pasture clips fences on game start. Show pasture bounds in editor as a light overlay; let users adjust offset (1-5 units).

