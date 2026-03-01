# Vibrissae — Product Spec

A lightweight, ephemeral video call app. No accounts. No downloads. Open link → you're in.

---

## What It Is

A WebRTC-based video calling tool designed for simplicity and self-hosting. Two **operating modes** with fundamentally different infrastructure requirements:

| Mode | Server Required | Signaling | Media Relay | Best For |
|------|-----------------|-----------|-------------|----------|
| **Web Bundle** | No | Trystero (decentralized) | STUN only | Quick demo, casual use, zero setup |
| **Self-Hosted** | Yes | WebSocket server | Built-in TURN | Production, private, reliable calls |

---

## Quick Start Decision Tree

```
Do you want to run your own server?
│
├─ NO → Use Web Bundle mode
│        ├─ Host on GitHub Pages, Netlify, any static host
│        ├─ Or just open the single HTML file locally
│        └─ Works for most NAT configurations
│
└─ YES → Use Self-Hosted mode
         │
         ├─ Fresh VPS with a domain?
         │  └─ Use "direct" config (Let's Encrypt auto-cert)
         │
         ├─ Behind nginx/Caddy/Cloudflare?
         │  └─ Use "proxy" config (you handle TLS)
         │
         └─ Local network testing?
            └─ Use "local" config (self-signed cert)
```

---

## Operating Mode 1: Web Bundle (Pure P2P)

**No server required.** The entire app is a static web bundle that can be hosted anywhere or opened locally.

### How It Works

1. **Signaling**: Uses [Trystero](https://github.com/dmotz/trystero) for serverless peer discovery via public decentralized networks
2. **Media**: Direct browser-to-browser WebRTC connections using ICE servers from `p2p-config.json`
3. **Hybrid NAT traversal**: STUN for direct connections, TURN relay as fallback (when available in config)

### Deployment Options

| Option | Steps | Result |
|--------|-------|--------|
| **GitHub Pages** | `npm run build:p2p` → push `dist/` to `gh-pages` branch | Public demo URL |
| **Any static host** | `npm run build:p2p` → upload `dist/` folder | Your domain |
| **Single HTML file** | `npm run build:p2p:single` → open `dist/index.html` | Works offline, shareable |

### P2P Signaling Backends

The transport layer is pluggable. Multiple backends can run in parallel for redundancy — messages broadcast via all enabled transports.

| Backend | Bundle Size | Notes |
|---------|-------------|-------|
| **Nostr** | 8K | Decentralized relays — prioritized, good redundancy |
| **BitTorrent** | 5K | WebTorrent trackers — fallback option |
| **MQTT** | 75K | Public MQTT brokers |
| **IPFS** | 119K | DHT-based discovery |
| **GunJS** | ~50K | Decentralized graph database — implemented |

**Architecture**: Transports are implemented as plugins implementing the `MessageTransport` interface. The signaling protocol (handshake, initiator election, message routing) is decoupled from the transport, making it easy to add new backends. Multiple transports can be combined via `CombinedTransport` for fallback redundancy.

**Not supported:**
- Supabase, Firebase — require account setup (violates "no accounts" principle)

### Configuration

P2P behavior is controlled by `p2p-config.json` (optional — defaults work out of box):

```json
{
  "version": 1,
  "transports": {
    "priority": ["nostr", "torrent"],
    "torrent": {
      "enabled": true,
      "announce": ["wss://tracker.openwebtorrent.com"]
    },
    "nostr": {
      "enabled": true,
      "relays": ["wss://relay.damus.io"]
    },
    "gun": {
      "enabled": true,
      "peers": ["https://gun-manhattan.herokuapp.com/gun"]
    }
  },
  "signaling": {
    "resendIntervalMs": 2000,
    "resendMaxAttempts": 5
  },
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "stun:stun1.l.google.com:19302" },
    { "urls": "turn:your-turn-server.com:3478", "username": "user", "credential": "pass" }
  ]
}
```

**Using Multiple Transports:** To run multiple transports in parallel (e.g., Trystero + GunJS), specify them in code:

```typescript
// Run both Trystero and GunJS in parallel
await createTransport({ 
  roomId, 
  providers: ['trystero', 'gun'] 
})
```

Both transports will be combined via `CombinedTransport` — messages broadcast to all, peer discovery merges from both.

**ICE Servers**: The config defines STUN/TURN servers used for NAT traversal. At least one STUN server is required; TURN servers are optional but recommended for users behind symmetric NAT.

### Limitations

- **TURN optional**: Calls may fail with symmetric NAT if no TURN servers configured
- **Best-effort connectivity**: Works for most users, not guaranteed for all
- **No server-side features**: No room persistence, no admin controls

---

## Operating Mode 2: Self-Hosted

**Requires your own server.** A single Go binary with embedded Vue app. Full control over reliability and privacy.

### How It Works

1. **Signaling**: WebSocket server for SDP/ICE exchange
2. **Media**: Built-in TURN relay for guaranteed connectivity
3. **Single binary**: Go server + embedded frontend, one file to deploy

### Deployment Configurations

Three configurations for different hosting scenarios:

#### Config: `direct` — Binary Handles Everything

```json
{
  "mode": "direct",
  "domain": "call.example.com",
  "public_ip": "auto",
  "turn_port": 3478
}
```

**What it does:**
- Auto-issues Let's Encrypt certificate
- Listens on :80 (HTTP-01 challenge) and :443 (HTTPS)
- Auto-detects public IP for TURN relay
- TURN on specified UDP port

**Requirements:**
- A domain name with DNS A record pointing to your server
- Ports 80, 443 (TCP) and 3478 (UDP) open to the internet

**Use case:** Fresh VPS with a domain, want simplest possible deploy.

---

#### Config: `proxy` — Behind Reverse Proxy

```json
{
  "mode": "proxy",
  "port": 8080,
  "public_ip": "1.2.3.4",
  "turn_port": 3478
}
```

**What it does:**
- Plain HTTP on internal port
- Trusts `X-Forwarded-*` headers from reverse proxy
- Manual `public_ip` required (can't auto-detect behind proxy)

**Requirements:**
- Reverse proxy (nginx, Caddy, Cloudflare Tunnel, etc.) handling TLS
- TURN UDP port must be directly reachable (reverse proxies can't proxy UDP)
- Know your public IP address

**Use case:** Existing infrastructure, docker-compose, behind load balancer.

---

#### Config: `local` — Local Network Testing

```json
{
  "mode": "local",
  "https_port": 8443,
  "public_ip": "auto",
  "turn_port": 3478
}
```

**What it does:**
- Generates self-signed certificate (cached in `local_certs/`)
- Auto-detects local IP for TURN relay
- HTTPS on specified port

**Requirements:**
- None — works out of box

**Browser warning:** Self-signed certificate triggers security warning. Click "Advanced" → "Proceed" to continue.

**Use case:** Testing on local network, development, devices on same LAN.

---

### Deployment Matrix

| Scenario | Config | What You Need |
|----------|--------|---------------|
| Fresh VPS, have domain | `direct` | DNS A record, ports 80/443/3478 open |
| Behind nginx/Caddy | `proxy` | Reverse proxy config, public IP, port 3478 UDP open |
| Behind Cloudflare Tunnel | `proxy` | Tunnel config, public IP, port 3478 UDP open |
| Docker container | `proxy` | Expose port, mount config |
| Local dev/testing | `local` | Nothing — just run it |
| Raw IP, no domain | `proxy` | Public IP, self-signed cert warning |

### TURN Constraint

**TURN uses UDP and cannot be proxied.** In all self-hosted configurations:

- TURN port MUST be directly reachable from clients
- Firewall MUST allow UDP on `turn_port`
- `public_ip` tells clients where to connect for media relay

This is why `proxy` mode still requires a directly exposed UDP port.

---

## User Flow

1. Open page
2. Click "Generate Link"
3. Send link to someone
4. They open it → instantly connected

That's it. No accounts, no configuration, no app installs.

---

## Core Features

### Video & Audio
- Webcam sharing (on/off toggle)
- Microphone sharing (on/off toggle)
- Device selector (choose camera/mic)
- Works for 2–6 participants (P2P mesh)

### Chat
- Text chat via WebRTC DataChannel
- P2P only — messages never touch server
- Ephemeral — lost on refresh, no history

### Call Management
- Generate random room link
- Auto-join from URL
- Disconnect button
- Participant count warning at 4+ people

### PWA
- Installable as app (home screen, desktop)
- Cached shell for app-like experience

---

## Design Principles

- **No persistence** — rooms in RAM only, gone on restart
- **No accounts** — zero user management infrastructure
- **No telemetry** — nothing leaves the server
- **Single binary** — Go server + embedded Vue app, one file to deploy
- **P2P-first** — direct browser-to-browser, server only for signaling and TURN fallback

---

## Security Model

**Access control is based on link secrecy, not passwords.**

- Room IDs are 128-bit UUIDs (not guessable)
- Anyone with the room link can join — no password required
- No server-side access logs or participant history
- This is the same model as Google Meet, Zoom personal links, or Jitsi

**What this means:**
- Share the link only with people you trust
- Anyone who has the link can share it further
- There is no "kick" or "ban" feature — rooms are fully open

If you need stricter access control, self-host behind a reverse proxy with authentication.

---

## Room Lifecycle

- Room ID: UUID (32-char hex)
- Created on first connection
- Stored in memory with last-activity timestamp
- Expired rooms swept every minute
- TTL configurable (default: 60 min)
- Nothing written to disk, ever

---

## What It's Not

- Not a Zoom alternative for teams
- Not an SFU — no server-side media mixing
- Not for 100-person calls
- Not for persistent data
- Not a platform with accounts and analytics
- Not a replacement for Self-Hosted mode if you need guaranteed connectivity

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Cold deploy time (Self-Hosted) | Under 5 minutes |
| Binary size | Under 20MB |
| RAM idle | Under 30MB |
| Time to connected call | Under 5 seconds |

---

## Project Structure

```
Vibrissae/
├── server/       # Go backend (signaling + TURN)
├── web_ui/       # Vue 3 frontend
├── docs/         # Product & architecture docs
└── prd.md        # Original product requirements
```
