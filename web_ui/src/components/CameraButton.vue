<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

defineProps<{
  isVideoOff: boolean
  cameras: MediaDeviceInfo[]
  selectedCamera: string | null
  hasVideo: boolean
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

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.camera-button-container')) {
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
  <div class="relative camera-button-container">
    <!-- Main button -->
    <div class="flex items-center bg-gray-700 rounded-full overflow-hidden">
      <!-- Camera toggle button -->
      <button
        @click="emit('toggle')"
        :class="[
          'p-3 transition-colors',
          !hasVideo ? 'bg-gray-600 hover:bg-gray-500' :
          isVideoOff ? 'bg-red-600 hover:bg-red-700' : 'hover:bg-gray-600'
        ]"
        :title="!hasVideo ? 'Click to enable camera' : isVideoOff ? 'Turn on camera' : 'Turn off camera'"
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
