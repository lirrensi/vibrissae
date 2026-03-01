# Deployment Guide

Complete reference for deploying Vibrissae. Point your AI agent here for automated deployment.

---

## Quick Decision Tree

```
What do you want to run?
│
├─ Pure P2P (no server) ──────────────────────────────────────> SECTION A
│   Use when: Quick demo, zero setup, casual calls
│
└─ Self-Hosted Server ────────────────────────────────────────> SECTION B
    │
    │   What's your hosting situation?
    │
    ├─ Fresh VPS with a domain ────────────> MODE: direct
    │   Let's Encrypt auto-cert, ports 80/443/3478
    │
    ├─ Behind nginx/Caddy/Cloudflare ──────> MODE: proxy  
    │   Reverse proxy handles TLS, port 8080 + UDP 3478
    │
    └─ Local network testing ───────────────> MODE: local
        Self-signed cert, works offline
```

---

## SECTION A: Pure P2P (No Server)

No backend required. The entire app is static files.

### Option A1: Single HTML File (Recommended)

One file. Open in browser. Done.

```bash
# Build
make web-single

# Output: web_ui/dist/index.html
```

**Deploy:**
- Email the file to someone
- Host anywhere that serves static files
- Works offline (open directly in browser)

### Option A2: Static Hosting

Standard build for GitHub Pages, Netlify, Vercel, etc.

```bash
# Build
make web-p2p

# Output: web_ui/dist/ folder
```

**Deploy to GitHub Pages:**
```bash
# Already automated - just push to main
# Or manually: copy dist/ to gh-pages branch
```

**Deploy to Netlify:**
```bash
# Build command: make web-p2p
# Publish directory: web_ui/dist
```

### Option A3: Self-Hosted Static

Host the P2P build on your own server:

```bash
# Build
make web-p2p

# Serve with any static server
npx serve web_ui/dist
# or
python -m http.server 8080 -d web_ui/dist
```

---

## SECTION B: Self-Hosted Server

Go binary with embedded Vue app. One executable + config file.

### Deployment Methods

| Method | Best For | Complexity |
|--------|----------|------------|
| **Binary** | Simple, single-purpose VPS | Low |
| **Docker** | Multi-service hosts, Kubernetes | Medium |

### Requirements (All Modes)

| Mode | TCP Ports | UDP Port | Domain | Public IP |
|------|-----------|----------|--------|-----------|
| direct | 80, 443 | 3478 | Required | Auto-detected |
| proxy | 8080 | 3478 | Via proxy | Required |
| local | 8443 | 3478 | No | Auto-detected |

> ⚠️ **TURN uses UDP and cannot be proxied.** Port 3478/UDP must be directly reachable from clients in ALL modes.

---

## Mode B1: Direct (Fresh VPS with Domain)

Server handles everything: TLS (Let's Encrypt), HTTP, TURN.

**Requirements:**
- VPS with public IP
- Domain with DNS A record pointing to VPS
- Ports 80, 443 (TCP) and 3478 (UDP) open

**config.json:**
```json
{
  "mode": "direct",
  "domain": "call.example.com",
  "public_ip": "auto",
  "turn_port": 3478
}
```

**Deploy (Binary):**
```bash
# On your machine
make build VERSION=1.0.0
scp server/vibrissae user@vps:/opt/vibrissae/
scp server/config.json.example user@vps:/opt/vibrissae/config.json

# On VPS
cd /opt/vibrissae
# Edit config.json with your domain
./vibrissae
```

**Deploy (Docker):**
```bash
# On VPS
git clone <repo> /opt/vibrissae
cd /opt/vibrissae/server

# Create config.json
cat > config.json << 'EOF'
{
  "mode": "direct",
  "domain": "call.example.com",
  "public_ip": "auto",
  "turn_port": 3478
}
EOF

# Run
docker compose up -d
```

**systemd service (recommended for binary):**
```bash
# /etc/systemd/system/vibrissae.service
[Unit]
Description=Vibrissae Video Chat
After=network.target

[Service]
Type=simple
User=vibrissae
WorkingDirectory=/opt/vibrissae
ExecStart=/opt/vibrissae/vibrissae
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable vibrissae
sudo systemctl start vibrissae
```

---

## Mode B2: Proxy (Behind Reverse Proxy)

You handle TLS with nginx/Caddy/Cloudflare. Server speaks plain HTTP.

**Requirements:**
- Reverse proxy configured for TLS
- UDP port 3478 directly reachable (proxies can't handle UDP)
- Know your public IP

**config.json:**
```json
{
  "mode": "proxy",
  "port": 8080,
  "public_ip": "203.0.113.50",
  "turn_port": 3478
}
```

**nginx example:**
```nginx
server {
    listen 443 ssl http2;
    server_name call.example.com;

    ssl_certificate /etc/letsencrypt/live/call.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/call.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Caddy example:**
```
call.example.com {
    reverse_proxy localhost:8080
}
```

**Cloudflare Tunnel:**
```bash
# Tunnel handles HTTPS, but TURN UDP still needs direct access
# Ensure port 3478/UDP is open on your firewall
cloudflared tunnel --url http://localhost:8080
```

> ⚠️ Even with Cloudflare Tunnel, clients must reach TURN on UDP 3478 directly. Tunnel only proxies HTTP.

---

## Mode B3: Local (Testing/Development)

Self-signed certificate. Browser will show warning.

**Requirements:**
- None - works out of box

**config.json:**
```json
{
  "mode": "local",
  "https_port": 8443,
  "public_ip": "auto",
  "turn_port": 3478
}
```

**Run:**
```bash
make build-dev
cd server
./vibrissae
# Open https://localhost:8443
# Click "Advanced" → "Proceed" to bypass cert warning
```

---

## Deployment Recipes

### Recipe 1: One-Liner VPS Deploy (Binary)

```bash
# Run on fresh VPS
curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/install.sh | bash -s -- --domain call.example.com
```

> TODO: Create install.sh script

### Recipe 2: Docker Compose

```bash
# Clone and run
git clone https://github.com/YOUR_REPO.git
cd YOUR_REPO/server

# Create config
cat > config.json << 'EOF'
{
  "mode": "direct",
  "domain": "call.example.com",
  "public_ip": "auto",
  "turn_port": 3478
}
EOF

# Build and run (uses host network)
docker compose up -d
```

### Recipe 3: Kubernetes

```yaml
# vibrissae.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vibrissae
spec:
  replicas: 1
  selector:
    matchLabels:
      app: vibrissae
  template:
    metadata:
      labels:
        app: vibrissae
    spec:
      hostNetwork: true  # Required for TURN UDP
      containers:
      - name: vibrissae
        image: vibrissae:latest
        volumeMounts:
        - name: config
          mountPath: /app/config.json
          subPath: config.json
      volumes:
      - name: config
        configMap:
          name: vibrissae-config
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: vibrissae-config
data:
  config.json: |
    {
      "mode": "proxy",
      "port": 8080,
      "public_ip": "YOUR_PUBLIC_IP",
      "turn_port": 3478
    }
```

### Recipe 4: Fly.io

```bash
# fly.toml
app = "vibrissae"
primary_region = "sjc"

[build]
  dockerfile = "server/Dockerfile"

[deploy]
  strategy = "immediate"

# Note: TURN UDP may not work on Fly.io free tier
# Consider disabling TURN or using external TURN service
```

### Recipe 5: AWS EC2

```bash
# Launch Ubuntu instance
# Security group: allow 80, 443 (TCP) and 3478 (UDP)

# SSH in
ssh ubuntu@<public-ip>

# Install
sudo apt update
sudo apt install -y docker.io
sudo usermod -aG docker ubuntu

# Clone and run
git clone https://github.com/YOUR_REPO.git
cd YOUR_REPO/server
# Create config.json...
docker compose up -d
```

---

## Firewall Configuration

### ufw (Ubuntu)
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3478/udp
sudo ufw enable
```

### firewalld (CentOS/RHEL)
```bash
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --reload
```

### iptables
```bash
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -A INPUT -p udp --dport 3478 -j ACCEPT
```

### AWS Security Group
```
Type: HTTP  | Port: 80   | Source: 0.0.0.0/0
Type: HTTPS | Port: 443  | Source: 0.0.0.0/0
Type: Custom UDP | Port: 3478 | Source: 0.0.0.0/0
```

---

## Environment Variables

The server reads from `config.json` only. No environment variable support (by design - simpler).

To inject config in containerized environments, mount `config.json` as a volume or use ConfigMaps.

---

## Health Check

All modes expose `/health` endpoint:

```bash
curl http://localhost:8080/health
# Returns: OK
```

For Docker/Kubernetes health checks:
```yaml
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/health"]
```

---

## Troubleshooting

### Can't connect to TURN
1. Check firewall allows UDP 3478
2. Verify `public_ip` is correct (not internal IP)
3. Test: `nc -vuz your-server.com 3478`

### Let's Encrypt fails (direct mode)
1. Ensure port 80 is accessible from internet
2. Verify DNS A record points to correct IP
3. Check `certs/` directory permissions

### WebSocket connection fails
1. Check reverse proxy forwards `Upgrade` header
2. Verify `X-Forwarded-*` headers are set
3. Check browser console for mixed content (HTTPS → WS)

### Docker container exits immediately
1. Check `config.json` exists and is valid JSON
2. View logs: `docker compose logs`

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `make build VERSION=x.x.x` | Production binary (embedded web) |
| `make build-dev` | Dev binary (filesystem web) |
| `make web-single` | Single HTML file (P2P) |
| `make docker-build VERSION=x.x.x` | Docker image |
| `make docker-run` | Run with docker-compose |
| `make test` | Run all tests |

---

## Config Schema Reference

```json
{
  "mode": "direct | proxy | local",
  
  // Direct mode
  "domain": "call.example.com",
  
  // Proxy mode  
  "port": 8080,
  
  // Local mode
  "https_port": 8443,
  
  // All modes
  "public_ip": "auto | 1.2.3.4",
  "turn_port": 3478,
  "room_ttl_minutes": 60,
  
  "turn": {
    "enabled": true,
    "secret": "change-me-in-production",
    "rate_limit_per_ip": 10,
    "credential_ttl_minutes": 30
  }
}
```
