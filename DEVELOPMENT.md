# Development Guide

## Quick Start

### Prerequisites
- Node.js 20.19+ or 22.12+
- npm

### Installation
```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..
```

---

## Development Scripts

### Frontend Only (Single Player)

```bash
# Local development (localhost:3000)
npm run dev

# LAN accessible (for mobile testing)
npm run dev:lan
```

### Backend Server Only

```bash
# Production mode
npm run server

# Development mode (auto-restart on changes)
npm run server:dev
```

### Full Stack (Frontend + Backend)

```bash
# Local development
npm run dev:full

# LAN accessible (for mobile testing on same WiFi)
npm run dev:lan:full
```

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Preview on LAN (mobile testing)
npm run preview:lan
```

---

## Mobile Testing on Local Network

### Step 1: Start LAN Development Server
```bash
npm run dev:lan:full
```

This will output something like:
```
  VITE v7.2.2  ready in 500 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.1.100:3000/
```

### Step 2: Connect from Mobile Device
1. Ensure your phone is on the same WiFi network as your computer
2. Open the **Network** URL on your phone's browser (e.g., `http://192.168.1.100:3000/`)

### Step 3: For Multiplayer Testing
The backend server runs on port **9208** by default. The frontend is configured to connect to:
- Production: `api.sheepdogsim.com`
- Local: `localhost:9208`

For local multiplayer testing, you may need to update the server URL in the frontend code or use environment variables.

---

## Port Configuration

| Service | Default Port | Environment Variable |
|---------|-------------|---------------------|
| Frontend (Vite) | 3000 | - |
| Backend (Geckos.io) | 9208 | `PORT` |

---

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Kill process on port 3000 (Mac/Linux)
lsof -i :3000
kill -9 <PID>
```

### Clean Vite Cache
```bash
npm run clean
```

### Mobile Can't Connect
1. Check firewall settings - allow Node.js through Windows Firewall
2. Ensure both devices are on same network
3. Try disabling VPN if active
4. On Windows: Run `ipconfig` to verify your local IP

---

## Environment Variables

Create a `.env` file for local overrides:

```env
# Backend
PORT=9208

# Frontend (create .env.local)
VITE_API_URL=http://localhost:9208
```

---

## VS Code Tasks (Optional)

Add to `.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Dev: Frontend",
      "type": "npm",
      "script": "dev",
      "problemMatcher": []
    },
    {
      "label": "Dev: Full Stack",
      "type": "npm",
      "script": "dev:full",
      "problemMatcher": []
    },
    {
      "label": "Dev: LAN (Mobile Testing)",
      "type": "npm",
      "script": "dev:lan:full",
      "problemMatcher": []
    }
  ]
}
```
