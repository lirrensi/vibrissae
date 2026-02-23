import { ref, onUnmounted, watch, type Ref } from 'vue'

export function useAudioAnalyzer(stream: Ref<MediaStream | null | undefined>) {
  const volume = ref(0)
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let animationFrame: number | null = null
  let dataArray: Uint8Array<ArrayBuffer> | null = null

  function startAnalyzing() {
    if (!stream.value) return
    
    const audioTrack = stream.value.getAudioTracks()[0]
    if (!audioTrack) return

    try {
      audioContext = new AudioContext()
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      
      source = audioContext.createMediaStreamSource(stream.value)
      source.connect(analyser)
      
      dataArray = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
      updateVolume()
    } catch (err) {
      console.error('Failed to start audio analyzer:', err)
    }
  }

  function updateVolume() {
    if (!analyser || !dataArray) return
    
    analyser.getByteFrequencyData(dataArray)
    
    // Calculate RMS-like volume from frequency data
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i]! * dataArray[i]!
    }
    const rms = Math.sqrt(sum / dataArray.length)
    volume.value = Math.min(1, rms / 128) // Normalize to 0-1
    
    animationFrame = requestAnimationFrame(updateVolume)
  }

  function stopAnalyzing() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
    if (source) {
      source.disconnect()
      source = null
    }
    if (audioContext) {
      audioContext.close()
      audioContext = null
    }
    analyser = null
    dataArray = null
    volume.value = 0
  }

  watch(stream, (newStream) => {
    stopAnalyzing()
    if (newStream) {
      startAnalyzing()
    }
  }, { immediate: true })

  onUnmounted(stopAnalyzing)

  return {
    volume
  }
}
