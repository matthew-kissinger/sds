
# Sheep Dog Simulation - Technical Architecture

## Overview
A sophisticated real-time 3D sheep herding simulation built with Three.js, featuring both **single-player** and **multiplayer** modes. The system implements advanced flocking behavior algorithms, immersive environmental rendering, competitive gameplay mechanics, comprehensive mobile support, audio system, and WebRTC-based multiplayer networking. The simulation features 200 autonomous sheep agents with emergent flocking behavior rendered using high-performance GPU-based instanced rendering, multiple player-controlled sheepdogs with stamina mechanics, timer-based scoring, cinematic start screen, and an expansive 3D world with realistic environmental elements.

## Dual-Mode Architecture

The simulation uses a **hybrid architecture** that preserves the original single-player experience while adding full multiplayer capabilities:

- **Single-Player Mode**: Runs entirely client-side with no network dependencies
- **Multiplayer Mode**: Connects to authoritative server with real-time synchronization
- **Graceful Fallback**: Automatically falls back to single-player if server unavailable

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT SIDE                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │   StartScreen   │    │ MobileControls  │    │ AudioManager │ │
│  │ • Mode Selection│    │ • Touch Controls│    │ • Sound FX   │ │
│  │ • Solo/Multi UI │    │ • Virtual Stick │    │ • Music      │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
│           │                       │                      │       │
│           └───────────────────────┼──────────────────────┘       │
│                                   │                              │
│  ┌─────────────────────────────────┼─────────────────────────────┐ │
│  │              main.js - Game Orchestrator                     │ │
│  │  • Dual-mode coordination (local vs networked)              │ │
│  │  • Module initialization and lifecycle management           │ │
│  │  • Game loop with pause/resume support                      │ │
│  └─────────────────────────────────┼─────────────────────────────┘ │
│                                   │                              │
│  ┌───────────────┐    ┌───────────────┐    ┌──────────────────┐  │
│  │  SceneManager │    │  GameState    │    │ NetworkManager   │  │
│  │ • 3D Rendering│    │ • Local Logic │    │ • WebRTC Client  │  │
│  │ • Camera Sys  │    │ • Sheep Mgmt  │    │ • Room System    │  │
│  └───────────────┘    └───────────────┘    └──────────────────┘  │
│           │                       │                      │       │
│           └───────────────────────┼──────────────────────┘       │
│                                   │                              │
│  ┌───────────────┐    ┌───────────────┐    ┌──────────────────┐  │
│  │ TerrainBuilder│    │OptimizedSheep │    │  MultiplayerUI   │  │
│  │ • Environment │    │ • GPU Render  │    │ • Room Lobby     │  │
│  │ • Grass/Trees │    │ • 200 Sheep   │    │ • Player Lists   │  │
│  └───────────────┘    └───────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                   │
                         ┌─────────┴─────────┐
                         │    INTERNET       │
                         │   (WebRTC/UDP)    │
                         └─────────┬─────────┘
                                   │
┌─────────────────────────────────────────────────────────────────┐
│                    SERVER SIDE (DigitalOcean)                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              server/index.js - Geckos.io Server             │ │
│  │  • WebRTC signaling and data channel management            │ │
│  │  • Player connection/disconnection handling                │ │
│  │  • Room lifecycle and host delegation                      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                 │                               │
│  ┌───────────────┐    ┌─────────────────┐    ┌───────────────┐  │
│  │  RoomManager  │    │ GameSimulation  │    │ shared/       │  │
│  │ • Room Codes  │    │ • Authoritative │    │ • Pure Logic │  │
│  │ • Player Mgmt │    │ • 60 FPS Tick   │    │ • Algorithms │  │
│  └───────────────┘    └─────────────────┘    └───────────────┘  │
│                                 │                               │
│  Deployment: DigitalOcean Droplet (68.183.107.158:9208)        │
│  • PM2 Process Management • UDP Ports 10000-20000              │
└─────────────────────────────────────────────────────────────────┘
```

## Core Client Modules

### 1. main.js (731 lines) - Enhanced Game Orchestrator
**Dual-Mode Coordination and Lifecycle Management**

**Responsibilities:**
- **Mode Detection**: Automatically detects single-player vs multiplayer mode
- **Module Coordination**: Initializes and coordinates all game systems
- **State Management**: Handles transitions between start screen, lobby, and gameplay
- **Pause System**: Universal pause coordination across all systems
- **Audio Integration**: Background music and sound effect coordination

**Key Features:**
- **Hybrid Architecture**: Seamlessly switches between local and networked modes
- **Module Lifecycle**: Proper initialization, update, and cleanup of all systems
- **Error Handling**: Graceful fallback from multiplayer to single-player
- **Performance Integration**: FPS monitoring and optimization

**API:**
```javascript
class SheepDogSimulation {
    switchToMultiplayer()        // Enable multiplayer mode
    switchToSinglePlayer()       // Enable single-player mode
    startGame()                  // Begin gameplay (either mode)
    pauseGame()                  // Pause all systems
    resetGame()                  // Reset to start screen
    update(deltaTime)            // Main game loop
}
```

### 2. NetworkManager.js (624 lines) - Multiplayer Communication
**WebRTC-Based Real-Time Networking**

**Responsibilities:**
- **Connection Management**: Geckos.io WebRTC client integration
- **Room System**: Create, join, and manage multiplayer rooms
- **Real-Time Sync**: Player input transmission and game state reception
- **Reconnection Logic**: Automatic reconnection with exponential backoff
- **Environment Detection**: Automatic server URL detection

**Key Features:**
- **Room-Based Multiplayer**: 4-letter room codes for private rooms
- **Quick Match**: Automatic public room joining
- **Low-Latency Communication**: WebRTC data channels for <50ms latency
- **Ping Monitoring**: Real-time connection quality measurement
- **Graceful Degradation**: Fallback to single-player on connection issues

**Protocol:**
```javascript
// Client → Server Messages:
playerInput: { direction, sprinting, timestamp }
createRoom: { playerName, roomSettings }
joinRoom: { roomCode, playerName }
startGame: { dogType }

// Server → Client Messages:
gameStateUpdate: { sheep, players, timestamp }
roomUpdate: { players, status, hostId }
playerJoined: { playerId, playerName }
gameStarted: { gameConfig }
```

### 3. MultiplayerUI.js (234 lines) - Multiplayer Interface
**Room Management and Player Interaction UI**

**Responsibilities:**
- **Room Creation**: UI for creating private and public rooms
- **Room Joining**: Room code input and validation
- **Lobby Management**: Player lists, ready states, host controls
- **In-Game HUD**: Multiplayer-specific UI elements during gameplay
- **Connection Status**: Visual feedback for connection quality

**Key Features:**
- **Responsive Design**: Mobile-optimized layouts
- **Real-Time Updates**: Live player list and status updates
- **Host Privileges**: Start game, kick players, room settings
- **Quick Match**: One-click public room joining
- **Error Handling**: User-friendly error messages and recovery

### 4. MobileControls.js (690 lines) - Touch Interface System
**Comprehensive Mobile and Touch Support**

**Responsibilities:**
- **Touch Detection**: Automatic mobile device detection
- **Virtual Joystick**: nipple.js-based movement control
- **Sprint Button**: Touch-optimized sprint control
- **Zoom Slider**: Camera distance adjustment for mobile
- **Touch Event Management**: Preventing default mobile browser behaviors

**Key Features:**
- **Cross-Platform**: Works on iOS, Android, and desktop
- **Visual Feedback**: Touch state indicators and animations
- **Responsive Layout**: Adaptive positioning for different screen sizes
- **Performance Optimized**: Lazy loading and efficient event handling

**Configuration:**
```javascript
joystick: {
    size: 120,               // Joystick size in pixels
    color: '#00BFFF',        // Joystick color
    threshold: 0.1,          // Movement threshold
    restOpacity: 0.7         // Opacity when not in use
}

zoom: {
    min: 20,                 // Minimum zoom distance
    max: 150,                // Maximum zoom distance
    default: 80              // Default zoom level
}
```

### 5. AudioManager.js (551 lines) - Sound System
**Comprehensive Audio Management**

**Responsibilities:**
- **Background Music**: Ambient music with loop management
- **Sound Effects**: UI clicks, game events, completion sounds
- **Audio Loading**: Preloading and caching of audio assets
- **Volume Control**: User preferences and mute functionality
- **Cross-Browser Compatibility**: Fallback support for different browsers

**Key Features:**
- **Audio Preloading**: Efficient asset management
- **Spatial Audio**: 3D positioning for environmental sounds
- **Music Transitions**: Smooth crossfading between tracks
- **Mobile Support**: Touch-to-enable audio for mobile browsers

### 6. StartScreen.js (682 lines) - Enhanced Mode Selection
**Comprehensive Pre-Game Experience**

**Responsibilities:**
- **Mode Selection**: Solo vs Multiplayer choice interface
- **Cinematic Camera**: Orbital camera showcasing the environment
- **Room Management**: Integration with multiplayer room system
- **Settings Interface**: Audio, graphics, and control settings
- **Transitions**: Smooth animations between different screens

**Enhanced Features:**
- **Dual-Mode Support**: Seamless transitions between single and multiplayer
- **Room Integration**: Direct access to multiplayer room creation/joining
- **Quick Match**: One-click multiplayer access
- **Settings Panel**: Audio controls, graphics options, control preferences

## Server Architecture (DigitalOcean Droplet)

### Server Deployment: `68.183.107.158:9208`
**Why DigitalOcean Droplet?**
- **Full UDP Support**: WebRTC requires UDP port ranges (10000-20000)
- **Network Control**: Direct access to networking configuration
- **Performance**: Dedicated resources for real-time gameplay
- **Cost Effective**: More control than managed platforms

### server/index.js (603 lines) - Geckos.io Server
**WebRTC Signaling and Game Server**

**Responsibilities:**
- **WebRTC Management**: Geckos.io server for data channel coordination
- **Player Connections**: Handle join/leave events and connection quality
- **Room Coordination**: Interface with RoomManager for game sessions
- **Health Monitoring**: Server status and performance monitoring

**Key Features:**
- **UDP Port Range**: Configurable ports 10000-20000 for WebRTC
- **Connection Resilience**: Automatic reconnection handling
- **Ping Monitoring**: Real-time latency tracking
- **Process Management**: PM2 integration for production deployment

### server/RoomManager.js (398 lines) - Room Lifecycle Management
**Multiplayer Room and Player Management**

**Responsibilities:**
- **Room Creation**: Generate unique 4-letter room codes
- **Player Management**: Join/leave, host delegation, capacity limits
- **Quick Match**: Public room matchmaking system
- **Room Cleanup**: Automatic cleanup of empty rooms

**Features:**
- **Host Delegation**: Automatic host transfer on disconnection
- **Room Settings**: Private/public, player limits, game configuration
- **State Tracking**: Room status (waiting, in-game, finished)

### server/GameSimulation.js (745 lines) - Authoritative Game Logic
**Server-Side Simulation with Shared Logic**

**Responsibilities:**
- **Authoritative Simulation**: 60 FPS server-side game tick
- **Sheep Behavior**: Server-side flocking using shared algorithms
- **Player Physics**: Movement validation and collision detection
- **Game Events**: Goal detection, completion tracking, scoring

**Architecture:**
- **Shared Logic**: Uses same algorithms as client for consistency
- **Input Processing**: Validates and applies player inputs
- **State Broadcasting**: Efficient delta compression for updates
- **Deterministic**: Ensures identical game state across all clients

## Shared Logic Architecture

### shared/ Directory - Pure Algorithms
**Platform-Agnostic Game Logic**

**Key Modules:**
- **FlockingAlgorithms.js**: Separation, alignment, cohesion calculations
- **MovementPhysics.js**: Movement and collision detection
- **BoundaryCollision.js**: Field boundary and gate detection
- **GameStateValidation.js**: Game rules and completion logic
- **Vector2D.js**: Mathematical utilities

**Design Principles:**
- **Zero Dependencies**: No DOM, Three.js, or Node.js dependencies
- **Pure Functions**: Stateless, deterministic calculations
- **Shared Codebase**: Identical logic between client and server
- **Performance Optimized**: Efficient algorithms for real-time simulation

## Additional Client Modules

### 7. SceneManager.js (182 lines) - Enhanced 3D Rendering
**Advanced Scene and Rendering Management**

**Responsibilities:**
- **Multi-Player Rendering**: Support for multiple sheepdog instances
- **Dynamic Lighting**: Adaptive lighting for different game states
- **Post-Processing**: Enhanced visual effects and atmosphere
- **Performance Scaling**: Adaptive quality based on device capabilities

**Multiplayer Enhancements:**
- **Multiple Cameras**: Support for spectator modes
- **Player Identification**: Visual differentiation of players
- **Network Interpolation**: Smooth rendering of remote player positions

### 8. TerrainBuilder.js (397 lines)
**Environment and Terrain Generation**

**Responsibilities:**
- Flat terrain generation (1000x1000 units)
- Instanced grass system with wind animation
- Multi-layered mountain generation
- Realistic tree creation (deciduous and pine)
- Environmental details (rocks, atmospheric effects)

**Key Features:**
- **Massive Grass System**: 800,000 instanced grass blades with shader-based wind animation
- **Procedural Mountains**: Three-layer mountain system with geometric variation
- **Realistic Trees**: Separate trunks and multi-layer foliage (200 deciduous + 80 pine)
- **Distance Scaling**: Grass and details scale with distance for realistic perspective

**Grass Shader System:**
```glsl
// Vertex Shader Features:
- Wind displacement with multi-frequency sine waves
- Blade tip emphasis with cosine-based power curves
- Complex multi-directional wind patterns
- Instance matrix transformations for positioning

// Fragment Shader Features:
- Base-to-tip color gradients
- Positional color variation with noise
- Fog integration with depth-based blending
- Performance-optimized calculations
```

**API:**
```javascript
class TerrainBuilder {
    createTerrain()           // Generate base terrain
    createGrass()            // Create instanced grass system
    createMountains()        // Generate mountain layers
    createTrees()            // Create tree forests
    updateGrassAnimation()   // Update wind animation
    getGrassInstanceCount()  // Get grass count for performance monitoring
}
```

### 3. StructureBuilder.js (471 lines)
**Game Structures and Boundaries**

**Responsibilities:**
- Field boundary fence system with posts and rails
- Gate construction with detection zones
- Pasture area creation with custom textures
- Fence rail connection algorithms

**Key Features:**
- **Modular Fence System**: Procedural fence generation with configurable spacing
- **Gate Mechanics**: Golden threshold markers with passage detection
- **Custom Textures**: Canvas-generated pasture textures with gradient effects
- **Structural Integrity**: Proper rail connections and post placement

**API:**
```javascript
class StructureBuilder {
    createFieldBoundaryFence(bounds, gate)  // Generate perimeter fencing
    createGateAndPasture(gate, pasture)     // Create goal structures
    createFenceRail(x1, z1, x2, z2, ...)   // Connect fence segments
}
```

### 4. GameState.js (242 lines)
**Game Logic and State Management**

**Responsibilities:**
- Game configuration and boundaries
- Optimized sheep system coordination
- Completion detection and progress tracking
- UI updates and completion messaging
- Pause state management

**Key Features:**
- **Centralized Configuration**: All game parameters in one location
- **Optimized Sheep Management**: Always uses high-performance GPU rendering
- **Progress Monitoring**: Real-time sheep count and completion detection
- **UI Integration**: Automatic UI updates and completion messages
- **Pause Support**: Coordinated pause state across systems

**Configuration:**
```javascript
// Field boundaries and game areas
bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }
gate: { position: Vector2D(0, 100), width: 8, height: 4 }
pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 }

// Simulation parameters
params: {
    speed: 0.1,              // Sheep movement speed
    cohesion: 1.0,           // Flock cohesion strength
    separationDistance: 2.0   // Minimum separation distance
}
```

### 5. GameTimer.js (181 lines)
**Timing System and Score Tracking**

**Responsibilities:**
- Precision timing with performance.now()
- Best time persistence in localStorage
- New record detection and celebration
- Timer display formatting and UI updates
- Pause state handling

**Key Features:**
- **High Precision**: Millisecond-accurate timing
- **Persistent Storage**: Best times saved across browser sessions
- **Visual Feedback**: New record animations and celebrations
- **Error Handling**: Graceful fallback for localStorage issues
- **Pause Integration**: Respects pause state for accurate timing

**API:**
```javascript
class GameTimer {
    start()                  // Begin timing
    stop()                   // End timing and check for records
    update()                 // Update display during gameplay
    reset()                  // Reset timer for new game
    setPaused(isPaused)      // Handle pause state
    formatTime(seconds)      // Format time for display
    getBestTime()           // Retrieve best time
}
```

### 6. OptimizedSheep.js (788 lines)
**High-Performance GPU-Based Sheep System**

**Responsibilities:**
- Single InstancedMesh for all 200 sheep (1 draw call!)
- GPU-based animation via vertex shaders
- Merged geometry with vertex colors
- Efficient per-instance data management

**Key Features:**
- **Instanced Rendering**: All sheep rendered in a single draw call
- **GPU Animation**: Vertex shader-based movement and behavior animation
- **Merged Geometry**: Body, head, and legs combined into single geometry
- **Vertex Colors**: Per-vertex coloring for material variation
- **Efficient Updates**: Minimal CPU-GPU data transfer

**Shader System:**
```glsl
// Vertex Shader Features:
- Per-instance animation data (phase, speed, state, direction)
- Leg animation with galloping motion
- Body bounce and head bob
- Facing direction and look-at behavior
- Instance matrix transformations

// Fragment Shader Features:
- Toon shading with stepped lighting
- Vertex color support for material variation
- Fog integration for atmospheric depth
- Performance-optimized lighting calculations
```

**Performance Metrics:**
```javascript
// Rendering Efficiency:
- 200 sheep: 1 draw call (vs 200+ in traditional approach)
- GPU animation: 0 CPU overhead for movement
- Memory usage: ~50MB for all sheep data
- Target: 60 FPS with full flock + environment
```

### 7. PerformanceMonitor.js (377 lines)
**Real-time Performance Tracking and Statistics**

**Responsibilities:**
- Stats.js integration for FPS and memory monitoring
- Custom simulation-specific performance metrics
- Real-time display of rendering statistics
- Performance data collection and analysis

**Key Features:**
- **Stats.js Integration**: Professional FPS/memory tracking with fallback support
- **Custom Metrics Panel**: Simulation-specific statistics (sheep count, grass instances, draw calls)
- **Frame Time Analysis**: Rolling average, min/max frame time tracking
- **Memory Monitoring**: JavaScript heap usage when available
- **Toggle Controls**: Show/hide performance displays with 'P' key

**Performance Metrics:**
```javascript
metrics: {
    sheepCount: 200,         // Total sheep in simulation
    activeSheepCount: 0,     // Currently active sheep
    grassInstances: 800000,  // Number of grass blade instances
    drawCalls: 0,            // WebGL draw calls per frame
    triangles: 0,            // Total triangles rendered
    avgFrameTime: 0,         // Rolling average frame time
    minFrameTime: Infinity,  // Minimum frame time recorded
    maxFrameTime: 0          // Maximum frame time recorded
}
```

### 8. StartScreen.js (136 lines)
**Start Screen and Pre-Game Experience**

**Responsibilities:**
- Start screen overlay management
- Cinematic camera system for pre-game showcase
- Game launch coordination
- UI transition management

**Key Features:**
- **Cinematic Camera**: Smooth orbital camera movement around the field
- **Interactive UI**: Start button and Enter key support
- **Smooth Transitions**: Fade animations between start screen and gameplay
- **Game Coordination**: Callback system for game initialization

**API:**
```javascript
class StartScreen {
    updateCinematicCamera()      // Update orbital camera movement
    startGame()                  // Initiate game start sequence
    setGameStartCallback(fn)     // Register game start handler
    isStartScreenActive()        // Check if start screen is active
    reset()                      // Reset to start screen state
}
```

### 9. StaminaUI.js (105 lines)
**Stamina System User Interface**

**Responsibilities:**
- Stamina bar display and updates
- Visual state management (normal, low, critical, sprinting)
- Performance-optimized UI updates
- Stamina percentage and status display

**Key Features:**
- **Visual States**: Color-coded stamina levels with animations
- **Performance Optimized**: Only updates DOM when values change
- **State Indicators**: Different colors and labels for various stamina states
- **Smooth Animations**: CSS transitions for visual feedback

**API:**
```javascript
class StaminaUI {
    update(staminaInfo)     // Update display based on sheepdog stamina
    show()                  // Show stamina bar when game starts
    hide()                  // Hide stamina bar
    reset()                 // Reset to full stamina display
}
```

### 10. Sheepdog.js (683 lines)
**Enhanced Player Controller with Stamina System**

**Responsibilities:**
- Player movement with acceleration and deceleration
- Stamina system with sprint mechanics
- Detailed 3D model with procedural animations
- Idle behavior system with multiple animation states

**Key Features:**
- **Stamina System**: Sprint mechanics with stamina drain and regeneration
- **Smooth Movement**: Acceleration-based movement with boundary constraints
- **Detailed Model**: Procedural dog mesh with realistic proportions and materials
- **Rich Animations**: Running, idle, breathing, looking around, ear twitching, stretching
- **Visual Feedback**: Tongue visibility when running, different animation speeds

**Stamina Mechanics:**
```javascript
// Stamina Configuration:
maxStamina: 100,
staminaDrainRate: 30,      // Per second when sprinting
staminaRegenRate: 20,      // Per second when not sprinting (40 when idle)
minStaminaToSprint: 10,    // Minimum stamina to start sprinting
maxSpeed: 15,              // Normal movement speed
sprintSpeed: 25            // Sprint movement speed
```

### 11. InputHandler.js (182 lines)
**Enhanced Input Management with Pause System**

**Responsibilities:**
- WASD movement input handling
- Sprint control (Shift key)
- Pause system (Escape key)
- Performance monitor toggle (P key)
- Focus and blur event handling

**Key Features:**
- **Pause System**: Escape key toggles pause with visual indicator
- **Sprint Control**: Shift key for stamina-based sprinting
- **State Management**: Proper key state clearing on pause/blur
- **Callback System**: Pause state notifications to other systems

**API:**
```javascript
class InputHandler {
    getMovementDirection()   // Get normalized movement vector
    isSprinting()           // Check if sprint key is pressed
    isPausedState()         // Check current pause state
    togglePause()           // Toggle pause state
    onPauseToggle(callback) // Register pause state change callback
}
```

### 12. main.js (192 lines)
**Enhanced Orchestration and Game Loop**

**Responsibilities:**
- Module initialization and coordination
- Start screen to game transition management
- Main game loop and update cycle
- Pause state coordination
- Performance monitoring integration

**Enhanced Structure:**
```javascript
class SheepDogSimulation {
    constructor() {
        // Initialize all modules including new ones
        this.startScreen = new StartScreen(this.sceneManager);
        this.staminaUI = new StaminaUI();
        // ... other modules
        
        // Set up pause handling across systems
        this.setupPauseHandling();
    }
    
    startGame() {
        // Transition from start screen to active game
        // Add sheepdog to scene, start timer, show stamina UI
    }
    
    update(deltaTime) {
        // Coordinate all systems with pause awareness
        // Handle start screen vs active game states
    }
}
```

## AI and Behavior Systems

### Boid System (js/Boid.js - 248 lines)
**Enhanced Flocking Algorithm**
- **Separation**: Exponential repulsion to avoid crowding
- **Alignment**: Weighted average heading calculation
- **Cohesion**: Center-of-mass attraction with distance weighting
- **Boundary Avoidance**: Soft and hard boundary systems
- **Performance**: Spatial optimization with perception radius limiting

### Optimized Sheep Agent (js/OptimizedSheep.js)
**GPU-Accelerated State Machine**
```javascript
States:
- Active (0): Normal flocking + dog avoidance + gate attraction
- Retiring (1): Seeking pasture position (50% speed reduction)
- Grazing (2): Gentle wandering in pasture with minimal movement

Behavioral Parameters:
- Flee radius: 8 units from sheepdog
- Gate attraction: 0.5 force multiplier when herded
- Boundary constraints: Hard stop at fence edges (except gate area)
- Grazing behavior: 0.2% chance per frame for gentle movement
```

### Enhanced Sheepdog Controller (js/Sheepdog.js)
**Advanced Player Input System**
- **Movement**: WASD input with smooth acceleration/deceleration
- **Sprint System**: Shift key with stamina management
- **Visual Model**: Detailed procedural dog mesh with realistic animations
- **Influence**: Affects sheep within 8-unit flee radius
- **Idle Behaviors**: Multiple idle animation states for immersion

## User Experience Systems

### Start Screen System
- **Cinematic Camera**: Orbital camera showcasing the field before gameplay
- **Interactive UI**: Professional start screen with instructions and branding
- **Smooth Transitions**: Fade animations between start screen and gameplay
- **Keyboard Support**: Enter key and click support for accessibility

### Stamina System
- **Visual Feedback**: Color-coded stamina bar with state indicators
- **Gameplay Impact**: Sprint speed vs stamina management decisions
- **Recovery Mechanics**: Faster regeneration when idle vs moving
- **UI Integration**: Real-time updates with performance optimization

### Pause System
- **Universal Pause**: Escape key pauses all game systems
- **Visual Indicator**: Clear pause overlay with resume instructions
- **State Preservation**: Proper pause/resume of timers and animations
- **Input Handling**: Prevents movement input during pause

## Rendering Pipeline

### Performance Optimizations

#### GPU-Based Rendering
- **Sheep System**: Single InstancedMesh for all 200 sheep (1 draw call)
- **Vertex Shader Animation**: All sheep movement calculated on GPU
- **Instanced Grass**: Single draw call for 800,000 grass instances
- **Shared Geometries**: Reused base geometries for environmental objects
- **Memory Efficiency**: ~150MB total for entire scene

#### Advanced Techniques
- **Merged Geometry**: Sheep body parts combined into single geometry
- **Vertex Colors**: Per-vertex material variation without texture switching
- **Instance Attributes**: Custom per-sheep data (animation, state, direction)
- **Frustum Culling**: Disabled for instanced meshes to prevent pop-in

#### Shadow System
- **Optimized Mapping**: 2048x2048 shadow maps with 240-unit coverage
- **Selective Casting**: Only essential objects cast shadows
- **PCF Soft Shadows**: Smooth shadow edges for visual quality

### Shader Systems

#### Optimized Sheep Shader
```glsl
// Vertex Shader Features:
- Instance data: animPhase, speed, state, uniqueId
- Animation data: walkCycle, bounce, direction, blinkTimer
- Leg animation with galloping motion (vertexId 100-139)
- Body bounce animation (vertexId 0-49)
- Head bob and look direction (vertexId 50-99)

// Fragment Shader Features:
- Toon shading with 3-step lighting
- Vertex color support for material variation
- Fog integration with depth-based blending
- Optimized lighting calculations
```

#### Grass Animation Shader
```glsl
// Wind simulation with multiple frequencies
float windX = sin(worldPos.z * 0.1 + time * 2.0) * cos(worldPos.x * 0.1 + time * 1.5);
float windZ = cos(worldPos.x * 0.15 + time * 2.5) * sin(worldPos.z * 0.15 + time * 2.0);

// Blade tip emphasis
float dispPower = 1.0 - cos(uv.y * PI / 2.0);
displacement = windX * (0.15 * dispPower);
```

## Game Logic Systems

### Gate Passage Detection
```javascript
// Multi-criteria validation:
1. Position within gate passage zone (4-unit width)
2. Positive Z velocity (moving toward pasture)
3. Not already passed (state tracking)
4. Velocity threshold for intentional movement
```

### Completion System
- **Progress Tracking**: Real-time count of retired sheep
- **State Validation**: Multiple checks for completion
- **Timer Integration**: Automatic timer stop on completion
- **UI Updates**: Dynamic progress display and completion messages

### Boundary System
```javascript
// Hierarchical boundary enforcement:
Hard Boundaries: -100 to +100 (x,z) - absolute limits (except for passed sheep)
Soft Boundaries: 3-unit margin with exponential repulsion
Gate Exception: 8-unit opening at (0, 100)
Pasture Area: (-30 to 30, 102 to 130) - goal zone with gentle containment
```

### Grazing System
```javascript
// Post-gate behavior:
- Gentle wandering: 0.2% chance per frame for movement
- Pasture containment: Soft forces to stay within bounds
- Reduced speed: 0.02 units for realistic grazing
- Continuous animation: Maintained visual activity
```

## Data Structures and Algorithms

### Vector2D Mathematics (js/Vector2D.js - 102 lines)
**Optimized 2D Vector Operations**
```javascript
class Vector2D {
    add(vector)              // Vector addition
    subtract(vector)         // Vector subtraction
    multiply(scalar)         // Scalar multiplication
    normalize()              // Unit vector conversion
    magnitude()              // Length calculation
    distance(vector)         // Distance between vectors
    limit(max)              // Magnitude limiting
    angle()                 // Calculate angle for rotation
}
```

### Spatial Optimization
- **Neighbor Detection**: Efficient radius-based queries
- **Perception Limiting**: Configurable awareness radius
- **Update Batching**: Grouped behavior calculations
- **GPU Offloading**: Animation calculations moved to vertex shaders

## Performance Characteristics

### Target Specifications
- **Frame Rate**: 60 FPS sustained
- **Sheep Count**: 200 autonomous agents (1 draw call)
- **Grass Instances**: 800,000 animated blades (1 draw call)
- **Total Draw Calls**: <10 for entire scene
- **Memory Usage**: ~150MB for full scene

### Bottleneck Analysis
- **Primary**: Grass rendering (800k instances)
- **Secondary**: Shadow calculations (2048² maps)
- **Tertiary**: JavaScript behavior updates (200 agents)
- **Eliminated**: Individual sheep rendering overhead

### Optimization Strategies
- **GPU-Based Animation**: Vertex shader calculations
- **Instanced Rendering**: Massive geometry reduction
- **Shared Resources**: Memory efficiency
- **Simplified Physics**: 2D calculations with 3D rendering
- **Culling Systems**: Visibility and distance-based optimizations

## Extension Architecture

### Adding New Features
```javascript
// 1. Create new module class
class WeatherSystem {
    constructor(scene) { this.scene = scene; }
    update() { /* weather logic */ }
}

// 2. Initialize in main.js
this.weatherSystem = new WeatherSystem(this.sceneManager.getScene());

// 3. Update in game loop
this.weatherSystem.update();
```

### Behavior Extensions
- **New Agent Types**: Extend Boid class
- **Environmental Effects**: Add to TerrainBuilder
- **Game Mechanics**: Extend GameState
- **Visual Effects**: Enhance SceneManager or create new shader systems

## Dependencies and Compatibility

### Core Dependencies
- **Three.js v0.176.0**: 3D rendering engine
- **Stats.js v0.17.0**: Performance monitoring
- **WebGL 1.0+**: Hardware acceleration requirement
- **ES6 Classes**: Modern JavaScript features

### Browser Support
- **Chrome 80+**: Full feature support
- **Firefox 75+**: Full feature support  
- **Safari 13+**: Full feature support
- **Edge 80+**: Full feature support

### Performance Requirements
- **GPU**: WebGL-capable graphics (integrated minimum)
- **RAM**: 4GB+ recommended for smooth operation
- **CPU**: Modern multi-core for 60 FPS target

## Development Workflow

### Module Development
1. **Single Responsibility**: Each module handles one aspect
2. **Clear Interfaces**: Well-defined public APIs
3. **Error Handling**: Graceful degradation
4. **Documentation**: Comprehensive inline comments

### Testing Strategy
- **Unit Testing**: Individual module validation
- **Integration Testing**: Module interaction verification
- **Performance Testing**: Frame rate and memory monitoring
- **Cross-Browser Testing**: Compatibility validation

### Code Quality
- **ES6 Standards**: Modern JavaScript practices
- **Consistent Naming**: Descriptive method and variable names
- **Modular Design**: Loose coupling, high cohesion
- **Performance Focus**: Optimization-aware development

## File Structure
```
sheep-dog/
├── index.html              # Main HTML container with enhanced UI
├── js/
│   ├── main.js             # SheepDogSimulation controller (192 lines)
│   ├── SceneManager.js     # 3D scene and rendering management (141 lines)
│   ├── TerrainBuilder.js   # Environment creation and grass system (397 lines)
│   ├── StructureBuilder.js # Game structures (fences, gates, pastures) (471 lines)
│   ├── GameState.js        # Game logic and state management (242 lines)
│   ├── GameTimer.js        # Timer system and best time tracking (181 lines)
│   ├── PerformanceMonitor.js # Real-time performance tracking (377 lines)
│   ├── StartScreen.js      # Start screen and cinematic camera (136 lines)
│   ├── StaminaUI.js        # Stamina bar UI management (105 lines)
│   ├── Boid.js             # Base flocking agent (248 lines)
│   ├── OptimizedSheep.js   # GPU-based sheep system (788 lines)
│   ├── Sheepdog.js         # Enhanced player controller with stamina (683 lines)
│   ├── InputHandler.js     # Keyboard input with pause system (182 lines)
│   └── Vector2D.js         # 2D math utilities (102 lines)
├── assets/
│   ├── images/
│   │   └── favicon.png     # Game favicon
│   └── sounds/             # Reserved for future audio assets
├── package.json            # Dependencies and scripts
├── README.md               # User documentation
└── ARCHITECTURE.md         # This document
```

## Performance Architecture

### Client-Side Optimizations
- **GPU Rendering**: All sheep rendered in single draw call
- **Instanced Grass**: 800,000 grass blades in one draw call
- **Network Interpolation**: Smooth multiplayer movement
- **Adaptive Quality**: Performance scaling based on device

### Server-Side Optimizations
- **Per-Room Simulation**: Isolated game instances
- **Efficient Broadcasting**: Delta compression for state updates
- **Connection Pooling**: Efficient player management
- **Resource Cleanup**: Automatic memory management

### Network Optimizations
- **WebRTC Data Channels**: Sub-50ms latency
- **Delta Compression**: Only send changed data
- **Client Prediction**: Responsive local movement
- **Lag Compensation**: Server-side rollback for validation

## Deployment Architecture

### Production Environment
```
DigitalOcean Droplet (68.183.107.158)
├── PM2 Process Manager
│   ├── sds-multiplayer-server (Node.js)
│   ├── Auto-restart on crash
│   └── Log management
├── Firewall Configuration
│   ├── SSH: 22/tcp
│   ├── Geckos.io: 9208/tcp
│   └── WebRTC: 10000-20000/udp
└── System Resources
    ├── 1GB RAM
    ├── 1 vCPU
    └── Ubuntu 20.04 LTS
```

### Development Workflow
- **Local Testing**: `./start-multiplayer-servers.ps1`
- **Deployment**: `./upload-to-droplet.ps1` + SSH deployment
- **Monitoring**: PM2 logs and DigitalOcean metrics
- **Scaling**: Horizontal scaling via multiple droplets

## File Structure

```
sds/
├── index.html                   # Main game client (1801 lines)
├── debug-client.html            # Network debugging tool
├── js/                          # Client-side modules
│   ├── main.js                  # Game orchestrator (731 lines)
│   ├── NetworkManager.js        # WebRTC networking (624 lines)
│   ├── MultiplayerUI.js         # Multiplayer interface (234 lines)
│   ├── MobileControls.js        # Touch controls (690 lines)
│   ├── AudioManager.js          # Sound system (551 lines)
│   ├── StartScreen.js           # Enhanced start screen (682 lines)
│   ├── SceneManager.js          # 3D rendering (182 lines)
│   ├── Sheepdog.js              # Player controller (951 lines)
│   ├── OptimizedSheep.js        # GPU sheep system (879 lines)
│   ├── GameState.js             # State management (291 lines)
│   ├── TerrainBuilder.js        # Environment (397 lines)
│   ├── StructureBuilder.js      # Game structures (471 lines)
│   ├── GameTimer.js             # Timer system (211 lines)
│   ├── StaminaUI.js             # Stamina interface (105 lines)
│   ├── PerformanceMonitor.js    # Performance tracking (377 lines)
│   ├── InputHandler.js          # Input management (232 lines)
│   ├── Boid.js                  # Flocking base class (248 lines)
│   └── Vector2D.js              # Math utilities (109 lines)
├── server/                      # Multiplayer server
│   ├── index.js                 # Geckos.io server (603 lines)
│   ├── RoomManager.js           # Room management (398 lines)
│   ├── GameSimulation.js        # Authoritative simulation (745 lines)
│   ├── package.json             # Server dependencies
│   ├── deploy-to-droplet.sh     # Deployment script
│   └── shared/                  # Shared logic (symlink)
├── shared/                      # Platform-agnostic logic
│   ├── FlockingAlgorithms.js    # Boid behaviors (193 lines)
│   ├── MovementPhysics.js       # Movement calculations (210 lines)
│   ├── BoundaryCollision.js     # Collision detection (253 lines)
│   ├── GameStateValidation.js   # Game rules (338 lines)
│   ├── Vector2D.js              # Math utilities (110 lines)
│   └── index.js                 # Module exports (148 lines)
├── client/                      # Alternative client build
├── assets/                      # Game assets (sounds, images)
├── upload-to-droplet.ps1        # Deployment automation
├── start-multiplayer-servers.ps1 # Local development
├── DROPLET_DEPLOYMENT.md        # Deployment guide
├── MOBILE_CONTROLS.md           # Mobile documentation
└── README.md                    # User documentation
```

## Dependencies

### Client Dependencies
- **Three.js v0.176.0**: 3D rendering engine
- **Geckos.io Client v3.0.2**: WebRTC client library
- **Stats.js v0.17.0**: Performance monitoring
- **nipple.js v0.10.2**: Virtual joystick for mobile

### Server Dependencies
- **Node.js v18+**: Server runtime
- **Geckos.io Server v3.0.1**: WebRTC server framework
- **PM2**: Process management
- **@digitalocean/godo**: Deployment integration

### Browser Support
- **Chrome 80+**: Full WebRTC and mobile support
- **Firefox 75+**: Full feature support
- **Safari 13+**: Full support with mobile optimizations
- **Mobile browsers**: iOS 13+, Android Chrome 80+

## Performance Characteristics

### Target Performance
- **Single-Player**: 60 FPS sustained
- **Multiplayer**: 60 FPS with <50ms latency
- **Mobile**: 30-60 FPS depending on device
- **Memory**: ~150MB client, ~100MB per server room

### Scalability
- **Players per Room**: Up to 4 concurrent players
- **Rooms per Server**: ~20-50 depending on activity
- **Horizontal Scaling**: Multiple droplets with load balancing
- **Network Bandwidth**: ~10KB/s per player in multiplayer

## Extension Points

### Adding New Features
- **New Game Modes**: Extend GameState and server simulation
- **Additional Dog Types**: Extend Sheepdog class with new models
- **Environmental Effects**: Add to TerrainBuilder and shared logic
- **Audio Enhancements**: Extend AudioManager with new sound systems
- **Mobile Features**: Enhance MobileControls with new interactions

### Multiplayer Extensions
- **Spectator Mode**: Add observer connections to RoomManager
- **Tournaments**: Extend server with bracket management
- **Leaderboards**: Add persistent scoring system
- **Voice Chat**: Integrate WebRTC audio channels

This architecture provides a solid foundation for both current gameplay and future enhancements, with clean separation between single-player and multiplayer modes, efficient rendering and networking, and comprehensive mobile support. 