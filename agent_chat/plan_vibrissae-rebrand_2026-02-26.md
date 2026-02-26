# Implementation Plan: Vibrissae Rebrand & Layout

**Date:** 2026-02-26
**Status:** ✅ COMPLETED

---

## Checklist

- [x] Create log store (`web_ui/src/stores/log.ts`)
- [x] Create TechLog component (`web_ui/src/components/TechLog.vue`)
- [x] Update index.html title to "Vibrissae"
- [x] Modify Chat.vue - remove toggle, always visible
- [x] Update useChat.ts - remove isOpen and toggle
- [x] Update RoomView.vue - 80/20 layout, integrate TechLog and Chat
- [x] Add logging to useWebRTC.ts
- [x] Add logging to useSignaling.ts

---

## Summary

1. Rename app from "VideoChat" to "Vibrissae"
2. Restructure room view: 80/20 split (video left, tech log + chat right)
3. Add global TechLog component with central store for connection diagnostics
4. Make chat always visible (remove toggle behavior)

---

## Files to Create

| File | Purpose |
|------|---------|
| `web_ui/src/stores/log.ts` | Global Pinia store for tech log entries |
| `web_ui/src/components/TechLog.vue` | UI component displaying log entries |

---

## Files to Modify

| File | Changes |
|------|---------|
| `web_ui/index.html` | Title → "Vibrissae" |
| `web_ui/src/views/RoomView.vue` | New layout (80/20 split), integrate TechLog, always-show chat |
| `web_ui/src/components/Chat.vue` | Remove toggle button, remove isOpen prop, always visible |
| `web_ui/src/composables/useChat.ts` | Remove isOpen ref and toggle function |
| `web_ui/src/composables/useWebRTC.ts` | Add log calls for ICE states, relay connections, peer events |
| `web_ui/src/composables/useSignaling.ts` | Add log calls for WebSocket events |

---

## Implementation Steps

### Step 1: Create Log Store

**File:** `web_ui/src/stores/log.ts`

```typescript
import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface LogEntry {
  id: number
  timestamp: Date
  category: 'signaling' | 'webrtc' | 'ice' | 'datachannel' | 'system'
  level: 'info' | 'warn' | 'error'
  message: string
  data?: Record<string, unknown>
}

export const useLogStore = defineStore('log', () => {
  const entries = ref<LogEntry[]>([])
  let idCounter = 0

  function log(
    category: LogEntry['category'],
    level: LogEntry['level'],
    message: string,
    data?: Record<string, unknown>
  ) {
    entries.value.push({
      id: ++idCounter,
      timestamp: new Date(),
      category,
      level,
      message,
      data
    })
    // Keep last 200 entries
    if (entries.value.length > 200) {
      entries.value.shift()
    }
  }

  function info(category: LogEntry['category'], message: string, data?: Record<string, unknown>) {
    log(category, 'info', message, data)
  }

  function warn(category: LogEntry['category'], message: string, data?: Record<string, unknown>) {
    log(category, 'warn', message, data)
  }

  function error(category: LogEntry['category'], message: string, data?: Record<string, unknown>) {
    log(category, 'error', message, data)
  }

  function clear() {
    entries.value = []
  }

  return { entries, log, info, warn, error, clear }
})
```

---

### Step 2: Create TechLog Component

**File:** `web_ui/src/components/TechLog.vue`

- Scrollable container with fixed height (half of right panel)
- Color-coded entries by level (info=default, warn=yellow, error=red)
- Category badges
- Timestamps
- Collapsible data objects (optional)

---

### Step 3: Update RoomView Layout

**File:** `web_ui/src/views/RoomView.vue`

Change from:
```
┌──────────────────────────┐
│       VideoGrid          │
│       (full width)       │
│                          │
└──────────────────────────┘
```

To:
```
┌────────────────────┬──────────┐
│                    │ TechLog  │
│    VideoGrid       ├──────────┤
│      (80%)         │  Chat    │
│                    │  (20%)   │
└────────────────────┴──────────┘
```

**Template changes:**
- Wrap VideoGrid in 80% flex div
- Add right panel div (20% width, flex-col)
- TechLog on top (flex-1 or fixed ~40% of panel)
- Chat on bottom (flex-1 or ~60% of panel)
- Remove Chat toggle button logic

---

### Step 4: Modify Chat Component

**File:** `web_ui/src/components/Chat.vue`

- Remove `isOpen` prop
- Remove toggle button
- Remove positioning (now part of flex layout)
- Keep message list and input

---

### Step 5: Update useChat Composable

**File:** `web_ui/src/composables/useChat.ts`

- Remove `isOpen` ref
- Remove `toggle` function
- Export only `messages` and `send`

---

### Step 6: Add Logging to useWebRTC

**File:** `web_ui/src/composables/useWebRTC.ts`

Log these events:
- Peer connection created (initiator vs receiver)
- ICE connection state changes (checking, connected, disconnected, failed)
- ICE candidate type (host, srflx, relay) — log when relay is used
- DataChannel open/close
- Remote stream received

---

### Step 7: Add Logging to useSignaling

**File:** `web_ui/src/composables/useSignaling.ts`

Log these events:
- WebSocket connecting/connected/disconnected
- Join-ack received (with TURN credentials present)
- Reconnection attempts

---

### Step 8: Update App Title

**File:** `web_ui/index.html`

```html
<title>Vibrissae</title>
```

---

## Verification

1. Run dev server: `cd web_ui && npm run dev`
2. Open room, check:
   - Title shows "Vibrissae"
   - Layout is 80/20 split
   - TechLog shows on right top
   - Chat shows on right bottom (always visible)
   - Log entries appear when connecting, ICE states change, etc.

---

## Notes

- Log store is global singleton — any component/composable can import and use
- Chat no longer toggleable — simplify state
- Right panel should have min-width to prevent squishing
