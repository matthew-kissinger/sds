# 🐑 Hybrid Sheepdog Simulation - Task List

## Phase 1: Add Multiplayer Mode (Keep Single-Player) ⚙️

### 1.1 Project Structure Setup
- [ ] Create server/ directory for multiplayer server
- [ ] Create shared/ directory for common simulation logic
- [ ] Keep existing client code in root (maintain single-player)
- [ ] Set up package.json for server directory
- [ ] Install necessary dependencies (Geckos.io for server, minimal client deps)

### 1.2 Enhance Start Screen with Room-Based Multiplayer
- [x] Modify StartScreen.js to show mode options:
  - [x] "🐕 Play Solo" (existing single-player experience)
  - [x] "👥 Play Online" → leads to room options:
    - [x] "🏠 Create Room" (host with 6-digit code)
    - [x] "🔗 Join Room" (enter room code)
    - [x] "⚡ Quick Match" (join any public room)
- [x] Implement room creation flow:
  - [x] Generate 6-digit room codes (ABC123 format)
  - [x] Room settings (name, max players 2-4, private/public)
  - [x] Host lobby screen with player list and controls
- [x] Implement room joining flow:
  - [x] Room code input with validation
  - [x] Player lobby screen (no host controls)
- [x] Add lobby features:
  - [x] Real-time player list updates
  - [x] Room code sharing/copying
  - [x] Host start game control
  - [x] Leave room / back to menu options
- [x] Handle connection errors gracefully (fallback to solo)

### 1.3 Extract Shared Simulation Logic  
- [x] Create shared/ directory with pure functions:
  - [x] Extract core flocking algorithms (from Boid.js)
  - [x] Extract movement and physics calculations
  - [x] Extract boundary and collision detection
  - [x] Extract game state validation
- [x] Ensure shared code has zero dependencies on DOM/Three.js
- [x] Make functions stateless and deterministic

### 1.4 Build Multiplayer Server with Room Management
- [x] Create server entry point with Geckos.io
- [x] Implement room management system:
  - [x] Generate and validate 6-digit room codes
  - [x] Track room state (waiting, in-game, finished)
  - [x] Handle 2-4 players per room
  - [x] Host privileges and delegation
  - [x] Public room matchmaking for Quick Match
- [x] Set up per-room authoritative simulation (60 FPS tick per room)
- [x] Server-side state management per room:
  - [x] All sheep positions and behaviors
  - [x] Multiple dog positions and stamina (one per player)
  - [x] Game progress and completion
- [x] Handle player connections/disconnections:
  - [x] Join/leave room logic
  - [x] Host migration if host disconnects
  - [x] Game state cleanup for empty rooms
- [x] Process client inputs and apply to server state
- [x] Broadcast game state to all clients in room

### 1.5 Add Multiplayer Client Mode with Room Support
- [x] Create NetworkManager.js for room-based multiplayer communication
- [x] Implement dual-mode GameState (local vs networked)
- [x] Add room management on client:
  - [x] Room creation and joining logic
  - [x] Lobby state management
  - [x] Player list synchronization
  - [x] Host detection and UI changes
- [x] Add multiplayer input handling (send to server instead of local)
- [x] Create networked rendering mode:
  - [x] Receive server state updates
  - [x] Interpolate positions for smooth movement
  - [ ] Handle multiple dogs on screen (different colors/names) **(Future Enhancement)**
- [x] Add multiplayer UI elements:
  - [x] Lobby player list with ready states
  - [x] Room code display and sharing
  - [x] Connection status and latency
  - [x] In-game player indicators

### 1.6 Network Protocol & Synchronization
- [x] Define message protocols for client-server communication
- [x] Implement efficient state updates (client-side interpolation)
- [x] Add client-side interpolation for smooth gameplay
- [x] Handle network latency and packet loss (ping measurement & reconnection)
- [x] Add reconnection logic for dropped connections

## Phase 2: Local Testing & UX Polish 🧪

### 2.1 Single-Player Mode Verification
- [ ] Ensure existing single-player mode still works perfectly
- [ ] Verify all original features work (stamina, timer, completion)
- [ ] Test performance is unchanged in solo mode
- [ ] Confirm start screen transitions work

### 2.2 Local Multiplayer Testing
- [ ] Set up server to run on localhost:3000
- [ ] Test start screen mode selection
- [ ] Verify connection flow and error handling
- [ ] Test with 2+ browser tabs in multiplayer mode
- [ ] Verify input from one tab updates all tabs
- [ ] Test disconnect/reconnect scenarios
- [ ] Verify sheep state consistency across clients
- [ ] Test graceful fallback to single-player on connection issues

### 2.3 User Experience Testing
- [ ] Test mode switching (solo to multiplayer and back)
- [ ] Verify loading states and connection feedback
- [ ] Test error messages and recovery flows
- [ ] Measure and optimize multiplayer latency
- [ ] Test edge cases (rapid inputs, connection drops)

### 2.4 Performance Validation
- [ ] Monitor server CPU/memory usage with multiple clients
- [ ] Test with maximum player count per room
- [ ] Verify 60 FPS client performance in both modes
- [ ] Optimize network message frequency
- [ ] Ensure single-player performance is unaffected

## Phase 3: Deploy to Fly.io 🚀

### 3.1 Fly.io Setup
- [ ] Install flyctl CLI
- [ ] Authenticate with Fly.io
- [ ] Create Fly.io application for multiplayer server
- [ ] Configure fly.toml for UDP (Geckos.io requirement)

### 3.2 Server Deployment
- [ ] Prepare server for production environment
- [ ] Add environment variables and configuration
- [ ] Deploy multiplayer server to Fly.io
- [ ] Verify UDP connectivity works
- [ ] Test public multiplayer endpoint

### 3.3 Client Update & Deployment  
- [ ] Update client to use production server URL for multiplayer
- [ ] Ensure single-player mode works without server
- [ ] Build and deploy updated client
- [ ] Test full production setup with both modes

## Completion Checklist ✅

### Single-Player Mode (Preserved)
- [ ] Solo mode works exactly as before
- [ ] All original features intact (stamina, timer, sheep AI)
- [ ] Performance unchanged
- [ ] No network dependencies

### Multiplayer Mode (New)
- [ ] Start screen offers both solo and online options
- [ ] Multiplayer connection flow works smoothly  
- [ ] Multiple players can join and play together
- [ ] Server-authoritative simulation runs reliably
- [ ] Inputs and syncs are frame-consistent across clients
- [ ] Graceful handling of connection issues
- [ ] Sheep behave identically between clients

### Deployment
- [ ] Multiplayer server successfully deployed to Fly.io
- [ ] Client works with both local and production servers
- [ ] Public multiplayer testing successful

## Current Status
**Phase**: Phase 1 - COMPLETE ✅
**Next Task**: Begin Phase 2 - Local Testing & UX Polish

## Completed Features ✅
### User Interface & Experience
- ✅ Room-based multiplayer UI with full navigation flow
- ✅ 6-digit room code generation and validation
- ✅ Host lobby with player management and copy functionality
- ✅ Solo mode preserved exactly as before
- ✅ Graceful error handling and fallbacks
- ✅ Mobile-responsive design for all screens
- ✅ Keyboard shortcuts (Enter, Escape) for better UX
- ✅ In-game multiplayer HUD with player list and connection status
- ✅ Real-time ping/latency display with color coding
- ✅ Connection state indicators (connected/disconnected/reconnecting)

### Core Architecture
- ✅ Shared simulation logic extracted to pure functions
- ✅ Core flocking algorithms (separation, alignment, cohesion)
- ✅ Movement and physics calculations with interpolation
- ✅ Boundary and collision detection functions
- ✅ Game state validation and management utilities
- ✅ Dual-mode GameState (local vs networked)

### Multiplayer Server
- ✅ Multiplayer server with Geckos.io networking
- ✅ Room management system with host delegation and cleanup
- ✅ Authoritative 60 FPS game simulation per room
- ✅ Server-side sheep flocking and dog physics using shared logic
- ✅ Player input processing and state broadcasting
- ✅ Graceful connection handling and room maintenance
- ✅ Ping measurement and response system

### Multiplayer Client
- ✅ NetworkManager with comprehensive room-based networking
- ✅ Real-time room creation, joining, and quick match functionality
- ✅ Client-side interpolation for smooth multiplayer gameplay
- ✅ Player input synchronization with server authority
- ✅ Automatic reconnection with exponential backoff
- ✅ Game state synchronization and sheep position updates
- ✅ Multiplayer UI management with player status tracking
- ✅ Network error handling with graceful fallbacks to solo mode

## Notes & Context
- **Hybrid Approach**: Keep single-player intact, add multiplayer as option
- **UX Priority**: Seamless mode selection, graceful error handling
- **Server Authority**: Only multiplayer mode uses server simulation
- **Performance**: Single-player should have zero network overhead
- **Fallback**: Connection failures should redirect to single-player mode 