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
        :reconnectExhausted="signaling.reconnectExhausted.value"
        :participants="store.participants"
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
