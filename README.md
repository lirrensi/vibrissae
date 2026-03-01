# Vibrissae

Full p2p video calls without fuckery.

---

## Try it now → [lirrensi.github.io/vibrissae](https://lirrensi.github.io/vibrissae)

## Deploy it → [DEPLOY.md](docs/DEPLOY.md) (point your AI agent here)

---

## What is this?

**10-second pitch:** A privacy-first video chat that works right in your browser. No account, no install, no tracking. Just open a link and you're talking. Uses peer-to-peer WebRTC so your video never touches a server (in P2P mode).

- **Zero friction** — Open link → in call
- **Zero surveillance** — No accounts, no telemetry, rooms die on refresh
- **Two modes** — P2P (no server) or Self-hosted (your own server)

---

[![Vibrissae Screenshot](web_ui/public/vibrissae_sm.jpg)](https://lirrensi.github.io/vibrissae/)

> ⚠️ VIBECODE ALERT - this app may be not so secure, we working on it

Vibrissae is a WebRTC-based video calling application with two operating modes:

| Mode | Server Required | Signaling | Best For |
|------|-----------------|-----------|----------|
| **Web Bundle** | No | Trystero (decentralized) | Quick demos, casual use, zero setup |
| **Self-Hosted** | Yes | WebSocket + TURN | Production, private, reliable calls |


## Quick Start

### Option 1: Try the Demo (P2P Mode)

Visit the [GitHub Pages demo](https://lirrensi.github.io/vibrissae/) — no server, no setup.

Works for most NAT configurations using public BitTorrent trackers and Nostr relays for peer discovery.

### Option 2: Run Your Own Server

```bash
# Build the frontend
cd web_ui
pnpm install
pnpm build:server

# Build and run the Go server
cd ../server
go build -o vibrissae .
./vibrissae
```

See [docs/product.md](docs/product.md) for deployment configurations (direct, proxy, local).

## Features

- **Video & Audio** — Webcam/mic sharing with device selection
- **Text Chat** — WebRTC DataChannel, peer-to-peer only
- **PWA** — Installable as standalone app
- **No Persistence** — Rooms in RAM only, gone on restart
- **No Accounts** — Zero user management
- **No Telemetry** — Nothing leaves the server

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    VIBRISSAE MODES                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  P2P MODE (Web Bundle)                                      │
│  ─────────────────────                                      │
│  GitHub Pages → Trystero (Torrent/Nostr) → WebRTC P2P      │
│                                                             │
│  No server. Decentralized signaling. STUN-only traversal.  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SELF-HOSTED MODE                                           │
│  ─────────────────                                          │
│  Your Server → WebSocket Signaling → WebRTC P2P + TURN     │
│                                                             │
│  Single Go binary. Embedded TURN relay. Guaranteed conn.   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Build Commands

| Command | Output | Use Case |
|---------|--------|----------|
| `pnpm build:p2p` | `dist/` folder | Static hosting (GitHub Pages, Netlify) |
| `pnpm build:p2p:single` | Single `index.html` | Offline use, shareable file |
| `pnpm build:server` | `server/dist/` | Self-Hosted binary (embedded) |

## Development

```bash
# Terminal 1: Frontend dev server
cd web_ui && pnpm dev

# Terminal 2: Go server (optional, for Self-Hosted mode)
cd server && go build -o vibrissae . && ./vibrissae
```

## Documentation

- [Product Specification](docs/product.md) — User-facing features and deployment modes
- [Architecture Reference](docs/arch.md) — Technical details, APIs, data flows

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3, Vite, Tailwind CSS |
| P2P Signaling | Trystero (BitTorrent, Nostr) |
| Server | Go, gorilla/websocket, pion/turn |
| WebRTC | Browser Native API |

## License

[MIT](LICENSE) — Free for personal and commercial use.

---

## Languages

[English](README.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md) · [Русский](README.ru.md)

---

*Named after the sensitive whiskers cats use to navigate — because finding your friends should be just as intuitive.*