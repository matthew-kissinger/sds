# Start Client HTTP Server
Write-Host "Starting HTTP server for client..." -ForegroundColor Cyan
Write-Host "Open http://localhost:8080 in your browser" -ForegroundColor White
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

python -m http.server 8080 