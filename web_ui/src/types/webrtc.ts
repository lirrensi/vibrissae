export interface Participant {
  id: string
  stream?: MediaStream
  videoEnabled: boolean
  audioEnabled: boolean
  iceState?: RTCIceConnectionState
}

export interface MediaDevices {
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  selectedCamera: string | null
  selectedMicrophone: string | null
}
