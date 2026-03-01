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
const isAlone = computed(() => props.participants.size === 0)

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
  <div class="h-full p-4 relative">
    <!-- Waiting state overlay -->
    <div 
      v-if="isAlone" 
      class="absolute inset-0 flex items-center justify-center z-10"
    >
      <div class="text-center text-gray-400">
        <div class="animate-pulse mb-4">
          <svg class="w-16 h-16 mx-auto opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <p class="text-lg">Waiting for others to join...</p>
        <p class="text-sm mt-2">Share the link to invite people</p>
      </div>
    </div>
    
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
