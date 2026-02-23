import { ref, watch, type Ref } from 'vue'
import type { Participant } from '@/types/webrtc'

export function useDeafen(participants: Ref<Map<string, Participant>>) {
  const isDeafened = ref(false)

  function toggleDeafen() {
    isDeafened.value = !isDeafened.value
    applyDeafenState()
  }

  function applyDeafenState() {
    participants.value.forEach((participant) => {
      if (participant.stream) {
        const audioTracks = participant.stream.getAudioTracks()
        audioTracks.forEach(track => {
          track.enabled = !isDeafened.value
        })
      }
    })
  }

  // Apply deafen state when new participants join
  watch(participants, () => {
    if (isDeafened.value) {
      applyDeafenState()
    }
  }, { deep: true })

  return {
    isDeafened,
    toggleDeafen
  }
}
