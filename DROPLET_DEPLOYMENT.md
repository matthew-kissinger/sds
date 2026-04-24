# DigitalOcean Droplet Deployment Guide

> **DEPRECATED as of 2026-04-23.** The multiplayer server has migrated to Cloudflare Workers + Durable Objects + D1 — see [docs/cycle-2-report.md](docs/cycle-2-report.md). The droplet remains running as a soak-period fallback for the legacy `sheepdogsim.com` frontend until the DNS cutover described in [docs/cycle-2-todo.md](docs/cycle-2-todo.md) completes. This document is kept for historical reference and in case the droplet needs to be touched before it is destroyed.

## Overview (historical)

The multiplayer server runs on a DigitalOcean Droplet (VPS) with Cloudflare SSL proxy. WebRTC requires UDP port control (10000-20000) which is only available on VPS/dedicated servers, not managed platforms.

## Server Details

- **Domain**: `api.sheepdogsim.com` (Cloudflare-proxied)
- **Port**: `9208`
- **WebRTC Signaling**: `https://api.sheepdogsim.com:9208/.wrtc/v2/connections`
- **SSL**: Handled by Cloudflare (no certificate maintenance required)

## Deployment

### Upload Server Files
```bash
# Using SCP
scp -r server/* root@<droplet-ip>:/opt/sds-server/
```

### Install & Run
```bash
ssh root@<droplet-ip>
cd /opt/sds-server
npm install
pm2 start index.js --name sds-multiplayer-server
pm2 save && pm2 startup
```

## Firewall Configuration

```bash
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 9208/tcp    # Geckos.io signaling
sudo ufw allow 10000:20000/udp  # WebRTC
sudo ufw enable
```

## PM2 Commands

```bash
pm2 status                       # Check status
pm2 logs sds-multiplayer-server  # View logs
pm2 restart sds-multiplayer-server  # Restart
pm2 monit                        # Real-time monitoring
```

## Client Configuration

The client automatically detects the environment:
- `localhost/127.0.0.1` → Local dev server (`http://localhost:9208`)
- Production → `https://api.sheepdogsim.com:9208`

## Cloudflare Setup

1. Add A record: `api` → Droplet IP
2. Enable proxy (orange cloud)
3. SSL/TLS mode: Full
4. Cloudflare handles SSL certificate automatically

## Troubleshooting

### Connection Issues
```bash
# Check server status
pm2 status
pm2 logs sds-multiplayer-server

# Check port
sudo netstat -tlnp | grep 9208

# Check firewall
sudo ufw status
```

### WebRTC Issues
- Ensure UDP ports 10000-20000 are open
- Verify STUN servers are accessible
- Check browser console for ICE connection errors

## Why Droplet?

**DigitalOcean Droplet** provides:
- Full network control
- UDP port range support for WebRTC
- Direct server access
- Cost-effective (~$6/month)

**Managed platforms** (App Platform, Railway, Render) don't support:
- Custom UDP ports
- WebRTC data channels
- Full network control required by Geckos.io
