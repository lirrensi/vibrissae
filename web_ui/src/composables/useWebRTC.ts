import { ref, computed, onUnmounted } from 'vue'
import { useRoomStore } from '@/stores/room'
import { useLogStore } from '@/stores/log'
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
  const logStore = useLogStore()
  const peerConnections = ref<Map<string, RTCPeerConnection>>(new Map())
  const dataChannels = ref<Map<string, RTCDataChannel>>(new Map())
  const isMuted = ref(false)
  const isVideoOff = ref(false)
  const hasAudio = ref(false)
  const hasVideo = ref(false)
  const audioError = ref<string | null>(null)
  const videoError = ref<string | null>(null)
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
      // Extract just the hostname (remove any port)
      const baseUrl = appConfig.baseUrl || window.location.host
      const hostname = baseUrl.replace(/^https?:\/\//, '').split(':')[0]
      config.iceServers!.push({
        urls: `turn:${hostname}:${appConfig.turn.port}`,
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
  
  async function tryGetAudio(deviceId?: string): Promise<boolean> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {})
        },
        video: false
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      
      // If we already have video, add audio track to existing stream
      if (store.localStream) {
        const oldAudioTrack = store.localStream.getAudioTracks()[0]
        if (oldAudioTrack) {
          store.localStream.removeTrack(oldAudioTrack)
          oldAudioTrack.stop()
        }
        store.localStream.addTrack(stream.getAudioTracks()[0]!)
      } else {
        store.setLocalStream(stream)
      }
      
      // Replace audio track in peer connections
      const newAudioTrack = stream.getAudioTracks()[0]!
      peerConnections.value.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio')
        if (sender) {
          sender.replaceTrack(newAudioTrack)
        } else {
          pc.addTrack(newAudioTrack, store.localStream!)
        }
      })
      
      hasAudio.value = true
      audioError.value = null
      return true
    } catch (err) {
      console.error('Failed to get audio:', err)
      audioError.value = err instanceof Error ? err.message : 'Unknown audio error'
      hasAudio.value = false
      return false
    }
  }

  async function tryGetVideo(deviceId?: string): Promise<boolean> {
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {})
        },
        audio: false
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      
      // If we already have audio, add video track to existing stream
      if (store.localStream) {
        const oldVideoTrack = store.localStream.getVideoTracks()[0]
        if (oldVideoTrack) {
          store.localStream.removeTrack(oldVideoTrack)
          oldVideoTrack.stop()
        }
        store.localStream.addTrack(stream.getVideoTracks()[0]!)
      } else {
        store.setLocalStream(stream)
      }
      
      // Replace video track in peer connections
      const newVideoTrack = stream.getVideoTracks()[0]!
      peerConnections.value.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          sender.replaceTrack(newVideoTrack)
        } else {
          pc.addTrack(newVideoTrack, store.localStream!)
        }
      })
      
      hasVideo.value = true
      isVideoOff.value = false
      videoError.value = null
      return true
    } catch (err) {
      console.error('Failed to get video:', err)
      videoError.value = err instanceof Error ? err.message : 'Unknown video error'
      hasVideo.value = false
      return false
    }
  }
  
  function stopLocalStream() {
    if (store.localStream) {
      store.localStream.getTracks().forEach(t => t.stop())
    }
    store.setLocalStream(null)
  }
  
  function createPeerConnection(participantId: string, isInitiator: boolean): RTCPeerConnection {
    logStore.info('webrtc', `Creating peer connection`, { 
      participantId: participantId.slice(0, 8), 
      isInitiator 
    })
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
      console.log(`[WebRTC] ontrack fired for ${participantId}, stream:`, stream?.id, 'tracks:', stream?.getTracks().length)
      if (!stream) return
      
      logStore.info('webrtc', `Remote stream received`, { 
        participantId: participantId.slice(0, 8),
        streamId: stream.id,
        tracks: stream.getTracks().map(t => t.kind)
      })
      
      store.updateParticipantStream(participantId, stream)
      
      // Check audio/video enabled
      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]
      const p = store.participants.get(participantId)
      console.log(`[WebRTC] Participant ${participantId} in store:`, !!p, 'videoTrack:', !!videoTrack, 'audioTrack:', !!audioTrack)
      if (p) {
        p.videoEnabled = videoTrack?.enabled ?? false
        p.audioEnabled = audioTrack?.enabled ?? false
      }
    }
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate
        const candidateType = candidate.type || 'unknown'
        
        // Log relay candidates specially
        if (candidateType === 'relay') {
          logStore.warn('ice', `RELAY candidate (TURN)`, { 
            participantId: participantId.slice(0, 8),
            candidate: candidate.candidate
          })
        } else {
          logStore.info('ice', `ICE candidate`, { 
            participantId: participantId.slice(0, 8),
            type: candidateType
          })
        }
        
        signaling.send('ice-candidate', participantId, candidate.toJSON())
      }
    }
    
    // Track ICE state in store
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      store.updateParticipantIceState(participantId, state)
      
      // Log ICE state changes
      const level = ['failed', 'disconnected'].includes(state) ? 'error' : 
                    ['connected', 'completed'].includes(state) ? 'info' : 'warn'
      logStore.log('ice', level as 'info' | 'warn' | 'error', `ICE state: ${state}`, { 
        participantId: participantId.slice(0, 8) 
      })
      
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
      logStore.info('datachannel', `DataChannel open`, { participantId: participantId.slice(0, 8) })
    }
    channel.onclose = () => {
      logStore.warn('datachannel', `DataChannel closed`, { participantId: participantId.slice(0, 8) })
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
    console.log(`[WebRTC] handleOffer called for: ${participantId}`)
    let pc = peerConnections.value.get(participantId)
    if (!pc) {
      console.log(`[WebRTC] Creating new peer connection for: ${participantId}`)
      pc = createPeerConnection(participantId, false)
    }
    
    // Race condition guard: don't overwrite existing remote description
    if (pc.remoteDescription) {
      console.warn(`[WebRTC] Ignoring offer from ${participantId} - remote description already set`)
      return
    }
    
    try {
      console.log(`[WebRTC] Setting remote description for: ${participantId}`)
      await withTimeout(
        pc.setRemoteDescription(new RTCSessionDescription(offer)),
        WEBRTC_TIMEOUT,
        'Timeout setting remote description'
      )
      console.log(`[WebRTC] Creating answer for: ${participantId}`)
      const answer = await withTimeout(
        pc.createAnswer(),
        WEBRTC_TIMEOUT,
        'Timeout creating answer'
      )
      console.log(`[WebRTC] Setting local description for: ${participantId}`)
      await withTimeout(
        pc.setLocalDescription(answer),
        WEBRTC_TIMEOUT,
        'Timeout setting local description'
      )
      console.log(`[WebRTC] Sending answer to: ${participantId}`)
      signaling.send('answer', participantId, { sdp: answer.sdp, type: answer.type })
      signaling.setP2PEstablished(true)
      console.log(`[WebRTC] Answer sent to: ${participantId}`)
    } catch (err) {
      console.error('[WebRTC] handleOffer failed:', err)
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
    console.log(`[WebRTC] Initiating connection to: ${participantId}`)
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
      console.log(`[WebRTC] Sending offer to: ${participantId}`)
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
    if (!hasVideo.value) {
      // No video yet, try to get it
      return
    }
    isVideoOff.value = !isVideoOff.value
    store.localStream?.getVideoTracks().forEach(t => {
      t.enabled = !isVideoOff.value
    })
  }

  async function enableVideo(): Promise<boolean> {
    if (hasVideo.value) {
      isVideoOff.value = false
      store.localStream?.getVideoTracks().forEach(t => {
        t.enabled = true
      })
      return true
    }
    return await tryGetVideo()
  }
  
  function toggleAudio() {
    if (!hasAudio.value) {
      // No audio yet, try to get it
      return
    }
    isMuted.value = !isMuted.value
    store.localStream?.getAudioTracks().forEach(t => {
      t.enabled = !isMuted.value
    })
  }

  async function enableAudio(): Promise<boolean> {
    if (hasAudio.value) {
      isMuted.value = false
      store.localStream?.getAudioTracks().forEach(t => {
        t.enabled = true
      })
      return true
    }
    return await tryGetAudio()
  }
  
  async function switchVideoDevice(deviceId: string): Promise<boolean> {
    const success = await tryGetVideo(deviceId)
    return success
  }
  
  async function switchAudioDevice(deviceId: string): Promise<boolean> {
    const success = await tryGetAudio(deviceId)
    return success
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
    hasAudio,
    hasVideo,
    audioError,
    videoError,
    rtcConfig,
    tryGetAudio,
    tryGetVideo,
    createPeerConnection,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    initiateConnection,
    restartIce,
    toggleVideo,
    toggleAudio,
    enableVideo,
    enableAudio,
    switchVideoDevice,
    switchAudioDevice,
    closePeerConnection,
    disconnect
  }
}
