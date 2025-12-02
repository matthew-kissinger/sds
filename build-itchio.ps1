# Build script for itch.io distribution
# Creates a ZIP file from Vite build output

$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$distFolder = Join-Path $projectRoot "dist"
$zipFile = Join-Path $projectRoot "sheep-dog-sim-itchio.zip"

Write-Host "Building Sheep Dog Sim for itch.io..." -ForegroundColor Cyan
Write-Host ""

# Run Vite build with itch.io-specific config (relative paths)
Write-Host "Running Vite build for itch.io (relative paths)..." -ForegroundColor Yellow
npm run build:itchio
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "Build complete!" -ForegroundColor Green
Write-Host ""

# Remove old ZIP if exists
if (Test-Path $zipFile) {
    Remove-Item -Force $zipFile
    Write-Host "Removed old ZIP file" -ForegroundColor Gray
}

# Create the ZIP from dist folder
Write-Host "Creating ZIP archive..." -ForegroundColor Yellow
Compress-Archive -Path (Join-Path $distFolder "*") -DestinationPath $zipFile -Force

# Get file sizes
$zipSize = (Get-Item $zipFile).Length / 1MB
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Build complete!" -ForegroundColor Green
Write-Host "  ZIP file: $zipFile" -ForegroundColor White
Write-Host "  Size: $([math]::Round($zipSize, 2)) MB" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To upload to itch.io using butler:" -ForegroundColor Yellow
Write-Host "  butler push sheep-dog-sim-itchio.zip YOUR_USERNAME/sheep-dog-sim:html5" -ForegroundColor White
Write-Host ""
