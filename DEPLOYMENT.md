# 🚀 Deployment Guide

## Overview
This project uses GitHub Pages for static hosting:
- **Client**: GitHub Pages (static hosting) at `https://matthew-kissinger.github.io/sds/`  
- **Multiplayer**: Currently disabled (Fly.io server removed)

## ⚠️ Current Status: Multiplayer Disabled

Multiplayer functionality has been **temporarily disabled** due to Fly.io compatibility issues:
- **Single-player mode**: ✅ Fully functional on GitHub Pages
- **Multiplayer mode**: ❌ Disabled (shows error message to users)
- **Local development**: ✅ Multiplayer still works with local server

**For local multiplayer testing:**
- Run `npm run start-multiplayer-servers` in the `/server` directory  
- Use `http://127.0.0.1:PORT/` (not GitHub Pages) to access local multiplayer

## Pre-Deployment Checklist ✅

### 1. Local Testing (Phase 2)
```bash
# Test local multiplayer
npm run start-multiplayer-servers

# Open multiple browser tabs to test multiplayer
# Verify single-player mode still works
```

### 2. Code Changes Made ✅
- ✅ Server configured for Fly.io (bind to `0.0.0.0`)
- ✅ Created `fly.toml` configuration 
- ✅ Added production logging
- ✅ Updated NetworkManager for production URLs
- ✅ Client detects GitHub Pages and connects to Fly.io

## Deployment Steps

### Step 1: Deploy Server to Fly.io 🛫

```bash
# Install Fly CLI (if not already installed)
curl -L https://fly.io/install.sh | sh

# Authenticate
fly auth login

# Navigate to server directory
cd server/

# Launch app (this will create and deploy)
fly launch

# Note: When prompted:
# - App name: Use "sheepdog-multiplayer" (or accept generated name)
# - Region: Choose closest to your users
# - Don't add Redis/PostgreSQL
# - Deploy now: Yes
```

**Important**: Note the final URL you get (e.g., `https://your-app.fly.dev`)

### Step 2: Verify Server Deployment ✅

```bash
# Check logs
fly logs

# Check status
fly status

# Test endpoint (note: Geckos.io uses port 9208)
curl https://server-little-cherry-7613.fly.dev:9208/
```

### Step 3: Update Client (If App Name Different) 🔧

If Fly.io gave you a different app name than "server-little-cherry-7613":

1. Update `js/NetworkManager.js`:
```javascript
this.serverHost = window.location.hostname === 'matthew-kissinger.github.io' ? 
    'your-actual-app-name.fly.dev' : // ← Update this line
    '127.0.0.1';
```

### Step 4: Push to GitHub Pages 📄

```bash
# Commit all changes
git add .
git commit -m "Add multiplayer server deployment configuration"

# Push to GitHub (triggers GitHub Pages update)
git push origin main
```

### Step 5: Verify Production Setup 🧪

1. Visit: `https://matthew-kissinger.github.io/sds/`
2. Try "👥 Play Online" → Should connect to Fly.io server
3. Try "🐕 Play Solo" → Should work locally without server
4. Test with multiple browser tabs/devices

## Troubleshooting 🛠️

### Server Issues
```bash
# Check server logs
fly logs --app server-little-cherry-7613

# Check server status
fly status --app server-little-cherry-7613

# Restart server
fly restart --app server-little-cherry-7613
```

### Client Connection Issues
- Check browser console for connection errors
- Verify NetworkManager is using correct production URL
- Ensure Fly.io server is running (`fly status`)

### UDP/WebRTC Issues
- Geckos.io uses WebRTC which may be blocked by some firewalls
- Server logs will show connection attempts
- Try from different networks if issues persist

### Local Development Issues
- **Important**: Use `http://127.0.0.1:PORT/` instead of `http://localhost:PORT/` (per Geckos.io docs)
- If server never establishes connection, may need to expose OPENSSL environment variables

## Production URLs

- **Client**: `https://matthew-kissinger.github.io/sds/`
- **Server**: `https://server-little-cherry-7613.fly.dev:9208` (Geckos.io signaling)
- **Server Logs**: `fly logs --app server-little-cherry-7613`
- **Server Dashboard**: `https://fly.io/apps/server-little-cherry-7613`

## Cost Information 💰

- **GitHub Pages**: Free
- **Fly.io**: Free tier includes:
  - 3 shared-cpu-1x VMs
  - 160GB-hours/month
  - Auto-scaling (sleeps when not used)

## Architecture

```
Users → GitHub Pages (Client) → Fly.io (Server)
     ↘                      ↗
       Single-player works offline
```

**Key Features**:
- ✅ Single-player works without server
- ✅ Multiplayer connects to Fly.io 
- ✅ Graceful fallback if server unavailable
- ✅ Auto-scaling server (sleeps when unused) 