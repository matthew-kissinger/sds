# 🚀 Deployment Guide

## Overview
This project uses the following deployment architecture:
- **Client**: GitHub Pages (static hosting) at `https://matthew-kissinger.github.io/sds/`  
- **Multiplayer Server**: Railway (WebRTC/UDP game server)

## Architecture

```
Users → GitHub Pages (Client) → Railway (Server)
     ↘                      ↗
       Single-player works offline
```

**Key Features**:
- ✅ Single-player works without server
- ✅ Multiplayer connects to Railway
- ✅ WebRTC data channels for low-latency gameplay
- ✅ Graceful fallback if server unavailable

## Pre-Deployment Checklist ✅

### 1. Local Testing
```bash
# Test local multiplayer
./start-multiplayer-servers.ps1

# Important: Use http://127.0.0.1:8080 (not localhost)
# Test with multiple browser tabs
```

### 2. Verify Server Configuration
- ✅ Server binds to `0.0.0.0` in production
- ✅ UDP port range configurable via environment
- ✅ Dockerfile uses Node.js 18+ for Geckos.io v3
- ✅ Client detects environment automatically

## Deployment Steps

### Step 1: Deploy Server to Railway 🚂

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   ```
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your game repository
   - When prompted, add a new service
   - Set root directory to: ./server
   ```

3. **Configure Environment Variables**
   In Railway dashboard → Service → Variables tab, add:
   ```
   PORT=9208
   GECKOS_UDP_PORT_MIN=10000
   GECKOS_UDP_PORT_MAX=20000
   NODE_ENV=production
   ```

4. **Configure Networking**
   In Railway dashboard → Service → Settings → Networking:
   - Generate a public domain (click "Generate Domain")
   - Note your domain (e.g., `sds-server-production.up.railway.app`)

### Step 2: Update Client Configuration 🔧

1. Update `js/NetworkManager.js`:
   ```javascript
   // Replace YOUR_RAILWAY_APP_URL with your actual Railway domain
   this.serverHost = 'sds-server-production.up.railway.app';
   ```

2. Commit and push changes:
   ```bash
   git add .
   git commit -m "Update server URL for Railway deployment"
   git push origin main
   ```

### Step 3: Verify Deployment 🧪

1. **Check Railway Logs**
   - In Railway dashboard → Service → Logs
   - Look for: "🚀 Multiplayer server started"
   - Verify UDP port range is configured

2. **Test Client Connection**
   - Visit: `https://matthew-kissinger.github.io/sds/`
   - Try "👥 Play Online"
   - Check browser console for connection logs
   - Create/join rooms with multiple tabs

3. **Monitor Performance**
   - Railway dashboard shows metrics
   - Check WebRTC connection establishment
   - Verify real-time gameplay sync

## Troubleshooting 🛠️

### Server Issues
```bash
# View Railway logs
# Go to Railway dashboard → Service → Logs

# Common issues:
# - "Cannot find module": Check Dockerfile and dependencies
# - "Port already in use": Verify PORT env var is set
# - "Connection refused": Check networking configuration
```

### Client Connection Issues
- Check browser console for errors
- Verify NetworkManager has correct Railway URL
- Ensure Railway service is running
- Try different browser/network

### UDP/WebRTC Issues
- Geckos.io uses WebRTC data channels
- Some firewalls/networks block UDP
- Test from different network if needed
- Check STUN server connectivity

### Local Development
- Always use `http://127.0.0.1:8080` (not localhost)
- Run `./start-multiplayer-servers.ps1` for local testing
- Check both terminal windows for errors

## Production URLs

- **Client**: `https://matthew-kissinger.github.io/sds/`
- **Server**: `https://YOUR_RAILWAY_APP_URL:9208` (Replace with your Railway domain)
- **Railway Dashboard**: `https://railway.app/project/YOUR_PROJECT_ID`

## Cost Information 💰

- **GitHub Pages**: Free
- **Railway**: 
  - $5 free credits/month for starters
  - Includes 500 GB-hours of compute
  - Auto-scales based on usage
  - Supports WebSocket/UDP traffic

## Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | TCP port for WebRTC signaling | 9208 | Yes |
| `GECKOS_UDP_PORT_MIN` | Start of UDP port range | 10000 | Yes |
| `GECKOS_UDP_PORT_MAX` | End of UDP port range | 20000 | Yes |
| `NODE_ENV` | Environment mode | development | Yes |

## Migration Notes

This deployment was migrated from Fly.io to Railway due to:
- Better UDP/WebRTC support
- Simpler configuration
- More predictable pricing
- Better logging and monitoring 