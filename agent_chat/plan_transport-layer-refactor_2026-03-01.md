# Plan: Layered Transport Architecture Refactor
_Refactor the transport layer to separate MessageTransport (pure message passing) from P2PSignalingProtocol (signaling logic), enabling easy addition of new transports like GunJS._

---

# Checklist
- [x] Step 1: Add MessageTransport interface to types/transport.ts
- [x] Step 2: Add GunConfig to types/p2p-config.ts
- [x] Step 3: Create transports/P2PSignalingProtocol.ts
- [x] Step 4: Refactor TrysteroTransport.ts to implement MessageTransport
- [x] Step 5: Update transports/factory.ts to use layered architecture
- [x] Step 6: Verify the refactored code compiles and runs

---

# Context
The current codebase in `web_ui/src/` has tangled signaling logic in TrysteroTransport.ts:
- Lines 111-127: P2P handshake (hello exchange)
- Lines 230-292: handleHello() with initiator election
- Lines 339-353: Resend logic for offers
- Lines 166-184: Self-message filtering

This logic must be extracted so new transports (GunJS, custom relays) can reuse it.

**Real file paths:**
- `web_ui/src/types/transport.ts` — current SignalingTransport interface
- `web_ui/src/types/p2p-config.ts` — current P2P config types
- `web_ui/src/transports/TrysteroTransport.ts` — current Trystero implementation
- `web_ui/src/transports/factory.ts` — creates transports
- `web_ui/src/types/signaling.ts` — existing signaling message types

---

# Prerequisites
- Node.js 18+ and npm installed
- Working directory: `C:\Users\rx\001_Code\101_DevArea\VideoChat\web_ui`
- Run `npm install` to ensure dependencies are installed
- Project must have Trystero installed: `npm list trystero` should show version

---

# Scope Boundaries
- **OUT OF SCOPE:** Go server code in `server/` directory
- **OUT OF SCOPE:** Vue components in `src/components/`
- **OUT OF SCOPE:** useWebRTC.ts and useSignaling.ts logic (these will continue to work with the new interface)
- **OUT OF SCOPE:** Chat functionality (DataChannel handling)
- **DO NOT MODIFY:** The actual WebRTC signaling flow (offer/answer/ice-candidate types and handling)

---

# Steps

### Step 1: Add MessageTransport interface to types/transport.ts

Open `web_ui/src/types/transport.ts`. Append the following interfaces before the existing `SignalingTransport`:

```typescript
// ============================================================
// MessageTransport Interface - Pure message passing layer
// ============================================================

export interface TransportMessage {
  type: string
  payload?: unknown
  from?: string
  to?: string
}

export interface MessageTransport {
  connected: import('vue').Ref<boolean>
  selfId: string
  
  connect(): Promise<void>
  disconnect(): void
  broadcast(message: TransportMessage): void
  sendTo(peerId: string, message: TransportMessage): void
  
  onMessage(handler: (msg: TransportMessage, fromPeerId: string) => void): void
  onPeerJoin(handler: (peerId: string) => void): void
  onPeerLeave(handler: (peerId: string) => void): void
}
```

✅ Success: File now has both MessageTransport and SignalingTransport interfaces.

❌ If failed: Stop. Do not proceed. Report which line failed to parse.

---

### Step 2: Add GunConfig to types/p2p-config.ts

Open `web_ui/src/types/p2p-config.ts`. Add `gun` to the TransportType and add GunConfig interface:

```typescript
// Line 17: Change existing line FROM:
// export type TransportType = 'torrent' | 'nostr' | 'mqtt' | 'ipfs'
// TO:
export type TransportType = 'torrent' | 'nostr' | 'mqtt' | 'ipfs' | 'gun'

// Add after IPFSConfig interface (around line 37):
export interface GunConfig {
  enabled: boolean
  peers?: string[]  // Gun relay peers to connect to
}
```

Also add `gun?: GunConfig` to the transports object in P2PConfig interface.

✅ Success: TypeScript can parse `TransportType` includes `'gun'` and `GunConfig` type exists.

❌ If failed: Stop. Report TypeScript error.

---

### Step 3: Create transports/P2PSignalingProtocol.ts

Create new file `web_ui/src/transports/P2PSignalingProtocol.ts`:

```typescript
import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { MessageTransport, TransportMessage } from '@/types/transport'
import type { SignalingMessage, SignalingMessageType } from '@/types/signaling'
import { useLogStore } from '@/stores/log'
import { useRoomStore } from '@/stores/room'

interface P2PSignalingConfig {
  resendIntervalMs: number
  resendMaxAttempts: number
}

export interface SignalingTransport {
  connected: Ref<boolean>
  participantId: Ref<string | null>
  
  connect(): void
  disconnect(): void
  send(message: SignalingMessage): void
  onMessage(handler: (msg: SignalingMessage) => void): void
}

export function createP2PSignalingProtocol(
  transport: MessageTransport,
  config: P2PSignalingConfig
): SignalingTransport {
  const logStore = useLogStore()
  const roomStore = useRoomStore()
  
  const connected = ref(false)
  const participantId = ref<string | null>(null)
  const messageHandler = ref<((msg: SignalingMessage) => void) | null>(null)
  const pendingMessages = new Map<string, { msg: SignalingMessage; attempts: number }>()
  
  // Generate participant ID
  participantId.value = crypto.randomUUID()
  roomStore.setParticipantId(participantId.value)
  
  let resendTimer: ReturnType<typeof setInterval> | null = null
  
  // Map transport peer ID to our participant ID
  const peerIdMap = new Map<string, string>()
  
  function startResendTimer() {
    if (resendTimer) return
    resendTimer = setInterval(() => {
      pendingMessages.forEach((pending, key) => {
        pending.attempts++
        if (pending.attempts >= config.resendMaxAttempts) {
          pendingMessages.delete(key)
          return
        }
        // Resend via transport
        const transportMsg: TransportMessage = {
          type: pending.msg.type,
          payload: pending.msg.payload,
          from: participantId.value!,
          to: pending.msg.to
        }
        transport.sendTo(pending.msg.to!, transportMsg)
      })
    }, config.resendIntervalMs)
  }
  
  function handleHello(transportPeerId: string, msg: TransportMessage) {
    const payload = msg.payload as { participantId: string }
    const theirParticipantId = payload.participantId
    
    // Ignore hello from self
    if (theirParticipantId === participantId.value) {
      return
    }
    
    logStore.info('signaling', `Received hello from peer`, {
      transportPeer: transportPeerId.slice(0, 8),
      participantId: theirParticipantId.slice(0, 8)
    })
    
    // Map transport peer to participant
    peerIdMap.set(transportPeerId, theirParticipantId)
    
    // Determine initiator: smaller UUID initiates
    const myId = participantId.value!
    const iAmInitiator = myId < theirParticipantId
    const initiatorId = iAmInitiator ? myId : theirParticipantId
    
    logStore.info('signaling', `Initiator election`, {
      myId: myId.slice(0, 8),
      theirId: theirParticipantId.slice(0, 8),
      iAmInitiator,
      initiatorId: initiatorId.slice(0, 8)
    })
    
    // Emit peer-joined to app layer
    const joinedMsg: SignalingMessage = {
      type: 'peer-joined',
      from: theirParticipantId,
      payload: {
        participantId: theirParticipantId,
        initiatorId
      }
    }
    messageHandler.value?.(joinedMsg)
  }
  
  function handleMessage(transportMsg: TransportMessage, transportPeerId: string) {
    const msg = transportMsg as unknown as SignalingMessage
    
    // Filter self-messages
    const payloadData = msg.payload as Record<string, unknown> | undefined
    const msgParticipantId = payloadData?.participantId as string | undefined
    const isFromSelf = msgParticipantId === participantId.value || msg.from === participantId.value
    if (isFromSelf) {
      return
    }
    
    // Handle hello handshake
    if (msg.type === 'hello') {
      handleHello(transportPeerId, transportMsg)
      return
    }
    
    // Route to correct recipient based on 'to' field
    if (msg.to && msg.to !== participantId.value) {
      return
    }
    
    // Look up participant ID from transport peer
    const fromParticipantId = peerIdMap.get(transportPeerId) || msg.from
    
    const enriched: SignalingMessage = {
      ...msg,
      from: fromParticipantId
    }
    
    messageHandler.value?.(enriched)
  }
  
  function connect() {
    // Set up transport event handlers
    transport.onMessage(handleMessage)
    transport.onPeerJoin((transportPeerId) => {
      logStore.info('signaling', `Peer discovered`, { transportPeerId: transportPeerId.slice(0, 8) })
      // Send hello to exchange participant IDs
      const helloMsg: TransportMessage = {
        type: 'hello',
        payload: { participantId: participantId.value },
        from: participantId.value!
      }
      transport.broadcast(helloMsg)
    })
    transport.onPeerLeave((transportPeerId) => {
      const participantId = peerIdMap.get(transportPeerId)
      if (participantId) {
        const leaveMsg: SignalingMessage = {
          type: 'peer-left',
          from: participantId,
          payload: { participantId }
        }
        messageHandler.value?.(leaveMsg)
        peerIdMap.delete(transportPeerId)
      }
    })
    
    // Connect to transport
    transport.connect().then(() => {
      connected.value = true
      startResendTimer()
    })
  }
  
  function disconnect() {
    if (resendTimer) {
      clearInterval(resendTimer)
      resendTimer = null
    }
    transport.disconnect()
    peerIdMap.clear()
    pendingMessages.clear()
    connected.value = false
  }
  
  function send(message: SignalingMessage) {
    const enriched: SignalingMessage = {
      ...message,
      from: participantId.value!
    }
    
    logStore.info('signaling', `Sending ${message.type}`, {
      to: message.to?.slice(0, 8)
    })
    
    // Broadcast or send to specific peer
    if (message.to) {
      transport.sendTo(message.to, {
        type: message.type,
        payload: message.payload,
        from: participantId.value!,
        to: message.to
      })
    } else {
      transport.broadcast({
        type: message.type,
        payload: message.payload,
        from: participantId.value!
      })
    }
    
    // Track for resend (offers only)
    if (message.type === 'offer') {
      const key = `${message.to}-${message.type}`
      pendingMessages.set(key, { msg: enriched, attempts: 0 })
    }
  }
  
  function onMessage(handler: (msg: SignalingMessage) => void) {
    messageHandler.value = handler
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
```

✅ Success: File created at `web_ui/src/transports/P2PSignalingProtocol.ts`, TypeScript parses without errors.

❌ If failed: Stop. Report the TypeScript error and line number.

---

### Step 4: Refactor TrysteroTransport.ts to implement MessageTransport

Open `web_ui/src/transports/TrysteroTransport.ts`. Delete the entire file content and replace with this MessageTransport implementation:

```typescript
import { ref, onUnmounted } from 'vue'
import { joinRoom, type Room, type ActionSender, type BaseRoomConfig, type RelayConfig, type TurnConfig } from 'trystero'
import { useLogStore } from '@/stores/log'
import type { TransportMessage, MessageTransport } from '@/types/transport'
import type { P2PConfig, TransportType } from '@/types/p2p-config'

type SignalPayload = Record<string, string | number | boolean | null>

export interface TrysteroTransportOptions {
  roomId: string
  config: P2PConfig
  onConnect?: () => void
  onDisconnect?: () => void
}

interface TransportEntry {
  room: Room
  send: ActionSender<SignalPayload>
}

export function createTrysteroTransport(options: TrysteroTransportOptions): MessageTransport {
  const { roomId, config, onConnect, onDisconnect } = options
  const logStore = useLogStore()
  
  const connected = ref(false)
  const selfId = ref<string>(crypto.randomUUID())
  
  const activeTransports = new Map<TransportType, TransportEntry>()
  const onMessageHandler = ref<((msg: TransportMessage, fromPeerId: string) => void) | null>(null)
  const onPeerJoinHandler = ref<((peerId: string) => void) | null>(null)
  const onPeerLeaveHandler = ref<((peerId: string) => void) | null>(null)
  
  function buildRoomConfig(type: TransportType): BaseRoomConfig & RelayConfig & TurnConfig | null {
    const base: BaseRoomConfig = { appId: 'vibrissae-p2p' }
    
    switch (type) {
      case 'torrent':
        const tc = config.transports.torrent
        if (!tc?.enabled) return null
        return { ...base, rtcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } }
      case 'nostr':
        const nc = config.transports.nostr
        if (!nc?.enabled) return null
        return { ...base, relayUrls: nc.relays ?? [] }
      case 'mqtt':
        const mc = config.transports.mqtt
        if (!mc?.enabled) return null
        return { ...base, relayUrls: mc.url ? [mc.url] : ['wss://public.mqtthq.com', 'wss://broker.hivemq.com', 'wss://mqtt.eclipseprojects.io'] }
      case 'ipfs':
        const ic = config.transports.ipfs
        if (!ic?.enabled) return null
        return { ...base, ...(ic.bootstrap ? { bootstrap: ic.bootstrap } : {}) }
      default:
        return null
    }
  }
  
  async function connectTransport(type: TransportType): Promise<boolean> {
    try {
      const roomConfig = buildRoomConfig(type)
      if (!roomConfig) return false
      
      const room = joinRoom(roomConfig as BaseRoomConfig & RelayConfig & TurnConfig, roomId)
      
      // Handle peer join
      room.onPeerJoin((trysteroPeerId: string) => {
        logStore.info('transport', `Peer joined via ${type}`, { trysteroPeerId: trysteroPeerId.slice(0, 8) })
        onPeerJoinHandler.value?.(trysteroPeerId)
      })
      
      // Handle peer leave
      room.onPeerLeave((trysteroPeerId: string) => {
        logStore.info('transport', `Peer left via ${type}`, { trysteroPeerId: trysteroPeerId.slice(0, 8) })
        onPeerLeaveHandler.value?.(trysteroPeerId)
      })
      
      // Subscribe to messages
      const [send, receive] = room.makeAction<SignalPayload>('signal')
      
      receive((data, trysteroPeerId: string) => {
        if (!data || typeof data !== 'object') return
        const msg = data as unknown as TransportMessage
        onMessageHandler.value?.(msg, trysteroPeerId)
      })
      
      activeTransports.set(type, { room, send })
      
      if (!connected.value) {
        connected.value = true
        logStore.info('transport', `Trystero connected: ${type}`)
        onConnect?.()
      }
      
      return true
    } catch (err) {
      logStore.error('transport', `Trystero transport ${type} failed: ${err}`)
      return false
    }
  }
  
  async function connect(): Promise<void> {
    logStore.info('transport', 'Connecting Trystero transports...', { transports: config.transports.priority })
    
    const promises = config.transports.priority.map(async (type) => {
      if (isTransportEnabled(type, config)) {
        await connectTransport(type)
      }
    })
    
    await Promise.all(promises)
  }
  
  function disconnect() {
    activeTransports.forEach(({ room }) => room.leave())
    activeTransports.clear()
    connected.value = false
    onDisconnect?.()
  }
  
  function broadcast(message: TransportMessage) {
    const payload = message as unknown as SignalPayload
    activeTransports.forEach(({ send }, type) => {
      try {
        send(payload)
      } catch (err) {
        logStore.error('transport', `Broadcast failed (${type}): ${err}`)
      }
    })
  }
  
  function sendTo(peerId: string, message: TransportMessage) {
    const payload = message as unknown as SignalPayload
    activeTransports.forEach(({ send }, type) => {
      try {
        send(payload, peerId)
      } catch (err) {
        logStore.error('transport', `Send to ${peerId.slice(0, 8)} failed (${type}): ${err}`)
      }
    })
  }
  
  function onMessage(handler: (msg: TransportMessage, fromPeerId: string) => void) {
    onMessageHandler.value = handler
  }
  
  function onPeerJoin(handler: (peerId: string) => void) {
    onPeerJoinHandler.value = handler
  }
  
  function onPeerLeave(handler: (peerId: string) => void) {
    onPeerLeaveHandler.value = handler
  }
  
  onUnmounted(disconnect)
  
  return {
    connected,
    selfId: selfId.value,
    connect,
    disconnect,
    broadcast,
    sendTo,
    onMessage,
    onPeerJoin,
    onPeerLeave
  }
}

function isTransportEnabled(type: TransportType, config: P2PConfig): boolean {
  switch (type) {
    case 'torrent': return config.transports.torrent?.enabled ?? false
    case 'nostr': return config.transports.nostr?.enabled ?? false
    case 'mqtt': return config.transports.mqtt?.enabled ?? false
    case 'ipfs': return config.transports.ipfs?.enabled ?? false
    default: return false
  }
}
```

✅ Success: File rewritten, TypeScript parses without errors, all imports resolve.

❌ If failed: Stop. Report TypeScript error.

---

### Step 5: Update transports/factory.ts to use layered architecture

Open `web_ui/src/transports/factory.ts`. Replace the entire file content:

```typescript
import { useLogStore } from '@/stores/log'
import type { SignalingTransport } from '@/types/transport'
import { createWebSocketTransport } from './WebSocketTransport'
import { createTrysteroTransport } from './TrysteroTransport'
import { createP2PSignalingProtocol } from './P2PSignalingProtocol'
import { loadP2PConfig } from '@/utils/p2p-config-loader'

export type TransportMode = 'auto' | 'websocket' | 'p2p'

interface CreateTransportOptions {
  roomId: string
  mode?: TransportMode
}

export async function createTransport(options: CreateTransportOptions): Promise<SignalingTransport> {
  const { roomId, mode = 'auto' } = options
  const logStore = useLogStore()
  const effectiveMode = determineMode(mode)
  
  logStore.info('signaling', `Transport mode: ${effectiveMode}`)
  
  switch (effectiveMode) {
    case 'websocket':
      return createWebSocketTransport(roomId)
    
    case 'p2p': {
      const config = await loadP2PConfig()
      const messageTransport = createTrysteroTransport({ roomId, config })
      return createP2PSignalingProtocol(messageTransport, {
        resendIntervalMs: config.signaling.resendIntervalMs,
        resendMaxAttempts: config.signaling.resendMaxAttempts
      })
    }
    
    default:
      throw new Error(`Unknown transport mode: ${effectiveMode}`)
  }
}

function determineMode(requestedMode: TransportMode): 'websocket' | 'p2p' {
  if (requestedMode === 'websocket') return 'websocket'
  if (requestedMode === 'p2p') return 'p2p'
  
  // Auto-detect based on server-injected config
  if (typeof window !== 'undefined' && (window as unknown as { __CONFIG__?: unknown }).__CONFIG__) {
    console.log('[TransportFactory] Auto-detected: server-hosted mode')
    return 'websocket'
  }
  
  console.log('[TransportFactory] Auto-detected: P2P mode')
  return 'p2p'
}

export function createWebSocketTransportSync(roomId: string): SignalingTransport {
  return createWebSocketTransport(roomId)
}
```

Also update `transports/index.ts` to export the new P2PSignalingProtocol types:

```typescript
export { createWebSocketTransport } from './WebSocketTransport'
export { createTrysteroTransport, type TrysteroTransportOptions } from './TrysteroTransport'
export { createP2PSignalingProtocol, type SignalingTransport as P2PSignalingTransport } from './P2PSignalingProtocol'
export { createTransport, createWebSocketTransportSync, type TransportMode } from './factory'
```

✅ Success: Both files updated, TypeScript parses without errors.

❌ If failed: Stop. Report TypeScript error.

---

### Step 6: Verify the refactored code compiles and runs

Run the TypeScript compiler to check for errors:

```bash
cd web_ui && npx tsc --noEmit
```

✅ Success: No TypeScript errors. Output shows `Found 0 errors`.

❌ If failed: Stop. Report the first error from tsc output. Do not proceed to next step.

Then run the dev server to verify runtime:

```bash
cd web_ui && npm run dev
```

✅ Success: Dev server starts without runtime errors. Open http://localhost:5173 in browser.

❌ If failed: Stop. Report console errors from browser DevTools.

---

# Verification

To verify the entire refactor succeeded:

1. **TypeScript compiles without errors**: `npx tsc --noEmit` returns 0 errors
2. **Dev server runs**: `npm run dev` starts without errors
3. **P2P mode works**: 
   - Generate a room link
   - Open in two browser windows
   - Peers should discover each other via Trystero
   - Hello exchange should happen
   - WebRTC connection should establish

Expected log output in browser console:
- `[signaling] Transport mode: p2p`
- `[transport] Connecting Trystero transports...`
- `[transport] Trystero connected: nostr` (or torrent)
- `[transport] Peer joined via nostr`
- `[signaling] Received hello from peer`
- `[signaling] Initiator election`
- `[signaling] Peer joined`

---

# Rollback

If critical failure occurs and cannot be recovered:

1. Restore TrysteroTransport.ts from git:
   ```bash
   git checkout HEAD -- web_ui/src/transports/TrysteroTransport.ts
   ```

2. Restore factory.ts from git:
   ```bash
   git checkout HEAD -- web_ui/src/transports/factory.ts
   ```

3. Run TypeScript check to verify restored code compiles:
   ```bash
   cd web_ui && npx tsc --noEmit
   ```

4. Report the failure with the original error.
