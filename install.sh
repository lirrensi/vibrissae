#!/bin/bash
# Vibrissae one-line installer
# Usage: curl -fsSL https://.../install.sh | bash -s -- --domain call.example.com

set -e

DEFAULT_VERSION="latest"
INSTALL_DIR="/opt/vibrissae"
REPO="your-repo/vibrissae"  # TODO: Update with actual repo

# Parse arguments
DOMAIN=""
VERSION="$DEFAULT_VERSION"
MODE="direct"

while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 --domain call.example.com [--version 1.0.0] [--mode direct|proxy|local]"
            echo ""
            echo "Options:"
            echo "  --domain    Required for direct mode. Your domain name."
            echo "  --version   Version to install (default: latest)"
            echo "  --mode      Deployment mode: direct, proxy, local (default: direct)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "=== Vibrissae Installer ==="
echo ""

# Check requirements
if [[ "$MODE" == "direct" && -z "$DOMAIN" ]]; then
    echo "Error: --domain is required for direct mode"
    echo "Usage: $0 --domain call.example.com"
    exit 1
fi

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="darwin"
else
    echo "Unsupported OS: $OSTYPE"
    exit 1
fi

# Detect arch
ARCH=$(uname -m)
if [[ "$ARCH" == "x86_64" ]]; then
    ARCH="amd64"
elif [[ "$ARCH" == "aarch64" ]]; then
    ARCH="arm64"
else
    echo "Unsupported architecture: $ARCH"
    exit 1
fi

echo "OS: $OS"
echo "Architecture: $ARCH"
echo "Mode: $MODE"
echo "Version: $VERSION"
echo ""

# Create install directory
echo "Creating install directory..."
sudo mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download binary
echo "Downloading vibrissae..."
if [[ "$VERSION" == "latest" ]]; then
    DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/vibrissae-$OS-$ARCH"
else
    DOWNLOAD_URL="https://github.com/$REPO/releases/download/v$VERSION/vibrissae-$OS-$ARCH"
fi

sudo curl -fsSL "$DOWNLOAD_URL" -o vibrissae
sudo chmod +x vibrissae

# Generate config
echo "Generating config..."
if [[ "$MODE" == "direct" ]]; then
    cat << EOF | sudo tee config.json
{
  "mode": "direct",
  "domain": "$DOMAIN",
  "public_ip": "auto",
  "turn_port": 3478
}
EOF
elif [[ "$MODE" == "proxy" ]]; then
    # Try to detect public IP
    PUBLIC_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "REQUIRED")
    cat << EOF | sudo tee config.json
{
  "mode": "proxy",
  "port": 8080,
  "public_ip": "$PUBLIC_IP",
  "turn_port": 3478
}
EOF
else
    cat << EOF | sudo tee config.json
{
  "mode": "local",
  "https_port": 8443,
  "public_ip": "auto",
  "turn_port": 3478
}
EOF
fi

# Create systemd service
echo "Creating systemd service..."
cat << EOF | sudo tee /etc/systemd/system/vibrissae.service
[Unit]
Description=Vibrissae Video Chat
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/vibrissae
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Configure firewall (if ufw available)
if command -v ufw &> /dev/null; then
    echo "Configuring firewall..."
    if [[ "$MODE" == "direct" ]]; then
        sudo ufw allow 80/tcp
        sudo ufw allow 443/tcp
    elif [[ "$MODE" == "proxy" ]]; then
        sudo ufw allow 8080/tcp
    elif [[ "$MODE" == "local" ]]; then
        sudo ufw allow 8443/tcp
    fi
    sudo ufw allow 3478/udp
fi

# Start service
echo "Starting service..."
sudo systemctl daemon-reload
sudo systemctl enable vibrissae
sudo systemctl start vibrissae

echo ""
echo "=== Installation Complete ==="
echo ""
if [[ "$MODE" == "direct" ]]; then
    echo "Your server is running at: https://$DOMAIN"
elif [[ "$MODE" == "proxy" ]]; then
    echo "Your server is running on port 8080 (proxy mode)"
    echo "Configure your reverse proxy to forward to http://localhost:8080"
else
    echo "Your server is running at: https://localhost:8443"
    echo "Note: Self-signed certificate - browser will show warning"
fi
echo ""
echo "Logs: sudo journalctl -u vibrissae -f"
echo "Config: $INSTALL_DIR/config.json"
