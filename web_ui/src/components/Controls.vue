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
        <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
      </svg>
    </button>
  </div>
</template>
