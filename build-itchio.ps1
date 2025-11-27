# Build script for itch.io distribution
# Creates a ZIP file ready for upload

$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$distFolder = Join-Path $projectRoot "dist-itchio"
$zipFile = Join-Path $projectRoot "sheep-dog-sim-itchio.zip"

Write-Host "Building itch.io distribution package..." -ForegroundColor Cyan

# Clean up previous build
if (Test-Path $distFolder) {
    Remove-Item -Recurse -Force $distFolder
}
if (Test-Path $zipFile) {
    Remove-Item -Force $zipFile
}

# Create dist folder
New-Item -ItemType Directory -Path $distFolder | Out-Null

# Copy required files and folders
Write-Host "Copying files..." -ForegroundColor Yellow

# Core files
Copy-Item (Join-Path $projectRoot "index.html") $distFolder
Copy-Item (Join-Path $projectRoot "sw.js") $distFolder

# Directories
$folders = @("js", "css", "assets", "shared")
foreach ($folder in $folders) {
    $src = Join-Path $projectRoot $folder
    $dest = Join-Path $distFolder $folder
    if (Test-Path $src) {
        Copy-Item -Recurse $src $dest
        Write-Host "  Copied $folder/" -ForegroundColor Gray
    }
}

# Remove server-specific files from assets if any
$backupFolder = Join-Path $distFolder "assets\sounds_compressed\backup"
if (Test-Path $backupFolder) {
    Remove-Item -Recurse -Force $backupFolder
    Write-Host "  Removed backup folder" -ForegroundColor Gray
}

# Create the ZIP
Write-Host "Creating ZIP archive..." -ForegroundColor Yellow
Compress-Archive -Path (Join-Path $distFolder "*") -DestinationPath $zipFile -Force

# Get file sizes
$zipSize = (Get-Item $zipFile).Length / 1MB
Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "  ZIP file: $zipFile" -ForegroundColor White
Write-Host "  Size: $([math]::Round($zipSize, 2)) MB" -ForegroundColor White
Write-Host ""
Write-Host "Upload this ZIP to itch.io" -ForegroundColor Cyan

# Cleanup dist folder (keep only ZIP)
# Remove-Item -Recurse -Force $distFolder
