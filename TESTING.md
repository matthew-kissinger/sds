# Sheep Dog Simulator - Testing Guide

## Quick Start

### Single Player
```bash
npm run dev
# Open http://localhost:3000
```

### Multiplayer
```bash
# Terminal 1: Start game server
cd server && npm start

# Terminal 2: Start client
npm run dev
```

## Features to Test

### Start Screen
- [ ] Title and animations
- [ ] Dog selection (Jep, Pip, Shiloh)
- [ ] Single Player / Multiplayer buttons
- [ ] Sound toggle

### Single Player
- [ ] Stamina bar (top center)
- [ ] Timer (top right)
- [ ] Sheep counter (top left)
- [ ] Mobile controls (on touch devices)
- [ ] Gamepad support

### Multiplayer
- [ ] Room creation (4-letter codes)
- [ ] Join room with code
- [ ] Quick match
- [ ] Game modes:
  - Collaborative: Work together to herd 200 sheep
  - Competitive: Race to collect sheep (first to 101 in 2-player)
  - Timed: 3-minute countdown, highest score wins
- [ ] In-game scoreboard
- [ ] Player synchronization

## Browser Requirements
- Modern browser with ES6 and WebGL support
- WebRTC support for multiplayer
- Touch events for mobile controls
