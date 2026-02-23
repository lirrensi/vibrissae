# PRD: Lightweight Ephemeral Video Call App

**Status:** Draft  
**Date:** 2026-02-23

---

## Problem

Every video call tool today requires accounts, app installs, or both. The lightweight options either died (Whereby), got bloated (Jitsi), or are walled gardens (Zoom, Meet). There is no dead-simple "open link → you're in" tool that respects privacy and can be self-hosted in 5 minutes.

---

## Goal

A video + audio + chat app where the entire user flow is:

1. Open page
2. Click "Generate Link"
3. Send link to someone
4. They open it → instantly connected

No accounts. No downloads. No configuration for end users. Ever.

---

## Two Modes

### Mode 1 — GitHub Pages (Public Demo)

- Hosted as a static SPA on GitHub Pages
- Uses hardcoded array of public STUN servers (tried in order, first success wins)
- Link is permanent (UUID-based room ID, never expires)
- Works fine for same-region, low-NAT connections
- **Explicitly labeled as best-effort** — may fail across regions (China, Russia, strict NAT)
- Purpose: demo / try it out / send grandma a link once

### Mode 2 — Self-Hosted Binary (The Real Thing)

- Single Go binary + `config.json` next to it, nothing else
- Operator brings their own TURN servers → reliability they control
- Rooms stored in RAM only, expire after configurable TTL
- Server restart = all rooms gone, clean slate by design
- Deploy anywhere: VPS, home server, Raspberry Pi
- Target: anyone with a domain who wants a reliable private call tool they use repeatedly

---

## Architecture

```
[Browser A] <──── WebRTC P2P (direct) ────> [Browser B]
      \                                          /
       └──── WS Signaling + built-in TURN ──────┘
                       (Go)
```

The Go server handles:
- **Signaling** — SDP offer/answer and ICE candidate exchange over WebSocket
- **Built-in TURN relay** — fallback for peers behind strict NAT, powered by Pion/turn embedded in the same binary. Rate-limited per IP so public instances don't get abused.

Direct P2P is always attempted first. Built-in TURN only activates when NAT traversal fails. External TURN servers can still be configured in `config.json` and take priority.

> **Note:** Built-in TURN is a convenience fallback, not a production relay. For heavy usage, bring your own TURN.

### Config injection

No build modes needed. Go server injects config at runtime:

```html
<script>window.__CONFIG__ = { turn: [...], baseUrl: "..." }</script>
```

Vue app reads `window.__CONFIG__`. GitHub Pages build bakes in public config at build time. Same codebase, zero flags.

### Room lifecycle

- Room ID: single UUID (32-char hex, dashes stripped)
- Room created on first WebSocket connection with that ID
- Stored in `sync.Map` with last-activity timestamp
- Background goroutine sweeps expired rooms every minute
- TTL configurable in `config.json` (default: 60 min)
- Nothing written to disk, ever

---

## Config Format

```json
{
  "port": 8080,
  "base_url": "https://call.example.com",
  "room_ttl_minutes": 60,
  "turn": {
    "enabled": true,
    "port": 3478,
    "rate_limit_per_ip": 10,
    "credential_ttl_minutes": 30,
    "secret": "your-random-secret-key-here"
  },
  "turn_servers": [
    {
      "urls": "turn:your.turn.server:3478",
      "username": "user",
      "credential": "pass"
    }
  ]
}
```

---

## Features — In Scope (v1)

- Generate random room link on home page
- Auto-join room when opening a link with room hash
- Share webcam (toggle on/off) — **with device selector** (choose which camera)
- Share microphone (toggle on/off) — **with device selector** (choose which mic)
- Disconnect button
- Mini text chat via WebRTC DataChannel (P2P only, ephemeral, never hits server)
- Works for 2–~6 people (P2P mesh, no SFU)
- Participant count warning at 4+ (mesh bandwidth notice)
- Installable as PWA (service worker, add to home screen)

## Features — Out of Scope (v1)

- Screen sharing (can be v2, one-liner to add)
- Recording
- SFU / server-side media relay (different product entirely)
- Persistent chat history
- Room passwords / access control
- Mobile apps

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Server | Go | Single binary, tiny RAM, deploys everywhere |
| Signaling | `gorilla/websocket` | Mature, well-tested, widely used |
| Built-in TURN | `pion/turn` | Embedded relay fallback, same binary |
| Static embed | `go:embed dist/` | Vue app baked into binary after `npm run build` |
| Frontend | Vue 3 + Vite | Maintainable, component-based, fast dev |
| Styling | Tailwind CDN | Zero build config, load from CDN |
| PWA | `vite-plugin-pwa` | Service worker, installable |
| WebRTC | Browser native API | No wrapper, no deps |
| Chat | WebRTC DataChannel | P2P only, never touches server |

---

## Non-Goals

- This is not Zoom. Not Jitsi. Not a Zoom alternative for teams.
- No SFU, no server-side media, no scale-to-100-people.
- No persistence of any kind by design.
- No analytics, no telemetry, no accounts infrastructure.

---

## Success Criteria

- Cold deploy on a fresh VPS: under 5 minutes
- Binary size: under 20MB
- RAM idle: under 30MB
- Time from "open link" to connected call: under 5 seconds on good connection
- Zero required config for Mode 1 (GitHub Pages just works)

---

## Resolved Design Decisions

### Room IDs
- Single UUID, stripped of dashes → 32-char hex string in URL
- No custom names, no human-readable IDs
- Rationale: Mode 1 links never expire — readable IDs would be guessable and scannable. 128 bits entropy is brute-force-proof.

### Chat Persistence
- Ephemeral only via DataChannel — lost on refresh
- Intentional, fits the "nothing persists" ethos

### Rate Limiting
- Max concurrent connections per IP (not time-windowed)
- Simple counter, no sliding window complexity

### STUN for Mode 1
- JSON array of public STUN servers baked into build
- Client tries in order, first success wins
- Update the list periodically in releases

### ICE Restart
- Re-negotiate if client disconnects but app stays open
- Standard ICE restart flow

### PWA Behavior
- Installability only — cached shell, app-like icon/launch
- Not offline-first; app requires server connection

### Built-in TURN Authentication
- Short-lived HMAC credentials, no database:
  - `username = timestamp:roomID`
  - `password = HMAC-SHA256(secret, username)`
- Secret stored in `config.json`
- Credentials injected at signaling time, expire after X minutes
- Scoped to room, no storage, no accounts

### WebSocket Reconnection
- **Before P2P established:** retry with exponential backoff, show "reconnecting..." UI, timeout after N attempts
- **After P2P established:** do nothing — call continues over WebRTC, optionally show small "signaling offline" indicator
- **New participant joins while WS down:** they retry independently, existing call unaffected

### TURN Recommendations for Self-Hosters
- Document in README: Metered.ca free tier, Twilio STUN/TURN API, or one-line Coturn Docker command