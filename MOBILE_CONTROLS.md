# Mobile Controls

## Overview

Touch-based controls for mobile devices using nipple.js for the virtual joystick.

## Controls

### Virtual Joystick (bottom-left)
- 360-degree movement control
- Loaded dynamically from CDN on touch devices
- Smooth movement with vector normalization

### Sprint Button (above joystick)
- Hold to sprint (uses stamina)
- Visual feedback on press/release

### Zoom Slider (bottom-right)
- Range: 20-150 camera units
- Synchronized with desktop mouse wheel

### Fullscreen Button
- Appears on mobile devices
- Cross-browser fullscreen API support

## Implementation

### MobileControls.js

```javascript
class MobileControls {
    constructor()
    detectTouchDevice()       // Multi-method touch detection
    loadNippleJS()            // Dynamic CDN loading
    createJoystick()          // nipple.js initialization
    createZoomSlider()        // Camera zoom control
    createSprintButton()      // Sprint with stamina
    createFullscreenButton()  // Cross-browser fullscreen
    getMovementDirection()    // Returns {x, z} vector
    getIsSprinting()          // Sprint button state
}
```

### Integration

```javascript
// InputHandler receives mobile input
inputHandler.setMobileControls(mobileControls);

// SceneManager syncs zoom
sceneManager.setMobileControls(mobileControls);
```

## Browser Support

| Platform | Browser | Support |
|----------|---------|---------|
| iOS | Safari 13+ | Full |
| iOS | Chrome 80+ | Full |
| Android | Chrome 80+ | Full |
| Android | Firefox 75+ | Full |

## Touch Prevention

```css
body {
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: none;
}
```

## Performance

- **nipple.js**: ~15KB compressed
- **Additional JS**: ~8KB
- Controls load only on touch devices
