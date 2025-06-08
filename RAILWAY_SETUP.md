# Railway Setup Quick Reference 🚂

## Prerequisites
- GitHub account with your game repository
- Railway account (sign up at railway.app)
- Local development environment working

## Step-by-Step Railway Setup

### 1. Create Railway Project
```
1. Go to https://railway.app/new
2. Click "Deploy from GitHub repo"
3. Authorize Railway to access GitHub
4. Select your game repository
5. Click "Add Service" when prompted
```

### 2. Configure Service Settings
```
Service → Settings:
- Service Name: sds-server (or your preference)
- Root Directory: /server
- Start Command: (leave empty, uses Dockerfile)
```

### 3. Add Environment Variables
```
Service → Variables → Add Variable:

PORT                  = 9208
GECKOS_UDP_PORT_MIN  = 10000
GECKOS_UDP_PORT_MAX  = 20000
NODE_ENV             = production
```

### 4. Generate Public URL
```
Service → Settings → Networking:
1. Click "Generate Domain"
2. Copy the generated URL (e.g., sds-server-production.up.railway.app)
```

### 5. Update Client Code
Edit `js/NetworkManager.js`:
```javascript
// Replace this line:
this.serverHost = 'YOUR_RAILWAY_APP_URL';

// With your actual Railway URL:
this.serverHost = 'sds-server-production.up.railway.app';
```

### 6. Deploy Changes
```bash
git add .
git commit -m "Configure Railway deployment"
git push origin main
```

## Verification Commands

### Check Deployment Status
```
Railway Dashboard → Service → Deployments
- Look for green checkmark
- Click to view build logs
```

### Monitor Server Logs
```
Railway Dashboard → Service → Logs
- Real-time log streaming
- Search/filter capabilities
```

### Test Connection
```javascript
// Browser console at your GitHub Pages URL
// Should see connection success messages
```

## Common Issues & Solutions

### Issue: Build Fails
```
Solution:
- Check Dockerfile syntax
- Verify package.json exists
- Ensure Node.js version >= 16
```

### Issue: Connection Refused
```
Solution:
- Verify PORT env var is set
- Check public domain is generated
- Ensure server started successfully
```

### Issue: WebRTC/UDP Not Working
```
Solution:
- Verify UDP port range env vars
- Check browser console for errors
- Test from different network
```

## Railway CLI (Optional)

Install Railway CLI:
```bash
npm install -g @railway/cli
```

Login:
```bash
railway login
```

Link project:
```bash
railway link
```

View logs:
```bash
railway logs
```

## Cost Optimization

- Railway provides $5 free credits monthly
- Monitor usage in dashboard
- Server auto-sleeps when inactive
- Wake-up time ~5-10 seconds

## Rollback Procedure

If deployment fails:
1. Railway Dashboard → Deployments
2. Find last working deployment
3. Click "..." → "Redeploy"
4. Reverts to that version instantly

## Support Resources

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Geckos.io Docs: https://github.com/geckosio/geckos.io

---

**Remember**: Always test locally first with `./start-multiplayer-servers.ps1` 