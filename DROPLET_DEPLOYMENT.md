# 🚀 DigitalOcean Droplet Deployment Guide

## ✅ **Migration Complete: App Platform → Droplet**

Successfully migrated from DigitalOcean App Platform (PaaS) to DigitalOcean Droplet (VPS) for **full UDP support** required by Geckos.io WebRTC networking.

## 🎯 **Droplet Details**

- **Public IP**: `68.183.107.158`
- **Droplet ID**: `501104628`
- **Server URL**: `http://68.183.107.158:9208`
- **WebRTC Signaling**: `http://68.183.107.158:9208/.wrtc/v2/connections`

## 🔧 **What Was Changed**

### **Server Refactoring**
- ✅ Removed App Platform specific configurations  
- ✅ Simplified to bind to `0.0.0.0:9208` (all interfaces)
- ✅ Removed health check HTTP server conflicts
- ✅ Optimized for direct Droplet deployment

### **Client Updates**
- ✅ Updated NetworkManager.js to use Droplet IP: `68.183.107.158:9208`
- ✅ Changed from HTTPS to HTTP for Droplet connection
- ✅ Fixed Geckos.io client configuration for direct server connection

## 🚀 **Deployment Steps**

### **Option A: Automated Upload (Recommended)**

1. **Run the upload script:**
   ```powershell
   .\upload-to-droplet.ps1
   ```

2. **SSH into your droplet:**
   ```bash
   ssh root@68.183.107.158
   ```

3. **Run the setup script:**
   ```bash
   cd /opt/sds-server
   ./deploy-to-droplet.sh
   ```

4. **Install dependencies and start:**
   ```bash
   npm install
   pm2 start ecosystem.config.js
   pm2 save && pm2 startup
   ```

### **Option B: Manual Upload**

1. **Use FileZilla/WinSCP to upload to `68.183.107.158:/opt/sds-server/`:**
   - `server/index.js`
   - `server/RoomManager.js` 
   - `server/GameSimulation.js`
   - `server/package.json`
   - `server/shared/` (directory)
   - `server/deploy-to-droplet.sh`

2. **Follow steps 2-4 from Option A**

## 🔥 **Firewall Configuration**

The deployment script automatically configures:
- **SSH**: `22/tcp` 
- **Geckos.io Signaling**: `9208/tcp`
- **WebRTC UDP Range**: `10000-20000/udp` ⭐ **This is why Droplets work!**

## 🎮 **Testing Connection**

1. **Start your local client** (index.html)
2. **Client will automatically detect environment:**
   - `localhost/127.0.0.1` → Local development server
   - **Any other hostname** → Droplet server (`68.183.107.158:9208`)

3. **Expected logs:**
   ```
   🔗 DEBUG: Connecting to http://68.183.107.158:9208 (Droplet)
   🔗 DEBUG: Environment: Production  
   🔗 DEBUG: Geckos config: {url: "http://68.183.107.158", port: 9208}
   ```

## 📊 **Server Management**

### **PM2 Commands:**
```bash
pm2 status                    # Check server status
pm2 logs sds-multiplayer-server  # View logs
pm2 restart sds-multiplayer-server  # Restart server
pm2 stop sds-multiplayer-server     # Stop server
pm2 monit                     # Real-time monitoring
```

### **Check Server Health:**
```bash
curl http://68.183.107.158:9208/.wrtc/v2/connections
```

## 🚨 **Troubleshooting**

### **If connection fails:**

1. **Check server status:**
   ```bash
   ssh root@68.183.107.158
   pm2 status
   pm2 logs sds-multiplayer-server
   ```

2. **Verify firewall:**
   ```bash
   sudo ufw status
   ```

3. **Check if port is open:**
   ```bash
   sudo netstat -tlnp | grep 9208
   ```

4. **Restart server:**
   ```bash
   pm2 restart sds-multiplayer-server
   ```

## 🎉 **Why This Works**

**✅ DigitalOcean Droplets** provide:
- Full network control
- UDP port range support (10000-20000)  
- No platform restrictions on WebRTC
- Direct server access for debugging

**❌ App Platform** limitations:
- Only HTTP/HTTPS ports (80/443)
- No UDP port range support
- Platform abstraction prevents WebRTC networking

## 🔄 **Next Steps**

Your multiplayer Sheepdog game now has:
- ✅ **Full WebRTC/UDP support** 
- ✅ **Low-latency networking** via Geckos.io
- ✅ **Scalable server** with PM2 process management  
- ✅ **Automatic restarts** and monitoring
- ✅ **Production-ready** deployment

**Ready to test multiplayer! 🐕🎮** 