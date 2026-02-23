# Implementation Plan: Vue Web App

**Target:** `web_ui/` directory
**Date:** 2026-02-23

---

## Overview

Build the Vue 3 frontend for VideoChat: video call UI with WebRTC, signaling, chat, and PWA support.

**Final state:** Vue app that:
1. Generates/joins rooms via URL
2. Captures and displays video/audio streams
3. Connects to signaling server via WebSocket
4. Establishes P2P WebRTC connections
5. Provides text chat via DataChannel
6. Installable as PWA

---

## Current Template State

```
web_ui/
├── src/
│   ├── main.ts          # ✓ Entry point, Pinia setup
│   ├── App.vue          # ✓ Placeholder
│   └── stores/
│       └── counter.ts   # ✗ Remove (example)
├── index.html           # ✓ Basic HTML
├── vite.config.ts       # ✓ Vite + Vue plugin
├── package.json         # ✓ Vue, Pinia, Vitest, Playwright
└── ...
```

**Already have:**
- Vue 3.5
- Pinia 3.0
- Vite 7.3
- TypeScript
- Vitest + Playwright

**Need to add:**
- `vue-router` — SPA routing
- `vite-plugin-pwa` — Service worker, installability

**No Tailwind npm** — Using CDN directly in index.html

---

## File Structure (Final)

```
web_ui/
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── router/
│   │   └── index.ts
│   ├── views/
│   │   ├── HomeView.vue       # Landing, generate link
│   │   └── RoomView.vue       # Video call view
│   ├── components/
│   │   ├── VideoGrid.vue      # Participant video layout
│   │   ├── VideoTile.vue      # Single participant video
│   │   ├── Controls.vue       # Mic/cam/disconnect
│   │   ├── DeviceSelect.vue   # Camera/mic picker dropdown
│   │   ├── Chat.vue           # DataChannel text chat
│   │   └── ConnectionStatus.vue # Signaling/P2P status
│   ├── composables/
│   │   ├── useWebRTC.ts       # RTCPeerConnection management
│   │   ├── useSignaling.ts    # WebSocket signaling
│   │   ├── useDevices.ts      # Media device enumeration
│   │   └── useChat.ts         # DataChannel chat
│   ├── stores/
│   │   └── room.ts            # Room state (participants, etc)
│   ├── types/
│   │   ├── signaling.ts       # WebSocket message types
│   │   ├── webrtc.ts          # WebRTC-related types
│   │   └── config.ts          # Window.__CONFIG__ type
│   └── utils/
│       └── uuid.ts            # UUID generation
├── public/
│   └── favicon.ico
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

---

## Dependencies to Add

```bash
pnpm add vue-router
pnpm add -D vite-plugin-pwa
```

---

## Implementation Steps

### Step 1: Install Dependencies

```bash
cd web_ui
pnpm add vue-router
pnpm add -D vite-plugin-pwa
```

---

### Step 2: Update index.html

**File:** `web_ui/index.html`

Add Tailwind CDN and config placeholder:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <link rel="icon" href="/favicon.ico">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#1f2937">
    <title>VideoChat</title>
    
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              primary: '#3b82f6',
              dark: '#1f2937'
            }
          }
        }
      }
    </script>
    
    <!-- Config placeholder for Go server injection -->
    <script>window.__CONFIG__=null;</script>
  </head>
  <body class="bg-gray-900 text-white min-h-screen">
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

---

### Step 3: Types

**File:** `web_ui/src/types/config.ts`

```typescript
export interface AppConfig {
  baseUrl: string
  turn?: {
    enabled: boolean
    port: number
  }
  turnCredentials?: {
    username: string
    password: string
  }
  turnServers?: TurnServer[]
  stunServers?: string[]
}

export interface TurnServer {
  urls: string
  username?: string
  credential?: string
}

declare global {
  interface Window {
    __CONFIG__: AppConfig | null
  }
}
```

**File:** `web_ui/src/types/signaling.ts`

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
  turnCredentials?: {
    username: string
    password: string
  }
}

export interface ErrorPayload {
  code: number
  message: string
}
```

**File:** `web_ui/src/types/webrtc.ts`

```typescript
export interface Participant {
  id: string
  stream?: MediaStream
  videoEnabled: boolean
  audioEnabled: boolean
}

export interface MediaDevices {
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  selectedCamera: string | null
  selectedMicrophone: string | null
}
```

---

### Step 4: Utils

**File:** `web_ui/src/utils/uuid.ts`

```typescript
export function generateUUID(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '')
  }
  
  // Fallback for older browsers
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () => {
    const r = Math.random() * 16 | 0
    return r.toString(16)
  })
}
```

---

### Step 5: Router Setup

**File:** `web_ui/src/router/index.ts`

```typescript
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/room/:id',
      name: 'room',
      component: () => import('@/views/RoomView.vue')
    }
  ]
})

export default router
```

---

### Step 6: Update main.ts

**File:** `web_ui/src/main.ts`

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
```

---

### Step 7: App.vue

**File:** `web_ui/src/App.vue`

```vue
<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>

<style>
/* Global styles handled by Tailwind CDN */
</style>
```

---

### Step 8: Room Store (Pinia)

**File:** `web_ui/src/stores/room.ts`

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Participant } from '@/types/webrtc'

export const useRoomStore = defineStore('room', () => {
  const roomId = ref<string | null>(null)
  const participantId = ref<string | null>(null)
  const participants = ref<Map<string, Participant>>(new Map())
  const localStream = ref<MediaStream | null>(null)
  
  const participantCount = computed(() => participants.value.size + 1)
  const showWarning = computed(() => participantCount.value >= 4)
  
  function setRoom(id: string) {
    roomId.value = id
  }
  
  function setParticipantId(id: string) {
    participantId.value = id
  }
  
  function addParticipant(id: string) {
    participants.value.set(id, {
      id,
      stream: undefined,
      videoEnabled: false,
      audioEnabled: false
    })
  }
  
  function removeParticipant(id: string) {
    participants.value.delete(id)
  }
  
  function updateParticipantStream(id: string, stream: MediaStream) {
    const p = participants.value.get(id)
    if (p) {
      p.stream = stream
    }
  }
  
  function setLocalStream(stream: MediaStream) {
    localStream.value = stream
  }
  
  function clear() {
    roomId.value = null
    participantId.value = null
    participants.value.clear()
    localStream.value = null
  }
  
  return {
    roomId,
    participantId,
    participants,
    localStream,
    participantCount,
    showWarning,
    setRoom,
    setParticipantId,
    addParticipant,
    removeParticipant,
    updateParticipantStream,
    setLocalStream,
    clear
  }
})
```

---

### Step 9: useSignaling Composable

**File:** `web_ui/src/composables/useSignaling.ts`

```typescript
import { ref, onUnmounted } from 'vue'
import { useRoomStore } from '@/stores/room'
import type { SignalingMessage } from '@/types/signaling'

export function useSignaling(roomId: string) {
  const store = useRoomStore()
  const ws = ref<WebSocket | null>(null)
  const connected = ref(false)
  const signalingOffline = ref(false)
  
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 10
  const baseDelay = 1000
  let p2pEstablished = false
  
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsHost = window.__CONFIG__?.baseUrl 
    ? window.__CONFIG__.baseUrl.replace(/^https?:/, wsProtocol)
    : `${wsProtocol}//${window.location.host}`
  
  function connect() {
    const url = `${wsHost}/ws/${roomId}`
    ws.value = new WebSocket(url)
    
    ws.value.onopen = () => {
      connected.value = true
      reconnectAttempts.value = 0
      signalingOffline.value = false
      console.log('WebSocket connected')
    }
    
    ws.value.onmessage = (event) => {
      const msg: SignalingMessage = JSON.parse(event.data)
      handleMessage(msg)
    }
    
    ws.value.onclose = handleDisconnect
    ws.value.onerror = (err) => {
      console.error('WebSocket error:', err)
    }
  }
  
  function handleDisconnect() {
    connected.value = false
    
    if (p2pEstablished) {
      // Don't reconnect, just show indicator
      signalingOffline.value = true
      return
    }
    
    if (reconnectAttempts.value < maxReconnectAttempts) {
      const delay = baseDelay * Math.pow(2, reconnectAttempts.value)
      setTimeout(connect, delay)
      reconnectAttempts.value++
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.value})`)
    }
  }
  
  function handleMessage(msg: SignalingMessage) {
    switch (msg.type) {
      case 'join-ack':
        store.setParticipantId((msg.payload as { participantId: string }).participantId)
        break
      case 'peer-joined':
        store.addParticipant(msg.from!)
        break
      case 'peer-left':
        store.removeParticipant(msg.from!)
        break
      // offer, answer, ice-candidate handled by useWebRTC
    }
  }
  
  function send(type: string, to?: string, payload?: unknown) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return
    
    const msg: SignalingMessage = { type, to, payload }
    ws.value.send(JSON.stringify(msg))
  }
  
  function setP2PEstablished(value: boolean) {
    p2pEstablished = value
  }
  
  function onMessage(callback: (msg: SignalingMessage) => void) {
    const originalHandler = ws.value?.onmessage
    ws.value!.onmessage = (event) => {
      const msg: SignalingMessage = JSON.parse(event.data)
      handleMessage(msg)
      callback(msg)
    }
  }
  
  function disconnect() {
    ws.value?.close()
    ws.value = null
  }
  
  onUnmounted(disconnect)
  
  return {
    ws,
    connected,
    signalingOffline,
    connect,
    send,
    setP2PEstablished,
    onMessage,
    disconnect
  }
}
```

---

### Step 10: useDevices Composable

**File:** `web_ui/src/composables/useDevices.ts`

```typescript
import { ref, onMounted } from 'vue'

export function useDevices() {
  const cameras = ref<MediaDeviceInfo[]>([])
  const microphones = ref<MediaDeviceInfo[]>([])
  const selectedCamera = ref<string | null>(null)
  const selectedMicrophone = ref<string | null>(null)
  
  async function enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      cameras.value = devices.filter(d => d.kind === 'videoinput')
      microphones.value = devices.filter(d => d.kind === 'audioinput')
    } catch (err) {
      console.error('Failed to enumerate devices:', err)
    }
  }
  
  async function getInitialDevices() {
    await enumerateDevices()
    if (cameras.value.length > 0 && !selectedCamera.value) {
      selectedCamera.value = cameras.value[0].deviceId
    }
    if (microphones.value.length > 0 && !selectedMicrophone.value) {
      selectedMicrophone.value = microphones.value[0].deviceId
    }
  }
  
  function setCamera(deviceId: string) {
    selectedCamera.value = deviceId
  }
  
  function setMicrophone(deviceId: string) {
    selectedMicrophone.value = deviceId
  }
  
  onMounted(getInitialDevices)
  
  return {
    cameras,
    microphones,
    selectedCamera,
    selectedMicrophone,
    enumerateDevices,
    getInitialDevices,
    setCamera,
    setMicrophone
  }
}
```

---

### Step 11: useWebRTC Composable

**File:** `web_ui/src/composables/useWebRTC.ts`

This is the core WebRTC logic. Key responsibilities:
- Create/manage RTCPeerConnections for each peer
- Handle local media stream
- Process signaling messages (offer/answer/ICE)
- Manage DataChannels for chat
- ICE restart on connection issues

```typescript
import { ref, computed, onUnmounted } from 'vue'
import { useRoomStore } from '@/stores/room'
import type { SignalingMessage } from '@/types/signaling'
import type { useSignaling } from './useSignaling'

export function useWebRTC(
  roomId: string, 
  signaling: ReturnType<typeof useSignaling>
) {
  const store = useRoomStore()
  const peerConnections = ref<Map<string, RTCPeerConnection>>(new Map())
  const dataChannels = ref<Map<string, RTCDataChannel>>(new Map())
  const isMuted = ref(false)
  const isVideoOff = ref(false)
  
  // ICE servers configuration
  const rtcConfig = computed<RTCConfiguration>(() => {
    const config: RTCConfiguration = { iceServers: [] }
    const appConfig = window.__CONFIG__
    
    if (!appConfig) return config
    
    // External TURN servers (priority)
    if (appConfig.turnServers) {
      config.iceServers!.push(...appConfig.turnServers.map(t => ({
        urls: t.urls,
        username: t.username,
        credential: t.credential
      })))
    }
    
    // Built-in TURN
    if (appConfig.turn?.enabled && appConfig.turnCredentials) {
      config.iceServers!.push({
        urls: `turn:${appConfig.baseUrl.replace(/^https?:\/\//, '')}:${appConfig.turn.port}`,
        username: appConfig.turnCredentials.username,
        credential: appConfig.turnCredentials.password
      })
    }
    
    // STUN servers (fallback)
    if (appConfig.stunServers) {
      config.iceServers!.push(
        ...appConfig.stunServers.map(url => ({ urls: url }))
      )
    }
    
    return config
  })
  
  async function startLocalStream(videoDeviceId?: string, audioDeviceId?: string) {
    try {
      const constraints: MediaStreamConstraints = {
        video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      store.setLocalStream(stream)
      return stream
    } catch (err) {
      console.error('Failed to get media stream:', err)
      throw err
    }
  }
  
  function stopLocalStream() {
    store.localStream?.getTracks().forEach(t => t.stop())
    store.setLocalStream(null)
  }
  
  function createPeerConnection(participantId: string, isInitiator: boolean): RTCPeerConnection {
    const pc = new RTCPeerConnection(rtcConfig.value)
    
    // Add local tracks
    store.localStream?.getTracks().forEach(track => {
      pc.addTrack(track, store.localStream!)
    })
    
    // Handle remote stream
    pc.ontrack = (event) => {
      const stream = event.streams[0]
      store.updateParticipantStream(participantId, stream)
      
      // Check audio/video enabled
      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]
      const p = store.participants.get(participantId)
      if (p) {
        p.videoEnabled = videoTrack?.enabled ?? false
        p.audioEnabled = audioTrack?.enabled ?? false
      }
    }
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.send('ice-candidate', participantId, event.candidate.toJSON())
      }
    }
    
    // Handle ICE restart
    pc.oniceconnectionstatechange = () => {
      if (['disconnected', 'failed'].includes(pc.iceConnectionState)) {
        restartIce(participantId)
      }
    }
    
    // Create data channel (initiator)
    if (isInitiator) {
      const channel = pc.createDataChannel('chat')
      setupDataChannel(participantId, channel)
    }
    
    // Receive data channel (non-initiator)
    pc.ondatachannel = (event) => {
      if (event.channel.label === 'chat') {
        setupDataChannel(participantId, event.channel)
      }
    }
    
    peerConnections.value.set(participantId, pc)
    return pc
  }
  
  function setupDataChannel(participantId: string, channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log(`Chat channel open with ${participantId}`)
    }
    channel.onmessage = (event) => {
      // Emit event for chat component
      window.dispatchEvent(new CustomEvent('chat-message', {
        detail: { from: participantId, ...JSON.parse(event.data) }
      }))
    }
    dataChannels.value.set(participantId, channel)
  }
  
  async function handleOffer(participantId: string, offer: RTCSessionDescriptionInit) {
    let pc = peerConnections.value.get(participantId)
    if (!pc) {
      pc = createPeerConnection(participantId, false)
    }
    
    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    signaling.send('answer', participantId, answer.toJSON())
    
    signaling.setP2PEstablished(true)
  }
  
  async function handleAnswer(participantId: string, answer: RTCSessionDescriptionInit) {
    const pc = peerConnections.value.get(participantId)
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer))
      signaling.setP2PEstablished(true)
    }
  }
  
  function handleIceCandidate(participantId: string, candidate: RTCIceCandidateInit) {
    const pc = peerConnections.value.get(participantId)
    if (pc) {
      pc.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }
  
  async function initiateConnection(participantId: string) {
    const pc = createPeerConnection(participantId, true)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    signaling.send('offer', participantId, offer.toJSON())
  }
  
  async function restartIce(participantId: string) {
    const pc = peerConnections.value.get(participantId)
    if (!pc) return
    
    const offer = await pc.createOffer({ iceRestart: true })
    await pc.setLocalDescription(offer)
    signaling.send('offer', participantId, offer.toJSON())
  }
  
  function toggleVideo() {
    isVideoOff.value = !isVideoOff.value
    store.localStream?.getVideoTracks().forEach(t => {
      t.enabled = !isVideoOff.value
    })
  }
  
  function toggleAudio() {
    isMuted.value = !isMuted.value
    store.localStream?.getAudioTracks().forEach(t => {
      t.enabled = !isMuted.value
    })
  }
  
  async function switchVideoDevice(deviceId: string) {
    // Need to renegotiate after switching device
    const oldTrack = store.localStream?.getVideoTracks()[0]
    
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }
    })
    const newTrack = newStream.getVideoTracks()[0]
    
    // Replace track in all peer connections
    peerConnections.value.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video')
      if (sender && newTrack) {
        sender.replaceTrack(newTrack)
      }
    })
    
    // Update local stream
    if (store.localStream && oldTrack) {
      store.localStream.removeTrack(oldTrack)
      store.localStream.addTrack(newTrack)
      oldTrack.stop()
    }
  }
  
  async function switchAudioDevice(deviceId: string) {
    const oldTrack = store.localStream?.getAudioTracks()[0]
    
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } }
    })
    const newTrack = newStream.getAudioTracks()[0]
    
    peerConnections.value.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio')
      if (sender && newTrack) {
        sender.replaceTrack(newTrack)
      }
    })
    
    if (store.localStream && oldTrack) {
      store.localStream.removeTrack(oldTrack)
      store.localStream.addTrack(newTrack)
      oldTrack.stop()
    }
  }
  
  function closePeerConnection(participantId: string) {
    const pc = peerConnections.value.get(participantId)
    pc?.close()
    peerConnections.value.delete(participantId)
    dataChannels.value.delete(participantId)
  }
  
  function disconnect() {
    peerConnections.value.forEach((pc, id) => {
      pc.close()
    })
    peerConnections.value.clear()
    dataChannels.value.clear()
    stopLocalStream()
    signaling.setP2PEstablished(false)
  }
  
  onUnmounted(disconnect)
  
  return {
    peerConnections,
    dataChannels,
    isMuted,
    isVideoOff,
    rtcConfig,
    startLocalStream,
    stopLocalStream,
    createPeerConnection,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    initiateConnection,
    restartIce,
    toggleVideo,
    toggleAudio,
    switchVideoDevice,
    switchAudioDevice,
    closePeerConnection,
    disconnect
  }
}
```

---

### Step 12: useChat Composable

**File:** `web_ui/src/composables/useChat.ts`

```typescript
import { ref, onMounted, onUnmounted } from 'vue'
import type { useWebRTC } from './useWebRTC'

export interface ChatMessage {
  id: string
  text: string
  from: string
  timestamp: number
  isLocal: boolean
}

export function useChat(webrtc: ReturnType<typeof useWebRTC>) {
  const messages = ref<ChatMessage[]>([])
  const isOpen = ref(false)
  
  function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }
  
  function send(text: string) {
    const msg: Omit<ChatMessage, 'isLocal'> = {
      id: generateId(),
      text,
      from: webrtc.participantId || 'unknown',
      timestamp: Date.now()
    }
    
    // Send to all peers
    webrtc.dataChannels.value.forEach(channel => {
      if (channel.readyState === 'open') {
        channel.send(JSON.stringify(msg))
      }
    })
    
    // Add to local messages
    messages.value.push({ ...msg, isLocal: true })
  }
  
  function handleIncoming(event: CustomEvent) {
    const { from, id, text, timestamp } = event.detail
    messages.value.push({
      id,
      text,
      from,
      timestamp,
      isLocal: false
    })
  }
  
  onMounted(() => {
    window.addEventListener('chat-message', handleIncoming as EventListener)
  })
  
  onUnmounted(() => {
    window.removeEventListener('chat-message', handleIncoming as EventListener)
  })
  
  return {
    messages,
    isOpen,
    send,
    toggle: () => isOpen.value = !isOpen.value
  }
}
```

---

### Step 13: Views

**File:** `web_ui/src/views/HomeView.vue`

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { generateUUID } from '@/utils/uuid'

const router = useRouter()

function generateLink() {
  const roomId = generateUUID()
  router.push(`/room/${roomId}`)
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-4">
    <div class="text-center max-w-md">
      <h1 class="text-4xl font-bold mb-4">VideoChat</h1>
      <p class="text-gray-400 mb-8">
        No accounts. No downloads. Just open a link and you're connected.
      </p>
      
      <button
        @click="generateLink"
        class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg text-lg transition-colors"
      >
        Generate Link
      </button>
      
      <p class="text-gray-500 text-sm mt-6">
        Self-hosted, ephemeral, private
      </p>
    </div>
  </div>
</template>
```

**File:** `web_ui/src/views/RoomView.vue`

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRoomStore } from '@/stores/room'
import { useSignaling } from '@/composables/useSignaling'
import { useWebRTC } from '@/composables/useWebRTC'
import { useDevices } from '@/composables/useDevices'
import { useChat } from '@/composables/useChat'
import VideoGrid from '@/components/VideoGrid.vue'
import Controls from '@/components/Controls.vue'
import Chat from '@/components/Chat.vue'
import ConnectionStatus from '@/components/ConnectionStatus.vue'

const route = useRoute()
const router = useRouter()
const store = useRoomStore()

const roomId = route.params.id as string
store.setRoom(roomId)

const signaling = useSignaling(roomId)
const devices = useDevices()
const webrtc = useWebRTC(roomId, signaling)
const chat = useChat(webrtc)

const isLoading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    // Get media permission first
    await webrtc.startLocalStream()
    await devices.getInitialDevices()
    
    // Connect to signaling
    signaling.connect()
    
    // Handle signaling messages for WebRTC
    signaling.onMessage(async (msg) => {
      switch (msg.type) {
        case 'join-ack':
          isLoading.value = false
          break
        case 'peer-joined':
          // We initiate the connection (joiner)
          webrtc.initiateConnection(msg.from!)
          break
        case 'offer':
          await webrtc.handleOffer(msg.from!, msg.payload as RTCSessionDescriptionInit)
          break
        case 'answer':
          await webrtc.handleAnswer(msg.from!, msg.payload as RTCSessionDescriptionInit)
          break
        case 'ice-candidate':
          webrtc.handleIceCandidate(msg.from!, msg.payload as RTCIceCandidateInit)
          break
        case 'error':
          error.value = (msg.payload as { message: string }).message
          break
      }
    })
  } catch (err) {
    error.value = 'Failed to access camera/microphone'
    isLoading.value = false
  }
})

onUnmounted(() => {
  webrtc.disconnect()
  signaling.disconnect()
  store.clear()
})

function leave() {
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gray-900">
    <!-- Header -->
    <header class="flex items-center justify-between p-4 border-b border-gray-800">
      <h1 class="text-xl font-semibold">VideoChat</h1>
      <ConnectionStatus 
        :signaling="signaling.connected.value"
        :signalingOffline="signaling.signalingOffline.value"
      />
    </header>
    
    <!-- Main content -->
    <main class="flex-1 relative">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mb-4 mx-auto"></div>
          <p class="text-gray-400">Connecting...</p>
        </div>
      </div>
      
      <!-- Error state -->
      <div v-else-if="error" class="flex items-center justify-center h-full">
        <div class="text-center">
          <p class="text-red-400 mb-4">{{ error }}</p>
          <button @click="leave" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">
            Go Home
          </button>
        </div>
      </div>
      
      <!-- Call view -->
      <template v-else>
        <VideoGrid
          :localStream="store.localStream"
          :participants="store.participants"
          :localParticipantId="store.participantId"
        />
        
        <!-- Participant warning -->
        <div 
          v-if="store.showWarning" 
          class="absolute top-4 left-1/2 -translate-x-1/2 bg-yellow-900/50 text-yellow-200 px-4 py-2 rounded-lg text-sm"
        >
          High participant count may affect call quality
        </div>
      </template>
    </main>
    
    <!-- Controls -->
    <Controls
      v-if="!isLoading && !error"
      :isMuted="webrtc.isMuted.value"
      :isVideoOff="webrtc.isVideoOff.value"
      :cameras="devices.cameras.value"
      :microphones="devices.microphones.value"
      :selectedCamera="devices.selectedCamera.value"
      :selectedMicrophone="devices.selectedMicrophone.value"
      @toggleAudio="webrtc.toggleAudio"
      @toggleVideo="webrtc.toggleVideo"
      @selectCamera="devices.setCamera"
      @selectMicrophone="devices.setMicrophone"
      @leave="leave"
    />
    
    <!-- Chat panel -->
    <Chat
      v-if="!isLoading && !error"
      :messages="chat.messages.value"
      :isOpen="chat.isOpen.value"
      @send="chat.send"
      @toggle="chat.toggle"
    />
  </div>
</template>
```

---

### Step 14: Components

**File:** `web_ui/src/components/VideoGrid.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Participant } from '@/types/webrtc'
import VideoTile from './VideoTile.vue'

const props = defineProps<{
  localStream: MediaStream | null
  participants: Map<string, Participant>
  localParticipantId: string | null
}>()

const participantList = computed(() => Array.from(props.participants.values()))

const gridClass = computed(() => {
  const count = participantList.value.length + 1 // +1 for local
  if (count <= 2) return 'grid-cols-1'
  if (count <= 4) return 'grid-cols-2'
  return 'grid-cols-3'
})
</script>

<template>
  <div class="h-full p-4">
    <div :class="['grid gap-4 h-full', gridClass]">
      <!-- Local video -->
      <VideoTile
        :stream="localStream"
        :isLocal="true"
        :label="'You'"
      />
      
      <!-- Remote videos -->
      <VideoTile
        v-for="p in participantList"
        :key="p.id"
        :stream="p.stream"
        :isLocal="false"
        :label="p.id.slice(0, 8)"
      />
    </div>
  </div>
</template>
```

**File:** `web_ui/src/components/VideoTile.vue`

```vue
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  stream: MediaStream | undefined
  isLocal: boolean
  label: string
}>()

const videoRef = ref<HTMLVideoElement | null>(null)

watch(() => props.stream, (stream) => {
  if (videoRef.value && stream) {
    videoRef.value.srcObject = stream
  }
}, { immediate: true })

onMounted(() => {
  if (videoRef.value && props.stream) {
    videoRef.value.srcObject = props.stream
  }
})
</script>

<template>
  <div class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
    <video
      ref="videoRef"
      autoplay
      playsinline
      :muted="isLocal"
      class="w-full h-full object-cover"
    />
    
    <!-- Label -->
    <div class="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-sm">
      {{ label }}
    </div>
    
    <!-- No video placeholder -->
    <div 
      v-if="!stream" 
      class="absolute inset-0 flex items-center justify-center text-gray-500"
    >
      <svg class="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
    </div>
  </div>
</template>
```

**File:** `web_ui/src/components/Controls.vue`

```vue
<script setup lang="ts">
import DeviceSelect from './DeviceSelect.vue'

defineProps<{
  isMuted: boolean
  isVideoOff: boolean
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  selectedCamera: string | null
  selectedMicrophone: string | null
}>()

const emit = defineEmits<{
  toggleAudio: []
  toggleVideo: []
  selectCamera: [deviceId: string]
  selectMicrophone: [deviceId: string]
  leave: []
}>()
</script>

<template>
  <div class="flex items-center justify-center gap-4 p-4 border-t border-gray-800 bg-gray-900">
    <!-- Audio toggle -->
    <button
      @click="emit('toggleAudio')"
      :class="[
        'p-3 rounded-full transition-colors',
        isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
      ]"
      :title="isMuted ? 'Unmute' : 'Mute'"
    >
      <svg v-if="isMuted" class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
      </svg>
      <svg v-else class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
      </svg>
    </button>
    
    <!-- Video toggle -->
    <button
      @click="emit('toggleVideo')"
      :class="[
        'p-3 rounded-full transition-colors',
        isVideoOff ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
      ]"
      :title="isVideoOff ? 'Turn on camera' : 'Turn off camera'"
    >
      <svg v-if="isVideoOff" class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>
      </svg>
      <svg v-else class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
      </svg>
    </button>
    
    <!-- Device selectors -->
    <DeviceSelect
      v-if="cameras.length > 1"
      :devices="cameras"
      :selected="selectedCamera"
      @select="emit('selectCamera', $event)"
      icon="camera"
    />
    
    <DeviceSelect
      v-if="microphones.length > 1"
      :devices="microphones"
      :selected="selectedMicrophone"
      @select="emit('selectMicrophone', $event)"
      icon="mic"
    />
    
    <!-- Leave button -->
    <button
      @click="emit('leave')"
      class="p-3 rounded-full bg-red-600 hover:bg-red-700 transition-colors"
      title="Leave call"
    >
      <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
      </svg>
    </button>
  </div>
</template>
```

**File:** `web_ui/src/components/DeviceSelect.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  devices: MediaDeviceInfo[]
  selected: string | null
  icon: 'camera' | 'mic'
}>()

const emit = defineEmits<{
  select: [deviceId: string]
}>()

const isOpen = ref(false)

function select(deviceId: string) {
  emit('select', deviceId)
  isOpen.value = false
}
</script>

<template>
  <div class="relative">
    <button
      @click="isOpen = !isOpen"
      class="p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
    >
      <svg v-if="icon === 'camera'" class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-5 11c0 1.1-.9 2-2 2s-2-.9-2-2V9c0-1.1.9-2 2-2s2 .9 2 2v7z"/>
      </svg>
      <svg v-else class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
      </svg>
    </button>
    
    <div
      v-if="isOpen"
      class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-800 rounded-lg shadow-lg overflow-hidden min-w-48"
    >
      <button
        v-for="device in devices"
        :key="device.deviceId"
        @click="select(device.deviceId)"
        :class="[
          'w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors',
          device.deviceId === selected ? 'text-blue-400' : ''
        ]"
      >
        {{ device.label || `Device ${device.deviceId.slice(0, 8)}` }}
      </button>
    </div>
  </div>
</template>
```

**File:** `web_ui/src/components/Chat.vue`

```vue
<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import type { ChatMessage } from '@/composables/useChat'

const props = defineProps<{
  messages: ChatMessage[]
  isOpen: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
  toggle: []
}>()

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

function send() {
  if (!inputText.value.trim()) return
  emit('send', inputText.value.trim())
  inputText.value = ''
}

watch(() => props.messages.length, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
})
</script>

<template>
  <!-- Toggle button -->
  <button
    @click="emit('toggle')"
    class="fixed bottom-24 right-4 p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors z-10"
    title="Toggle chat"
  >
    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>
    </svg>
  </button>
  
  <!-- Chat panel -->
  <div
    v-if="isOpen"
    class="fixed right-4 bottom-40 w-80 h-96 bg-gray-800 rounded-lg shadow-xl flex flex-col z-20"
  >
    <!-- Header -->
    <div class="flex items-center justify-between p-3 border-b border-gray-700">
      <span class="font-semibold">Chat</span>
      <button @click="emit('toggle')" class="text-gray-400 hover:text-white">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
    
    <!-- Messages -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto p-3 space-y-2">
      <div v-if="messages.length === 0" class="text-center text-gray-500 text-sm mt-8">
        No messages yet
      </div>
      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="[
          'p-2 rounded-lg text-sm max-w-[80%]',
          msg.isLocal 
            ? 'bg-blue-600 ml-auto' 
            : 'bg-gray-700'
        ]"
      >
        {{ msg.text }}
      </div>
    </div>
    
    <!-- Input -->
    <div class="p-3 border-t border-gray-700">
      <form @submit.prevent="send" class="flex gap-2">
        <input
          v-model="inputText"
          type="text"
          placeholder="Type a message..."
          class="flex-1 bg-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          class="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  </div>
</template>
```

**File:** `web_ui/src/components/ConnectionStatus.vue`

```vue
<script setup lang="ts">
defineProps<{
  signaling: boolean
  signalingOffline: boolean
}>()
</script>

<template>
  <div class="flex items-center gap-2 text-sm">
    <!-- Signaling status -->
    <div class="flex items-center gap-1">
      <div
        :class="[
          'w-2 h-2 rounded-full',
          signaling ? 'bg-green-500' : 'bg-red-500'
        ]"
      />
      <span class="text-gray-400">Signaling</span>
    </div>
    
    <!-- Offline indicator -->
    <div
      v-if="signalingOffline"
      class="bg-yellow-900/50 text-yellow-200 px-2 py-0.5 rounded text-xs"
    >
      Signaling offline (call continues)
    </div>
  </div>
</template>
```

---

### Step 15: Vite PWA Plugin

**Update:** `web_ui/vite.config.ts`

```typescript
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
```

**Note:** PWA icons need to be created and placed in `public/`:
- `public/pwa-192x192.png`
- `public/pwa-512x512.png`

---

### Step 16: Clean Up Template Files

Remove unused files from template:
```bash
rm src/stores/counter.ts
rm src/__tests__/App.spec.ts
```

Update `package.json` name:
```json
{
  "name": "videochat-web-ui"
}
```

---

## Testing Strategy

### Unit Tests (Vitest)

| File | Tests |
|------|-------|
| `utils/uuid.test.ts` | Generate UUID, format |
| `composables/useDevices.test.ts` | Enumerate, select |
| `stores/room.test.ts` | Add/remove participants |

### E2E Tests (Playwright)

| Scenario | Test |
|----------|------|
| Generate link | Click button, verify URL change |
| Join room | Open room URL, verify connection |
| Two users | Two browsers, verify video connection |

---

## Build Commands

```bash
# Development
pnpm dev

# Build for production
pnpm build

# Build output in dist/
# Copy dist/ to server/ for go:embed

# Preview production build
pnpm preview
```

---

## Implementation Order

1. Install dependencies (vue-router, vite-plugin-pwa)
2. Update `index.html` (Tailwind CDN, config placeholder)
3. Create types (`types/*.ts`)
4. Create utils (`utils/uuid.ts`)
5. Setup router (`router/index.ts`)
6. Update `main.ts` (add router)
7. Create store (`stores/room.ts`)
8. Create composables (`composables/*.ts`)
9. Create views (`views/*.vue`)
10. Create components (`components/*.vue`)
11. Update `vite.config.ts` (PWA plugin)
12. Clean up template files
13. Add PWA icons

---

## Notes

- Tailwind via CDN = no build step for CSS
- `window.__CONFIG__` injected by Go server at runtime
- For GitHub Pages build, config is baked at build time via Vite define
- Video tile uses `playsinline` for iOS Safari
- ICE restart triggers on `disconnected` or `failed` states
- Chat uses custom DOM events for message passing between composables

---

## Completion Checklist

**Status:** COMPLETED (2026-02-23)

- [x] Install dependencies (vue-router, vite-plugin-pwa)
- [x] Update index.html (Tailwind CDN, config placeholder)
- [x] Create types (config.ts, signaling.ts, webrtc.ts)
- [x] Create utils (uuid.ts)
- [x] Setup router (router/index.ts)
- [x] Update main.ts (add router)
- [x] Create room store (stores/room.ts)
- [x] Create composables (useSignaling, useDevices, useWebRTC, useChat)
- [x] Create views (HomeView.vue, RoomView.vue)
- [x] Create components (VideoGrid, VideoTile, Controls, DeviceSelect, Chat, ConnectionStatus)
- [x] Update vite.config.ts (PWA plugin)
- [x] Clean up template files
- [ ] Add PWA icons (placeholder note created - needs actual PNG icons)

**Build Status:** PASSED
**Type Check:** PASSED

**Remaining:**
- PWA icons need to be created as actual PNG files (192x192 and 512x512)
- Integration testing with Go signaling server
