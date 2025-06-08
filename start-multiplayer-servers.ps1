# Start Multiplayer Sheepdog Servers
# Opens two terminals: one for the authoritative game server, one for client HTTP server

Write-Host "Starting Multiplayer Sheepdog Servers..." -ForegroundColor Green

# Terminal 1: Authoritative Game Server (port 3000)
Write-Host "Starting authoritative game server on port 3000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; Write-Host 'Authoritative Game Server (Port 3000)' -ForegroundColor Green; cd server; `$env:PORT=3000; node index.js"

# Wait a moment for server to start
Start-Sleep -Seconds 2

# Terminal 2: HTTP Server for Client (port 8080)  
Write-Host "Starting HTTP server for client on port 8080..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; Write-Host 'Client HTTP Server (Port 8080)' -ForegroundColor Cyan; Write-Host 'Open http://localhost:8080 in your browser' -ForegroundColor White; python -m http.server 8080"

Write-Host ""
Write-Host "Both servers started!" -ForegroundColor Green
Write-Host "Game Server: http://127.0.0.1:3000" -ForegroundColor Yellow  
Write-Host "Client: http://localhost:8080" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to close all servers..." -ForegroundColor White
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Kill all node and python processes when script ends
Write-Host "Stopping servers..." -ForegroundColor Red
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "python" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "Servers stopped!" -ForegroundColor Green 