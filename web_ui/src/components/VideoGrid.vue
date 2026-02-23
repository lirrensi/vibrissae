<script setup lang="ts">
import { computed } from 'vue'
import type { Participant } from '@/types/webrtc'
import VideoTile from './VideoTile.vue'

const props = defineProps<{
  localStream: MediaStream | null
  participants: Map<string, Participant>
  localParticipantId: string | null
}>()

const participantList = computed(() => Array.from(props.participants.values()))

const gridClass = computed(() => {
  const count = participantList.value.length + 1 // +1 for local
  if (count <= 2) return 'grid-cols-1'
  if (count <= 4) return 'grid-cols-2'
  return 'grid-cols-3'
})
</script>

<template>
  <div class="h-full p-4">
    <div :class="['grid gap-4 h-full', gridClass]">
      <!-- Local video -->
      <VideoTile
        :stream="localStream"
        :isLocal="true"
        :label="'You'"
      />
      
      <!-- Remote videos -->
      <VideoTile
        v-for="p in participantList"
        :key="p.id"
        :stream="p.stream"
        :isLocal="false"
        :label="p.id?.slice(0, 8) || 'Unknown'"
      />
    </div>
  </div>
</template>
