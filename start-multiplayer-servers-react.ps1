# Start Multiplayer Sheepdog Servers with React
# Opens two terminals: one for the authoritative game server, one for React dev server

Write-Host "Starting Multiplayer Sheepdog Servers with React..." -ForegroundColor Green

# Terminal 1: Authoritative Game Server (port 9208)
Write-Host "Starting authoritative game server on port 9208..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; Write-Host 'Authoritative Game Server (Port 9208)' -ForegroundColor Green; cd server; `$env:PORT=9208; `$env:GECKOS_UDP_PORT_MIN=10000; `$env:GECKOS_UDP_PORT_MAX=20000; `$env:NODE_ENV='development'; node index.js"

# Wait a moment for server to start
Start-Sleep -Seconds 2

# Terminal 2: React Dev Server with Vite (port 3000)  
Write-Host "Starting React dev server on port 3000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; Write-Host 'React Dev Server (Port 3000)' -ForegroundColor Cyan; Write-Host 'Starting Vite...' -ForegroundColor White; npm run dev-react"

Write-Host ""
Write-Host "Both servers started!" -ForegroundColor Green
Write-Host "Game Server: http://127.0.0.1:9208" -ForegroundColor Yellow  
Write-Host "React Client: http://127.0.0.1:3000" -ForegroundColor Cyan
Write-Host "Important: Use 127.0.0.1, not localhost!" -ForegroundColor Red
Write-Host ""
Write-Host "Press any key to close all servers..." -ForegroundColor White
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Kill all node processes when script ends
Write-Host "Stopping servers..." -ForegroundColor Red
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "Servers stopped!" -ForegroundColor Green