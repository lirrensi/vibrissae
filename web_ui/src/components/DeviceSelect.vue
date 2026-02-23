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
