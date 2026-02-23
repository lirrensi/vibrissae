<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  stream: MediaStream | null | undefined
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
