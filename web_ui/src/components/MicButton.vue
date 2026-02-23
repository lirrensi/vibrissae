<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

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

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.mic-button-container')) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="relative mic-button-container">
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
