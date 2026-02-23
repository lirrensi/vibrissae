import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Participant } from '@/types/webrtc'

export const useRoomStore = defineStore('room', () => {
  const roomId = ref<string | null>(null)
  const participantId = ref<string | null>(null)
  const participants = ref<Map<string, Participant>>(new Map())
  const localStream = ref<MediaStream | null>(null)
  const localIceState = ref<RTCIceConnectionState | null>(null)
  
  const participantCount = computed(() => participants.value.size + 1)
  const showWarning = computed(() => participantCount.value >= 4)
  
  // Connection health: any peer in failed state?
  const hasConnectionFailure = computed(() => {
    for (const p of participants.value.values()) {
      if (p.iceState === 'failed') return true
    }
    return localIceState.value === 'failed'
  })
  
  function setRoom(id: string) {
    roomId.value = id
  }
  
  function setParticipantId(id: string) {
    participantId.value = id
  }
  
  function addParticipant(id: string) {
    participants.value.set(id, {
      id,
      stream: undefined,
      videoEnabled: false,
      audioEnabled: false
    })
  }
  
  function removeParticipant(id: string) {
    participants.value.delete(id)
  }
  
  function updateParticipantStream(id: string, stream: MediaStream) {
    const p = participants.value.get(id)
    if (p) {
      p.stream = stream
    }
  }
  
  function updateParticipantIceState(id: string, state: RTCIceConnectionState) {
    const p = participants.value.get(id)
    if (p) {
      p.iceState = state
    }
  }
  
  function setLocalIceState(state: RTCIceConnectionState) {
    localIceState.value = state
  }
  
  function setLocalStream(stream: MediaStream | null) {
    localStream.value = stream
  }
  
  function clear() {
    roomId.value = null
    participantId.value = null
    participants.value.clear()
    localStream.value = null
    localIceState.value = null
  }
  
  return {
    roomId,
    participantId,
    participants,
    localStream,
    localIceState,
    participantCount,
    showWarning,
    hasConnectionFailure,
    setRoom,
    setParticipantId,
    addParticipant,
    removeParticipant,
    updateParticipantStream,
    updateParticipantIceState,
    setLocalIceState,
    setLocalStream,
    clear
  }
})
