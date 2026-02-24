<script setup lang="ts">
import { computed } from 'vue'
import type { Participant } from '@/types/webrtc'
import VideoTile from './VideoTile.vue'

const props = defineProps<{
  localStream: MediaStream | null
  participants: Map<string, Participant>
  localParticipantId: string | null
  activeSpeaker: string | null
}>()

const participantList = computed(() => Array.from(props.participants.values()))

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
</script>

<template>
  <div class="h-full p-4">
    <div :class="['grid gap-4 h-full auto-rows-fr', gridClass]">
      <!-- Local video -->
      <VideoTile
        :stream="localStream"
        :isLocal="true"
        :label="'You'"
        :isSpeaking="localParticipantId === activeSpeaker"
      />
      
      <!-- Remote videos -->
      <VideoTile
        v-for="p in participantList"
        :key="p.id"
        :stream="p.stream"
        :isLocal="false"
        :label="p.id?.slice(0, 8) || 'Unknown'"
        :isSpeaking="p.id === activeSpeaker"
      />
    </div>
  </div>
</template>
