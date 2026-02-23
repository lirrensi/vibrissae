import { ref, onUnmounted, watch, type Ref } from 'vue'
import type { Participant } from '@/types/webrtc'

export function useSpeakerDetection(participants: Ref<Map<string, Participant>>) {
  const speakers = ref<Map<string, number>>(new Map()) // participantId -> volume (0-1)
  const activeSpeaker = ref<string | null>(null)
  
  const audioContexts = new Map<string, { 
    context: AudioContext
    analyser: AnalyserNode
    source: MediaStreamAudioSourceNode
    dataArray: Uint8Array<ArrayBuffer>
  }>()
  let animationFrame: number | null = null

  function startAnalyzingParticipant(participantId: string, stream: MediaStream) {
    if (audioContexts.has(participantId)) return
    
    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) return

    try {
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
      
      audioContexts.set(participantId, {
        context: audioContext,
        analyser,
        source,
        dataArray
      })
    } catch (err) {
      console.error(`Failed to start analyzing ${participantId}:`, err)
    }
  }

  function stopAnalyzingParticipant(participantId: string) {
    const state = audioContexts.get(participantId)
    if (state) {
      state.source.disconnect()
      state.context.close()
      audioContexts.delete(participantId)
      speakers.value.delete(participantId)
    }
  }

  function updateVolumes() {
    let maxVolume = 0
    let currentSpeaker: string | null = null
    
    audioContexts.forEach((state, participantId) => {
      state.analyser.getByteFrequencyData(state.dataArray)
      
      let sum = 0
      for (let i = 0; i < state.dataArray.length; i++) {
        sum += state.dataArray[i]! * state.dataArray[i]!
      }
      const rms = Math.sqrt(sum / state.dataArray.length)
      const volume = Math.min(1, rms / 128)
      
      speakers.value.set(participantId, volume)
      
      if (volume > 0.15 && volume > maxVolume) {
        maxVolume = volume
        currentSpeaker = participantId
      }
    })
    
    activeSpeaker.value = currentSpeaker
    animationFrame = requestAnimationFrame(updateVolumes)
  }

  function startMonitoring() {
    if (animationFrame) return
    updateVolumes()
  }

  function stopMonitoring() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
    audioContexts.forEach((state) => {
      state.source.disconnect()
      state.context.close()
    })
    audioContexts.clear()
    speakers.value.clear()
    activeSpeaker.value = null
  }

  // Watch for new/removed participants
  watch(participants, (newParticipants) => {
    // Start analyzing new participants
    newParticipants.forEach((participant, id) => {
      if (participant.stream && !audioContexts.has(id)) {
        startAnalyzingParticipant(id, participant.stream)
      }
    })
    
    // Stop analyzing removed participants
    audioContexts.forEach((_, id) => {
      if (!newParticipants.has(id)) {
        stopAnalyzingParticipant(id)
      }
    })
    
    // Start monitoring if not already
    if (audioContexts.size > 0 && !animationFrame) {
      startMonitoring()
    }
  }, { deep: true, immediate: true })

  onUnmounted(stopMonitoring)

  return {
    speakers,
    activeSpeaker
  }
}
