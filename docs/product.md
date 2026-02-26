# Vibrissae — Product Spec

A lightweight, ephemeral video call app. No accounts. No downloads. Open link → you're in.

---

## What It Is

A WebRTC-based video calling tool designed for simplicity and self-hosting. Two deployment modes:

| Mode | Deployment | Use Case |
|------|------------|----------|
| **Public Demo** | GitHub Pages static SPA | Try it out, send grandma a link |
| **Self-Hosted** | Single Go binary | Private, reliable, you control it |

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

## Room Lifecycle

- Room ID: UUID (32-char hex)
- Created on first connection
- Stored in memory with last-activity timestamp
- Expired rooms swept every minute
- TTL configurable (default: 60 min)
- Nothing written to disk, ever

---

## Deployment Modes

Set `mode` in config explicitly. One binary, two modes, zero confusion.

### Mode: `direct` — Binary Handles Everything

```json
{
  "mode": "direct",
  "domain": "call.example.com",
  "public_ip": "auto",
  "turn_port": 3478
}
```

- Auto-issues Let's Encrypt certificate
- Listens on :80 (HTTP-01 challenge) and :443 (HTTPS)
- Auto-detects public IP for TURN relay
- TURN on specified UDP port (direct exposure required)
- Zero infrastructure beyond DNS

**Use case:** Fresh VPS with a domain, want simplest possible deploy.

### Mode: `proxy` — Nginx/Caddy In Front

```json
{
  "mode": "proxy",
  "port": 8080,
  "public_ip": "1.2.3.4",
  "turn_port": 3478
}
```

- Plain HTTP on internal port
- Trusts `X-Forwarded-*` headers from reverse proxy
- Manual `public_ip` required (can't auto-detect behind proxy)
- TURN still needs direct UDP exposure (nginx can't proxy UDP)
- You handle TLS termination

**Use case:** Existing infrastructure, docker-compose, behind load balancer.

### Deployment Matrix

| Scenario | Config | Notes |
|----------|--------|-------|
| Fresh VPS, have domain | `mode: "direct"` + `domain` | Set DNS A record, run binary |
| Behind nginx/caddy | `mode: "proxy"` + `port` + `public_ip` | TURN UDP still needs firewall rule |
| Local dev | `mode: "proxy"` + `port` only | No TURN needed, localhost allows camera |
| Docker | either mode | Use env vars for config |
| Raw IP, no domain | `mode: "proxy"` + `public_ip` | Self-signed cert warning in browser |

### TURN Constraint

TURN uses UDP and cannot be proxied. In both modes:
- TURN port must be directly reachable from clients
- Firewall must allow UDP on `turn_port`
- `public_ip` tells clients where to connect for media relay

---

## Modes Explained

### Mode 1 — Public Demo (GitHub Pages)

- Static SPA hosted on GitHub Pages
- Public STUN servers (array, first success wins)
- Links never expire
- Best-effort — may fail with strict NAT or across restrictive regions
- Purpose: demo, casual use, no setup

### Mode 2 — Self-Hosted Binary

- Single Go binary + `config.json`
- Two deployment modes (auto-detected)
- Built-in TURN relay (HMAC auth, rate-limited)
- Optional external TURN servers
- Full control over reliability
- Purpose: production, private, repeated use

---

## What It's Not

- Not a Zoom alternative for teams
- Not an SFU — no server-side media relay
- Not for 100-person calls
- Not for persistent data
- Not a platform with accounts and analytics

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Cold deploy time | Under 5 minutes |
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
