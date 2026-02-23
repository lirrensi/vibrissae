# Implementation Plan: Go Server

**Target:** `server/` directory
**Date:** 2026-02-23

---

## Overview

Build the Go backend for VideoChat: signaling server + embedded TURN + static file serving.

**Final state:** Single binary that:
1. Serves Vue app (filesystem for dev, embedded for prod)
2. Handles WebSocket signaling for WebRTC negotiation
3. Runs embedded TURN server (pion/turn) with HMAC auth — **enabled by default, works out of the box**
4. Manages rooms in memory with TTL cleanup
5. Requires zero config for basic usage

---

## File Structure (Final)

```
server/
├── main.go           # Entry point, HTTP server setup
├── config.go         # Config struct, loading, defaults
├── room.go           # Room management (sync.Map, TTL)
├── signaling.go      # WebSocket handler
├── turn.go           # Embedded TURN server
├── auth.go           # HMAC credential generation
├── static.go         # go:embed setup for Vue app
└── go.mod
```

---

## Dependencies

```go
require (
    github.com/google/uuid v1.6.0
    github.com/gorilla/websocket v1.5.1
    github.com/pion/turn/v4 v4.0.0
)
```

---

## Implementation Steps

### Step 1: Project Initialization

**File:** `server/go.mod`

```go
module videochat

go 1.21

require (
    github.com/google/uuid v1.6.0
    github.com/gorilla/websocket v1.5.1
    github.com/pion/turn/v4 v4.0.0
)
```

**Action:**
```bash
cd server
go mod init videochat
go get github.com/google/uuid
go get github.com/gorilla/websocket
go get github.com/pion/turn/v4
```

---

### Step 2: Config Loading

**File:** `server/config.go`

**Spec:**
- Define `Config` struct matching `docs/arch.md`
- Load from `config.json` (same directory as binary)
- Apply defaults for missing fields
- Validate required fields

**Code skeleton:**

```go
package main

import (
    "crypto/rand"
    "encoding/hex"
    "encoding/json"
    "os"
)

type Config struct {
    Port          int          `json:"port"`
    BaseURL       string       `json:"base_url"`
    RoomTTLMins   int          `json:"room_ttl_minutes"`
    Turn          TurnConfig   `json:"turn"`
    TurnServers   []TurnServer `json:"turn_servers"`
}

type TurnConfig struct {
    Enabled          bool   `json:"enabled"`
    Port             int    `json:"port"`
    RateLimitPerIP   int    `json:"rate_limit_per_ip"`
    CredentialTTLMin int    `json:"credential_ttl_minutes"`
    Secret           string `json:"secret"`
}

type TurnServer struct {
    URLs       string `json:"urls"`
    Username   string `json:"username,omitempty"`
    Credential string `json:"credential,omitempty"`
}

func LoadConfig(path string) (*Config, error) {
    // Read file
    // Parse JSON
    // Apply defaults
    // Return config
}

func (c *Config) ApplyDefaults() {
    if c.Port == 0 {
        c.Port = 8080
    }
    if c.RoomTTLMins == 0 {
        c.RoomTTLMins = 60
    }
    // TURN enabled by default - works out of the box
    if c.Turn.Enabled == false && c.Turn.Port == 0 {
        c.Turn.Enabled = true
    }
    if c.Turn.Port == 0 {
        c.Turn.Port = 3478
    }
    if c.Turn.RateLimitPerIP == 0 {
        c.Turn.RateLimitPerIP = 10
    }
    if c.Turn.CredentialTTLMin == 0 {
        c.Turn.CredentialTTLMin = 30
    }
    if c.Turn.Secret == "" {
        // Generate random secret if not provided
        c.Turn.Secret = generateRandomSecret()
    }
}

func generateRandomSecret() string {
    b := make([]byte, 32)
    rand.Read(b)
    return hex.EncodeToString(b)
}
```

---

### Step 3: Room Management

**File:** `server/room.go`

**Spec:**
- Thread-safe room storage using `sync.Map`
- Room struct with participants map
- TTL tracking with last activity timestamp
- Background goroutine for cleanup

**Code skeleton:**

```go
package main

import (
    "sync"
    "time"
)

type Room struct {
    ID           string
    Participants map[string]*Participant
    LastActivity time.Time
    mu           sync.RWMutex
}

type Participant struct {
    ID       string
    Conn     *websocket.Conn
    JoinedAt time.Time
}

type RoomManager struct {
    rooms    sync.Map // map[string]*Room
    ttl      time.Duration
    stopCleanup chan struct{}
}

func NewRoomManager(ttl time.Duration) *RoomManager {
    rm := &RoomManager{
        ttl: ttl,
        stopCleanup: make(chan struct{}),
    }
    go rm.cleanupLoop()
    return rm
}

func (rm *RoomManager) GetOrCreate(roomID string) *Room {
    // Load or create room atomically
}

func (rm *RoomManager) AddParticipant(roomID, participantID string, conn *websocket.Conn) *Room {
    // Add participant to room
    // Update last activity
}

func (rm *RoomManager) RemoveParticipant(roomID, participantID string) {
    // Remove participant
    // Update last activity
    // Delete room if empty
}

func (rm *RoomManager) Broadcast(roomID, fromParticipantID string, msg []byte) {
    // Send message to all other participants
}

func (rm *RoomManager) cleanupLoop() {
    ticker := time.NewTicker(time.Minute)
    defer ticker.Stop()
    
    for {
        select {
        case <-ticker.C:
            rm.cleanupExpired()
        case <-rm.stopCleanup:
            return
        }
    }
}

func (rm *RoomManager) cleanupExpired() {
    // Range over rooms
    // Delete if LastActivity + TTL < now
}

func (rm *RoomManager) Stop() {
    close(rm.stopCleanup)
}
```

---

### Step 4: HMAC Authentication

**File:** `server/auth.go`

**Spec:**
- Generate short-lived TURN credentials
- Username format: `timestamp:roomID`
- Password: HMAC-SHA256 of username with secret
- Validate credentials on TURN allocation

**Code skeleton:**

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/base64"
    "fmt"
    "time"
)

type TurnCredentials struct {
    Username string
    Password string
}

func GenerateTurnCredentials(roomID, secret string, ttlMinutes int) TurnCredentials {
    timestamp := time.Now().Unix() / 60
    username := fmt.Sprintf("%d:%s", timestamp, roomID)
    
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write([]byte(username))
    password := base64.StdEncoding.EncodeToString(mac.Sum(nil))
    
    return TurnCredentials{
        Username: username,
        Password: password,
    }
}

func ValidateTurnCredentials(username, password, secret string, ttlMinutes int) bool {
    // Parse timestamp from username
    // Check if within TTL window
    // Verify HMAC
    // Return true/false
}
```

---

### Step 5: Embedded TURN Server

**File:** `server/turn.go`

**Spec:**
- Start pion/turn server
- HMAC credential validation
- Per-IP rate limiting
- Graceful shutdown

**Code skeleton:**

```go
package main

import (
    "net"
    "sync"
    "time"

    "github.com/pion/turn/v4"
)

type TurnServer struct {
    server      *turn.Server
    rateLimits  sync.Map // map[string]int (IP -> count)
    maxPerIP    int
}

func NewTurnServer(cfg TurnConfig, authFunc turn.AuthHandler) (*TurnServer, error) {
    // Create listener on cfg.Port
    // Configure turn.Server with auth handler
    // Start server
}

func (s *TurnServer) authHandler(username, realm string, srcAddr net.Addr) (string, bool) {
    // Extract IP from srcAddr
    // Check rate limit
    // Validate credentials via ValidateTurnCredentials
    // Return password and true/false
}

func (s *TurnServer) checkRateLimit(ip string) bool {
    // Increment counter for IP
    // Return false if exceeds maxPerIP
}

func (s *TurnServer) decrementCount(ip string) {
    // Called on allocation close
}

func (s *TurnServer) Close() error {
    return s.server.Close()
}
```

---

### Step 6: WebSocket Signaling

**File:** `server/signaling.go`

**Spec:**
- WebSocket upgrade with gorilla/websocket
- Message types: join, leave, offer, answer, ice-candidate, error
- Participant ID assignment on join
- Relay messages between participants
- Inject TURN credentials on join

**Message format:**

```go
type SignalingMessage struct {
    Type    string          `json:"type"`
    From    string          `json:"from,omitempty"`
    To      string          `json:"to,omitempty"`
    Payload json.RawMessage `json:"payload,omitempty"`
}
```

**Code skeleton:**

```go
package main

import (
    "encoding/json"
    "log"
    "net/http"

    "github.com/google/uuid"
    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
    CheckOrigin: func(r *http.Request) bool {
        return true // Configure properly for production
    },
}

type SignalingHandler struct {
    rooms   *RoomManager
    config  *Config
}

func NewSignalingHandler(rooms *RoomManager, config *Config) *SignalingHandler {
    return &SignalingHandler{rooms: rooms, config: config}
}

func (h *SignalingHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    // Extract roomID from path: /ws/{roomID}
    // Upgrade to WebSocket
    // Assign participant ID using uuid.New().String()
    // Send join-ack with TURN credentials
    // Broadcast peer-joined to others
    // Read loop: handle messages
    // On close: broadcast peer-left, cleanup
}

func (h *SignalingHandler) handleMessage(room *Room, participantID string, msg SignalingMessage) {
    switch msg.Type {
    case "offer":
        // Relay to target participant
    case "answer":
        // Relay to target participant
    case "ice-candidate":
        // Relay to target participant
    }
}

func (h *SignalingHandler) sendMessage(conn *websocket.Conn, msg SignalingMessage) error {
    data, err := json.Marshal(msg)
    if err != nil {
        return err
    }
    return conn.WriteMessage(websocket.TextMessage, data)
}

func (h *SignalingHandler) sendJoinAck(conn *websocket.Conn, participantID string, creds TurnCredentials) error {
    // Send join-ack with participant ID and TURN credentials
}

func (h *SignalingHandler) broadcastPeerJoined(room *Room, newParticipantID string) {
    // Send peer-joined to all existing participants
}

func (h *SignalingHandler) broadcastPeerLeft(room *Room, leftParticipantID string) {
    // Send peer-left to remaining participants
}
```

---

### Step 7: Static File Serving

**File:** `server/static.go`

**Spec:**
- **Dual mode for flexibility:**
  - **Development:** Serve from filesystem (`web_ui/dist/`) - no rebuild needed when Vue changes
  - **Production:** Embed with `go:embed` - single binary deployment
- Use build tag `embed` to switch modes
- Serve index.html for all non-asset routes (SPA routing)
- Serve assets with proper content-type
- Inject runtime config into index.html

**Code skeleton:**

```go
package main

import (
    "io/fs"
    "net/http"
    "os"
)

// Production build (go build -tags embed)
// +build embed

import "embed"

//go:embed dist/*
var embeddedFiles embed.FS

func getStaticFS() http.FileSystem {
    sub, _ := fs.Sub(embeddedFiles, "dist")
    return http.FS(sub)
}
```

```go
// Development build (no tag)
// +build !embed

func getStaticFS() http.FileSystem {
    // Serve from filesystem for dev flexibility
    // Path: web_ui/dist/ relative to binary
    return http.Dir("web_ui/dist")
}

type SPAHandler struct {
    staticFS   http.FileSystem
    config     *Config
    indexHTML  []byte // cached index.html with config injected
}

func NewSPAHandler(cfg *Config) *SPAHandler {
    h := &SPAHandler{
        staticFS: getStaticFS(),
        config:   cfg,
    }
    h.loadIndexHTML()
    return h
}

func (h *SPAHandler) loadIndexHTML() {
    // Load index.html
    // Inject window.__CONFIG__ placeholder
    // Cache for serving
}

func (h *SPAHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    // Try to serve static file from filesystem
    // If not found, serve cached index.html (SPA routing)
}

func (h *SPAHandler) updateConfig(creds TurnCredentials) {
    // Update cached index.html with new TURN credentials
    // Called when new participant joins
}
```

**Build commands:**
```bash
# Development (filesystem, no embed)
go run ./server

# Production (embedded)
go build -tags embed -o videochat ./server
```
```

---

### Step 8: Main Entry Point

**File:** `server/main.go`

**Spec:**
- Load config
- Start TURN server (if enabled)
- Create room manager
- Setup routes
- Start HTTP server
- Graceful shutdown

**Code skeleton:**

```go
package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"
)

func main() {
    // Load config
    cfg, err := LoadConfig("config.json")
    if err != nil {
        log.Fatalf("Failed to load config: %v", err)
    }
    cfg.ApplyDefaults()

    // Start TURN server (enabled by default)
    var turnServer *TurnServer
    if cfg.Turn.Enabled {
        turnServer, err = NewTurnServer(cfg.Turn, cfg.Turn.Secret)
        if err != nil {
            log.Fatalf("Failed to start TURN server: %v", err)
        }
        defer turnServer.Close()
        log.Printf("TURN server started on port %d", cfg.Turn.Port)
    }

    // Create room manager
    roomManager := NewRoomManager(time.Duration(cfg.RoomTTLMins) * time.Minute)
    defer roomManager.Stop()

    // Setup routes
    mux := http.NewServeMux()
    
    // WebSocket signaling
    signalingHandler := NewSignalingHandler(roomManager, cfg)
    mux.Handle("/ws/", signalingHandler)
    
    // Health check
    mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("OK"))
    })
    
    // Static files (SPA)
    spaHandler := NewSPAHandler(cfg)
    mux.Handle("/", spaHandler)

    // Create server
    server := &http.Server{
        Addr:    fmt.Sprintf(":%d", cfg.Port),
        Handler: mux,
    }

    // Graceful shutdown
    go func() {
        sigChan := make(chan os.Signal, 1)
        signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
        <-sigChan
        
        log.Println("Shutting down...")
        ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
        defer cancel()
        server.Shutdown(ctx)
    }()

    log.Printf("Server starting on port %d", cfg.Port)
    if err := server.ListenAndServe(); err != http.ErrServerClosed {
        log.Fatalf("Server error: %v", err)
    }
}
```

---

## Testing Strategy

### Unit Tests

| File | Tests |
|------|-------|
| `config_test.go` | Load config, defaults, validation |
| `room_test.go` | Create room, add/remove participants, cleanup |
| `auth_test.go` | Generate credentials, validate, expiry |

### Integration Tests

| Scenario | Test |
|----------|------|
| WebSocket join | Connect, receive join-ack |
| Signaling relay | Two clients, exchange offer/answer/ICE |
| Room expiry | Create room, wait for TTL, verify deleted |
| TURN rate limit | Connect N times from same IP, verify rejected |

---

## Build Commands

```bash
# Development (filesystem, no embed tag)
cd server
go run .

# Development with Vue running separately
cd web_ui && pnpm dev &
cd server && go run .

# Build production binary (embedded)
go build -tags embed -o videochat .

# Build for specific OS (production)
GOOS=linux GOARCH=amd64 go build -tags embed -o videochat-linux .
GOOS=darwin GOARCH=amd64 go build -tags embed -o videochat-macos .
GOOS=windows GOARCH=amd64 go build -tags embed -o videochat.exe .
```

---

## Implementation Order

1. `go.mod` — project init + dependencies (uuid, websocket, pion/turn)
2. `config.go` — load config, defaults, random secret generation
3. `room.go` — room management
4. `auth.go` — HMAC credentials
5. `signaling.go` — WebSocket handler, uuid for participant IDs
6. `turn.go` — full pion/turn implementation with HMAC auth
7. `static.go` — dual mode (filesystem/embed), config injection
8. `main.go` — wire everything together

---

## Notes

- **Static serving dual mode:** 
  - Dev: filesystem reads from `web_ui/dist/` - Vue changes reflected without rebuild
  - Prod: `go build -tags embed` for single binary deployment
- **Missing dist/ directory:** Server logs warning but continues - serves 404 for static routes
- **TURN enabled by default** - works out of the box, no config required for basic usage
- **Random secret generation:** If `turn.secret` not provided, generates random 32-byte secret on startup
- WebSocket origin check should be tightened for production
