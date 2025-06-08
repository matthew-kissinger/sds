# Start Game Server
Write-Host "Starting authoritative game server on port 3000..." -ForegroundColor Green
Write-Host "Server will be available at http://127.0.0.1:3000" -ForegroundColor White
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

cd server
$env:PORT=3000
node index.js 