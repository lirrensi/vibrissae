import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { MessageTransport, TransportMessage } from '@/types/transport'
import type { SignalingMessage } from '@/types/signaling'
import { useLogStore } from '@/stores/log'
import { useRoomStore } from '@/stores/room'

interface P2PSignalingConfig {
  resendIntervalMs: number
  resendMaxAttempts: number
}

export interface SignalingTransport {
  connected: Ref<boolean>
  participantId: Ref<string | null>
  
  connect(): void
  disconnect(): void
  send(message: SignalingMessage): void
  onMessage(handler: (msg: SignalingMessage) => void): void
}

export function createP2PSignalingProtocol(
  transport: MessageTransport,
  config: P2PSignalingConfig
): SignalingTransport {
  const logStore = useLogStore()
  const roomStore = useRoomStore()
  
  const connected = ref(false)
  const participantId = ref<string | null>(null)
  const messageHandler = ref<((msg: SignalingMessage) => void) | null>(null)
  const pendingMessages = new Map<string, { msg: SignalingMessage; attempts: number }>()
  
  // Generate participant ID
  participantId.value = crypto.randomUUID()
  roomStore.setParticipantId(participantId.value)
  
  let resendTimer: ReturnType<typeof setInterval> | null = null
  
  // Map transport peer ID to our participant ID
  const peerIdMap = new Map<string, string>()
  
  function startResendTimer() {
    if (resendTimer) return
    resendTimer = setInterval(() => {
      pendingMessages.forEach((pending, key) => {
        pending.attempts++
        if (pending.attempts >= config.resendMaxAttempts) {
          pendingMessages.delete(key)
          return
        }
        // Resend via transport
        const transportMsg: TransportMessage = {
          type: pending.msg.type,
          payload: pending.msg.payload,
          from: participantId.value!,
          to: pending.msg.to
        }
        transport.sendTo(pending.msg.to!, transportMsg)
      })
    }, config.resendIntervalMs)
  }
  
  function handleHello(transportPeerId: string, msg: TransportMessage) {
    const payload = msg.payload as { participantId: string }
    const theirParticipantId = payload.participantId
    
    // Ignore hello from self
    if (theirParticipantId === participantId.value) {
      return
    }
    
    logStore.info('signaling', `Received hello from peer`, {
      transportPeer: transportPeerId.slice(0, 8),
      participantId: theirParticipantId.slice(0, 8)
    })
    
    // Map transport peer to participant
    peerIdMap.set(transportPeerId, theirParticipantId)
    
    // Determine initiator: smaller UUID initiates
    const myId = participantId.value!
    const iAmInitiator = myId < theirParticipantId
    const initiatorId = iAmInitiator ? myId : theirParticipantId
    
    logStore.info('signaling', `Initiator election`, {
      myId: myId.slice(0, 8),
      theirId: theirParticipantId.slice(0, 8),
      iAmInitiator,
      initiatorId: initiatorId.slice(0, 8)
    })
    
    // Emit peer-joined to app layer
    const joinedMsg: SignalingMessage = {
      type: 'peer-joined',
      from: theirParticipantId,
      payload: {
        participantId: theirParticipantId,
        initiatorId
      }
    }
    messageHandler.value?.(joinedMsg)
  }
  
  function handleMessage(transportMsg: TransportMessage, transportPeerId: string) {
    const msg = transportMsg as unknown as SignalingMessage
    
    // Filter self-messages
    const payloadData = msg.payload as Record<string, unknown> | undefined
    const msgParticipantId = payloadData?.participantId as string | undefined
    const isFromSelf = msgParticipantId === participantId.value || msg.from === participantId.value
    if (isFromSelf) {
      return
    }
    
    // Handle hello handshake
    if (msg.type === 'hello') {
      handleHello(transportPeerId, transportMsg)
      return
    }
    
    // Route to correct recipient based on 'to' field
    if (msg.to && msg.to !== participantId.value) {
      return
    }
    
    // Look up participant ID from transport peer
    const fromParticipantId = peerIdMap.get(transportPeerId) || msg.from
    
    const enriched: SignalingMessage = {
      ...msg,
      from: fromParticipantId
    }
    
    messageHandler.value?.(enriched)
  }
  
  function connect() {
    // Set up transport event handlers
    transport.onMessage(handleMessage)
    transport.onPeerJoin((transportPeerId) => {
      logStore.info('signaling', `Peer discovered`, { transportPeerId: transportPeerId.slice(0, 8) })
      // Send hello to exchange participant IDs
      const helloMsg: TransportMessage = {
        type: 'hello',
        payload: { participantId: participantId.value },
        from: participantId.value!
      }
      transport.broadcast(helloMsg)
    })
    transport.onPeerLeave((transportPeerId) => {
      const leftParticipantId = peerIdMap.get(transportPeerId)
      if (leftParticipantId) {
        const leaveMsg: SignalingMessage = {
          type: 'peer-left',
          from: leftParticipantId,
          payload: { participantId: leftParticipantId }
        }
        messageHandler.value?.(leaveMsg)
        peerIdMap.delete(transportPeerId)
      }
    })
    
    // Connect to transport
    transport.connect().then(() => {
      connected.value = true
      startResendTimer()
    })
  }
  
  function disconnect() {
    if (resendTimer) {
      clearInterval(resendTimer)
      resendTimer = null
    }
    transport.disconnect()
    peerIdMap.clear()
    pendingMessages.clear()
    connected.value = false
  }
  
  function send(message: SignalingMessage) {
    const enriched: SignalingMessage = {
      ...message,
      from: participantId.value!
    }
    
    logStore.info('signaling', `Sending ${message.type}`, {
      to: message.to?.slice(0, 8)
    })
    
    // Broadcast or send to specific peer
    if (message.to) {
      transport.sendTo(message.to, {
        type: message.type,
        payload: message.payload,
        from: participantId.value!,
        to: message.to
      })
    } else {
      transport.broadcast({
        type: message.type,
        payload: message.payload,
        from: participantId.value!
      })
    }
    
    // Track for resend (offers only)
    if (message.type === 'offer') {
      const key = `${message.to}-${message.type}`
      pendingMessages.set(key, { msg: enriched, attempts: 0 })
    }
  }
  
  function onMessage(handler: (msg: SignalingMessage) => void) {
    messageHandler.value = handler
  }
  
  onUnmounted(disconnect)
  
  return {
    connected,
    participantId,
    connect,
    disconnect,
    send,
    onMessage
  }
}
