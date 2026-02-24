# Plan: UI Fixes - Media Handling & Grid Layout
_User can always join a call regardless of hardware. Audio detection survives device changes. UI elements have stable sizing. Video grid scales properly for any participant count._

---

# Checklist
- [x] Step 1: Fix MicButton volume bar layout stability
- [x] Step 2: Add reattach method to useAudioAnalyzer
- [x] Step 3: Refactor useWebRTC for optional/independent media acquisition
- [x] Step 4: Update RoomView to join first, acquire media after
- [x] Step 5: Fix VideoGrid layout for single participant
- [x] Step 6: Update Controls to show device status
- [x] Step 7: Test all scenarios

---

## Context
Current codebase state:
- `web_ui/src/composables/useAudioAnalyzer.ts` — watches stream ref but doesn't detect track replacement
- `web_ui/src/composables/useWebRTC.ts` — `startLocalStream()` requests both audio+video in one call, throws on failure
- `web_ui/src/views/RoomView.vue` — calls `startLocalStream()` before joining signaling, blocks entry on failure
- `web_ui/src/components/MicButton.vue` — volume bar has `v-if="!isMuted"`, causes layout shift
- `web_ui/src/components/VideoGrid.vue` — uses `grid-cols-1` for 1-2 participants, causes oversized tiles

## Prerequisites
- Node.js installed
- `npm install` has been run in `web_ui/` directory
- Dev server can start with `npm run dev` from `web_ui/`

## Scope Boundaries
- Do NOT modify signaling server code (`server/`)
- Do NOT modify useSignaling composable
- Do NOT modify Chat component
- Do NOT modify ConnectionStatus component

---

## Steps

### Step 1: Fix MicButton volume bar layout stability
Open `web_ui/src/components/MicButton.vue`.

Find line 71:
```html
<div v-if="!isMuted" class="w-12 h-3 mx-2 bg-gray-600 rounded-full overflow-hidden">
```

Replace with:
```html
<div class="w-12 h-3 mx-2 bg-gray-600 rounded-full overflow-hidden">
  <div 
    v-if="!isMuted"
    class="h-full bg-green-500 transition-all duration-75 rounded-full"
    :style="{ width: `${volumePercent}%` }"
  />
</div>
```

✅ Success: MicButton renders a fixed-width container at all times. When muted, container is empty (gray background visible). When unmuted, green bar shows volume level.

❌ If failed: File not found or pattern doesn't match — stop and report exact error.

---

### Step 2: Add reattach method to useAudioAnalyzer
Open `web_ui/src/composables/useAudioAnalyzer.ts`.

After the `stopAnalyzing` function (around line 65), add a new exported function:

```typescript
function reattach() {
  stopAnalyzing()
  if (stream.value) {
    startAnalyzing()
  }
}
```

Update the return statement at the bottom (around line 76-78) from:
```typescript
return {
  volume
}
```

To:
```typescript
return {
  volume,
  reattach
}
```

✅ Success: `useAudioAnalyzer` exports a `reattach` function that restarts the audio context with the current stream.

❌ If failed: TypeScript errors on save — check function is inside the composable scope, not outside.

---

### Step 3: Refactor useWebRTC for optional/independent media acquisition
Open `web_ui/src/composables/useWebRTC.ts`.

**3a. Add new state variables** (after line 37, near other `ref` declarations):
```typescript
const hasAudio = ref(false)
const hasVideo = ref(false)
const audioError = ref<string | null>(null)
const videoError = ref<string | null>(null)
```

**3b. Replace `startLocalStream` function** (lines 77-101) with two new functions:

```typescript
async function tryGetAudio(deviceId?: string): Promise<boolean> {
  try {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {})
      },
      video: false
    }
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    
    // If we already have video, add audio track to existing stream
    if (store.localStream) {
      const oldAudioTrack = store.localStream.getAudioTracks()[0]
      if (oldAudioTrack) {
        store.localStream.removeTrack(oldAudioTrack)
        oldAudioTrack.stop()
      }
      store.localStream.addTrack(stream.getAudioTracks()[0]!)
    } else {
      store.setLocalStream(stream)
    }
    
    // Replace audio track in peer connections
    const newAudioTrack = stream.getAudioTracks()[0]!
    peerConnections.value.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio')
      if (sender) {
        sender.replaceTrack(newAudioTrack)
      } else {
        pc.addTrack(newAudioTrack, store.localStream!)
      }
    })
    
    hasAudio.value = true
    audioError.value = null
    return true
  } catch (err) {
    console.error('Failed to get audio:', err)
    audioError.value = err instanceof Error ? err.message : 'Unknown audio error'
    hasAudio.value = false
    return false
  }
}

async function tryGetVideo(deviceId?: string): Promise<boolean> {
  try {
    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 60 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {})
      },
      audio: false
    }
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    
    // If we already have audio, add video track to existing stream
    if (store.localStream) {
      const oldVideoTrack = store.localStream.getVideoTracks()[0]
      if (oldVideoTrack) {
        store.localStream.removeTrack(oldVideoTrack)
        oldVideoTrack.stop()
      }
      store.localStream.addTrack(stream.getVideoTracks()[0]!)
    } else {
      store.setLocalStream(stream)
    }
    
    // Replace video track in peer connections
    const newVideoTrack = stream.getVideoTracks()[0]!
    peerConnections.value.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video')
      if (sender) {
        sender.replaceTrack(newVideoTrack)
      } else {
        pc.addTrack(newVideoTrack, store.localStream!)
      }
    })
    
    hasVideo.value = true
    isVideoOff.value = false
    videoError.value = null
    return true
  } catch (err) {
    console.error('Failed to get video:', err)
    videoError.value = err instanceof Error ? err.message : 'Unknown video error'
    hasVideo.value = false
    return false
  }
}
```

**3c. Delete the old `startLocalStream` function** (the one you replaced in 3b).

**3d. Update `switchAudioDevice` function** (lines 386-407). Replace with:

```typescript
async function switchAudioDevice(deviceId: string): Promise<boolean> {
  const success = await tryGetAudio(deviceId)
  return success
}
```

**3e. Update `switchVideoDevice` function** (lines 355-384). Replace with:

```typescript
async function switchVideoDevice(deviceId: string): Promise<boolean> {
  const success = await tryGetVideo(deviceId)
  return success
}
```

**3f. Update `toggleVideo` function** (lines 341-346). Replace with:

```typescript
function toggleVideo() {
  if (!hasVideo.value) {
    // No video yet, try to get it
    return
  }
  isVideoOff.value = !isVideoOff.value
  store.localStream?.getVideoTracks().forEach(t => {
    t.enabled = !isVideoOff.value
  })
}

async function enableVideo(): Promise<boolean> {
  if (hasVideo.value) {
    isVideoOff.value = false
    store.localStream?.getVideoTracks().forEach(t => {
      t.enabled = true
    })
    return true
  }
  return await tryGetVideo()
}
```

**3g. Update `toggleAudio` function** (lines 348-353). Replace with:

```typescript
function toggleAudio() {
  if (!hasAudio.value) {
    // No audio yet, try to get it
    return
  }
  isMuted.value = !isMuted.value
  store.localStream?.getAudioTracks().forEach(t => {
    t.enabled = !isMuted.value
  })
}

async function enableAudio(): Promise<boolean> {
  if (hasAudio.value) {
    isMuted.value = false
    store.localStream?.getAudioTracks().forEach(t => {
      t.enabled = true
    })
    return true
  }
  return await tryGetAudio()
}
```

**3h. Update the return statement** (lines 430-450) to include new exports:

```typescript
return {
  peerConnections,
  dataChannels,
  isMuted,
  isVideoOff,
  hasAudio,
  hasVideo,
  audioError,
  videoError,
  rtcConfig,
  tryGetAudio,
  tryGetVideo,
  createPeerConnection,
  handleOffer,
  handleAnswer,
  handleIceCandidate,
  initiateConnection,
  restartIce,
  toggleVideo,
  toggleAudio,
  enableVideo,
  enableAudio,
  switchVideoDevice,
  switchAudioDevice,
  closePeerConnection,
  disconnect
}
```

✅ Success: `useWebRTC` exports `tryGetAudio`, `tryGetVideo`, `hasAudio`, `hasVideo`, `audioError`, `videoError`, `enableVideo`, `enableAudio`. Functions never throw — they return `true`/`false`.

❌ If failed: TypeScript errors — verify all function names match exactly, check that `store` import exists.

---

### Step 4: Update RoomView to join first, acquire media after
Open `web_ui/src/views/RoomView.vue`.

**4a. Update imports** (line 10). Add `storeToRefs` if not present, ensure `useAudioAnalyzer` is destructured for `reattach`:

The current line 35 is:
```typescript
const audioAnalyzer = useAudioAnalyzer(localStream)
```

Keep this but note we need `audioAnalyzer.reattach` later.

**4b. Replace the `onMounted` function** (lines 103-118) with:

```typescript
onMounted(async () => {
  // Register message handler BEFORE connecting
  signaling.setMessageHandler(handleSignalingMessage)
  
  // Connect to signaling FIRST (join the room)
  signaling.connect()
  
  // Try to get audio (non-blocking)
  const audioOk = await webrtc.tryGetAudio()
  if (audioOk) {
    await devices.getInitialDevices()
  } else {
    // Still enumerate devices even if audio failed
    try {
      await devices.getInitialDevices()
    } catch {
      console.log('Could not enumerate devices')
    }
  }
  
  // Video starts off - only request when user enables it
  webrtc.isVideoOff.value = true
  webrtc.hasVideo.value = false
  
  // We're ready regardless of media status
  isLoading.value = false
})
```

**4c. Update the event handlers in template** (lines 194-199). Change:

```html
@toggleAudio="webrtc.toggleAudio"
@toggleVideo="webrtc.toggleVideo"
@selectCamera="(id) => { devices.setCamera(id); webrtc.switchVideoDevice(id); }"
@selectMicrophone="(id) => { devices.setMicrophone(id); webrtc.switchAudioDevice(id); }"
```

To:
```html
@toggleAudio="handleToggleAudio"
@toggleVideo="handleToggleVideo"
@selectCamera="handleSelectCamera"
@selectMicrophone="handleSelectMicrophone"
```

**4d. Add handler functions** before `onMounted` (around line 102):

```typescript
async function handleToggleAudio() {
  if (webrtc.hasAudio.value) {
    webrtc.toggleAudio()
  } else {
    const success = await webrtc.enableAudio()
    if (success) {
      await devices.enumerateDevices()
      audioAnalyzer.reattach()
    }
  }
}

async function handleToggleVideo() {
  if (webrtc.hasVideo.value) {
    webrtc.toggleVideo()
  } else {
    const success = await webrtc.enableVideo()
    if (success) {
      await devices.enumerateDevices()
    }
  }
}

async function handleSelectCamera(deviceId: string) {
  devices.setCamera(deviceId)
  const success = await webrtc.switchVideoDevice(deviceId)
  if (!success) {
    console.log('Failed to switch camera')
  }
}

async function handleSelectMicrophone(deviceId: string) {
  devices.setMicrophone(deviceId)
  const success = await webrtc.switchAudioDevice(deviceId)
  if (success) {
    audioAnalyzer.reattach()
  }
}
```

**4e. Remove error state for media failures**. The `error` ref (line 28) should only be set for signaling errors, not media errors. Update the `handleSignalingMessage` function's `error` case if needed.

✅ Success: Room joins immediately. Audio/video are requested after joining. User can be in call with no media. Toggling audio/video attempts to acquire that media type.

❌ If failed: WebSocket doesn't connect — check `signaling.connect()` is called. Audio not working — verify `audioAnalyzer.reattach()` is called after device switch.

---

### Step 5: Fix VideoGrid layout for single participant
Open `web_ui/src/components/VideoGrid.vue`.

**5a. Replace the `gridClass` computed property** (lines 15-20):

```typescript
const gridClass = computed(() => {
  const count = participantList.value.length + 1 // +1 for local
  // Always show at least 2 columns for better sizing
  if (count === 1) return 'grid-cols-2 grid-rows-1'
  if (count === 2) return 'grid-cols-2 grid-rows-1'
  if (count <= 4) return 'grid-cols-2 grid-rows-2'
  if (count <= 6) return 'grid-cols-3 grid-rows-2'
  if (count <= 9) return 'grid-cols-3 grid-rows-3'
  if (count <= 12) return 'grid-cols-4 grid-rows-3'
  if (count <= 16) return 'grid-cols-4 grid-rows-4'
  if (count <= 20) return 'grid-cols-5 grid-rows-4'
  if (count <= 25) return 'grid-cols-5 grid-rows-5'
  if (count <= 30) return 'grid-cols-6 grid-rows-5'
  if (count <= 36) return 'grid-cols-6 grid-rows-6'
  if (count <= 42) return 'grid-cols-7 grid-rows-6'
  if (count <= 49) return 'grid-cols-7 grid-rows-7'
  if (count <= 56) return 'grid-cols-8 grid-rows-7'
  return 'grid-cols-8 grid-rows-8'
})
```

**5b. Update the grid container** (line 25). Change:
```html
<div :class="['grid gap-4 h-full', gridClass]">
```

To:
```html
<div :class="['grid gap-4 h-full auto-rows-fr', gridClass]">
```

The `auto-rows-fr` ensures rows share space equally instead of being driven by content size.

✅ Success: Single participant sees their video in a reasonably-sized tile (left half of screen) instead of full-height. Grid grows progressively with participant count.

❌ If failed: Layout looks broken — verify Tailwind classes are correct (`grid-cols-X`, `grid-rows-Y`, `auto-rows-fr`).

---

### Step 6: Update Controls to show device status
Open `web_ui/src/components/Controls.vue`.

**6a. Update props** (lines 6-15). Add:

```typescript
defineProps<{
  isMuted: boolean
  isVideoOff: boolean
  isDeafened: boolean
  micVolume: number
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  selectedCamera: string | null
  selectedMicrophone: string | null
  hasAudio: boolean
  hasVideo: boolean
}>()
```

✅ Success: Controls component accepts `hasAudio` and `hasVideo` props.

❌ If failed: TypeScript error — verify props are in the correct format.

---

### Step 7: Update MicButton to handle no-audio state
Open `web_ui/src/components/MicButton.vue`.

**7a. Update props** (lines 4-9):

```typescript
const props = defineProps<{
  isMuted: boolean
  volume: number
  microphones: MediaDeviceInfo[]
  selectedMicrophone: string | null
  hasAudio: boolean
}>()
```

**7b. Update the mic icon button** (lines 54-68). Add a different visual state for no-audio:

Change the button class to include no-audio state:
```html
<button
  @click="emit('toggle')"
  :class="[
    'p-3 transition-colors',
    !hasAudio ? 'bg-gray-600 hover:bg-gray-500' :
    isMuted ? 'bg-red-600 hover:bg-red-700' : 'hover:bg-gray-600'
  ]"
  :title="!hasAudio ? 'Click to enable microphone' : isMuted ? 'Unmute microphone' : 'Mute microphone'"
>
```

**7c. Update the volume indicator** to show placeholder when no audio:
```html
<div class="w-12 h-3 mx-2 bg-gray-600 rounded-full overflow-hidden">
  <div 
    v-if="hasAudio && !isMuted"
    class="h-full bg-green-500 transition-all duration-75 rounded-full"
    :style="{ width: `${volumePercent}%` }"
  />
</div>
```

✅ Success: Mic button shows gray when no audio device. Clicking attempts to enable. Volume bar only shows when audio is active.

❌ If failed: Button doesn't respond — verify emit is wired correctly in Controls.vue.

---

### Step 8: Update CameraButton for no-video state
Open `web_ui/src/components/CameraButton.vue`.

**8a. Update props to include `hasVideo`**:

```typescript
const props = defineProps<{
  isVideoOff: boolean
  cameras: MediaDeviceInfo[]
  selectedCamera: string | null
  hasVideo: boolean
}>()
```

**8b. Update button styling to show no-video state** (similar to mic button pattern):

```html
<button
  @click="emit('toggle')"
  :class="[
    'p-3 transition-colors',
    !hasVideo ? 'bg-gray-600 hover:bg-gray-500' :
    isVideoOff ? 'bg-red-600 hover:bg-red-700' : 'hover:bg-gray-600'
  ]"
  :title="!hasVideo ? 'Click to enable camera' : isVideoOff ? 'Turn on camera' : 'Turn off camera'"
>
```

✅ Success: Camera button shows gray when no video. Clicking attempts to enable camera.

❌ If failed: TypeScript errors — verify all prop types match.

---

### Step 9: Wire new props through Controls
Open `web_ui/src/components/Controls.vue`.

**9a. Pass new props to MicButton** (lines 30-37):

```html
<MicButton
  :isMuted="isMuted"
  :volume="micVolume"
  :microphones="microphones"
  :selectedMicrophone="selectedMicrophone"
  :hasAudio="hasAudio"
  @toggle="emit('toggleAudio')"
  @selectDevice="emit('selectMicrophone', $event)"
/>
```

**9b. Pass new props to CameraButton** (lines 40-46):

```html
<CameraButton
  :isVideoOff="isVideoOff"
  :cameras="cameras"
  :selectedCamera="selectedCamera"
  :hasVideo="hasVideo"
  @toggle="emit('toggleVideo')"
  @selectDevice="emit('selectCamera', $event)"
/>
```

✅ Success: hasAudio and hasVideo flow from RoomView → Controls → MicButton/CameraButton.

❌ If failed: Vue warning about missing props — verify all prop names match exactly.

---

### Step 10: Update RoomView template to pass new props
Open `web_ui/src/views/RoomView.vue`.

Update the Controls component (lines 184-200) to include new props:

```html
<Controls
  v-if="!isLoading && !error"
  :isMuted="webrtc.isMuted.value"
  :isVideoOff="webrtc.isVideoOff.value"
  :isDeafened="deafen.isDeafened.value"
  :micVolume="audioAnalyzer.volume.value"
  :cameras="devices.cameras.value"
  :microphones="devices.microphones.value"
  :selectedCamera="devices.selectedCamera.value"
  :selectedMicrophone="devices.selectedMicrophone.value"
  :hasAudio="webrtc.hasAudio.value"
  :hasVideo="webrtc.hasVideo.value"
  @toggleAudio="handleToggleAudio"
  @toggleVideo="handleToggleVideo"
  @toggleDeafen="deafen.toggleDeafen"
  @selectCamera="handleSelectCamera"
  @selectMicrophone="handleSelectMicrophone"
  @leave="leave"
/>
```

✅ Success: All props flow correctly. No Vue warnings in console.

❌ If failed: Undefined props — verify `webrtc.hasAudio` and `webrtc.hasVideo` are returned from `useWebRTC`.

---

## Verification
Run the dev server: `cd web_ui && npm run dev`

Test scenarios:
1. **No camera/mic**: Open room, deny permissions. User should still join and see the UI. Buttons show gray "click to enable" state.
2. **Mic toggle**: Click mic button when no audio. Should request mic permission. Volume bar should show when unmuted.
3. **Camera toggle**: Click camera button when no video. Should request camera permission. Video should appear.
4. **Mic device switch**: Change microphone. Audio level detection should continue working.
5. **Single participant**: Room with 1 person should show video in left half of screen, not full height.
6. **Multiple participants**: Add 2-3 participants. Grid should grow appropriately.

Expected outcomes:
- No JavaScript errors in console
- User can join call regardless of hardware state
- Audio detection works after device switch
- Mic button doesn't resize when muted
- Video grid tiles are reasonably sized for any count

---

## Rollback
If critical failure occurs:
1. `git checkout -- web_ui/src/views/RoomView.vue`
2. `git checkout -- web_ui/src/composables/useWebRTC.ts`
3. `git checkout -- web_ui/src/composables/useAudioAnalyzer.ts`
4. `git checkout -- web_ui/src/components/MicButton.vue`
5. `git checkout -- web_ui/src/components/Controls.vue`
6. `git checkout -- web_ui/src/components/VideoGrid.vue`
7. `git checkout -- web_ui/src/components/CameraButton.vue` (if modified)

Run `npm run dev` to verify rollback succeeded.
