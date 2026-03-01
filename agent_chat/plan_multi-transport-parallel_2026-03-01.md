# Implementation Plan: Multi-Transport Parallel Execution

## Goal
Enable running multiple P2P transports (Trystero, GunJS, future ones) in parallel, all merged into a single MessageTransport interface.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Factory (createTransport)                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  createMultiTransport([Trystero, GunJS, ...])        │  │
│  │           ↓                                            │  │
│  │  CombinedMessageTransport (merges all transports)    │  │
│  │           ↓                                            │  │
│  │  P2PSignalingProtocol (signaling logic)              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Steps

### Step 1: Create CombinedMessageTransport ✅
**File:** `web_ui/src/transports/CombinedTransport.ts`

```typescript
import { ref } from 'vue'
import type { Ref } from 'vue'
import type { MessageTransport, TransportMessage } from '@/types/transport'

export function createCombinedTransport(
  transports: MessageTransport[],
  config?: { onFirstConnect?: () => void }
): MessageTransport {
  // Merges multiple MessageTransports into one
  // - broadcast() sends to ALL transports
  // - sendTo() sends to ALL transports  
  // - onPeerJoin fires when ANY transport discovers peer
  // - onMessage fires when ANY transport receives message
  // - connected = true when FIRST transport connects
  // - disconnected = false only when ALL transports disconnected
}
```

### Step 2: Create GunJSTransport (stub for now) ✅
**File:** `web_ui/src/transports/GunJSTransport.ts`

```typescript
// Implements MessageTransport interface using GunJS
// For now: returns NotImplementedError or connects to Gun peers
// Full implementation can come later after we verify the architecture works
```

### Step 3: Update factory.ts to support multi-transport ✅
**File:** `web_ui/src/transports/factory.ts`

```typescript
// Update createTransport to:
// 1. Accept optional extra transports array
// 2. Create each transport via createTrysteroTransport, createGunJSTransport
// 3. Pass all to createCombinedTransport
// 4. Wrap with P2PSignalingProtocol
```

### Step 4: Update exports ✅
**File:** `web_ui/src/transports/index.ts`

```typescript
export { createCombinedTransport } from './CombinedTransport'
export { createGunJSTransport } from './GunJSTransport'
```

## Verification ✅

Run the app and verify:
1. ✅ No TypeScript errors
2. ✅ P2P mode still works (Trystero-only for now)
3. ✅ Can add GunJS without breaking existing functionality

## Checklist

- [x] Create CombinedMessageTransport (CombinedTransport.ts)
- [x] Create GunJSTransport stub (GunJSTransport.ts)
- [x] Update factory.ts to support multi-transport
- [x] Update exports in index.ts
- [x] TypeScript compilation passes

## Future: Adding 3rd+ Transport

Once this works, adding a 3rd transport is just:

```typescript
const transport = createTransport({
  roomId,
  mode: 'p2p',
  transports: ['trystero', 'gun', 'my-new-transport']  // just add name
})
```