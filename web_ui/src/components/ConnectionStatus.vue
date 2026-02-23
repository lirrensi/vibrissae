<script setup lang="ts">
import { computed } from 'vue'
import type { Participant } from '@/types/webrtc'

const props = defineProps<{
  signaling: boolean
  signalingOffline: boolean
  reconnectExhausted: boolean
  participants: Map<string, Participant>
}>()

const iceStateSummary = computed(() => {
  const states: string[] = []
  props.participants.forEach(p => {
    if (p.iceState && !states.includes(p.iceState)) {
      states.push(p.iceState)
    }
  })
  return states
})

const hasIceFailure = computed(() => 
  iceStateSummary.value.includes('failed')
)
</script>

<template>
  <div class="flex items-center gap-2 text-sm flex-wrap">
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
    
    <!-- Reconnect exhausted -->
    <div
      v-if="reconnectExhausted"
      class="bg-red-900/50 text-red-200 px-2 py-0.5 rounded text-xs"
    >
      Connection failed - refresh to retry
    </div>
    
    <!-- ICE failure indicator -->
    <div
      v-if="hasIceFailure"
      class="bg-red-900/50 text-red-200 px-2 py-0.5 rounded text-xs"
    >
      Peer connection failed
    </div>
  </div>
</template>
