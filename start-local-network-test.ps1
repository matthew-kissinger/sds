# Start Local Network Test Server for Single Player
# Uses npx http-server to serve on all network interfaces

Write-Host "Starting Local Network Test Server..." -ForegroundColor Green
Write-Host ""

# Get local IP address
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notmatch "^169\.254\." -and $_.IPAddress -notmatch "^127\."} | Select-Object -First 1).IPAddress

if (-not $localIP) {
    Write-Host "ERROR: Could not determine local IP address!" -ForegroundColor Red
    Write-Host "Please check your network connection." -ForegroundColor Red
    pause
    exit
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "STARTING HTTP SERVER" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Your local IP: $localIP" -ForegroundColor Cyan
Write-Host ""
Write-Host "ACCESS THE GAME FROM:" -ForegroundColor Yellow
Write-Host "  Phone/Tablet: http://${localIP}:8080" -ForegroundColor White
Write-Host "  This PC:     http://localhost:8080" -ForegroundColor White
Write-Host ""
Write-Host "Make sure devices are on same WiFi!" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Run http-server with npx (binds to all interfaces by default)
# The . tells it to serve from current directory instead of ./public
npx http-server . -p 8080 -a 0.0.0.0 -c-1 --cors