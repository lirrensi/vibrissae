# VideoChat — Architecture Reference

Complete technical specification for the VideoChat application.

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
│   └── auth.go       # HMAC credential generation
├── web_ui/           # Vue 3 frontend
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.js
│   │   ├── components/
│   │   │   ├── Home.vue          # Landing, generate link
│   │   │   ├── Room.vue          # Video call view
│   │   │   ├── VideoGrid.vue     # Participant video layout
│   │   │   ├── Controls.vue      # Mic/cam/disconnect toggles
│   │   │   ├── DeviceSelect.vue  # Camera/mic picker
│   │   │   └── Chat.vue          # DataChannel text chat
│   │   ├── composables/
│   │   │   ├── useWebRTC.js      # WebRTC connection logic
│   │   │   ├── useSignaling.js   # WebSocket signaling
│   │   │   └── useDevices.js     # Media device enumeration
│   │   └── utils/
│   │       └── uuid.js           # UUID generation
│   ├── vite.config.js
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
| WebRTC | Browser Native API | — |

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

**Direct Mode:**
```go
func startDirectMode(cfg *Config) {
    // Resolve public IP for TURN relay
    if cfg.PublicIP == "auto" {
        cfg.PublicIP = detectPublicIP()
    }
    
    // Setup autocert
    certManager := autocert.Manager{
        Prompt:     autocert.AcceptTOS,
        HostPolicy: autocert.HostWhitelist(cfg.Domain),
        Cache:      autocert.DirCache("certs"),
    }
    
    // HTTP server on :80 (redirect + ACME challenge)
    // HTTPS server on :443
}
```

**Proxy Mode:**
```go
func startProxyMode(cfg *Config) {
    // Validate public_ip is set (TURN needs it)
    if cfg.PublicIP == "" {
        log.Fatal("public_ip required in proxy mode")
    }
    
    // Plain HTTP on configured port
    // Trust X-Forwarded-* headers
}
```

**Local Mode:**
```go
func startLocalMode(cfg *Config) {
    // Auto-detect local IP for TURN relay
    if cfg.PublicIP == "auto" {
        cfg.PublicIP = detectLocalIP()
    }
    
    // Generate self-signed certificate
    // Valid for: localhost, 127.0.0.1, and detected local IP
    cert := GenerateLocalCert(cfg.PublicIP)
    
    // HTTPS on configured port (default 8443)
}
```

**Local Mode Configuration:**
```json
{
  "mode": "local",
  "https_port": 8443,
  "public_ip": "auto",
  "turn_port": 3478,
  "turn": { "enabled": true }
}
```

**Local Mode Notes:**
- Self-signed certificate is generated on first run and cached in `local_certs/`
- Browser will show a security warning - click "Advanced" → "Proceed" to continue
- Certificate is valid for `localhost`, `127.0.0.1`, and the detected local IP
- Other devices on the network can connect using the local IP (e.g., `https://192.168.1.100:8443`)
- TURN server uses the detected local IP for relay address

### HTTP Routes

| Route | Handler | Description |
|-------|---------|-------------|
| `GET /` | `embeddedFS` | Serve Vue SPA (index.html) |
| `GET /assets/*` | `embeddedFS` | Serve static assets |
| `GET /room/{id}` | `embeddedFS` | SPA handles routing |
| `WS /ws/{id}` | `signalingHandler` | WebSocket signaling |
| `GET /health` | `healthHandler` | Health check endpoint |

### Config Loading (`config.go`)

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
    
    // Both modes
    TurnPort    int    `json:"turn_port"`   // TURN UDP port
    PublicIP    string `json:"public_ip"`   // "auto" or explicit IP for TURN relay
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

type TurnServer struct {
    URLs       string `json:"urls"`
    Username   string `json:"username,omitempty"`
    Credential string `json:"credential,omitempty"`
}
```

**Mode Validation:**
```go
func (c *Config) Validate() error {
    switch c.Mode {
    case "direct":
        if c.Domain == "" {
            return errors.New("domain required in direct mode")
        }
        // PublicIP defaults to "auto"
    case "proxy":
        if c.PublicIP == "" {
            return errors.New("public_ip required in proxy mode")
        }
    default:
        return errors.New("mode must be 'direct' or 'proxy'")
    }
    return nil
}
```

**Defaults:**
- Mode: (required, no default)
- Port: 8080 (proxy mode)
- HTTPSPort: 8443 (local mode)
- TurnPort: 3478
- PublicIP: "auto" (direct/local mode) / required (proxy mode)
- Room TTL: 60 minutes
- TURN enabled: true (works out of the box)
- Rate limit: 10 concurrent connections per IP
- Credential TTL: 30 minutes

**Port Summary:**

| Mode | HTTP | HTTPS | TURN (UDP) |
|------|------|-------|------------|
| Direct | :80 | :443 | :turn_port |
| Proxy | :port | (reverse proxy) | :turn_port |
| Local | — | :https_port | :turn_port |

### Room Management (`room.go`)

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

### Signaling Protocol (`signaling.go`)

**WebSocket Message Format:**

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
  initiatorId: string;  // who initiates connections
}

// peer-joined payload  
interface PeerJoinedPayload {
  participantId: string;
  initiatorId: string;  // who should initiate to this new peer
}
```

**Message Flow:**

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

**Connection Lifecycle:**
1. Client connects to `WS /ws/{roomID}`
2. Server assigns participant ID
3. Server sends `join-ack` with ID and TURN credentials
4. Server broadcasts `peer-joined` to existing participants
5. Server relays offers/answers/ICE candidates between participants
6. On disconnect, server broadcasts `peer-left`

### Initiator Assignment

To prevent race conditions where both peers try to initiate simultaneously, the server 
designates a single "initiator" for each connection:

- **On join:** If room was empty, new participant is initiator. Otherwise, the 
  longest-connected existing participant becomes initiator.
- **On peer-joined:** Server tells existing participants who should initiate to the newcomer.
- **When initiator leaves:** The next longest-connected participant automatically becomes 
  the new initiator (server recalculates on each join).

This ensures exactly one peer initiates each WebRTC connection, preventing the "stable" 
state conflict that occurs when both sides create offers simultaneously.

### TURN Server (`turn.go`)

Uses `pion/turn` embedded in the binary. **Cannot be proxied** — requires direct UDP access.

```go
func NewEmbeddedTurnServer(cfg TurnConfig, publicIP string, port int) *turn.Server {
    // Listen on 0.0.0.0:port (UDP)
    // Advertise publicIP for relay address
    // Rate limiting per IP
    // HMAC credential validation
}
```

**Relay Address Configuration:**
```go
RelayAddressGenerator: &turn.RelayAddressGeneratorStatic{
    RelayAddress: net.ParseIP(publicIP),  // What clients connect to
    Address:      "0.0.0.0",               // What we bind to
}
```

**Public IP Resolution:**
- Direct mode: `public_ip: "auto"` → HTTP request to external service
- Proxy mode: `public_ip` must be set manually

**Rate Limiting:**
- Map of IP → connection count
- Checked on new TURN allocation
- Decremented on disconnect

### HMAC Authentication (`auth.go`)

```go
func GenerateTurnCredentials(roomID, secret string, ttlMinutes int) (username, password string) {
    timestamp := time.Now().Unix() / 60 // minute precision
    username = fmt.Sprintf("%d:%s", timestamp, roomID)
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write([]byte(username))
    password = base64.StdEncoding.EncodeToString(mac.Sum(nil))
    return
}
```

**Validation:**
- Parse timestamp from username
- Reject if outside TTL window
- Verify HMAC
- Extract roomID for scoping

---

## Frontend Architecture

### Entry Point (`main.js`)

```javascript
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

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

**GitHub Pages Mode:**
Config baked at build time in `vite.config.js`:
```javascript
define: {
  __CONFIG__: JSON.stringify({
    baseUrl: "https://user.github.io/videochat",
    stunServers: ["stun:stun.l.google.com:19302", ...]
  })
}
```

**Note:** `turn.port` is separate from HTTP port since TURN uses UDP directly.

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
    ├── VideoGrid.vue
    │   └── VideoTile.vue (per participant)
    ├── Controls.vue
    │   ├── MicToggle
    │   ├── CamToggle
    │   ├── DeviceSelect.vue
    │   └── DisconnectButton
    └── Chat.vue
```

### Composables

#### `useWebRTC.js`

```javascript
export function useWebRTC(roomId) {
  const localStream = ref(null)
  const remoteStreams = ref(new Map()) // participantId -> MediaStream
  const peerConnections = ref(new Map()) // participantId -> RTCPeerConnection
  const dataChannels = ref(new Map()) // participantId -> RTCDataChannel

  // Initialize local media
  async function startLocalStream(deviceId?) {}
  
  // Create peer connection for new participant
  function createPeerConnection(participantId, isInitiator) {}
  
  // Handle incoming SDP
  async function handleOffer(participantId, offer) {}
  async function handleAnswer(participantId, answer) {}
  
  // Handle ICE candidates
  function handleIceCandidate(participantId, candidate) {}
  
  // Toggle media
  function toggleVideo() {}
  function toggleAudio() {}
  
  // Switch devices
  function switchVideoDevice(deviceId) {}
  function switchAudioDevice(deviceId) {}
  
  // Cleanup
  function disconnect() {}
  
  return { localStream, remoteStreams, ... }
}
```

#### `useSignaling.js`

```javascript
export function useSignaling(roomId) {
  const ws = ref(null)
  const participantId = ref(null)
  const participants = ref([])
  const connected = ref(false)

  function connect() {
    ws.value = new WebSocket(`${wsBaseUrl}/ws/${roomId}`)
    // Message handling
    // Reconnection logic
  }
  
  function send(type, to, payload) {}
  
  function onMessage(callback) {}
  
  function disconnect() {}
  
  return { participantId, participants, connected, ... }
}
```

**Reconnection Logic:**
```javascript
const reconnectAttempts = ref(0)
const maxReconnectAttempts = 10
const baseDelay = 1000 // ms

function handleDisconnect() {
  if (p2pEstablished) {
    // Don't reconnect, just show indicator
    signalingOffline.value = true
    return
  }
  
  if (reconnectAttempts.value < maxReconnectAttempts) {
    const delay = baseDelay * Math.pow(2, reconnectAttempts.value)
    setTimeout(connect, delay)
    reconnectAttempts.value++
  }
}
```

#### `useDevices.js`

```javascript
export function useDevices() {
  const cameras = ref([])
  const microphones = ref []
  const selectedCamera = ref(null)
  const selectedMicrophone = ref(null)

  async function enumerateDevices() {}
  
  async function getInitialDevices() {}
  
  return { cameras, microphones, ... }
}
```

### WebRTC Configuration

```javascript
const rtcConfig = computed(() => {
  const config = { iceServers: [] }
  
  // External TURN servers (priority)
  if (window.__CONFIG__.turn_servers) {
    config.iceServers.push(...window.__CONFIG__.turn_servers)
  }
  
  // Built-in TURN
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

// Triggered on iceConnectionStateChange → 'disconnected' or 'failed'
pc.oniceconnectionstatechange = () => {
  if (['disconnected', 'failed'].includes(pc.iceConnectionState)) {
    restartIce(participantId)
  }
}
```

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

function setupChatHandlers() {
  chatChannel.value.onopen = () => console.log('Chat connected')
  chatChannel.value.onmessage = (event) => {
    messages.value.push(JSON.parse(event.data))
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
# Build Vue app
cd web_ui && npm run build

# Build Go binary (embeds dist/)
cd server && go build -o videochat .
```

### GitHub Pages Build

```bash
# Build with public config
cd web_ui && VITE_MODE=github-pages npm run build
# Output to docs/ for GitHub Pages
```

---

## Security Considerations

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

## Future Considerations (Not v1)

- Screen sharing (`navigator.mediaDevices.getDisplayMedia`)
- E2E encryption for chat messages
- SFU for 10+ participants
- Mobile apps (React Native / Flutter)
