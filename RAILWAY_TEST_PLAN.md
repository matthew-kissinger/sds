# Railway Deployment Test Plan 🧪

## Pre-Deployment Verification

### 1. Local Environment Test
```bash
# Start local servers
./start-multiplayer-servers.ps1

# Verify in browser console at http://127.0.0.1:8080
# Expected: "🔗 DEBUG: Environment: Local Development"
# Expected: "🔗 DEBUG: Connected to multiplayer server"
```

### 2. Code Review Checklist
- [ ] Server uses `process.env.PORT` for port configuration
- [ ] Server binds to `0.0.0.0` when `NODE_ENV=production`
- [ ] UDP port range reads from `GECKOS_UDP_PORT_MIN/MAX`
- [ ] NetworkManager.js has placeholder `YOUR_RAILWAY_APP_URL`
- [ ] Dockerfile exists with Node.js 18+ base image

## Railway Deployment Verification

### 1. Build & Deploy Success
```
Railway Dashboard → Service → Deployments
- [ ] Build completed successfully
- [ ] No errors in build logs
- [ ] Service status: "Active"
```

### 2. Environment Variables Check
```
Railway Dashboard → Service → Variables
Verify all are set:
- [ ] PORT = 9208
- [ ] GECKOS_UDP_PORT_MIN = 10000
- [ ] GECKOS_UDP_PORT_MAX = 20000
- [ ] NODE_ENV = production
```

### 3. Server Startup Logs
```
Railway Dashboard → Service → Logs
Expected output:
- [ ] "🚀 Starting server in production mode"
- [ ] "🌐 Server will bind to 0.0.0.0:9208"
- [ ] "🔧 UDP port range: 10000-20000"
- [ ] "🚀 Multiplayer server started on 0.0.0.0:9208"
- [ ] "🎮 Ready for connections!"
```

## Client-Server Connection Tests

### 1. Basic Connection Test
1. Update NetworkManager.js with Railway URL
2. Deploy to GitHub Pages
3. Open browser console at GitHub Pages URL
4. Click "👥 Play Online"

Expected console output:
- [ ] "🔗 DEBUG: Environment: Production"
- [ ] "🔗 DEBUG: Connecting to https://YOUR_RAILWAY_APP_URL:9208"
- [ ] "🔗 DEBUG: Connection successful!"

### 2. Room Creation Test
1. Enter player name
2. Click "Create Room"

Verify:
- [ ] Room code displayed (4 characters)
- [ ] "Waiting for players..." message
- [ ] No console errors

Railway logs should show:
- [ ] "👤 Player [ID] connected"
- [ ] "🏠 Room [CODE] created by [ID]"

### 3. Multi-Player Join Test
1. Open second browser tab
2. Enter room code from first tab
3. Join room

Verify:
- [ ] Both players see each other in lobby
- [ ] Player count updates correctly
- [ ] Host has "Start Game" button

Railway logs should show:
- [ ] "✅ Player [ID] joined room [CODE]"
- [ ] Active connections count increased

### 4. Game Start & Sync Test
1. Host clicks "Start Game"
2. Both players enter game

Verify:
- [ ] Both players spawn with correct dog types
- [ ] Movement syncs between players
- [ ] Sheep positions are synchronized
- [ ] No rubber-banding or lag spikes

### 5. WebRTC Data Channel Test
Open browser DevTools → Network → WS tab:
- [ ] WebSocket connection established
- [ ] Messages flowing (playerInput, gameStateUpdate)
- [ ] Ping/pong messages every 25 seconds

## Performance Tests

### 1. Latency Check
In game, check debug info (if available):
- [ ] Ping < 100ms for same region
- [ ] Smooth movement interpolation
- [ ] No packet loss indicators

### 2. Stress Test
1. Create multiple rooms simultaneously
2. Have 4 players in one room

Railway Dashboard → Metrics:
- [ ] CPU usage reasonable (< 80%)
- [ ] Memory usage stable
- [ ] No crash/restart events

## Edge Case Tests

### 1. Disconnection Handling
1. Close browser tab mid-game
2. Check other player's view

Expected:
- [ ] Disconnected player disappears
- [ ] Game continues for others
- [ ] No server crashes

### 2. Server Recovery
1. Trigger Railway redeploy
2. Try connecting during deploy

Expected:
- [ ] Client shows connection error
- [ ] After deploy, can reconnect
- [ ] No zombie rooms

### 3. Network Issues Simulation
1. Use browser DevTools → Network → Throttle
2. Set to "Slow 3G"

Verify:
- [ ] Game remains playable
- [ ] Increased latency handled gracefully
- [ ] No connection drops

## Debug Tools Test

### 1. Debug Client Page
Navigate to `/debug-client.html`:
- [ ] Can connect to server
- [ ] Shows connection status
- [ ] Displays server statistics

### 2. Server Health Check
```bash
curl https://YOUR_RAILWAY_APP_URL:9208/
```
Expected: Connection attempt (even if rejected)

## Final Verification Checklist

### Single Player Mode
- [ ] Works without server connection
- [ ] No errors when server unavailable
- [ ] Smooth local gameplay

### Multiplayer Mode
- [ ] Quick Match works
- [ ] Private rooms work
- [ ] Cross-browser compatibility
- [ ] Mobile device support

### Production Readiness
- [ ] All console.log debug statements appropriate
- [ ] Error messages user-friendly
- [ ] Railway costs within budget
- [ ] Monitoring alerts configured

## Rollback Plan

If issues arise:
1. Revert NetworkManager.js to local-only
2. Update UI to show "Maintenance" message
3. Debug using Railway logs
4. Fix and redeploy

## Success Criteria

Deployment is successful when:
- ✅ Zero server crashes in 24 hours
- ✅ Average latency < 100ms
- ✅ Successful multiplayer games completed
- ✅ No critical errors in logs
- ✅ Positive user feedback

---

**Note**: Replace `YOUR_RAILWAY_APP_URL` with actual Railway domain throughout testing. 