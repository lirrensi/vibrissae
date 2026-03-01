# Vibrissae — Architecture Reference

Complete technical specification for the VideoChat application.

---

## Overview

Vibrissae is a WebRTC video calling application with two operating modes:

| Mode | Signaling Transport | Media Relay | Build Command |
|------|---------------------|-------------|---------------|
| **Web Bundle** | Trystero (P2P) | STUN only | `npm run build:p2p` |
| **Self-Hosted** | WebSocket | Built-in TURN | `npm run build:server` |

The same Vue frontend codebase supports both modes via a transport factory that auto-detects the deployment context.

---

## Scope Boundary

**This system owns:**
- WebRTC connection management (offers, answers, ICE candidates)
- Signaling via WebSocket or Trystero
- TURN relay server (Self-Hosted mode)
- Room lifecycle management
- Frontend UI for video calls

**This system does NOT own:**
- User authentication (deliberately none)
- Persistent storage (deliberately ephemeral)
- Media mixing/SFU (P2P mesh architecture)
- External TURN services (can be configured, not provided)

**Boundary interfaces:**
- Frontend ↔ Signaling Transport (abstract interface)
- Signaling Transport ↔ Network (WebSocket or Trystero)
- Server ↔ TURN Server (embedded, same process)

---

## Project Structure

```
VideoChat/
├── server/           # Go backend
│   ├── main.go       # Entry point, HTTP server setup
│   ├── config.go     # Config loading and validation
│   ├── room.go       # Room management (sync.Map, TTL, cleanup)
│   ├── signaling.go  # WebSocket handler for SDP/ICE exchange
│   ├── turn.go       # Embedded TURN server (pion/turn)
│   ├── auth.go       # HMAC credential generation
│   └── cert.go       # Self-signed cert generation (local mode)
├── web_ui/           # Vue 3 frontend
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.js
│   │   ├── components/
│   │   │   ├── Home.vue          # Landing, generate link
│   │   │   ├── Room.vue          # Video call view
│   │   │   ├── VideoGrid.vue     # Participant video layout
│   │   │   ├── VideoTile.vue     # Single video tile
│   │   │   ├── Controls.vue      # Mic/cam/disconnect toggles
│   │   │   ├── DeviceSelect.vue  # Camera/mic picker
│   │   │   ├── TechLog.vue       # Connection stats & debug log
│   │   │   └── Chat.vue          # DataChannel text chat
│   │   ├── stores/
│   │   │   ├── room.ts           # Room state (participants, streams)
│   │   │   └── log.ts            # Global tech log store
│   │   ├── composables/
│   │   │   ├── useWebRTC.js      # WebRTC connection logic
│   │   │   ├── useSignaling.js   # Signaling abstraction
│   │   │   └── useDevices.js     # Media device enumeration
│   │   ├── transports/
│   │   │   ├── index.ts                    # Re-exports
│   │   │   ├── factory.ts                  # Creates transport stack based on mode
│   │   │   ├── WebSocketTransport.ts       # Server-hosted signaling
│   │   │   ├── TrysteroTransport.ts        # MessageTransport impl for Trystero
│   │   │   ├── GunJSTransport.ts           # MessageTransport impl for GunJS
│   │   │   ├── CombinedTransport.ts        # Merges multiple transports
│   │   │   └── P2PSignalingProtocol.ts     # Signaling logic layer
│   │   ├── utils/
│   │   │   ├── uuid.js           # UUID generation
│   │   │   └── p2p-config-loader.ts  # Load P2P config
│   │   └── types/
│   │       ├── transport.ts      # MessageTransport & SignalingTransport interfaces
│   │       ├── signaling.ts      # Signaling message types
│   │       └── p2p-config.ts     # P2P config types
│   ├── public/
│   │   ├── p2p-config.json       # P2P configuration
│   │   └── p2p-config.schema.json
│   ├── vite.config.ts
│   └── package.json
├── docs/
│   ├── product.md    # Human-readable product spec
│   └── arch.md       # This file
└── prd.md            # Original requirements
```

---

## Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Server Language | Go | 1.21+ |
| Signaling | `gorilla/websocket` | v1.5.x |
| Embedded TURN | `pion/turn` | v4.x |
| Static Embed | `go:embed` | stdlib |
| Frontend Framework | Vue 3 | 3.x |
| Build Tool | Vite | 5.x |
| Styling | Tailwind CSS | CDN |
| PWA | `vite-plugin-pwa` | 0.x |
| P2P Signaling | Trystero | 0.21.x |
| WebRTC | Browser Native API | — |

---

## Build Modes

The frontend supports multiple build targets:

| Command | Output | Use Case |
|---------|--------|----------|
| `npm run build:p2p` | `dist/` folder | Static hosting (GitHub Pages, Netlify) |
| `npm run build:p2p:single` | Single `index.html` | Offline use, shareable file |
| `npm run build:server` | `server/dist/` (embedded) | Self-Hosted binary |

### Build Mode Detection

```typescript
// vite.config.ts
const isSingleFile = process.env.BUILD_MODE === 'single'
const isServer = mode === 'server'
```

- `BUILD_MODE=p2p` → Standard P2P build with chunked output
- `BUILD_MODE=single` → Single HTML file with inlined assets
- `BUILD_MODE=server` → Output to `server/dist/` for Go embedding

---

## Transport Architecture

The transport layer is split into two abstraction levels, allowing new signaling backends to be added with minimal code.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     useWebRTC.ts                            │
│         (WebRTC connections, offer/answer/ice)              │
└──────────────────────────┬──────────────────────────────────┘
                           │ send()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     useSignaling.ts                         │
│         (handles join-ack, peer-joined, peer-left)          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              P2PSignalingProtocol (NEW)                     │
│  Transport-agnostic signaling logic:                        │
│  • Hello exchange handshake                                 │
│  • Initiator election (lexicographic UUID compare)          │
│  • Peer ID mapping (transportPeerId → participantId)        │
│  • Self-message filtering                                   │
│  • Message routing to correct recipient                     │
│  • Resend logic for reliable delivery                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              MessageTransport Interface                     │
│  Pure message passing - NO signaling logic:                 │
│  • connect() / disconnect()                                 │
│  • broadcast(message)                                       │
│  • sendTo(peerId, message)                                  │
│  • onMessage(callback)                                      │
│  • onPeerJoin(callback) / onPeerLeave(callback)             │
│                                                             │
│  Implementations:                                           │
│  ┌───────────┬───────────┬───────────┬───────────┬─────────┐│
│  │ Trystero  │   GunJS   │ WebSocket │  Custom   │Combined ││
│  │ Transport │ Transport │ Transport │  Relay    │Transport││
│  │           │ (impl.)   │  (server) │ (future)  │(multi)  ││
│  └───────────┴───────────┴───────────┴───────────┴─────────┘│
└─────────────────────────────────────────────────────────────┘
```

### MessageTransport Interface

Low-level message transport. Implementations handle only peer discovery and message passing — no signaling logic.

```typescript
// types/transport.ts
interface TransportMessage {
  type: string
  payload: unknown
}

interface MessageTransport {
  // Connection state
  connected: Ref<boolean>
  selfId: string  // Transport-level peer ID (e.g., Trystero peerId)
  
  // Lifecycle
  connect(): Promise<void>
  disconnect(): void
  
  // Messaging
  broadcast(message: TransportMessage): void
  sendTo(peerId: string, message: TransportMessage): void
  
  // Events
  onMessage(handler: (msg: TransportMessage, fromPeerId: string) => void): void
  onPeerJoin(handler: (peerId: string) => void): void
  onPeerLeave(handler: (peerId: string) => void): void
}
```

### SignalingTransport Interface

High-level signaling transport. Wraps `MessageTransport` with P2P handshake protocol.

```typescript
// types/transport.ts
interface SignalingTransport {
  connected: Ref<boolean>
  participantId: Ref<string | null>  // Application-level participant ID
  
  connect(): void
  disconnect(): void
  send(message: SignalingMessage): void
  onMessage(handler: (msg: SignalingMessage) => void): void
}
```

### P2PSignalingProtocol

Wraps any `MessageTransport` to provide standardized P2P signaling:

```typescript
// transports/P2PSignalingProtocol.ts
export function createP2PSignalingProtocol(
  transport: MessageTransport,
  config: P2PSignalingConfig
): SignalingTransport {
  // Generates participantId (UUID)
  // Implements hello handshake
  // Handles initiator election
  // Routes messages by 'to' field
  // Filters self-messages
  // Implements resend logic
}
```

**Handshake Protocol:**

```
Peer A                      MessageTransport                      Peer B
  │                               │                                   │
  │──── hello (participantId) ───>│──── hello (participantId) ──────>│
  │<─── hello (participantId) ────│<─── hello (participantId) ──────│
  │                               │                                   │
  │  Compare UUIDs: smaller = initiator                              │
  │                               │                                   │
  │==== WebRTC Offer (initiator) ====================================>│
  │<=== WebRTC Answer (non-initiator) ===============================│
  │                               │                                   │
  │================ ICE Candidates =================================>│
  │<=============== ICE Candidates ==================================│
```

### Transport Factory

Creates the appropriate transport stack based on mode and supports multiple P2P providers running in parallel:

```typescript
// transports/factory.ts
export type TransportMode = 'auto' | 'websocket' | 'p2p'
export type P2PProvider = 'trystero' | 'gun'

interface CreateTransportOptions {
  roomId: string
  mode?: TransportMode
  /** P2P providers to use in parallel. Default: ['trystero'] */
  providers?: P2PProvider[]
}

export async function createTransport(options: CreateTransportOptions): Promise<SignalingTransport> {
  const { roomId, mode = 'auto', providers = ['trystero'] } = options
  const effectiveMode = determineMode(mode)
  
  switch (effectiveMode) {
    case 'websocket':
      return createWebSocketTransport(roomId)
    case 'p2p': {
      const config = await loadP2PConfig()
      
      // Create message transports for each provider
      const transports: MessageTransport[] = []
      for (const provider of providers) {
        switch (provider) {
          case 'trystero':
            transports.push(createTrysteroTransport({ roomId, config }))
            break
          case 'gun':
            if (config.transports.gun?.enabled) {
              transports.push(createGunJSTransport({ roomId, peers: config.transports.gun.peers }))
            }
            break
        }
      }
      
      // Merge multiple transports into one
      const messageTransport = transports.length === 1 
        ? transports[0] 
        : createCombinedTransport(transports)
      
      return createP2PSignalingProtocol(messageTransport, config.signaling)
    }
  }
}
```

### Mode Detection Logic

| Condition | Transport Stack |
|-----------|-----------------|
| `mode: 'websocket'` | WebSocketTransport (direct) |
| `mode: 'p2p'` + 1 provider | Single MessageTransport → P2PSignalingProtocol |
| `mode: 'p2p'` + multiple providers | CombinedTransport (merged) → P2PSignalingProtocol |
| `mode: 'auto'` + `window.__CONFIG__` exists | WebSocketTransport (Self-Hosted) |
| `mode: 'auto'` + no `window.__CONFIG__` | TrysteroTransport → P2PSignalingProtocol (Web Bundle) |

### CombinedTransport

When multiple P2P providers are enabled, `CombinedTransport` merges them:

- `broadcast()` → sends to ALL transports
- `sendTo()` → sends via ALL transports
- `onPeerJoin` → fires when ANY transport discovers a peer
- `onMessage` → fires when ANY transport receives a message
- `connected` → true when FIRST transport connects

This provides redundancy: if one transport fails, others still work.

### Adding New Transports

To add a new transport:

1. Implement `MessageTransport` interface in `transports/NewTransport.ts`
2. Add config type to `types/p2p-config.ts`
3. Register in factory's provider switch

```typescript
// Example: NewTransport.ts
export function createNewTransport(options: NewTransportOptions): MessageTransport {
  return {
    connected: ref(false),
    selfId: crypto.randomUUID(),
    connect: async () => { /* ... */ },
    disconnect: () => { /* ... */ },
    broadcast: (msg) => { /* ... */ },
    sendTo: (peerId, msg) => { /* ... */ },
    onMessage: (handler) => { /* ... */ },
    onPeerJoin: (handler) => { /* ... */ },
    onPeerLeave: (handler) => { /* ... */ }
  }
}
```

No changes to signaling protocol, useWebRTC, or useSignaling required.

---

## Server Architecture

### Entry Point (`main.go`)

**Startup Flow:**

```
┌──────────────────────────────────────────────────────────────────┐
│                          main()                                   │
│  ┌─────────────┐                                                  │
│  │ Load Config │                                                  │
│  └──────┬──────┘                                                  │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Validate mode                                                │ │
│  │                                                              │ │
│  │  cfg.Mode == "direct" ?                                      │ │
│  │                                                              │ │
│  │  YES → Direct Mode                                           │ │
│  │        ├─ Validate domain is set                             │ │
│  │        ├─ Auto-detect public IP (if "auto")                  │ │
│  │        ├─ Setup autocert (Let's Encrypt)                     │ │
│  │        ├─ Listen :80 (HTTP-01 challenge)                     │ │
│  │        └─ Listen :443 (HTTPS)                                │ │
│  │                                                              │ │
│  │  cfg.Mode == "local" ?                                       │ │
│  │                                                              │ │
│  │  YES → Local Mode                                            │ │
│  │        ├─ Auto-detect local IP (if "auto")                   │ │
│  │        ├─ Generate self-signed certificate                   │ │
│  │        └─ Listen :https_port (HTTPS)                         │ │
│  │                                                              │ │
│  │  NO → Proxy Mode                                             │ │
│  │        ├─ Validate public_ip is set                          │ │
│  │        └─ Listen :port (plain HTTP)                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐  │
│  │ Start TURN  │→ │ HTTP Server │→ │ Routes (WS + Static)     │  │
│  │ (UDP port)  │  │             │  └──────────────────────────┘  │
│  └─────────────┘  └─────────────┘                                 │
└──────────────────────────────────────────────────────────────────┘
```

### HTTP Routes

| Route | Handler | Description |
|-------|---------|-------------|
| `GET /` | `embeddedFS` | Serve Vue SPA (index.html) |
| `GET /assets/*` | `embeddedFS` | Serve static assets |
| `GET /room/{id}` | `embeddedFS` | SPA handles routing |
| `WS /ws/{id}` | `signalingHandler` | WebSocket signaling |
| `GET /health` | `healthHandler` | Health check endpoint |
| `GET /stats` | `statsHandler` | Room count and TURN status |

### Config Schema (`config.go`)

```go
type Config struct {
    // Mode (explicit, no inference)
    Mode        string `json:"mode"`        // "direct", "proxy", or "local"
    
    // Direct mode
    Domain      string `json:"domain"`      // Required for direct mode
    
    // Proxy mode  
    Port        int    `json:"port"`        // HTTP port (proxy mode)
    
    // Local mode
    HTTPSPort   int    `json:"https_port"`  // HTTPS port (local mode)
    
    // All modes
    TurnPort    int    `json:"turn_port"`   // TURN UDP port
    PublicIP    string `json:"public_ip"`   // "auto" or explicit IP
    BaseURL     string `json:"base_url"`
    RoomTTLMins int          `json:"room_ttl_minutes"`
    Turn        TurnConfig   `json:"turn"`
    TurnServers []TurnServer `json:"turn_servers"`
}

type TurnConfig struct {
    Enabled           bool   `json:"enabled"`
    RateLimitPerIP    int    `json:"rate_limit_per_ip"`
    CredentialTTLMin  int    `json:"credential_ttl_minutes"`
    Secret            string `json:"secret"`
}
```

### Mode Validation

```go
func (c *Config) Validate() error {
    switch c.Mode {
    case "direct":
        if c.Domain == "" {
            return errors.New("domain required in direct mode")
        }
    case "proxy":
        if c.PublicIP == "" || c.PublicIP == "auto" {
            return errors.New("public_ip required in proxy mode (cannot be 'auto')")
        }
    case "local":
        // No additional validation required
    default:
        return errors.New("mode must be 'direct', 'proxy', or 'local'")
    }
    return nil
}
```

### Defaults

| Field | Default |
|-------|---------|
| Mode | (required, no default) |
| Port | 8080 (proxy mode) |
| HTTPSPort | 8443 (local mode) |
| TurnPort | 3478 |
| PublicIP | "auto" (direct/local mode) / required (proxy mode) |
| Room TTL | 60 minutes |
| TURN enabled | true |
| Rate limit | 10 concurrent connections per IP |
| Credential TTL | 30 minutes |

### Port Summary

| Mode | HTTP | HTTPS | TURN (UDP) |
|------|------|-------|------------|
| Direct | :80 | :443 | :turn_port |
| Proxy | :port | (reverse proxy) | :turn_port |
| Local | — | :https_port | :turn_port |

---

## P2P Signaling (Trystero)

When no server is available (Web Bundle mode), Vibrissae uses Trystero for serverless P2P signaling. TrysteroTransport implements `MessageTransport` — pure message passing without signaling logic.

### TrysteroTransport

Implements `MessageTransport` interface:

```typescript
// transports/TrysteroTransport.ts
export function createTrysteroTransport(config: P2PConfig, roomId: string): MessageTransport {
  // Joins Trystero room with configured backends
  // Provides: broadcast(), sendTo(), onMessage, onPeerJoin, onPeerLeave
  // selfId = Trystero peer ID
}
```

### Supported Backends

**Trystero (built-in):**

| Backend | Import | Bundle Size | Config Key |
|---------|--------|-------------|------------|
| **Nostr** | `trystero/nostr` | 8K | `nostr` |
| **BitTorrent** | `trystero/torrent` | 5K | `torrent` |
| **MQTT** | `trystero/mqtt` | 75K | `mqtt` |
| **IPFS** | `trystero/ipfs` | 119K | `ipfs` |

**Additional P2P Transport:**

| Backend | Package | Bundle Size | Config Key |
|---------|---------|-------------|------------|
| **GunJS** | `gun` | ~50K | `gun` |

**Priority**: Nostr is prioritized over BitTorrent per product requirements. GunJS runs alongside Trystero for redundancy.

### P2P Config Schema

```typescript
// types/p2p-config.ts
interface P2PConfig {
  version: number
  transports: {
    priority: TransportType[]
    torrent?: TorrentConfig
    nostr?: NostrConfig
    mqtt?: MQTTConfig
    ipfs?: IPFSConfig
    gun?: GunConfig
  }
  signaling: {
    resendIntervalMs: number
    resendMaxAttempts: number
  }
  iceServers?: IceServer[]
}

type TransportType = 'torrent' | 'nostr' | 'mqtt' | 'ipfs' | 'gun'

interface GunConfig {
  enabled: boolean
  peers?: string[]  // Gun relay peers to connect to
}
```

### Default Configuration

```json
{
  "version": 1,
  "transports": {
    "priority": ["nostr", "torrent"],
    "torrent": {
      "enabled": true,
      "announce": ["wss://tracker.openwebtorrent.com", "wss://tracker.webtorrent.dev"]
    },
    "nostr": {
      "enabled": true,
      "relays": ["wss://relay.damus.io", "wss://nos.lol"]
    }
  },
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "stun:stun1.l.google.com:19302" },
    { "urls": "stun:stun2.l.google.com:19302" }
    // ... more STUN/TURN servers
  ]
}
```

**ICE Servers**: Must include at least one STUN server. TURN servers are optional but recommended for NAT traversal in restrictive network environments. Loaded via `getIceServers()` utility.

### Happy Eyeballs Connection

All enabled backends connect in parallel. First successful connection wins:

```typescript
// TrysteroTransport.ts
const promises = config.transports.priority.map(async (type) => {
  if (isTransportEnabled(type, config)) {
    await connectTransport(type)
  }
})
Promise.all(promises)
```

### Trystero Backend Config

Each backend has its own config section in `p2p-config.json`:

```typescript
// types/p2p-config.ts
type TransportType = 'torrent' | 'nostr' | 'mqtt' | 'ipfs' | 'gun'  // 'gun' added for GunJS

interface TorrentConfig { enabled: boolean; announce?: string[] }
interface NostrConfig { enabled: boolean; relays?: string[] }
interface MQTTConfig { enabled: boolean; url?: string }
interface IPFSConfig { enabled: boolean; bootstrap?: string[] }
interface GunConfig { enabled: boolean; peers?: string[] }  // For GunJS
```

### Config Loading

```typescript
// utils/p2p-config-loader.ts
export async function loadP2PConfig(): Promise<P2PConfig> {
  // 1. Try fetch /p2p-config.json
  // 2. Fall back to inlined default config
  // 3. Merge with defaults for partial configs
}

// ICE servers loading
export function getIceServers(): Promise<RTCIceServer[]> {
  // Returns iceServers from config, or defaults
}
```

**Why Trystero?** Trystero provides peer discovery via decentralized networks. The P2PSignalingProtocol layer adds the structured handshake needed for WebRTC on top of Trystero's message passing.

---

## P2P Signaling (GunJS)

GunJS is an additional P2P transport that runs alongside Trystero for redundancy. Unlike Trystero's relay-based model, GunJS uses a decentralized graph database with automatic mesh networking.

### How It Works

GunJS provides persistent data sync across peers:
- **Room data**: `gun.get(roomId)` — shared namespace for all room participants
- **Broadcast**: `gun.get(roomId).get('broadcast').get(msgId).put(message)` — all peers receive
- **Direct messages**: `gun.get(roomId).get('direct').get(peerId).put(message)` — only target peer receives
- **Peer discovery**: Listens to GunJS `hi`/`bye` events + tracks peers from incoming messages

### GunJSTransport Implementation

```typescript
// transports/GunJSTransport.ts
export function createGunJSTransport(options: GunJSTransportOptions): MessageTransport {
  const gun = Gun({
    peers: peerList,
    localStorage: false,
    radisk: false
  })
  
  // Subscribe to broadcast path
  gun.get(roomId).get('broadcast').map().on((data, key) => {
    // Handle incoming broadcast messages
  })
  
  // Subscribe to direct messages path
  gun.get(roomId).get('direct').get(selfId).map().on((data, key) => {
    // Handle incoming direct messages
  })
  
  return {
    connected, selfId,
    connect, disconnect,
    broadcast, sendTo,
    onMessage, onPeerJoin, onPeerLeave
  }
}
```

### Configuration

```json
{
  "transports": {
    "gun": {
      "enabled": true,
      "peers": [
        "https://gun-manhattan.herokuapp.com/gun",
        "https://gun-eu.herokuapp.com/gun"
      ]
    }
  }
}
```

If `peers` is not specified, default public Gun peers are used.

### Running Multiple Transports

When both Trystero and GunJS are enabled:

```typescript
await createTransport({ 
  roomId, 
  providers: ['trystero', 'gun']  // Both run in parallel
})
```

The `CombinedTransport` merges them:
- Messages broadcast to BOTH transports
- Peer discovery merges from BOTH transports
- If one fails, the other still works

This provides redundancy for better connectivity in restrictive network environments.

---

## Room Management (`room.go`)

```go
type Room struct {
    ID           string
    Participants map[string]*Participant
    LastActivity time.Time
}

type Participant struct {
    ID         string
    Conn       *websocket.Conn
    JoinedAt   time.Time
}

var rooms sync.Map // map[string]*Room
```

**Operations:**
- `GetOrCreateRoom(id string) *Room`
- `AddParticipant(roomID, participantID string, conn *websocket.Conn)`
- `RemoveParticipant(roomID, participantID string)`
- `Broadcast(roomID, participantID string, msg Message)`
- `CleanupExpiredRooms()` — runs every minute via goroutine

---

## Signaling Protocol (`signaling.go`)

### WebSocket Message Format

```typescript
interface SignalingMessage {
  type: 'join' | 'leave' | 'offer' | 'answer' | 'ice-candidate' | 'error';
  from?: string;      // participant ID (server-assigned)
  to?: string;        // target participant ID (for direct messages)
  payload?: any;      // SDP, ICE candidate, or error details
}

// join-ack payload
interface JoinAckPayload {
  participantId: string;
  roomId: string;
  turnCredentials?: { username: string; password: string; };
  existingPeers: string[];
  initiatorId: string;
}

// peer-joined payload  
interface PeerJoinedPayload {
  participantId: string;
  initiatorId: string;
}
```

### Message Flow

```
Participant A                Server                Participant B
     │                         │                         │
     │──── join ──────────────>│                         │
     │<─── join-ack (id) ──────│                         │
     │<─── peer-joined ────────│──── peer-joined ───────>│
     │                         │                         │
     │──── offer ─────────────>│──── offer ─────────────>│
     │                         │                         │
     │<─── answer ─────────────│<─── answer ─────────────│
     │                         │                         │
     │<─── ice-candidate ──────│<─── ice-candidate ──────│
     │──── ice-candidate ─────>│──── ice-candidate ─────>│
     │                         │                         │
     │                         │<─── leave ──────────────│
     │<─── peer-left ──────────│                         │
```

### Initiator Assignment

To prevent race conditions where both peers try to initiate simultaneously:

- **On join:** If room was empty, new participant is initiator. Otherwise, the longest-connected existing participant becomes initiator.
- **On peer-joined:** Server tells existing participants who should initiate to the newcomer.
- **When initiator leaves:** The next longest-connected participant automatically becomes the new initiator.

---

## TURN Server (`turn.go`)

Uses `pion/turn` embedded in the binary. **Cannot be proxied** — requires direct UDP access.

```go
func NewEmbeddedTurnServer(cfg TurnConfig, publicIP string, port int) *EmbeddedTurnServer {
    // Listen on 0.0.0.0:port (UDP)
    // Advertise publicIP for relay address
    // Rate limiting per IP
    // HMAC credential validation
}
```

### Relay Address Configuration

```go
RelayAddressGenerator: &turn.RelayAddressGeneratorStatic{
    RelayAddress: net.ParseIP(publicIP),  // What clients connect to
    Address:      "0.0.0.0",               // What we bind to
}
```

### HMAC Authentication (`auth.go`)

```go
func GenerateTurnCredentials(roomID, secret string, ttlMinutes int) (username, password string) {
    timestamp := time.Now().Unix() / 60
    username = fmt.Sprintf("%d:%s", timestamp, roomID)
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write([]byte(username))
    password = base64.StdEncoding.EncodeToString(mac.Sum(nil))
    return
}
```

---

## Frontend Architecture

### Config Injection

**Self-Hosted Mode:**
Server injects config in `index.html`:
```html
<script>window.__CONFIG__ = { 
  baseUrl: "https://call.example.com",
  turn: { enabled: true, port: 3478 },
  turnCredentials: { username: "...", password: "..." }
}</script>
```

**Web Bundle Mode:**
No server injection. Transport factory detects absence of `window.__CONFIG__` and uses Trystero.

### Routing

Client-side routing via Vue Router (hash mode):

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Home.vue` | Landing page, generate link |
| `/room/:id` | `Room.vue` | Video call view |

### Component Hierarchy

```
App.vue
├── Home.vue              # /
│   └── GenerateButton
└── Room.vue              # /room/:id
    ├── VideoGrid.vue (80%)     # Left side - all video feeds
    │   └── VideoTile.vue (per participant)
    ├── TechLog.vue             # Right panel top - connection stats
    ├── Chat.vue                # Right panel bottom (always visible)
    └── Controls.vue
        ├── MicToggle
        ├── CamToggle
        ├── DeviceSelect.vue
        └── DisconnectButton
```

### Layout

```
┌────────────────────────────────────┬──────────────────┐
│                                    │  TechLog.vue     │
│      VideoGrid.vue                 │  (connection     │
│      (all participants)            │   stats, events) │
│                                    ├──────────────────┤
│         80%                        │  Chat.vue        │
│                                    │  (always open)   │
│                                    │      20%         │
└────────────────────────────────────┴──────────────────┘
```

### WebRTC Configuration

```javascript
const rtcConfig = computed(() => {
  const config = { iceServers: [] }
  
  // External TURN servers (priority)
  if (window.__CONFIG__.turn_servers) {
    config.iceServers.push(...window.__CONFIG__.turn_servers)
  }
  
  // Built-in TURN (Self-Hosted mode)
  if (window.__CONFIG__.turn?.enabled) {
    config.iceServers.push({
      urls: `turn:${window.__CONFIG__.baseUrl}:${window.__CONFIG__.turn.port}`,
      username: window.__CONFIG__.turnCredentials.username,
      credential: window.__CONFIG__.turnCredentials.password
    })
  }
  
  // STUN servers (fallback)
  if (window.__CONFIG__.stunServers) {
    config.iceServers.push(
      ...window.__CONFIG__.stunServers.map(url => ({ urls: url }))
    )
  }
  
  return config
})
```

### ICE Restart

```javascript
async function restartIce(participantId) {
  const pc = peerConnections.value.get(participantId)
  if (!pc) return
  
  const offer = await pc.createOffer({ iceRestart: true })
  await pc.setLocalDescription(offer)
  signaling.send('offer', participantId, offer)
}

pc.oniceconnectionstatechange = () => {
  if (['disconnected', 'failed'].includes(pc.iceConnectionState)) {
    restartIce(participantId)
  }
}
```

### Track Renegotiation

When adding a NEW track (video or audio) to an already-established peer connection, renegotiation is required:

```typescript
// useWebRTC.ts - tryGetVideo() example
peerConnections.value.forEach((pc, participantId) => {
  const sender = pc.getSenders().find(s => s.track?.kind === 'video')
  const wasTrackAdded = !sender  // Track added (not replaced)?
  
  if (sender) {
    sender.replaceTrack(newVideoTrack)
  } else {
    pc.addTrack(newVideoTrack, store.localStream!)
  }
  
  // If NEW track, trigger renegotiation
  if (wasTrackAdded) {
    triggerRenegotiation(participantId, pc)
  }
})

async function triggerRenegotiation(participantId, pc) {
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  signaling.send('offer', participantId, offer)
}
```

**Why needed:** WebRTC requires a new SDP offer/answer exchange when adding new media tracks to an existing connection. This handles:
- User enables camera AFTER joining a call
- User enables microphone AFTER joining a call
- Switching to a different camera/mic device

### DataChannel Chat

```javascript
const chatChannel = ref(null)
const messages = ref([])

// Create channel (initiator)
function createChatChannel(pc) {
  chatChannel.value = pc.createDataChannel('chat')
  setupChatHandlers()
}

// Receive channel (non-initiator)
pc.ondatachannel = (event) => {
  if (event.channel.label === 'chat') {
    chatChannel.value = event.channel
    setupChatHandlers()
  }
}

function sendMessage(text) {
  const msg = { text, timestamp: Date.now(), from: participantId.value }
  chatChannel.value.send(JSON.stringify(msg))
  messages.value.push(msg)
}
```

---

## Build & Deployment

### Development

```bash
# Terminal 1: Frontend dev server
cd web_ui && npm run dev

# Terminal 2: Go server (serves API, proxies static to Vite)
cd server && go run .
```

### Production Build

```bash
# Web Bundle (P2P mode)
cd web_ui && npm run build:p2p
# Output: dist/ folder for static hosting

# Web Bundle Single File
cd web_ui && npm run build:p2p:single
# Output: dist/index.html (single file)

# Self-Hosted
cd web_ui && npm run build:server
cd server && go build -o videochat .
# Output: single binary with embedded frontend
```

---

## Security Considerations

### Access Model: Link Secrecy
Rooms are accessed via URL only — no passwords, no accounts. The room ID (UUID) provides the security boundary:
- 128-bit entropy UUIDs are not guessable
- Anyone with the link can join — this is by design
- No server-side access logs or participant history
- Same model as Google Meet, Zoom personal links, Jitsi

**User-facing warning:** The UI explicitly warns users when generating a link: "Anyone with this link can join your call. There's no password — share only with people you trust."

### TURN Credentials
- Short-lived HMAC tokens (30 min default)
- Scoped to room ID
- No database, no persistence

### Rate Limiting
- Per-IP connection limit
- Prevents TURN server abuse

### Room IDs
- 128-bit entropy (UUID)
- Not guessable
- No custom names

### No Persistent Data
- Rooms in RAM only
- No logs of calls
- No message storage

---

## Error Handling

### Signaling Errors

| Code | Message | Client Action |
|------|---------|---------------|
| 4001 | Room not found | Show error, redirect to home |
| 4002 | Room expired | Show error, redirect to home |
| 4003 | Room full | Show "room full" message |

### WebRTC Errors

| Scenario | Handling |
|----------|----------|
| Permission denied | Show "camera/mic access required" |
| Device not found | Fall back to default, show warning |
| ICE failed | Show "connection failed", offer retry |
| Disconnected | Attempt ICE restart, show status |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Binary size | < 20MB |
| RAM idle | < 30MB |
| RAM per room | ~1MB |
| Time to first frame | < 5s |
| Signaling latency | < 100ms |

---

## Design Decisions

| Decision | Why | Confidence |
|----------|-----|------------|
| Trystero for P2P signaling | No server required, multiple fallback backends | High |
| **Layered transport architecture** | Separates signaling protocol from message transport, enabling easy addition of new backends (GunJS, custom relays) | High |
| P2P mesh (no SFU) | Simplicity, works for small groups | High |
| Embedded TURN | Single binary, no external dependencies | High |
| No persistence | Privacy, simplicity | High |
| Transport factory pattern | Same codebase for both modes | High |
| Nostr as default P2P backend | Decentralized, good redundancy, small bundle | Medium |

---

## Future Considerations (Not v1)

- **Custom relay transport** — For users who want to run their own relay server without full WebSocket signaling
- Screen sharing (`navigator.mediaDevices.getDisplayMedia`)
- E2E encryption for chat messages
- SFU for 10+ participants
- Mobile apps (React Native / Flutter)
