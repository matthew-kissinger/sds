# Sheep Dog Simulator - Testing Guide

## Quick Start

### Single Player Testing
1. Open a terminal in the project directory
2. Run: `python -m http.server 8080`
3. Open browser to: http://127.0.0.1:8080

### Multiplayer Testing
1. Run the PowerShell script: `.\start-multiplayer-servers.ps1`
2. This will start:
   - Game server on port 9208
   - HTTP server on port 8080
3. Open browser to: http://127.0.0.1:8080
4. Test multiplayer features:
   - Create Room
   - Join Room (use the 6-character code)
   - Quick Match

## Features to Test

### UI Features
- [x] Toony title with animations
- [x] Translucent background
- [x] Dog selection (Jep default)
- [x] Single Player / Multiplayer buttons

### Single Player
- [x] Stamina bar (top center)
- [x] Timer (top right)
- [x] Sheep counter (top left)
- [x] Mobile controls (if on mobile)

### Multiplayer
- [x] Room creation (2-4 players)
- [x] Game modes:
  - Collaborative: Work together to herd all 200 sheep
  - Competitive: 2 players race to 101, 3-4 players highest score wins
  - Timed: 3-minute timer, highest score wins
- [x] Lobby system with room codes
- [x] In-game scoreboard
- [x] Competitive progress bar (2-player mode)
- [x] Timed mode countdown

## Browser Requirements
- Modern browser with ES6 support
- WebRTC support for multiplayer
- Touch support for mobile controls