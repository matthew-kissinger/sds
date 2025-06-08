# Start Game Server
Write-Host "Starting authoritative game server on port 9208..." -ForegroundColor Green
Write-Host "Server will be available at http://127.0.0.1:9208" -ForegroundColor White
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

cd server
$env:PORT=9208
$env:GECKOS_UDP_PORT_MIN=10000
$env:GECKOS_UDP_PORT_MAX=20000
$env:NODE_ENV='development'
# Note: OPENSSL environment variables are only needed if you encounter SSL errors
# Uncomment the following lines if needed:
# $env:OPENSSL_CONF=''
# $env:OPENSSL_ENGINES=''
node index.js 