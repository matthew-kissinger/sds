#!/bin/bash

# DigitalOcean Droplet Deployment Script for Geckos.io Multiplayer Server
# Run this script on your Ubuntu Droplet

echo "🚀 Setting up Geckos.io Multiplayer Server on DigitalOcean Droplet"
echo "=================================================================="

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 18 (required for Geckos.io v3)
echo "📦 Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
echo "✅ Node.js version: $(node --version)"
echo "✅ NPM version: $(npm --version)"

# Install PM2 for process management
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p /opt/sds-server
sudo chown $USER:$USER /opt/sds-server
cd /opt/sds-server

# Note: Server files need to be uploaded separately
echo "📝 Server files should be uploaded to: /opt/sds-server"
echo "   Required files: index.js, RoomManager.js, GameSimulation.js, package.json"

# Configure firewall for Geckos.io
echo "🔥 Configuring firewall..."
sudo ufw allow ssh
sudo ufw allow 9208/tcp      # Geckos.io signaling port
sudo ufw allow 10000:20000/udp  # UDP port range for WebRTC
sudo ufw --force enable

echo "✅ Firewall configured:"
echo "   - SSH (22/tcp)"
echo "   - Geckos.io signaling (9208/tcp)"  
echo "   - WebRTC UDP range (10000-20000/udp)"

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'sds-multiplayer-server',
    script: 'index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 9208,
      GECKOS_UDP_PORT_MIN: 10000,
      GECKOS_UDP_PORT_MAX: 20000
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
EOF

# Create logs directory
mkdir -p logs

echo "🎯 Next steps:"
echo "1. Upload your server files to /opt/sds-server/"
echo "2. Run 'npm install' to install dependencies"
echo "3. Run 'pm2 start ecosystem.config.js' to start the server"
echo "4. Run 'pm2 save && pm2 startup' to auto-start on boot"
echo ""
echo "🌐 Your server will be accessible at: http://147.182.185.185:9208"
echo "🔗 WebRTC signaling at: http://147.182.185.185:9208/.wrtc/v2/connections" 