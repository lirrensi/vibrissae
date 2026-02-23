# Plan: Web UI Controls Redesign (Google Meet Style)
_A complete overhaul of controls, device switching, audio visualization, speaker indication, and chat identification._

---

# Checklist
- [x] Step 1: Fix device switching wiring in useDevices.ts
- [x] Step 2: Add high-quality video constraints in useWebRTC.ts
- [x] Step 3: Create useAudioAnalyzer.ts composable for volume detection
- [x] Step 4: Create useSpeakerDetection.ts composable for remote speaker detection
- [x] Step 5: Create useDeafen.ts composable for mute-all functionality
- [x] Step 6: Create MicButton.vue component with volume indicator and device dropdown
- [x] Step 7: Create CameraButton.vue component with device dropdown
- [x] Step 8: Create SpeakerButton.vue component for mute-all/deafen
- [x] Step 9: Rewrite Controls.vue with Google Meet style layout
- [x] Step 10: Update VideoTile.vue with speaker highlight border
- [x] Step 11: Update Chat.vue with participant identification and color hash

---

## Context

The web UI has multiple UX issues:
1. Device selection dropdowns don't actually switch devices — `useDevices.ts` only updates refs but never calls the WebRTC switch methods
2. Controls are not Google Meet style — mic/camera are separate buttons without inline device selection
3. No volume indicator on mic button
4. No "deafen" button to mute all remote audio
5. No speaker highlight border on active speaker's video tile
6. Camera uses default quality (`video: true`) instead of HD constraints
7. Chat messages don't show who sent them, no color identification

**Key files:**
- `web_ui/src/components/Controls.vue` — main control bar
- `web_ui/src/components/DeviceSelect.vue` — device dropdown (to be removed)
- `web_ui/src/components/VideoTile.vue` — video tile component
- `web_ui/src/components/Chat.vue` — chat panel
- `web_ui/src/composables/useDevices.ts` — device state (broken wire)
- `web_ui/src/composables/useWebRTC.ts` — WebRTC logic
- `web_ui/src/views/RoomView.vue` — main room view

---

## Prerequisites

- Node.js installed
- `web_ui/` directory exists with `npm install` already run
- Dev server can start with `npm run dev` from `web_ui/` directory

---

## Scope Boundaries

**OUT OF SCOPE:**
- Server-side changes (`server/` directory)
- Signaling protocol changes
- Mobile/native app changes
- PWA manifest changes
- Any files not explicitly named in steps below

---

## Steps

### Step 1: Fix device switching wiring in useDevices.ts

Open `web_ui/src/composables/useDevices.ts`. The composable receives no WebRTC instance but needs to call switch methods. The current implementation only sets refs without triggering device changes.

**Solution:** The fix belongs in `RoomView.vue` — the view must call `webrtc.switchVideoDevice()` and `webrtc.switchAudioDevice()` when devices change.

1. Open `web_ui/src/views/RoomView.vue`
2. Find the `@selectCamera` and `@selectMicrophone` handlers on the `<Controls>` component (approximately lines 185-186)
3. Replace the current handlers:
   - Change `@selectCamera="devices.setCamera"` to `@selectCamera="(id) => { devices.setCamera(id); webrtc.switchVideoDevice(id); }"`
   - Change `@selectMicrophone="devices.setMicrophone"` to `@selectMicrophone="(id) => { devices.setMicrophone(id); webrtc.switchAudioDevice(id); }"`

✅ Success: `RoomView.vue` contains the updated handlers that call both `devices.set*` and `webrtc.switch*` methods.

❌ If failed: Verify `webrtc.switchVideoDevice` and `webrtc.switchAudioDevice` functions exist in `useWebRTC.ts`. If missing, stop and report.

---

### Step 2: Add high-quality video constraints in useWebRTC.ts

Open `web_ui/src/composables/useWebRTC.ts`. Find the `startLocalStream` function (approximately line 77). The current implementation uses `video: true` which lets the browser choose default quality.

1. Find the line:
   ```typescript
   const constraints: MediaStreamConstraints = {
     video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
     audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
   }
   ```

2. Replace it with:
   ```typescript
   const constraints: MediaStreamConstraints = {
     video: {
       width: { ideal: 1920, max: 1920 },
       height: { ideal: 1080, max: 1080 },
       frameRate: { ideal: 30, max: 60 },
       ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : {})
     },
     audio: {
       echoCancellation: true,
       noiseSuppression: true,
       autoGainControl: true,
       ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {})
     }
   }
   ```

3. Also update `switchVideoDevice` function (approximately line 345). Replace:
   ```typescript
   const newStream = await navigator.mediaDevices.getUserMedia({
     video: { deviceId: { exact: deviceId } }
   })
   ```
   With:
   ```typescript
   const newStream = await navigator.mediaDevices.getUserMedia({
     video: {
       width: { ideal: 1920, max: 1920 },
       height: { ideal: 1080, max: 1080 },
       frameRate: { ideal: 30, max: 60 },
       deviceId: { exact: deviceId }
     }
   })
   ```

✅ Success: `startLocalStream` and `switchVideoDevice` both request 1080p@30fps with audio enhancements.

❌ If failed: If TypeScript errors appear about constraint types, verify `MediaStreamConstraints` interface accepts the nested structure. Stop and report if unresolved.

---

### Step 3: Create useAudioAnalyzer.ts composable for volume detection

Create new file `web_ui/src/composables/useAudioAnalyzer.ts`. This composable analyzes a MediaStream's audio track and provides real-time volume level (0-1).

```typescript
import { ref, onUnmounted, watch, type Ref } from 'vue'

export function useAudioAnalyzer(stream: Ref<MediaStream | null | undefined>) {
  const volume = ref(0)
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let animationFrame: number | null = null
  let dataArray: Uint8Array | null = null

  function startAnalyzing() {
    if (!stream.value) return
    
    const audioTrack = stream.value.getAudioTracks()[0]
    if (!audioTrack) return

    try {
      audioContext = new AudioContext()
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      
      source = audioContext.createMediaStreamSource(stream.value)
      source.connect(analyser)
      
      dataArray = new Uint8Array(analyser.frequencyBinCount)
      updateVolume()
    } catch (err) {
      console.error('Failed to start audio analyzer:', err)
    }
  }

  function updateVolume() {
    if (!analyser || !dataArray) return
    
    analyser.getByteFrequencyData(dataArray)
    
    // Calculate RMS-like volume from frequency data
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i]
    }
    const rms = Math.sqrt(sum / dataArray.length)
    volume.value = Math.min(1, rms / 128) // Normalize to 0-1
    
    animationFrame = requestAnimationFrame(updateVolume)
  }

  function stopAnalyzing() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
    if (source) {
      source.disconnect()
      source = null
    }
    if (audioContext) {
      audioContext.close()
      audioContext = null
    }
    analyser = null
    dataArray = null
    volume.value = 0
  }

  watch(stream, (newStream) => {
    stopAnalyzing()
    if (newStream) {
      startAnalyzing()
    }
  }, { immediate: true })

  onUnmounted(stopAnalyzing)

  return {
    volume
  }
}
```

✅ Success: File `web_ui/src/composables/useAudioAnalyzer.ts` exists with the above content.

❌ If failed: Verify TypeScript compiles without errors. Check that `AudioContext` and `AnalyserNode` types are available in the browser DOM lib.

---

### Step 4: Create useSpeakerDetection.ts composable for remote speaker detection

Create new file `web_ui/src/composables/useSpeakerDetection.ts`. This composable monitors multiple remote streams and identifies which participant is currently speaking.

```typescript
import { ref, onUnmounted, watch, type Ref } from 'vue'
import type { Participant } from '@/types/webrtc'

interface SpeakerState {
  participantId: string | null
  volume: number
}

export function useSpeakerDetection(participants: Ref<Map<string, Participant>>) {
  const speakers = ref<Map<string, number>>(new Map()) // participantId -> volume (0-1)
  const activeSpeaker = ref<string | null>(null)
  
  const audioContexts = new Map<string, { 
    context: AudioContext
    analyser: AnalyserNode
    source: MediaStreamAudioSourceNode
    dataArray: Uint8Array
  }>()
  let animationFrame: number | null = null

  function startAnalyzingParticipant(participantId: string, stream: MediaStream) {
    if (audioContexts.has(participantId)) return
    
    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) return

    try {
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      
      audioContexts.set(participantId, {
        context: audioContext,
        analyser,
        source,
        dataArray
      })
    } catch (err) {
      console.error(`Failed to start analyzing ${participantId}:`, err)
    }
  }

  function stopAnalyzingParticipant(participantId: string) {
    const state = audioContexts.get(participantId)
    if (state) {
      state.source.disconnect()
      state.context.close()
      audioContexts.delete(participantId)
      speakers.value.delete(participantId)
    }
  }

  function updateVolumes() {
    let maxVolume = 0
    let currentSpeaker: string | null = null
    
    audioContexts.forEach((state, participantId) => {
      state.analyser.getByteFrequencyData(state.dataArray)
      
      let sum = 0
      for (let i = 0; i < state.dataArray.length; i++) {
        sum += state.dataArray[i] * state.dataArray[i]
      }
      const rms = Math.sqrt(sum / state.dataArray.length)
      const volume = Math.min(1, rms / 128)
      
      speakers.value.set(participantId, volume)
      
      if (volume > 0.15 && volume > maxVolume) {
        maxVolume = volume
        currentSpeaker = participantId
      }
    })
    
    activeSpeaker.value = currentSpeaker
    animationFrame = requestAnimationFrame(updateVolumes)
  }

  function startMonitoring() {
    if (animationFrame) return
    updateVolumes()
  }

  function stopMonitoring() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
    audioContexts.forEach((state) => {
      state.source.disconnect()
      state.context.close()
    })
    audioContexts.clear()
    speakers.value.clear()
    activeSpeaker.value = null
  }

  // Watch for new/removed participants
  watch(participants, (newParticipants) => {
    // Start analyzing new participants
    newParticipants.forEach((participant, id) => {
      if (participant.stream && !audioContexts.has(id)) {
        startAnalyzingParticipant(id, participant.stream)
      }
    })
    
    // Stop analyzing removed participants
    audioContexts.forEach((_, id) => {
      if (!newParticipants.has(id)) {
        stopAnalyzingParticipant(id)
      }
    })
    
    // Start monitoring if not already
    if (audioContexts.size > 0 && !animationFrame) {
      startMonitoring()
    }
  }, { deep: true, immediate: true })

  onUnmounted(stopMonitoring)

  return {
    speakers,
    activeSpeaker
  }
}
```

✅ Success: File `web_ui/src/composables/useSpeakerDetection.ts` exists with the above content.

❌ If failed: Verify TypeScript compiles without errors.

---

### Step 5: Create useDeafen.ts composable for mute-all functionality

Create new file `web_ui/src/composables/useDeafen.ts`. This composable mutes/unmutes all remote audio tracks.

```typescript
import { ref, watch, type Ref } from 'vue'
import type { Participant } from '@/types/webrtc'

export function useDeafen(participants: Ref<Map<string, Participant>>) {
  const isDeafened = ref(false)

  function toggleDeafen() {
    isDeafened.value = !isDeafened.value
    applyDeafenState()
  }

  function applyDeafenState() {
    participants.value.forEach((participant) => {
      if (participant.stream) {
        const audioTracks = participant.stream.getAudioTracks()
        audioTracks.forEach(track => {
          track.enabled = !isDeafened.value
        })
      }
    })
  }

  // Apply deafen state when new participants join
  watch(participants, () => {
    if (isDeafened.value) {
      applyDeafenState()
    }
  }, { deep: true })

  return {
    isDeafened,
    toggleDeafen
  }
}
```

✅ Success: File `web_ui/src/composables/useDeafen.ts` exists with the above content.

❌ If failed: Verify TypeScript compiles without errors.

---

### Step 6: Create MicButton.vue component with volume indicator and device dropdown

Create new file `web_ui/src/components/MicButton.vue`. This is a Google Meet style mic button with inline volume meter and device dropdown.

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  isMuted: boolean
  volume: number
  microphones: MediaDeviceInfo[]
  selectedMicrophone: string | null
}>()

const emit = defineEmits<{
  toggle: []
  selectDevice: [deviceId: string]
}>()

const showDropdown = ref(false)

const volumePercent = computed(() => Math.round(props.volume * 100))

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

function selectDevice(deviceId: string) {
  emit('selectDevice', deviceId)
  showDropdown.value = false
}

function closeDropdown() {
  showDropdown.value = false
}
</script>

<template>
  <div class="relative" v-click-outside="closeDropdown">
    <!-- Main button with volume indicator -->
    <div class="flex items-center bg-gray-700 rounded-full overflow-hidden">
      <!-- Mic toggle button -->
      <button
        @click="emit('toggle')"
        :class="[
          'p-3 transition-colors',
          isMuted ? 'bg-red-600 hover:bg-red-700' : 'hover:bg-gray-600'
        ]"
        :title="isMuted ? 'Unmute microphone' : 'Mute microphone'"
      >
        <svg v-if="isMuted" class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
        </svg>
        <svg v-else class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
        </svg>
      </button>
      
      <!-- Volume indicator bar -->
      <div v-if="!isMuted" class="w-12 h-3 mx-2 bg-gray-600 rounded-full overflow-hidden">
        <div 
          class="h-full bg-green-500 transition-all duration-75 rounded-full"
          :style="{ width: `${volumePercent}%` }"
        />
      </div>
      
      <!-- Device dropdown button -->
      <button
        v-if="microphones.length > 1"
        @click.stop="toggleDropdown"
        class="px-2 py-3 hover:bg-gray-600 transition-colors border-l border-gray-600"
        title="Select microphone"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </button>
    </div>
    
    <!-- Dropdown menu -->
    <div
      v-if="showDropdown"
      class="absolute bottom-full mb-2 left-0 bg-gray-800 rounded-lg shadow-lg overflow-hidden min-w-56 z-50"
    >
      <div class="px-3 py-2 text-xs text-gray-400 border-b border-gray-700">
        Microphone
      </div>
      <button
        v-for="device in microphones"
        :key="device.deviceId"
        @click="selectDevice(device.deviceId)"
        :class="[
          'w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2',
          device.deviceId === selectedMicrophone ? 'text-blue-400' : ''
        ]"
      >
        <svg v-if="device.deviceId === selectedMicrophone" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        <span v-else class="w-4" />
        {{ device.label || `Microphone ${device.deviceId.slice(0, 8)}` }}
      </button>
    </div>
  </div>
</template>
```

✅ Success: File `web_ui/src/components/MicButton.vue` exists with the above content.

❌ If failed: If `v-click-outside` directive is not available, remove it and add a click handler on the parent to close dropdown when clicking outside. Use a simple `onMounted` document click listener instead.

---

### Step 7: Create CameraButton.vue component with device dropdown

Create new file `web_ui/src/components/CameraButton.vue`. This is a Google Meet style camera button with device dropdown.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  isVideoOff: boolean
  cameras: MediaDeviceInfo[]
  selectedCamera: string | null
}>()

const emit = defineEmits<{
  toggle: []
  selectDevice: [deviceId: string]
}>()

const showDropdown = ref(false)

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

function selectDevice(deviceId: string) {
  emit('selectDevice', deviceId)
  showDropdown.value = false
}

function closeDropdown() {
  showDropdown.value = false
}
</script>

<template>
  <div class="relative" v-click-outside="closeDropdown">
    <!-- Main button -->
    <div class="flex items-center bg-gray-700 rounded-full overflow-hidden">
      <!-- Camera toggle button -->
      <button
        @click="emit('toggle')"
        :class="[
          'p-3 transition-colors',
          isVideoOff ? 'bg-red-600 hover:bg-red-700' : 'hover:bg-gray-600'
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
      
      <!-- Device dropdown button -->
      <button
        v-if="cameras.length > 1"
        @click.stop="toggleDropdown"
        class="px-2 py-3 hover:bg-gray-600 transition-colors border-l border-gray-600"
        title="Select camera"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </button>
    </div>
    
    <!-- Dropdown menu -->
    <div
      v-if="showDropdown"
      class="absolute bottom-full mb-2 left-0 bg-gray-800 rounded-lg shadow-lg overflow-hidden min-w-56 z-50"
    >
      <div class="px-3 py-2 text-xs text-gray-400 border-b border-gray-700">
        Camera
      </div>
      <button
        v-for="device in cameras"
        :key="device.deviceId"
        @click="selectDevice(device.deviceId)"
        :class="[
          'w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2',
          device.deviceId === selectedCamera ? 'text-blue-400' : ''
        ]"
      >
        <svg v-if="device.deviceId === selectedCamera" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        <span v-else class="w-4" />
        {{ device.label || `Camera ${device.deviceId.slice(0, 8)}` }}
      </button>
    </div>
  </div>
</template>
```

✅ Success: File `web_ui/src/components/CameraButton.vue` exists with the above content.

❌ If failed: Same as Step 6 — handle `v-click-outside` if not available.

---

### Step 8: Create SpeakerButton.vue component for mute-all/deafen

Create new file `web_ui/src/components/SpeakerButton.vue`. This is a speaker button for muting all remote audio.

```vue
<script setup lang="ts">
defineProps<{
  isDeafened: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <button
    @click="emit('toggle')"
    :class="[
      'p-3 rounded-full transition-colors',
      isDeafened ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
    ]"
    :title="isDeafened ? 'Unmute all participants' : 'Mute all participants'"
  >
    <svg v-if="isDeafened" class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
    </svg>
    <svg v-else class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>
  </button>
</template>
```

✅ Success: File `web_ui/src/components/SpeakerButton.vue` exists with the above content.

❌ If failed: Verify TypeScript compiles without errors.

---

### Step 9: Rewrite Controls.vue with Google Meet style layout

Replace the entire content of `web_ui/src/components/Controls.vue` with:

```vue
<script setup lang="ts">
import MicButton from './MicButton.vue'
import CameraButton from './CameraButton.vue'
import SpeakerButton from './SpeakerButton.vue'

defineProps<{
  isMuted: boolean
  isVideoOff: boolean
  isDeafened: boolean
  micVolume: number
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  selectedCamera: string | null
  selectedMicrophone: string | null
}>()

const emit = defineEmits<{
  toggleAudio: []
  toggleVideo: []
  toggleDeafen: []
  selectCamera: [deviceId: string]
  selectMicrophone: [deviceId: string]
  leave: []
}>()
</script>

<template>
  <div class="flex items-center justify-center gap-3 p-4 border-t border-gray-800 bg-gray-900">
    <!-- Mic button with volume indicator -->
    <MicButton
      :isMuted="isMuted"
      :volume="micVolume"
      :microphones="microphones"
      :selectedMicrophone="selectedMicrophone"
      @toggle="emit('toggleAudio')"
      @selectDevice="emit('selectMicrophone', $event)"
    />
    
    <!-- Camera button -->
    <CameraButton
      :isVideoOff="isVideoOff"
      :cameras="cameras"
      :selectedCamera="selectedCamera"
      @toggle="emit('toggleVideo')"
      @selectDevice="emit('selectCamera', $event)"
    />
    
    <!-- Speaker / Deafen button -->
    <SpeakerButton
      :isDeafened="isDeafened"
      @toggle="emit('toggleDeafen')"
    />
    
    <!-- Leave button -->
    <button
      @click="emit('leave')"
      class="p-3 rounded-full bg-red-600 hover:bg-red-700 transition-colors ml-4"
      title="Leave call"
    >
      <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    </button>
  </div>
</template>
```

✅ Success: `Controls.vue` uses the new MicButton, CameraButton, and SpeakerButton components. The old DeviceSelect import is removed.

❌ If failed: Check that all three new button components exist and import paths are correct.

---

### Step 10: Update VideoTile.vue with speaker highlight border

Open `web_ui/src/components/VideoTile.vue`. Add a prop for `isSpeaking` and a visual border effect.

1. Add new prop to the `defineProps`:
   ```typescript
   const props = defineProps<{
     stream: MediaStream | null | undefined
     isLocal: boolean
     label: string
     isSpeaking?: boolean
   }>()
   ```

2. Update the outer `<div>` to include a speaking border class:
   Replace:
   ```vue
   <div class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
   ```
   With:
   ```vue
   <div 
     :class="[
       'relative bg-gray-800 rounded-lg overflow-hidden aspect-video transition-all duration-200',
       isSpeaking ? 'ring-4 ring-green-500 ring-opacity-75' : ''
     ]"
   >
   ```

✅ Success: `VideoTile.vue` has an `isSpeaking` prop and renders a green border ring when true.

❌ If failed: Verify Tailwind CSS classes are working. If `ring-` classes don't work, try `border-4 border-green-500` instead.

---

### Step 11: Update Chat.vue with participant identification and color hash

Open `web_ui/src/components/Chat.vue`. Update to show sender name with a consistent color hash.

1. Add a helper function for generating a color from a string (inside the `<script setup>`):
   ```typescript
   function getParticipantColor(id: string): string {
     // Generate a consistent color based on participant ID
     const colors = [
       'bg-blue-600', 'bg-green-600', 'bg-purple-600', 
       'bg-pink-600', 'bg-yellow-600', 'bg-indigo-600',
       'bg-red-600', 'bg-teal-600', 'bg-orange-600'
     ]
     let hash = 0
     for (let i = 0; i < id.length; i++) {
       hash = ((hash << 5) - hash) + id.charCodeAt(i)
       hash = hash & hash
     }
     return colors[Math.abs(hash) % colors.length]
   }
   ```

2. Add a new prop for `localParticipantId`:
   ```typescript
   const props = defineProps<{
     messages: ChatMessage[]
     isOpen: boolean
     localParticipantId: string | null
   }>()
   ```

3. Update the message rendering in the template. Find the `<div v-for="msg in messages">` block (approximately line 65) and replace it with:
   ```vue
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
     <!-- Sender indicator for remote messages -->
     <div 
       v-if="!msg.isLocal" 
       :class="['text-xs font-medium mb-1 px-1.5 py-0.5 rounded inline-block', getParticipantColor(msg.from)]"
     >
       {{ msg.from.slice(0, 8) }}
     </div>
     <div>{{ msg.text }}</div>
   </div>
   ```

✅ Success: `Chat.vue` shows sender ID (first 8 chars) with a color-coded badge for remote messages. Local messages appear as before without sender badge.

❌ If failed: Verify `msg.from` exists on all messages. Check that `getParticipantColor` returns valid Tailwind classes.

---

### Step 12: Wire up new composables and props in RoomView.vue

Open `web_ui/src/views/RoomView.vue`. This step integrates all new composables and passes new props to components.

1. Add imports for new composables (at the top of `<script setup>`):
   ```typescript
   import { useAudioAnalyzer } from '@/composables/useAudioAnalyzer'
   import { useSpeakerDetection } from '@/composables/useSpeakerDetection'
   import { useDeafen } from '@/composables/useDeafen'
   ```

2. After creating the `webrtc` composable (around line 28), add:
   ```typescript
   const audioAnalyzer = useAudioAnalyzer(store.localStream)
   const speakerDetection = useSpeakerDetection(store.participants)
   const deafen = useDeafen(store.participants)
   ```

3. Update the `<Controls>` component props (around line 175):
   ```vue
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
     @toggleAudio="webrtc.toggleAudio"
     @toggleVideo="webrtc.toggleVideo"
     @toggleDeafen="deafen.toggleDeafen"
     @selectCamera="(id) => { devices.setCamera(id); webrtc.switchVideoDevice(id); }"
     @selectMicrophone="(id) => { devices.setMicrophone(id); webrtc.switchAudioDevice(id); }"
     @leave="leave"
   />
   ```

4. Update `<VideoGrid>` to pass `activeSpeaker`:
   ```vue
   <VideoGrid
     :localStream="store.localStream"
     :participants="store.participants"
     :localParticipantId="store.participantId"
     :activeSpeaker="speakerDetection.activeSpeaker.value"
   />
   ```

5. Update `<Chat>` to pass `localParticipantId`:
   ```vue
   <Chat
     v-if="!isLoading && !error"
     :messages="chat.messages.value"
     :isOpen="chat.isOpen.value"
     :localParticipantId="store.participantId"
     @send="chat.send"
     @toggle="chat.toggle"
   />
   ```

✅ Success: `RoomView.vue` imports and uses all new composables, passes all new props to components.

❌ If failed: Check for missing imports or incorrect prop names. Verify all referenced composables exist.

---

### Step 13: Update VideoGrid.vue to pass isSpeaking prop

Open `web_ui/src/components/VideoGrid.vue`. Add the `activeSpeaker` prop and pass `isSpeaking` to each VideoTile.

1. Add `activeSpeaker` to props:
   ```typescript
   const props = defineProps<{
     localStream: MediaStream | null
     participants: Map<string, Participant>
     localParticipantId: string | null
     activeSpeaker: string | null
   }>()
   ```

2. Update the VideoTile for local participant:
   ```vue
   <VideoTile
     :stream="localStream"
     :isLocal="true"
     :label="'You'"
     :isSpeaking="localParticipantId === activeSpeaker"
   />
   ```

3. Update the VideoTile for remote participants:
   ```vue
   <VideoTile
     v-for="p in participantList"
     :key="p.id"
     :stream="p.stream"
     :isLocal="false"
     :label="p.id?.slice(0, 8) || 'Unknown'"
     :isSpeaking="p.id === activeSpeaker"
   />
   ```

✅ Success: `VideoGrid.vue` passes `isSpeaking` prop to each `VideoTile` based on `activeSpeaker` comparison.

❌ If failed: Verify `activeSpeaker` prop is received correctly from parent.

---

### Step 14: Handle v-click-outside directive

The `v-click-outside` directive used in MicButton and CameraButton may not exist. Check if it's available:

1. Run `cd web_ui && npm run dev`
2. Open browser console and check for errors about `v-click-outside`

If the directive is missing, install it:
```bash
cd web_ui && npm install @vueuse/components
```

Then update both `MicButton.vue` and `CameraButton.vue`:
- Import: `import { vClickOutside } from '@vueuse/components'`
- Register: Add `v-click-outside="closeDropdown"` as a directive in the component

Alternatively, replace `v-click-outside` with a simple document click listener:

In `<script setup>` of both files, add:
```typescript
import { onMounted, onUnmounted } from 'vue'

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.relative')) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
```

And remove `v-click-outside="closeDropdown"` from the template.

✅ Success: No console errors about missing directive, dropdowns close when clicking outside.

❌ If failed: If using @vueuse/components doesn't work, use the document click listener approach as a fallback.

---

## Verification

1. Start the dev server: `cd web_ui && npm run dev`
2. Open the app in browser
3. Join a room and verify:
   - [ ] Mic button shows volume bar when speaking
   - [ ] Mic button dropdown shows available microphones and switching works
   - [ ] Camera button dropdown shows available cameras and switching works
   - [ ] Speaker button mutes all remote audio when clicked
   - [ ] Active speaker's video tile has a green border ring
   - [ ] Chat messages show sender ID with color badge
   - [ ] Video quality is 1080p (check in browser dev tools)

---

## Rollback

If critical failure occurs:

1. Restore original Controls.vue from git:
   ```bash
   cd web_ui && git checkout src/components/Controls.vue
   ```

2. Delete new component files:
   ```bash
   rm web_ui/src/components/MicButton.vue
   rm web_ui/src/components/CameraButton.vue
   rm web_ui/src/components/SpeakerButton.vue
   rm web_ui/src/composables/useAudioAnalyzer.ts
   rm web_ui/src/composables/useSpeakerDetection.ts
   rm web_ui/src/composables/useDeafen.ts
   ```

3. Restore original RoomView.vue:
   ```bash
   cd web_ui && git checkout src/views/RoomView.vue
   ```

4. Restore original VideoGrid.vue:
   ```bash
   cd web_ui && git checkout src/components/VideoGrid.vue
   ```

5. Restore original VideoTile.vue:
   ```bash
   cd web_ui && git checkout src/components/VideoTile.vue
   ```

6. Restore original Chat.vue:
   ```bash
   cd web_ui && git checkout src/components/Chat.vue
   ```

7. Restore original useWebRTC.ts:
   ```bash
   cd web_ui && git checkout src/composables/useWebRTC.ts
   ```
