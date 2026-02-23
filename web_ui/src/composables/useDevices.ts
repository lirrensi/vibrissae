import { ref, onMounted } from 'vue'

export function useDevices() {
  const cameras = ref<MediaDeviceInfo[]>([])
  const microphones = ref<MediaDeviceInfo[]>([])
  const selectedCamera = ref<string | null>(null)
  const selectedMicrophone = ref<string | null>(null)
  
  async function enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      cameras.value = devices.filter(d => d.kind === 'videoinput')
      microphones.value = devices.filter(d => d.kind === 'audioinput')
    } catch (err) {
      console.error('Failed to enumerate devices:', err)
    }
  }
  
  async function getInitialDevices() {
    await enumerateDevices()
    if (cameras.value.length > 0 && !selectedCamera.value) {
      selectedCamera.value = cameras.value[0]?.deviceId ?? null
    }
    if (microphones.value.length > 0 && !selectedMicrophone.value) {
      selectedMicrophone.value = microphones.value[0]?.deviceId ?? null
    }
  }
  
  function setCamera(deviceId: string) {
    selectedCamera.value = deviceId
  }
  
  function setMicrophone(deviceId: string) {
    selectedMicrophone.value = deviceId
  }
  
  onMounted(getInitialDevices)
  
  return {
    cameras,
    microphones,
    selectedCamera,
    selectedMicrophone,
    enumerateDevices,
    getInitialDevices,
    setCamera,
    setMicrophone
  }
}
