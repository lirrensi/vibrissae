import { ref, computed, onUnmounted } from 'vue'
import { useRoomStore } from '@/stores/room'
import type { useSignaling } from './useSignaling'

// Timeout for WebRTC operations (ms)
const WEBRTC_TIMEOUT = 15000
const ICE_RESTART_BASE_DELAY = 1000
const ICE_RESTART_MAX_DELAY = 30000
const ICE_RESTART_MAX_ATTEMPTS = 5

// Wrap a promise with a timeout
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMsg)), ms)
    )
  ])
}

// ICE restart state per peer
interface IceRestartState {
  attempts: number
  lastAttempt: number
  backoffDelay: number
}

export function useWebRTC(
  roomId: string, 
  signaling: ReturnType<typeof useSignaling>
) {
  const store = useRoomStore()
  const peerConnections = ref<Map<string, RTCPeerConnection>>(new Map())
  const dataChannels = ref<Map<string, RTCDataChannel>>(new Map())
  const isMuted = ref(false)
  const isVideoOff = ref(false)
  const iceRestartStates = ref<Map<string, IceRestartState>>(new Map())
  
  // ICE servers configuration
  const rtcConfig = computed<RTCConfiguration>(() => {
    const config: RTCConfiguration = { iceServers: [] }
    const appConfig = window.__CONFIG__
    
    if (!appConfig) return config
    
    // External TURN servers (priority)
    if (appConfig.turnServers) {
      config.iceServers!.push(...appConfig.turnServers.map(t => ({
        urls: t.urls,
        username: t.username,
        credential: t.credential
      })))
    }
    
    // Built-in TURN
    if (appConfig.turn?.enabled && appConfig.turnCredentials) {
      config.iceServers!.push({
        urls: `turn:${appConfig.baseUrl.replace(/^https?:\/\//, '')}:${appConfig.turn.port}`,
        username: appConfig.turnCredentials.username,
        credential: appConfig.turnCredentials.password
      })
    }
    
    // STUN servers (fallback)
    if (appConfig.stunServers) {
      config.iceServers!.push(
        ...appConfig.stunServers.map(url => ({ urls: url }))
      )
    }
    
    return config
  })
  
  async function startLocalStream(videoDeviceId?: string, audioDeviceId?: string) {
    try {
      const constraints: MediaStreamConstraints = {
        video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      store.setLocalStream(stream)
      return stream
    } catch (err) {
      console.error('Failed to get media stream:', err)
      throw err
    }
  }
  
  function stopLocalStream() {
    if (store.localStream) {
      store.localStream.getTracks().forEach(t => t.stop())
    }
    store.setLocalStream(null)
  }
  
  function createPeerConnection(participantId: string, isInitiator: boolean): RTCPeerConnection {
    const pc = new RTCPeerConnection(rtcConfig.value)
    
    // Add local tracks
    if (store.localStream) {
      store.localStream.getTracks().forEach(track => {
        pc.addTrack(track, store.localStream!)
      })
    }
    
    // Handle remote stream
    pc.ontrack = (event) => {
      const stream = event.streams[0]
      if (!stream) return
      
      store.updateParticipantStream(participantId, stream)
      
      // Check audio/video enabled
      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]
      const p = store.participants.get(participantId)
      if (p) {
        p.videoEnabled = videoTrack?.enabled ?? false
        p.audioEnabled = audioTrack?.enabled ?? false
      }
    }
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.send('ice-candidate', participantId, event.candidate.toJSON())
      }
    }
    
    // Track ICE state in store
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      store.updateParticipantIceState(participantId, state)
      
      if (['disconnected', 'failed'].includes(state)) {
        scheduleIceRestart(participantId)
      }
    }
    
    // Create data channel (initiator)
    if (isInitiator) {
      const channel = pc.createDataChannel('chat')
      setupDataChannel(participantId, channel)
    }
    
    // Receive data channel (non-initiator)
    pc.ondatachannel = (event) => {
      if (event.channel.label === 'chat') {
        setupDataChannel(participantId, event.channel)
      }
    }
    
    peerConnections.value.set(participantId, pc)
    return pc
  }
  
  function setupDataChannel(participantId: string, channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log(`Chat channel open with ${participantId}`)
    }
    channel.onmessage = (event) => {
      // Emit event for chat component
      window.dispatchEvent(new CustomEvent('chat-message', {
        detail: { from: participantId, ...JSON.parse(event.data) }
      }))
    }
    dataChannels.value.set(participantId, channel)
  }
  
  async function handleOffer(participantId: string, offer: RTCSessionDescriptionInit) {
    let pc = peerConnections.value.get(participantId)
    if (!pc) {
      pc = createPeerConnection(participantId, false)
    }
    
    // Race condition guard: don't overwrite existing remote description
    if (pc.remoteDescription) {
      console.warn(`Ignoring offer from ${participantId} - remote description already set`)
      return
    }
    
    try {
      await withTimeout(
        pc.setRemoteDescription(new RTCSessionDescription(offer)),
        WEBRTC_TIMEOUT,
        'Timeout setting remote description'
      )
      const answer = await withTimeout(
        pc.createAnswer(),
        WEBRTC_TIMEOUT,
        'Timeout creating answer'
      )
      await withTimeout(
        pc.setLocalDescription(answer),
        WEBRTC_TIMEOUT,
        'Timeout setting local description'
      )
      signaling.send('answer', participantId, { sdp: answer.sdp, type: answer.type })
      signaling.setP2PEstablished(true)
    } catch (err) {
      console.error('handleOffer failed:', err)
      store.updateParticipantIceState(participantId, 'failed')
    }
  }
  
  async function handleAnswer(participantId: string, answer: RTCSessionDescriptionInit) {
    const pc = peerConnections.value.get(participantId)
    if (!pc) return
    
    try {
      await withTimeout(
        pc.setRemoteDescription(new RTCSessionDescription(answer)),
        WEBRTC_TIMEOUT,
        'Timeout setting remote description from answer'
      )
      signaling.setP2PEstablished(true)
    } catch (err) {
      console.error('handleAnswer failed:', err)
    }
  }
  
  function handleIceCandidate(participantId: string, candidate: RTCIceCandidateInit) {
    const pc = peerConnections.value.get(participantId)
    if (pc) {
      pc.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }
  
  async function initiateConnection(participantId: string) {
    const pc = createPeerConnection(participantId, true)
    try {
      const offer = await withTimeout(
        pc.createOffer(),
        WEBRTC_TIMEOUT,
        'Timeout creating offer'
      )
      await withTimeout(
        pc.setLocalDescription(offer),
        WEBRTC_TIMEOUT,
        'Timeout setting local description'
      )
      signaling.send('offer', participantId, { sdp: offer.sdp, type: offer.type })
    } catch (err) {
      console.error('initiateConnection failed:', err)
      store.updateParticipantIceState(participantId, 'failed')
    }
  }
  
  async function restartIce(participantId: string) {
    const pc = peerConnections.value.get(participantId)
    if (!pc) return
    
    try {
      const offer = await withTimeout(
        pc.createOffer({ iceRestart: true }),
        WEBRTC_TIMEOUT,
        'Timeout creating ICE restart offer'
      )
      await withTimeout(
        pc.setLocalDescription(offer),
        WEBRTC_TIMEOUT,
        'Timeout setting local description for ICE restart'
      )
      signaling.send('offer', participantId, { sdp: offer.sdp, type: offer.type })
    } catch (err) {
      console.error('ICE restart failed:', err)
    }
  }
  
  // Schedule ICE restart with exponential backoff and retry limit
  function scheduleIceRestart(participantId: string) {
    const pc = peerConnections.value.get(participantId)
    if (!pc) return
    
    // Don't restart if already connected
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      return
    }
    
    let state = iceRestartStates.value.get(participantId)
    if (!state) {
      state = { attempts: 0, lastAttempt: 0, backoffDelay: ICE_RESTART_BASE_DELAY }
      iceRestartStates.value.set(participantId, state)
    }
    
    // Check max attempts
    if (state.attempts >= ICE_RESTART_MAX_ATTEMPTS) {
      console.warn(`ICE restart max attempts reached for ${participantId}`)
      store.updateParticipantIceState(participantId, 'failed')
      return
    }
    
    // Check cooldown
    const now = Date.now()
    const timeSinceLast = now - state.lastAttempt
    if (timeSinceLast < state.backoffDelay) {
      return
    }
    
    // Schedule restart
    state.attempts++
    state.lastAttempt = now
    state.backoffDelay = Math.min(state.backoffDelay * 2, ICE_RESTART_MAX_DELAY)
    
    console.log(`Scheduling ICE restart for ${participantId} (attempt ${state.attempts})`)
    
    // Wait for current ICE gathering to settle, then restart
    setTimeout(() => {
      const currentPc = peerConnections.value.get(participantId)
      if (currentPc && ['disconnected', 'failed'].includes(currentPc.iceConnectionState)) {
        restartIce(participantId)
      }
    }, 500)
  }
  
  function toggleVideo() {
    isVideoOff.value = !isVideoOff.value
    store.localStream?.getVideoTracks().forEach(t => {
      t.enabled = !isVideoOff.value
    })
  }
  
  function toggleAudio() {
    isMuted.value = !isMuted.value
    store.localStream?.getAudioTracks().forEach(t => {
      t.enabled = !isMuted.value
    })
  }
  
  async function switchVideoDevice(deviceId: string) {
    // Need to renegotiate after switching device
    const oldTrack = store.localStream?.getVideoTracks()[0]
    
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }
    })
    const newTrack = newStream.getVideoTracks()[0]
    if (!newTrack) return
    
    // Replace track in all peer connections
    peerConnections.value.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video')
      if (sender) {
        sender.replaceTrack(newTrack)
      }
    })
    
    // Update local stream
    if (store.localStream && oldTrack) {
      store.localStream.removeTrack(oldTrack)
      store.localStream.addTrack(newTrack)
      oldTrack.stop()
    }
  }
  
  async function switchAudioDevice(deviceId: string) {
    const oldTrack = store.localStream?.getAudioTracks()[0]
    
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } }
    })
    const newTrack = newStream.getAudioTracks()[0]
    if (!newTrack) return
    
    peerConnections.value.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio')
      if (sender) {
        sender.replaceTrack(newTrack)
      }
    })
    
    if (store.localStream && oldTrack) {
      store.localStream.removeTrack(oldTrack)
      store.localStream.addTrack(newTrack)
      oldTrack.stop()
    }
  }
  
  function closePeerConnection(participantId: string) {
    const pc = peerConnections.value.get(participantId)
    pc?.close()
    peerConnections.value.delete(participantId)
    dataChannels.value.delete(participantId)
    iceRestartStates.value.delete(participantId)
    store.removeParticipant(participantId)
  }
  
  function disconnect() {
    peerConnections.value.forEach((pc) => {
      pc.close()
    })
    peerConnections.value.clear()
    dataChannels.value.clear()
    stopLocalStream()
    signaling.setP2PEstablished(false)
  }
  
  onUnmounted(disconnect)
  
  return {
    peerConnections,
    dataChannels,
    isMuted,
    isVideoOff,
    rtcConfig,
    startLocalStream,
    stopLocalStream,
    createPeerConnection,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    initiateConnection,
    restartIce,
    toggleVideo,
    toggleAudio,
    switchVideoDevice,
    switchAudioDevice,
    closePeerConnection,
    disconnect
  }
}
