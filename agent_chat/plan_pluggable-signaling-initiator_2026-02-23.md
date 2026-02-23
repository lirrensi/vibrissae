# Plan: Pluggable Signaling + Longest-Connected Initiator
_Fix dead-room bug when creator leaves; prepare for future alternative signaling transports._

---

# Checklist
- [x] Step 1: Define SignalingTransport interface
- [x] Step 2: Extract WebSocketTransport implementation
- [x] Step 3: Refactor useSignaling to accept transport
- [x] Step 4: Update server room.go with GetLongestConnectedParticipant
- [x] Step 5: Update server signaling.go to send initiatorId
- [x] Step 6: Update signaling types for new payload fields
- [x] Step 7: Update client store to track initiator status
- [x] Step 8: Update RoomView.vue to use initiatorId logic
- [x] Step 9: Fix server tests for new function signatures
- [x] Step 10: Update arch.md documentation

---

## Context

**Current state:**
- `isCreator` flag set once when first joining empty room
- If creator leaves, remaining peers have `isCreator=false` → no one initiates → dead room
- useSignaling.ts has WebSocket hardcoded, not pluggable

**Files involved:**
- `server/room.go` - room management, participant tracking
- `server/signaling.go` - WebSocket handler, message routing
- `web_ui/src/composables/useSignaling.ts` - signaling logic
- `web_ui/src/composables/useWebRTC.ts` - WebRTC connections
- `web_ui/src/views/RoomView.vue` - main room view
- `web_ui/src/stores/room.ts` - participant state
- `web_ui/src/types/signaling.ts` - TypeScript types
- `docs/arch.md` - architecture reference

**Room store already imported in useSignaling.** Participant struct already has `JoinedAt` field in server.

---

## Prerequisites

- Go 1.21+ installed
- Node.js 18+ installed
- Server runs with `go run .` from `server/` directory
- Frontend runs with `npm run dev` from `web_ui/` directory
- Both can start without errors before changes

---

## Scope Boundaries

**OUT OF SCOPE:**
- WebTorrent transport implementation (future work)
- Firebase transport implementation (future work)
- Any changes to TURN server logic
- Any changes to chat functionality
- Any changes to device selection
- E2E tests (update separately if needed)

**IN SCOPE:**
- Server unit test fixes for changed function signatures

---

## Steps

### Step 1: Define SignalingTransport interface

Create new file `web_ui/src/types/transport.ts`.

Write the following content:

```typescript
import type { Ref } from 'vue'
import type { SignalingMessage } from './signaling'

export interface SignalingTransport {
  connected: Ref<boolean>
  participantId: Ref<string | null>
  
  connect(): void
  disconnect(): void
  send(message: SignalingMessage): void
  onMessage(handler: (msg: SignalingMessage) => void): void
}
```

✅ Success: File `web_ui/src/types/transport.ts` exists with the interface above.
❌ If failed: Stop and report error. Do not proceed.

---

### Step 2: Extract WebSocketTransport implementation

Create new file `web_ui/src/transports/WebSocketTransport.ts`.

Write the following content:

```typescript
import { ref, onUnmounted } from 'vue'
import type { SignalingMessage } from '@/types/signaling'
import type { SignalingTransport } from '@/types/transport'

export function createWebSocketTransport(roomId: string): SignalingTransport {
  const ws = ref<WebSocket | null>(null)
  const connected = ref(false)
  const participantId = ref<string | null>(null)
  
  let messageHandler: ((msg: SignalingMessage) => void) | null = null
  
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsHost = window.__CONFIG__?.baseUrl 
    ? window.__CONFIG__.baseUrl.replace(/^https?:/, wsProtocol)
    : `${wsProtocol}//${window.location.host}`
  
  function connect() {
    const url = `${wsHost}/ws/${roomId}`
    ws.value = new WebSocket(url)
    
    ws.value.onopen = () => {
      connected.value = true
      console.log('[WebSocketTransport] Connected')
    }
    
    ws.value.onmessage = (event) => {
      const msg: SignalingMessage = JSON.parse(event.data)
      messageHandler?.(msg)
    }
    
    ws.value.onclose = () => {
      connected.value = false
      console.log('[WebSocketTransport] Disconnected')
    }
    
    ws.value.onerror = (err) => {
      console.error('[WebSocketTransport] Error:', err)
    }
  }
  
  function disconnect() {
    ws.value?.close()
    ws.value = null
    connected.value = false
  }
  
  function send(message: SignalingMessage) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocketTransport] Cannot send - not connected')
      return
    }
    ws.value.send(JSON.stringify(message))
  }
  
  function onMessage(handler: (msg: SignalingMessage) => void) {
    messageHandler = handler
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

✅ Success: File `web_ui/src/transports/WebSocketTransport.ts` exists with the implementation above.
❌ If failed: Stop and report error. Do not proceed.

---

### Step 3: Refactor useSignaling to accept transport

Open `web_ui/src/composables/useSignaling.ts`.

Replace the entire file content with:

```typescript
import { ref, onUnmounted } from 'vue'
import { useRoomStore } from '@/stores/room'
import type { SignalingMessage, SignalingMessageType } from '@/types/signaling'
import type { SignalingTransport } from '@/types/transport'
import { createWebSocketTransport } from '@/transports/WebSocketTransport'

export function useSignaling(roomId: string, transport?: SignalingTransport) {
  const store = useRoomStore()
  
  // Use provided transport or create default WebSocket transport
  const t = transport ?? createWebSocketTransport(roomId)
  
  const connected = t.connected
  const signalingOffline = ref(false)
  const reconnectExhausted = ref(false)
  
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 10
  const baseDelay = 1000
  let p2pEstablished = false
  let userMessageHandler: ((msg: SignalingMessage) => void) | null = null
  
  function setMessageHandler(handler: (msg: SignalingMessage) => void) {
    userMessageHandler = handler
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
  
  // Set up message routing
  t.onMessage((msg: SignalingMessage) => {
    handleInternalMessage(msg)
    userMessageHandler?.(msg)
  })
  
  function connect() {
    t.connect()
  }
  
  function send(type: SignalingMessageType, to?: string, payload?: unknown) {
    const msg: SignalingMessage = { type, to, payload }
    t.send(msg)
  }
  
  function setP2PEstablished(value: boolean) {
    p2pEstablished = value
  }
  
  function disconnect() {
    t.disconnect()
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

✅ Success: File `web_ui/src/composables/useSignaling.ts` compiles without errors. Function signature accepts optional `transport` parameter.
❌ If failed: Check TypeScript errors. Ensure `SignalingTransport` type is imported correctly.

---

### Step 4: Update server room.go with GetLongestConnectedParticipant

Open `server/room.go`.

After line 87 (after `ParticipantCount` function), add the following function:

```go
// GetLongestConnectedParticipant returns the participant who joined earliest
// (excluding the specified participant). Returns nil if no other participants exist.
func (r *Room) GetLongestConnectedParticipant(excludeID string) *Participant {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var oldest *Participant
	for id, p := range r.Participants {
		if id == excludeID {
			continue
		}
		if oldest == nil || p.JoinedAt.Before(oldest.JoinedAt) {
			oldest = p
		}
	}
	return oldest
}
```

✅ Success: Function `GetLongestConnectedParticipant` exists in `server/room.go`. Server compiles with `go build`.
❌ If failed: Check Go syntax. Ensure `Participant` and `JoinedAt` are defined.

---

### Step 5: Update server signaling.go to send initiatorId

Open `server/signaling.go`.

Find the `sendJoinAck` function (around line 157).

Replace the function body with:

```go
// sendJoinAck sends the join acknowledgment with participant ID, TURN credentials, and initiator info
func (h *SignalingHandler) sendJoinAck(conn *websocket.Conn, participantID, roomID string, creds TurnCredentials, isCreator bool) {
	// Get existing participants
	room := h.rooms.Get(roomID)
	var existingPeers []string
	var initiatorId string
	
	if room != nil {
		for _, p := range room.GetOtherParticipants(participantID) {
			existingPeers = append(existingPeers, p.ID)
		}
		
		// Determine who should initiate connections
		// If room was empty, this participant is the initiator (creator)
		// Otherwise, the longest-connected existing participant initiates
		if isCreator {
			initiatorId = participantID
		} else {
			longest := room.GetLongestConnectedParticipant(participantID)
			if longest != nil {
				initiatorId = longest.ID
			}
		}
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"participantId":   participantID,
		"roomId":          roomID,
		"turnCredentials": creds,
		"existingPeers":   existingPeers,
		"initiatorId":     initiatorId,
	})

	msg := SignalingMessage{
		Type:    MsgTypeJoinAck,
		Payload: payload,
	}
	h.sendMessage(conn, msg)
}
```

Now find the `broadcastPeerJoined` function (around line 183).

Replace with:

```go
// broadcastPeerJoined notifies all participants about a new peer and who should initiate
func (h *SignalingHandler) broadcastPeerJoined(room *Room, newParticipantID string) {
	// Find who should initiate connection to the new peer (longest connected)
	initiator := room.GetLongestConnectedParticipant(newParticipantID)
	initiatorId := ""
	if initiator != nil {
		initiatorId = initiator.ID
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"participantId": newParticipantID,
		"initiatorId":   initiatorId,
	})

	msg := SignalingMessage{
		Type:    MsgTypePeerJoined,
		Payload: payload,
	}

	data, _ := json.Marshal(msg)
	failed, _ := h.rooms.Broadcast(room.ID, newParticipantID, data)
	if len(failed) > 0 {
		h.rooms.RemoveFailedParticipants(room.ID, failed)
		log.Printf("Removed %d failed participants from room %s", len(failed), room.ID)
	}
}
```

✅ Success: Server compiles with `go build`. `join-ack` now includes `initiatorId`. `peer-joined` now includes `initiatorId`.
❌ If failed: Check Go syntax. Ensure `json.Marshal` imports are present.

---

### Step 6: Update signaling types for new payload fields

Open `web_ui/src/types/signaling.ts`.

Replace entire file content with:

```typescript
export type SignalingMessageType = 
  | 'join-ack' 
  | 'peer-joined' 
  | 'peer-left' 
  | 'offer' 
  | 'answer' 
  | 'ice-candidate' 
  | 'error'

export interface SignalingMessage {
  type: SignalingMessageType
  from?: string
  to?: string
  payload?: unknown
}

export interface JoinAckPayload {
  participantId: string
  roomId: string
  turnCredentials?: {
    username: string
    password: string
  }
  existingPeers: string[]
  initiatorId: string
}

export interface PeerJoinedPayload {
  participantId: string
  initiatorId: string
}

export interface PeerLeftPayload {
  participantId: string
}

export interface ErrorPayload {
  code: number
  message: string
}
```

✅ Success: File `web_ui/src/types/signaling.ts` has all interfaces defined.
❌ If failed: Check TypeScript syntax.

---

### Step 7: Update client store to track initiator status

Open `web_ui/src/stores/room.ts`.

Add a new ref after line 9 (after `localIceState`):

```typescript
const initiatorId = ref<string | null>(null)
```

Add a new function after `setLocalStream` function (around line 65):

```typescript
function setInitiatorId(id: string | null) {
  initiatorId.value = id
}
```

Update the return statement (around line 75) to include:

```typescript
return {
  roomId,
  participantId,
  participants,
  localStream,
  localIceState,
  initiatorId,        // add this
  participantCount,
  showWarning,
  hasConnectionFailure,
  setRoom,
  setParticipantId,
  addParticipant,
  removeParticipant,
  updateParticipantStream,
  updateParticipantIceState,
  setLocalIceState,
  setLocalStream,
  setInitiatorId,     // add this
  clear
}
```

Update the `clear` function to reset `initiatorId`:

```typescript
function clear() {
  roomId.value = null
  participantId.value = null
  participants.value.clear()
  localStream.value = null
  localIceState.value = null
  initiatorId.value = null  // add this
}
```

✅ Success: Store exports `initiatorId` ref and `setInitiatorId` function. TypeScript compiles.
❌ If failed: Check TypeScript errors.

---

### Step 8: Update RoomView.vue to use initiatorId logic

Open `web_ui/src/views/RoomView.vue`.

Find line 24 where `isRoomCreator` is defined:

```typescript
const isRoomCreator = ref(false) // Track if this peer is the room creator
```

Delete this line.

Find the `handleSignalingMessage` function (around line 33).

Replace the `join-ack` case with:

```typescript
case 'join-ack': {
  isLoading.value = false
  const payload = msg.payload as JoinAckPayload
  console.log('[RoomView] Join-ack with existing peers:', payload.existingPeers, 'initiatorId:', payload.initiatorId)
  
  // Store who the initiator is
  store.setInitiatorId(payload.initiatorId)
  
  // Add existing peers to store (so ontrack can find them)
  if (payload.existingPeers && payload.existingPeers.length > 0) {
    for (const peerId of payload.existingPeers) {
      console.log(`[RoomView] Adding existing peer to store: ${peerId}`)
      store.addParticipant(peerId)
      
      // Only initiate if WE are the initiator
      if (payload.initiatorId === store.participantId) {
        console.log(`[RoomView] We are initiator, connecting to existing peer: ${peerId}`)
        webrtc.initiateConnection(peerId)
      }
    }
  }
  break
}
```

Replace the `peer-joined` case with:

```typescript
case 'peer-joined': {
  const payload = msg.payload as PeerJoinedPayload
  store.addParticipant(payload.participantId)
  
  // Only initiate if WE are the initiator for this new peer
  if (payload.initiatorId === store.participantId) {
    console.log(`[RoomView] We are initiator, connecting to new peer: ${payload.participantId}`)
    webrtc.initiateConnection(payload.participantId)
  } else {
    console.log(`[RoomView] Waiting for offer from initiator: ${payload.initiatorId}`)
  }
  break
}
```

Add imports at the top (around line 13):

```typescript
import type { SignalingMessage, JoinAckPayload, PeerJoinedPayload } from '@/types/signaling'
```

Remove the old import line:

```typescript
import type { SignalingMessage } from '@/types/signaling'
```

✅ Success: `RoomView.vue` compiles. No reference to `isRoomCreator` remains.
❌ If failed: Check TypeScript errors. Ensure `JoinAckPayload` and `PeerJoinedPayload` are imported.

---

### Step 9: Fix server tests for new function signatures

Open `server/room_test.go`.

Find line 326 which reads:

```go
room := rm.AddParticipant("room-1", "participant-1", conn)
```

Change to:

```go
room, _ := rm.AddParticipant("room-1", "participant-1", conn)
```

Find line 351 which reads:

```go
rm.AddParticipant("new-room", "p1", conn)
```

Change to:

```go
_, _ = rm.AddParticipant("new-room", "p1", conn)
```

Search the entire file for any other `rm.AddParticipant` calls that capture only one return value. Change all to capture both values or ignore both.

Open `server/signaling_test.go`.

Find line 632 which reads:

```go
handler.sendJoinAck(conn, "new-participant", "test-room", creds)
```

Change to:

```go
handler.sendJoinAck(conn, "new-participant", "test-room", creds, true)
```

The 5th argument `true` indicates this participant is the creator (initiator).

✅ Success: `go test ./...` in server directory passes with 0 failures.
❌ If failed: Run `go test ./...` and fix any remaining signature mismatches.

---

### Step 10: Update arch.md documentation

Open `docs/arch.md`.

Find the "Signaling Protocol" section (around line 149).

Update the "WebSocket Message Format" to include new fields:

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

Add a new subsection after "Connection Lifecycle" (around line 189):

```markdown
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
```

✅ Success: Documentation reflects new initiator logic.
❌ If failed: Check markdown formatting.

---

## Verification

1. Run server tests: `cd server && go test ./...` — expected: PASS, 0 failures
2. Start server: `cd server && go run .`
3. Start frontend: `cd web_ui && npm run dev`
4. Open browser to room, check console for `[RoomView]` logs showing `initiatorId`
5. Open second tab to same room, verify only one peer initiates
6. Close first tab (initiator), open third tab, verify new initiator is assigned
7. Verify third tab connects successfully (dead-room bug fixed)

Expected console output in initiator tab:
```
[RoomView] We are initiator, connecting to existing peer: xxx
```

Expected console output in non-initiator tab:
```
[RoomView] Waiting for offer from initiator: xxx
```

---

## Rollback

If critical failure:

1. `git checkout -- server/room.go server/signaling.go server/room_test.go server/signaling_test.go`
2. `git checkout -- web_ui/src/composables/useSignaling.ts web_ui/src/views/RoomView.vue`
3. `git checkout -- web_ui/src/types/signaling.ts web_ui/src/stores/room.ts`
4. `rm -f web_ui/src/types/transport.ts web_ui/src/transports/WebSocketTransport.ts`
5. Run `go test ./...` in server directory to verify rollback
6. Restart server and frontend
