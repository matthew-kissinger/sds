# Sheep Dog Simulation

A sophisticated web-based herding simulation where players control a sheepdog to guide 200 sheep through a gate into a designated pasture. The simulation features realistic boid flocking behavior, immersive 3D environments, competitive timing mechanics, and polished user experience with cinematic start screen, stamina system, pause functionality, and **full mobile touch controls**.

## 🎮 Features

### Core Gameplay
- **Interactive Herding**: Control a sheepdog using WASD keys or touch controls to guide sheep through a gate
- **Stamina System**: Sprint with Shift key or sprint button while managing stamina for strategic gameplay
- **Realistic AI**: 200 sheep with sophisticated boid flocking behavior (cohesion, separation, alignment)
- **Goal-Oriented**: Guide all sheep through the gate into the sleeping pasture
- **Competitive Timing**: Race against the clock with best time tracking

### Mobile & Touch Support 📱
- **Virtual Joystick**: Touch-based movement control using nipple.js library
- **Zoom Slider**: Vertical slider for camera distance adjustment on mobile
- **Sprint Button**: Touch-optimized sprint control with visual feedback
- **Responsive Design**: Mobile-optimized UI layouts and touch-friendly interactions
- **Cross-Platform**: Seamless experience across desktop and mobile devices

### User Experience
- **Cinematic Start Screen**: Professional start screen with orbital camera showcasing the field
- **Pause System**: Escape key or touch pauses all game systems with visual indicator
- **Stamina Management**: Visual stamina bar with color-coded states and sprint mechanics
- **Smooth Transitions**: Polished UI transitions between start screen and gameplay
- **Enhanced Controls**: Responsive movement with acceleration/deceleration and sprint system

### Visual & Environmental
- **Expansive World**: Extended grass coverage reaching to the horizon (800x800 units)
- **Realistic Terrain**: Multi-layered mountains with geometric variation
- **Detailed Forests**: Realistic trees with trunks, multiple foliage layers, and pine varieties
- **Dynamic Grass**: 800,000 animated grass instances with wind effects via shaders
- **Atmospheric Effects**: Fog system and advanced lighting for depth and immersion
- **Enhanced Sheepdog**: Detailed 3D model with realistic animations and idle behaviors

### Game Systems
- **Timer System**: Automatic timing with best score persistence in localStorage
- **Progress Tracking**: Real-time sheep count and completion status
- **Boundary System**: Intelligent field boundaries with fence structures
- **Gate Mechanics**: Directional passage detection with velocity validation
- **Performance Monitor**: Toggle-able performance statistics with 'P' key

### Technical Excellence
- **Modular Architecture**: Clean, maintainable code structure with separated concerns
- **Performance Optimized**: Instanced rendering for grass, shared geometries for efficiency
- **Responsive Design**: Dynamic camera system with mouse wheel zoom control
- **Cross-Platform**: Works on desktop and modern mobile browsers with touch controls

## 🚀 Quick Start

### Prerequisites
- Modern web browser (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)
- Local web server (Python, Node.js, or any HTTP server)
- **Mobile**: iOS 13+, Android Chrome 80+, or equivalent modern mobile browser

### Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd sheep-dog
   ```

2. **Start a local web server**
   
   Using Python 3:
   ```bash
   python -m http.server 8000
   ```
   
   Using Node.js (if you have `http-server` installed):
   ```bash
   npx http-server -p 8000
   ```

3. **Open in browser**
   Navigate to `http://localhost:8000`

## 🌐 Multiplayer Mode

### Online Multiplayer
The game supports real-time multiplayer with up to 4 players per room:

- **Room-based System**: Create private rooms or use quick match
- **Real-time Sync**: Low-latency gameplay using WebRTC data channels
- **Competitive Mode**: Race against other players to herd sheep fastest
- **Server Hosting**: Multiplayer server deployed on Railway

### Multiplayer Features
- **Create/Join Rooms**: Share 4-letter room codes with friends
- **Quick Match**: Automatically join available public games
- **Multiple Dog Types**: Choose between Jep, Rory, or Pip
- **Live Player Count**: See other players in real-time
- **Synchronized Sheep**: All players see the same sheep positions

### Server Status
- **Production Server**: Check deployment documentation for current server URL
- **Local Testing**: Run `./start-multiplayer-servers.ps1` for local multiplayer
- **Fallback Mode**: Single-player works offline if server unavailable

### Setting Up Multiplayer (Developers)
See [RAILWAY_SETUP.md](RAILWAY_SETUP.md) for deploying your own multiplayer server.

## 🎯 How to Play

### Desktop Controls
- **W** - Move forward
- **A** - Move left  
- **S** - Move backward
- **D** - Move right
- **Shift** - Sprint (uses stamina)
- **Escape** - Pause/Resume game
- **Mouse Wheel** - Zoom in/out
- **P** - Toggle performance statistics
- **Enter** - Start game (on start screen)

### Mobile Controls 📱
- **Virtual Joystick** (bottom-left) - Move in any direction
- **Sprint Button** 🏃 (above joystick) - Hold to sprint
- **Zoom Slider** (bottom-right) - Adjust camera distance
- **Tap Pause Indicator** - Resume when paused
- **Touch Screen** - Toggle sound

### Objective
Guide all 200 sheep through the golden gate into the pasture as quickly as possible!

### Strategy Tips
1. **Manage stamina wisely** - Sprint strategically to conserve energy for crucial moments
2. **Position strategically** - Get behind the flock relative to the gate
3. **Use flock dynamics** - Moving one sheep influences nearby sheep
4. **Apply gentle pressure** - Steady guidance works better than aggressive chasing
5. **Utilize boundaries** - Use fences to help funnel sheep toward the gate
6. **Time management** - Timer starts on first movement, so plan your approach
7. **Rest when possible** - Stamina regenerates faster when not moving

## 🏗️ Architecture

### Modular Design
The simulation uses a clean, modular architecture for maintainability and extensibility:

```
js/
├── main.js              # Main orchestrator with mobile integration (204 lines)
├── SceneManager.js      # 3D scene and rendering management (141 lines)
├── TerrainBuilder.js    # Environment creation (397 lines)
├── StructureBuilder.js  # Game structures (471 lines)
├── GameState.js         # Game logic and state management (242 lines)
├── GameTimer.js         # Timer system and best time tracking (181 lines)
├── StartScreen.js       # Start screen and cinematic camera (136 lines)
├── StaminaUI.js         # Stamina bar UI management (105 lines)
├── MobileControls.js    # Mobile touch controls system (NEW - 400+ lines)
├── Boid.js             # Base AI behavior system (248 lines)
├── OptimizedSheep.js   # High-performance sheep system (788 lines)
├── Sheepdog.js         # Enhanced player controller (683 lines)
├── InputHandler.js     # Enhanced input with mobile support (182 lines)
├── PerformanceMonitor.js # Real-time performance tracking (377 lines)
└── Vector2D.js         # 2D mathematics utilities (102 lines)
```

### Module Responsibilities

#### **MobileControls** - Touch Interface (NEW)
- Touch device detection and capability assessment
- Virtual joystick creation using nipple.js library
- Zoom slider for camera control on mobile devices
- Sprint button with touch-optimized feedback
- Touch event prevention and mobile behavior management

#### **SceneManager** - 3D Rendering (Enhanced)
- Three.js scene setup and management
- Camera control and following system
- Lighting configuration (ambient + directional)
- Mouse wheel zoom functionality (desktop) + mobile zoom integration

#### **InputHandler** - Input Management (Enhanced)
- WASD movement input handling (desktop)
- Virtual joystick integration (mobile)
- Sprint control with Shift key or touch button
- Pause system with Escape key or touch
- Cross-platform input coordination

#### **TerrainBuilder** - Environment
- Flat terrain generation (1000x1000 units)
- Instanced grass system (800,000 blades with wind shaders)
- Multi-layered mountain generation with geometric variation
- Realistic tree creation (deciduous and pine varieties)
- Environmental details (rocks, atmospheric effects)

#### **StructureBuilder** - Game Structures
- Field boundary fence system
- Gate construction with detection zones
- Pasture area with custom textures
- Fence rail connection algorithms

#### **GameState** - Logic & Configuration
- Game boundaries and parameters
- Sheep flock creation and behavior coordination
- Completion detection and UI updates
- Game state management and reset functionality
- Pause state coordination

#### **GameTimer** - Timing System
- Precision timing with performance.now()
- Best time persistence in localStorage
- New record detection and celebration
- Timer display formatting and UI updates
- Pause state handling

#### **StartScreen** - Pre-Game Experience
- Start screen overlay management
- Cinematic camera system with orbital movement
- Game launch coordination and UI transitions
- Interactive start button and keyboard support

#### **StaminaUI** - Stamina System Interface
- Stamina bar display with color-coded states
- Performance-optimized UI updates
- Visual feedback for sprinting and exhaustion
- Real-time stamina percentage display

#### **Sheepdog** - Enhanced Player Controller
- Smooth movement with acceleration/deceleration
- Stamina system with sprint mechanics
- Detailed 3D model with realistic animations
- Multiple idle behaviors for immersion

## 📱 Mobile Features

### Touch Controls
- **Virtual Joystick**: 360-degree movement control with visual feedback
- **Sprint Button**: Touch-optimized sprint control with color changes
- **Zoom Slider**: Vertical slider for smooth camera distance adjustment
- **Responsive UI**: Mobile-optimized layouts and touch-friendly sizes

### Device Detection
- **Automatic Detection**: Touch capability detection using multiple methods
- **Progressive Enhancement**: Desktop controls remain fully functional
- **Cross-Platform**: Works on iOS, Android, and other touch devices

### Performance Optimizations
- **Lazy Loading**: Mobile controls load only on touch devices
- **Efficient Events**: Optimized touch event handling
- **Memory Management**: Proper cleanup and resource management
- **Battery Friendly**: Minimal overhead for mobile devices

### Mobile-Specific Features
- **Touch Prevention**: Disabled zoom, scroll, and interfering behaviors
- **Responsive Design**: Adaptive layouts for different screen sizes
- **Visual Feedback**: Enhanced touch feedback and state indicators
- **Accessibility**: Touch-optimized button sizes and interactions

For detailed mobile implementation information, see [MOBILE_CONTROLS.md](MOBILE_CONTROLS.md).

## 🎨 Visual Features

### Enhanced Sheepdog Model
- **Detailed Design**: Procedural Border Collie with realistic proportions
- **Rich Animations**: Running, idle, breathing, looking around, ear twitching, stretching
- **Visual Feedback**: Tongue visibility when running fast, different animation speeds
- **Smooth Movement**: Acceleration-based movement with realistic turning

### Grass System
- **800,000 instances** for dense, realistic coverage
- **Shader-based animation** with complex wind patterns
- **Distance-based scaling** for realistic perspective
- **Fog integration** for atmospheric depth

### Mountain Generation
- **Multi-layered depth** with front, middle, and back mountain ranges
- **Geometric variation** with procedural vertex displacement
- **Material variety** with multiple mountain materials
- **Realistic scaling** and positioning for natural appearance

### Tree System
- **Realistic structure** with separate trunks and foliage
- **Multiple varieties** including deciduous and pine trees
- **Layered foliage** for fuller, more natural appearance
- **Strategic placement** around mountains and distant areas

### User Interface
- **Professional Start Screen**: Cinematic camera with game instructions
- **Stamina Bar**: Color-coded stamina display with state indicators
- **Pause System**: Clear pause overlay with resume instructions
- **Performance Stats**: Toggle-able FPS and rendering statistics
- **Mobile UI**: Touch-optimized controls and responsive layouts

## ⚡ Performance

### Optimizations
- **Instanced rendering** for grass (single draw call for 800k instances)
- **GPU-based sheep rendering** with single InstancedMesh for all 200 sheep
- **Vertex shader animation** for sheep movement and behavior
- **Shared geometries** for environmental objects
- **LOD considerations** with distance-based scaling
- **Efficient shadow mapping** with optimized shadow camera settings
- **Mobile optimizations** with lazy loading and efficient touch handling

### System Requirements

#### Desktop
- **Recommended**: Modern desktop with dedicated graphics
- **Minimum**: Integrated graphics with hardware acceleration enabled
- **Memory**: ~150MB for full scene with optimized rendering
- **Target Performance**: 60 FPS with 200 sheep + 800k grass instances

#### Mobile
- **iOS**: 13+ (Safari, Chrome, Firefox)
- **Android**: Chrome 80+, Firefox 75+, Samsung Internet 12+
- **Memory**: ~100MB optimized for mobile constraints
- **Target Performance**: 30-60 FPS depending on device capabilities

## 🛠️ Development

### Adding New Features
The modular architecture makes it easy to extend:

1. **New Behaviors**: Extend the `Boid` class for different AI entities
2. **Environmental Elements**: Add methods to `TerrainBuilder` for new terrain features
3. **Game Mechanics**: Extend `GameState` for new gameplay systems
4. **Visual Effects**: Enhance `SceneManager` for new rendering features
5. **UI Components**: Create new UI modules following the `StaminaUI` pattern
6. **Mobile Features**: Extend `MobileControls` for new touch interactions

### Code Style
- **ES6 Classes** for clear object-oriented structure
- **Descriptive naming** for methods and variables
- **Modular design** with single responsibility principle
- **Comprehensive comments** for complex algorithms
- **Cross-platform compatibility** considerations

## 🔧 Customization

### Adjustable Parameters (in GameState.js)
```javascript
params: {
    speed: 0.1,              // Sheep movement speed
    cohesion: 1.0,           // Flock cohesion strength  
    separationDistance: 2.0   // Minimum separation distance
}
```

### Stamina Settings (in Sheepdog.js)
```javascript
maxStamina: 100,
staminaDrainRate: 30,        // Stamina per second when sprinting
staminaRegenRate: 20,        // Stamina per second when not sprinting
minStaminaToSprint: 10,      // Minimum stamina to start sprinting
maxSpeed: 15,                // Normal movement speed
sprintSpeed: 25              // Sprint movement speed
```

### Mobile Controls Settings (in MobileControls.js)
```javascript
// Joystick configuration
joystick: {
    size: 120,               // Joystick size in pixels
    color: '#00BFFF',        // Joystick color
    threshold: 0.1,          // Movement threshold
    restOpacity: 0.7         // Opacity when not in use
}

// Zoom slider configuration
zoom: {
    min: 20,                 // Minimum zoom distance
    max: 150,                // Maximum zoom distance
    default: 80              // Default zoom level
}
```

### Environment Settings
- **Field boundaries**: Modify `bounds` object in GameState
- **Grass density**: Adjust `instanceCount` in TerrainBuilder
- **Mountain placement**: Edit `mountainLayers` arrays
- **Tree distribution**: Modify tree generation loops

## 📱 Browser Compatibility

| Platform | Browser | Minimum Version | Mobile Controls |
|----------|---------|----------------|-----------------|
| Desktop  | Chrome  | 80+            | N/A             |
| Desktop  | Firefox | 75+            | N/A             |
| Desktop  | Safari  | 13+            | N/A             |
| Desktop  | Edge    | 80+            | N/A             |
| iOS      | Safari  | 13+            | ✅ Full Support |
| iOS      | Chrome  | 80+            | ✅ Full Support |
| Android  | Chrome  | 80+            | ✅ Full Support |
| Android  | Firefox | 75+            | ✅ Full Support |
| Android  | Samsung | 12+            | ✅ Full Support |

### WebGL Requirements
- **WebGL 1.0** minimum (for Three.js compatibility)
- **Hardware acceleration** enabled for optimal performance
- **Shader support** for grass animation effects
- **Touch events** for mobile control functionality

## 🏆 Scoring System

- **Timer starts** on first movement
- **Timer stops** when all sheep pass through the gate
- **Best times** are automatically saved to localStorage
- **New records** are celebrated with special animations
- **Restart functionality** to attempt better times
- **Pause system** preserves accurate timing

## 📄 License

This project is open source and available under the MIT License. Feel free to modify, distribute, and use for educational purposes.

## 🐛 Troubleshooting

### Common Issues

**Simulation won't load:**
- Ensure you're using a web server (not file:// protocol)
- Check browser console for JavaScript errors
- Verify Three.js CDN accessibility

**Mobile controls not appearing:**
- Verify touch device detection is working
- Check that nipple.js library loads successfully
- Ensure JavaScript is enabled and no ad blockers interfere

**Poor performance:**
- Enable hardware acceleration in browser settings
- Close resource-intensive applications
- Try reducing browser zoom level
- Check if WebGL is properly enabled

**Timer not working:**
- Ensure localStorage is enabled in your browser
- Check for browser extensions blocking local storage
- Verify JavaScript is enabled

**Controls unresponsive:**
- Click on the game window to ensure focus
- Check for browser extensions intercepting input
- Verify no accessibility software is interfering
- On mobile, ensure touch events are not blocked

**Stamina system not working:**
- Ensure you're holding Shift or sprint button to sprint
- Check that the stamina bar is visible (game must be started)
- Verify the sheepdog is moving (stamina only drains during movement)

### Performance Tips
- **Desktop recommended** for best experience
- **Close unnecessary browser tabs** to free up memory
- **Update graphics drivers** for optimal WebGL performance
- **Use latest browser version** for best Three.js compatibility
- **Mobile**: Close background apps for better performance

### Mobile-Specific Tips
- **Landscape orientation** recommended for better control layout
- **Stable internet** required for CDN library loading
- **Touch calibration** may be needed on some devices
- **Battery optimization** disable for best performance

## 🤝 Contributing

Contributions are welcome! Areas for improvement:
- Additional sheep behaviors and AI states
- Weather and day/night cycle systems
- Multiple difficulty levels and objectives
- Enhanced particle effects and post-processing
- Advanced mobile features (haptic feedback, gestures)
- Sound effects and ambient audio
- Achievement system and game modes
- Multiplayer functionality
- Accessibility improvements 