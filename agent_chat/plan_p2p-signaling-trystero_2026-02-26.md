# Plan: P2P Signaling with Trystero
_Decouple from server WebSocket; support true P2P mode with multi-transport fallback._

---

## Checklist
- [x] Step 1: Add dependencies (trystero, vite-plugin-singlefile)
- [x] Step 2: Create p2p-config.json schema and default config
- [x] Step 3: Create TrysteroTransport adapter
- [x] Step 4: Create MultiTransport for happy eyeballs
- [x] Step 5: Create transport factory with runtime detection
- [x] Step 6: Update vite.config.ts with build modes
- [x] Step 7: Create npm scripts for builds
- [x] Step 8: Update useSignaling to auto-detect mode
- [x] Step 9: Test both build modes

---

## Context

**Current state:**
- `SignalingTransport` interface exists
- `WebSocketTransport` works for server-hosted mode
- `useSignaling` accepts optional transport parameter
- Single build target: Go-embedded SPA

**Goal:**
- `build:server` → WebSocket transport only, Go embed
- `build:p2p` → Trystero multi-transport, external config
- `build:p2p:single` → Same as above, inlined as single HTML file

---

## Prerequisites

- Node.js 18+ installed
- `npm` or `pnpm` available
- Frontend builds successfully: `cd web_ui && npm run build`
- Trystero supports: torrent, nostr, ipfs, gun, mqtt (we'll use torrent + nostr + gun)

---

## Scope Boundaries

**OUT OF SCOPE:**
- Changes to WebRTC media logic (useWebRTC.ts)
- Changes to TURN server configuration
- Changes to UI components
- Changes to server Go code (separate from P2P build)
- GunJS transport adapter (future work, after Trystero)

**IN SCOPE:**
- Transport layer adapters only
- Build configuration
- Runtime mode detection
- Config loading logic

---

## Steps

### Step 1: Add Dependencies

Open `web_ui/package.json`.

Add to `dependencies`:

```json
{
  "dependencies": {
    "pinia": "^3.0.4",
    "vue": "^3.5.28",
    "vue-router": "^5.0.3",
    "trystero": "^0.21.0"
  }
}
```

Add to `devDependencies`:

```json
{
  "devDependencies": {
    "vite-plugin-singlefile": "^2.2.0"
  }
}
```

Run in `web_ui/` directory:

```bash
npm install
```

✅ Success: `npm ls trystero` shows installed version.  
❌ If failed: Check Node version compatibility, clear npm cache.

---

### Step 2: Create p2p-config.json Schema

Create `public/p2p-config.json`:

```json
{
  "$schema": "./p2p-config.schema.json",
  "version": 1,
  "transports": {
    "priority": ["torrent", "nostr", "gun"],
    "torrent": {
      "enabled": true,
      "announce": [
        "wss://tracker.openwebtorrent.com",
        "wss://tracker.webtorrent.dev"
      ]
    },
    "nostr": {
      "enabled": true,
      "relays": [
        "wss://relay.damus.io",
        "wss://nostr.mom",
        "wss://relay.nostr.band"
      ]
    },
    "gun": {
      "enabled": false,
      "peers": [
        "https://gun-manhattan.herokuapp.com/gun"
      ]
    }
  },
  "signaling": {
    "resendIntervalMs": 3000,
    "resendMaxAttempts": 10
  }
}
```

Create `public/p2p-config.schema.json` (for validation):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "version": { "type": "integer", "minimum": 1 },
    "transports": {
      "type": "object",
      "properties": {
        "priority": {
          "type": "array",
          "items": { "enum": ["torrent", "nostr", "ipfs", "gun", "mqtt"] }
        }
      }
    },
    "signaling": {
      "type": "object",
      "properties": {
        "resendIntervalMs": { "type": "integer", "minimum": 500 },
        "resendMaxAttempts": { "type": "integer", "minimum": 1 }
      }
    }
  }
}
```

✅ Success: Both files exist in `public/` directory.  
❌ If failed: Check JSON syntax with `cat public/p2p-config.json | jq .`

---

### Step 3: Create P2P Config Type

Create `web_ui/src/types/p2p-config.ts`:

```typescript
export interface P2PConfig {
  version: number
  transports: {
    priority: TransportType[]
    torrent?: TorrentConfig
    nostr?: NostrConfig
    gun?: GunConfig
    ipfs?: IPFSConfig
    mqtt?: MQTTConfig
  }
  signaling: {
    resendIntervalMs: number
    resendMaxAttempts: number
  }
}

export type TransportType = 'torrent' | 'nostr' | 'gun' | 'ipfs' | 'mqtt'

export interface TorrentConfig {
  enabled: boolean
  announce: string[]
}

export interface NostrConfig {
  enabled: boolean
  relays: string[]
}

export interface GunConfig {
  enabled: boolean
  peers: string[]
}

export interface IPFSConfig {
  enabled: boolean
  bootstrap?: string[]
}

export interface MQTTConfig {
  enabled: boolean
  url: string
}
```

✅ Success: TypeScript compiles without errors.  
❌ If failed: Check interface syntax, ensure proper exports.

---

### Step 4: Create TrysteroTransport Adapter

Create `web_ui/src/transports/TrysteroTransport.ts`:

```typescript
import { ref, onUnmounted } from 'vue'
import { joinRoom } from 'trystero'
import type { SignalingMessage } from '@/types/signaling'
import type { SignalingTransport } from '@/types/transport'
import type { P2PConfig, TransportType } from '@/types/p2p-config'

export interface TrysteroTransportOptions {
  roomId: string
  config: P2PConfig
  onConnect?: () => void
  onDisconnect?: () => void
}

export function createTrysteroTransport(options: TrysteroTransportOptions): SignalingTransport {
  const { roomId, config, onConnect, onDisconnect } = options
  
  const connected = ref(false)
  const participantId = ref<string | null>(null)
  const activeTransports = new Map<TransportType, ReturnType<typeof joinRoom>>()
  const messageHandler = ref<((msg: SignalingMessage) => void) | null>(null)
  
  // Generate unique participant ID
  participantId.value = crypto.randomUUID()
  
  let resendTimer: ReturnType<typeof setInterval> | null = null
  const pendingMessages = new Map<string, { msg: SignalingMessage; attempts: number }>()
  
  async function connectTransport(type: TransportType): Promise<boolean> {
    try {
      const transportConfig = getTransportConfig(type, config)
      if (!transportConfig) return false
      
      const room = joinRoom(transportConfig, roomId)
      
      // Handle incoming messages
      room.onPeerJoin((peerId) => {
        console.log(`[Trystero:${type}] Peer joined:`, peerId)
      })
      
      room.onPeerLeave((peerId) => {
        console.log(`[Trystero:${type}] Peer left:`, peerId)
      })
      
      // Subscribe to messages
      const [send, receive] = room.makeAction('signal')
      
      receive((data: SignalingMessage, peerId: string) => {
        // Filter messages not meant for us
        if (data.to && data.to !== participantId.value) return
        
        // Add from field if missing
        const enriched: SignalingMessage = {
          ...data,
          from: data.from || peerId
        }
        
        messageHandler.value?.(enriched)
      })
      
      activeTransports.set(type, { room, send })
      
      // If this is first successful connection
      if (!connected.value) {
        connected.value = true
        onConnect?.()
      }
      
      return true
    } catch (err) {
      console.error(`[Trystero:${type}] Failed to connect:`, err)
      return false
    }
  }
  
  function connect() {
    // Try all transports in parallel (happy eyeballs)
    const promises = config.transports.priority.map(async (type) => {
      if (isTransportEnabled(type, config)) {
        const success = await connectTransport(type)
        console.log(`[Trystero] ${type}: ${success ? 'connected' : 'failed'}`)
      }
    })
    
    Promise.all(promises).then(() => {
      // Start resend timer for reliable signaling
      startResendTimer()
    })
  }
  
  function disconnect() {
    if (resendTimer) {
      clearInterval(resendTimer)
      resendTimer = null
    }
    
    activeTransports.forEach(({ room }) => room.leave())
    activeTransports.clear()
    
    connected.value = false
    onDisconnect?.()
  }
  
  function send(message: SignalingMessage) {
    // Add from field
    const enriched: SignalingMessage = {
      ...message,
      from: participantId.value!
    }
    
    // Send to all active transports
    activeTransports.forEach(({ send }, type) => {
      try {
        send(enriched)
      } catch (err) {
        console.error(`[Trystero:${type}] Send failed:`, err)
      }
    })
    
    // Track for resend
    if (message.type === 'offer') {
      const key = `${message.to}-${message.type}`
      pendingMessages.set(key, { msg: enriched, attempts: 0 })
    }
  }
  
  function onMessage(handler: (msg: SignalingMessage) => void) {
    messageHandler.value = handler
  }
  
  function startResendTimer() {
    if (resendTimer) return
    
    resendTimer = setInterval(() => {
      pendingMessages.forEach((pending, key) => {
        pending.attempts++
        
        if (pending.attempts >= config.signaling.resendMaxAttempts) {
          pendingMessages.delete(key)
          return
        }
        
        // Resend to all transports
        activeTransports.forEach(({ send }, type) => {
          try {
            send(pending.msg)
          } catch (err) {
            console.error(`[Trystero:${type}] Resend failed:`, err)
          }
        })
      })
    }, config.signaling.resendIntervalMs)
  }
  
  onUnmounted(disconnect)
  
  return {
    connected,
    participantId,
    connect,
    disconnect,
    send,
    onMessage
  }
}

// Helper functions
function getTransportConfig(type: TransportType, config: P2PConfig) {
  switch (type) {
    case 'torrent':
      return config.transports.torrent?.enabled ? {
        appId: 'vibrissae-p2p',
        rtcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
      } : null
    case 'nostr':
      return config.transports.nostr?.enabled ? {
        relayUrls: config.transports.nostr.relays
      } : null
    case 'gun':
      return config.transports.gun?.enabled ? {
        gunPeers: config.transports.gun.peers
      } : null
    default:
      return null
  }
}

function isTransportEnabled(type: TransportType, config: P2PConfig): boolean {
  switch (type) {
    case 'torrent': return config.transports.torrent?.enabled ?? false
    case 'nostr': return config.transports.nostr?.enabled ?? false
    case 'gun': return config.transports.gun?.enabled ?? false
    case 'ipfs': return config.transports.ipfs?.enabled ?? false
    case 'mqtt': return config.transports.mqtt?.enabled ?? false
    default: return false
  }
}
```

✅ Success: File compiles, Trystero types resolve.  
❌ If failed: Check Trystero import, ensure proper typing.

---

### Step 5: Create Config Loader

Create `web_ui/src/utils/p2p-config-loader.ts`:

```typescript
import type { P2PConfig } from '@/types/p2p-config'

// Default config inlined for single-file builds
const defaultConfig: P2PConfig = {
  version: 1,
  transports: {
    priority: ['torrent', 'nostr'],
    torrent: {
      enabled: true,
      announce: [
        'wss://tracker.openwebtorrent.com',
        'wss://tracker.webtorrent.dev'
      ]
    },
    nostr: {
      enabled: true,
      relays: [
        'wss://relay.damus.io',
        'wss://nostr.mom'
      ]
    }
  },
  signaling: {
    resendIntervalMs: 3000,
    resendMaxAttempts: 10
  }
}

export async function loadP2PConfig(): Promise<P2PConfig> {
  // In single-file mode, fetch might fail (no external file)
  // In normal P2P mode, fetch external config
  
  try {
    // Try to fetch external config first
    const response = await fetch('/p2p-config.json', {
      cache: 'no-cache' // Always get latest
    })
    
    if (response.ok) {
      const config = await response.json()
      console.log('[P2PConfig] Loaded from external file')
      return mergeWithDefaults(config)
    }
  } catch (err) {
    console.log('[P2PConfig] External config not found, using default')
  }
  
  // Return default inlined config
  return defaultConfig
}

function mergeWithDefaults(config: Partial<P2PConfig>): P2PConfig {
  return {
    version: config.version ?? defaultConfig.version,
    transports: {
      priority: config.transports?.priority ?? defaultConfig.transports.priority,
      torrent: { ...defaultConfig.transports.torrent, ...config.transports?.torrent },
      nostr: { ...defaultConfig.transports.nostr, ...config.transports?.nostr },
      gun: { ...defaultConfig.transports.gun, ...config.transports?.gun },
      ipfs: config.transports?.ipfs,
      mqtt: config.transports?.mqtt
    },
    signaling: {
      resendIntervalMs: config.signaling?.resendIntervalMs ?? defaultConfig.signaling.resendIntervalMs,
      resendMaxAttempts: config.signaling?.resendMaxAttempts ?? defaultConfig.signaling.resendMaxAttempts
    }
  }
}
```

✅ Success: TypeScript compiles, fetch logic correct.  
❌ If failed: Check async/await syntax, ensure proper error handling.

---

### Step 6: Create Transport Factory

Create `web_ui/src/transports/factory.ts`:

```typescript
import type { SignalingTransport } from '@/types/transport'
import { createWebSocketTransport } from './WebSocketTransport'
import { createTrysteroTransport } from './TrysteroTransport'
import { loadP2PConfig } from '@/utils/p2p-config-loader'

export type TransportMode = 'auto' | 'websocket' | 'p2p'

interface CreateTransportOptions {
  roomId: string
  mode?: TransportMode
}

export async function createTransport(
  options: CreateTransportOptions
): Promise<SignalingTransport> {
  const { roomId, mode = 'auto' } = options
  
  // Determine mode
  const effectiveMode = determineMode(mode)
  
  console.log(`[TransportFactory] Mode: ${effectiveMode}`)
  
  switch (effectiveMode) {
    case 'websocket':
      return createWebSocketTransport(roomId)
      
    case 'p2p':
      const config = await loadP2PConfig()
      return createTrysteroTransport({ roomId, config })
      
    default:
      throw new Error(`Unknown transport mode: ${effectiveMode}`)
  }
}

function determineMode(requestedMode: TransportMode): 'websocket' | 'p2p' {
  if (requestedMode === 'websocket') return 'websocket'
  if (requestedMode === 'p2p') return 'p2p'
  
  // Auto-detect:
  // - If window.__CONFIG__ exists (server-injected), use WebSocket
  // - Otherwise, use P2P
  if (typeof window !== 'undefined' && (window as any).__CONFIG__) {
    console.log('[TransportFactory] Auto-detected: server-hosted mode')
    return 'websocket'
  }
  
  console.log('[TransportFactory] Auto-detected: P2P mode')
  return 'p2p'
}

// For non-async usage
export function createWebSocketTransportSync(roomId: string): SignalingTransport {
  return createWebSocketTransport(roomId)
}
```

✅ Success: Factory logic correct, mode detection works.  
❌ If failed: Check window object access (needs typeof check).

---

### Step 7: Update useSignaling

Open `web_ui/src/composables/useSignaling.ts`.

Replace with:

```typescript
import { ref, onUnmounted } from 'vue'
import { useRoomStore } from '@/stores/room'
import type { SignalingMessage, SignalingMessageType } from '@/types/signaling'
import type { SignalingTransport } from '@/types/transport'
import { createTransport, createWebSocketTransportSync } from '@/transports/factory'

interface UseSignalingOptions {
  roomId: string
  transport?: SignalingTransport
}

export function useSignaling(options: UseSignalingOptions) {
  const { roomId, transport: providedTransport } = options
  const store = useRoomStore()
  
  const connected = ref(false)
  const signalingOffline = ref(false)
  const reconnectExhausted = ref(false)
  
  let transport: SignalingTransport | null = providedTransport || null
  let p2pEstablished = false
  let userMessageHandler: ((msg: SignalingMessage) => void) | null = null
  
  async function initTransport() {
    if (providedTransport) {
      transport = providedTransport
    } else {
      transport = await createTransport({ roomId })
    }
    
    // Set up message routing
    transport.onMessage((msg: SignalingMessage) => {
      handleInternalMessage(msg)
      userMessageHandler?.(msg)
    })
    
    // Watch connected state
    if ('connected' in transport) {
      // Already a ref
    }
  }
  
  function handleInternalMessage(msg: SignalingMessage) {
    switch (msg.type) {
      case 'join-ack':
        store.setParticipantId((msg.payload as { participantId: string }).participantId)
        break
      case 'peer-joined':
        store.addParticipant((msg.payload as { participantId: string }).participantId)
        break
      case 'peer-left':
        store.removeParticipant((msg.payload as { participantId: string }).participantId)
        break
    }
  }
  
  async function connect() {
    if (!transport) {
      await initTransport()
    }
    transport?.connect()
    connected.value = true
  }
  
  function send(type: SignalingMessageType, to?: string, payload?: unknown) {
    const msg: SignalingMessage = { type, to, payload }
    transport?.send(msg)
  }
  
  function setP2PEstablished(value: boolean) {
    p2pEstablished = value
  }
  
  function setMessageHandler(handler: (msg: SignalingMessage) => void) {
    userMessageHandler = handler
  }
  
  function disconnect() {
    transport?.disconnect()
    transport = null
    connected.value = false
  }
  
  onUnmounted(disconnect)
  
  return {
    connected,
    signalingOffline,
    reconnectExhausted,
    connect,
    send,
    setP2PEstablished,
    setMessageHandler,
    disconnect
  }
}
```

✅ Success: useSignaling compiles, properly async.  
❌ If failed: Check all imports resolve, ensure proper typing.

---

### Step 8: Update Vite Config for Build Modes

Open `web_ui/vite.config.ts`.

Replace with:

```typescript
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isSingleFile = process.env.BUILD_MODE === 'single'
  const isServer = mode === 'server'
  
  const baseConfig: UserConfig = {
    plugins: [
      vue(),
      vueDevTools(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico'],
        manifest: {
          name: 'VideoChat',
          short_name: 'VideoChat',
          description: 'Lightweight ephemeral video calls',
          theme_color: '#1f2937',
          background_color: '#1f2937',
          display: 'standalone',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    build: {
      outDir: isServer ? '../server/dist' : 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: isSingleFile ? undefined : {
            'trystero': ['trystero']
          }
        }
      }
    },
    define: {
      __BUILD_MODE__: JSON.stringify(process.env.BUILD_MODE || 'default')
    }
  }
  
  // Add single-file plugin for P2P single-file build
  if (isSingleFile) {
    baseConfig.plugins!.push(viteSingleFile())
    baseConfig.build!.cssCodeSplit = false
    baseConfig.build!.assetsInlineLimit = 100000000
  }
  
  return baseConfig
})
```

✅ Success: vite.config.ts compiles, supports all modes.  
❌ If failed: Check import syntax, ensure viteSingleFile import correct.

---

### Step 9: Add NPM Scripts

Open `web_ui/package.json`.

Add to `scripts`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "run-p type-check \"build-only {@}\" --",
    "build:server": "BUILD_MODE=server vite build --mode server",
    "build:p2p": "BUILD_MODE=p2p vite build --mode p2p",
    "build:p2p:single": "BUILD_MODE=single vite build --mode p2p",
    "preview": "vite preview",
    "test:unit": "vitest",
    "test:e2e": "playwright test",
    "build-only": "vite build",
    "type-check": "vue-tsc --build",
    "lint": "run-s lint:*",
    "lint:oxlint": "oxlint . --fix",
    "lint:eslint": "eslint . --fix --cache",
    "format": "oxfmt src/"
  }
}
```

For Windows (cmd/PowerShell), add cross-env:

```bash
npm install --save-dev cross-env
```

Then use:

```json
{
  "scripts": {
    "build:server": "cross-env BUILD_MODE=server vite build --mode server",
    "build:p2p": "cross-env BUILD_MODE=p2p vite build --mode p2p",
    "build:p2p:single": "cross-env BUILD_MODE=single vite build --mode p2p"
  }
}
```

✅ Success: All scripts run without error.  
❌ If failed: Check cross-env installation, ensure proper escaping.

---

### Step 10: Update Exports

Create `web_ui/src/transports/index.ts`:

```typescript
export { createWebSocketTransport } from './WebSocketTransport'
export { createTrysteroTransport, type TrysteroTransportOptions } from './TrysteroTransport'
export { createTransport, createWebSocketTransportSync, type TransportMode } from './factory'
```

✅ Success: Clean barrel export.  
❌ If failed: Check all exports exist.

---

### Step 11: Update RoomView Usage

Open `web_ui/src/views/RoomView.vue`.

Find where `useSignaling` is called (around line 15-20).

Replace:

```typescript
// Old
const signaling = useSignaling(roomId)

// New
const signaling = useSignaling({ roomId })
```

Update any other components using `useSignaling`.

✅ Success: No TypeScript errors, props passed correctly.  
❌ If failed: Check all call sites updated.

---

## Verification

### Test Build: Server Mode

```bash
cd web_ui
npm run build:server
```

Expected:
- Output to `../server/dist/`
- WebSocket transport bundled
- No Trystero in output (tree-shaken)

### Test Build: P2P Mode

```bash
cd web_ui
npm run build:p2p
```

Expected:
- Output to `dist/`
- Separate files (p2p-config.json alongside)
- Trystero in vendor chunk

### Test Build: P2P Single File

```bash
cd web_ui
npm run build:p2p:single
```

Expected:
- Output to `dist/index.html` (single file)
- All assets inlined
- Config defaulted (no external fetch)

### Test Runtime: Server Mode

```bash
cd server
go run .
```

Open `https://localhost:8443`

Expected console:
```
[TransportFactory] Auto-detected: server-hosted mode
[WebSocketTransport] Connected
```

### Test Runtime: P2P Mode

Open `file://path/to/dist/index.html?room=test123`

Expected console:
```
[TransportFactory] Auto-detected: P2P mode
[P2PConfig] Loaded from external file (or default)
[Trystero] torrent: connected
[Trystero] nostr: connected
```

---

## Rollback

If critical failure:

```bash
# Revert package.json
git checkout -- web_ui/package.json

# Revert vite config
git checkout -- web_ui/vite.config.ts

# Remove new files
rm -f web_ui/src/transports/TrysteroTransport.ts
rm -f web_ui/src/transports/factory.ts
rm -f web_ui/src/transports/index.ts
rm -f web_ui/src/utils/p2p-config-loader.ts
rm -f web_ui/src/types/p2p-config.ts
rm -f public/p2p-config.json
rm -f public/p2p-config.schema.json

# Revert modified files
git checkout -- web_ui/src/composables/useSignaling.ts
git checkout -- web_ui/src/views/RoomView.vue

# Reinstall dependencies
rm -rf web_ui/node_modules
npm install
```

---

## Future Extensions (Not This PR)

- GunJS transport adapter (if Trystero's Gun isn't sufficient)
- QR code room sharing for P2P builds
- IPFS transport (needs more bootstrap config)
- WebTorrent file sharing integration
