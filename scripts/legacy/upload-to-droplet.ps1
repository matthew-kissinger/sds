# Upload Server Files to DigitalOcean Droplet
# This script uploads the multiplayer server to your Droplet

$DROPLET_IP = "147.182.185.185"
$DROPLET_USER = "root"  # Change to your droplet username if different
$SERVER_DIR = "/opt/sds-server"

Write-Host "🚀 Uploading Multiplayer Server to DigitalOcean Droplet" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host "Droplet IP: $DROPLET_IP" -ForegroundColor Cyan
Write-Host "Target Directory: $SERVER_DIR" -ForegroundColor Cyan
Write-Host ""

# Check if SCP is available (Git Bash, WSL, or native Windows)
$scpAvailable = Get-Command scp -ErrorAction SilentlyContinue

if (-not $scpAvailable) {
    Write-Host "❌ SCP not found. Please install Git for Windows or WSL." -ForegroundColor Red
    Write-Host "   Alternative: Use FileZilla or WinSCP to upload files manually" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📁 Files to upload to $DROPLET_IP`:$SERVER_DIR/:" -ForegroundColor Yellow
    Write-Host "   - server/index.js" -ForegroundColor White
    Write-Host "   - server/RoomManager.js" -ForegroundColor White
    Write-Host "   - server/GameSimulation.js" -ForegroundColor White
    Write-Host "   - server/package.json" -ForegroundColor White
    Write-Host "   - server/shared/ (directory)" -ForegroundColor White
    Write-Host "   - server/deploy-to-droplet.sh" -ForegroundColor White
    Read-Host "Press Enter to continue..."
    exit 1
}

Write-Host "✅ SCP found. Starting upload..." -ForegroundColor Green

# Create the server directory on droplet
Write-Host "📁 Creating server directory..." -ForegroundColor Yellow
ssh "$DROPLET_USER@$DROPLET_IP" "mkdir -p $SERVER_DIR"

if ($LASTEXITCODE -eq 0) {
    # Upload server files
    Write-Host "📤 Uploading server files..." -ForegroundColor Yellow
    scp -r server/* "$DROPLET_USER@$DROPLET_IP`:$SERVER_DIR/"
    
    if ($LASTEXITCODE -eq 0) {
        # Make the deployment script executable
        Write-Host "🔧 Making deployment script executable..." -ForegroundColor Yellow
        ssh "$DROPLET_USER@$DROPLET_IP" "chmod +x $SERVER_DIR/deploy-to-droplet.sh"
        
        Write-Host ""
        Write-Host "✅ Upload completed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🎯 Next steps:" -ForegroundColor Cyan
        Write-Host "1. SSH into your droplet: ssh $DROPLET_USER@$DROPLET_IP" -ForegroundColor White
        Write-Host "2. Run the setup script: cd $SERVER_DIR && ./deploy-to-droplet.sh" -ForegroundColor White
        Write-Host "3. Install dependencies: npm install" -ForegroundColor White
        Write-Host "4. Start the server: pm2 start ecosystem.config.js" -ForegroundColor White
        Write-Host ""
        Write-Host "🌐 Your server will be accessible at: http://$DROPLET_IP`:9208" -ForegroundColor Green
    } else {
        Write-Host "❌ Upload failed!" -ForegroundColor Red
    }
} else {
    Write-Host "❌ Failed to create directory or connect to droplet!" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Manual upload instructions:" -ForegroundColor Yellow
    Write-Host "1. Use FileZilla/WinSCP to connect to $DROPLET_IP" -ForegroundColor White
    Write-Host "2. Upload all files from 'server/' folder to $SERVER_DIR/" -ForegroundColor White
    Write-Host "3. SSH and run: cd $SERVER_DIR && ./deploy-to-droplet.sh" -ForegroundColor White
} 