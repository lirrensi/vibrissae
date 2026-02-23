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

```
┌─────────────────────────────────────────────────┐
│                     main()                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │ Load Config │→ │ Start TURN  │→ │ HTTP Srv │ │
│  └─────────────┘  └─────────────┘  └──────────┘ │
│                                          │       │
│                    ┌─────────────────────┤       │
│                    ▼                     ▼       │
│              ┌──────────┐         ┌──────────┐  │
│              │   WS     │         │  Static  │  │
│              │ /room/ID │         │  embed   │  │
│              └──────────┘         └──────────┘  │
└─────────────────────────────────────────────────┘
```

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
    Port           int            `json:"port"`
    BaseURL        string         `json:"base_url"`
    RoomTTLMins    int            `json:"room_ttl_minutes"`
    Turn           TurnConfig     `json:"turn"`
    TurnServers    []TurnServer   `json:"turn_servers"`
}

type TurnConfig struct {
    Enabled           bool   `json:"enabled"`
    Port              int    `json:"port"`
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

**Defaults:**
- Port: 8080
- Room TTL: 60 minutes
- TURN port: 3478
- Rate limit: 10 concurrent connections per IP
- Credential TTL: 30 minutes

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

### TURN Server (`turn.go`)

Uses `pion/turn` embedded in the binary.

```go
func StartTURNServer(cfg TurnConfig) *turn.Server {
    // pion/turn server setup
    // Rate limiting per IP
    // HMAC credential validation
}
```

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
  turn: { enabled: true, ... },
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
