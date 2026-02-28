<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRoomStore } from '@/stores/room'
import { useLogStore } from '@/stores/log'
import { useSignaling } from '@/composables/useSignaling'
import { useWebRTC } from '@/composables/useWebRTC'
import { useDevices } from '@/composables/useDevices'
import { useChat } from '@/composables/useChat'
import { useAudioAnalyzer } from '@/composables/useAudioAnalyzer'
import { useSpeakerDetection } from '@/composables/useSpeakerDetection'
import { useDeafen } from '@/composables/useDeafen'
import VideoGrid from '@/components/VideoGrid.vue'
import Controls from '@/components/Controls.vue'
import Chat from '@/components/Chat.vue'
import TechLog from '@/components/TechLog.vue'
import ConnectionStatus from '@/components/ConnectionStatus.vue'
import type { SignalingMessage, JoinAckPayload, PeerJoinedPayload } from '@/types/signaling'

const route = useRoute()
const router = useRouter()
const store = useRoomStore()
const logStore = useLogStore()
const { localStream, participants, participantId } = storeToRefs(store)

const roomId = route.params.id as string
store.setRoom(roomId)

const isLoading = ref(true)
const error = ref<string | null>(null)

// Create composables
const signaling = useSignaling(roomId)
const devices = useDevices()
const webrtc = useWebRTC(roomId, signaling)
const chat = useChat(webrtc)
const audioAnalyzer = useAudioAnalyzer(localStream)
const speakerDetection = useSpeakerDetection(participants)
const deafen = useDeafen(participants)

// Define message handler (now webrtc is available)
function handleSignalingMessage(msg: SignalingMessage) {
  logStore.info('roomview', `Received ${msg.type}`, { 
    from: msg.from?.slice(0, 8), 
    to: msg.to?.slice(0, 8),
    payload: msg.payload 
  })
  switch (msg.type) {
    case 'join-ack': {
      // Server mode: acknowledge join with existing peers
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
    case 'peer-joined': {
      // P2P mode or server mode: new peer discovered
      isLoading.value = false
      const payload = msg.payload as PeerJoinedPayload
      store.addParticipant(payload.participantId)
      store.setInitiatorId(payload.initiatorId)
      
      // Only initiate if WE are the initiator for this peer
      if (payload.initiatorId === store.participantId) {
      logStore.info('roomview', `We are initiator, connecting to new peer`, { participantId: payload.participantId })
      webrtc.initiateConnection(payload.participantId)
      } else {
        logStore.info('roomview', `Waiting for offer from initiator`, { initiatorId: payload.initiatorId })
      }
      break
    }
    case 'offer': {
      logStore.info('roomview', `Received offer from`, { from: msg.from })
      webrtc.handleOffer(msg.from!, msg.payload as RTCSessionDescriptionInit).catch(err => {
        logStore.error('roomview', 'handleOffer error', err)
      })
      break
    }
    case 'answer': {
      logStore.info('roomview', `Received answer from`, { from: msg.from })
      webrtc.handleAnswer(msg.from!, msg.payload as RTCSessionDescriptionInit).catch(err => {
        logStore.error('roomview', 'handleAnswer error', err)
      })
      break
    }
    case 'ice-candidate': {
      webrtc.handleIceCandidate(msg.from!, msg.payload as RTCIceCandidateInit)
      break
    }
    case 'peer-left': {
      const payload = msg.payload as { participantId: string }
      console.log(`[RoomView] Peer left: ${payload.participantId}`)
      store.removeParticipant(payload.participantId)
      webrtc.closePeerConnection(payload.participantId)
      break
    }
    case 'error':
      error.value = (msg.payload as { message: string }).message
      break
  }
}

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
  <div class="h-screen flex flex-col bg-gray-900 overflow-hidden">
    <!-- Header -->
    <header class="flex-none p-4 border-b border-gray-800">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Vibrissae</h1>
        <ConnectionStatus 
          :signaling="signaling.connected.value"
          :signalingOffline="signaling.signalingOffline.value"
          :reconnectExhausted="signaling.reconnectExhausted.value"
          :participants="store.participants"
        />
      </div>
    </header>
    
    <!-- Main content -->
    <main class="flex-1 flex min-h-0 overflow-hidden">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex items-center justify-center h-full w-full">
        <div class="text-center">
          <div class="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mb-4 mx-auto"></div>
          <p class="text-gray-400">Connecting...</p>
        </div>
      </div>
      
      <!-- Error state -->
      <div v-else-if="error" class="flex items-center justify-center h-full w-full">
        <div class="text-center">
          <p class="text-red-400 mb-4">{{ error }}</p>
          <button @click="leave" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">
            Go Home
          </button>
        </div>
      </div>
      
      <!-- Call view with 80/20 split -->
      <template v-else>
        <!-- Left: VideoGrid (80%) -->
        <div class="flex-[8] relative min-w-0 overflow-hidden">
          <VideoGrid
            :localStream="localStream"
            :participants="participants"
            :localParticipantId="participantId"
            :activeSpeaker="speakerDetection.activeSpeaker.value"
          />
          
          <!-- Participant warning -->
          <div 
            v-if="store.showWarning" 
            class="absolute top-4 left-1/2 -translate-x-1/2 bg-yellow-900/50 text-yellow-200 px-4 py-2 rounded-lg text-sm"
          >
            High participant count may affect call quality
          </div>
        </div>
        
        <!-- Right: TechLog + Chat (20%) -->
        <div class="flex-[2] min-w-[280px] max-w-[400px] flex flex-col gap-2 p-2 border-l border-gray-800 overflow-hidden">
          <div class="flex-1 min-h-0 overflow-hidden">
            <TechLog />
          </div>
          <div class="flex-1 min-h-0 overflow-hidden">
            <Chat
              :messages="chat.messages.value"
              :localParticipantId="participantId"
              @send="chat.send"
            />
          </div>
        </div>
      </template>
    </main>
    
    <!-- Controls -->
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
  </div>
</template>
