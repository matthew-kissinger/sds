# Sheep Dog Simulation - Technical Architecture

## Overview
A sophisticated real-time 3D sheep herding simulation built with Three.js, implementing advanced flocking behavior algorithms, immersive environmental rendering, competitive gameplay mechanics, and polished user experience features. The simulation features 200 autonomous sheep agents with emergent flocking behavior rendered using high-performance GPU-based instanced rendering, a player-controlled sheepdog with stamina and sprint mechanics, timer-based scoring, cinematic start screen, and an expansive 3D world with realistic environmental elements.

## Modular Architecture

The simulation uses a clean, modular architecture optimized for performance and maintainability. Each module has a single responsibility and clear interfaces, with the sheep system utilizing cutting-edge GPU-based rendering for maximum efficiency.

### Module Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SceneManager  │    │ TerrainBuilder  │    │StructureBuilder│
│                 │    │                 │    │                 │
│ • 3D Rendering  │    │ • Environment   │    │ • Fences/Gates  │
│ • Camera System │    │ • Grass/Trees   │    │ • Pastures      │
│ • Lighting      │    │ • Mountains     │    │ • Structures    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   main.js       │
                    │                 │
                    │ • Orchestration │
                    │ • Game Loop     │
                    │ • Module Coord  │
                    └─────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GameState     │    │   GameTimer     │    │  InputHandler   │
│                 │    │                 │    │                 │
│ • Game Logic    │    │ • Timing System │    │ • User Input    │
│ • Sheep Mgmt    │    │ • Best Scores   │    │ • WASD Control  │
│ • Completion    │    │ • Persistence   │    │ • Sprint/Pause  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   StartScreen   │    │   StaminaUI     │    │PerformanceMonitor│
│                 │    │                 │    │                 │
│ • Start Screen  │    │ • Stamina Bar   │    │ • FPS Tracking  │
│ • Cinematic Cam │    │ • UI Updates    │    │ • Stats Display │
│ • Game Launch   │    │ • Visual States │    │ • Metrics       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Modules

### 1. SceneManager.js (141 lines)
**3D Scene and Rendering Management**

**Responsibilities:**
- Three.js scene initialization and configuration
- Camera system with dynamic following and zoom
- Lighting setup (ambient + directional with shadows)
- Window resize handling and viewport management
- Mouse wheel zoom controls

**Key Features:**
- **Dynamic Camera**: Smooth interpolation following sheepdog with configurable zoom (20-150 units)
- **Advanced Lighting**: Multi-light setup with shadow mapping (2048x2048 resolution)
- **Fog System**: Atmospheric depth with extended range (200-600 units)
- **Performance Optimized**: Efficient render loop with minimal state changes

**API:**
```javascript
class SceneManager {
    updateCamera(sheepdog)     // Follow sheepdog with smooth interpolation
    setupMouseControls()       // Enable zoom controls
    render()                   // Render scene to canvas
    add(object)               // Add object to scene
    getScene()                // Access Three.js scene
    getCamera()               // Access camera for start screen
}
```

### 2. TerrainBuilder.js (397 lines)
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

## Dependencies
- **Three.js v0.176.0**: 3D rendering engine
- **Stats.js v0.17.0**: Performance monitoring (FPS, memory, custom metrics)
- **HTTP Server**: Development server (Python or Node.js, port 8000)

## Performance Characteristics
- **Target**: 60 FPS with 200 sheep + 800k grass instances
- **Bottlenecks**: Grass rendering, shadow calculations
- **Optimizations**: GPU-based sheep rendering, instanced rendering, shared resources

## Extension Points
- **New Behaviors**: Extend Boid class for different agent types
- **Environmental**: Add weather, day/night cycles via shader uniforms
- **Gameplay**: Multiple levels, different objectives, obstacles, power-ups
- **Rendering**: Enhanced materials, particle effects, post-processing
- **Audio**: Sound effects and ambient audio integration
- **UI**: Additional game modes, settings, achievements 